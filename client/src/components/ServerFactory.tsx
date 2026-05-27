import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Checkbox, Descriptions, Drawer, Input, List, Popover, Table, Tag, Typography } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import { getServers } from '../api';
import type { ServerItem } from '../types';

interface ServerFactoryProps {
  defaultSearch?: string;
  readOnly?: boolean;
  userRole?: string | null;
  onNavigateToFactory?: (tab: string, search: string) => void;
}

const ALL_COLUMNS: { key: string; title: string; defaultVisible: boolean }[] = [
  { key: 'name', title: 'Server', defaultVisible: true },
  { key: 'hostName', title: 'Host Name', defaultVisible: true },
  { key: 'fqdn', title: 'FQDN', defaultVisible: false },
  { key: 'ipAddress', title: 'IP Address', defaultVisible: true },
  { key: 'environment', title: 'Environment', defaultVisible: true },
  { key: 'operationalStatus', title: 'Operational Status', defaultVisible: true },
  { key: 'installStatus', title: 'Install Status', defaultVisible: false },
  { key: 'os', title: 'OS', defaultVisible: true },
  { key: 'osVersion', title: 'OS Version', defaultVisible: false },
  { key: 'supportGroup', title: 'Support Group', defaultVisible: true },
  { key: 'location', title: 'Location', defaultVisible: false },
  { key: 'cpuCount', title: 'CPU', defaultVisible: false },
  { key: 'ram', title: 'RAM', defaultVisible: false },
  { key: 'linkedApplications', title: 'Applications', defaultVisible: true },
];

