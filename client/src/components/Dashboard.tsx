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
import { getDashboardTaskRisk, getDashboardFlowRisk, getDashboardCostByYear } from '../api';
import type { CostByYearItem, TaskCostByYearItem } from '../api';
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
  const COST_YEAR = 2025;
  const [taskData, setTaskData] = useState<TaskProfile[]>([]);
  const [flowData, setFlowData] = useState<FlowProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tasks' | 'flows' | '3d'>('flows');
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [flowCostData, setFlowCostData] = useState<CostByYearItem[]>([]);
  const [taskCostData, setTaskCostData] = useState<TaskCostByYearItem[]>([]);

  useEffect(() => {
    Promise.all([
      getDashboardTaskRisk(),
      getDashboardFlowRisk(),
      getDashboardCostByYear(COST_YEAR),
    ])
      .then(([tasks, flows, cost]) => {
        setTaskData(tasks);
        setFlowData(flows);
        setFlowCostData(cost.flows);
        setTaskCostData(cost.tasks);
      })
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
            { label: 'Business Flow Comparison', value: 'flows' },
            { label: 'Task Comparison', value: 'tasks' },
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
        <TaskDashboard tasks={filteredTasks} allTasks={taskData} costData={taskCostData} costYear={COST_YEAR} />
      ) : view === 'flows' ? (
        <FlowDashboard flows={flowData} costData={flowCostData} costYear={COST_YEAR} />
      ) : (
        <Flow3DChart />
      )}
    </div>
  );
}

