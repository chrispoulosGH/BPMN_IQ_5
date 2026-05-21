import { useState, useEffect, useCallback } from 'react';
import { Table, Input, App as AntApp, Tag, Tooltip, Drawer, Descriptions } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ApplicationItem } from '../types';
import { getRefItems } from '../api';
import type { ColumnsType } from 'antd/es/table';

interface ApplicationFactoryProps {
  defaultSearch?: string;
}

export default function ApplicationFactory({ defaultSearch }: ApplicationFactoryProps) {
  const { message } = AntApp.useApp();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ApplicationItem | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRefItems('applications');
      setItems(data as ApplicationItem[]);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (defaultSearch !== undefined) setSearch(defaultSearch);
  }, [defaultSearch]);

  const filtered = search
    ? items.filter((i) => {
        const s = search.toLowerCase();
        return (
          i.name.toLowerCase().includes(s) ||
          (i.acronym && i.acronym.toLowerCase().includes(s)) ||
          (i.correlationId && i.correlationId.toLowerCase().includes(s))
        );
      })
    : items;

  const columns: ColumnsType<ApplicationItem> = [
    {
      title: 'Name', dataIndex: 'name', key: 'name', width: 280, ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text: string, record: ApplicationItem) => (
        <a onClick={() => setDetail(record)}>{text}</a>
      ),
    },
    { title: 'Acronym', dataIndex: 'acronym', key: 'acronym', width: 120, ellipsis: true,
      sorter: (a, b) => (a.acronym || '').localeCompare(b.acronym || '') },
    { title: 'Type', dataIndex: 'applicationType', key: 'applicationType', width: 140,
      filters: [...new Set(items.map(i => i.applicationType).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
      onFilter: (value, record) => record.applicationType === value },
    { title: 'Criticality', dataIndex: 'businessCriticality', key: 'businessCriticality', width: 120,
      filters: [...new Set(items.map(i => i.businessCriticality).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
      onFilter: (value, record) => record.businessCriticality === value,
      render: (v: string) => {
        if (!v) return '—';
        const color = v.toLowerCase().includes('critical') ? 'red' : v.toLowerCase().includes('high') ? 'orange' : v.toLowerCase().includes('medium') ? 'gold' : 'green';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    { title: 'Lifecycle', dataIndex: 'lifecycleStatus', key: 'lifecycleStatus', width: 130,
      filters: [...new Set(items.map(i => i.lifecycleStatus).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
      onFilter: (value, record) => record.lifecycleStatus === value },
    { title: 'Customer Facing', dataIndex: 'customerFacing', key: 'customerFacing', width: 120,
      filters: [...new Set(items.map(i => i.customerFacing).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
      onFilter: (value, record) => record.customerFacing === value },
    { title: 'Internet Facing', dataIndex: 'internetFacing', key: 'internetFacing', width: 120,
      filters: [...new Set(items.map(i => i.internetFacing).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
      onFilter: (value, record) => record.internetFacing === value },
    { title: 'Install Type', dataIndex: 'installType', key: 'installType', width: 120,
      filters: [...new Set(items.map(i => i.installType).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
      onFilter: (value, record) => record.installType === value },
  ];

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by name, acronym, or ID…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 300 }}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} of {items.length} applications</span>
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} items` }}
        className="flex-1"
        scroll={{ y: 'calc(100vh - 220px)' }}
      />

      <Drawer
        title={detail?.name}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={520}
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Correlation ID">{detail.correlationId || '—'}</Descriptions.Item>
            <Descriptions.Item label="Acronym">{detail.acronym || '—'}</Descriptions.Item>
            <Descriptions.Item label="Short Description">{detail.shortDescription || '—'}</Descriptions.Item>
            <Descriptions.Item label="Application Type">{detail.applicationType || '—'}</Descriptions.Item>
            <Descriptions.Item label="Business Criticality">{detail.businessCriticality || '—'}</Descriptions.Item>
            <Descriptions.Item label="Lifecycle">{detail.lifecycle || '—'}</Descriptions.Item>
            <Descriptions.Item label="Lifecycle Status">{detail.lifecycleStatus || '—'}</Descriptions.Item>
            <Descriptions.Item label="Install Type">{detail.installType || '—'}</Descriptions.Item>
            <Descriptions.Item label="Discovery Source">{detail.discoverySource || '—'}</Descriptions.Item>
            <Descriptions.Item label="Customer Facing">{detail.customerFacing || '—'}</Descriptions.Item>
            <Descriptions.Item label="Internet Facing">{detail.internetFacing || '—'}</Descriptions.Item>
            <Descriptions.Item label="CPNI Indicator">{detail.cpniIndicator || '—'}</Descriptions.Item>
            <Descriptions.Item label="Handle SPI">{detail.handleSpi || '—'}</Descriptions.Item>
            <Descriptions.Item label="Store SPI">{detail.storeSpi || '—'}</Descriptions.Item>
            <Descriptions.Item label="PCI Data">{detail.pciData || '—'}</Descriptions.Item>
            <Descriptions.Item label="PCI Data Stored">{detail.pciDataStored || '—'}</Descriptions.Item>
            <Descriptions.Item label="SOX/FSA">{detail.soxFsa || '—'}</Descriptions.Item>
            <Descriptions.Item label="Business Purpose">{detail.businessPurpose || '—'}</Descriptions.Item>
            <Descriptions.Item label="Application Purpose">{detail.applPurpose || '—'}</Descriptions.Item>
            <Descriptions.Item label="User Interface">{detail.userInterface || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
