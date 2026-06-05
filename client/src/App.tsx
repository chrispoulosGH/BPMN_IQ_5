import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Layout,
  Button,
  Space,
  Tooltip,
  Typography,
  Input,
  Card,
  Tabs,
  Modal,
  Select,
  App as AntApp,
  Spin,
  Tag,
} from 'antd';
import {
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  CloudUploadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  PartitionOutlined,
  AppstoreOutlined,
  LaptopOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
  UserOutlined,
  ShoppingOutlined,
  BankOutlined,
  PhoneOutlined,
  GlobalOutlined,
  ApartmentOutlined,
  BranchesOutlined,
  DashboardOutlined,
  FileTextOutlined,
  RightOutlined,
  LeftOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import BpmnEditor, { EMPTY_DIAGRAM, type BpmnEditorHandle } from './components/BpmnEditor';
import DiagramList from './components/DiagramList';
import SaveModal from './components/SaveModal';
import AppMatchModal, { computeAppMatches, type AppMatchResult } from './components/AppMatchModal';
import CapabilityMatchPanel from './components/CapabilityMatchPanel';
import TaskFactory from './components/TaskFactory';
import ReferenceFactory from './components/ReferenceFactory';
import ApplicationFactory from './components/ApplicationFactory';
import ServerFactory from './components/ServerFactory';
import DatabaseFactory from './components/DatabaseFactory';
import NeighborhoodFactory from './components/NeighborhoodFactory';
import BusinessFlowFactory from './components/BusinessFlowFactory';
import CapabilitiesFactory from './components/CapabilitiesFactory';
import ActorFactory from './components/ActorFactory';
import BpmnFactory from './components/BpmnFactory';
import Dashboard from './components/Dashboard';
import ReportsPanel from './components/ReportsPanel';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import { encodeExactFactorySearch } from './utils/factorySearch';
import { getDiagram, getDiagrams, searchDiagrams, createDiagram, updateDiagram, deleteDiagram, saveFile, matchCapabilities, getTaskReference, getTaskNames, getActors, checkSession, logout, setSessionExpiredHandler, getBusinessFlowMap, getFactoryNeighborhoods, setApiNeighborhoodScope } from './api';
import type { CapabilityMatch, TaskAddData, DiagramMetadata, ApplicationItem, FactoryNeighborhoodSummary } from './types';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

/** Renders a non-interactive narrow spacer between tab groups */
const tabGroupSep = (key: string, _label: string) => ({
  key,
  disabled: true,
  children: null as any,
  label: <span style={{ display: 'inline-block', width: 4 }} />,
});

interface ActiveDiagram {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  status?: string | null;
  /** 'db' = loaded from DB; 'local-match' = local file whose BF name already exists in DB */
  source?: 'db' | 'local-match';
}

function extractTaskNames(xml: string): string[] {
  const tasks: string[] = [];
  const regex = /<bpmn2?:(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subProcess)[^>]*name="([^"]+)"/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    tasks.push(match[1]);
  }
  return tasks;
}

function extractApplicationsFromXml(xml: string): string[] {
  const apps: string[] = [];
  // Source: bpmniq:application elements
  const appRegex = /<(?:bpmniq|ns\d+):application>[\s\S]*?<(?:bpmniq|ns\d+):name>([\s\S]*?)<\/(?:bpmniq|ns\d+):name>[\s\S]*?<\/(?:bpmniq|ns\d+):application>/gi;
  let m;
  while ((m = appRegex.exec(xml)) !== null) {
    const name = m[1].trim();
    if (name && !apps.includes(name)) apps.push(name);
  }
  return apps;
}

/** Parse metadata from `<bpmndi:BPMNDiagram ... name="...">` attribute */
function extractDiagramMetadata(xml: string): DiagramMetadata {
  const meta: DiagramMetadata = {};
  const match = /<bpmndi:BPMNDiagram[^>]+name="([^"]+)"/i.exec(xml);
  if (!match) return meta;
  const pairs = match[1].split('|').map((s) => s.trim());
  for (const pair of pairs) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim().toLowerCase();
    const value = pair.slice(idx + 1).trim();
    if (!value) continue;
    if (key === 'line of business') meta.lineOfBusiness = value;
    else if (key === 'channel') meta.channel = value;
    else if (key === 'domain') meta.domain = value;
    else if (key === 'subdomain') meta.subdomain = value;
    else if (key === 'product') meta.product = value;
    else if (key === 'business flow') meta.businessFlow = value;
  }
  return meta;
}

function generateChangeNote(
  savedXml: string,
  currentXml: string,
  savedCaps: CapabilityMatch[],
  selectedCaps: CapabilityMatch[],
): string {
  const changes: string[] = [];

  // Detect capability changes
  const savedCapIds = new Set(savedCaps.map((c) => c.capabilityId));
  const currentCapIds = new Set(selectedCaps.map((c) => c.capabilityId));
  const addedCaps = selectedCaps.filter((c) => !savedCapIds.has(c.capabilityId));
  const removedCaps = savedCaps.filter((c) => !currentCapIds.has(c.capabilityId));
  if (addedCaps.length) changes.push(`Added capabilities: ${addedCaps.map((c) => c.capabilityName).join(', ')}`);
  if (removedCaps.length) changes.push(`Removed capabilities: ${removedCaps.map((c) => c.capabilityName).join(', ')}`);

  // Detect task changes in XML
  const savedTasks = extractTaskNames(savedXml);
  const currentTasks = extractTaskNames(currentXml);
  const savedTaskSet = new Set(savedTasks);
  const currentTaskSet = new Set(currentTasks);
  const addedTasks = currentTasks.filter((t) => !savedTaskSet.has(t));
  const removedTasks = savedTasks.filter((t) => !currentTaskSet.has(t));
  if (addedTasks.length) changes.push(`Added tasks: ${addedTasks.join(', ')}`);
  if (removedTasks.length) changes.push(`Removed tasks: ${removedTasks.join(', ')}`);

  // Detect XML change (flow modified) if tasks are the same but XML differs
  if (!addedTasks.length && !removedTasks.length && savedXml !== currentXml && savedXml !== EMPTY_DIAGRAM) {
    changes.push('Modified diagram flow');
  }

  return changes.length ? changes.join('; ') : 'Updated diagram';
}

export default function App() {
  const { message } = AntApp.useApp();

  // Auth state
  const [authUser, setAuthUser] = useState<{ _id: string; userId: string; displayName: string; role?: string | null; capabilities?: { function: string; permission: string }[] } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Check session on mount
  useEffect(() => {
    checkSession()
      .then((data) => {
        if (data.authenticated && data.user) setAuthUser(data.user);
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  // Register session expired handler
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAuthUser(null);
    });
  }, []);

  const handleLogin = (user: { _id: string; userId: string; displayName: string; role?: string | null; capabilities?: { function: string; permission: string }[] }) => {
    setAuthUser(user);
  };

  const handleLogout = async () => {
    await logout().catch(() => {});
    setAuthUser(null);
  };

  // Show loading while checking session
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" tip="Loading..." />
      </div>
    );
  }

  // Show login when not authenticated
  if (!authUser) {
    return <Login onLogin={handleLogin} />;
  }

  return <AuthenticatedApp user={authUser} onLogout={handleLogout} />;
}

