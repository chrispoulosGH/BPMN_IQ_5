import React, { useEffect, useMemo, useState } from 'react';
import { Select, Spin, Alert, Card, Table, Tag, Typography } from 'antd';
import axios from 'axios';
import { getApplicationServers, getRefItems, getServers } from '../api';
import type { ApplicationItem, ServerItem } from '../types';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

const REPORT_TYPES = [
  { value: 'detailed-cost', label: 'Detailed Cost Report' },
  { value: 'application-servers', label: 'Application to Servers Report' },
];

interface ApplicationServerReportRow extends ServerItem {
  matchedApplications: string[];
}

function extractFallbackIdentifiers(app: ApplicationItem): { correlationIds: string[]; searchTerms: string[] } {
  const correlationIds = new Set<string>();
  const searchTerms = new Set<string>();

  const explicitCorrelationId = (app.correlationId || '').trim();
  const explicitAcronym = (app.acronym || '').trim();
  const explicitName = (app.name || '').trim();

  if (explicitCorrelationId) correlationIds.add(explicitCorrelationId);
  if (explicitAcronym) searchTerms.add(explicitAcronym);
  if (explicitName) searchTerms.add(explicitName);

  const numericTokens = explicitName.match(/\b\d{3,}\b/g) || [];
  for (const token of numericTokens) correlationIds.add(token);

  const leadingTokenMatch = explicitName.match(/^([^([]+?)\s*\(\d+\)\s*$/);
  if (leadingTokenMatch?.[1]) {
    searchTerms.add(leadingTokenMatch[1].trim());
  }

  return {
    correlationIds: [...correlationIds],
    searchTerms: [...searchTerms],
  };
}

async function fetchServersForApplication(app: ApplicationItem): Promise<ServerItem[]> {
  const { correlationIds, searchTerms } = extractFallbackIdentifiers(app);
  const seen = new Map<string, ServerItem>();

  for (const correlationId of correlationIds) {
    const servers = await getApplicationServers(correlationId);
    for (const server of servers) {
      const key = server._id || server.sourceKey;
      if (!key || seen.has(key)) continue;
      seen.set(key, server);
    }
    if (seen.size > 0) return [...seen.values()];
  }

  for (const term of searchTerms) {
    const servers = await getServers({ search: term });
    for (const server of servers) {
      const key = server._id || server.sourceKey;
      if (!key || seen.has(key)) continue;
      seen.set(key, server);
    }
    if (seen.size > 0) return [...seen.values()];
  }

  return [];
}

const ReportsPanel: React.FC = () => {
  const [reportType, setReportType]       = useState<string | null>(null);
  const [businessFlows, setBusinessFlows] = useState<string[]>([]);
  const [selectedFlow, setSelectedFlow]   = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [applicationServerRows, setApplicationServerRows] = useState<ApplicationServerReportRow[]>([]);
  const [htmlContent, setHtmlContent]     = useState<string>('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const selectedApplications = useMemo(
    () => applications.filter((app) => selectedApplicationIds.includes(app._id)),
    [applications, selectedApplicationIds],
  );

  const applicationOptions = useMemo(
    () => applications.map((app) => {
      const correlationId = (app.correlationId || '').trim();
      const acronym = (app.acronym || '').trim();
      const labelParts = [app.name];
      if (acronym) labelParts.push(`[${acronym}]`);
      if (correlationId) labelParts.push(`(${correlationId})`);
      return {
        value: app._id,
        label: labelParts.join(' '),
        searchText: [app.name, acronym, correlationId].filter(Boolean).join(' ').toLowerCase(),
      };
    }),
    [applications],
  );

  const serverColumns: ColumnsType<ApplicationServerReportRow> = [
    {
      title: 'Server',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      ellipsis: true,
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
    },
    {
      title: 'Matched Applications',
      dataIndex: 'matchedApplications',
      key: 'matchedApplications',
      width: 320,
      render: (apps: string[]) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {apps.map((app) => (
            <Tag key={app} color="blue" style={{ marginInlineEnd: 0 }}>{app}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: 'Host Name',
      dataIndex: 'hostName',
      key: 'hostName',
      width: 200,
      ellipsis: true,
      render: (v?: string | null) => v || '—',
    },
    {
      title: 'FQDN',
      dataIndex: 'fqdn',
      key: 'fqdn',
      width: 260,
      ellipsis: true,
      render: (v?: string | null) => v || '—',
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 150,
      render: (v?: string | null) => v || '—',
    },
    {
      title: 'Environment',
      dataIndex: 'environment',
      key: 'environment',
      width: 140,
      render: (v?: string | null) => v || '—',
    },
    {
      title: 'Lifecycle Status',
      dataIndex: 'lifecycleStatus',
      key: 'lifecycleStatus',
      width: 160,
      render: (v?: string | null) => v || '—',
    },
    {
      title: 'Operating System',
      dataIndex: 'os',
      key: 'os',
      width: 200,
      render: (v?: string | null) => v || '—',
    },
  ];

  // Fetch business flows when detailed-cost report type is set
  useEffect(() => {
    if (reportType !== 'detailed-cost') return;
    axios
      .get<string[]>('/api/reports/business-flows', { withCredentials: true })
      .then(r => setBusinessFlows(r.data))
      .catch(e => setError(e.response?.data?.error || e.message));
  }, [reportType]);

  // Fetch application list when application->servers report type is set
  useEffect(() => {
    if (reportType !== 'application-servers') return;
    setLoading(true);
    setError(null);
    getRefItems('applications')
      .then((apps) => setApplications((apps as ApplicationItem[]).sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e: any) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [reportType]);

  // Fetch detailed cost report when a flow is selected
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

  // Fetch and aggregate servers for selected applications
  useEffect(() => {
    if (reportType !== 'application-servers') return;
    if (!selectedApplications.length) {
      setApplicationServerRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      selectedApplications.map(async (app) => {
        const servers = await fetchServersForApplication(app);
        return { app, servers };
      })
    )
      .then((results) => {
        if (cancelled) return;
        const byServerKey = new Map<string, ApplicationServerReportRow>();

        for (const result of results) {
          for (const server of result.servers) {
            const key =
              server._id ||
              server.sourceKey ||
              [server.name, server.hostName, server.fqdn, server.ipAddress].filter(Boolean).join('||');
            if (!key) continue;

            if (!byServerKey.has(key)) {
              byServerKey.set(key, {
                ...server,
                matchedApplications: [],
              });
            }

            const row = byServerKey.get(key)!;
            if (!row.matchedApplications.includes(result.app.name)) {
              row.matchedApplications.push(result.app.name);
            }
          }
        }

        const rows = [...byServerKey.values()]
          .map((row) => ({
            ...row,
            matchedApplications: [...row.matchedApplications].sort((a, b) => a.localeCompare(b)),
          }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setApplicationServerRows(rows);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.response?.data?.error || e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportType, selectedApplications]);

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
              setReportType(val);
              setSelectedFlow(null);
              setSelectedApplicationIds([]);
              setApplicationServerRows([]);
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

        {reportType === 'application-servers' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 520 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Applications:</span>
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Search and select one or more applications"
              style={{ minWidth: 420, flex: 1 }}
              value={selectedApplicationIds}
              onChange={(vals) => setSelectedApplicationIds(vals)}
              options={applicationOptions}
              filterOption={(input, option) => {
                const needle = input.trim().toLowerCase();
                if (!needle) return true;
                return String(option?.searchText || option?.label || '').includes(needle);
              }}
              maxTagCount="responsive"
              loading={loading && applications.length === 0}
            />
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

      {reportType === 'application-servers' && !loading && selectedApplicationIds.length > 0 && (
        <Card
          size="small"
          title="Server Listing"
          extra={
            <Typography.Text type="secondary">
              {applicationServerRows.length} server{applicationServerRows.length === 1 ? '' : 's'} found for {selectedApplicationIds.length} selected application{selectedApplicationIds.length === 1 ? '' : 's'}
            </Typography.Text>
          }
          bodyStyle={{ paddingTop: 8 }}
        >
          <Table
            rowKey={(r) => r._id || r.sourceKey || `${r.name}-${r.hostName}-${r.fqdn}-${r.ipAddress}`}
            dataSource={applicationServerRows}
            columns={serverColumns}
            size="small"
            pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'] }}
            scroll={{ x: 1650, y: 'calc(100vh - 330px)' }}
          />
        </Card>
      )}
    </div>
  );
};

export default ReportsPanel;
