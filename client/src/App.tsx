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
} from 'antd';
import {
  PlusOutlined,
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
  UserOutlined,
  ShoppingOutlined,
  BankOutlined,
  PhoneOutlined,
  GlobalOutlined,
  ApartmentOutlined,
  RightOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import BpmnEditor, { EMPTY_DIAGRAM, type BpmnEditorHandle } from './components/BpmnEditor';
import DiagramList from './components/DiagramList';
import SaveModal from './components/SaveModal';
import AppMatchModal, { computeAppMatches, type AppMatchResult } from './components/AppMatchModal';
import CapabilityMatchPanel from './components/CapabilityMatchPanel';
import TaskFactory from './components/TaskFactory';
import ReferenceFactory from './components/ReferenceFactory';
import CapabilitiesFactory from './components/CapabilitiesFactory';
import PersonaFactory from './components/PersonaFactory';
import BpmnFactory from './components/BpmnFactory';
import { getDiagram, getDiagrams, searchDiagrams, createDiagram, updateDiagram, saveFile, matchCapabilities, getTaskReference, getTaskNames, getPersonas } from './api';
import type { CapabilityMatch, TaskAddData, DiagramMetadata } from './types';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

const CURRENT_USER = 'cp1853';

interface ActiveDiagram {
  _id: string;
  name: string;
  description: string;
  tags: string[];
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

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('bpmn');

  // Editor state
  const [currentXml, setCurrentXml] = useState<string>(EMPTY_DIAGRAM);
  const [activeDiagram, setActiveDiagram] = useState<ActiveDiagram | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);

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
  // Task names for validity checks
  const [allTaskNames, setAllTaskNames] = useState<string[]>([]);
  // Persona names for lane validation
  const [allPersonaNames, setAllPersonaNames] = useState<string[]>([]);
  // Diagram metadata (parsed from BPMNDiagram name attribute)
  const [diagramMeta, setDiagramMeta] = useState<DiagramMetadata>({});

  // Factory navigation (from diagram links)
  const [factorySearch, setFactorySearch] = useState<Record<string, string>>({});
  const [factoryAdd, setFactoryAdd] = useState<Record<string, string | TaskAddData>>({});

  // Selected task in diagram (for right sidebar link)
  const [selectedDiagramTask, setSelectedDiagramTask] = useState<{ name: string; id: string } | null>(null);

  // Fuzzy matching
  const [showAppMatch, setShowAppMatch] = useState(false);
  const [appMatchResults, setAppMatchResults] = useState<AppMatchResult[]>([]);
  const [showTaskMatch, setShowTaskMatch] = useState(false);
  const [taskMatchResults, setTaskMatchResults] = useState<AppMatchResult[]>([]);

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

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Load all application and task names for validity checks
  const refreshReferenceData = useCallback(() => {
    getTaskReference().then((ref) => {
      setAllAppNames(ref.applications.map((a: any) => a.name).sort());
    }).catch(() => {});
    getTaskNames().then((names) => {
      setAllTaskNames(names);
    }).catch(() => {});
    getPersonas().then((personas) => {
      setAllPersonaNames(personas.map((p) => p.name));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshReferenceData();
  }, [refreshReferenceData]);

  // Navigate from diagram panel to a factory tab
  const handleNavigateToFactory = useCallback((tab: string, searchTerm: string, mode: 'view' | 'add' = 'view', extra?: { applications?: string[]; persona?: string }) => {
    if (mode === 'add') {
      if (tab === 'tasks') {
        setFactoryAdd((prev) => ({ ...prev, [tab]: { name: searchTerm, ...diagramMeta, ...extra } }));
      } else {
        setFactoryAdd((prev) => ({ ...prev, [tab]: searchTerm }));
      }
      setFactorySearch((prev) => ({ ...prev, [tab]: '' }));
    } else {
      setFactorySearch((prev) => ({ ...prev, [tab]: searchTerm }));
      setFactoryAdd((prev) => ({ ...prev, [tab]: '' }));
    }
    setActiveTab(tab);
  }, [diagramMeta]);

  const handleXmlChange = useCallback((xml: string) => {
    setCurrentXml(xml);
    setIsDirty(true);
  }, []);

  // ─── Fuzzy Matching ─────────────────────────────────────────

  /** Trigger fuzzy match on current diagram's applications */
  const runAppFuzzyMatch = useCallback(() => {
    const apps = extractApplicationsFromXml(currentXml);
    if (!apps.length) {
      message.info('No applications found in the current diagram');
      return;
    }
    if (!allAppNames.length) {
      message.warning('Application reference data not loaded');
      return;
    }
    const results = computeAppMatches(apps, allAppNames);
    const fuzzy = results.filter((r) => !r.exact);
    if (!fuzzy.length) {
      message.success('All applications already match reference data');
      return;
    }
    setAppMatchResults(fuzzy);
    setShowAppMatch(true);
  }, [currentXml, allAppNames, message]);

  /** Handle approved application matches */
  const handleAppMatchApprove = useCallback(async (approved: AppMatchResult[]) => {
    setShowAppMatch(false);
    if (!approved.length) return;
    const replacements = new Map(approved.map((r) => [r.original.toLowerCase().trim(), r.refMatch!]));
    await editorRef.current?.replaceAppNames(replacements);
    message.success(`Replaced ${replacements.size} application name(s) with reference data`);
  }, [message]);

  /** Trigger fuzzy match on current diagram's task names */
  const runTaskFuzzyMatch = useCallback(() => {
    const tasks = extractTaskNames(currentXml);
    if (!tasks.length) {
      message.info('No tasks found in the current diagram');
      return;
    }
    if (!allTaskNames.length) {
      message.warning('Task reference data not loaded');
      return;
    }
    const results = computeAppMatches(tasks, allTaskNames);
    const fuzzy = results.filter((r) => !r.exact);
    if (!fuzzy.length) {
      message.success('All task names already match reference data');
      return;
    }
    setTaskMatchResults(fuzzy);
    setShowTaskMatch(true);
  }, [currentXml, allTaskNames, message]);

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
      reader.onload = (ev) => {
        const xml = ev.target?.result as string;
        setCurrentXml(xml);
        setDiagramMeta(extractDiagramMetadata(xml));
        setActiveDiagram(null);
        setActiveFileName(file.name);
        setIsDirty(false);
        message.success(`Opened: ${file.name}`);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [message],
  );

  const handleDownloadLocal = useCallback(() => {
    const blob = new Blob([currentXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFileName || `${activeDiagram?.name || 'diagram'}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Downloaded to your computer');
  }, [currentXml, activeFileName, activeDiagram, message]);

  const handleSaveToServer = useCallback(async () => {
    const filename = activeFileName || `${activeDiagram?.name || 'diagram'}.bpmn`;
    try {
      const result = await saveFile(filename.replace('.bpmn', ''), currentXml);
      message.success(`Saved to server: ${result.filename}`);
      setActiveFileName(result.filename);
      refresh();
    } catch (err: any) {
      message.error(err.message);
    }
  }, [currentXml, activeFileName, activeDiagram, message, refresh]);

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
        });
        setCurrentXml(diagram.xml);
        setDiagramMeta(extractDiagramMetadata(diagram.xml));
        savedXmlRef.current = diagram.xml;
        setActiveFileName(null);
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
        if (activeDiagram?._id) {
          const autoNote = changeNote || generateChangeNote(savedXmlRef.current, currentXmlRef.current, savedCapsRef.current, selectedCapsRef.current);
          const updated = await updateDiagram(activeDiagram._id, {
            name,
            description,
            tags,
            xml: currentXmlRef.current,
            capabilities: selectedCapsRef.current,
            changeNote: { userId: CURRENT_USER, note: autoNote },
            updatedBy: CURRENT_USER,
          });
          setActiveDiagram({
            _id: updated._id,
            name: updated.name,
            description: updated.description,
            tags: updated.tags,
          });
          setSavedCaps(selectedCapsRef.current);
          message.success(`Updated in DB: ${updated.name}`);
        } else {
          const created = await createDiagram({ name, description, tags, xml: currentXmlRef.current, capabilities: selectedCapsRef.current, createdBy: CURRENT_USER, sourcedFrom: activeFileName || undefined });
          setActiveDiagram({
            _id: created._id,
            name: created.name,
            description: created.description,
            tags: created.tags,
          });
          setSavedCaps(selectedCapsRef.current);
          message.success(`Saved to DB: ${created.name}`);
        }
        setIsDirty(false);
        setCapMatches([]);
        savedXmlRef.current = currentXmlRef.current;
        editorRef.current?.validateTasks();
        refresh();
        setShowSaveDb(false);
      } catch (err: any) {
        message.error(err.message);
      }
    },
    [activeDiagram, message, refresh],
  );

  const handleQuickSaveDb = useCallback(async () => {
    if (!activeDiagram?._id) {
      setShowSaveDb(true);
      return;
    }
    // Auto-generate change note from diffs (use refs for always-current values)
    let noteValue = generateChangeNote(savedXmlRef.current, currentXmlRef.current, savedCapsRef.current, selectedCapsRef.current);
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

  // New diagram
  const handleNew = useCallback(() => {
    setActiveDiagram(null);
    setActiveFileName(null);
    setCurrentXml(EMPTY_DIAGRAM);
    setDiagramMeta({});
    setIsDirty(false);
    setCapMatches([]);
    setSelectedCaps([]);
  }, []);

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
              <Text className="!text-gray-300 text-sm">
                {activeDiagram?.name || diagramMeta.businessFlow || activeFileName}
              </Text>
              {isDirty && <span className="dirty-indicator" />}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <Space size={4} className="toolbar-actions">
          <Tooltip title="New Diagram">
            <Button type="text" icon={<PlusOutlined />} onClick={handleNew} className="toolbar-btn" />
          </Tooltip>

          <div className="toolbar-divider" />

          <Tooltip title="Open .bpmn from computer">
            <Button type="text" icon={<UploadOutlined />} onClick={handleUploadLocal} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Download .bpmn to computer">
            <Button type="text" icon={<DownloadOutlined />} onClick={handleDownloadLocal} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Save .bpmn to server directory">
            <Button type="text" icon={<SaveOutlined />} onClick={handleSaveToServer} className="toolbar-btn" />
          </Tooltip>

          <div className="toolbar-divider" />

          <Tooltip title={activeDiagram ? 'Quick save to MongoDB' : 'Save to MongoDB…'}>
            <Button
              type={hasUnsavedChanges && activeDiagram ? 'primary' : 'default'}
              icon={<CloudUploadOutlined />}
              onClick={handleQuickSaveDb}
              className="toolbar-btn"
            />
          </Tooltip>
          <Tooltip title="Save as new to MongoDB…">
            <Button
              type="text"
              icon={<DatabaseOutlined />}
              onClick={() => setShowSaveDb(true)}
              className="toolbar-btn"
            />
          </Tooltip>

          <div className="toolbar-divider" />

          <Tooltip title="Zoom In">
            <Button type="text" icon={<ZoomInOutlined />} onClick={() => editorRef.current?.zoomIn()} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Zoom Out">
            <Button type="text" icon={<ZoomOutOutlined />} onClick={() => editorRef.current?.zoomOut()} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Fit to View">
            <Button type="text" icon={<ExpandOutlined />} onClick={() => editorRef.current?.fitViewport()} className="toolbar-btn" />
          </Tooltip>

          <div className="toolbar-divider" />

          <Tooltip title="Match Applications to Reference Data">
            <Button type="text" icon={<LaptopOutlined />} onClick={runAppFuzzyMatch} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="Match Task Names to Reference Data">
            <Button type="text" icon={<AppstoreOutlined />} onClick={runTaskFuzzyMatch} className="toolbar-btn" />
          </Tooltip>
        </Space>
      </Header>

      <Layout className="flex-1 overflow-hidden">
        {/* ─── BPMN Canvas (takes all space, toolbox on left edge) ─── */}
        <Content className="bpmn-content">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            size="small"
            className="factory-tabs"
            destroyInactiveTabPane={false}
            items={[
              {
                key: 'bpmn',
                label: <span><PartitionOutlined /> BPMN Canvas</span>,
                children: (
                  <div className="flex flex-col h-full w-full">
                    {/* Diagram search bar */}
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 border-b border-gray-200" style={{ zIndex: 30 }}>
                      <Select
                        showSearch
                        placeholder="Search & load diagram…"
                        suffixIcon={<SearchOutlined />}
                        filterOption={false}
                        onSearch={handleCanvasDiagramSearch}
                        onFocus={() => handleCanvasDiagramSearch('')}
                        onChange={(id: string) => { handleSelectDiagram(id); }}
                        value={activeDiagram?._id || undefined}
                        options={canvasDiagramOptions.map((o) => ({
                          value: o.value,
                          label: (
                            <div>
                              <div className="text-sm font-medium">{o.label}</div>
                              {o.desc && <div className="text-xs text-gray-400">{o.desc}</div>}
                            </div>
                          ),
                        }))}
                        size="small"
                        allowClear
                        onClear={() => { setCanvasDiagramOptions([]); }}
                        style={{ width: 320 }}
                      />
                      {activeDiagram && (
                        <span className="text-xs text-gray-500 ml-2 truncate">{diagramMeta.businessFlow || activeDiagram.name}</span>
                      )}
                    </div>
                    {/* Canvas area */}
                    <div className="flex-1 min-h-0 relative">
                      <BpmnEditor
                        ref={editorRef}
                        xml={currentXml}
                        onXmlChange={handleXmlChange}
                        allApplicationNames={allAppNames}
                        allTaskNames={allTaskNames}
                        allPersonaNames={allPersonaNames}
                        diagramName={diagramMeta.businessFlow || undefined}
                        onNavigateToFactory={handleNavigateToFactory}
                        onTaskSelect={setSelectedDiagramTask}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'diagramFactory',
                label: <span><DatabaseOutlined /> BPMN Factory</span>,
                children: <BpmnFactory onOpenDiagram={(id) => { handleSelectDiagram(id); setActiveTab('bpmn'); }} onNavigateToFactory={(tab, search) => { setFactorySearch((prev) => ({ ...prev, [tab]: search })); setActiveTab(tab); }} />,
              },
              {
                key: 'tasks',
                label: <span><AppstoreOutlined /> Task Factory</span>,
                children: <TaskFactory defaultSearch={factorySearch.tasks} defaultAddData={typeof factoryAdd.tasks === 'object' ? factoryAdd.tasks as TaskAddData : factoryAdd.tasks ? { name: factoryAdd.tasks } : undefined} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'applications',
                label: <span><LaptopOutlined /> Application Factory</span>,
                children: <ReferenceFactory collection="applications" title="Application" defaultSearch={factorySearch.applications} defaultAdd={typeof factoryAdd.applications === 'string' ? factoryAdd.applications : ''} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'capabilities',
                label: <span><ClusterOutlined /> Capability Factory</span>,
                children: <CapabilitiesFactory />,
              },
              {
                key: 'personas',
                label: <span><UserOutlined /> Persona Factory</span>,
                children: <PersonaFactory defaultAdd={typeof factoryAdd.personas === 'string' ? factoryAdd.personas : ''} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'products',
                label: <span><ShoppingOutlined /> Product Factory</span>,
                children: <ReferenceFactory collection="products" title="Product" defaultSearch={factorySearch.products} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'linesOfBusiness',
                label: <span><BankOutlined /> LOB Factory</span>,
                children: <ReferenceFactory collection="linesOfBusiness" title="Line of Business" defaultSearch={factorySearch.linesOfBusiness} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'channels',
                label: <span><PhoneOutlined /> Channel Factory</span>,
                children: <ReferenceFactory collection="channels" title="Channel" defaultSearch={factorySearch.channels} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'domains',
                label: <span><GlobalOutlined /> Domain Factory</span>,
                children: <ReferenceFactory collection="domains" title="Domain" defaultSearch={factorySearch.domains} onItemAdded={refreshReferenceData} />,
              },
              {
                key: 'subdomains',
                label: <span><ApartmentOutlined /> Subdomain Factory</span>,
                children: <ReferenceFactory collection="subdomains" title="Subdomain" defaultSearch={factorySearch.subdomains} onItemAdded={refreshReferenceData} />,
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
                  <ThunderboltOutlined className="text-purple-500" /> GB1029C Capabilities
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
                    onSelect={handleSelectDiagram}
                    onRefresh={refresh}
                    refreshTick={refreshTick}
                    searchQuery={searchQuery}
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
        initial={activeDiagram ?? { name: diagramMeta.businessFlow || activeFileName?.replace(/\.bpmn$/i, '') || '' }}
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
    </Layout>
  );
}