// ─── Task Dashboard ─────────────────────────────────────────
function TaskDashboard({ tasks, allTasks, costData, costYear }: { tasks: TaskProfile[]; allTasks: TaskProfile[]; costData: TaskCostByYearItem[]; costYear: number }) {
  if (!tasks.length) return <Empty description="No tasks with applications found" />;

  // Top 20 tasks by risk for bar chart
  const topTasks = [...tasks].sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);

  // Cost bar chart data (already top-20 sorted by totalCost from server)
  const fmtM = (n: number) => '$' + (n / 1_000_000).toFixed(1) + 'M';
  const costBarData = costData.map((t) => ({
    name: t.name.length > 25 ? t.name.slice(0, 22) + '...' : t.name,
    fullName: t.name,
    flow: t.businessFlow,
    opCost: t.opCost,
    devCost: t.devCost,
    totalCost: t.totalCost,
  }));

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
  const [radarTaskSelected, setRadarTaskSelected] = useState<string[]>([]);
  const radarTasksFiltered = radarTaskSelected.length > 0
    ? allTasks.filter((t) => radarTaskSelected.includes(t.name)).slice(0, 5)
    : radarTasks;
  const radarTaskTitle = radarTaskSelected.length > 0 ? 'Compliance Radar — Selected Tasks' : 'Compliance Radar — Top 5 Riskiest Tasks';
  const radarData = COMPLIANCE_FIELDS.map((field) => {
    const point: any = { subject: COMPLIANCE_LABELS[field] };
    radarTasksFiltered.forEach((t, i) => {
      point[`task${i}`] = (t[field] as YNCount).yes;
    });
    return point;
  });

  // Summary stats
  const totalApps = new Set(tasks.flatMap((t) => [])).size; // placeholder
  const avgRisk = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.riskScore, 0) / tasks.length) : 0;
  const maxRisk = tasks.length ? Math.max(...tasks.map((t) => t.riskScore)) : 0;
  const highRiskCount = tasks.filter((t) => t.riskScore > 15).length;

  // Criticality pie — filterable by task (uses full allTasks list, independent of top flow filter)
  const [critTasks, setCritTasks] = useState<string[]>([]);
  const tasksForPie = critTasks.length > 0 ? allTasks.filter((t) => critTasks.includes(t.name)) : allTasks;
  const taskCritAgg: Record<string, number> = {};
  for (const t of tasksForPie) {
    for (const [k, v] of Object.entries(t.criticality)) {
      taskCritAgg[k] = (taskCritAgg[k] || 0) + v;
    }
  }
  const taskCritPieData = Object.entries(taskCritAgg)
    .filter(([k]) => k !== 'Unknown')
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      {/* Cost Bar Chart — first */}
      {costBarData.length > 0 && (
        <Card title={`Top 20 Tasks by Cost — ${costYear}`} size="small" style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={costBarData} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmtM(v)} width={70} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return <div style={{ background: '#fff', border: '1px solid #ccc', padding: 8, borderRadius: 4, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{d.fullName}</div>
                  <div style={{ color: '#6e7681', fontSize: 11 }}>{d.flow}</div>
                  <div style={{ color: '#1890ff' }}>Operation: {fmtM(d.opCost)}</div>
                  <div style={{ color: '#d29922' }}>Development: {fmtM(d.devCost)}</div>
                  <div style={{ fontWeight: 600 }}>Total: {fmtM(d.totalCost)}</div>
                </div>;
              }} />
              <Legend />
              <Bar dataKey="opCost" name="Operation Cost" stackId="a" fill="#1890ff" radius={[0, 0, 0, 0]} />
              <Bar dataKey="devCost" name="Development Cost" stackId="a" fill="#d29922" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

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

      {/* Criticality Pie + Radar Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card
            title="Application Criticality Distribution"
            size="small"
            extra={
              <Select
                mode="multiple"
                allowClear
                placeholder="All tasks"
                style={{ minWidth: 200, maxWidth: 340 }}
                maxTagCount={2}
                value={critTasks}
                onChange={setCritTasks}
                showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={[...new Set(allTasks.map((t) => t.name))].sort().map((name) => ({ label: name, value: name }))}
              />
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={taskCritPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine>
                  {taskCritPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            title={radarTaskTitle}
            size="small"
            extra={
              <Select
                mode="multiple"
                allowClear
                placeholder="Top 5 by risk"
                style={{ minWidth: 200, maxWidth: 340 }}
                maxTagCount={2}
                value={radarTaskSelected}
                onChange={(vals) => setRadarTaskSelected(vals.slice(0, 5))}
                showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={[...new Set(allTasks.map((t) => t.name))].sort().map((name) => ({ label: name, value: name }))}
              />
            }
          >
            {radarTasksFiltered.length < 2 ? (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                Select at least 2 tasks to display the radar
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis />
                  {radarTasksFiltered.map((t, i) => (
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
            )}
          </Card>
        </Col>
      </Row>

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
function FlowDashboard({ flows, costData, costYear }: { flows: FlowProfile[]; costData: CostByYearItem[]; costYear: number }) {
  if (!flows.length) return <Empty description="No business flows with tasks/applications found" />;

  const top20 = flows.slice(0, 20); // already sorted by risk

  // Cost bar chart data (top-20 by cost, sorted by server)
  const fmtM = (n: number) => '$' + (n / 1_000_000).toFixed(1) + 'M';
  const costBarData = costData.map((f) => ({
    name: f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name,
    fullName: f.name,
    opCost: f.opCost,
    devCost: f.devCost,
    totalCost: f.totalCost,
  }));

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

  // Criticality pie — filterable by flow
  const [critFlows, setCritFlows] = useState<string[]>([]);
  const flowsForPie = critFlows.length > 0 ? flows.filter((f) => critFlows.includes(f.name)) : flows;
  const critAgg: Record<string, number> = {};
  for (const f of flowsForPie) {
    for (const [k, v] of Object.entries(f.criticality)) {
      critAgg[k] = (critAgg[k] || 0) + v;
    }
  }
  const critPieData = Object.entries(critAgg)
    .filter(([k]) => k !== 'Unknown')
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Radar — filterable by flow (max 5 for readability)
  const [radarSelected, setRadarSelected] = useState<string[]>([]);
  const radarFlows = radarSelected.length > 0
    ? flows.filter((f) => radarSelected.includes(f.name)).slice(0, 5)
    : top20.slice(0, 5);
  const radarData = COMPLIANCE_FIELDS.map((field) => {
    const point: any = { subject: COMPLIANCE_LABELS[field] };
    radarFlows.forEach((f, i) => {
      point[`flow${i}`] = (f[field] as YNCount).yes;
    });
    return point;
  });
  const radarTitle = radarSelected.length > 0 ? 'Compliance Radar — Selected Flows' : 'Compliance Radar — Top 5 Riskiest Flows';

  // Summary
  const avgRisk = flows.length ? Math.round(flows.reduce((s, f) => s + f.riskScore, 0) / flows.length) : 0;
  const maxRisk = flows.length ? Math.max(...flows.map((f) => f.riskScore)) : 0;
  const totalApps = flows.reduce((s, f) => s + f.appCount, 0);

  return (
    <>
      {/* Cost Bar Chart — first */}
      {costBarData.length > 0 && (
        <Card title={`Top 20 Business Flows by Cost — ${costYear}`} size="small" style={{ marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={costBarData} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmtM(v)} width={70} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return <div style={{ background: '#fff', border: '1px solid #ccc', padding: 8, borderRadius: 4, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{d.fullName}</div>
                  <div style={{ color: '#1890ff' }}>Operation: {fmtM(d.opCost)}</div>
                  <div style={{ color: '#d29922' }}>Development: {fmtM(d.devCost)}</div>
                  <div style={{ fontWeight: 600 }}>Total: {fmtM(d.totalCost)}</div>
                </div>;
              }} />
              <Legend />
              <Bar dataKey="opCost" name="Operation Cost" stackId="a" fill="#1890ff" radius={[0, 0, 0, 0]} />
              <Bar dataKey="devCost" name="Development Cost" stackId="a" fill="#d29922" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

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
          <Card
            title="Application Criticality Distribution"
            size="small"
            extra={
              <Select
                mode="multiple"
                allowClear
                placeholder="All flows"
                style={{ minWidth: 200, maxWidth: 340 }}
                maxTagCount={2}
                value={critFlows}
                onChange={setCritFlows}
                showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={flows.map((f) => ({ label: f.name, value: f.name })).sort((a, b) => a.label.localeCompare(b.label))}
              />
            }
          >
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
        <Col xs={24} md={12}>
          <Card
            title={radarTitle}
            size="small"
            extra={
              <Select
                mode="multiple"
                allowClear
                placeholder="Top 5 by risk"
                style={{ minWidth: 200, maxWidth: 340 }}
                maxTagCount={2}
                value={radarSelected}
                onChange={(vals) => setRadarSelected(vals.slice(0, 5))}
                showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={flows.map((f) => ({ label: f.name, value: f.name })).sort((a, b) => a.label.localeCompare(b.label))}
              />
            }
          >
            {radarFlows.length < 2 ? (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                Select at least 2 flows to display the radar
              </div>
            ) : (
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
            )}
          </Card>
        </Col>
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
