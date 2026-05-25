import React, { useEffect, useState } from 'react';
import { Select, Spin, Alert, Card } from 'antd';
import axios from 'axios';

const { Option } = Select;

const REPORT_TYPES = [
  { value: 'detailed-cost', label: 'Detailed Cost Report' },
];

const ReportsPanel: React.FC = () => {
  const [reportType, setReportType]       = useState<string | null>(null);
  const [businessFlows, setBusinessFlows] = useState<string[]>([]);
  const [selectedFlow, setSelectedFlow]   = useState<string | null>(null);
  const [htmlContent, setHtmlContent]     = useState<string>('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // Fetch business flows when report type is set
  useEffect(() => {
    if (reportType !== 'detailed-cost') return;
    axios
      .get<string[]>('/api/reports/business-flows', { withCredentials: true })
      .then(r => setBusinessFlows(r.data))
      .catch(e => setError(e.response?.data?.error || e.message));
  }, [reportType]);

  // Fetch report whenever selectedFlow changes
  useEffect(() => {
    if (!selectedFlow || reportType !== 'detailed-cost') return;
    setLoading(true);
    setError(null);
    setHtmlContent('');
    axios
      .get<string>(`/api/reports/cost-by-process?businessFlow=${encodeURIComponent(selectedFlow)}`, {
        withCredentials: true,
        responseType: 'text',
      })
      .then(r => setHtmlContent(r.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [selectedFlow, reportType]);

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
            style={{ width: 220 }}
            value={reportType}
            onChange={val => {
              setReportType(val);
              setSelectedFlow(null);
              setHtmlContent('');
              setError(null);
            }}
          >
            {REPORT_TYPES.map(r => (
              <Option key={r.value} value={r.value}>{r.label}</Option>
            ))}
          </Select>
        </div>

        {reportType === 'detailed-cost' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Business Flow:</span>
            <Select
              placeholder="Select business flow"
              style={{ width: 220 }}
              value={selectedFlow}
              onChange={val => setSelectedFlow(val)}
              loading={businessFlows.length === 0 && !error}
            >
              {businessFlows.map(f => (
                <Option key={f} value={f}>{f}</Option>
              ))}
            </Select>
          </div>
        )}

        {loading && <Spin size="small" />}
      </Card>

      {error && (
        <Alert type="error" message={error} showIcon style={{ flexShrink: 0 }} />
      )}

      {!reportType && !error && (
        <div style={{ color: '#8b949e', marginTop: 16 }}>Select a report type to get started.</div>
      )}

      {htmlContent && !loading && (
        <iframe
          srcDoc={htmlContent}
          title="Cost Report"
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            minHeight: 'calc(100vh - 180px)',
            borderRadius: 8,
          }}
        />
      )}
    </div>
  );
};

export default ReportsPanel;
