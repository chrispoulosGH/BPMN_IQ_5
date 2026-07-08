import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Checkbox, Descriptions, Drawer, Input, List, Popover, Table, Tag, Tooltip, Typography } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { FilterValue } from 'antd/es/table/interface';

import { deleteServer, getServers } from '../api';
import type { ServerItem } from '../types';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';
import { matchesFactorySearch, parseFactorySearch, encodeExactFactorySearch } from '../utils/factorySearch';

interface ServerFactoryProps {
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
  { key: 'name', title: 'Server', defaultVisible: true },
  { key: 'serverSystemId', title: 'Server System ID', defaultVisible: false },
  { key: 'objectId', title: 'Object ID', defaultVisible: false },
  { key: 'assetId', title: 'Asset ID', defaultVisible: false },
  { key: 'assetTag', title: 'Asset Tag', defaultVisible: false },
  { key: 'hostName', title: 'Host Name', defaultVisible: true },
  { key: 'fqdn', title: 'FQDN', defaultVisible: false },
  { key: 'ipAddress', title: 'IP Address', defaultVisible: true },
  { key: 'macAddress', title: 'MAC Address', defaultVisible: false },
  { key: 'environment', title: 'Environment', defaultVisible: true },
  { key: 'operationalStatus', title: 'Operational Status', defaultVisible: true },
  { key: 'installStatus', title: 'Install Status', defaultVisible: false },
  { key: 'lifecycleStage', title: 'Lifecycle Stage', defaultVisible: false },
  { key: 'lifecycleStatus', title: 'Lifecycle Status', defaultVisible: false },
  { key: 'usedFor', title: 'Used For', defaultVisible: false },
  { key: 'os', title: 'OS', defaultVisible: true },
  { key: 'osVersion', title: 'OS Version', defaultVisible: false },
  { key: 'osDomain', title: 'OS Domain', defaultVisible: false },
  { key: 'osServicePack', title: 'OS Service Pack', defaultVisible: false },
  { key: 'normalizedOs', title: 'Normalized OS', defaultVisible: false },
  { key: 'normalizedOsVersion', title: 'Normalized OS Version', defaultVisible: false },
  { key: 'normalizedOsServicePack', title: 'Normalized OS Service Pack', defaultVisible: false },
  { key: 'vendorName', title: 'Vendor Name', defaultVisible: false },
  { key: 'manufacturer', title: 'Manufacturer', defaultVisible: false },
  { key: 'modelNumber', title: 'Model Number', defaultVisible: false },
  { key: 'serialNumber', title: 'Serial Number', defaultVisible: false },
  { key: 'supportGroup', title: 'Support Group', defaultVisible: true },
  { key: 'supportedBy', title: 'Supported By', defaultVisible: false },
  { key: 'managedByGroup', title: 'Managed By Group', defaultVisible: false },
  { key: 'cloudAccountId', title: 'Cloud Account ID', defaultVisible: false },
  { key: 'internetFacing', title: 'Internet Facing', defaultVisible: false },
  { key: 'virtualized', title: 'Virtualized', defaultVisible: false },
  { key: 'className', title: 'Class Name', defaultVisible: false },
  { key: 'location', title: 'Location', defaultVisible: false },
  { key: 'cpuCount', title: 'CPU', defaultVisible: false },
  { key: 'cpuName', title: 'CPU Name', defaultVisible: false },
  { key: 'cpuSpeed', title: 'CPU Speed', defaultVisible: false },
  { key: 'ram', title: 'RAM', defaultVisible: false },
  { key: 'relationTypes', title: 'Relation Types', defaultVisible: false },
  { key: 'relationPorts', title: 'Relation Ports', defaultVisible: false },
  { key: 'linkedApplications', title: 'Applications', defaultVisible: true },
  { key: 'healthNotes', title: 'Notes', defaultVisible: true },
  { key: 'createdAt', title: 'Created At', defaultVisible: false },
  { key: 'updatedAt', title: 'Updated At', defaultVisible: false },
];

