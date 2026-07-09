import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Col, Descriptions, Divider, Empty, List, Row, Spin, Statistic, Tag, Tooltip, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { getApplicationByCorrelationId, getApplicationDatabases, getApplicationServers, getDashboardLobDrilldownTree, getDatabase, getDatabases, getRefItems, getServers, getServer, getTasks } from '../api';
import type { ApplicationItem, DatabaseItem, RefItem, ServerItem, TaskRecord } from '../types';
import { findExactApplicationMatches } from '../utils/applicationMatching';

interface TreeNode {
  id: string;
  name: string;
  level: string;
  count: number;
  hasChildren?: boolean;
  metadata?: {
    correlationId?: string;
    itemId?: string;
    itemType?: 'server' | 'database';
    applicationNodeId?: string;
  };
  children: TreeNode[];
}

interface TreeResponse {
  levels: string[];
  totalDiagrams: number;
  rootCount: number;
  tree: TreeNode[];
}

type InfrastructureLoadStatus = 'loading' | 'staged' | 'empty' | 'error';

interface SelectedInfrastructure {
  id: string;
  type: 'server' | 'database';
}

interface SelectedFactoryRecord {
  title: string;
  record: Record<string, unknown>;
}

function insertTreeChildrenAtPath(nodes: TreeNode[], path: string[], children: TreeNode[]): TreeNode[] {
  if (!path.length) return nodes;

  const [head, ...rest] = path;
  return nodes.map((node) => {
    if (node.name !== head) return node;
    if (!rest.length) return { ...node, children };
    return { ...node, children: insertTreeChildrenAtPath(node.children || [], rest, children) };
  });
}

interface PositionedNode {
  node: TreeNode;
  depth: number;
  y: number;
  parentId: string | null;
}

const NODE_WIDTH = 250;
const NODE_HEIGHT = 46;
const COLUMN_GAP = 300;
const ROW_GAP = 72;
const PADDING = 40;

const LEVEL_LABELS: Record<string, string> = {
  lob: 'LOB',
  channel: 'Channel',
  product: 'Product',
  domain: 'Domain',
  subdomain: 'Subdomain',
  businessFlow: 'Business Flow',
  task: 'Task',
  application: 'Application',
  serverType: 'Server Type',
  databaseType: 'DB Type',
  server: 'Server',
  database: 'Database',
};

const LEVEL_COLORS: Record<string, string> = {
  lob: '#7c3aed',
  channel: '#2563eb',
  product: '#0ea5e9',
  domain: '#059669',
  subdomain: '#65a30d',
  businessFlow: '#d97706',
  task: '#dc2626',
  application: '#475569',
  serverType: '#0f766e',
  databaseType: '#7c2d12',
  server: '#0f766e',
  database: '#7c2d12',
};

const FACTORY_COLLECTION_BY_LEVEL: Partial<Record<string, string>> = {
  lob: 'linesOfBusiness',
  channel: 'channels',
  product: 'products',
  domain: 'domains',
  subdomain: 'subdomains',
  businessFlow: 'businessFlows',
};

