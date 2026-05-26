import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Col, Empty, Row, Spin, Statistic, Tag, Typography } from 'antd';
import { getDashboardLobDrilldownTree } from '../api';

interface TreeNode {
  id: string;
  name: string;
  level: string;
  count: number;
  children: TreeNode[];
}

interface TreeResponse {
  levels: string[];
  totalDiagrams: number;
  rootCount: number;
  tree: TreeNode[];
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
};

export default function LobDrilldownTree() {
  const [data, setData] = useState<TreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefMap = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setLoading(true);
    getDashboardLobDrilldownTree()
      .then((result) => {
        setData(result);
        if (result.tree.length > 0) {
          setExpanded(new Set(result.tree.slice(0, 1).map((n) => n.id)));
        }
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

    walk(data?.tree || [], 0, null);
    return out;
  }, [data, expanded]);

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
    if (!node.children.length) {
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
    setPendingCenterNodeId(node.children[0]?.id || node.id);
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

      <Card
        size="small"
        title="LOB to Application Drilldown"
        extra={<Typography.Text type="secondary">Click a node to expand rightward. View auto-centers on the opened branch.</Typography.Text>}
        bodyStyle={{ padding: 0 }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            height: '68vh',
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
              const hasChildren = p.node.children.length > 0;

              return (
                <button
                  key={p.node.id}
                  ref={(el) => {
                    if (el) nodeRefMap.current.set(p.node.id, el);
                    else nodeRefMap.current.delete(p.node.id);
                  }}
                  type="button"
                  onClick={() => onToggle(p.node)}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                    borderRadius: 10,
                    border: `1px solid ${color}`,
                    background: hasChildren && isExpanded ? '#f8fafc' : '#ffffff',
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
                    {hasChildren && <span style={{ color: '#64748b', fontSize: 12 }}>{isExpanded ? '▾' : '▸'}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
}
