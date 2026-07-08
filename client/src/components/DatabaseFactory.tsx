import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Checkbox, Descriptions, Drawer, Input, List, Popover, Table, Tag, Tooltip, Typography } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { FilterValue } from 'antd/es/table/interface';

import { deleteDatabase, getDatabases } from '../api';
import type { DatabaseItem } from '../types';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';
import { matchesFactorySearch, parseFactorySearch, encodeExactFactorySearch } from '../utils/factorySearch';

interface DatabaseFactoryProps {
  defaultSearch?: string;
  readOnly?: boolean;
  userRole?: string | null;
  onNavigateToFactory?: (tab: string, search: string) => void;
  onDeleteAllComponents?: () => void;
  deleteLoading?: boolean;
}

const ALL_COLUMNS: { key: string; title: string; defaultVisible: boolean }[] = [
  { key: '_id', title: 'ID', defaultVisible: false },
  { key: 'sourceKey', title: 'Source Key', defaultVisible: false },
  { key: 'name', title: 'Database', defaultVisible: true },
  { key: 'instanceName', title: 'Instance Name', defaultVisible: true },
  { key: 'databaseClassName', title: 'Class', defaultVisible: true },
  { key: 'normalizedVendor', title: 'Vendor', defaultVisible: true },
  { key: 'version', title: 'Version', defaultVisible: true },
  { key: 'serviceName', title: 'Service', defaultVisible: true },
  { key: 'applicationName', title: 'Primary Application', defaultVisible: true },
  { key: 'applicationCorrelationId', title: 'Application Correlation ID', defaultVisible: false },
  { key: 'applicationAcronym', title: 'Application Acronym', defaultVisible: false },
  { key: 'apmNumber', title: 'APM Number', defaultVisible: false },
  { key: 'applicationInstallStatus', title: 'Application Install Status', defaultVisible: false },
  { key: 'applicationOwner', title: 'Application Owner', defaultVisible: true },
  { key: 'lowestLevelOwner', title: 'L5 Owner', defaultVisible: false },
  { key: 'lowestLevelOwnerUserName', title: 'L5 Owner User', defaultVisible: false },
  { key: 'ownedBy', title: 'Owned By', defaultVisible: false },
  { key: 'location', title: 'Location', defaultVisible: true },
  { key: 'lifecycleStageStatus', title: 'Lifecycle Status', defaultVisible: true },
  { key: 'linkedApplications', title: 'Applications', defaultVisible: true },
  { key: 'healthNotes', title: 'Notes', defaultVisible: true },
  { key: 'createdAt', title: 'Created At', defaultVisible: false },
  { key: 'updatedAt', title: 'Updated At', defaultVisible: false },
];

