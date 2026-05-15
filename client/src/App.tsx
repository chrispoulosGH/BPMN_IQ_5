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
} from '@ant-design/icons';
import BpmnEditor, { EMPTY_DIAGRAM, type BpmnEditorHandle } from './components/BpmnEditor';
import DiagramList from './components/DiagramList';
import SaveModal from './components/SaveModal';
import CapabilityMatchPanel from './components/CapabilityMatchPanel';
import TaskFactory from './components/TaskFactory';
import { getDiagram, createDiagram, updateDiagram, saveFile, matchCapabilities, getTaskReference } from './api';
import type { CapabilityMatch } from './types';

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

  // Load all application names for the assignment popover
  useEffect(() => {
    getTaskReference().then((ref) => {
      setAllAppNames(ref.applications.map((a: any) => a.name).sort());
    }).catch(() => {});
  }, []);

  const handleXmlChange = useCallback((xml: string) => {
    setCurrentXml(xml);
    setIsDirty(true);
  }, []);

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
          const created = await createDiagram({ name, description, tags, xml: currentXmlRef.current, capabilities: selectedCapsRef.current });
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
                {activeDiagram?.name || activeFileName}
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
                label: <span><PartitionOutlined /> BPMN Factory</span>,
                children: <BpmnEditor
                  ref={editorRef}
                  xml={currentXml}
                  onXmlChange={handleXmlChange}
                  allApplicationNames={allAppNames}
                />,
              },
              {
                key: 'tasks',
                label: <span><AppstoreOutlined /> Task Factory</span>,
                children: <TaskFactory />,
              },
            ]}
          />
        </Content>

        {/* ─── Right Sidebar ──────────────────────────────── */}
        <Sider
          width={320}
          className="sidebar-panel"
          breakpoint="lg"
          collapsedWidth={0}
          trigger={null}
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* ─ File Actions Card ─ */}
            <Card
              size="small"
              className="sidebar-card !mb-3"
              title={
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FolderOpenOutlined className="text-green-500" /> Local Files
                </span>
              }
            >
              <Space direction="vertical" className="w-full" size="small">
                <Button
                  block
                  icon={<UploadOutlined />}
                  onClick={handleUploadLocal}
                  className="!text-left"
                >
                  Open .bpmn from computer
                </Button>
                <Button
                  block
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadLocal}
                  className="!text-left"
                >
                  Download .bpmn to computer
                </Button>
                <Button
                  block
                  icon={<SaveOutlined />}
                  onClick={handleSaveToServer}
                  className="!text-left"
                >
                  Save to server directory
                </Button>
              </Space>
            </Card>

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
      </Layout>

      {/* ─── Modals ───────────────────────────────────────── */}
      <SaveModal
        open={showSaveDb}
        initial={activeDiagram ?? { name: activeFileName?.replace(/\.bpmn$/i, '') || '' }}
        isUpdate={!!activeDiagram?._id}
        defaultChangeNote={activeDiagram?._id ? generateChangeNote(savedXmlRef.current, currentXmlRef.current, savedCapsRef.current, selectedCapsRef.current) : undefined}
        onSave={handleSaveDb}
        onClose={() => setShowSaveDb(false)}
      />
    </Layout>
  );
}
