import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
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
  replaceAppNames: (replacements: Map<string, string>) => Promise<void>;
  replaceTaskNames: (replacements: Map<string, string>) => Promise<void>;
}

interface BpmnEditorProps {
  xml: string;
  onXmlChange?: (xml: string) => void;
  showProperties?: boolean;
  allApplicationNames?: string[];
  allTaskNames?: string[];
  allPersonaNames?: string[];
  diagramName?: string;
  onNavigateToFactory?: (tab: string, searchTerm: string, mode?: 'view' | 'add', extra?: { applications?: string[]; persona?: string }) => void;
  onTaskSelect?: (task: { name: string; id: string } | null) => void;
}

const DARK_ORANGE = '#cc7000';
const DEFAULT_STROKE = 'blue';

/** Returns true for Task, UserTask, ServiceTask, SubProcess, CallActivity, etc. */
function isActivityType(type?: string): boolean {
  if (!type) return false;
  return type.includes('Task') || type.includes('SubProcess') || type.includes('CallActivity');
}

const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  ({ xml, onXmlChange, showProperties = true, allApplicationNames = [], allTaskNames = [], allPersonaNames = [], diagramName, onNavigateToFactory, onTaskSelect }, ref) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const propertiesRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const xmlRef = useRef<string>(xml);
    const importingRef = useRef(false);
    const importVersionRef = useRef(0);
    const taskNamesRef = useRef<string[]>([]);
    const autocompleteRef = useRef<HTMLDivElement | null>(null);
    const appPopoverRef = useRef<HTMLDivElement | null>(null);
    const popoverDirtyRef = useRef(false);

    // Properties panel resize & collapse state
    const [propsWidth, setPropsWidth] = useState(280);
    const [propsCollapsed, setPropsCollapsed] = useState(false);
    const propsResizing = useRef(false);
    const propsStartX = useRef(0);
    const propsStartW = useRef(280);
    const allAppNamesRef = useRef<string[]>(allApplicationNames);
    const renderAppOverlaysRef = useRef<(m?: any) => void>(() => {});
    const getTaskAppsRef = useRef<(bo: any) => string[]>(() => []);
    const [selectedApp, setSelectedApp] = useState<{ name: string; taskName: string; taskId: string } | null>(null);
    const [selectedTask, setSelectedTask] = useState<{ name: string; id: string } | null>(null);
    const [selectedLane, setSelectedLane] = useState<{ name: string; id: string } | null>(null);

    // Keep the latest values in refs to avoid stale closures
    xmlRef.current = xml;
    allAppNamesRef.current = allApplicationNames;
    if (allTaskNames.length) taskNamesRef.current = allTaskNames;
    const personaNamesRef = useRef<string[]>(allPersonaNames);
    personaNamesRef.current = allPersonaNames;

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
      replaceAppNames: async (replacements: Map<string, string>) => {
        const m = modelerRef.current;
        if (!m) return;
        const elementRegistry = m.get('elementRegistry');
        const moddle = m.get('moddle');
        let changed = false;

        // Build annotation app map (same logic as renderAppOverlays)
        const annotationAppMap = new Map<string, string[]>();
        const allElements = elementRegistry.getAll();
        for (const el of allElements) {
          const bo = el.businessObject;
          if (bo?.$type === 'bpmn:Association' || bo?.$type === 'bpmn2:Association') {
            const srcRef = bo.sourceRef;
            const tgtRef = bo.targetRef;
            if (!srcRef || !tgtRef) continue;
            const annBo = srcRef.$type?.includes('TextAnnotation') ? srcRef : tgtRef.$type?.includes('TextAnnotation') ? tgtRef : null;
            const taskBo = srcRef.$type?.includes('TextAnnotation') ? tgtRef : tgtRef.$type?.includes('TextAnnotation') ? srcRef : null;
            if (!annBo || !taskBo) continue;
            const type = taskBo.$type;
            if (!type || !/task|subProcess/i.test(type)) continue;
            const text = annBo.text?.trim();
            if (!text || (text.includes('|') && text.includes(':'))) continue;
            const apps = text.split(',').map((s: string) => s.trim()).filter(Boolean);
            if (apps.length) {
              const taskId = taskBo.id || taskBo.$attrs?.id;
              const existing = annotationAppMap.get(taskId) || [];
              annotationAppMap.set(taskId, [...existing, ...apps]);
            }
          }
        }

        elementRegistry.filter((el: any) => {
          const type = el.businessObject?.$type;
          return type && /task|subProcess/i.test(type);
        }).forEach((el: any) => {
          const bo = el.businessObject;
          const exts = bo.extensionElements?.values || [];
          const container = exts.find((e: any) => e.$type === 'bpmniq:TaskApplications');

          // Get current app names from extension elements or annotation fallback
          let currentNames: string[] = [];
          if (container?.applications?.length) {
            currentNames = container.applications.map((a: any) => a.name);
          } else if (annotationAppMap.has(el.id)) {
            currentNames = annotationAppMap.get(el.id) || [];
          }
          if (!currentNames.length) return;

          const newNames = currentNames.map((n: string) => replacements.get(n.toLowerCase().trim()) || n);
          if (newNames.some((n: string, i: number) => n !== currentNames[i])) {
            // Ensure extensionElements exists
            if (!bo.extensionElements) {
              bo.extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
              bo.extensionElements.$parent = bo;
            }
            // Remove existing TaskApplications if any
            bo.extensionElements.values = (bo.extensionElements.values || []).filter(
              (e: any) => e.$type !== 'bpmniq:TaskApplications'
            );
            // Create new TaskApplications with replaced names
            const apps = newNames.map((name: string) => {
              const app = moddle.create('bpmniq:Application', { name });
              return app;
            });
            const newContainer = moddle.create('bpmniq:TaskApplications', { applications: apps });
            newContainer.$parent = bo.extensionElements;
            apps.forEach((a: any) => { a.$parent = newContainer; });
            bo.extensionElements.values.push(newContainer);
            changed = true;
          }
        });
        if (changed) {
          const { xml: updated } = await m.saveXML({ format: true });
          onXmlChange?.(updated);
          renderAppOverlaysRef.current();
        }
      },
      replaceTaskNames: async (replacements: Map<string, string>) => {
        const m = modelerRef.current;
        if (!m) return;
        const elementRegistry = m.get('elementRegistry');
        const modeling = m.get('modeling');
        let changed = false;
        elementRegistry.filter((el: any) => {
          const type = el.businessObject?.$type;
          return type && /task|subProcess/i.test(type);
        }).forEach((el: any) => {
          const currentName = el.businessObject.name || '';
          const newName = replacements.get(currentName);
          if (newName && newName !== currentName) {
            modeling.updateProperties(el, { name: newName });
            changed = true;
          }
        });
        if (changed) {
          const { xml: updated } = await m.saveXML({ format: true });
          onXmlChange?.(updated);
          // Re-validate task colors
          await validateAndColorTasks(m);
        }
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
      getTaskAppsRef.current = getTaskApps;

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

        // Build a map of task ID → app names from text annotations linked via associations
        const annotationAppMap = new Map<string, string[]>();
        const parsedAnnotationIds = new Set<string>();
        const parsedAssociationIds = new Set<string>();
        const allElements = elementRegistry.getAll();
        for (const el of allElements) {
          const bo = el.businessObject;
          if (bo?.$type === 'bpmn:Association' || bo?.$type === 'bpmn2:Association') {
            const srcRef = bo.sourceRef;
            const tgtRef = bo.targetRef;
            if (!srcRef || !tgtRef) continue;
            // sourceRef is annotation, targetRef is task
            const annBo = srcRef.$type?.includes('TextAnnotation') ? srcRef : tgtRef.$type?.includes('TextAnnotation') ? tgtRef : null;
            const taskBo = srcRef.$type?.includes('TextAnnotation') ? tgtRef : tgtRef.$type?.includes('TextAnnotation') ? srcRef : null;
            if (!annBo || !taskBo || !isActivityType(taskBo.$type)) continue;
            const text = annBo.text?.trim();
            if (!text || (text.includes('|') && text.includes(':'))) continue;
            const apps = text.split(',').map((s: string) => s.trim()).filter(Boolean);
            if (apps.length) {
              const taskId = taskBo.id || taskBo.$attrs?.id;
              const existing = annotationAppMap.get(taskId) || [];
              annotationAppMap.set(taskId, [...existing, ...apps]);
              parsedAnnotationIds.add(annBo.id || annBo.$attrs?.id);
              parsedAssociationIds.add(el.id);
            }
          }
        }

        // Hide parsed text annotations and their association connectors from the canvas
        const canvas = m.get('canvas');
        for (const annId of parsedAnnotationIds) {
          const annEl = elementRegistry.get(annId);
          if (annEl) {
            const gfx = canvas.getGraphics(annEl);
            if (gfx) gfx.style.display = 'none';
          }
        }
        for (const assocId of parsedAssociationIds) {
          const assocEl = elementRegistry.get(assocId);
          if (assocEl) {
            const gfx = canvas.getGraphics(assocEl);
            if (gfx) gfx.style.display = 'none';
          }
        }

        // Render overlays for tasks that have apps in their extensionElements OR linked annotations
        const tasks = elementRegistry.filter((el: any) => isActivityType(el.businessObject?.$type));
        for (const el of tasks) {
          let appNames = getTaskApps(el.businessObject);
          // Fallback: use apps from linked text annotations
          if (!appNames.length && annotationAppMap.has(el.id)) {
            appNames = annotationAppMap.get(el.id) || [];
          }
          if (!appNames.length) {
            // Show a "+" button so user can add apps
            const addBtn = document.createElement('div');
            addBtn.title = 'Add applications';
            addBtn.textContent = '+';
            addBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e6f4ff;color:#1677ff;border:1px solid #91caff;cursor:pointer;font-size:14px;font-weight:bold;font-family:"IBM Plex Sans",Arial,sans-serif;line-height:1;';
            addBtn.addEventListener('mouseenter', () => { addBtn.style.background = '#bae0ff'; });
            addBtn.addEventListener('mouseleave', () => { addBtn.style.background = '#e6f4ff'; });
            addBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              showAppPopover(el, m);
            });
            overlays.add(el.id, OVERLAY_TYPE, {
              position: { bottom: -4, left: 0 },
              html: addBtn,
            });
            continue;
          }
          const html = document.createElement('div');
          html.className = 'task-app-overlay';
          html.style.cssText = 'display:flex;flex-direction:column;gap:1px;padding:2px 0;cursor:pointer;font-family:"IBM Plex Sans",Arial,sans-serif;';
          const validSet = new Set(allAppNamesRef.current.map((n) => n.toLowerCase().trim()));
          for (const appName of appNames) {
            const isValid = validSet.has(appName.toLowerCase().trim());
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:3px;white-space:nowrap;cursor:pointer;padding:1px 2px;border-radius:3px;';
            row.addEventListener('mouseenter', () => { row.style.background = '#f0f5ff'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
            row.addEventListener('click', (e) => {
              e.stopPropagation();
              setSelectedApp({ name: appName, taskName: el.businessObject.name || el.id, taskId: el.id });
            });
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
          html.addEventListener('contextmenu', (e) => {
            e.preventDefault();
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
        const availableApps = allAppNamesRef.current;

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
          const validAppSet = new Set(allAppNamesRef.current.map((n) => n.toLowerCase().trim()));
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

      // Track element selection – show task link when a task/activity is clicked
      modeler.on('element.click', (event: any) => {
        setSelectedApp(null);
        const el = event.element;
        const boType = el?.businessObject?.$type || '';
        if (el && isActivityType(boType)) {
          const task = { name: el.businessObject.name || '', id: el.id };
          setSelectedTask(task);
          setSelectedLane(null);
          onTaskSelect?.(task.name ? task : null);
        } else if (boType === 'bpmn:Lane' || boType === 'bpmn2:Lane') {
          setSelectedTask(null);
          onTaskSelect?.(null);
          const laneName = (el.businessObject.name || '').trim();
          setSelectedLane(laneName ? { name: laneName, id: el.id } : null);
        } else {
          setSelectedTask(null);
          setSelectedLane(null);
          onTaskSelect?.(null);
        }
      });

      // Right-click on tasks opens direct editing (shows task name autocomplete)
      // Right-click on lanes shows persona dropdown directly (no direct editing)
      modeler.on('element.contextmenu', (event: any) => {
        const element = event.element;
        const boType = element?.businessObject?.$type || '';
        if (isActivityType(boType)) {
          event.originalEvent?.preventDefault();
          const directEditing = modeler.get('directEditing');
          directEditing.activate(element);
        } else if (boType === 'bpmn:Lane' || boType === 'bpmn2:Lane') {
          event.originalEvent?.preventDefault();
          // Show persona dropdown directly without activating direct editing
          removeAutocomplete();
          const canvas = modeler.get('canvas');
          const container = canvas.getContainer();
          const gfx = container.querySelector(`[data-element-id="${element.id}"]`);
          if (!gfx) return;
          const rect = gfx.getBoundingClientRect();

          const dropdown = document.createElement('div');
          dropdown.className = 'task-autocomplete';
          dropdown.style.cssText = `
            position: fixed;
            top: ${rect.top + 20}px;
            left: ${rect.left + 40}px;
            width: 220px;
            z-index: 99999;
            max-height: 200px; overflow-y: auto; background: white;
            border: 1px solid #d9d9d9; border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,.15);
            font-family: 'IBM Plex Sans', Arial, sans-serif; font-size: 12px;
          `;
          document.body.appendChild(dropdown);
          autocompleteRef.current = dropdown;

          const namesList = personaNamesRef.current;
          const currentName = (element.businessObject?.name || '').toLowerCase();
          for (const pName of namesList.slice(0, 20)) {
            const item = document.createElement('div');
            item.textContent = pName;
            const isCurrent = pName.toLowerCase() === currentName;
            item.style.cssText = `padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isCurrent ? 'font-weight:bold;background:#f0f0ff;' : ''}`;
            item.addEventListener('mouseenter', () => { if (!isCurrent) item.style.background = '#f0f0ff'; });
            item.addEventListener('mouseleave', () => { if (!isCurrent) item.style.background = 'white'; });
            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              removeAutocomplete();
              try {
                const elementRegistry = modeler.get('elementRegistry');
                const laneEl = elementRegistry.get(element.id);
                console.log('[BpmnEditor] Lane rename:', element.id, '→', pName, 'element found:', !!laneEl);
                if (laneEl) {
                  // Directly mutate the business object name
                  laneEl.businessObject.name = pName;
                  // Fire element.changed so the renderer redraws the label
                  const eventBus = modeler.get('eventBus');
                  eventBus.fire('element.changed', { element: laneEl });
                  // Export updated XML and push to parent state (triggers reimport)
                  modeler.saveXML({ format: true }).then(({ xml: updated }: any) => {
                    onXmlChange?.(updated);
                  });
                }
                validateLanePersonas(modeler);
              } catch (err) {
                console.error('[BpmnEditor] Lane rename failed:', err);
              }
            });
            dropdown.appendChild(item);
          }

          // Close dropdown on outside click
          const closeHandler = (ev: MouseEvent) => {
            if (!dropdown.contains(ev.target as Node)) {
              removeAutocomplete();
              document.removeEventListener('mousedown', closeHandler, true);
            }
          };
          setTimeout(() => document.addEventListener('mousedown', closeHandler, true), 0);
        }
      });

      // Intercept direct editing on task elements to show autocomplete
      modeler.on('directEditing.activate', (event: any) => {
        const element = event.active?.element || event.element;
        const boType = element?.businessObject?.$type || '';
        console.log('[BpmnEditor] directEditing.activate', boType);
        const isTask = isActivityType(boType);
        if (!isTask) return;

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
            const namesList = taskNamesRef.current;
            const matches = lc
              ? namesList.filter((n) => n.toLowerCase().includes(lc)).slice(0, 15)
              : namesList.slice(0, 15);
            dropdown.innerHTML = '';
            if (!matches.length) {
              dropdown.innerHTML = `<div style="padding:4px 8px;color:#999;">No matching tasks</div>`;
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
              const namesList = taskNamesRef.current;
              const isValid = namesList.some((n) => n.toLowerCase() === val.toLowerCase());
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
        validateLanePersonas(modeler);
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
      // Increment version to detect stale imports (prevents race condition)
      const version = ++importVersionRef.current;
      importingRef.current = true;
      modeler.importXML(source).then(async () => {
        // Abort if a newer import was started while this one was in progress
        if (importVersionRef.current !== version) return;
        importingRef.current = false;
        // Guard: ensure modeler is still alive
        if (!modelerRef.current) return;
        try {
          const canvas = modeler.get('canvas');
          canvas.zoom('fit-viewport');
          // Scroll down slightly so diagram name banner is visible, and right to avoid toolbar overlap
          const vbox = canvas.viewbox();
          canvas.viewbox({ x: vbox.x - 120, y: vbox.y - 80, width: vbox.outer.width, height: vbox.outer.height });
        } catch { /* canvas not ready */ }
        // Migrate text-annotation apps to extension elements
        migrateTextAnnotationApps(modeler);
        // Validate tasks against Task Factory
        await validateAndColorTasks(modeler);
        // Validate lane personas against Persona Factory
        validateLanePersonas(modeler);
        // Render application overlays
        renderAppOverlaysRef.current();
      }).catch((err: Error) => {
        if (importVersionRef.current !== version) return;
        importingRef.current = false;
        console.error('[BpmnEditor] Import error:', err.message);
      });
    }, [xml]);

    // Re-render overlays when application reference data loads/changes
    useEffect(() => {
      if (allApplicationNames.length && modelerRef.current) {
        renderAppOverlaysRef.current();
      }
    }, [allApplicationNames]);

    // Re-validate task colors when task reference data changes
    useEffect(() => {
      if (allTaskNames.length && modelerRef.current) {
        validateAndColorTasks(modelerRef.current);
      }
    }, [allTaskNames]);

    // Re-validate lane persona colors when persona reference data changes
    useEffect(() => {
      if (allPersonaNames.length && modelerRef.current) {
        validateLanePersonas(modelerRef.current);
      }
    }, [allPersonaNames]);

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

    function validateLanePersonas(modeler: any) {
      try {
        const names = personaNamesRef.current;
        if (!names.length) return;
        const validSet = new Set(names.map((n) => n.toLowerCase().trim()));
        const elementRegistry = modeler.get('elementRegistry');
        const laneElements = elementRegistry.filter((el: any) => {
          const t = el.businessObject?.$type;
          return t && (t === 'bpmn:Lane' || t === 'bpmn2:Lane');
        });
        for (const el of laneElements) {
          const laneName = (el.businessObject.name || '').trim();
          if (!laneName) continue;
          const isValid = validSet.has(laneName.toLowerCase());
          const gfx = elementRegistry.getGraphics(el);
          if (gfx) {
            // Color the lane label text orange if not a known persona
            const label = gfx.querySelector('.djs-label') || gfx.querySelector('text');
            if (label) {
              const texts = label.tagName === 'text' ? [label] : label.querySelectorAll('text');
              texts.forEach((t: SVGElement) => {
                t.style.fill = isValid ? '' : DARK_ORANGE;
                t.style.fontWeight = isValid ? '' : 'bold';
              });
            }
          }
        }
      } catch {
        // best-effort
      }
    }

    const validAppSet = new Set(allApplicationNames.map((n) => n.toLowerCase().trim()));
    const isSelectedAppValid = selectedApp ? validAppSet.has(selectedApp.name.toLowerCase().trim()) : true;
    const isSelectedTaskValid = selectedTask ? taskNamesRef.current.some((n) => n.toLowerCase() === selectedTask.name.toLowerCase().trim()) : true;
    const validPersonaSet = new Set(allPersonaNames.map((n) => n.toLowerCase().trim()));
    const isSelectedLaneValid = selectedLane ? validPersonaSet.has(selectedLane.name.toLowerCase().trim()) : true;

    return (
      <div className="flex h-full w-full overflow-hidden relative">
        {diagramName && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md px-5 py-2 shadow-sm">
              <span className="text-xl font-bold text-gray-700">{diagramName}</span>
            </div>
          </div>
        )}
        <div ref={canvasRef} className="bpmn-canvas absolute inset-0" />
        {/* Collapse toggle when properties hidden */}
        {showProperties && propsCollapsed && (
          <button
            className="absolute right-0 top-2 z-30 bg-white border border-gray-200 rounded-l px-1 py-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 shadow-sm"
            onClick={() => setPropsCollapsed(false)}
            title="Show properties panel"
          >
            ◀
          </button>
        )}
        {showProperties && (
          <div
            ref={propertiesRef}
            className="properties-panel-container border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-10 overflow-hidden"
            style={{
              width: propsCollapsed ? 0 : propsWidth,
              display: (selectedApp || selectedTask?.name || selectedLane) ? 'none' : undefined,
              transition: propsResizing.current ? 'none' : 'width 0.2s',
              borderLeftWidth: propsCollapsed ? 0 : undefined,
            }}
          >
            {/* Resize handle */}
            {!propsCollapsed && (
              <div
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 11 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  propsResizing.current = true;
                  propsStartX.current = e.clientX;
                  propsStartW.current = propsWidth;
                  const onMove = (ev: MouseEvent) => {
                    const delta = propsStartX.current - ev.clientX;
                    setPropsWidth(Math.max(180, Math.min(500, propsStartW.current + delta)));
                  };
                  const onUp = () => {
                    propsResizing.current = false;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              />
            )}
          </div>
        )}
        {/* Collapse button — rendered outside propertiesRef so bpmn-js content doesn't cover it */}
        {showProperties && !propsCollapsed && !selectedApp && !selectedTask?.name && !selectedLane && (
          <button
            className="absolute top-1 bg-white border border-gray-300 rounded shadow-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 text-xs px-1.5 py-0.5"
            style={{ right: propsWidth + 4, zIndex: 20 }}
            onClick={() => setPropsCollapsed(true)}
            title="Collapse properties panel"
          >
            ▶
          </button>
        )}
        {showProperties && !propsCollapsed && !selectedApp && !selectedLane && selectedTask && selectedTask.name && (
          <div className="border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-20 overflow-y-auto"
            style={{ width: propsWidth, fontFamily: '"IBM Plex Sans", Arial, sans-serif' }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded ${isSelectedTaskValid ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'} flex items-center justify-center`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isSelectedTaskValid ? '#1677ff' : '#cc7000'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Task</div>
                  <div className="font-semibold text-sm" style={{ color: isSelectedTaskValid ? '#333' : '#cc7000' }}>{selectedTask.name}</div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <table className="w-full text-xs">
                  <tbody>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Status</td><td className="py-1"><span className={`px-1.5 py-0.5 rounded text-xs ${isSelectedTaskValid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-300'}`}>{isSelectedTaskValid ? 'Valid' : 'Invalid'}</span></td></tr>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Element ID</td><td className="py-1 text-gray-600 break-all">{selectedTask.id}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1.5">
                <button
                  className={`w-full text-xs py-1.5 px-3 rounded border text-left flex items-center gap-1.5 ${isSelectedTaskValid ? 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700' : 'border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700'}`}
                  onClick={() => {
                    if (isSelectedTaskValid) {
                      onNavigateToFactory?.('tasks', selectedTask.name, 'view');
                    } else {
                      // Gather extra context from the BPMN element
                      const m = modelerRef.current;
                      let apps: string[] = [];
                      let persona: string | undefined;
                      if (m) {
                        const elementRegistry = m.get('elementRegistry');
                        const el = elementRegistry.get(selectedTask.id);
                        if (el) {
                          apps = getTaskAppsRef.current(el.businessObject);
                          // Find lane containing this task
                          const allEls = elementRegistry.getAll();
                          for (const candidate of allEls) {
                            const bo = candidate.businessObject;
                            if (bo?.$type === 'bpmn:Lane' || bo?.$type === 'bpmn2:Lane') {
                              const flowRefs = bo.flowNodeRef || [];
                              if (flowRefs.some((ref: any) => ref.id === el.businessObject.id || ref === el.businessObject)) {
                                persona = bo.name;
                                break;
                              }
                            }
                          }
                        }
                      }
                      onNavigateToFactory?.('tasks', selectedTask.name, 'add', { applications: apps.length ? apps : undefined, persona });
                    }
                  }}
                  title={isSelectedTaskValid ? 'Open in Business Task Factory' : 'Add to Business Task Factory'}
                >
                  {isSelectedTaskValid
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  }
                  {isSelectedTaskValid ? 'View in Task Factory →' : 'Add to Task Factory →'}
                </button>
              </div>
              <button
                className="mt-4 w-full text-xs py-1.5 px-3 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                onClick={() => { setSelectedTask(null); onTaskSelect?.(null); }}
              >
                ← Back to Properties
              </button>
            </div>
          </div>
        )}
        {showProperties && !propsCollapsed && !selectedApp && !selectedTask?.name && selectedLane && (
          <div className="border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-20 overflow-y-auto"
            style={{ width: propsWidth, fontFamily: '"IBM Plex Sans", Arial, sans-serif' }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded ${isSelectedLaneValid ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'} flex items-center justify-center`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isSelectedLaneValid ? '#1677ff' : '#cc7000'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Persona / Lane</div>
                  <div className="font-semibold text-sm" style={{ color: isSelectedLaneValid ? '#333' : '#cc7000' }}>{selectedLane.name}</div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <table className="w-full text-xs">
                  <tbody>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Status</td><td className="py-1"><span className={`px-1.5 py-0.5 rounded text-xs ${isSelectedLaneValid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-300'}`}>{isSelectedLaneValid ? 'Valid' : 'Invalid'}</span></td></tr>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Element ID</td><td className="py-1 text-gray-600 break-all">{selectedLane.id}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1.5">
                <button
                  className={`w-full text-xs py-1.5 px-3 rounded border text-left flex items-center gap-1.5 ${isSelectedLaneValid ? 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700' : 'border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700'}`}
                  onClick={() => onNavigateToFactory?.('personas', selectedLane.name, isSelectedLaneValid ? 'view' : 'add')}
                  title={isSelectedLaneValid ? 'Open in Persona Factory' : 'Add to Persona Factory'}
                >
                  {isSelectedLaneValid
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  }
                  {isSelectedLaneValid ? 'View in Persona Factory →' : 'Add to Persona Factory →'}
                </button>
              </div>
              <button
                className="mt-4 w-full text-xs py-1.5 px-3 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                onClick={() => setSelectedLane(null)}
              >
                ← Back to Properties
              </button>
            </div>
          </div>
        )}
        {selectedApp && !propsCollapsed && (
          <div className="border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-20 overflow-y-auto"
            style={{ width: propsWidth, fontFamily: '"IBM Plex Sans", Arial, sans-serif' }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isSelectedAppValid ? '#1677ff' : '#cc7000'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Application</div>
                  <div className="font-semibold text-sm" style={{ color: isSelectedAppValid ? '#333' : '#cc7000' }}>{selectedApp.name}</div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <table className="w-full text-xs">
                  <tbody>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Status</td><td className="py-1"><span className={`px-1.5 py-0.5 rounded text-xs ${isSelectedAppValid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-300'}`}>{isSelectedAppValid ? 'Valid' : 'Invalid'}</span></td></tr>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Task</td><td className="py-1 font-medium">{selectedApp.taskName}</td></tr>
                    <tr><td className="text-gray-500 py-1 pr-2 align-top">Task ID</td><td className="py-1 text-gray-600 break-all">{selectedApp.taskId}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1.5">
                <button
                  className="w-full text-xs py-1.5 px-3 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-left flex items-center gap-1.5"
                  onClick={() => onNavigateToFactory?.('applications', selectedApp.name, isSelectedAppValid ? 'view' : 'add')}
                  title={isSelectedAppValid ? 'Open in Application Factory' : 'Add to Application Factory'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  {isSelectedAppValid ? 'View in Application Factory →' : 'Add to Application Factory →'}
                </button>
              </div>
              <button
                className="mt-4 w-full text-xs py-1.5 px-3 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                onClick={() => setSelectedApp(null)}
              >
                ← Back to Properties
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

BpmnEditor.displayName = 'BpmnEditor';
export default BpmnEditor;