export default function DatabaseFactory({ defaultSearch, onNavigateToFactory, readOnly, onDeleteAllComponents, deleteLoading }: DatabaseFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<DatabaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [exactSearch, setExactSearch] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [detail, setDetail] = useState<DatabaseItem | null>(null);
  const [tableFilters, setTableFilters] = useState<Record<string, FilterValue | null>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key))
  );

  useEffect(() => {
    if (defaultSearch !== undefined) {
      const parsed = parseFactorySearch(defaultSearch);
      setSearch(parsed.term);
      setExactSearch(parsed.exact);
    }
  }, [defaultSearch]);

  const toFilterValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  };

  const buildFilters = (values: string[]) =>
    [...new Set(values)]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 500)
      .map((value) => ({ text: value, value }));

  const searchToken = exactSearch ? encodeExactFactorySearch(search) : search;
  const filtered = search
    ? items.filter((i) => {
        return matchesFactorySearch([i.name, i.instanceName, i.applicationName, i.databaseClassName], searchToken);
      })
    : items;

  const columnFilters = useMemo(() => ({
    _id: buildFilters(items.map((item) => toFilterValue(item._id))),
    sourceKey: buildFilters(items.map((item) => toFilterValue(item.sourceKey))),
    name: buildFilters(items.map((item) => toFilterValue(item.name))),
    instanceName: buildFilters(items.map((item) => toFilterValue(item.instanceName))),
    databaseClassName: buildFilters(items.map((item) => toFilterValue(item.databaseClassName))),
    normalizedVendor: buildFilters(items.map((item) => toFilterValue(item.normalizedVendor || item.vendor))),
    version: buildFilters(items.map((item) => toFilterValue(item.version))),
    serviceName: buildFilters(items.map((item) => toFilterValue(item.serviceName))),
    applicationName: buildFilters(items.map((item) => toFilterValue(item.applicationName))),
    applicationCorrelationId: buildFilters(items.map((item) => toFilterValue(item.applicationCorrelationId))),
    applicationAcronym: buildFilters(items.map((item) => toFilterValue(item.applicationAcronym))),
    apmNumber: buildFilters(items.map((item) => toFilterValue(item.apmNumber))),
    applicationInstallStatus: buildFilters(items.map((item) => toFilterValue(item.applicationInstallStatus))),
    applicationOwner: buildFilters(items.map((item) => toFilterValue(item.applicationOwner))),
    lowestLevelOwner: buildFilters(items.map((item) => toFilterValue(item.lowestLevelOwner))),
    lowestLevelOwnerUserName: buildFilters(items.map((item) => toFilterValue(item.lowestLevelOwnerUserName))),
    ownedBy: buildFilters(items.map((item) => toFilterValue(item.ownedBy))),
    location: buildFilters(items.map((item) => toFilterValue(item.location))),
    lifecycleStageStatus: buildFilters(items.map((item) => toFilterValue(item.lifecycleStageStatus))),
    linkedApplications: buildFilters(
      items.flatMap((item) => {
        const labels = (item.linkedApplications || []).map((application) => toFilterValue(application.name || application.correlationId));
        return labels.length ? labels : ['—'];
      })
    ),
    healthNotes: buildFilters(
      items.flatMap((item) => (item.healthNotes || []).map((note) => String(note.label || '').trim()).filter(Boolean))
    ),
    createdAt: buildFilters(items.map((item) => toFilterValue(item.createdAt))),
    updatedAt: buildFilters(items.map((item) => toFilterValue(item.updatedAt))),
  }), [items]);

  const loadItems = useCallback(async (searchValue?: string) => {
    setLoading(true);
    try {
      const data = await getDatabases(searchValue ? { search: searchValue } : undefined);
      setItems(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  const handleBulkDelete = () => {
    if (!selectedRowKeys.length) return;
    modal.confirm({
      title: `Delete ${selectedRowKeys.length} selected databases?`,
      content: `This will permanently remove ${selectedRowKeys.length} selected databases.`,
      okText: 'Delete Selected',
      okButtonProps: { danger: true },
      onOk: async () => {
        await Promise.all(selectedRowKeys.map((id) => deleteDatabase(id)));
        message.success(`Deleted ${selectedRowKeys.length} databases`);
        setSelectedRowKeys([]);
        loadItems(search.trim() || undefined);
      },
    });
  };

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
  const showNone = () => setVisibleKeys(new Set());

  const renderNoteHover = (note: NonNullable<DatabaseItem['healthNotes']>[number]) => (
    <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{note.label}</div>
      <div>{note.note}</div>
      {note.rationale ? <div><strong>Why:</strong> {note.rationale}</div> : null}
      {note.decisionFactors?.length ? (
        <div>
          <strong>Decision Factors:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {note.decisionFactors.map((factor, idx) => <li key={`${note.label}-factor-${idx}`}>{factor}</li>)}
          </ul>
        </div>
      ) : null}
      {note.vulnerabilities?.length ? (
        <div>
          <strong>Known Vulnerabilities to Check:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {note.vulnerabilities.map((item, idx) => <li key={`${note.label}-vuln-${idx}`}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {note.sourceUrl ? (
        <Typography.Link href={note.sourceUrl} target="_blank" rel="noopener noreferrer">
          Source Reference
        </Typography.Link>
      ) : null}
    </div>
  );

  const allColumnDefs: ColumnsType<DatabaseItem> = useMemo(() => [
    {
      title: 'ID', dataIndex: '_id', key: '_id', width: 260, ellipsis: true,
      filters: columnFilters._id,
      onFilter: (value, record) => toFilterValue(record._id) === String(value),
    },
    {
      title: 'Source Key', dataIndex: 'sourceKey', key: 'sourceKey', width: 280, ellipsis: true,
      filters: columnFilters.sourceKey,
      onFilter: (value, record) => toFilterValue(record.sourceKey) === String(value),
    },
    {
      title: 'Database', dataIndex: 'name', key: 'name', width: 320, fixed: 'left' as const,
      sorter: (a, b) => a.name.localeCompare(b.name),
      filters: columnFilters.name,
      onFilter: (value, record) => toFilterValue(record.name) === String(value),
      render: (value: string, record: DatabaseItem) => <a onClick={() => setDetail(record)}>{value}</a>,
    },
    {
      title: 'Instance Name', dataIndex: 'instanceName', key: 'instanceName', width: 320, ellipsis: true,
      filters: columnFilters.instanceName,
      onFilter: (value, record) => toFilterValue(record.instanceName) === String(value),
    },
    {
      title: 'Class', dataIndex: 'databaseClassName', key: 'databaseClassName', width: 180, ellipsis: true,
      filters: columnFilters.databaseClassName,
      onFilter: (value, record) => toFilterValue(record.databaseClassName) === String(value),
    },
    {
      title: 'Vendor', dataIndex: 'normalizedVendor', key: 'normalizedVendor', width: 180, ellipsis: true,
      filters: columnFilters.normalizedVendor,
      onFilter: (value, record) => toFilterValue(record.normalizedVendor || record.vendor) === String(value),
      render: (_value, record) => record.normalizedVendor || record.vendor || '—',
    },
    {
      title: 'Version', dataIndex: 'version', key: 'version', width: 140,
      filters: columnFilters.version,
      onFilter: (value, record) => toFilterValue(record.version) === String(value),
    },
    {
      title: 'Service', dataIndex: 'serviceName', key: 'serviceName', width: 220, ellipsis: true,
      filters: columnFilters.serviceName,
      onFilter: (value, record) => toFilterValue(record.serviceName) === String(value),
    },
    {
      title: 'Primary Application', dataIndex: 'applicationName', key: 'applicationName', width: 260, ellipsis: true,
      filters: columnFilters.applicationName,
      onFilter: (value, record) => toFilterValue(record.applicationName) === String(value),
      render: (value, record) => {
        const label = value || record.applicationCorrelationId || '—';
        if (label === '—') return label;
        return <Typography.Link onClick={() => onNavigateToFactory?.('applications', record.applicationCorrelationId || String(label))}>{label}</Typography.Link>;
      },
    },
    {
      title: 'Application Correlation ID', dataIndex: 'applicationCorrelationId', key: 'applicationCorrelationId', width: 180, ellipsis: true,
      filters: columnFilters.applicationCorrelationId,
      onFilter: (value, record) => toFilterValue(record.applicationCorrelationId) === String(value),
    },
    {
      title: 'Application Acronym', dataIndex: 'applicationAcronym', key: 'applicationAcronym', width: 180, ellipsis: true,
      filters: columnFilters.applicationAcronym,
      onFilter: (value, record) => toFilterValue(record.applicationAcronym) === String(value),
    },
    {
      title: 'APM Number', dataIndex: 'apmNumber', key: 'apmNumber', width: 140, ellipsis: true,
      filters: columnFilters.apmNumber,
      onFilter: (value, record) => toFilterValue(record.apmNumber) === String(value),
    },
    {
      title: 'Application Install Status', dataIndex: 'applicationInstallStatus', key: 'applicationInstallStatus', width: 180, ellipsis: true,
      filters: columnFilters.applicationInstallStatus,
      onFilter: (value, record) => toFilterValue(record.applicationInstallStatus) === String(value),
    },
    {
      title: 'Application Owner', dataIndex: 'applicationOwner', key: 'applicationOwner', width: 220, ellipsis: true,
      filters: columnFilters.applicationOwner,
      onFilter: (value, record) => toFilterValue(record.applicationOwner) === String(value),
    },
    {
      title: 'L5 Owner', dataIndex: 'lowestLevelOwner', key: 'lowestLevelOwner', width: 220, ellipsis: true,
      filters: columnFilters.lowestLevelOwner,
      onFilter: (value, record) => toFilterValue(record.lowestLevelOwner) === String(value),
    },
    {
      title: 'L5 Owner User', dataIndex: 'lowestLevelOwnerUserName', key: 'lowestLevelOwnerUserName', width: 180, ellipsis: true,
      filters: columnFilters.lowestLevelOwnerUserName,
      onFilter: (value, record) => toFilterValue(record.lowestLevelOwnerUserName) === String(value),
    },
    {
      title: 'Owned By', dataIndex: 'ownedBy', key: 'ownedBy', width: 180, ellipsis: true,
      filters: columnFilters.ownedBy,
      onFilter: (value, record) => toFilterValue(record.ownedBy) === String(value),
    },
    {
      title: 'Location', dataIndex: 'location', key: 'location', width: 220, ellipsis: true,
      filters: columnFilters.location,
      onFilter: (value, record) => toFilterValue(record.location) === String(value),
    },
    {
      title: 'Lifecycle Status', dataIndex: 'lifecycleStageStatus', key: 'lifecycleStageStatus', width: 180, ellipsis: true,
      filters: columnFilters.lifecycleStageStatus,
      onFilter: (value, record) => toFilterValue(record.lifecycleStageStatus) === String(value),
      render: (value?: string | null) => value ? <Tag color={/use|production/i.test(value) ? 'green' : 'gold'}>{value}</Tag> : '—',
    },
    {
      title: 'Applications', dataIndex: 'linkedApplications', key: 'linkedApplications', width: 320, ellipsis: true,
      filters: columnFilters.linkedApplications,
      onFilter: (value, record) => {
        const labels = (record.linkedApplications || []).map((application) => toFilterValue(application.name || application.correlationId));
        if (!labels.length) labels.push('—');
        return labels.includes(String(value));
      },
      render: (applications: DatabaseItem['linkedApplications']) => {
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
    {
      title: 'Notes', dataIndex: 'healthNotes', key: 'healthNotes', width: 320, ellipsis: true,
      filters: columnFilters.healthNotes,
      onFilter: (value, record) => {
        const labels = (record.healthNotes || []).map((note) => String(note.label || '').trim()).filter(Boolean);
        return labels.includes(String(value));
      },
      render: (healthNotes: DatabaseItem['healthNotes']) => {
        const notes = healthNotes || [];
        if (!notes.length) return '—';

        const activeNoteFilters = (tableFilters.healthNotes || []).map((value) => String(value)).filter(Boolean);
        const notesToShow = activeNoteFilters.length
          ? notes.filter((note) => activeNoteFilters.includes(String(note.label || '').trim()))
          : notes;

        if (!notesToShow.length) return '—';

        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {notesToShow.slice(0, 3).map((note, idx) => (
              <Tooltip key={`${note.label}-${idx}`} title={renderNoteHover(note)}>
                <Tag color={note.severity === 'critical' ? 'red' : note.severity === 'high' ? 'volcano' : note.severity === 'medium' ? 'gold' : 'blue'}>
                  {note.label}
                </Tag>
              </Tooltip>
            ))}
            {notesToShow.length > 3 ? <span className="text-xs text-gray-500">+{notesToShow.length - 3} more</span> : null}
          </div>
        );
      },
    },
    {
      title: 'Created At', dataIndex: 'createdAt', key: 'createdAt', width: 180,
      filters: columnFilters.createdAt,
      onFilter: (value, record) => toFilterValue(record.createdAt) === String(value),
      render: (value?: string) => value ? new Date(value).toLocaleString() : '—',
    },
    {
      title: 'Updated At', dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      filters: columnFilters.updatedAt,
      onFilter: (value, record) => toFilterValue(record.updatedAt) === String(value),
      render: (value?: string) => value ? new Date(value).toLocaleString() : '—',
    },
  ], [columnFilters, onNavigateToFactory, tableFilters.healthNotes]);

  const columns = allColumnDefs.filter((column) => visibleKeys.has(String(column.key)));
  const scrollX = columns.reduce((sum, column) => sum + ((column.width as number) || 160), 0);

  const columnToggleContent = (
    <div style={{ maxHeight: 360, overflowY: 'auto', width: 220 }}>
      <div className="flex gap-2 mb-2 border-b pb-2">
        <Button size="small" type="link" onClick={showAll}>All</Button>
        <Button size="small" type="link" onClick={showDefaults}>Defaults</Button>
        <Button size="small" type="link" onClick={showNone}>Deselect All</Button>
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
          placeholder="Search by database, service, vendor, or application…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 340 }}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Popover content={columnToggleContent} title="Toggle Columns" trigger="click" placement="bottomRight">
          <Button size="small" icon={<SettingOutlined />}>Columns</Button>
        </Popover>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{items.length} databases</span>
        {!readOnly && onDeleteAllComponents && <Button danger size="small" onClick={onDeleteAllComponents} loading={deleteLoading}>
          Delete All
        </Button>}
        {!readOnly && <Button danger size="small" onClick={handleBulkDelete} disabled={!selectedRowKeys.length}>
          Delete Selected ({selectedRowKeys.length})
        </Button>}
      </div>

      <Table
        dataSource={filtered}
        columns={enhanceColumnsWithSortAndFilters(columns as any, filtered)}
        rowKey="_id"
        size="small"
        loading={loading}
        onChange={(_pagination, filters) => setTableFilters(filters as Record<string, FilterValue | null>)}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (total) => `${total} items`, position: ['topRight'] }}
        className="flex-1"
        scroll={{ x: scrollX, y: 'calc(var(--app-h) - 220px)' }}
        rowSelection={readOnly ? undefined : {
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
      />

      <Drawer title={detail?.name} open={!!detail} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Instance Name">{detail.instanceName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Class">{detail.databaseClassName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Vendor">{detail.normalizedVendor || detail.vendor || '—'}</Descriptions.Item>
            <Descriptions.Item label="Version">{detail.version || '—'}</Descriptions.Item>
            <Descriptions.Item label="Service">{detail.serviceName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Primary Application">
              {detail.applicationName ? (
                <Typography.Link onClick={() => onNavigateToFactory?.('applications', detail.applicationCorrelationId || detail.applicationName || '')}>
                  {detail.applicationName}
                </Typography.Link>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Application Correlation ID">{detail.applicationCorrelationId || '—'}</Descriptions.Item>
            <Descriptions.Item label="APM Number">{detail.apmNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Application Owner">{detail.applicationOwner || '—'}</Descriptions.Item>
            <Descriptions.Item label="L5 Owner">{[detail.lowestLevelOwner, detail.lowestLevelOwnerUserName].filter(Boolean).join(' | ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="Location">{detail.location || '—'}</Descriptions.Item>
            <Descriptions.Item label="Lifecycle Status">{detail.lifecycleStageStatus || '—'}</Descriptions.Item>
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
                            {[application.correlationId, application.acronym, application.apmNumber, application.serviceName].filter(Boolean).join(' | ') || 'No relation metadata'}
                          </span>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Notes">
              {detail.healthNotes?.length ? (
                <List
                  size="small"
                  dataSource={detail.healthNotes}
                  renderItem={(note, idx) => (
                    <List.Item key={`${note.label}-${idx}`} style={{ paddingInline: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tooltip title={renderNoteHover(note)}>
                            <Tag color={note.severity === 'critical' ? 'red' : note.severity === 'high' ? 'volcano' : note.severity === 'medium' ? 'gold' : 'blue'}>{note.label}</Tag>
                          </Tooltip>
                          {note.severity ? <span className="text-xs text-gray-500">{note.severity}</span> : null}
                        </div>
                        <span className="text-xs text-gray-700">{note.note}</span>
                        {note.rationale ? <span className="text-xs text-gray-600">Why: {note.rationale}</span> : null}
                        {note.vulnerabilities?.length ? (
                          <span className="text-xs text-gray-700">Vulnerabilities: {note.vulnerabilities.join(' | ')}</span>
                        ) : null}
                        {note.sourceUrl ? (
                          <Typography.Link href={note.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
                            Source
                          </Typography.Link>
                        ) : null}
                      </div>
                    </List.Item>
                  )}
                />
              ) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}