export default function ServerFactory({ defaultSearch, onNavigateToFactory, readOnly, onDeleteAllComponents, deleteLoading }: ServerFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [exactSearch, setExactSearch] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [detail, setDetail] = useState<ServerItem | null>(null);
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
        return matchesFactorySearch([i.name, i.hostName, i.ipAddress, i.environment], searchToken);
      })
    : items;

  const columnFilters = useMemo(() => ({
    _id: buildFilters(items.map((item) => toFilterValue(item._id))),
    sourceKey: buildFilters(items.map((item) => toFilterValue(item.sourceKey))),
    name: buildFilters(items.map((item) => toFilterValue(item.name))),
    serverSystemId: buildFilters(items.map((item) => toFilterValue(item.serverSystemId))),
    objectId: buildFilters(items.map((item) => toFilterValue(item.objectId))),
    assetId: buildFilters(items.map((item) => toFilterValue(item.assetId))),
    assetTag: buildFilters(items.map((item) => toFilterValue(item.assetTag))),
    hostName: buildFilters(items.map((item) => toFilterValue(item.hostName))),
    fqdn: buildFilters(items.map((item) => toFilterValue(item.fqdn))),
    ipAddress: buildFilters(items.map((item) => toFilterValue(item.ipAddress))),
    macAddress: buildFilters(items.map((item) => toFilterValue(item.macAddress))),
    environment: buildFilters(items.map((item) => toFilterValue(item.environment))),
    operationalStatus: buildFilters(items.map((item) => toFilterValue(item.operationalStatus))),
    installStatus: buildFilters(items.map((item) => toFilterValue(item.installStatus))),
    lifecycleStage: buildFilters(items.map((item) => toFilterValue(item.lifecycleStage))),
    lifecycleStatus: buildFilters(items.map((item) => toFilterValue(item.lifecycleStatus))),
    usedFor: buildFilters(items.map((item) => toFilterValue(item.usedFor))),
    os: buildFilters(items.map((item) => toFilterValue(item.os))),
    osVersion: buildFilters(items.map((item) => toFilterValue(item.osVersion))),
    osDomain: buildFilters(items.map((item) => toFilterValue(item.osDomain))),
    osServicePack: buildFilters(items.map((item) => toFilterValue(item.osServicePack))),
    normalizedOs: buildFilters(items.map((item) => toFilterValue(item.normalizedOs))),
    normalizedOsVersion: buildFilters(items.map((item) => toFilterValue(item.normalizedOsVersion))),
    normalizedOsServicePack: buildFilters(items.map((item) => toFilterValue(item.normalizedOsServicePack))),
    vendorName: buildFilters(items.map((item) => toFilterValue(item.vendorName))),
    manufacturer: buildFilters(items.map((item) => toFilterValue(item.manufacturer))),
    modelNumber: buildFilters(items.map((item) => toFilterValue(item.modelNumber))),
    serialNumber: buildFilters(items.map((item) => toFilterValue(item.serialNumber))),
    supportGroup: buildFilters(items.map((item) => toFilterValue(item.supportGroup))),
    supportedBy: buildFilters(items.map((item) => toFilterValue(item.supportedBy))),
    managedByGroup: buildFilters(items.map((item) => toFilterValue(item.managedByGroup))),
    cloudAccountId: buildFilters(items.map((item) => toFilterValue(item.cloudAccountId))),
    internetFacing: buildFilters(items.map((item) => toFilterValue(item.internetFacing))),
    virtualized: buildFilters(items.map((item) => toFilterValue(item.virtualized))),
    className: buildFilters(items.map((item) => toFilterValue(item.className))),
    location: buildFilters(items.map((item) => toFilterValue(item.location))),
    cpuCount: buildFilters(items.map((item) => toFilterValue(item.cpuCount))),
    cpuName: buildFilters(items.map((item) => toFilterValue(item.cpuName))),
    cpuSpeed: buildFilters(items.map((item) => toFilterValue(item.cpuSpeed))),
    ram: buildFilters(items.map((item) => toFilterValue(item.ram))),
    relationTypes: buildFilters(
      items.flatMap((item) => item.relationTypes?.length ? item.relationTypes.map((value) => toFilterValue(value)) : ['—'])
    ),
    relationPorts: buildFilters(
      items.flatMap((item) => item.relationPorts?.length ? item.relationPorts.map((value) => toFilterValue(value)) : ['—'])
    ),
    linkedApplications: buildFilters(
      items.flatMap((item) => {
        const labels = (item.linkedApplications || []).map((application) => toFilterValue(application.name || application.correlationId));
        return labels.length ? labels : ['—'];
      })
    ),
    healthNotes: buildFilters(
      items.flatMap((item) => {
        return (item.healthNotes || [])
          .map((note) => String(note.label || '').trim())
          .filter(Boolean);
      })
    ),
    createdAt: buildFilters(items.map((item) => toFilterValue(item.createdAt))),
    updatedAt: buildFilters(items.map((item) => toFilterValue(item.updatedAt))),
  }), [items]);

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

  const handleBulkDelete = () => {
    if (!selectedRowKeys.length) return;
    modal.confirm({
      title: `Delete ${selectedRowKeys.length} selected servers?`,
      content: `This will permanently remove ${selectedRowKeys.length} selected servers.`,
      okText: 'Delete Selected',
      okButtonProps: { danger: true },
      onOk: async () => {
        await Promise.all(selectedRowKeys.map((id) => deleteServer(id)));
        message.success(`Deleted ${selectedRowKeys.length} servers`);
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

  const renderNoteHover = (note: NonNullable<ServerItem['healthNotes']>[number]) => (
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

  const allColumnDefs: ColumnsType<ServerItem> = useMemo(() => [
    {
      title: 'ID', dataIndex: '_id', key: '_id', width: 280, ellipsis: true,
      filters: columnFilters._id,
      onFilter: (value, record) => toFilterValue(record._id) === String(value),
    },
    {
      title: 'Source Key', dataIndex: 'sourceKey', key: 'sourceKey', width: 280, ellipsis: true,
      filters: columnFilters.sourceKey,
      onFilter: (value, record) => toFilterValue(record.sourceKey) === String(value),
    },
    {
      title: 'Server', dataIndex: 'name', key: 'name', width: 260, fixed: 'left' as const,
      sorter: (a, b) => a.name.localeCompare(b.name),
      filters: columnFilters.name,
      onFilter: (value, record) => toFilterValue(record.name) === String(value),
      render: (value: string, record: ServerItem) => <a onClick={() => setDetail(record)}>{value}</a>,
    },
    {
      title: 'Server System ID', dataIndex: 'serverSystemId', key: 'serverSystemId', width: 180, ellipsis: true,
      filters: columnFilters.serverSystemId,
      onFilter: (value, record) => toFilterValue(record.serverSystemId) === String(value),
    },
    {
      title: 'Object ID', dataIndex: 'objectId', key: 'objectId', width: 180, ellipsis: true,
      filters: columnFilters.objectId,
      onFilter: (value, record) => toFilterValue(record.objectId) === String(value),
    },
    {
      title: 'Asset ID', dataIndex: 'assetId', key: 'assetId', width: 180, ellipsis: true,
      filters: columnFilters.assetId,
      onFilter: (value, record) => toFilterValue(record.assetId) === String(value),
    },
    {
      title: 'Asset Tag', dataIndex: 'assetTag', key: 'assetTag', width: 180, ellipsis: true,
      filters: columnFilters.assetTag,
      onFilter: (value, record) => toFilterValue(record.assetTag) === String(value),
    },
    {
      title: 'Host Name', dataIndex: 'hostName', key: 'hostName', width: 220, ellipsis: true,
      filters: columnFilters.hostName,
      onFilter: (value, record) => toFilterValue(record.hostName) === String(value),
    },
    {
      title: 'FQDN', dataIndex: 'fqdn', key: 'fqdn', width: 260, ellipsis: true,
      filters: columnFilters.fqdn,
      onFilter: (value, record) => toFilterValue(record.fqdn) === String(value),
    },
    {
      title: 'IP Address', dataIndex: 'ipAddress', key: 'ipAddress', width: 140,
      filters: columnFilters.ipAddress,
      onFilter: (value, record) => toFilterValue(record.ipAddress) === String(value),
    },
    {
      title: 'MAC Address', dataIndex: 'macAddress', key: 'macAddress', width: 180, ellipsis: true,
      filters: columnFilters.macAddress,
      onFilter: (value, record) => toFilterValue(record.macAddress) === String(value),
    },
    {
      title: 'Environment', dataIndex: 'environment', key: 'environment', width: 120,
      filters: columnFilters.environment,
      onFilter: (value, record) => toFilterValue(record.environment) === String(value),
    },
    {
      title: 'Operational Status', dataIndex: 'operationalStatus', key: 'operationalStatus', width: 160,
      filters: columnFilters.operationalStatus,
      onFilter: (value, record) => toFilterValue(record.operationalStatus) === String(value),
      render: (value?: string | null) => value ? <Tag color={/operational|in use/i.test(value) ? 'green' : 'gold'}>{value}</Tag> : '—',
    },
    {
      title: 'Install Status', dataIndex: 'installStatus', key: 'installStatus', width: 140,
      filters: columnFilters.installStatus,
      onFilter: (value, record) => toFilterValue(record.installStatus) === String(value),
    },
    {
      title: 'Lifecycle Stage', dataIndex: 'lifecycleStage', key: 'lifecycleStage', width: 150,
      filters: columnFilters.lifecycleStage,
      onFilter: (value, record) => toFilterValue(record.lifecycleStage) === String(value),
    },
    {
      title: 'Lifecycle Status', dataIndex: 'lifecycleStatus', key: 'lifecycleStatus', width: 150,
      filters: columnFilters.lifecycleStatus,
      onFilter: (value, record) => toFilterValue(record.lifecycleStatus) === String(value),
    },
    {
      title: 'Used For', dataIndex: 'usedFor', key: 'usedFor', width: 200, ellipsis: true,
      filters: columnFilters.usedFor,
      onFilter: (value, record) => toFilterValue(record.usedFor) === String(value),
    },
    {
      title: 'OS', dataIndex: 'os', key: 'os', width: 170, ellipsis: true,
      filters: columnFilters.os,
      onFilter: (value, record) => toFilterValue(record.os) === String(value),
    },
    {
      title: 'OS Version', dataIndex: 'osVersion', key: 'osVersion', width: 180, ellipsis: true,
      filters: columnFilters.osVersion,
      onFilter: (value, record) => toFilterValue(record.osVersion) === String(value),
    },
    {
      title: 'OS Domain', dataIndex: 'osDomain', key: 'osDomain', width: 160, ellipsis: true,
      filters: columnFilters.osDomain,
      onFilter: (value, record) => toFilterValue(record.osDomain) === String(value),
    },
    {
      title: 'OS Service Pack', dataIndex: 'osServicePack', key: 'osServicePack', width: 170, ellipsis: true,
      filters: columnFilters.osServicePack,
      onFilter: (value, record) => toFilterValue(record.osServicePack) === String(value),
    },
    {
      title: 'Normalized OS', dataIndex: 'normalizedOs', key: 'normalizedOs', width: 180, ellipsis: true,
      filters: columnFilters.normalizedOs,
      onFilter: (value, record) => toFilterValue(record.normalizedOs) === String(value),
    },
    {
      title: 'Normalized OS Version', dataIndex: 'normalizedOsVersion', key: 'normalizedOsVersion', width: 200, ellipsis: true,
      filters: columnFilters.normalizedOsVersion,
      onFilter: (value, record) => toFilterValue(record.normalizedOsVersion) === String(value),
    },
    {
      title: 'Normalized OS Service Pack', dataIndex: 'normalizedOsServicePack', key: 'normalizedOsServicePack', width: 220, ellipsis: true,
      filters: columnFilters.normalizedOsServicePack,
      onFilter: (value, record) => toFilterValue(record.normalizedOsServicePack) === String(value),
    },
    {
      title: 'Vendor Name', dataIndex: 'vendorName', key: 'vendorName', width: 180, ellipsis: true,
      filters: columnFilters.vendorName,
      onFilter: (value, record) => toFilterValue(record.vendorName) === String(value),
    },
    {
      title: 'Manufacturer', dataIndex: 'manufacturer', key: 'manufacturer', width: 180, ellipsis: true,
      filters: columnFilters.manufacturer,
      onFilter: (value, record) => toFilterValue(record.manufacturer) === String(value),
    },
    {
      title: 'Model Number', dataIndex: 'modelNumber', key: 'modelNumber', width: 180, ellipsis: true,
      filters: columnFilters.modelNumber,
      onFilter: (value, record) => toFilterValue(record.modelNumber) === String(value),
    },
    {
      title: 'Serial Number', dataIndex: 'serialNumber', key: 'serialNumber', width: 180, ellipsis: true,
      filters: columnFilters.serialNumber,
      onFilter: (value, record) => toFilterValue(record.serialNumber) === String(value),
    },
    {
      title: 'Support Group', dataIndex: 'supportGroup', key: 'supportGroup', width: 220, ellipsis: true,
      filters: columnFilters.supportGroup,
      onFilter: (value, record) => toFilterValue(record.supportGroup) === String(value),
    },
    {
      title: 'Supported By', dataIndex: 'supportedBy', key: 'supportedBy', width: 220, ellipsis: true,
      filters: columnFilters.supportedBy,
      onFilter: (value, record) => toFilterValue(record.supportedBy) === String(value),
    },
    {
      title: 'Managed By Group', dataIndex: 'managedByGroup', key: 'managedByGroup', width: 220, ellipsis: true,
      filters: columnFilters.managedByGroup,
      onFilter: (value, record) => toFilterValue(record.managedByGroup) === String(value),
    },
    {
      title: 'Cloud Account ID', dataIndex: 'cloudAccountId', key: 'cloudAccountId', width: 180, ellipsis: true,
      filters: columnFilters.cloudAccountId,
      onFilter: (value, record) => toFilterValue(record.cloudAccountId) === String(value),
    },
    {
      title: 'Internet Facing', dataIndex: 'internetFacing', key: 'internetFacing', width: 140,
      filters: columnFilters.internetFacing,
      onFilter: (value, record) => toFilterValue(record.internetFacing) === String(value),
    },
    {
      title: 'Virtualized', dataIndex: 'virtualized', key: 'virtualized', width: 120,
      filters: columnFilters.virtualized,
      onFilter: (value, record) => toFilterValue(record.virtualized) === String(value),
      render: (value?: boolean | null) => (value === null || value === undefined) ? '—' : (value ? 'Yes' : 'No'),
    },
    {
      title: 'Class Name', dataIndex: 'className', key: 'className', width: 200, ellipsis: true,
      filters: columnFilters.className,
      onFilter: (value, record) => toFilterValue(record.className) === String(value),
    },
    {
      title: 'Location', dataIndex: 'location', key: 'location', width: 280, ellipsis: true,
      filters: columnFilters.location,
      onFilter: (value, record) => toFilterValue(record.location) === String(value),
    },
    {
      title: 'CPU', dataIndex: 'cpuCount', key: 'cpuCount', width: 90,
      filters: columnFilters.cpuCount,
      onFilter: (value, record) => toFilterValue(record.cpuCount) === String(value),
    },
    {
      title: 'CPU Name', dataIndex: 'cpuName', key: 'cpuName', width: 220, ellipsis: true,
      filters: columnFilters.cpuName,
      onFilter: (value, record) => toFilterValue(record.cpuName) === String(value),
    },
    {
      title: 'CPU Speed', dataIndex: 'cpuSpeed', key: 'cpuSpeed', width: 140,
      filters: columnFilters.cpuSpeed,
      onFilter: (value, record) => toFilterValue(record.cpuSpeed) === String(value),
    },
    {
      title: 'RAM', dataIndex: 'ram', key: 'ram', width: 100,
      filters: columnFilters.ram,
      onFilter: (value, record) => toFilterValue(record.ram) === String(value),
      render: (value?: number | null) => value ? value.toLocaleString() : '—',
    },
    {
      title: 'Relation Types', dataIndex: 'relationTypes', key: 'relationTypes', width: 260, ellipsis: true,
      filters: columnFilters.relationTypes,
      onFilter: (value, record) => {
        const vals = record.relationTypes?.length ? record.relationTypes.map((item) => toFilterValue(item)) : ['—'];
        return vals.includes(String(value));
      },
      render: (value?: string[]) => value?.length ? value.join(', ') : '—',
    },
    {
      title: 'Relation Ports', dataIndex: 'relationPorts', key: 'relationPorts', width: 260, ellipsis: true,
      filters: columnFilters.relationPorts,
      onFilter: (value, record) => {
        const vals = record.relationPorts?.length ? record.relationPorts.map((item) => toFilterValue(item)) : ['—'];
        return vals.includes(String(value));
      },
      render: (value?: string[]) => value?.length ? value.join(', ') : '—',
    },
    {
      title: 'Applications', dataIndex: 'linkedApplications', key: 'linkedApplications', width: 320, ellipsis: true,
      filters: columnFilters.linkedApplications,
      onFilter: (value, record) => {
        const labels = (record.linkedApplications || []).map((application) => toFilterValue(application.name || application.correlationId));
        if (!labels.length) labels.push('—');
        return labels.includes(String(value));
      },
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
    {
      title: 'Notes', dataIndex: 'healthNotes', key: 'healthNotes', width: 320, ellipsis: true,
      filters: columnFilters.healthNotes,
      onFilter: (value, record) => {
        const labels = (record.healthNotes || [])
          .map((note) => String(note.label || '').trim())
          .filter(Boolean);
        return labels.includes(String(value));
      },
      render: (healthNotes: ServerItem['healthNotes']) => {
        const notes = healthNotes || [];
        if (!notes.length) return '—';

        const activeNoteFilters = (tableFilters.healthNotes || [])
          .map((value) => String(value))
          .filter(Boolean);

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