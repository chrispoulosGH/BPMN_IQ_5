import { useState, useEffect, useMemo } from 'react';
import { Spin, Select, Segmented, Empty, Card, Row, Col, Statistic, Table, Tag } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getDashboardTaskRisk, getDashboardFlowRisk } from '../api';
import Flow3DChart from './Flow3DChart';

// ─── Types ──────────────────────────────────────────────────
interface YNCount { yes: number; no: number; unknown: number }

interface TaskProfile {
  _id: string;
  name: string;
  businessFlow: string;
  product: string;
  domain?: string;
  channel?: string;
  actor?: string;
  appCount: number;
  criticality: Record<string, number>;
  lifecycle: Record<string, number>;
  applicationType: Record<string, number>;
  customerFacing: YNCount;
  internetFacing: YNCount;
  cpni: YNCount;
  handleSpi: YNCount;
  storeSpi: YNCount;
  pciData: YNCount;
  pciDataStored: YNCount;
  soxFsa: YNCount;
  riskScore: number;
}

interface FlowProfile {
  name: string;
  taskCount: number;
  appCount: number;
  uniqueApps: number;
  criticality: Record<string, number>;
  lifecycle: Record<string, number>;
  applicationType: Record<string, number>;
  customerFacing: YNCount;
  internetFacing: YNCount;
  cpni: YNCount;
  handleSpi: YNCount;
  storeSpi: YNCount;
  pciData: YNCount;
  pciDataStored: YNCount;
  soxFsa: YNCount;
  riskScore: number;
}

// ─── Constants ──────────────────────────────────────────────
const COMPLIANCE_FIELDS = ['cpni', 'handleSpi', 'storeSpi', 'pciData', 'pciDataStored', 'soxFsa', 'customerFacing', 'internetFacing'] as const;
const COMPLIANCE_LABELS: Record<string, string> = {
  cpni: 'CPNI',
  handleSpi: 'Handle SPI',
  storeSpi: 'Store SPI',
  pciData: 'PCI Data',
  pciDataStored: 'PCI Stored',
  soxFsa: 'SOX/FSA',
  customerFacing: 'Cust. Facing',
  internetFacing: 'Internet Facing',
};

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'];
const RISK_COLORS = { low: '#52c41a', medium: '#faad14', high: '#fa541c', critical: '#f5222d' };

function riskLevel(score: number): { label: string; color: string } {
  if (score <= 5) return { label: 'Low', color: RISK_COLORS.low };
  if (score <= 15) return { label: 'Medium', color: RISK_COLORS.medium };
  if (score <= 30) return { label: 'High', color: RISK_COLORS.high };
  return { label: 'Critical', color: RISK_COLORS.critical };
}

