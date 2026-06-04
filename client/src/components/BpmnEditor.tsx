import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from 'bpmn-js-properties-panel';
import { Modal, Tag } from 'antd';
import { validateTasks, getTaskNames, getServers, getServer, getApplicationServers, getDatabases, getDatabase, getApplicationDatabases } from '../api';
import type { ApplicationItem, ServerItem, DatabaseItem } from '../types';
import bpmniqModdle from '../bpmniq-moddle.json';
import {
  buildExactApplicationIdentifierSet,
  findBestFuzzyApplicationMatch,
  findExactApplicationMatches,
  getPreferredApplicationDisplayName,
  getPreferredApplicationIdentifier,
  normalizeApplicationLookupValue,
} from '../utils/applicationMatching';
import { mergeTaskApplicationNames } from '../utils/taskApplicationMigration';

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
  importTrigger?: number;
  onXmlChange?: (xml: string) => void;
  onDirty?: () => void;
  showProperties?: boolean;
  allApplicationNames?: string[];
  allApplications?: ApplicationItem[];
  allBusinessFlowNames?: string[];
  allTaskNames?: string[];
  allActorNames?: string[];
  diagramName?: string;
  diagramStatus?: string | null;
  canEditDiagramName?: boolean;
  isInFactory?: boolean;
  isAlreadyLoaded?: boolean;
  readOnly?: boolean;
  onNavigateToFactory?: (tab: string, searchTerm: string, mode?: 'view' | 'add', extra?: { applications?: string[]; actor?: string }) => void;
  onTaskSelect?: (task: { name: string; id: string } | null) => void;
  onAddToFactory?: () => void;
  onDeleteAndReload?: () => void;
  onSaveAsNew?: (newName: string) => void;
  onDiagramNameClick?: () => void;
  onNewDiagram?: () => void;
  onDiagramNameChange?: (name: string) => void;
  diagramBreadcrumb?: string;
}

const DARK_ORANGE = '#cc7000';
const DEFAULT_STROKE = 'blue';

/** Returns true for Task, UserTask, ServiceTask, SubProcess, CallActivity, etc. */
function isActivityType(type?: string): boolean {
  if (!type) return false;
  return type.includes('Task') || type.includes('SubProcess') || type.includes('CallActivity');
}