export default function ServerFactory({ defaultSearch, onNavigateToFactory }: ServerFactoryProps) {
  const { message } = AntApp.useApp();
  const [items, setItems] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(defaultSearch || '');
  const [detail, setDetail] = useState<ServerItem | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key))
  );

  const environmentFilters = useMemo(
    () => [...new Set(items.map((item) => item.environment).filter((value): value is string => Boolean(value)))].sort().map((value) => ({ text: value, value })),
    [items]
  );

  const operationalStatusFilters = useMemo(
    () => [...new Set(items.map((item) => item.operationalStatus).filter((value): value is string => Boolean(value)))].sort().map((value) => ({ text: value, value })),
    [items]
  );

  const loadItems = useCallback(async (searchValue?: string) => {
    setLoading(true);
    try {
      const data = await getServers(searchValue ? { search: searchValue } : undefined);
      setItems(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    setSearch(defaultSearch || '');
  }, [defaultSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadItems(search.trim() || undefined);
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [loadItems, search]);

  const toggleColumn = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showAll = () => setVisibleKeys(new Set(ALL_COLUMNS.map((column) => column.key)));
  const showDefaults = () => setVisibleKeys(new Set(ALL_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key)));

  const allColumnDefs: ColumnsType<ServerItem> = useMemo(() => [
    {
      title: 'Server', dataIndex: 'name', key: 'name', width: 260, fixed: 'left' as const,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (value: string, record: ServerItem) => <a onClick={() => setDetail(record)}>{value}</a>,
    },
    { title: 'Host Name', dataIndex: 'hostName', key: 'hostName', width: 220, ellipsis: true },
    { title: 'FQDN', dataIndex: 'fqdn', key: 'fqdn', width: 260, ellipsis: true },
    { title: 'IP Address', dataIndex: 'ipAddress', key: 'ipAddress', width: 140 },
    {
      title: 'Environment', dataIndex: 'environment', key: 'environment', width: 120,
      filters: environmentFilters,
      onFilter: (value, record) => record.environment === String(value),
    },
    {
      title: 'Operational Status', dataIndex: 'operationalStatus', key: 'operationalStatus', width: 160,
      filters: operationalStatusFilters,
      onFilter: (value, record) => record.operationalStatus === String(value),
      render: (value?: string | null) => value ? <Tag color={/operational|in use/i.test(value) ? 'green' : 'gold'}>{value}</Tag> : '—',
    },
    { title: 'Install Status', dataIndex: 'installStatus', key: 'installStatus', width: 140 },
    { title: 'OS', dataIndex: 'os', key: 'os', width: 170, ellipsis: true },
    { title: 'OS Version', dataIndex: 'osVersion', key: 'osVersion', width: 180, ellipsis: true },
    { title: 'Support Group', dataIndex: 'supportGroup', key: 'supportGroup', width: 220, ellipsis: true },
    { title: 'Location', dataIndex: 'location', key: 'location', width: 280, ellipsis: true },
    { title: 'CPU', dataIndex: 'cpuCount', key: 'cpuCount', width: 90 },
    { title: 'RAM', dataIndex: 'ram', key: 'ram', width: 100, render: (value?: number | null) => value ? value.toLocaleString() : '—' },
    {
      title: 'Applications', dataIndex: 'linkedApplications', key: 'linkedApplications', width: 320, ellipsis: true,
      render: (applications: ServerItem['linkedApplications']) => {
        const appList = applications || [];
        if (!appList.length) return '—';
        return (
          <span>
            {appList.slice(0, 3).map((application, index) => {
              const label = application.name || application.correlationId || 'Unknown';
              return (
                <span key={`${application.correlationId || label}-${index}`}>
                  {index > 0 && ', '}
                  <Typography.Link onClick={() => onNavigateToFactory?.('applications', application.correlationId || label)}>
                    {label}
                  </Typography.Link>
                </span>
              );
            })}
            {appList.length > 3 ? ` +${appList.length - 3} more` : ''}
          </span>
        );
      },
    },
  ], [environmentFilters, onNavigateToFactory, operationalStatusFilters]);

  const columns = allColumnDefs.filter((column) => visibleKeys.has(String(column.key)));
  const scrollX = columns.reduce((sum, column) => sum + ((column.width as number) || 160), 0);

  const columnToggleContent = (
    <div style={{ maxHeight: 360, overflowY: 'auto', width: 220 }}>
      <div className="flex gap-2 mb-2 border-b pb-2">
        <Button size="small" type="link" onClick={showAll}>All</Button>
        <Button size="small" type="link" onClick={showDefaults}>Defaults</Button>
      </div>
      {ALL_COLUMNS.map((column) => (
        <div key={column.key} className="py-0.5">
          <Checkbox checked={visibleKeys.has(column.key)} onChange={() => toggleColumn(column.key)}>
            <span className="text-xs">{column.title}</span>
          </Checkbox>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by server, host, IP, or application…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 320 }}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Popover content={columnToggleContent} title="Toggle Columns" trigger="click" placement="bottomRight">
          <Button size="small" icon={<SettingOutlined />}>Columns</Button>
        </Popover>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{items.length} servers</span>
      </div>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (total) => `${total} items` }}
        className="flex-1"
        scroll={{ x: scrollX, y: 'calc(100vh - 220px)' }}
      />

      <Drawer title={detail?.name} open={!!detail} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Host Name">{detail.hostName || '—'}</Descriptions.Item>
            <Descriptions.Item label="FQDN">{detail.fqdn || '—'}</Descriptions.Item>
            <Descriptions.Item label="IP Address">{detail.ipAddress || '—'}</Descriptions.Item>
            <Descriptions.Item label="Server System ID">{detail.serverSystemId || '—'}</Descriptions.Item>
            <Descriptions.Item label="Environment">{detail.environment || '—'}</Descriptions.Item>
            <Descriptions.Item label="Operational Status">{detail.operationalStatus || '—'}</Descriptions.Item>
            <Descriptions.Item label="Install Status">{detail.installStatus || '—'}</Descriptions.Item>
            <Descriptions.Item label="Lifecycle">{[detail.lifecycleStage, detail.lifecycleStatus].filter(Boolean).join(' | ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="OS">{[detail.os, detail.osVersion].filter(Boolean).join(' | ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="Support Group">{detail.supportGroup || '—'}</Descriptions.Item>
            <Descriptions.Item label="Managed By Group">{detail.managedByGroup || '—'}</Descriptions.Item>
            <Descriptions.Item label="Location">{detail.location || '—'}</Descriptions.Item>
            <Descriptions.Item label="Hardware">{[detail.manufacturer, detail.modelNumber, detail.serialNumber].filter(Boolean).join(' | ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="CPU / RAM">{[detail.cpuCount ? `${detail.cpuCount} CPU` : null, detail.ram ? `${detail.ram.toLocaleString()} RAM` : null].filter(Boolean).join(' | ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="Applications">
              {detail.linkedApplications?.length ? (
                <List
                  size="small"
                  dataSource={detail.linkedApplications}
                  renderItem={(application) => {
                    const label = application.name || application.correlationId || 'Unknown';
                    return (
                      <List.Item style={{ paddingInline: 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Typography.Link onClick={() => onNavigateToFactory?.('applications', application.correlationId || label)}>
                            {label}
                          </Typography.Link>
                          <span className="text-xs text-gray-500">
                            {[application.correlationId, application.acronym, application.relationType].filter(Boolean).join(' | ') || 'No relation metadata'}
                          </span>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              ) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}