// ─── Component ──────────────────────────────────────────────
export default function Dashboard() {
  const [taskData, setTaskData] = useState<TaskProfile[]>([]);
  const [flowData, setFlowData] = useState<FlowProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tasks' | 'flows' | '3d'>('tasks');
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDashboardTaskRisk(), getDashboardFlowRisk()])
      .then(([tasks, flows]) => { setTaskData(tasks); setFlowData(flows); })
      .finally(() => setLoading(false));
  }, []);

  const flowNames = useMemo(() => [...new Set(taskData.map((t) => t.businessFlow))].sort(), [taskData]);

  const filteredTasks = useMemo(() => {
    if (!selectedFlow) return taskData;
    return taskData.filter((t) => t.businessFlow === selectedFlow);
  }, [taskData, selectedFlow]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      {/* Header controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'tasks' | 'flows' | '3d')}
          options={[
            { label: 'Task Comparison', value: 'tasks' },
            { label: 'Business Flow Comparison', value: 'flows' },
            { label: '3D Flow Explorer', value: '3d' },
          ]}
        />
        {view === 'tasks' && (
          <Select
            allowClear
            placeholder="Filter by Business Flow"
            style={{ minWidth: 220 }}
            value={selectedFlow}
            onChange={setSelectedFlow}
            options={flowNames.map((f) => ({ label: f, value: f }))}
          />
        )}
      </div>

      {view === 'tasks' ? (
        <TaskDashboard tasks={filteredTasks} />
      ) : view === 'flows' ? (
        <FlowDashboard flows={flowData} />
      ) : (
        <Flow3DChart />
      )}
    </div>
  );
}

// ─── Task Dashboard ─────────────────────────────────────────
function TaskDashboard({ tasks }: { tasks: TaskProfile[] }) {
  if (!tasks.length) return <Empty description="No tasks with applications found" />;

  // Top 20 tasks by risk for bar chart
  const topTasks = [...tasks].sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);

  // Risk score bar chart data
  const riskBarData = topTasks.map((t) => ({
    name: t.name.length > 25 ? t.name.slice(0, 22) + '...' : t.name,
    fullName: t.name,
    riskScore: t.riskScore,
    appCount: t.appCount,
  }));

  // Compliance comparison data (stacked bar showing yes count per compliance field)
  const complianceBarData = topTasks.map((t) => {
    const row: any = { name: t.name.length > 25 ? t.name.slice(0, 22) + '...' : t.name, fullName: t.name };
    for (const field of COMPLIANCE_FIELDS) {
      row[field] = (t[field] as YNCount).yes;
    }
    return row;
  });

  // Radar data for top 5 tasks
  const radarTasks = topTasks.slice(0, 5);
  const radarData = COMPLIANCE_FIELDS.map((field) => {
    const point: any = { subject: COMPLIANCE_LABELS[field] };
    radarTasks.forEach((t, i) => {
      point[`task${i}`] = (t[field] as YNCount).yes;
    });
    return point;
  });

  // Summary stats
  const totalApps = new Set(tasks.flatMap((t) => [])).size; // placeholder
  const avgRisk = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.riskScore, 0) / tasks.length) : 0;
  const maxRisk = tasks.length ? Math.max(...tasks.map((t) => t.riskScore)) : 0;
  const highRiskCount = tasks.filter((t) => t.riskScore > 15).length;

  return (
    <>
      {/* Summary cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Tasks" value={tasks.length} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Avg Risk Score" value={avgRisk} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Max Risk Score" value={maxRisk} valueStyle={{ color: riskLevel(maxRisk).color }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="High+ Risk Tasks" value={highRiskCount} valueStyle={{ color: highRiskCount > 0 ? '#f5222d' : '#52c41a' }} /></Card></Col>
      </Row>

      {/* Risk Score Bar Chart */}
      <Card title="Top 20 Tasks by Risk Score" size="small" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={riskBarData} margin={{ top: 5, right: 30, left: 10, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return <div style={{ background: '#fff', border: '1px solid #ccc', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 600 }}>{d.fullName}</div>
                <div>Risk Score: {d.riskScore}</div>
                <div>Applications: {d.appCount}</div>
              </div>;
            }} />
            <Bar dataKey="riskScore" fill="#f5222d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Compliance Stacked Bar */}
      <Card title="Compliance Flags per Task (Top 20 by Risk)" size="small" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={complianceBarData} margin={{ top: 5, right: 30, left: 10, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            {COMPLIANCE_FIELDS.map((field, i) => (
              <Bar key={field} dataKey={field} name={COMPLIANCE_LABELS[field]} stackId="a" fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Radar Chart - Top 5 */}
      {radarTasks.length > 1 && (
        <Card title="Compliance Radar — Top 5 Riskiest Tasks" size="small" style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis />
              {radarTasks.map((t, i) => (
                <Radar
                  key={t._id}
                  name={t.name.length > 20 ? t.name.slice(0, 17) + '...' : t.name}
                  dataKey={`task${i}`}
                  stroke={COLORS[i]}
                  fill={COLORS[i]}
                  fillOpacity={0.15}
                />
              ))}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Task Risk Table */}
      <Card title="All Tasks — Risk & Compliance Summary" size="small">
        <Table
          dataSource={[...tasks].sort((a, b) => b.riskScore - a.riskScore)}
          rowKey="_id"
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: true }}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Task', dataIndex: 'name', key: 'name', ellipsis: true, width: 180, sorter: (a, b) => a.name.localeCompare(b.name) },
            { title: 'Business Flow', dataIndex: 'businessFlow', key: 'bflow', ellipsis: true, width: 160 },
            { title: 'Apps', dataIndex: 'appCount', key: 'apps', width: 60, sorter: (a, b) => a.appCount - b.appCount },
            {
              title: 'Risk', dataIndex: 'riskScore', key: 'risk', width: 80,
              sorter: (a, b) => a.riskScore - b.riskScore,
              defaultSortOrder: 'descend',
              render: (v: number) => { const r = riskLevel(v); return <Tag color={r.color}>{v} ({r.label})</Tag>; },
            },
            { title: 'CPNI', key: 'cpni', width: 55, render: (_, r) => r.cpni.yes || '-' },
            { title: 'SPI', key: 'spi', width: 55, render: (_, r) => (r.handleSpi.yes + r.storeSpi.yes) || '-' },
            { title: 'PCI', key: 'pci', width: 55, render: (_, r) => (r.pciData.yes + r.pciDataStored.yes) || '-' },
            { title: 'SOX', key: 'sox', width: 55, render: (_, r) => r.soxFsa.yes || '-' },
            { title: 'Cust.', key: 'cf', width: 55, render: (_, r) => r.customerFacing.yes || '-' },
            { title: 'Inet.', key: 'if', width: 55, render: (_, r) => r.internetFacing.yes || '-' },
          ]}
        />
      </Card>
    </>
  );
}

