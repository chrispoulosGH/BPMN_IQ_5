import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from 'bpmn-js-properties-panel';
import { validateTasks, getTaskNames } from '../api';
import bpmniqModdle from '../bpmniq-moddle.json';

export const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="sample-diagram" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="Process_1" isExecutable="false">
    <bpmn2:startEvent id="StartEvent_1" />
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds height="36.0" width="36.0" x="412.0" y="240.0" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`;

export interface BpmnEditorHandle {
  getXml: () => Promise<string>;
  fitViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  validateTasks: () => Promise<void>;
}

interface BpmnEditorProps {
  xml: string;
  onXmlChange?: (xml: string) => void;
  showProperties?: boolean;
  allApplicationNames?: string[];
}

const DARK_ORANGE = '#cc7000';
const DEFAULT_STROKE = 'blue';

/** Returns true for Task, UserTask, ServiceTask, SubProcess, CallActivity, etc. */
function isActivityType(type?: string): boolean {
  if (!type) return false;
  return type.includes('Task') || type.includes('SubProcess') || type.includes('CallActivity');
}

const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  ({ xml, onXmlChange, showProperties = true, allApplicationNames = [] }, ref) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const propertiesRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const xmlRef = useRef<string>(xml);
    const importingRef = useRef(false);
    const taskNamesRef = useRef<string[]>([]);
    const autocompleteRef = useRef<HTMLDivElement | null>(null);
    const appPopoverRef = useRef<HTMLDivElement | null>(null);
    const popoverDirtyRef = useRef(false);
    const renderAppOverlaysRef = useRef<(m?: any) => void>(() => {});

    // Keep the latest xml in a ref to avoid stale closures
    xmlRef.current = xml;

    useImperativeHandle(ref, () => ({
      getXml: async () => {
        const { xml: out } = await modelerRef.current.saveXML({ format: true });
        return out;
      },
      fitViewport: () => {
        modelerRef.current?.get('canvas')?.zoom('fit-viewport');
      },
      zoomIn: () => {
        const canvas = modelerRef.current?.get('canvas');
        if (canvas) canvas.zoom(canvas.zoom() * 1.2);
      },
      zoomOut: () => {
        const canvas = modelerRef.current?.get('canvas');
        if (canvas) canvas.zoom(canvas.zoom() / 1.2);
      },
      validateTasks: async () => {
        if (modelerRef.current) await validateAndColorTasks(modelerRef.current);
      },
    }));

    // Initialize the modeler once
    useEffect(() => {
      if (!canvasRef.current) return;

      const modeler = new BpmnModeler({
        container: canvasRef.current,
        propertiesPanel: showProperties ? { parent: propertiesRef.current } : undefined,
        additionalModules: showProperties
          ? [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule]
          : [],
        moddleExtensions: {
          bpmniq: bpmniqModdle,
        },
      });

      modelerRef.current = modeler;

      modeler.on('commandStack.changed', async () => {
        if (importingRef.current) return;
        try {
          const { xml: updated } = await modeler.saveXML({ format: true });
          onXmlChange?.(updated);
        } catch {
          // ignore save errors during rapid edits
        }
      });

      // Load valid task names for autocomplete
      getTaskNames().then((names) => {
        taskNamesRef.current = names;
        console.log('[BpmnEditor] Loaded', names.length, 'task names for autocomplete');
      }).catch((err) => { console.warn('[BpmnEditor] Failed to load task names:', err); });

      // ─── Application Overlay Helpers (reads/writes extensionElements) ──
      const OVERLAY_TYPE = 'task-apps';
      const COMPUTER_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

      /** Read app names from a task's extensionElements */
      function getTaskApps(bo: any): string[] {
        const exts = bo.extensionElements?.values || [];
        const container = exts.find((e: any) => e.$type === 'bpmniq:TaskApplications');
        if (!container) return [];
        return (container.applications || []).map((a: any) => a.name);
      }

      /** Write app names into a task's extensionElements (mutates businessObject) */
      function setTaskApps(bo: any, appNames: string[], m: any) {
        const moddleInst = m.get('moddle');
        // Ensure extensionElements exists
        if (!bo.extensionElements) {
          bo.extensionElements = moddleInst.create('bpmn:ExtensionElements', { values: [] });
          bo.extensionElements.$parent = bo;
        }
        // Remove existing TaskApplications
        bo.extensionElements.values = (bo.extensionElements.values || []).filter(
          (e: any) => e.$type !== 'bpmniq:TaskApplications'
        );
        // Add new one if apps exist
        if (appNames.length) {
          const apps = appNames.map((name) => {
            const app = moddleInst.create('bpmniq:Application', { name });
            return app;
          });
          const container = moddleInst.create('bpmniq:TaskApplications', { applications: apps });
          container.$parent = bo.extensionElements;
          apps.forEach((a: any) => { a.$parent = container; });
          bo.extensionElements.values.push(container);
        }
      }

      function renderAppOverlays(m: any) {
        const overlays = m.get('overlays');
        const elementRegistry = m.get('elementRegistry');
        // Remove existing app overlays
        elementRegistry.filter((el: any) => isActivityType(el.businessObject?.$type)).forEach((el: any) => {
          overlays.remove({ element: el.id, type: OVERLAY_TYPE });
        });
        // Render overlays for tasks that have apps in their extensionElements
        const tasks = elementRegistry.filter((el: any) => isActivityType(el.businessObject?.$type));
        for (const el of tasks) {
          const appNames = getTaskApps(el.businessObject);
          if (!appNames.length) continue;
          const html = document.createElement('div');
          html.className = 'task-app-overlay';
          html.style.cssText = 'display:flex;flex-direction:column;gap:1px;padding:2px 0;cursor:pointer;font-family:"IBM Plex Sans",Arial,sans-serif;';
          const validSet = new Set(allApplicationNames.map((n) => n.toLowerCase().trim()));
          for (const appName of appNames) {
            const isValid = validSet.has(appName.toLowerCase().trim());
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:3px;white-space:nowrap;';
            const icon = document.createElement('span');
            icon.innerHTML = COMPUTER_ICON;
            icon.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:${isValid ? '#1677ff' : DARK_ORANGE};flex-shrink:0;`;
            const label = document.createElement('span');
            label.textContent = appName;
            label.style.cssText = `font-size:9px;color:${isValid ? '#333' : DARK_ORANGE};line-height:1.1;overflow:hidden;text-overflow:ellipsis;max-width:120px;`;
            row.appendChild(icon);
            row.appendChild(label);
            html.appendChild(row);
          }
          html.addEventListener('click', (e) => {
            e.stopPropagation();
            showAppPopover(el, m);
          });
          overlays.add(el.id, OVERLAY_TYPE, {
            position: { bottom: -4, left: 0 },
            html,
          });
        }
      }

      function removeAppPopover() {
        if (appPopoverRef.current) {
          appPopoverRef.current.remove();
          appPopoverRef.current = null;
        }
      }

      function showAppPopover(element: any, m: any) {
        removeAppPopover();
        const canvas = m.get('canvas');
        const viewbox = canvas.viewbox();
        const containerRect = canvas.getContainer().getBoundingClientRect();
        const ex = (element.x + element.width / 2 - viewbox.x) * viewbox.scale + containerRect.left;
        const ey = (element.y + element.height - viewbox.y) * viewbox.scale + containerRect.top + 8;

        const bo = element.businessObject;
        const availableApps = allApplicationNames;

        const popover = document.createElement('div');
        popover.className = 'task-app-popover';
        popover.style.cssText = `
          position:fixed; left:${ex}px; top:${ey}px; transform:translateX(-50%);
          z-index:99999; background:white; border:1px solid #d9d9d9; border-radius:8px;
          box-shadow:0 6px 16px rgba(0,0,0,.12); padding:8px; min-width:220px; max-width:300px;
          font-family:'IBM Plex Sans',Arial,sans-serif; font-size:12px;
        `;

        const title = document.createElement('div');
        title.textContent = 'Applications';
        title.style.cssText = 'font-weight:600;margin-bottom:6px;color:#333;font-size:13px;';
        popover.appendChild(title);

        const assignedDiv = document.createElement('div');
        assignedDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;min-height:24px;';

        function rebuildAssigned() {
          assignedDiv.innerHTML = '';
          const apps = getTaskApps(bo);
          if (!apps.length) {
            assignedDiv.innerHTML = '<span style="color:#999;font-style:italic;">No applications assigned</span>';
            return;
          }
          const validAppSet = new Set(allApplicationNames.map((n) => n.toLowerCase().trim()));
          for (const appName of apps) {
            const isValid = validAppSet.has(appName.toLowerCase().trim());
            const tag = document.createElement('span');
            tag.style.cssText = isValid
              ? 'display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e6f4ff;color:#1677ff;border:1px solid #91caff;border-radius:4px;font-size:11px;'
              : `display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#fff7e6;color:${DARK_ORANGE};border:1px solid ${DARK_ORANGE};border-radius:4px;font-size:11px;`;
            tag.innerHTML = COMPUTER_ICON + ' ' + appName;
            const x = document.createElement('span');
            x.textContent = '×';
            x.style.cssText = 'cursor:pointer;margin-left:2px;color:#ff4d4f;font-weight:bold;font-size:13px;line-height:1;';
            x.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const current = getTaskApps(bo).filter((n) => n !== appName);
              setTaskApps(bo, current, m);
              popoverDirtyRef.current = true;
              rebuildAssigned();
              renderList(searchInput.value);
              renderAppOverlays(m);
            });
            tag.appendChild(x);
            assignedDiv.appendChild(tag);
          }
        }
        rebuildAssigned();
        popover.appendChild(assignedDiv);

        const searchRow = document.createElement('div');
        searchRow.style.cssText = 'display:flex;gap:4px;';
        const searchInput = document.createElement('input');
        searchInput.placeholder = 'Search application…';
        searchInput.style.cssText = 'flex:1;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;font-size:12px;outline:none;';
        searchRow.appendChild(searchInput);
        popover.appendChild(searchRow);

        const list = document.createElement('div');
        list.style.cssText = 'max-height:140px;overflow-y:auto;margin-top:4px;border:1px solid #f0f0f0;border-radius:4px;';

        function renderList(filter: string) {
          list.innerHTML = '';
          const assigned = new Set(getTaskApps(bo));
          const lc = filter.toLowerCase();
          const matches = availableApps.filter((a) => !assigned.has(a) && a.toLowerCase().includes(lc)).slice(0, 20);
          if (!matches.length) {
            list.innerHTML = '<div style="padding:4px 8px;color:#999;">No matches</div>';
            return;
          }
          for (const appName of matches) {
            const row = document.createElement('div');
            row.textContent = appName;
            row.style.cssText = 'padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            row.addEventListener('mouseenter', () => { row.style.background = '#f0f0ff'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'white'; });
            row.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const current = getTaskApps(bo);
              setTaskApps(bo, [...current, appName], m);
              popoverDirtyRef.current = true;
              rebuildAssigned();
              renderList(searchInput.value);
              renderAppOverlays(m);
            });
            list.appendChild(row);
          }
        }
        renderList('');
        popover.appendChild(list);

        searchInput.addEventListener('input', () => renderList(searchInput.value));

        const closeHandler = (ev: MouseEvent) => {
          if (!popover.contains(ev.target as Node)) {
            removeAppPopover();
            document.removeEventListener('mousedown', closeHandler);
            if (popoverDirtyRef.current) {
              popoverDirtyRef.current = false;
              triggerXmlChange(m);
            }
          }
        };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);

        document.body.appendChild(popover);
        appPopoverRef.current = popover;
        searchInput.focus();
      }

      /** Notify parent of XML change after modifying extension elements */
      async function triggerXmlChange(m: any) {
        try {
          const { xml: updated } = await m.saveXML({ format: true });
          onXmlChange?.(updated);
        } catch { /* ignore */ }
      }

      // Store reference so XML-import effect can call it
      renderAppOverlaysRef.current = () => renderAppOverlays(modeler);

      // Right-click on tasks shows app popover
      modeler.on('element.contextmenu', (event: any) => {
        const element = event.element;
        if (isActivityType(element?.businessObject?.$type)) {
          event.originalEvent?.preventDefault();
          showAppPopover(element, modeler);
        }
      });

      // Intercept direct editing on task elements to show autocomplete
      modeler.on('directEditing.activate', (event: any) => {
        const element = event.active?.element || event.element;
        console.log('[BpmnEditor] directEditing.activate', element?.businessObject?.$type);
        if (!isActivityType(element?.businessObject?.$type)) return;

        // Wait for the contenteditable div to appear in the DOM
        setTimeout(() => {
          // Get the canvas container where direct editing parent is appended
          const container = modeler.get('canvas').getContainer();
          const parent = container.querySelector('.djs-direct-editing-parent') as HTMLElement;
          if (!parent) return;
          const contentEl = parent.querySelector('.djs-direct-editing-content') as HTMLElement;
          if (!contentEl) return;

          // Create autocomplete dropdown as a fixed overlay (avoids layout shift)
          removeAutocomplete();
          const dropdown = document.createElement('div');
          dropdown.className = 'task-autocomplete';
          const parentRect = parent.getBoundingClientRect();
          dropdown.style.cssText = `
            position: fixed;
            top: ${parentRect.bottom}px;
            left: ${parentRect.left}px;
            width: ${Math.max(parentRect.width, 200)}px;
            z-index: 99999;
            max-height: 180px; overflow-y: auto; background: white;
            border: 1px solid #d9d9d9; border-radius: 0 0 4px 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,.15);
            font-family: 'IBM Plex Sans', Arial, sans-serif; font-size: 12px;
          `;
          document.body.appendChild(dropdown);
          autocompleteRef.current = dropdown;

          const renderOptions = (filter: string) => {
            const lc = filter.toLowerCase().trim();
            const matches = lc
              ? taskNamesRef.current.filter((n) => n.toLowerCase().includes(lc)).slice(0, 15)
              : taskNamesRef.current.slice(0, 15);
            dropdown.innerHTML = '';
            if (!matches.length) {
              dropdown.innerHTML = '<div style="padding:4px 8px;color:#999;">No matching tasks</div>';
              return;
            }
            for (const name of matches) {
              const item = document.createElement('div');
              item.textContent = name;
              item.style.cssText = 'padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
              item.addEventListener('mouseenter', () => { item.style.background = '#f0f0ff'; });
              item.addEventListener('mouseleave', () => { item.style.background = 'white'; });
              item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Set the text content and complete editing
                contentEl.textContent = name;
                contentEl.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                  const directEditing = modeler.get('directEditing');
                  directEditing.complete();
                  removeAutocomplete();
                }, 10);
              });
              dropdown.appendChild(item);
            }
          };

          renderOptions(contentEl.textContent || '');

          // Listen for input on contenteditable
          const inputHandler = () => renderOptions(contentEl.textContent || '');
          contentEl.addEventListener('input', inputHandler);

          // Prevent Enter from completing with invalid name
          contentEl.addEventListener('keydown', (e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Enter') {
              const val = (contentEl.textContent || '').trim();
              const isValid = taskNamesRef.current.some((n) => n.toLowerCase() === val.toLowerCase());
              if (!isValid) {
                ke.preventDefault();
                ke.stopPropagation();
              }
            }
          });
        }, 100);
      });

      modeler.on('directEditing.deactivate', () => {
        removeAutocomplete();
        // Re-validate colors immediately after any name edit
        validateAndColorTasks(modeler);
      });

      function removeAutocomplete() {
        if (autocompleteRef.current) {
          autocompleteRef.current.remove();
          autocompleteRef.current = null;
        }
      }

      return () => {
        removeAppPopover();
        removeAutocomplete();
        modeler.destroy();
        modelerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Import XML when it changes from outside
    useEffect(() => {
      const modeler = modelerRef.current;
      if (!modeler) return;
      const source = xml || EMPTY_DIAGRAM;
      importingRef.current = true;
      modeler.importXML(source).then(async () => {
        importingRef.current = false;
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
        // Migrate text-annotation apps to extension elements
        migrateTextAnnotationApps(modeler);
        // Validate tasks against Task Factory
        await validateAndColorTasks(modeler);
        // Render application overlays
        renderAppOverlaysRef.current();
      }).catch((err: Error) => {
        importingRef.current = false;
        console.error('[BpmnEditor] Import error:', err.message);
      });
    }, [xml]);

    /**
     * Migrate legacy text-annotation-based app lists to bpmniq extension elements.
     * Looks for textAnnotation→task associations where the annotation text is
     * a comma-separated list of application names. Converts them to
     * <bpmniq:taskApplications> inside the task's extensionElements.
     */
    function migrateTextAnnotationApps(m: any) {
      const elementRegistry = m.get('elementRegistry');
      const moddle = m.get('moddle');

      // Build a map: taskId -> textAnnotation text (from associations)
      const associations = elementRegistry.filter((el: any) => el.businessObject?.$type === 'bpmn:Association');
      const annotationToTask: Map<string, any> = new Map();

      for (const assocEl of associations) {
        const bo = assocEl.businessObject;
        const src = bo.sourceRef;
        const tgt = bo.targetRef;
        if (!src || !tgt) continue;
        // textAnnotation -> task
        if (src.$type === 'bpmn:TextAnnotation' && isActivityType(tgt.$type)) {
          annotationToTask.set(src.id, { annotation: src, task: tgt });
        }
        // task -> textAnnotation (reversed)
        if (tgt.$type === 'bpmn:TextAnnotation' && isActivityType(src.$type)) {
          annotationToTask.set(tgt.id, { annotation: tgt, task: src });
        }
      }

      const modeling = m.get('modeling');
      const toRemove: any[] = []; // elements to delete after migration

      let migrated = 0;
      for (const [annotationId, { annotation, task }] of annotationToTask.entries()) {
        const text = annotation.text?.trim();
        if (!text) continue;
        // Skip non-app annotations (title, date, etc.)
        if (text.length > 200) continue;

        // Parse comma-separated app names from the annotation
        const appNames = text.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (!appNames.length) continue;

        // Check if this task already has bpmniq apps
        const existing = (task.extensionElements?.values || []).find((e: any) => e.$type === 'bpmniq:TaskApplications');

        if (existing) {
          // Already migrated — check if annotation text matches the stored apps
          // If so, it's a duplicate and should be removed
          const storedNames = (existing.applications || []).map((a: any) => a.name?.trim()).filter(Boolean);
          const annotNames = new Set(appNames.map((n: string) => n.toLowerCase()));
          const storedSet = new Set(storedNames.map((n: string) => n.toLowerCase()));
          const isMatch = annotNames.size === storedSet.size && [...annotNames].every((n) => storedSet.has(n));
          if (isMatch) {
            // Duplicate — collect for removal
            const annotEl = elementRegistry.get(annotationId);
            if (annotEl) toRemove.push(annotEl);
            for (const assocEl of associations) {
              const bo = assocEl.businessObject;
              if (bo.sourceRef?.id === annotationId || bo.targetRef?.id === annotationId) {
                toRemove.push(assocEl);
              }
            }
          }
          continue;
        }

        // Create extension elements
        if (!task.extensionElements) {
          task.extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
          task.extensionElements.$parent = task;
        }
        const apps = appNames.map((name: string) => {
          const app = moddle.create('bpmniq:Application', { name });
          return app;
        });
        const container = moddle.create('bpmniq:TaskApplications', { applications: apps });
        container.$parent = task.extensionElements;
        apps.forEach((a: any) => { a.$parent = container; });
        task.extensionElements.values.push(container);
        migrated++;

        // Collect annotation + its association for removal
        const annotEl = elementRegistry.get(annotationId);
        if (annotEl) toRemove.push(annotEl);
        // Find the association element linking this annotation
        for (const assocEl of associations) {
          const bo = assocEl.businessObject;
          if (bo.sourceRef?.id === annotationId || bo.targetRef?.id === annotationId) {
            toRemove.push(assocEl);
          }
        }
      }

      // Remove old text annotations and associations from the diagram
      if (toRemove.length) {
        importingRef.current = true;
        for (const el of toRemove) {
          try { modeling.removeElements([el]); } catch { /* ignore */ }
        }
        importingRef.current = false;
      }

      if (migrated > 0) {
        console.log(`[BpmnEditor] Migrated ${migrated} text annotations to extension elements`);
      }
    }

    // Validate task names against the Task Factory and color deviations
    async function validateAndColorTasks(modeler: any) {
      try {
        const elementRegistry = modeler.get('elementRegistry');
        const modeling = modeler.get('modeling');

        // Find all task-type elements (Task, UserTask, ServiceTask, etc.)
        const taskElements = elementRegistry.filter((el: any) => {
          const bo = el.businessObject;
          return bo && bo.$type && isActivityType(bo.$type) && bo.name;
        });

        if (!taskElements.length) return;

        const taskNames = taskElements.map((el: any) => el.businessObject.name);
        const { invalid } = await validateTasks(taskNames);
        const invalidSet = new Set(invalid.map((n: string) => n.toLowerCase().trim()));

        // Apply colors — blue outline for all, orange text for invalid
        importingRef.current = true;
        for (const el of taskElements) {
          const name = el.businessObject.name.toLowerCase().trim();
          // All tasks get blue outline
          modeling.setColor([el], { stroke: DEFAULT_STROKE });
          // Color the text label orange for invalid tasks
          const gfx = elementRegistry.getGraphics(el);
          if (gfx) {
            const textGroup = gfx.querySelector('.djs-label') || gfx.querySelector('text');
            if (textGroup) {
              const texts = textGroup.tagName === 'text' ? [textGroup] : textGroup.querySelectorAll('text');
              texts.forEach((t: SVGElement) => {
                t.style.fill = invalidSet.has(name) ? DARK_ORANGE : '';
              });
            }
          }
        }
        // Color all sequence flows, gateways, and events blue to match
        const flowElements = elementRegistry.filter((el: any) => {
          const t = el.businessObject?.$type;
          return t && (t.includes('Flow') || t.includes('Gateway') || t.includes('Event'));
        });
        if (flowElements.length) {
          modeling.setColor(flowElements, { stroke: DEFAULT_STROKE });
        }
        importingRef.current = false;
      } catch {
        // Validation is best-effort; don't break the editor
        importingRef.current = false;
      }
    }

    return (
      <div className="flex h-full w-full overflow-hidden relative">
        <div ref={canvasRef} className="bpmn-canvas absolute inset-0" />
        {showProperties && (
          <div
            ref={propertiesRef}
            className="properties-panel-container w-[280px] min-w-[240px] border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-10"
          />
        )}
      </div>
    );
  },
);

BpmnEditor.displayName = 'BpmnEditor';
export default BpmnEditor;