function normalizeLookupValue(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestApplicationRecord(items: ApplicationItem[], selectedNode: TreeNode): ApplicationItem | null {
  const correlationId = selectedNode.metadata?.correlationId?.trim();
  if (correlationId) {
    const byCorrelationId = items.find((item) => item.correlationId?.trim() === correlationId);
    if (byCorrelationId) return byCorrelationId;
  }

  return findExactApplicationMatches(items, selectedNode.name).selected;
}

function extractFallbackIdentifiers(node: TreeNode): { correlationIds: string[]; acronyms: string[] } {
  const correlationIds = new Set<string>();
  const acronyms = new Set<string>();

  const explicitCorrelationId = (node.metadata?.correlationId || '').trim();
  const explicitName = (node.name || '').trim();

  if (explicitCorrelationId) correlationIds.add(explicitCorrelationId);
  if (explicitName) acronyms.add(explicitName);

  const numericTokens = explicitName.match(/\b\d{3,}\b/g) || [];
  for (const token of numericTokens) correlationIds.add(token);

  return {
    correlationIds: [...correlationIds],
    acronyms: [...acronyms],
  };
}

async function fetchServersForApplicationNode(node: TreeNode): Promise<import('../types').ServerItem[]> {
  const { correlationIds, acronyms } = extractFallbackIdentifiers(node);
  const seen = new Map<string, import('../types').ServerItem>();

  for (const correlationId of correlationIds) {
    const servers = await getApplicationServers(correlationId);
    for (const server of servers) {
      const key = server._id || server.sourceKey;
      if (!key || seen.has(key)) continue;
      seen.set(key, server);
    }
    if (seen.size > 0) return [...seen.values()];
  }

  for (const acronym of acronyms) {
    const servers = await getServers({ applicationName: acronym });
    for (const server of servers) {
      const key = server._id || server.sourceKey;
      if (!key || seen.has(key)) continue;
      seen.set(key, server);
    }
    if (seen.size > 0) return [...seen.values()];
  }

  return [];
}

async function fetchDatabasesForApplicationNode(node: TreeNode): Promise<import('../types').DatabaseItem[]> {
  const { correlationIds, acronyms } = extractFallbackIdentifiers(node);
  const seen = new Map<string, import('../types').DatabaseItem>();

  for (const correlationId of correlationIds) {
    const databases = await getApplicationDatabases(correlationId);
    for (const database of databases) {
      const key = database._id || database.sourceKey;
      if (!key || seen.has(key)) continue;
      seen.set(key, database);
    }
    if (seen.size > 0) return [...seen.values()];
  }

  for (const acronym of acronyms) {
    const databases = await getDatabases({ applicationName: acronym });
    for (const database of databases) {
      const key = database._id || database.sourceKey;
      if (!key || seen.has(key)) continue;
      seen.set(key, database);
    }
    if (seen.size > 0) return [...seen.values()];
  }

  return [];
}

function renderHealthNotes(notes?: Array<{ label: string; severity?: 'info' | 'low' | 'medium' | 'high' | 'critical'; note: string }>) {
  if (!notes?.length) {
    return <Typography.Text type="secondary">No health notes</Typography.Text>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      {notes.map((note, idx) => (
        <div key={`${note.label}-${idx}`} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Tag color={note.severity === 'critical' ? 'red' : note.severity === 'high' ? 'volcano' : note.severity === 'medium' ? 'gold' : 'blue'}>{note.label}</Tag>
            {note.severity ? <Typography.Text type="secondary">{note.severity}</Typography.Text> : null}
          </div>
          <Typography.Text>{note.note}</Typography.Text>
        </div>
      ))}
    </div>
  );
}

function renderLinkedApplications(apps?: Array<{ name?: string | null; acronym?: string | null; correlationId?: string | null; relationType?: string | null; apmNumber?: string | null; serviceName?: string | null }>) {
  if (!apps?.length) {
    return <Typography.Text type="secondary">No linked applications</Typography.Text>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      {apps.map((app, idx) => (
        <div key={`${app.name || app.correlationId || 'app'}-${idx}`} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 6, background: '#fafafa' }}>
          <Typography.Text strong>{(app.acronym || '').trim() || app.name || 'Unknown'}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
              {[app.relationType, app.apmNumber, app.serviceName].filter(Boolean).join(' | ') || 'No relation data'}
            </Typography.Text>
          </div>
        </div>
      ))}
    </div>
  );
}