function AuthenticatedApp({ user, onLogout }: { user: { _id: string; userId: string; displayName: string; role?: string | null; capabilities?: { function: string; permission: string }[] }; onLogout: () => void }) {
  const { message } = AntApp.useApp();
  const DEFAULT_NEIGHBORHOOD_NAME = 'AT&T Journey';
  const CURRENT_USER = user.userId;
  const hasAdminAccess = user.capabilities?.some(c => c.function === 'Admin') ?? false;
  const readOnly = !(user.capabilities?.some(c => c.permission !== 'Read'));
  const [showAdmin, setShowAdmin] = useState(false);
  const [neighborhoodTabs, setNeighborhoodTabs] = useState<FactoryNeighborhoodSummary[]>([]);
  const [activeNeighborhoodTab, setActiveNeighborhoodTab] = useState<string>(DEFAULT_NEIGHBORHOOD_NAME);
  const [loadingNeighborhoodTabs, setLoadingNeighborhoodTabs] = useState(false);

  const renderScrollablePane = (child: React.ReactNode) => (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
      {child}
    </div>
  );

  // Tab state — three separate levels
  const [activeOuterTab, setActiveOuterTab] = useState<string>('analytics');   // outer: analytics | bpmn | neighborhoods
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<string>('dashboard'); // inner Analytics sub-tabs
  const [activeTab, setActiveTab] = useState<string>('diagramFactory');        // inner Factories sub-tabs

  // Factory tab drag-to-reorder
  const FACTORY_TAB_KEYS = ['diagramFactory','tasks','applications','servers','databases','capabilities','actors','businessFlows','products','linesOfBusiness','channels','domains','subdomains'];
  const [factoryTabOrder, setFactoryTabOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bpmniq_factory_tab_order');
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        // Ensure all current keys are present (handles new tabs added after save)
        const merged = [...parsed.filter(k => FACTORY_TAB_KEYS.includes(k)), ...FACTORY_TAB_KEYS.filter(k => !parsed.includes(k))];
        return merged;
      }
    } catch { /* ignore */ }
    return FACTORY_TAB_KEYS;
  });

  useEffect(() => {
    try { localStorage.setItem('bpmniq_factory_tab_order', JSON.stringify(factoryTabOrder)); } catch { /* ignore */ }
  }, [factoryTabOrder]);
  const factoryDragKeyRef = useRef<string | null>(null);
  const factoryDropSideRef = useRef<'before' | 'after'>('after');
  const [factoryDropTarget, setFactoryDropTarget] = useState<{ key: string; side: 'before' | 'after' } | null>(null);

  const loadNeighborhoodTabs = useCallback(async () => {
    setLoadingNeighborhoodTabs(true);
    try {
      const data = await getFactoryNeighborhoods();
      setNeighborhoodTabs(data);
      setActiveNeighborhoodTab((current) => {
        if (current && data.some((item) => item.name === current)) return current;
        if (data.some((item) => item.name === DEFAULT_NEIGHBORHOOD_NAME)) return DEFAULT_NEIGHBORHOOD_NAME;
        return data[0]?.name ?? DEFAULT_NEIGHBORHOOD_NAME;
      });
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message || 'Failed to load neighborhoods');
    } finally {
      setLoadingNeighborhoodTabs(false);
    }
  }, [DEFAULT_NEIGHBORHOOD_NAME, message]);

  useEffect(() => {
    loadNeighborhoodTabs();
  }, [loadNeighborhoodTabs]);

  useEffect(() => {
    setApiNeighborhoodScope(activeNeighborhoodTab);
  }, [activeNeighborhoodTab]);

  const fTabLabel = useCallback((key: string, content: React.ReactNode): React.ReactNode => (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; factoryDragKeyRef.current = key; }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (factoryDragKeyRef.current === key) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const side: 'before' | 'after' = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
        factoryDropSideRef.current = side;
        setFactoryDropTarget(prev => (prev?.key === key && prev?.side === side) ? prev : { key, side });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFactoryDropTarget(prev => prev?.key === key ? null : prev);
        }
      }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        const from = factoryDragKeyRef.current;
        const side = factoryDropSideRef.current;
        setFactoryDropTarget(null);
        factoryDragKeyRef.current = null;
        if (!from || from === key) return;
        setFactoryTabOrder(prev => {
          const fi = prev.indexOf(from);
          if (fi === -1) return prev;
          const next = [...prev];
          next.splice(fi, 1);
          const ti = next.indexOf(key);
          if (ti === -1) return prev;
          next.splice(side === 'before' ? ti : ti + 1, 0, from);
          return next;
        });
      }}
      onDragEnd={() => { setFactoryDropTarget(null); factoryDragKeyRef.current = null; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, cursor: 'grab', userSelect: 'none',
        borderLeft: factoryDropTarget?.key === key && factoryDropTarget.side === 'before' ? '3px solid #4f46e5' : '3px solid transparent',
        borderRight: factoryDropTarget?.key === key && factoryDropTarget.side === 'after' ? '3px solid #4f46e5' : '3px solid transparent',
        padding: '0 2px',
        transition: 'border-color 0.08s',
      }}
    >
      {content}
    </div>
  ), [factoryDropTarget]);

  // Editor state
  const [currentXml, setCurrentXml] = useState<string>(EMPTY_DIAGRAM);
  const [importTrigger, setImportTrigger] = useState(0);
  const [activeDiagram, setActiveDiagram] = useState<ActiveDiagram | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [canvasDiagramName, setCanvasDiagramName] = useState<string | null>(null);
  const [showNewDiagramPrompt, setShowNewDiagramPrompt] = useState(false);

  // Sidebar
  const [refreshTick, setRefreshTick] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightWidth, setRightWidth] = useState(320);
  const rightResizing = useRef(false);
  const rightStartX = useRef(0);
  const rightStartW = useRef(320);

  // Canvas diagram search
  const [canvasDiagramOptions, setCanvasDiagramOptions] = useState<{ value: string; label: string; desc?: string }[]>([]);
  const canvasSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tab group labels — measured from DOM after render
  const tabNavWrapRef = useRef<HTMLDivElement>(null);
  const [groupLabels, setGroupLabels] = useState<{ left: number; width: number; label: string; color: string; keys: string[] }[]>([]);
  useEffect(() => {
    const measure = () => {
      const wrap = tabNavWrapRef.current;
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      if (!wr.width) return;
      const span = (a: string, b: string) => {
        const fa = wrap.querySelector(`[data-node-key="${a}"]`);
        const lb = wrap.querySelector(`[data-node-key="${b}"]`);
        if (!fa || !lb) return null;
        const ra = fa.getBoundingClientRect(), rb = lb.getBoundingClientRect();
        return { left: ra.left - wr.left, width: rb.right - ra.left };
      };
      const next = [
        { s: span('bpmn', 'bpmn'),                keys: ['bpmn'],                                                                                                               label: 'Canvas',    color: '#0891b2' },
        { s: span('diagramFactory', 'subdomains'), keys: ['diagramFactory','tasks','applications','servers','databases','capabilities','actors','businessFlows','products','linesOfBusiness','channels','domains','subdomains'], label: 'Neighborhoods', color: '#4f46e5' },
        { s: span('dashboard', 'reports'),         keys: ['dashboard','reports'],                                                                                               label: 'Analytics', color: '#d97706' },
      ].filter(g => g.s).map(g => ({ ...g.s!, label: g.label, color: g.color, keys: g.keys }));
      setGroupLabels(next);
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (tabNavWrapRef.current) obs.observe(tabNavWrapRef.current);
    return () => obs.disconnect();
  }, []);

  // Modals
  const [showSaveDb, setShowSaveDb] = useState(false);

  // Capability matching
  const [capMatches, setCapMatches] = useState<CapabilityMatch[]>([]);
  const [capLoading, setCapLoading] = useState(false);
  const [selectedCaps, setSelectedCaps] = useState<CapabilityMatch[]>([]);
  const [capError, setCapError] = useState<string | null>(null);
  const [savedCaps, setSavedCaps] = useState<CapabilityMatch[]>([]);
  const savedXmlRef = useRef<string>(EMPTY_DIAGRAM);
  const currentXmlRef = useRef<string>(currentXml);
  const savedCapsRef = useRef<CapabilityMatch[]>([]);
  const selectedCapsRef = useRef<CapabilityMatch[]>([]);

  // Application names for the assignment popover
  const [allAppNames, setAllAppNames] = useState<string[]>([]);
  const [allApplications, setAllApplications] = useState<ApplicationItem[]>([]);
  const [allBusinessFlowNames, setAllBusinessFlowNames] = useState<string[]>([]);
  // Task names for validity checks
  const [allTaskNames, setAllTaskNames] = useState<string[]>([]);
  // Actor names for lane validation
  const [allActorNames, setAllActorNames] = useState<string[]>([]);
  // Diagram metadata (parsed from BPMNDiagram name attribute)
  const [diagramMeta, setDiagramMeta] = useState<DiagramMetadata>({});

  // Factory navigation (from diagram links)
  const [factorySearch, setFactorySearch] = useState<Record<string, string>>({});
  const [factoryAdd, setFactoryAdd] = useState<Record<string, string | TaskAddData>>({});
  const [clickedCapabilityNames, setClickedCapabilityNames] = useState<string[]>([]);

  // Selected task in diagram (for right sidebar link)
  const [selectedDiagramTask, setSelectedDiagramTask] = useState<{ name: string; id: string } | null>(null);

  // Fuzzy matching
  const [showAppMatch, setShowAppMatch] = useState(false);
  const [appMatchResults, setAppMatchResults] = useState<AppMatchResult[]>([]);
  const [showTaskMatch, setShowTaskMatch] = useState(false);
  const [taskMatchResults, setTaskMatchResults] = useState<AppMatchResult[]>([]);

  const canEditCurrentDiagramName = !readOnly && (!activeDiagram || (activeDiagram.status || '').toLowerCase() === 'draft');
  const canSaveCurrentDiagramToDb = currentXml !== EMPTY_DIAGRAM;

  const editorRef = useRef<BpmnEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep refs in sync with state for use in callbacks/modals
  currentXmlRef.current = currentXml;
  savedCapsRef.current = savedCaps;
  selectedCapsRef.current = selectedCaps;

  // Detect unsaved capability changes
  const capsChanged = (() => {
    if (selectedCaps.length !== savedCaps.length) return true;
    const savedIds = new Set(savedCaps.map((c) => c.capabilityId));
    return selectedCaps.some((c) => !savedIds.has(c.capabilityId));
  })();
  const hasUnsavedChanges = isDirty || capsChanged;
  const quickSaveLabel = activeDiagram ? 'Quick save current diagram to MongoDB' : 'Save current diagram to MongoDB';
  const getBpmnRibbonGroups = () => [
    {
      key: 'file',
      title: 'File',
      actions: [
        { key: 'open', tooltip: 'Open BPMN file', icon: <UploadOutlined />, onClick: handleUploadLocal },
        { key: 'download', tooltip: 'Download BPMN file', icon: <DownloadOutlined />, onClick: handleDownloadLocal },
        { key: 'save-server', tooltip: 'Save BPMN file to server', icon: <SaveOutlined />, onClick: handleSaveToServer, disabled: readOnly },
        {
          key: 'quick-save-db',
          tooltip: quickSaveLabel,
          icon: <CloudUploadOutlined />,
          onClick: handleQuickSaveDb,
          disabled: readOnly || !canSaveCurrentDiagramToDb,
          type: hasUnsavedChanges && activeDiagram ? 'primary' : 'text',
        },
        {
          key: 'save-db',
          tooltip: 'Open save to MongoDB dialog',
          icon: <DatabaseOutlined />,
          onClick: () => setShowSaveDb(true),
          disabled: readOnly || !canSaveCurrentDiagramToDb,
        },
      ],
    },
    {
      key: 'view',
      title: 'View',
      actions: [
        { key: 'zoom-in', tooltip: 'Zoom in', icon: <ZoomInOutlined />, onClick: () => editorRef.current?.zoomIn() },
        { key: 'zoom-out', tooltip: 'Zoom out', icon: <ZoomOutOutlined />, onClick: () => editorRef.current?.zoomOut() },
        { key: 'fit', tooltip: 'Fit diagram to view', icon: <ExpandOutlined />, onClick: () => editorRef.current?.fitViewport() },
      ],
    },
    {
      key: 'resolve',
      title: 'Resolve',
      actions: [
        { key: 'match-apps', tooltip: 'Match applications to reference data', icon: <LaptopOutlined />, onClick: runAppFuzzyMatch },
        { key: 'match-tasks', tooltip: 'Match tasks to reference data', icon: <AppstoreOutlined />, onClick: runTaskFuzzyMatch },
      ],
    },
  ] as const;

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Load all application and task names for validity checks
  const refreshReferenceData = useCallback(() => {
    getTaskReference().then((ref) => {
      setAllApplications(ref.applications || []);
      setAllAppNames((ref.applications || []).map((a: any) => a.name).sort());
      setAllBusinessFlowNames((ref.businessFlows || []).map((flow: any) => flow.name).filter(Boolean).sort());
    }).catch(() => {});
    getTaskNames().then((names) => {
      setAllTaskNames(names);
    }).catch(() => {});
    getActors().then((actors) => {
      setAllActorNames(actors.map((p) => p.name));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshReferenceData();
  }, [refreshReferenceData]);

  // Navigate from diagram panel to a factory tab
  const handleNavigateToFactory = useCallback((tab: string, searchTerm: string, mode: 'view' | 'add' = 'view', extra?: { applications?: string[]; actor?: string }) => {
    if (mode === 'add') {
      if (tab === 'tasks') {
        // Use the current diagram name (renamed or DB name) as businessFlow, not the annotation value
        const currentBusinessFlow = activeDiagram?.name || canvasDiagramName || diagramMeta.businessFlow;
        setFactoryAdd((prev) => ({ ...prev, [tab]: { name: searchTerm, ...diagramMeta, ...extra, ...(currentBusinessFlow ? { businessFlow: currentBusinessFlow } : {}) } }));
      } else {
        setFactoryAdd((prev) => ({ ...prev, [tab]: searchTerm }));
      }
      setFactorySearch((prev) => ({ ...prev, [tab]: '' }));
    } else {
      setFactorySearch((prev) => ({ ...prev, [tab]: encodeExactFactorySearch(searchTerm) }));
      setFactoryAdd((prev) => ({ ...prev, [tab]: '' }));
    }
    setActiveOuterTab('neighborhoods');
    setActiveTab(tab);
  }, [diagramMeta, activeDiagram, canvasDiagramName]);

  const handleCapabilityClick = useCallback((_capability: CapabilityMatch, nextSelected: CapabilityMatch[]) => {
    const rawName = nextSelected[nextSelected.length - 1]?.capabilityName || '';
    const levels = rawName
      .split(/[>,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Prefer segment with the highest explicit numeric level marker (e.g. L3, Level 3).
    // Fallback to the deepest/right-most segment when no numeric marker exists.
    let clickedName = levels[levels.length - 1] || rawName;
    let maxLevel = -1;
    for (const segment of levels) {
      const m = segment.match(/(?:^|\b)(?:l|level)\s*(\d+)(?:\b|$)/i) || segment.match(/^(\d+)(?:[.)\-\s]|$)/);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxLevel) {
        maxLevel = n;
        clickedName = segment;
      }
    }

    clickedName = clickedName
      .replace(/^(?:l|level)\s*\d+\s*[:)\-\.]?\s*/i, '')
      .replace(/^\d+[.)\-\s]+/, '')
      .trim() || clickedName;

    setClickedCapabilityNames([]);
    setFactorySearch((prev) => ({ ...prev, capabilities: clickedName }));
    setActiveOuterTab('neighborhoods');
    setActiveTab('capabilities');
  }, []);

  const handleXmlChange = useCallback((xml: string) => {
    currentXmlRef.current = xml;
    setIsDirty(true);
  }, []);

  // Lightweight dirty signal from canvas edits (drag, property changes, etc.)
  // Does NOT export XML — avoids React re-render interfering with bpmn-js rendering
  const handleEditorDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  // ─── Fuzzy Matching ─────────────────────────────────────────

  /** Trigger fuzzy match on current diagram's applications */
  const runAppFuzzyMatch = useCallback(async () => {
    const xml = await editorRef.current?.getXml() || currentXmlRef.current;
    const apps = extractApplicationsFromXml(xml);
    if (!apps.length) {
      message.info('No applications found in the current diagram');
      return;
    }
    if (!allApplications.length) {
      message.warning('Application reference data not loaded');
      return;
    }
    const results = computeAppMatches(apps, allApplications);
    const fuzzy = results.filter((r) => !r.exact);
    if (!fuzzy.length) {
      message.success('All applications already match reference data');
      return;
    }
    setAppMatchResults(fuzzy);
    setShowAppMatch(true);
  }, [allApplications, message]);

  /** Handle approved application matches */
  const handleAppMatchApprove = useCallback(async (approved: AppMatchResult[]) => {
    setShowAppMatch(false);
    if (!approved.length) return;
    const replacements = new Map(approved.map((r) => [r.original.toLowerCase().trim(), r.refMatch!]));
    await editorRef.current?.replaceAppNames(replacements);
    message.success(`Replaced ${replacements.size} application name(s) with reference data`);
  }, [message]);

  /** Trigger fuzzy match on current diagram's task names */
  const runTaskFuzzyMatch = useCallback(async () => {
    const xml = await editorRef.current?.getXml() || currentXmlRef.current;
    const tasks = extractTaskNames(xml);
    if (!tasks.length) {
      message.info('No tasks found in the current diagram');
      return;
    }
    // Resolve the current business flow name to scope the reference list
    const currentFlow = activeDiagram?.name || canvasDiagramName || diagramMeta.businessFlow;
    let refNames: string[];
    if (currentFlow) {
      refNames = await getTaskNames(currentFlow);
      if (!refNames.length) {
        message.warning(`No tasks in factory for business flow "${currentFlow}"`);
        return;
      }
    } else {
      refNames = allTaskNames;
      if (!refNames.length) {
        message.warning('Task reference data not loaded');
        return;
      }
    }
    const results = computeAppMatches(tasks, refNames);
    const fuzzy = results.filter((r) => !r.exact);
    if (!fuzzy.length) {
      message.success('All task names already match reference data');
      return;
    }
    setTaskMatchResults(fuzzy);
    setShowTaskMatch(true);
  }, [activeDiagram, canvasDiagramName, diagramMeta.businessFlow, allTaskNames, message]);

  /** Handle approved task matches */
  const handleTaskMatchApprove = useCallback(async (approved: AppMatchResult[]) => {
    setShowTaskMatch(false);
    if (!approved.length) return;
    const replacements = new Map(approved.map((r) => [r.original, r.refMatch!]));
    await editorRef.current?.replaceTaskNames(replacements);
    message.success(`Replaced ${replacements.size} task name(s) with reference data`);
  }, [message]);

  // ─── Capability Matching ────────────────────────────────────
  const runCapabilityMatch = useCallback(
    async (_xml: string) => {
      setCapLoading(true);
      setCapMatches([]);
      setSelectedCaps([]);
      setCapError(null);

      // TODO: Remove hardcoded mock once OPENAI_API_KEY is configured
      const mockMatches: CapabilityMatch[] = [
        { capabilityId: 1, capabilityName: 'Service Problem Management', confidence: 95, justification: 'Process directly handles fault detection, diagnosis, and resolution of service issues reported by customers.' },
        { capabilityId: 2, capabilityName: 'Customer Interaction Management', confidence: 88, justification: 'Customer contact centre receives and manages inbound trouble reports and communicates resolution updates.' },
        { capabilityId: 3, capabilityName: 'Resource Work Order Management', confidence: 85, justification: 'Field technician dispatch and work order lifecycle for physical network resource repair.' },
        { capabilityId: 4, capabilityName: 'Service Fulfillment Management', confidence: 78, justification: 'Service restoration activities ensure contracted service levels are re-established after faults.' },
        { capabilityId: 5, capabilityName: 'Customer Assurance Management', confidence: 72, justification: 'End-to-end assurance of customer experience through proactive monitoring and SLA tracking.' },
      ];

      setTimeout(() => {
        setCapMatches(mockMatches);
        // Keep only already-saved caps selected; new matches require user click
        setSelectedCaps(savedCapsRef.current);
        setCapLoading(false);
        message.success(`Matched ${mockMatches.length} capabilities`);
      }, 800);
    },
    [message],
  );

  // ─── File System Operations ─────────────────────────────────
  const handleUploadLocal = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const xml = ev.target?.result as string;
        const meta = extractDiagramMetadata(xml);
        setCurrentXml(xml);
        setImportTrigger(t => t + 1);
        setDiagramMeta(meta);
        setActiveFileName(file.name);
        setCanvasDiagramName(null); // will use meta.businessFlow via diagramName prop
        setIsDirty(false);
        // Check if this diagram already exists in the factory (match by business flow name)
        const bfName = meta.businessFlow || file.name.replace(/\.(bpmn|xml)$/i, '');
        try {
          const flowMap = await getBusinessFlowMap();
          const existingId = flowMap[bfName];
          if (existingId) {
            setActiveDiagram({ _id: existingId, name: bfName, description: '', tags: [], source: 'local-match' });
          } else {
            setActiveDiagram(null);
          }
        } catch {
          setActiveDiagram(null);
        }
        message.success(`Opened: ${file.name}`);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [message],
  );

  const handleDownloadLocal = useCallback(async () => {
    const xml = await editorRef.current?.getXml() || currentXmlRef.current;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFileName || `${activeDiagram?.name || 'diagram'}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Downloaded to your computer');
  }, [activeFileName, activeDiagram, message]);

  const handleSaveToServer = useCallback(async () => {
    const filename = activeFileName || `${activeDiagram?.name || 'diagram'}.bpmn`;
    try {
      const xml = await editorRef.current?.getXml() || currentXmlRef.current;
      const result = await saveFile(filename.replace('.bpmn', ''), xml);
      message.success(`Saved to server: ${result.filename}`);
      setActiveFileName(result.filename);
      refresh();
    } catch (err: any) {
      message.error(err.message);
    }
  }, [activeFileName, activeDiagram, message, refresh]);

  // ─── MongoDB Operations ─────────────────────────────────────
  const handleSelectDiagram = useCallback(
    async (id: string) => {
      try {
        const diagram = await getDiagram(id);
        setActiveDiagram({
          _id: diagram._id,
          name: diagram.name,
          description: diagram.description,
          tags: diagram.tags,
          status: diagram.status,
          source: 'db',
        });
        setCurrentXml(diagram.xml);
        setImportTrigger(t => t + 1);
        setDiagramMeta(extractDiagramMetadata(diagram.xml));
        savedXmlRef.current = diagram.xml;
        setActiveFileName(null);
        setCanvasDiagramName(null);
        setIsDirty(false);
        message.success(`Loaded from DB: ${diagram.name}`);
        // Show previously assigned capabilities (not as matches)
        setCapMatches([]);
        setCapError(null);
        if (diagram.capabilities?.length) {
          setSelectedCaps(diagram.capabilities);
          setSavedCaps(diagram.capabilities);
        } else {
          setSelectedCaps([]);
          setSavedCaps([]);
        }
      } catch (err: any) {
        message.error(err.message);
      }
    },
    [message],
  );

  const openDiagramInCanvas = useCallback(
    async (id: string) => {
      setActiveOuterTab('bpmn');
      await handleSelectDiagram(id);
    },
    [handleSelectDiagram],
  );

  const handleDiagramDeleted = useCallback(
    (deletedId: string) => {
      if (activeDiagram?._id !== deletedId) return;
      setActiveDiagram(null);
      setCurrentXml(EMPTY_DIAGRAM);
      setImportTrigger((t) => t + 1);
      setDiagramMeta({});
      setActiveFileName(null);
      setCanvasDiagramName(null);
      setIsDirty(false);
      setCapMatches([]);
      setSelectedCaps([]);
      setSavedCaps([]);
      message.info('Diagram deleted. Canvas reset to blank.');
    },
    [activeDiagram, message],
  );

  // Canvas tab diagram search handler
  const handleCanvasDiagramSearch = useCallback((value: string) => {
    if (canvasSearchTimer.current) clearTimeout(canvasSearchTimer.current);
    if (!value.trim()) {
      // Load all diagrams when search is empty
      getDiagrams().then((data) => {
        setCanvasDiagramOptions(data.map((d) => ({
          value: d._id,
          label: d.name,
          desc: [d.businessFlow, d.status, d.lineOfBusiness].filter(Boolean).join(' · '),
        })));
      }).catch(() => {});
      return;
    }
    canvasSearchTimer.current = setTimeout(() => {
      searchDiagrams(value.trim()).then((results) => {
        setCanvasDiagramOptions(results.map((d) => ({
          value: d._id,
          label: d.name,
          desc: [d.businessFlow, d.status, d.lineOfBusiness].filter(Boolean).join(' · '),
        })));
      }).catch(() => {});
    }, 300);
  }, []);

  const handleDeleteCapability = useCallback(
    async (capabilityId: number) => {
      const removed = selectedCaps.find((c) => c.capabilityId === capabilityId);
      const remaining = selectedCaps.filter((c) => c.capabilityId !== capabilityId);
      setSelectedCaps(remaining);
      setSavedCaps(remaining);
      if (activeDiagram?._id) {
        try {
          await updateDiagram(activeDiagram._id, {
            capabilities: remaining,
            changeNote: { userId: CURRENT_USER, note: `Removed capability: ${removed?.capabilityName || capabilityId}` },
          });
          message.success('Capability removed');
        } catch (err: any) {
          message.error(`Failed to remove: ${err.message}`);
        }
      }
    },
    [selectedCaps, activeDiagram, message],
  );

  const handleSaveDb = useCallback(
    async ({ name, description, tags, changeNote }: { name: string; description: string; tags: string[]; changeNote?: string }) => {
      try {
        const latestXml = await editorRef.current?.getXml() || currentXmlRef.current;
        currentXmlRef.current = latestXml;
        if (activeDiagram?._id) {
          const autoNote = changeNote || generateChangeNote(savedXmlRef.current, latestXml, savedCapsRef.current, selectedCapsRef.current);
          const updated = await updateDiagram(activeDiagram._id, {
            name,
            description,
            tags,
            xml: latestXml,
            capabilities: selectedCapsRef.current,
            changeNote: { userId: CURRENT_USER, note: autoNote },
            updatedBy: CURRENT_USER,
          });
          setActiveDiagram({
            _id: updated._id,
            name: updated.name,
            description: updated.description,
            tags: updated.tags,
            status: updated.status,
            source: 'db',
          });
          setSavedCaps(selectedCapsRef.current);
          message.success(`Updated in DB: ${updated.name}`);
        } else {
          const created = await createDiagram({ name, description, tags, xml: latestXml, capabilities: selectedCapsRef.current, createdBy: CURRENT_USER, sourcedFrom: activeFileName || undefined });
          setActiveDiagram({
            _id: created._id,
            name: created.name,
            description: created.description,
            tags: created.tags,
            status: created.status,
            source: 'db',
          });
          setSavedCaps(selectedCapsRef.current);
          message.success(`Saved to DB: ${created.name}`);
        }
        setIsDirty(false);
        setCapMatches([]);
        savedXmlRef.current = latestXml;
        editorRef.current?.validateTasks();
        refresh();
        setShowSaveDb(false);
      } catch (err: any) {
        message.error(err.message);
      }
    },
    [activeDiagram, message, refresh, activeFileName],
  );

  const handleQuickSaveDb = useCallback(async () => {
    if (!activeDiagram?._id) {
      setShowSaveDb(true);
      return;
    }
    // Get latest XML from the editor
    const latestXml = await editorRef.current?.getXml() || currentXmlRef.current;
    currentXmlRef.current = latestXml;
    // Auto-generate change note from diffs (use refs for always-current values)
    let noteValue = generateChangeNote(savedXmlRef.current, latestXml, savedCapsRef.current, selectedCapsRef.current);
    Modal.confirm({
      title: 'Change Note',
      content: (
        <Input.TextArea
          rows={3}
          defaultValue={noteValue}
          onChange={(e) => { noteValue = e.target.value; }}
          placeholder="Describe what changed…"
        />
      ),
      okText: 'Save',
      onOk: () => handleSaveDb({
        name: activeDiagram.name,
        description: activeDiagram.description,
        tags: activeDiagram.tags,
        changeNote: noteValue,
      }),
    });
  }, [activeDiagram, handleSaveDb]);

  // New diagram — show name prompt
  const handleNew = useCallback(() => {
    setShowNewDiagramPrompt(true);
  }, []);

  const handleNewDiagramConfirm = useCallback((name: string) => {
    setActiveDiagram(null);
    setActiveFileName(null);
    setCanvasDiagramName(name);
    setCurrentXml(EMPTY_DIAGRAM);
    setImportTrigger(t => t + 1);
    setDiagramMeta({});
    setIsDirty(false);
    setCapMatches([]);
    setSelectedCaps([]);
    setShowNewDiagramPrompt(false);
  }, []);

  // Rename diagram
  const handleRenameDiagram = useCallback(async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setEditingName(false); return; }
    if (activeDiagram?._id && (activeDiagram.status || '').toLowerCase() !== 'draft') {
      message.warning('Set the diagram status to Draft before renaming it.');
      setEditingName(false);
      return;
    }
    if (activeDiagram?._id) {
      try {
        await updateDiagram(activeDiagram._id, { name: trimmed });
        setActiveDiagram((prev) => prev ? { ...prev, name: trimmed } : prev);
        refresh();
        message.success('Diagram renamed');
      } catch (e: any) {
        message.error(e.response?.data?.error || e.message);
      }
    }
    setEditingName(false);
  }, [activeDiagram, message, refresh]);

  return (
    <Layout className="h-screen overflow-hidden">
      {/* Hidden file input for local upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".bpmn,.xml"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* ─── Header ─────────────────────────────────────── */}
      <Header className="app-header">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Title level={4} className="!text-white !m-0 !font-semibold tracking-tight">
              BPMN IQ
            </Title>
            <span className="version-badge">2.0</span>
          </div>
          {(activeDiagram || activeFileName) && (
            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-600">
              {activeDiagram ? (
                <DatabaseOutlined className="text-blue-400 text-xs" />
              ) : (
                <FolderOpenOutlined className="text-green-400 text-xs" />
              )}
              {editingName && activeDiagram ? (
                <Input
                  size="small"
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onPressEnter={() => handleRenameDiagram(nameInput)}
                  onBlur={() => handleRenameDiagram(nameInput)}
                  style={{ width: 200 }}
                  className="!bg-gray-700 !text-white !border-blue-400"
                />
              ) : (
                <Text
                  className="!text-gray-300 text-sm cursor-pointer hover:!text-white"
                  onClick={() => {
                    if (activeDiagram && !readOnly) {
                      if (!canEditCurrentDiagramName) return;
                      setNameInput(activeDiagram.name);
                      setEditingName(true);
                    }
                  }}
                  title={activeDiagram && canEditCurrentDiagramName ? 'Click to rename' : activeDiagram && !readOnly ? 'Set status to Draft to rename' : undefined}
                >
                  {activeDiagram?.name || activeFileName}
                </Text>
              )}
              {isDirty && <span className="dirty-indicator" />}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <Space size={4} className="toolbar-actions">
          <div className="toolbar-divider" />

          <Tooltip title={`Signed in as ${user.userId}`}>
            <span className="text-gray-400 text-xs mr-1"><UserOutlined /> {user.userId}</span>
          </Tooltip>
          {hasAdminAccess && (
            <Tooltip title="User Administration">
              <Button type="text" icon={<SettingOutlined />} onClick={() => setShowAdmin(true)} className="toolbar-btn" size="small" />
            </Tooltip>
          )}
          <Tooltip title="Sign out">
            <Button type="text" icon={<LogoutOutlined />} onClick={onLogout} className="toolbar-btn" size="small" />
          </Tooltip>
        </Space>
      </Header>

      <Layout className="flex-1 overflow-hidden">
        {/* ─── BPMN Canvas (takes all space, toolbox on left edge) ─── */}
        <Content className="bpmn-content">
          <Tabs
            activeKey={activeOuterTab}
            onChange={setActiveOuterTab}
            type="card"
            size="small"
            className="factory-tabs"
            destroyInactiveTabPane={false}
            renderTabBar={(props, DefaultBar) => (
              <div ref={tabNavWrapRef} style={{ background: '#f1f5f9', borderBottom: '1px solid #d1d9e0' }}>
                <DefaultBar {...props} />
              </div>
            )}
            items={[
              {
                key: 'analytics',
                label: <span><DashboardOutlined /> Analytics</span>,
                children: (
                  <Tabs
                    className="factory-tabs"
                    defaultActiveKey="dashboard"
                    activeKey={activeAnalyticsTab}
                    onChange={setActiveAnalyticsTab}
                    items={[
                      {
                        key: 'dashboard',
                        label: <span><DashboardOutlined /> Dashboards</span>,
                        children: <Dashboard />,
                      },
                      {
                        key: 'reports',
                        label: <span><FileTextOutlined /> Reports</span>,
                        children: <ReportsPanel />,
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'bpmn',
                label: <span><PartitionOutlined /> BPMN Canvas</span>,
                children: (
                  <div className="flex h-full w-full min-h-0">
                    <div className="bpmn-ribbon w-[92px] shrink-0 px-2 py-3 overflow-y-auto">
                      <div className="flex flex-col gap-3">
                        {getBpmnRibbonGroups().map((group) => (
                          <div key={group.key} className="bpmn-ribbon-group px-2 py-2">
                            <div className="bpmn-ribbon-title mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em]">{group.title}</div>
                            <div className="flex flex-col items-center gap-1.5">
                              {group.actions.map((action) => (
                                <Tooltip key={action.key} title={action.tooltip} placement="right">
                                  <Button
                                    type={action.type ?? 'text'}
                                    icon={action.icon}
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                    className="bpmn-ribbon-btn flex h-9 w-9 items-center justify-center rounded-lg border-0"
                                  />
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 min-w-0 relative">
                      <BpmnEditor
                        ref={editorRef}
                        xml={currentXml}
                        importTrigger={importTrigger}
                        onXmlChange={handleXmlChange}
                        onDirty={handleEditorDirty}
                        allApplicationNames={allAppNames}
                        allApplications={allApplications}
                        allBusinessFlowNames={allBusinessFlowNames}
                        allTaskNames={allTaskNames}
                        allActorNames={allActorNames}
                        diagramName={activeDiagram?.name || canvasDiagramName || diagramMeta.businessFlow || activeFileName?.replace(/\.bpmn$/i, '') || undefined}
                        diagramStatus={activeDiagram?.status || null}
                        diagramBreadcrumb={(() => {
                          const parts = [
                            diagramMeta.lineOfBusiness,
                            diagramMeta.channel,
                            diagramMeta.product,
                            diagramMeta.domain,
                            diagramMeta.subdomain,
                            diagramMeta.businessFlow,
                          ].filter(Boolean);
                          return parts.length > 1 ? parts.join(' | ') : undefined;
                        })()}
                        canEditDiagramName={canEditCurrentDiagramName}
                        isInFactory={activeDiagram?.source === 'db'}
                        isAlreadyLoaded={activeDiagram?.source === 'local-match'}
                        readOnly={readOnly}
                        onNavigateToFactory={handleNavigateToFactory}
                        onTaskSelect={setSelectedDiagramTask}
                        onAddToFactory={() => setShowSaveDb(true)}
                        onDeleteAndReload={async () => {
                          if (!activeDiagram?._id) return;
                          try {
                            await deleteDiagram(activeDiagram._id);
                            const xml = await editorRef.current?.getXml() || currentXmlRef.current;
                            const meta = extractDiagramMetadata(xml);
                            const diagramName = meta.businessFlow || activeDiagram.name;
                            const created = await createDiagram({ name: diagramName, xml, status: 'staged', createdBy: user.userId });
                            setActiveDiagram({ _id: created._id, name: created.name, description: created.description || '', tags: created.tags || [], status: created.status, source: 'db' });
                            refresh();
                            message.success(`Replaced: ${created.name}`);
                          } catch (err: any) { message.error(err.message); }
                        }}
                        onSaveAsNew={async (newName: string) => {
                          try {
                            const xml = await editorRef.current?.getXml() || currentXmlRef.current;
                            const created = await createDiagram({ name: newName, xml, status: 'draft', createdBy: user.userId });
                            setActiveDiagram({ _id: created._id, name: created.name, description: created.description || '', tags: created.tags || [], status: created.status, source: 'db' });
                            refresh();
                            message.success(`Saved as new: ${created.name}`);
                          } catch (err: any) { message.error(err.message); }
                        }}
                        onNewDiagram={handleNew}
                        onDiagramNameChange={async (name) => {
                          const trimmed = name.trim();
                          if (!trimmed) return;
                          if (activeDiagram?._id) {
                            await handleRenameDiagram(trimmed);
                            return;
                          }
                          setCanvasDiagramName(trimmed);
                          try {
                            const flowMap = await getBusinessFlowMap();
                            const existingId = flowMap[trimmed];
                            if (existingId) {
                              setActiveDiagram({ _id: existingId, name: trimmed, description: '', tags: [], source: 'local-match' });
                            } else {
                              setActiveDiagram(null);
                            }
                          } catch {
                            setActiveDiagram(null);
                          }
                        }}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'neighborhoods',
                label: <span><ShoppingOutlined /> Neighborhoods</span>,
                children: loadingNeighborhoodTabs ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <Spin size="large" tip="Loading neighborhoods..." />
                  </div>
                ) : (
                  <Tabs
                    activeKey={activeNeighborhoodTab}
                    onChange={setActiveNeighborhoodTab}
                    items={(neighborhoodTabs.length ? neighborhoodTabs : [{ name: DEFAULT_NEIGHBORHOOD_NAME, factoryCount: 0 } as FactoryNeighborhoodSummary]).map((neighborhood) => ({
                      key: neighborhood.name,
                      label: `${neighborhood.name}${typeof neighborhood.factoryCount === 'number' ? ` (${neighborhood.factoryCount})` : ''}`,
                      children: (
                        <div className="flex h-full min-h-0 flex-col">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #dbe3ec', background: '#f8fafc' }}>
                            <Tag color="blue" style={{ marginInlineEnd: 0 }}>Neighborhood Scope</Tag>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{neighborhood.name}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>All factory data in this view is filtered to the selected neighborhood.</span>
                            <div style={{ marginLeft: 'auto' }}>
                              <NeighborhoodFactory
                                canManageFactories={hasAdminAccess}
                                fixedNeighborhoodName={neighborhood.name}
                                onNeighborhoodsChanged={loadNeighborhoodTabs}
                                mode="action"
                              />
                            </div>
                          </div>
                          <Tabs
                            className="factory-tabs"
                            defaultActiveKey="diagramFactory"
                            activeKey={activeTab}
                            onChange={setActiveTab}
                            items={[
                      {
                        key: 'diagramFactory',
                        label: fTabLabel('diagramFactory', <><DatabaseOutlined /> BPMN Factory</>),
                        children: renderScrollablePane(
                          <BpmnFactory defaultSearch={factorySearch.diagramFactory} onOpenDiagram={openDiagramInCanvas} onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} readOnly={readOnly} refreshTick={refreshTick} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'tasks',
                        label: fTabLabel('tasks', <><AppstoreOutlined /> Task Factory</>),
                        children: renderScrollablePane(
                          <TaskFactory defaultSearch={factorySearch.tasks} defaultAddData={typeof factoryAdd.tasks === 'object' ? factoryAdd.tasks as TaskAddData : factoryAdd.tasks ? { name: factoryAdd.tasks } : undefined} onItemAdded={refreshReferenceData} onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'applications',
                        label: fTabLabel('applications', <><LaptopOutlined /> Application Factory</>),
                        children: renderScrollablePane(
                          <ApplicationFactory defaultSearch={factorySearch.applications} defaultAdd={typeof factoryAdd.applications === 'string' ? factoryAdd.applications : ''} userRole={user.role} readOnly={readOnly} onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} />,
                        ),
                      },
                      {
                        key: 'servers',
                        label: fTabLabel('servers', <><DeploymentUnitOutlined /> Servers Factory</>),
                        children: renderScrollablePane(
                          <ServerFactory defaultSearch={factorySearch.servers} readOnly={readOnly} userRole={user.role} onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} />,
                        ),
                      },
                      {
                        key: 'databases',
                        label: fTabLabel('databases', <><DatabaseOutlined /> DB Factory</>),
                        children: renderScrollablePane(
                          <DatabaseFactory defaultSearch={factorySearch.databases} readOnly={readOnly} userRole={user.role} onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} />,
                        ),
                      },
                      {
                        key: 'capabilities',
                        label: fTabLabel('capabilities', <><ClusterOutlined /> Capability Factory</>),
                        children: renderScrollablePane(
                          <CapabilitiesFactory onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} readOnly={readOnly} userRole={user.role} defaultSearch={factorySearch.capabilities || ''} />,
                        ),
                      },
                      {
                        key: 'actors',
                        label: fTabLabel('actors', <><UserOutlined /> Actor Factory</>),
                        children: renderScrollablePane(
                          <ActorFactory defaultAdd={typeof factoryAdd.actors === 'string' ? factoryAdd.actors : ''} defaultSearch={factorySearch.actors} onItemAdded={refreshReferenceData} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'businessFlows',
                        label: fTabLabel('businessFlows', <><BranchesOutlined /> Business Flow Factory</>),
                        children: renderScrollablePane(
                          <BusinessFlowFactory defaultSearch={factorySearch.businessFlows} onItemAdded={refreshReferenceData} onOpenDiagram={openDiagramInCanvas} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'products',
                        label: fTabLabel('products', <><ShoppingOutlined /> Product Factory</>),
                        children: renderScrollablePane(
                          <ReferenceFactory collection="products" title="Product" defaultSearch={factorySearch.products} onItemAdded={refreshReferenceData} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'linesOfBusiness',
                        label: fTabLabel('linesOfBusiness', <><BankOutlined /> LOB Factory</>),
                        children: renderScrollablePane(
                          <ReferenceFactory collection="linesOfBusiness" title="Line of Business" defaultSearch={factorySearch.linesOfBusiness} onItemAdded={refreshReferenceData} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'channels',
                        label: fTabLabel('channels', <><PhoneOutlined /> Channel Factory</>),
                        children: renderScrollablePane(
                          <ReferenceFactory collection="channels" title="Channel" defaultSearch={factorySearch.channels} onItemAdded={refreshReferenceData} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'domains',
                        label: fTabLabel('domains', <><GlobalOutlined /> Domain Factory</>),
                        children: renderScrollablePane(
                          <ReferenceFactory collection="domains" title="Domain" defaultSearch={factorySearch.domains} onItemAdded={refreshReferenceData} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                      {
                        key: 'subdomains',
                        label: fTabLabel('subdomains', <><ApartmentOutlined /> Subdomain Factory</>),
                        children: renderScrollablePane(
                          <ReferenceFactory collection="subdomains" title="Subdomain" defaultSearch={factorySearch.subdomains} onItemAdded={refreshReferenceData} readOnly={readOnly} userRole={user.role} />,
                        ),
                      },
                            ].sort((a, b) => factoryTabOrder.indexOf(a.key) - factoryTabOrder.indexOf(b.key))
                            .flatMap(item => item.key === 'servers' ? [tabGroupSep('sep-factory-servers', 'Servers'), item] : [item])}
                          />
                        </div>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        </Content>

        {/* ─── Right Sidebar ──────────────────────────────── */}
        <Sider
          width={rightCollapsed ? 0 : rightWidth}
          className="sidebar-panel"
          collapsedWidth={0}
          collapsed={rightCollapsed}
          trigger={null}
          style={{ position: 'relative', transition: rightResizing.current ? 'none' : 'width 0.2s' }}
        >
          {/* Resize handle */}
          {!rightCollapsed && (
            <div
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10 }}
              onMouseDown={(e) => {
                e.preventDefault();
                rightResizing.current = true;
                rightStartX.current = e.clientX;
                rightStartW.current = rightWidth;
                const onMove = (ev: MouseEvent) => {
                  const delta = rightStartX.current - ev.clientX;
                  const newW = Math.max(200, Math.min(600, rightStartW.current + delta));
                  setRightWidth(newW);
                };
                const onUp = () => {
                  rightResizing.current = false;
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
          )}
          <div className="flex flex-col h-full overflow-hidden">
            {/* Collapse toggle */}
            <div className="flex justify-end p-1">
              <Button
                size="small"
                type="text"
                icon={<RightOutlined />}
                onClick={() => setRightCollapsed(true)}
                title="Collapse sidebar"
              />
            </div>
            {/* ─ Capability Match Card ─ */}
            <Card
              size="small"
              className="sidebar-card !mb-3"
              title={
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ThunderboltOutlined className="text-purple-500" /> Business Capabilties
                </span>
              }
              extra={
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={capLoading}
                  onClick={() => runCapabilityMatch(currentXml)}
                  disabled={currentXml === EMPTY_DIAGRAM}
                >
                  Match
                </Button>
              }
            >
              <CapabilityMatchPanel
                matches={capMatches}
                loading={capLoading}
                selected={selectedCaps}
                onSelectionChange={setSelectedCaps}
                onCapabilityClick={handleCapabilityClick}
                onDelete={handleDeleteCapability}
                error={capError}
                savedCaps={savedCaps}
              />
            </Card>

            {/* ─ MongoDB Card ─ */}
            <Card
              size="small"
              className="sidebar-card flex-1 !flex !flex-col overflow-hidden"
              title={
                <span className="flex items-center gap-2 text-sm font-medium">
                  <DatabaseOutlined className="text-blue-500" /> MongoDB Diagrams
                </span>
              }
              extra={
                <Button
                  size="small"
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  onClick={() => setShowSaveDb(true)}
                  disabled={readOnly || !canSaveCurrentDiagramToDb}
                >
                  Save
                </Button>
              }
            >
              <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                {/* Search by name */}
                <Input
                  placeholder="Search diagrams by name…"
                  prefix={<SearchOutlined className="!text-gray-400" />}
                  allowClear
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="middle"
                />
                {/* Diagram List */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <DiagramList
                    selectedId={activeDiagram?._id ?? null}
                    onSelect={openDiagramInCanvas}
                    onRefresh={refresh}
                    onDelete={handleDiagramDeleted}
                    refreshTick={refreshTick}
                    searchQuery={searchQuery}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            </Card>
          </div>
        </Sider>
        {rightCollapsed && (
          <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 8 }}>
            <Button
              size="small"
              type="text"
              icon={<LeftOutlined />}
              onClick={() => setRightCollapsed(false)}
              title="Expand sidebar"
            />
          </div>
        )}
      </Layout>

      {/* ─── Modals ───────────────────────────────────────── */}
      <SaveModal
        open={showSaveDb}
        initial={activeDiagram ?? { name: canvasDiagramName || diagramMeta.businessFlow || activeFileName?.replace(/\.bpmn$/i, '') || '' }}
        isUpdate={!!activeDiagram?._id}
        defaultChangeNote={activeDiagram?._id ? generateChangeNote(savedXmlRef.current, currentXmlRef.current, savedCapsRef.current, selectedCapsRef.current) : undefined}
        onSave={handleSaveDb}
        onClose={() => setShowSaveDb(false)}
      />

      {/* Fuzzy Match Modals */}
      <AppMatchModal
        open={showAppMatch}
        matches={appMatchResults}
        title="Application Name Matching"
        onApprove={handleAppMatchApprove}
        onClose={() => setShowAppMatch(false)}
      />
      <AppMatchModal
        open={showTaskMatch}
        matches={taskMatchResults}
        title="Task Name Matching"
        onApprove={handleTaskMatchApprove}
        onClose={() => setShowTaskMatch(false)}
      />

      {/* New Diagram Name Prompt */}
      <Modal
        title="New Diagram"
        open={showNewDiagramPrompt}
        onOk={() => {
          const val = (document.getElementById('new-diagram-name-input') as HTMLInputElement)?.value?.trim();
          if (val) handleNewDiagramConfirm(val);
        }}
        onCancel={() => setShowNewDiagramPrompt(false)}
        okText="Create"
        destroyOnClose
      >
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Diagram Name <span className="text-red-500">*</span></label>
          <Input
            id="new-diagram-name-input"
            placeholder="Enter diagram name"
            autoFocus
            onPressEnter={(e) => {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) handleNewDiagramConfirm(val);
            }}
          />
          <div className="text-xs text-gray-500 mt-1">This name will appear as the diagram title on the canvas.</div>
        </div>
      </Modal>

      {hasAdminAccess && <AdminPanel open={showAdmin} onClose={() => setShowAdmin(false)} />}
    </Layout>
  );
}
