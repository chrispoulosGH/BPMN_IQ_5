import { useState, useRef, useCallback } from 'react';
import {
  Layout,
  Button,
  Space,
  Tooltip,
  Typography,
  Input,
  Card,
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
} from '@ant-design/icons';
import BpmnEditor, { EMPTY_DIAGRAM, type BpmnEditorHandle } from './components/BpmnEditor';
import DiagramList from './components/DiagramList';
import SaveModal from './components/SaveModal';
import CapabilityMatchPanel from './components/CapabilityMatchPanel';
import { getDiagram, createDiagram, updateDiagram, saveFile, matchCapabilities } from './api';
import type { CapabilityMatch } from './types';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

interface ActiveDiagram {
  _id: string;
  name: string;
  description: string;
  tags: string[];
}

export default function App() {
  const { message } = AntApp.useApp();

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

  const editorRef = useRef<BpmnEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const handleXmlChange = useCallback((xml: string) => {
    setCurrentXml(xml);
    setIsDirty(true);
  }, []);

  // ─── Capability Matching ────────────────────────────────────
  const runCapabilityMatch = useCallback(
    async (xml: string) => {
      setCapLoading(true);
      setCapMatches([]);
      setSelectedCaps([]);
      try {
        const result = await matchCapabilities(xml);
        setCapMatches(result.matches);
        // Auto-select all matches by default
        setSelectedCaps(result.matches);
        message.success(`Matched ${result.matches.length} capabilities`);
      } catch (err: any) {
        console.error('Capability match failed:', err);
        message.warning('Capability matching unavailable — check OPENAI_API_KEY');
      } finally {
        setCapLoading(false);
      }
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
        runCapabilityMatch(xml);
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
        setActiveFileName(null);
        setIsDirty(false);
        message.success(`Loaded from DB: ${diagram.name}`);
        // Load saved capabilities or run fresh match
        if (diagram.capabilities?.length) {
          setCapMatches(diagram.capabilities);
          setSelectedCaps(diagram.capabilities);
        } else {
          runCapabilityMatch(diagram.xml);
        }
      } catch (err: any) {
        message.error(err.message);
      }
    },
    [message],
  );

  const handleSaveDb = useCallback(
    async ({ name, description, tags }: { name: string; description: string; tags: string[] }) => {
      try {
        if (activeDiagram?._id) {
          const updated = await updateDiagram(activeDiagram._id, {
            name,
            description,
            tags,
            xml: currentXml,
            capabilities: selectedCaps,
          });
          setActiveDiagram({
            _id: updated._id,
            name: updated.name,
            description: updated.description,
            tags: updated.tags,
          });
          message.success(`Updated in DB: ${updated.name}`);
        } else {
          const created = await createDiagram({ name, description, tags, xml: currentXml, capabilities: selectedCaps });
          setActiveDiagram({
            _id: created._id,
            name: created.name,
            description: created.description,
            tags: created.tags,
          });
          message.success(`Saved to DB: ${created.name}`);
        }
        setIsDirty(false);
        refresh();
        setShowSaveDb(false);
      } catch (err: any) {
        message.error(err.message);
      }
    },
    [activeDiagram, currentXml, message, refresh],
  );

  const handleQuickSaveDb = useCallback(async () => {
    if (!activeDiagram?._id) {
      setShowSaveDb(true);
      return;
    }
    await handleSaveDb({
      name: activeDiagram.name,
      description: activeDiagram.description,
      tags: activeDiagram.tags,
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
              type="text"
              icon={<CloudUploadOutlined />}
              onClick={handleQuickSaveDb}
              className={`toolbar-btn ${isDirty && activeDiagram ? '!text-orange-400' : ''}`}
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
          <BpmnEditor ref={editorRef} xml={currentXml} onXmlChange={handleXmlChange} />
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
            >
              <CapabilityMatchPanel
                matches={capMatches}
                loading={capLoading}
                selected={selectedCaps}
                onSelectionChange={setSelectedCaps}
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
        onSave={handleSaveDb}
        onClose={() => setShowSaveDb(false)}
      />
    </Layout>
  );
}