function LobDrilldownTree() {
  const [data, setData] = useState<TreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [infrastructureByApplicationNodeId, setInfrastructureByApplicationNodeId] = useState<Record<string, TreeNode[]>>({});
  const [infrastructureLoadStatusByApplicationNodeId, setInfrastructureLoadStatusByApplicationNodeId] = useState<Record<string, InfrastructureLoadStatus>>({});
  const [loadingTreeChildrenById, setLoadingTreeChildrenById] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefMap = useRef(new Map<string, HTMLButtonElement>());

  const [selectedInfrastructure, setSelectedInfrastructure] = useState<SelectedInfrastructure | null>(null);
  const [selectedServer, setSelectedServer] = useState<ServerItem | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseItem | null>(null);
  const [loadingSelectedInfrastructure, setLoadingSelectedInfrastructure] = useState(false);
  const [selectedFactoryRecord, setSelectedFactoryRecord] = useState<SelectedFactoryRecord | null>(null);
  const [loadingSelectedFactoryRecord, setLoadingSelectedFactoryRecord] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationItem | null>(null);
  const [selectedApplicationServers, setSelectedApplicationServers] = useState<ServerItem[]>([]);
  const [selectedApplicationDatabases, setSelectedApplicationDatabases] = useState<DatabaseItem[]>([]);
  const [loadingSelectedApplicationInfrastructure, setLoadingSelectedApplicationInfrastructure] = useState(false);
  const referenceCacheRef = useRef<Record<string, RefItem[] | ApplicationItem[]>>({});

  useEffect(() => {
    if (!selectedInfrastructure) {
      setSelectedServer(null);
      setSelectedDatabase(null);
      return;
    }

    setLoadingSelectedInfrastructure(true);

    if (selectedInfrastructure.type === 'server') {
      setSelectedDatabase(null);
      getServer(selectedInfrastructure.id)
        .then((server) => setSelectedServer(server))
        .catch(() => setSelectedServer(null))
        .finally(() => setLoadingSelectedInfrastructure(false));
      return;
    }

    setSelectedServer(null);
    getDatabase(selectedInfrastructure.id)
      .then((database) => setSelectedDatabase(database))
      .catch(() => setSelectedDatabase(null))
      .finally(() => setLoadingSelectedInfrastructure(false));
  }, [selectedInfrastructure]);

  useEffect(() => {
    const isApplicationRecord = selectedFactoryRecord?.title === 'Application';
    const applicationRecord = isApplicationRecord ? (selectedFactoryRecord?.record as unknown as ApplicationItem) : null;
    setSelectedApplication(applicationRecord || null);

    if (!applicationRecord?.correlationId) {
      setSelectedApplicationServers([]);
      setSelectedApplicationDatabases([]);
      setLoadingSelectedApplicationInfrastructure(false);
      return;
    }

    let cancelled = false;
    setLoadingSelectedApplicationInfrastructure(true);

    Promise.all([
      getApplicationServers(applicationRecord.correlationId),
      getApplicationDatabases(applicationRecord.correlationId),
    ])
      .then(([servers, databases]) => {
        if (cancelled) return;
        setSelectedApplicationServers(servers);
        setSelectedApplicationDatabases(databases);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedApplicationServers([]);
        setSelectedApplicationDatabases([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSelectedApplicationInfrastructure(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFactoryRecord]);

  const toLabel = (key: string): string =>
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

  const shouldHidePropertyByValue = (value: unknown): boolean => {
    if (typeof value === 'string' && isKeyLikeString(value)) return true;
    return false;
  };

  const renderPropertyValue = (value: unknown): React.ReactNode => {
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

  const renderSimpleFactoryValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) {
      if (!value.length) return '—';
      const simpleValues = value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item));
      return simpleValues.length ? simpleValues.map(String).join(', ') : '—';
    }
    if (typeof value === 'object') return '—';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  };

  const treeWithInfrastructure = useMemo(() => {
    const injectInfrastructureChildren = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((node) => {
        const nestedChildren = injectInfrastructureChildren(node.children || []);
        if (node.level !== 'application') {
          return { ...node, children: nestedChildren };
        }
        const infrastructureChildren = infrastructureByApplicationNodeId[node.id] || [];
        return { ...node, children: infrastructureChildren.length ? infrastructureChildren : nestedChildren };
      });

    return injectInfrastructureChildren(data?.tree || []);
  }, [data, infrastructureByApplicationNodeId]);

  const nodePathById = useMemo(() => {
    const out = new Map<string, TreeNode[]>();

    const walk = (nodes: TreeNode[], path: TreeNode[]) => {
      for (const node of nodes) {
        const nextPath = [...path, node];
        out.set(node.id, nextPath);
        if (node.children.length > 0) walk(node.children, nextPath);
      }
    };

    walk(treeWithInfrastructure, []);
    return out;
  }, [treeWithInfrastructure]);

  useEffect(() => {
    if (!selectedNode) {
      setSelectedFactoryRecord(null);
      return;
    }

    if (selectedNode.level === 'server' || selectedNode.level === 'database' || selectedNode.level === 'serverType' || selectedNode.level === 'databaseType') {
      setSelectedFactoryRecord(null);
      return;
    }

    let cancelled = false;

    const findExactByName = async (collection: string, name: string) => {
      const cached = referenceCacheRef.current[collection];
      const items = cached || await getRefItems(collection);
      if (!cached) referenceCacheRef.current[collection] = items as RefItem[];
      return (items as Array<RefItem | ApplicationItem>).find((item) => item.name?.trim().toLowerCase() === name.trim().toLowerCase()) || null;
    };

    const loadFactoryRecord = async () => {
      setLoadingSelectedFactoryRecord(true);
      try {
        let record: Record<string, unknown> | null = null;
        let title = LEVEL_LABELS[selectedNode.level] || toLabel(selectedNode.level);

        if (selectedNode.level === 'application') {
          const correlationId = selectedNode.metadata?.correlationId?.trim();
          if (correlationId) {
            try {
              record = await getApplicationByCorrelationId(correlationId) as unknown as Record<string, unknown> | null;
            } catch {
              record = null;
            }
          }

          if (!record) {
            const cached = referenceCacheRef.current.applications;
            const items = cached || await getRefItems('applications');
            if (!cached) referenceCacheRef.current.applications = items as ApplicationItem[];
            record = findBestApplicationRecord(items as ApplicationItem[], selectedNode) as Record<string, unknown> | null;
          }
        } else if (selectedNode.level === 'task') {
          const path = nodePathById.get(selectedNode.id) || [];
          const businessFlowNode = [...path].reverse().find((node) => node.level === 'businessFlow');
          const tasks = await getTasks({ search: selectedNode.name, ...(businessFlowNode ? { businessFlow: businessFlowNode.name } : {}) });
          record = (tasks.find((task) => task.name.trim().toLowerCase() === selectedNode.name.trim().toLowerCase()) || null) as unknown as Record<string, unknown> | null;
        } else {
          const collection = FACTORY_COLLECTION_BY_LEVEL[selectedNode.level];
          if (collection) {
            record = await findExactByName(collection, selectedNode.name) as Record<string, unknown> | null;
          }
        }

        if (!cancelled) {
          setSelectedFactoryRecord(record ? { title, record } : null);
        }
      } catch {
        if (!cancelled) setSelectedFactoryRecord(null);
      } finally {
        if (!cancelled) setLoadingSelectedFactoryRecord(false);
      }
    };

    void loadFactoryRecord();

    return () => {
      cancelled = true;
    };
  }, [nodePathById, selectedNode]);

  useEffect(() => {
    setLoading(true);
    getDashboardLobDrilldownTree()
      .then((result) => {
        setData(result);
        if (result.tree.length > 0) {
          setSelectedNode(result.tree[0]);
          setExpanded(new Set());
        }
        setInfrastructureByApplicationNodeId({});
        setInfrastructureLoadStatusByApplicationNodeId({});
      })
      .finally(() => setLoading(false));
  }, []);

  const positioned = useMemo(() => {
    const out: PositionedNode[] = [];
    let row = 0;

    const walk = (nodes: TreeNode[], depth: number, parentId: string | null) => {
      for (const n of nodes) {
        out.push({ node: n, depth, y: row, parentId });
        row += 1;
        if (expanded.has(n.id) && n.children.length > 0) {
          walk(n.children, depth + 1, n.id);
        }
      }
    };

    walk(treeWithInfrastructure, 0, null);
    return out;
  }, [expanded, treeWithInfrastructure]);

  const loadInfrastructureForApplicationNode = async (node: TreeNode) => {
    if (node.level !== 'application') return;
    if (infrastructureLoadStatusByApplicationNodeId[node.id]) return;

    setInfrastructureLoadStatusByApplicationNodeId((prev) => ({ ...prev, [node.id]: 'loading' }));
    try {
      const [servers, databases] = await Promise.all([
        fetchServersForApplicationNode(node),
        fetchDatabasesForApplicationNode(node),
      ]);
      const uniqueServers = new Map<string, TreeNode>();
      for (const server of servers) {
        const uniqueKey = server._id || server.serverSystemId || server.name || server.hostName || server.fqdn || server.ipAddress;
        if (!uniqueKey || uniqueServers.has(uniqueKey) || !server._id) continue;
        const displayName = server.name || server.hostName || server.fqdn || server.ipAddress || 'Unnamed Server';
        uniqueServers.set(uniqueKey, {
          id: `${node.id}::server::${uniqueKey}`,
          name: displayName,
          level: 'server',
          count: 1,
          metadata: { itemId: server._id, itemType: 'server', applicationNodeId: node.id },
          children: [],
        });
      }

      const uniqueDatabases = new Map<string, TreeNode>();
      for (const database of databases) {
        const uniqueKey = database._id || database.sourceKey || database.instanceName || database.name;
        if (!uniqueKey || uniqueDatabases.has(uniqueKey) || !database._id) continue;
        const displayName = database.instanceName || database.name || database.serviceName || 'Unnamed Database';
        uniqueDatabases.set(uniqueKey, {
          id: `${node.id}::database::${uniqueKey}`,
          name: displayName,
          level: 'database',
          count: 1,
          metadata: { itemId: database._id, itemType: 'database', applicationNodeId: node.id },
          children: [],
        });
      }

      const serverNodes = [...uniqueServers.values()].sort((a, b) => a.name.localeCompare(b.name));
      const databaseNodes = [...uniqueDatabases.values()].sort((a, b) => a.name.localeCompare(b.name));

      const infrastructureNodes: TreeNode[] = [
        {
          id: `${node.id}::infra-group::servers`,
          name: 'Servers',
          level: 'serverType',
          count: serverNodes.length,
          metadata: { applicationNodeId: node.id },
          children: serverNodes,
        },
        {
          id: `${node.id}::infra-group::databases`,
          name: 'Databases',
          level: 'databaseType',
          count: databaseNodes.length,
          metadata: { applicationNodeId: node.id },
          children: databaseNodes,
        },
      ];

      setInfrastructureByApplicationNodeId((prev) => ({ ...prev, [node.id]: infrastructureNodes }));
      setInfrastructureLoadStatusByApplicationNodeId((prev) => ({
        ...prev,
        [node.id]: serverNodes.length || databaseNodes.length ? 'staged' : 'empty',
      }));
      setPendingCenterNodeId(infrastructureNodes[0]?.id || node.id);
    } catch {
      setInfrastructureLoadStatusByApplicationNodeId((prev) => ({ ...prev, [node.id]: 'error' }));
      setPendingCenterNodeId(node.id);
    }
  };

  const loadTreeChildrenForNode = async (node: TreeNode) => {
    if (node.level === 'application') return;
    if (!node.hasChildren || node.children.length > 0 || loadingTreeChildrenById[node.id]) return;

    const path = nodePathById.get(node.id)?.map((pathNode) => pathNode.name) || [node.name];

    setLoadingTreeChildrenById((prev) => ({ ...prev, [node.id]: true }));
    try {
      const response = await getDashboardLobDrilldownTree(path);
      const nextChildren = Array.isArray(response.tree) ? response.tree : [];
      setData((current) => current ? ({
        ...current,
        tree: insertTreeChildrenAtPath(current.tree, path, nextChildren),
      }) : current);
    } catch {
      // Ignore branch load failures; the node will stay collapsed.
    } finally {
      setLoadingTreeChildrenById((prev) => ({ ...prev, [node.id]: false }));
    }
  };

  const dimensions = useMemo(() => {
    const maxDepth = positioned.reduce((m, p) => Math.max(m, p.depth), 0);
    const width = PADDING * 2 + maxDepth * COLUMN_GAP + NODE_WIDTH;
    const height = PADDING * 2 + Math.max(1, positioned.length) * ROW_GAP;
    return { width, height };
  }, [positioned]);

  const positionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const p of positioned) {
      map.set(p.node.id, {
        x: PADDING + p.depth * COLUMN_GAP,
        y: PADDING + p.y * ROW_GAP,
      });
    }
    return map;
  }, [positioned]);

  useEffect(() => {
    if (!pendingCenterNodeId) return;
    const container = containerRef.current;
    const nodeEl = nodeRefMap.current.get(pendingCenterNodeId);
    if (!container || !nodeEl) return;

    const containerRect = container.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();

    const targetLeft = container.scrollLeft + (nodeRect.left - containerRect.left) - (container.clientWidth / 2) + (nodeRect.width / 2);
    const targetTop = container.scrollTop + (nodeRect.top - containerRect.top) - (container.clientHeight / 2) + (nodeRect.height / 2);

    container.scrollTo({ left: Math.max(0, targetLeft), top: Math.max(0, targetTop), behavior: 'smooth' });
    setPendingCenterNodeId(null);
  }, [pendingCenterNodeId, expanded, positioned]);

  const onToggle = (node: TreeNode) => {
    setSelectedNode(node);
    setSelectedInfrastructure(null);
    const isApplicationNode = node.level === 'application';
    const loadStatus = infrastructureLoadStatusByApplicationNodeId[node.id];
    const hasChildren = isApplicationNode
      ? (infrastructureByApplicationNodeId[node.id] || []).length > 0 || !loadStatus || loadStatus === 'loading'
      : node.hasChildren ?? node.children.length > 0;
    const appInfrastructureChildren = isApplicationNode ? (infrastructureByApplicationNodeId[node.id] || []) : [];

    if (isApplicationNode && !expanded.has(node.id) && !loadStatus) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(node.id);
        return next;
      });
      setPendingCenterNodeId(node.id);
      void loadInfrastructureForApplicationNode(node);
      return;
    }

    if (!hasChildren) {
      setPendingCenterNodeId(node.id);
      return;
    }

    const next = new Set(expanded);
    const isExpanded = next.has(node.id);
    if (isExpanded) {
      next.delete(node.id);
      setExpanded(next);
      setPendingCenterNodeId(node.id);
      return;
    }

    next.add(node.id);
    setExpanded(next);
    if (!isApplicationNode && (node.children.length === 0) && (node.hasChildren ?? false)) {
      void loadTreeChildrenForNode(node);
    }
    const nextChildId = isApplicationNode
      ? appInfrastructureChildren[0]?.id
      : node.children[0]?.id;
    setPendingCenterNodeId(nextChildId || node.id);
  };

  const onInfrastructureNodeClick = (node: TreeNode) => {
    setSelectedNode(node);
    if (!node.metadata?.itemId || !node.metadata.itemType) return;
    setSelectedInfrastructure({ id: node.metadata.itemId, type: node.metadata.itemType });
    setPendingCenterNodeId(node.id);
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>;
  }

  if (!data || !data.tree.length) {
    return <Empty description="No hierarchy data found" />;
  }

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Diagrams" value={data.totalDiagrams} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="LOB Roots" value={data.rootCount} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Visible Nodes" value={positioned.length} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Expanded Branches" value={expanded.size} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
      <Card
        size="small"
        title="LOB to Application/Infrastructure Drilldown"
        extra={<Typography.Text type="secondary">Click a node to expand rightward. View auto-centers on the opened branch.</Typography.Text>}
        bodyStyle={{ padding: 0 }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            height: '60vh',
            minHeight: 520,
            overflow: 'auto',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
          }}
        >
          <div style={{ position: 'relative', width: dimensions.width, height: dimensions.height }}>
            <svg width={dimensions.width} height={dimensions.height} style={{ position: 'absolute', inset: 0 }}>
              {positioned.filter((p) => p.parentId).map((p) => {
                const from = p.parentId ? positionById.get(p.parentId) : null;
                const to = positionById.get(p.node.id);
                if (!from || !to) return null;

                const x1 = from.x + NODE_WIDTH;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_HEIGHT / 2;
                const c1 = x1 + 70;
                const c2 = x2 - 70;
                const path = `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;

                return <path key={`${p.parentId}->${p.node.id}`} d={path} stroke="#94a3b8" strokeWidth="1.5" fill="none" opacity="0.75" />;
              })}
            </svg>

            {positioned.map((p) => {
              const pos = positionById.get(p.node.id)!;
              const color = LEVEL_COLORS[p.node.level] || '#475569';
              const isExpanded = expanded.has(p.node.id);
              const isApplicationNode = p.node.level === 'application';
              const isLeafInfrastructureNode = p.node.level === 'server' || p.node.level === 'database';
              const isSelectedNode = selectedNode?.id === p.node.id;
              const isBranchLoading = Boolean(loadingTreeChildrenById[p.node.id]);
              const appLoadStatus = isApplicationNode ? infrastructureLoadStatusByApplicationNodeId[p.node.id] : undefined;
              const hasChildren = isApplicationNode
                ? ((infrastructureByApplicationNodeId[p.node.id] || []).length > 0 || !appLoadStatus || appLoadStatus === 'loading')
                : (p.node.hasChildren ?? p.node.children.length > 0);

              return (
                <button
                  key={p.node.id}
                  ref={(el) => {
                    if (el) nodeRefMap.current.set(p.node.id, el);
                    else nodeRefMap.current.delete(p.node.id);
                  }}
                  type="button"
                  onClick={() => isLeafInfrastructureNode ? onInfrastructureNodeClick(p.node) : onToggle(p.node)}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                    borderRadius: 10,
                    border: `1px solid ${isSelectedNode ? '#0369a1' : color}`,
                    background: isSelectedNode
                      ? '#ecf0f5'
                      : hasChildren && isExpanded ? '#f8fafc' : '#ffffff',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    textAlign: 'left',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {LEVEL_LABELS[p.node.level] || p.node.level}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.node.name}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="default" style={{ marginRight: 0 }}>{p.node.count}</Tag>
                    {((isApplicationNode && appLoadStatus === 'loading') || isBranchLoading) && <LoadingOutlined style={{ color: '#64748b', fontSize: 12 }} />}
                    {hasChildren && appLoadStatus !== 'loading' && <span style={{ color: '#64748b', fontSize: 12 }}>{isExpanded ? '▾' : '▸'}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={selectedInfrastructure?.type === 'database' ? 'Database Properties' : selectedInfrastructure?.type === 'server' ? 'Server Properties' : selectedFactoryRecord?.title ? `${selectedFactoryRecord.title} Properties` : 'Node Properties'} style={{ height: 'calc(60vh + 56px)' }} bodyStyle={{ maxHeight: 'calc(60vh - 8px)', overflowY: 'auto' }}>
            {loadingSelectedInfrastructure || loadingSelectedFactoryRecord ? (
              <div style={{ textAlign: 'center', paddingTop: 24 }}><Spin /></div>
            ) : selectedServer ? (
              <>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{selectedServer.name}</Typography.Title>
                <Typography.Text type="secondary">{selectedServer.hostName || selectedServer.ipAddress || selectedServer.fqdn || 'No host identifier'}</Typography.Text>
                <Divider style={{ margin: '12px 0' }} />

                <Typography.Title level={5} style={{ marginTop: 0 }}>Health Notes</Typography.Title>
                {renderHealthNotes(selectedServer.healthNotes)}

                <Divider style={{ margin: '12px 0' }} />
                <Typography.Title level={5} style={{ marginTop: 0 }}>Linked Applications</Typography.Title>
                {renderLinkedApplications(selectedServer.linkedApplications)}

                <Divider style={{ margin: '12px 0' }} />
                <Typography.Title level={5} style={{ marginTop: 0 }}>Other Properties</Typography.Title>
                <Descriptions column={1} size="small" bordered>
                  {Object.entries(selectedServer)
                    .filter(([key, value]) => key !== 'healthNotes' && key !== 'linkedApplications' && !shouldHidePropertyByValue(value))
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <Descriptions.Item key={key} label={toLabel(key)}>
                        {renderPropertyValue(value)}
                      </Descriptions.Item>
                    ))}
                </Descriptions>
              </>
            ) : selectedDatabase ? (
              <>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{selectedDatabase.instanceName || selectedDatabase.name}</Typography.Title>
                <Typography.Text type="secondary">{[selectedDatabase.vendor, selectedDatabase.version, selectedDatabase.serviceName].filter(Boolean).join(' | ') || 'No database summary'}</Typography.Text>
                <Divider style={{ margin: '12px 0' }} />

                <Typography.Title level={5} style={{ marginTop: 0 }}>Health Notes</Typography.Title>
                {renderHealthNotes(selectedDatabase.healthNotes)}

                <Divider style={{ margin: '12px 0' }} />
                <Typography.Title level={5} style={{ marginTop: 0 }}>Linked Applications</Typography.Title>
                {renderLinkedApplications(selectedDatabase.linkedApplications)}

                <Divider style={{ margin: '12px 0' }} />
                <Typography.Title level={5} style={{ marginTop: 0 }}>Other Properties</Typography.Title>
                <Descriptions column={1} size="small" bordered>
                  {Object.entries(selectedDatabase)
                    .filter(([key, value]) => key !== 'healthNotes' && key !== 'linkedApplications' && !shouldHidePropertyByValue(value))
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <Descriptions.Item key={key} label={toLabel(key)}>
                        {renderPropertyValue(value)}
                      </Descriptions.Item>
                    ))}
                </Descriptions>
              </>
            ) : selectedApplication ? (
              <>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{selectedApplication.name}</Typography.Title>
                <Typography.Text type="secondary">{[selectedApplication.acronym, selectedApplication.applicationType, selectedApplication.businessCriticality].filter(Boolean).join(' | ') || 'Application'}</Typography.Text>
                <Divider style={{ margin: '12px 0' }} />
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Correlation ID">{selectedApplication.correlationId || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Acronym">{selectedApplication.acronym || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Short Description">{selectedApplication.shortDescription || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Application Type">{selectedApplication.applicationType || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Business Criticality">{selectedApplication.businessCriticality || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Lifecycle">{selectedApplication.lifecycle || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Lifecycle Status">{selectedApplication.lifecycleStatus || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Install Type">{selectedApplication.installType || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Discovery Source">{selectedApplication.discoverySource || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Customer Facing">{selectedApplication.customerFacing || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Internet Facing">{selectedApplication.internetFacing || '—'}</Descriptions.Item>
                  <Descriptions.Item label="CPNI Indicator">{selectedApplication.cpniIndicator || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Handle SPI">{selectedApplication.handleSpi || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Store SPI">{selectedApplication.storeSpi || '—'}</Descriptions.Item>
                  <Descriptions.Item label="PCI Data">{selectedApplication.pciData || '—'}</Descriptions.Item>
                  <Descriptions.Item label="PCI Data Stored">{selectedApplication.pciDataStored || '—'}</Descriptions.Item>
                  <Descriptions.Item label="SOX/FSA">{selectedApplication.soxFsa || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Business Purpose">{selectedApplication.businessPurpose || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Application Purpose">{selectedApplication.applPurpose || '—'}</Descriptions.Item>
                  <Descriptions.Item label="User Interface">{selectedApplication.userInterface || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Owner">{selectedApplication.owner || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Status">{(selectedApplication as unknown as Record<string, unknown>).state ? String((selectedApplication as unknown as Record<string, unknown>).state) : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Servers">
                    {loadingSelectedApplicationInfrastructure ? (
                      <Spin size="small" />
                    ) : selectedApplicationServers.length ? (
                      <List
                        size="small"
                        dataSource={selectedApplicationServers}
                        renderItem={(server) => (
                          <List.Item style={{ paddingInline: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <Typography.Text strong>{server.name}</Typography.Text>
                              <span className="text-xs text-gray-500">
                                {[server.hostName, server.fqdn, server.ipAddress].filter(Boolean).join(' | ') || 'No host details'}
                              </span>
                            </div>
                          </List.Item>
                        )}
                      />
                    ) : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Databases">
                    {loadingSelectedApplicationInfrastructure ? (
                      <Spin size="small" />
                    ) : selectedApplicationDatabases.length ? (
                      <List
                        size="small"
                        dataSource={selectedApplicationDatabases}
                        renderItem={(database) => (
                          <List.Item style={{ paddingInline: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <Typography.Text strong>{database.instanceName || database.name}</Typography.Text>
                              <span className="text-xs text-gray-500">
                                {[database.vendor, database.version, database.serviceName].filter(Boolean).join(' | ') || 'No database details'}
                              </span>
                            </div>
                          </List.Item>
                        )}
                      />
                    ) : '—'}
                  </Descriptions.Item>
                </Descriptions>
              </>
            ) : selectedFactoryRecord ? (
              <>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{String(selectedFactoryRecord.record.name || selectedNode?.name || 'Unnamed')}</Typography.Title>
                <Typography.Text type="secondary">{selectedFactoryRecord.title}</Typography.Text>
                <Divider style={{ margin: '12px 0' }} />
                <Descriptions column={1} size="small" bordered>
                  {Object.entries(selectedFactoryRecord.record)
                    .filter(([, value]) => !shouldHidePropertyByValue(value))
                    .filter(([, value]) => !(typeof value === 'object' && value !== null && !Array.isArray(value)))
                    .filter(([, value]) => !(Array.isArray(value) && value.some((item) => item && typeof item === 'object')))
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <Descriptions.Item key={key} label={toLabel(key)}>
                        {renderSimpleFactoryValue(value)}
                      </Descriptions.Item>
                    ))}
                </Descriptions>
              </>
            ) : selectedNode ? (
              <>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{selectedNode.name}</Typography.Title>
                <Typography.Text type="secondary">{LEVEL_LABELS[selectedNode.level] || toLabel(selectedNode.level)}</Typography.Text>
                <Divider style={{ margin: '12px 0' }} />

                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Level">
                    {LEVEL_LABELS[selectedNode.level] || toLabel(selectedNode.level)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Name">
                    {selectedNode.name || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Count">
                    {selectedNode.count}
                  </Descriptions.Item>
                  <Descriptions.Item label="Visible Children">
                    {selectedNode.children.length}
                  </Descriptions.Item>
                  {selectedNode.level === 'application' ? (
                    <Descriptions.Item label="Infrastructure Status">
                      {infrastructureLoadStatusByApplicationNodeId[selectedNode.id] || 'not staged'}
                    </Descriptions.Item>
                  ) : null}
                  {selectedNode.children.length ? (
                    <Descriptions.Item label="Next Level Items">
                      {selectedNode.children.slice(0, 12).map((child) => child.name).join(', ')}
                      {selectedNode.children.length > 12 ? `, +${selectedNode.children.length - 12} more` : ''}
                    </Descriptions.Item>
                  ) : null}
                </Descriptions>
              </>
            ) : (
              <Empty description="Select a node" />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default memo(LobDrilldownTree);
