import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Select, Spin, Alert, Card } from 'antd';
import api from '../api';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const { Option } = Select;

type ReportType = 'cost-summary' | 'detailed-cost';

interface CostSummaryFlow {
  name: string;
  totalCost: number;
  taskCount: number;
  applicationCount: number;
}

interface CostSummaryData {
  generatedDate: string;
  totalPortfolioCost: number;
  totalTaskCount: number;
  totalApplicationCount: number;
  flows: CostSummaryFlow[];
}

const REPORT_TYPES = [
  { value: 'cost-summary', label: 'Business Flow Cost Summary Report' },
];

const SUMMARY_PIE_COLORS = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d'];
const SUMMARY_TOP_FLOW_COUNT = 6;

function formatMillions(value: number): string {
  return `$${(value / 1_000_000).toFixed(2)}M`;
}

const ReportsPanel: React.FC = () => {
  const [reportType, setReportType]       = useState<ReportType | null>(null);
  const [businessFlows, setBusinessFlows] = useState<string[]>([]);
  const [selectedFlow, setSelectedFlow]   = useState<string | null>(null);
  const [summaryData, setSummaryData]     = useState<CostSummaryData | null>(null);
  const [htmlContent, setHtmlContent]     = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeTitle = reportType === 'cost-summary'
    ? `Business Flow Cost Report${selectedFlow ? ` — ${selectedFlow}` : ''}`
    : 'Business Flow Cost Report';

  const navigateReportHref = useCallback((href: string) => {
    const url = new URL(href, window.location.origin);
    if (url.pathname === '/api/reports/cost-summary') {
      setReportType('cost-summary');
      setSelectedFlow(null);
      setError(null);
      return true;
    }

    if (url.pathname === '/api/reports/cost-by-process') {
      const businessFlow = url.searchParams.get('businessFlow');
      if (!businessFlow) return false;
      setReportType('detailed-cost');
      setSelectedFlow(businessFlow);
      setError(null);
      return true;
    }

    return false;
  }, []);

  const handleReportFrameLoad = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    doc.onclick = (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a');
      const href = anchor?.getAttribute('href');
      if (!href) return;
      if (!navigateReportHref(href)) return;
      event.preventDefault();
    };
  }, [navigateReportHref]);

  // Fetch summary data for the split-view summary mode.
  useEffect(() => {
    if (reportType !== 'cost-summary') return;
    setSummaryLoading(true);
    setError(null);
    api
      .get<CostSummaryData>('/reports/cost-summary-data')
      .then((response) => {
        const data = response.data;
        setSummaryData(data);
        setBusinessFlows(data.flows.map((flow) => flow.name));
        setSelectedFlow((current) => {
          if (current && data.flows.some((flow) => flow.name === current)) return current;
          return data.flows[0]?.name ?? null;
        });
      })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setSummaryLoading(false));
  }, [reportType]);

  // Fetch detail report HTML when a business flow is selected.
  useEffect(() => {
    if (!selectedFlow) return;
    if (reportType !== 'cost-summary') return;
    setDetailLoading(true);
    setError(null);
    setHtmlContent('');
    const endpoint = `/api/reports/cost-by-process?businessFlow=${encodeURIComponent(selectedFlow)}`;
    api
      .get<string>(`/reports/cost-by-process?businessFlow=${encodeURIComponent(selectedFlow)}`, {
        responseType: 'text',
      })
      .then(r => setHtmlContent(r.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setDetailLoading(false));
  }, [selectedFlow, reportType]);

  const pieData = useMemo(() => {
    if (!summaryData) return [] as Array<{ name: string; value: number; flowName: string | null; fill: string }>;
    const topFlows = summaryData.flows.slice(0, SUMMARY_TOP_FLOW_COUNT).map((flow, index) => ({
      name: flow.name,
      value: flow.totalCost,
      flowName: flow.name,
      fill: SUMMARY_PIE_COLORS[index % SUMMARY_PIE_COLORS.length],
    }));
    const remainingTotal = summaryData.flows.slice(SUMMARY_TOP_FLOW_COUNT).reduce((sum, flow) => sum + flow.totalCost, 0);
    return remainingTotal > 0
      ? [...topFlows, { name: 'All Other Flows', value: remainingTotal, flowName: null, fill: '#475569' }]
      : topFlows;
  }, [summaryData]);

  const selectedFlowData = summaryData?.flows.find((flow) => flow.name === selectedFlow) ?? null;

  const renderDetailFrame = () => {
    if (detailLoading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      );
    }

    if (!htmlContent) {
      return <div style={{ color: '#8b949e', padding: 24 }}>Select a business flow to load the detail report.</div>;
    }

    return (
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        title={iframeTitle}
        onLoad={handleReportFrameLoad}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          minHeight: 'calc(var(--app-h) - 240px)',
          borderRadius: 8,
          background: '#fff',
        }}
      />
    );
  };

  const renderCostSummaryLayout = () => {
    if (summaryLoading && !summaryData) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      );
    }

    if (!summaryData) {
      return <div style={{ color: '#8b949e', marginTop: 16 }}>No summary data available.</div>;
    }

    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
        <Card
          title="Relative Cost Share"
          size="small"
          style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, height: '100%', overflow: 'hidden' }}
          extra={<span style={{ color: '#8b949e', fontSize: 12 }}>{summaryData.generatedDate}</span>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flows</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{summaryData.flows.length}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasks</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{summaryData.totalTaskCount}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{formatMillions(summaryData.totalPortfolioCost)}</div>
            </div>
          </div>

          <div style={{ height: 420, padding: '8px 0 16px', flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={122}
                  paddingAngle={2}
                  onClick={(entry: any) => {
                    const flowName = entry?.flowName ?? entry?.payload?.flowName;
                    if (flowName) setSelectedFlow(flowName);
                  }}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={entry.fill}
                      stroke={selectedFlow === entry.flowName ? '#0f172a' : '#ffffff'}
                      strokeWidth={selectedFlow === entry.flowName ? 3 : 1}
                    />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: any) => formatMillions(Number(value || 0)) as any} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {pieData.map((entry, index) => {
              const pct = summaryData.totalPortfolioCost ? (entry.value / summaryData.totalPortfolioCost) * 100 : 0;
              return (
                <div
                  key={entry.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '12px minmax(0, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    borderRadius: 8,
                    padding: '4px 6px',
                    background: selectedFlow === entry.flowName ? '#eff6ff' : 'transparent',
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: entry.fill, display: 'inline-block' }} />
                  <span style={{ minWidth: 0, fontSize: 12, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {index + 1}. {entry.name}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
            The chart shows the top {SUMMARY_TOP_FLOW_COUNT} business flows plus an aggregated Other slice. Use the ranked list below for full selection detail.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflowY: 'auto', paddingRight: 4, paddingBottom: 4 }}>
            {summaryData.flows.map((flow, index) => {
              const isActive = flow.name === selectedFlow;
              const pct = summaryData.totalPortfolioCost ? (flow.totalCost / summaryData.totalPortfolioCost) * 100 : 0;
              return (
                <button
                  key={flow.name}
                  type="button"
                  onClick={() => setSelectedFlow(flow.name)}
                  style={{
                    border: isActive ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: isActive ? '#eff6ff' : '#ffffff',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '28px minmax(0, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{index + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flow.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{flow.taskCount} tasks · {flow.applicationCount} app links · {pct.toFixed(1)}%</div>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>{formatMillions(flow.totalCost)}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card
          title={selectedFlow ? `Business Flow Cost Report — ${selectedFlow}` : 'Business Flow Cost Report'}
          size="small"
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', padding: 12 }}
          extra={selectedFlowData ? <span style={{ color: '#64748b', fontSize: 12 }}>{selectedFlowData.taskCount} tasks · {selectedFlowData.applicationCount} app links</span> : null}
        >
          {renderDetailFrame()}
        </Card>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        size="small"
        style={{ flexShrink: 0 }}
        bodyStyle={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Report Type:</span>
          <Select
            placeholder="Choose a report"
            style={{ width: 260 }}
            value={reportType}
            onChange={val => {
              setReportType(val as ReportType);
              setSelectedFlow(null);
              setSummaryData(null);
              setHtmlContent('');
              setError(null);
            }}
          >
            {REPORT_TYPES.map(r => (
              <Option key={r.value} value={r.value}>{r.label}</Option>
            ))}
          </Select>
        </div>

        {(summaryLoading || detailLoading) && <Spin size="small" />}
      </Card>

      {error && (
        <Alert type="error" message={error} showIcon style={{ flexShrink: 0 }} />
      )}

      {!reportType && !error && (
        <div style={{ color: '#8b949e', marginTop: 16 }}>Select a report type to get started.</div>
      )}

      {reportType === 'cost-summary' && renderCostSummaryLayout()}
    </div>
  );
};

export default ReportsPanel;