// ─── Flow Dashboard ─────────────────────────────────────────
function FlowDashboard({ flows }: { flows: FlowProfile[] }) {
  if (!flows.length) return <Empty description="No business flows with tasks/applications found" />;

  const top20 = flows.slice(0, 20); // already sorted by risk

  // Risk bar data
  const riskBarData = top20.map((f) => ({
    name: f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name,
    fullName: f.name,
    riskScore: f.riskScore,
    taskCount: f.taskCount,
    appCount: f.appCount,
  }));

  // Compliance bar data
  const complianceBarData = top20.map((f) => {
    const row: any = { name: f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name, fullName: f.name };
    for (const field of COMPLIANCE_FIELDS) {
      row[field] = (f[field] as YNCount).yes;
    }
    return row;
  });

  // Criticality pie for all flows combined
  const allCriticality: Record<string, number> = {};
  for (const f of flows) {
    for (const [k, v] of Object.entries(f.criticality)) {
      allCriticality[k] = (allCriticality[k] || 0) + v;
    }
  }
  const critPieData = Object.entries(allCriticality)
    .filter(([k]) => k !== 'Unknown')
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Radar for top 5 flows
  const radarFlows = top20.slice(0, 5);
  const radarData = COMPLIANCE_FIELDS.map((field) => {
    const point: any = { subject: COMPLIANCE_LABELS[field] };
    radarFlows.forEach((f, i) => {
      point[`flow${i}`] = (f[field] as YNCount).yes;
    });
    return point;
  });

  // Summary
  const avgRisk = flows.length ? Math.round(flows.reduce((s, f) => s + f.riskScore, 0) / flows.length) : 0;
  const maxRisk = flows.length ? Math.max(...flows.map((f) => f.riskScore)) : 0;
  const totalApps = flows.reduce((s, f) => s + f.appCount, 0);

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Business Flows" value={flows.length} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Avg Risk Score" value={avgRisk} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Max Risk Score" value={maxRisk} valueStyle={{ color: riskLevel(maxRisk).color }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Total Unique Apps" value={totalApps} /></Card></Col>
      </Row>

      {/* Risk Score Bar Chart */}
      <Card title="Top 20 Business Flows by Risk Score" size="small" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={riskBarData} margin={{ top: 5, right: 30, left: 10, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return <div style={{ background: '#fff', border: '1px solid #ccc', padding: 8, borderRadius: 4 }}>
                <div style={{ fontWeight: 600 }}>{d.fullName}</div>
                <div>Risk Score: {d.riskScore}</div>
                <div>Tasks: {d.taskCount}</div>
                <div>Applications: {d.appCount}</div>
              </div>;
            }} />
            <Bar dataKey="riskScore" fill="#722ed1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Compliance Stacked Bar */}
      <Card title="Compliance Flags per Business Flow (Top 20)" size="small" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={complianceBarData} margin={{ top: 5, right: 30, left: 10, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            {COMPLIANCE_FIELDS.map((field, i) => (
              <Bar key={field} dataKey={field} name={COMPLIANCE_LABELS[field]} stackId="a" fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Criticality Pie */}
        <Col xs={24} md={12}>
          <Card title="Application Criticality Distribution" size="small">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={critPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine>
                  {critPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* Radar */}
        {radarFlows.length > 1 && (
          <Col xs={24} md={12}>
            <Card title="Compliance Radar — Top 5 Riskiest Flows" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis />
                  {radarFlows.map((f, i) => (
                    <Radar
                      key={f.name}
                      name={f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name}
                      dataKey={`flow${i}`}
                      stroke={COLORS[i]}
                      fill={COLORS[i]}
                      fillOpacity={0.15}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}
      </Row>

      {/* Flow Table */}
      <Card title="All Business Flows — Risk & Compliance Summary" size="small">
        <Table
          dataSource={flows}
          rowKey="name"
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: true }}
          scroll={{ x: 1000 }}
          columns={[
            { title: 'Business Flow', dataIndex: 'name', key: 'name', ellipsis: true, width: 200, sorter: (a, b) => a.name.localeCompare(b.name) },
            { title: 'Tasks', dataIndex: 'taskCount', key: 'tasks', width: 60, sorter: (a, b) => a.taskCount - b.taskCount },
            { title: 'Apps', dataIndex: 'appCount', key: 'apps', width: 60, sorter: (a, b) => a.appCount - b.appCount },
            {
              title: 'Risk', dataIndex: 'riskScore', key: 'risk', width: 90,
              sorter: (a, b) => a.riskScore - b.riskScore,
              defaultSortOrder: 'descend',
              render: (v: number) => { const r = riskLevel(v); return <Tag color={r.color}>{v} ({r.label})</Tag>; },
            },
            { title: 'CPNI', key: 'cpni', width: 55, render: (_, r) => r.cpni.yes || '-' },
            { title: 'SPI', key: 'spi', width: 55, render: (_, r) => (r.handleSpi.yes + r.storeSpi.yes) || '-' },
            { title: 'PCI', key: 'pci', width: 55, render: (_, r) => (r.pciData.yes + r.pciDataStored.yes) || '-' },
            { title: 'SOX', key: 'sox', width: 55, render: (_, r) => r.soxFsa.yes || '-' },
            { title: 'Cust.', key: 'cf', width: 55, render: (_, r) => r.customerFacing.yes || '-' },
            { title: 'Inet.', key: 'if', width: 55, render: (_, r) => r.internetFacing.yes || '-' },
          ]}
        />
      </Card>
    </>
  );
}