function normalizeBusinessFlowLookupValue(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  ({ xml, importTrigger, onXmlChange, onDirty, showProperties = true, allApplicationNames = [], allApplications = [], allBusinessFlowNames = [], allTaskNames = [], allActorNames = [], diagramName, diagramStatus, canEditDiagramName = false, isInFactory, isAlreadyLoaded, readOnly, onNavigateToFactory, onTaskSelect, onAddToFactory, onDeleteAndReload, onSaveAsNew, onDiagramNameClick, onNewDiagram, onDiagramNameChange, diagramBreadcrumb }, ref) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const propertiesRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const xmlRef = useRef<string>(xml);
    const importingRef = useRef(false);
    const importVersionRef = useRef(0);
    const taskNamesRef = useRef<string[]>([]);
    const diagramNameRef = useRef(diagramName);
    diagramNameRef.current = diagramName;
    const invalidTaskNamesRef = useRef<Set<string>>(new Set());
    const autocompleteRef = useRef<HTMLDivElement | null>(null);
    const appPopoverRef = useRef<HTMLDivElement | null>(null);
    const appActionMenuRef = useRef<HTMLDivElement | null>(null);
    const popoverDirtyRef = useRef(false);

    // Properties panel resize & collapse state
    const [propsWidth, setPropsWidth] = useState(280);
    const [propsCollapsed, setPropsCollapsed] = useState(false);
    const propsResizing = useRef(false);
    const propsStartX = useRef(0);
    const propsStartW = useRef(280);
    const allAppNamesRef = useRef<string[]>(allApplicationNames);
    const allApplicationsRef = useRef<ApplicationItem[]>(allApplications);
    const renderAppOverlaysRef = useRef<(m?: any) => void>(() => {});
    const getTaskAppsRef = useRef<(bo: any) => string[]>(() => []);
    const [selectedApp, setSelectedApp] = useState<{ name: string; taskName: string; taskId: string } | null>(null);
    const [selectedTask, setSelectedTask] = useState<{ name: string; id: string } | null>(null);
    const [selectedLane, setSelectedLane] = useState<{ name: string; id: string } | null>(null);
    const [diagramSelected, setDiagramSelected] = useState(false);
    const [editingDiagramName, setEditingDiagramName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [newDiagramName, setNewDiagramName] = useState('');
    const [serverModalOpen, setServerModalOpen] = useState(false);
    const [serverModalAppName, setServerModalAppName] = useState('');
    const [serverList, setServerList] = useState<ServerItem[]>([]);
    const [serverListLoading, setServerListLoading] = useState(false);
    const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
    const [selectedServer, setSelectedServer] = useState<ServerItem | null>(null);
    const [selectedServerLoading, setSelectedServerLoading] = useState(false);
    const [databaseModalOpen, setDatabaseModalOpen] = useState(false);
    const [databaseModalAppName, setDatabaseModalAppName] = useState('');
    const [databaseList, setDatabaseList] = useState<DatabaseItem[]>([]);
    const [databaseListLoading, setDatabaseListLoading] = useState(false);
    const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
    const [selectedDatabase, setSelectedDatabase] = useState<DatabaseItem | null>(null);
    const [selectedDatabaseLoading, setSelectedDatabaseLoading] = useState(false);

    // Keep the latest values in refs to avoid stale closures
    xmlRef.current = xml;
    allAppNamesRef.current = allApplicationNames;
    allApplicationsRef.current = allApplications;
    if (allTaskNames.length) taskNamesRef.current = allTaskNames;
    const actorNamesRef = useRef<string[]>(allActorNames);
    actorNamesRef.current = allActorNames;

    const getAppMetaMatches = (appName: string) => findExactApplicationMatches(allApplicationsRef.current, appName);

    const getAppMeta = (appName: string) => getAppMetaMatches(appName).selected;

    const getAppDisplayName = (appName: string) => getPreferredApplicationDisplayName(getAppMeta(appName), appName);

    const replaceTaskAppIdentifier = async (taskId: string, currentAppName: string, application: ApplicationItem) => {
      const replacementIdentifier = getPreferredApplicationIdentifier(application);
      const modeler = modelerRef.current;
      if (!replacementIdentifier || !modeler) return false;

      const elementRegistry = modeler.get('elementRegistry');
      const moddleInst = modeler.get('moddle');
      const element = elementRegistry.get(taskId);
      const businessObject = element?.businessObject;
      if (!businessObject) return false;

      const currentApps = getTaskAppsRef.current(businessObject);
      const nextApps = Array.from(
        new Map(
          currentApps
            .map((name) => normalizeApplicationLookupValue(name) === normalizeApplicationLookupValue(currentAppName) ? replacementIdentifier : name)
            .map((name) => [normalizeApplicationLookupValue(name), name])
        ).values()
      );

      if (!businessObject.extensionElements) {
        businessObject.extensionElements = moddleInst.create('bpmn:ExtensionElements', { values: [] });
        businessObject.extensionElements.$parent = businessObject;
      }

      businessObject.extensionElements.values = (businessObject.extensionElements.values || []).filter(
        (entry: any) => entry.$type !== 'bpmniq:TaskApplications'
      );

      if (nextApps.length) {
        const apps = nextApps.map((name) => {
          const app = moddleInst.create('bpmniq:Application', { name });
          return app;
        });
        const container = moddleInst.create('bpmniq:TaskApplications', { applications: apps });
        container.$parent = businessObject.extensionElements;
        apps.forEach((app: any) => { app.$parent = container; });
        businessObject.extensionElements.values.push(container);
      }

      renderAppOverlaysRef.current();
      const { xml: updated } = await modeler.saveXML({ format: true });
      onXmlChange?.(updated);

      setSelectedApp((currentSelectedApp) => {
        if (!currentSelectedApp) return currentSelectedApp;
        if (currentSelectedApp.taskId !== taskId) return currentSelectedApp;
        if (normalizeApplicationLookupValue(currentSelectedApp.name) !== normalizeApplicationLookupValue(currentAppName)) return currentSelectedApp;
        return { ...currentSelectedApp, name: replacementIdentifier };
      });

      return true;
    };

    const ensureResolvedDiagramApplication = async (appName: string, taskId: string): Promise<ApplicationItem | null> => {
      const exactMatch = getAppMetaMatches(appName);
      if (exactMatch.selected) return exactMatch.selected;

      const fuzzyMatch = findBestFuzzyApplicationMatch(allApplicationsRef.current, appName);
      if (!fuzzyMatch) return null;

      return await new Promise<ApplicationItem | null>((resolve) => {
        Modal.confirm({
          title: 'Confirm application match',
          okText: 'Confirm match',
          cancelText: 'Cancel',
          content: (
            <div className="text-sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <strong>Diagram application:</strong> {appName}
              </div>
              <div>
                <strong>Reference application:</strong> {getPreferredApplicationDisplayName(fuzzyMatch.app, fuzzyMatch.identifier)}
              </div>
              <div>
                <strong>Stored identifier:</strong> {fuzzyMatch.identifier}
              </div>
              <div>
                <strong>Matched on:</strong> {fuzzyMatch.matchedOn} ({fuzzyMatch.matchedValue})
              </div>
              <div>
                <strong>Similarity score:</strong> {(fuzzyMatch.score * 100).toFixed(0)}%
              </div>
            </div>
          ),
          onOk: async () => {
            const applied = await replaceTaskAppIdentifier(taskId, appName, fuzzyMatch.app);
            resolve(applied ? fuzzyMatch.app : null);
          },
          onCancel: () => resolve(null),
        });
      });
    };

    const toLabel = (key: string) =>
      key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, (ch) => ch.toUpperCase());

    const isKeyLikeString = (value: string): boolean => {
      const text = value.trim();
      if (!text) return false;
      const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
      const mongoIdLike = /^[0-9a-f]{24}$/i.test(text);
      const longOpaqueToken = /^[A-Za-z0-9_-]{20,}$/i.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text);
      return uuidLike || mongoIdLike || longOpaqueToken;
    };

    const renderServerValue = (value: unknown) => {
      if (value === null || value === undefined || value === '') return '—';
      if (Array.isArray(value)) {
        if (!value.length) return '—';
        return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(value, null, 2)}</pre>;
      }
      if (typeof value === 'object') {
        return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(value, null, 2)}</pre>;
      }
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      return String(value);
    };

    const renderDatabaseValue = (value: unknown) => {
      if (value === null || value === undefined || value === '') return '—';
      if (Array.isArray(value)) {
        if (!value.length) return '—';
        return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(value, null, 2)}</pre>;
      }
      if (typeof value === 'object') {
        return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(value, null, 2)}</pre>;
      }
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      return String(value);
    };

    const loadServersForApp = async (appName: string, taskId?: string) => {
      let app = getAppMeta(appName);
      if (!app && taskId) {
        app = await ensureResolvedDiagramApplication(appName, taskId);
      }

      const correlationId = String(app?.correlationId || '').trim();
      const acronym = String(app?.acronym || '').trim();
      const shouldUseCorrelationId = !!correlationId;
      const shouldUseAcronym = !shouldUseCorrelationId && !!acronym;
      console.log('[BpmnEditor] loadServersForApp input:', {
        appName,
        resolvedName: app?.name || null,
        resolvedAcronym: app?.acronym || null,
        resolvedCorrelationId: correlationId || null,
        selectedMode: shouldUseCorrelationId ? 'correlationId' : shouldUseAcronym ? 'acronym' : 'unmatched',
      });

      setServerModalOpen(true);
      setServerModalAppName(getAppDisplayName(appName));
      setServerListLoading(true);
      setSelectedServerId(null);
      setSelectedServer(null);
      try {
        const rows = shouldUseCorrelationId
          ? await getApplicationServers(correlationId)
          : shouldUseAcronym
            ? await getServers({ applicationName: acronym })
            : [];
        console.log('[BpmnEditor] loadServersForApp request:', shouldUseCorrelationId
          ? { endpoint: '/servers/by-application/:correlationId', correlationId }
          : shouldUseAcronym
            ? { endpoint: '/servers', params: { applicationName: acronym } }
            : { endpoint: 'unmatched', params: null });
        console.log('[BpmnEditor] loadServersForApp response count:', rows.length);
        setServerList(rows);
      } catch {
        console.error('[BpmnEditor] loadServersForApp failed');
        setServerList([]);
      } finally {
        setServerListLoading(false);
      }
    };

    const loadDatabasesForApp = async (appName: string, taskId?: string) => {
      let app = getAppMeta(appName);
      if (!app && taskId) {
        app = await ensureResolvedDiagramApplication(appName, taskId);
      }

      const correlationId = String(app?.correlationId || '').trim();
      const acronym = String(app?.acronym || '').trim();
      const shouldUseCorrelationId = !!correlationId;
      const shouldUseAcronym = !shouldUseCorrelationId && !!acronym;

      console.log('[BpmnEditor] loadDatabasesForApp input:', {
        appName,
        resolvedName: app?.name || null,
        resolvedAcronym: app?.acronym || null,
        resolvedCorrelationId: correlationId || null,
        selectedMode: shouldUseCorrelationId ? 'correlationId' : shouldUseAcronym ? 'acronym' : 'unmatched',
      });

      setDatabaseModalOpen(true);
      setDatabaseModalAppName(getAppDisplayName(appName));
      setDatabaseListLoading(true);
      setSelectedDatabaseId(null);
      setSelectedDatabase(null);
      try {
        const rows = shouldUseCorrelationId
          ? await getApplicationDatabases(correlationId)
          : shouldUseAcronym
            ? await getDatabases({ applicationName: acronym })
            : [];
        console.log('[BpmnEditor] loadDatabasesForApp request:', shouldUseCorrelationId
          ? { endpoint: '/databases/by-application/:correlationId', correlationId }
          : shouldUseAcronym
            ? { endpoint: '/databases', params: { applicationName: acronym } }
            : { endpoint: 'unmatched', params: null });
        console.log('[BpmnEditor] loadDatabasesForApp response count:', rows.length);
        setDatabaseList(rows);
      } catch {
        console.error('[BpmnEditor] loadDatabasesForApp failed');
        setDatabaseList([]);
      } finally {
        setDatabaseListLoading(false);
      }
    };

    useEffect(() => {
      if (!selectedServerId) {
        setSelectedServer(null);
        return;
      }
      setSelectedServerLoading(true);
      getServer(selectedServerId)
        .then((row) => setSelectedServer(row))
        .catch(() => setSelectedServer(null))
        .finally(() => setSelectedServerLoading(false));
    }, [selectedServerId]);

    useEffect(() => {
      if (!selectedDatabaseId) {
        setSelectedDatabase(null);
        return;
      }
      setSelectedDatabaseLoading(true);
      getDatabase(selectedDatabaseId)
        .then((row) => setSelectedDatabase(row))
        .catch(() => setSelectedDatabase(null))
        .finally(() => setSelectedDatabaseLoading(false));
    }, [selectedDatabaseId]);

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
        onDirty?.();
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
          const validSet = buildExactApplicationIdentifierSet(allApplicationsRef.current);
          for (const appName of appNames) {
            const isValid = validSet.has(normalizeApplicationLookupValue(appName));
            const displayName = getAppDisplayName(appName);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:3px;white-space:nowrap;cursor:pointer;padding:1px 2px;border-radius:3px;';
            row.addEventListener('mouseenter', () => { row.style.background = '#f0f5ff'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
            row.addEventListener('click', (e) => {
              e.stopPropagation();
              setSelectedApp({ name: appName, taskName: el.businessObject.name || el.id, taskId: el.id });
            });
            row.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              e.stopPropagation();
              showAppActionMenu(appName, el, m, e.clientX, e.clientY);
            });
            const icon = document.createElement('span');
            icon.innerHTML = COMPUTER_ICON;
            icon.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:${isValid ? '#1677ff' : DARK_ORANGE};flex-shrink:0;`;
            const label = document.createElement('span');
            label.textContent = displayName;
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

      function removeAppActionMenu() {
        if (appActionMenuRef.current) {
          appActionMenuRef.current.remove();
          appActionMenuRef.current = null;
        }
      }

      function showAppActionMenu(appName: string, element: any, m: any, clientX: number, clientY: number) {
        removeAppActionMenu();
        const displayName = getAppDisplayName(appName);

        const menu = document.createElement('div');
        menu.style.cssText = `
          position: fixed;
          left: ${clientX}px;
          top: ${clientY}px;
          z-index: 100000;
          min-width: 180px;
          background: #fff;
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          box-shadow: 0 6px 16px rgba(0,0,0,.15);
          padding: 6px;
          font-family: 'IBM Plex Sans', Arial, sans-serif;
          font-size: 12px;
        `;

        const title = document.createElement('div');
        title.textContent = displayName;
        title.style.cssText = 'padding:6px 8px;color:#6b7280;border-bottom:1px solid #f0f0f0;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        menu.appendChild(title);

        const makeItem = (label: string, onClick: () => void) => {
          const item = document.createElement('div');
          item.textContent = label;
          item.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer;';
          item.addEventListener('mouseenter', () => { item.style.background = '#f0f5ff'; });
          item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeAppActionMenu();
            onClick();
          });
          return item;
        };

        menu.appendChild(makeItem('Edit applications', () => showAppPopover(element, m)));
        menu.appendChild(makeItem('Servers', () => { void loadServersForApp(appName, element.id); }));
        menu.appendChild(makeItem('Databases', () => { void loadDatabasesForApp(appName, element.id); }));

        document.body.appendChild(menu);
        appActionMenuRef.current = menu;

        const closeOnOutside = (ev: MouseEvent) => {
          if (!menu.contains(ev.target as Node)) {
            removeAppActionMenu();
            document.removeEventListener('mousedown', closeOnOutside, true);
          }
        };
        setTimeout(() => document.addEventListener('mousedown', closeOnOutside, true), 0);
      }

      function showAppPopover(element: any, m: any) {
        removeAppPopover();
        const canvas = m.get('canvas');
        const viewbox = canvas.viewbox();
        const containerRect = canvas.getContainer().getBoundingClientRect();
        const ex = (element.x + element.width / 2 - viewbox.x) * viewbox.scale + containerRect.left;
        const ey = (element.y + element.height - viewbox.y) * viewbox.scale + containerRect.top + 8;

        const bo = element.businessObject;
        const availableApps = allApplicationsRef.current
          .map((app) => {
            const identifier = getPreferredApplicationIdentifier(app);
            if (!identifier) return null;
            return {
              app,
              identifier,
              displayName: getPreferredApplicationDisplayName(app, identifier),
            };
          })
          .filter((entry): entry is { app: ApplicationItem; identifier: string; displayName: string } => !!entry);

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
          const validAppSet = buildExactApplicationIdentifierSet(allApplicationsRef.current);
          for (const appName of apps) {
            const isValid = validAppSet.has(normalizeApplicationLookupValue(appName));
            const displayName = getAppDisplayName(appName);
            const tag = document.createElement('span');
            tag.style.cssText = isValid
              ? 'display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e6f4ff;color:#1677ff;border:1px solid #91caff;border-radius:4px;font-size:11px;'
              : `display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#fff7e6;color:${DARK_ORANGE};border:1px solid ${DARK_ORANGE};border-radius:4px;font-size:11px;`;
            tag.innerHTML = COMPUTER_ICON + ' ' + displayName;
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
          const assigned = new Set(getTaskApps(bo).map((name) => normalizeApplicationLookupValue(name)));
          const lc = filter.toLowerCase();
          const matches = availableApps.filter((entry) => {
            if (assigned.has(normalizeApplicationLookupValue(entry.identifier))) return false;
            return [entry.displayName, entry.identifier, entry.app.name, entry.app.acronym, entry.app.correlationId]
              .map((value) => String(value || '').toLowerCase())
              .some((value) => value.includes(lc));
          }).slice(0, 20);
          if (!matches.length) {
            list.innerHTML = '<div style="padding:4px 8px;color:#999;">No matches</div>';
            return;
          }
          for (const match of matches) {
            const row = document.createElement('div');
            row.textContent = match.displayName;
            row.style.cssText = 'padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            row.addEventListener('mouseenter', () => { row.style.background = '#f0f0ff'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'white'; });
            row.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const current = getTaskApps(bo);
              setTaskApps(bo, [...current, match.identifier], m);
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
        setDiagramSelected(false);
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
      // Right-click on lanes shows actor dropdown directly (no direct editing)
      modeler.on('element.contextmenu', (event: any) => {
        const element = event.element;
        const boType = element?.businessObject?.$type || '';
        if (isActivityType(boType)) {
          event.originalEvent?.preventDefault();
          const directEditing = modeler.get('directEditing');
          directEditing.activate(element);
        } else if (boType === 'bpmn:Lane' || boType === 'bpmn2:Lane') {
          event.originalEvent?.preventDefault();
          // Show actor dropdown directly without activating direct editing
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

          const namesList = actorNamesRef.current;
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
                validateLaneActors(modeler);
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
        validateLaneActors(modeler);
      });

      function removeAutocomplete() {
        if (autocompleteRef.current) {
          autocompleteRef.current.remove();
          autocompleteRef.current = null;
        }
      }

      return () => {
        removeAppActionMenu();
        removeAppPopover();
        removeAutocomplete();
        modeler.destroy();
        modelerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Import XML only when a new diagram is loaded (triggered by importTrigger)
    useEffect(() => {
      const modeler = modelerRef.current;
      if (!modeler) return;
      const source = xmlRef.current || EMPTY_DIAGRAM;
      // Increment version to detect stale imports (prevents race condition)
      const version = ++importVersionRef.current;
      importingRef.current = true;
      modeler.importXML(source).then(async () => {
        // Abort if a newer import was started while this one was in progress
        if (importVersionRef.current !== version) return;
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
        // Validate lane actors against Actor Factory
        validateLaneActors(modeler);
        // Render application overlays
        renderAppOverlaysRef.current();
        // Only now allow commandStack changes to propagate to parent
        importingRef.current = false;
      }).catch((err: Error) => {
        if (importVersionRef.current !== version) return;
        importingRef.current = false;
        console.error('[BpmnEditor] Import error:', err.message);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [importTrigger]);

    // Re-render overlays when application reference data loads/changes
    useEffect(() => {
      if (allApplicationNames.length && modelerRef.current) {
        renderAppOverlaysRef.current();
      }
    }, [allApplicationNames, allApplications]);

    // Re-validate task colors when task reference data changes
    useEffect(() => {
      if (allTaskNames.length && modelerRef.current) {
        validateAndColorTasks(modelerRef.current);
      }
    }, [allTaskNames]);

    // Re-validate lane actor colors when actor reference data changes
    useEffect(() => {
      if (allActorNames.length && modelerRef.current) {
        validateLaneActors(modelerRef.current);
      }
    }, [allActorNames]);

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
          const storedNames = (existing.applications || []).map((a: any) => a.name?.trim()).filter(Boolean);
          const mergedNames = mergeTaskApplicationNames(storedNames, appNames);

          if (mergedNames.length !== storedNames.length) {
            const mergedApps = mergedNames.map((name: string) => {
              const app = moddle.create('bpmniq:Application', { name });
              app.$parent = existing;
              return app;
            });
            existing.applications = mergedApps;
          }

          // Legacy text annotations have been absorbed into extension elements.
          const annotEl = elementRegistry.get(annotationId);
          if (annotEl) toRemove.push(annotEl);
          for (const assocEl of associations) {
            const bo = assocEl.businessObject;
            if (bo.sourceRef?.id === annotationId || bo.targetRef?.id === annotationId) {
              toRemove.push(assocEl);
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
        for (const el of toRemove) {
          try { modeling.removeElements([el]); } catch { /* ignore */ }
        }
      }

      if (migrated > 0) {
        console.log(`[BpmnEditor] Migrated ${migrated} text annotations to extension elements`);
      }
    }

    // Validate task names against the Task Factory and color deviations
    async function validateAndColorTasks(modeler: any) {
      try {
        const elementRegistry = modeler.get('elementRegistry');

        // Find all task-type elements (Task, UserTask, ServiceTask, etc.)
        const taskElements = elementRegistry.filter((el: any) => {
          const bo = el.businessObject;
          return bo && bo.$type && isActivityType(bo.$type) && bo.name;
        });

        if (!taskElements.length) return;

        const taskNames = taskElements.map((el: any) => el.businessObject.name);
        const { invalid } = await validateTasks(taskNames, diagramNameRef.current || undefined);
        const invalidSet = new Set(invalid.map((n: string) => n.toLowerCase().trim()));
        invalidTaskNamesRef.current = invalidSet;

        // Apply colors via SVG — does NOT touch commandStack, no undo history, no re-render
        for (const el of taskElements) {
          const name = el.businessObject.name.toLowerCase().trim();
          const gfx = elementRegistry.getGraphics(el);
          if (!gfx) continue;
          // Blue outline for all tasks (directly on SVG rect, not via modeling.setColor)
          const rect = gfx.querySelector('.djs-visual rect, .djs-visual path');
          if (rect) (rect as SVGElement).style.stroke = DEFAULT_STROKE;
          // Color the text label orange for invalid tasks
          const textGroup = gfx.querySelector('.djs-label') || gfx.querySelector('text');
          if (textGroup) {
            const texts = (textGroup as Element).tagName === 'text' ? [textGroup as SVGElement] : Array.from((textGroup as Element).querySelectorAll('text')) as SVGElement[];
            texts.forEach((t) => {
              t.style.fill = invalidSet.has(name) ? DARK_ORANGE : '';
            });
          }
        }
        // Color sequence flows, gateways, and events blue via SVG
        const flowElements = elementRegistry.filter((el: any) => {
          const t = el.businessObject?.$type;
          return t && (t.includes('Flow') || t.includes('Gateway') || t.includes('Event'));
        });
        for (const el of flowElements) {
          const gfx = elementRegistry.getGraphics(el);
          if (!gfx) continue;
          const shape = gfx.querySelector('.djs-visual rect, .djs-visual path, .djs-visual circle, .djs-visual polygon, .djs-visual polyline');
          if (shape) (shape as SVGElement).style.stroke = DEFAULT_STROKE;
        }
      } catch {
        // Validation is best-effort; don't break the editor
      }
    }

    function validateLaneActors(modeler: any) {
      try {
        const names = actorNamesRef.current;
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
            // Color the lane label text orange if not a known actor
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

    const validAppSet = buildExactApplicationIdentifierSet(allApplications);
    const isSelectedAppValid = selectedApp ? validAppSet.has(normalizeApplicationLookupValue(selectedApp.name)) : true;
    const isSelectedTaskValid = selectedTask ? !invalidTaskNamesRef.current.has(selectedTask.name.toLowerCase().trim()) : true;
    const validActorSet = new Set(allActorNames.map((n) => n.toLowerCase().trim()));
    const isSelectedLaneValid = selectedLane ? validActorSet.has(selectedLane.name.toLowerCase().trim()) : true;
    const diagramNameColor = (diagramStatus || '').toLowerCase() === 'invalid' ? '#cc7000' : '#000000';

    return (
      <div className="flex h-full w-full overflow-hidden relative">
        {diagramName && !editingDiagramName && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setDiagramSelected(true);
              setSelectedTask(null);
              setSelectedLane(null);
              setSelectedApp(null);
              onDiagramNameClick?.();
            }}
            onDoubleClick={() => {
              if (canEditDiagramName && onDiagramNameChange) {
                setEditNameValue(diagramName);
                setEditingDiagramName(true);
              }
            }}
            title={canEditDiagramName ? 'Click for properties, double-click to edit name' : 'Click for properties'}
          >
            <div className={`bg-white/90 backdrop-blur-sm border rounded-md px-5 py-2 shadow-sm ${isInFactory ? 'border-gray-200' : 'border-orange-300'}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {diagramBreadcrumb && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400, letterSpacing: '0.02em', marginBottom: 2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 480 }}>
                  {diagramBreadcrumb}
                </div>
              )}
              <span className="text-xl font-bold" style={{ color: diagramNameColor, textAlign: 'center' }}>{diagramName}</span>
            </div>
          </div>
        )}
        {editingDiagramName && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
            <div className="bg-white border border-blue-400 rounded-md px-3 py-1.5 shadow-md flex items-center gap-2">
              <input
                className="text-xl font-bold text-gray-700 border-none outline-none bg-transparent min-w-[200px]"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = editNameValue.trim();
                    if (trimmed) onDiagramNameChange?.(trimmed);
                    setEditingDiagramName(false);
                  } else if (e.key === 'Escape') {
                    setEditingDiagramName(false);
                  }
                }}
                onBlur={() => {
                  const trimmed = editNameValue.trim();
                  if (trimmed) onDiagramNameChange?.(trimmed);
                  setEditingDiagramName(false);
                }}
                autoFocus
              />
              <span className="text-xs text-gray-400">Enter to save</span>
            </div>
          </div>
        )}
        <div ref={canvasRef} className="bpmn-canvas absolute inset-0" />
        {/* New Diagram button on canvas */}
        {!readOnly && onNewDiagram && (
          <button
            className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-md transition-colors"
            onClick={onNewDiagram}
            title="New Diagram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            New Diagram
          </button>
        )}
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
              display: (selectedApp || selectedTask?.name || selectedLane || diagramSelected) ? 'none' : undefined,
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
        {showProperties && !propsCollapsed && !selectedApp && !selectedTask?.name && !selectedLane && !diagramSelected && (
          <button
            className="absolute top-1 bg-white border border-gray-300 rounded shadow-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 text-xs px-1.5 py-0.5"
            style={{ right: propsWidth + 4, zIndex: 20 }}
            onClick={() => setPropsCollapsed(true)}
            title="Collapse properties panel"
          >
            ▶
          </button>
        )}
        {/* ─── Diagram Properties Panel ─── */}
        {showProperties && !propsCollapsed && diagramSelected && !selectedApp && !selectedTask?.name && !selectedLane && (
          <div className="border-l border-gray-200 bg-white absolute right-0 top-0 bottom-0 z-20 overflow-y-auto"
            style={{ width: propsWidth, fontFamily: '"IBM Plex Sans", Arial, sans-serif' }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded ${isInFactory ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'} flex items-center justify-center`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isInFactory ? '#1677ff' : '#cc7000'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h6"/></svg>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Diagram</div>
                  <div className="font-semibold text-sm" style={{ color: diagramNameColor }}>{diagramName || 'Untitled'}</div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <table className="w-full text-xs">
                  <tbody />
                </table>
              </div>
              {isAlreadyLoaded && (
                <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1.5">
                  <p className="text-xs text-orange-600 mb-1">This diagram already exists in the factory. Choose an action:</p>
                  <button
                    className="w-full text-xs py-1.5 px-3 rounded border text-left flex items-center gap-1.5 border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700"
                    onClick={() => onDeleteAndReload?.()}
                    title="Delete the existing factory entry and reload from this file"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Delete &amp; Reload →
                  </button>
                  <div className="flex gap-1 mt-1">
                    <input
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-orange-400"
                      placeholder="New name…"
                      value={newDiagramName}
                      onChange={e => setNewDiagramName(e.target.value)}
                    />
                    <button
                      className="text-xs py-1 px-2 rounded border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 whitespace-nowrap"
                      onClick={() => { if (newDiagramName.trim()) { onSaveAsNew?.(newDiagramName.trim()); setNewDiagramName(''); } }}
                      disabled={!newDiagramName.trim()}
                      title="Save a renamed copy in draft state"
                    >
                      Save as New →
                    </button>
                  </div>
                </div>
              )}
              {!isInFactory && !isAlreadyLoaded && (
                <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1.5">
                  <button
                    className="w-full text-xs py-1.5 px-3 rounded border text-left flex items-center gap-1.5 border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700"
                    onClick={() => onAddToFactory?.()}
                    title="Save this diagram to MongoDB"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    Save to MongoDB →
                  </button>
                </div>
              )}
              {isInFactory && (
                <div className="border-t border-gray-100 mt-3 pt-3 flex flex-col gap-1.5">
                  <button
                    className="w-full text-xs py-1.5 px-3 rounded border text-left flex items-center gap-1.5 border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                    onClick={() => onNavigateToFactory?.('diagramFactory', diagramName || '', 'view')}
                    title="View in BPMN Factory"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h6"/></svg>
                    View in BPMN Factory →
                  </button>
                </div>
              )}
              <button
                className="mt-4 w-full text-xs py-1.5 px-3 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                onClick={() => setDiagramSelected(false)}
              >
                ← Back to Properties
              </button>
            </div>
          </div>
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
                      let actor: string | undefined;
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
                                actor = bo.name;
                                break;
                              }
                            }
                          }
                        }
                      }
                      onNavigateToFactory?.('tasks', selectedTask.name, 'add', { applications: apps.length ? apps : undefined, actor });
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
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Actor / Lane</div>
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
                  onClick={() => onNavigateToFactory?.('actors', selectedLane.name, isSelectedLaneValid ? 'view' : 'add')}
                  title={isSelectedLaneValid ? 'Open in Actor Factory' : 'Add to Actor Factory'}
                >
                  {isSelectedLaneValid
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  }
                  {isSelectedLaneValid ? 'View in Actor Factory →' : 'Add to Actor Factory →'}
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
                  <div className="font-semibold text-sm" style={{ color: isSelectedAppValid ? '#333' : '#cc7000' }}>{getAppDisplayName(selectedApp.name)}</div>
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
                  onClick={async () => {
                    const exactMatch = getAppMeta(selectedApp.name);
                    if (exactMatch) {
                      onNavigateToFactory?.('applications', getPreferredApplicationIdentifier(exactMatch) || selectedApp.name, 'view');
                      return;
                    }

                    const resolvedApp = await ensureResolvedDiagramApplication(selectedApp.name, selectedApp.taskId);
                    if (resolvedApp) {
                      onNavigateToFactory?.('applications', getPreferredApplicationIdentifier(resolvedApp) || selectedApp.name, 'view');
                      return;
                    }

                    onNavigateToFactory?.('applications', selectedApp.name, 'add');
                  }}
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

        <Modal
          title={`Associated Servers${serverModalAppName ? ` - ${serverModalAppName}` : ''}`}
          open={serverModalOpen}
          onCancel={() => setServerModalOpen(false)}
          footer={null}
          width={1200}
          destroyOnClose
        >
          <div className="grid grid-cols-12 gap-3" style={{ minHeight: 520 }}>
            <div className="col-span-4 border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">Servers ({serverList.length})</div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {serverListLoading ? (
                  <div className="p-4 text-sm text-gray-500">Loading servers...</div>
                ) : !serverList.length ? (
                  <div className="p-4 text-sm text-gray-500">No servers associated with this application.</div>
                ) : (
                  serverList.map((server) => (
                    <button
                      key={server._id}
                      className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-blue-50 ${selectedServerId === server._id ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedServerId(server._id)}
                    >
                      <div className="text-sm font-medium text-gray-800">{server.name}</div>
                      <div className="text-xs text-gray-500">{server.hostName || server.ipAddress || server.fqdn || 'No host identifier'}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="col-span-8 border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">Server Properties</div>
              <div className="p-3" style={{ maxHeight: 480, overflowY: 'auto' }}>
                {selectedServerLoading ? (
                  <div className="text-sm text-gray-500">Loading properties...</div>
                ) : !selectedServer ? (
                  <div className="text-sm text-gray-500">Select a server to view properties.</div>
                ) : (
                  <>
                    <div className="text-base font-semibold text-gray-800">{selectedServer.name}</div>
                    <div className="text-xs text-gray-500 mb-3">{selectedServer.hostName || selectedServer.ipAddress || selectedServer.fqdn || 'No host identifier'}</div>

                    <div className="mb-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Health Notes</div>
                      {selectedServer.healthNotes?.length ? (
                        <div className="space-y-2">
                          {selectedServer.healthNotes.map((note, idx) => (
                            <div key={`${note.label}-${idx}`} className="border border-gray-200 rounded p-2 bg-gray-50">
                              <div className="flex items-center gap-2 mb-1">
                                <Tag color={note.severity === 'critical' ? 'red' : note.severity === 'high' ? 'volcano' : note.severity === 'medium' ? 'gold' : 'blue'}>{note.label}</Tag>
                                {note.severity ? <span className="text-xs text-gray-500">{note.severity}</span> : null}
                              </div>
                              <div className="text-xs text-gray-700">{note.note}</div>
                              {note.rationale ? <div className="text-xs text-gray-500 mt-1">Why: {note.rationale}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-gray-500">No health notes</div>}
                    </div>

                    <div className="mb-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Linked Applications</div>
                      {selectedServer.linkedApplications?.length ? (
                        <div className="space-y-1">
                          {selectedServer.linkedApplications.map((app, idx) => (
                            <div key={`${app.name || app.correlationId || 'app'}-${idx}`} className="text-xs text-gray-700 border border-gray-200 rounded px-2 py-1 bg-gray-50">
                              {[(app.acronym || '').trim() || app.name, app.relationType, app.correlationId && !isKeyLikeString(String(app.correlationId)) ? `(${app.correlationId})` : ''].filter(Boolean).join(' ')}
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-gray-500">No linked applications</div>}
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Other Properties</div>
                      <table className="w-full text-xs border border-gray-200">
                        <tbody>
                          {Object.entries(selectedServer)
                            .filter(([key, value]) => key !== 'healthNotes' && key !== 'linkedApplications' && !(typeof value === 'string' && isKeyLikeString(value)))
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, value]) => (
                              <tr key={key} className="border-t border-gray-200">
                                <td className="w-1/3 px-2 py-1 text-gray-500 align-top">{toLabel(key)}</td>
                                <td className="px-2 py-1 text-gray-700 align-top">{renderServerValue(value)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>

        <Modal
          title={`Associated Databases${databaseModalAppName ? ` - ${databaseModalAppName}` : ''}`}
          open={databaseModalOpen}
          onCancel={() => setDatabaseModalOpen(false)}
          footer={null}
          width={1200}
          destroyOnClose
        >
          <div className="grid grid-cols-12 gap-3" style={{ minHeight: 520 }}>
            <div className="col-span-4 border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">Databases ({databaseList.length})</div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {databaseListLoading ? (
                  <div className="p-4 text-sm text-gray-500">Loading databases...</div>
                ) : !databaseList.length ? (
                  <div className="p-4 text-sm text-gray-500">No databases associated with this application.</div>
                ) : (
                  databaseList.map((database) => (
                    <button
                      key={database._id}
                      className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-blue-50 ${selectedDatabaseId === database._id ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedDatabaseId(database._id)}
                    >
                      <div className="text-sm font-medium text-gray-800">{database.name}</div>
                      <div className="text-xs text-gray-500">{database.databaseClassName || database.normalizedVendor || database.version || 'No class metadata'}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="col-span-8 border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">Database Properties</div>
              <div className="p-3" style={{ maxHeight: 480, overflowY: 'auto' }}>
                {selectedDatabaseLoading ? (
                  <div className="text-sm text-gray-500">Loading properties...</div>
                ) : !selectedDatabase ? (
                  <div className="text-sm text-gray-500">Select a database to view properties.</div>
                ) : (
                  <>
                    <div className="text-base font-semibold text-gray-800">{selectedDatabase.name}</div>
                    <div className="text-xs text-gray-500 mb-3">{[selectedDatabase.databaseClassName, selectedDatabase.normalizedVendor || selectedDatabase.vendor, selectedDatabase.version].filter(Boolean).join(' | ') || 'No database metadata'}</div>

                    <div className="mb-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Health Notes</div>
                      {selectedDatabase.healthNotes?.length ? (
                        <div className="space-y-2">
                          {selectedDatabase.healthNotes.map((note, idx) => (
                            <div key={`${note.label}-${idx}`} className="border border-gray-200 rounded p-2 bg-gray-50">
                              <div className="flex items-center gap-2 mb-1">
                                <Tag color={note.severity === 'critical' ? 'red' : note.severity === 'high' ? 'volcano' : note.severity === 'medium' ? 'gold' : 'blue'}>{note.label}</Tag>
                                {note.severity ? <span className="text-xs text-gray-500">{note.severity}</span> : null}
                              </div>
                              <div className="text-xs text-gray-700">{note.note}</div>
                              {note.rationale ? <div className="text-xs text-gray-500 mt-1">Why: {note.rationale}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-gray-500">No health notes</div>}
                    </div>

                    <div className="mb-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Linked Applications</div>
                      {selectedDatabase.linkedApplications?.length ? (
                        <div className="space-y-1">
                          {selectedDatabase.linkedApplications.map((app, idx) => (
                            <div key={`${app.name || app.correlationId || 'app'}-${idx}`} className="text-xs text-gray-700 border border-gray-200 rounded px-2 py-1 bg-gray-50">
                              {[app.acronym || app.name, app.serviceName, app.correlationId && !isKeyLikeString(String(app.correlationId)) ? `(${app.correlationId})` : ''].filter(Boolean).join(' ')}
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-gray-500">No linked applications</div>}
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Other Properties</div>
                      <table className="w-full text-xs border border-gray-200">
                        <tbody>
                          {Object.entries(selectedDatabase)
                            .filter(([key, value]) => key !== 'healthNotes' && key !== 'linkedApplications' && !(typeof value === 'string' && isKeyLikeString(value)))
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, value]) => (
                              <tr key={key} className="border-t border-gray-200">
                                <td className="w-1/3 px-2 py-1 text-gray-500 align-top">{toLabel(key)}</td>
                                <td className="px-2 py-1 text-gray-700 align-top">{renderDatabaseValue(value)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      </div>
    );
  },
);

BpmnEditor.displayName = 'BpmnEditor';
export default BpmnEditor;
