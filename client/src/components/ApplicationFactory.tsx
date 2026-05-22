import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Input, App as AntApp, Tag, Tooltip, Drawer, Descriptions, Popover, Checkbox, Button, Modal, Form } from 'antd';
import { SearchOutlined, SettingOutlined, PlusOutlined } from '@ant-design/icons';
import type { ApplicationItem } from '../types';
import { getRefItems, createRefItem } from '../api';
import type { ColumnsType } from 'antd/es/table';

interface ApplicationFactoryProps {
  defaultSearch?: string;
  userRole?: string | null;
}

/** All possible columns with their keys, labels, and default visibility */
const ALL_COLUMNS: { key: string; title: string; defaultVisible: boolean }[] = [
  { key: 'name', title: 'Name', defaultVisible: true },
  { key: 'acronym', title: 'Acronym', defaultVisible: true },
  { key: 'correlationId', title: 'Correlation ID', defaultVisible: false },
  { key: 'shortDescription', title: 'Short Description', defaultVisible: false },
  { key: 'applicationType', title: 'Type', defaultVisible: true },
  { key: 'businessCriticality', title: 'Criticality', defaultVisible: true },
  { key: 'lifecycle', title: 'Lifecycle', defaultVisible: false },
  { key: 'lifecycleStatus', title: 'Lifecycle Status', defaultVisible: true },
  { key: 'installType', title: 'Install Type', defaultVisible: true },
  { key: 'discoverySource', title: 'Discovery Source', defaultVisible: false },
  { key: 'customerFacing', title: 'Customer Facing', defaultVisible: true },
  { key: 'internetFacing', title: 'Internet Facing', defaultVisible: true },
  { key: 'cpniIndicator', title: 'CPNI Indicator', defaultVisible: false },
  { key: 'handleSpi', title: 'Handle SPI', defaultVisible: false },
  { key: 'storeSpi', title: 'Store SPI', defaultVisible: false },
  { key: 'pciData', title: 'PCI Data', defaultVisible: false },
  { key: 'pciDataStored', title: 'PCI Data Stored', defaultVisible: false },
  { key: 'soxFsa', title: 'SOX/FSA', defaultVisible: false },
  { key: 'applPurpose', title: 'App Purpose', defaultVisible: false },
  { key: 'businessPurpose', title: 'Business Purpose', defaultVisible: false },
  { key: 'userInterface', title: 'User Interface', defaultVisible: false },
  { key: 'owner', title: 'Owner', defaultVisible: true },
];

export default function ApplicationFactory({ defaultSearch, userRole }: ApplicationFactoryProps) {
  const { message } = AntApp.useApp();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ApplicationItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm] = Form.useForm();
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  );

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
          (i.correlationId && i.correlationId.toLowerCase().includes(s)) ||
          (i.shortDescription && i.shortDescription.toLowerCase().includes(s))
        );
      })
    : items;

  const handleAddApplication = async (values: { name: string }) => {
    try {
      await createRefItem('applications', values.name);
      message.success('Application created');
      setShowAddForm(false);
      addForm.resetFields();
      loadItems();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const toggleColumn = (key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showAll = () => setVisibleKeys(new Set(ALL_COLUMNS.map(c => c.key)));
  const showDefaults = () => setVisibleKeys(new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));

  /** Build a filterable column config helper */
  const filterCol = (dataIndex: string): Pick<any, 'filters' | 'onFilter'> => ({
    filters: [...new Set(items.map(i => (i as any)[dataIndex]).filter(Boolean))].sort().map(v => ({ text: v, value: v })),
    onFilter: (value: any, record: ApplicationItem) => (record as any)[dataIndex] === value,
  });

  const allColumnDefs: ColumnsType<ApplicationItem> = useMemo(() => [
    {
      title: 'Name', dataIndex: 'name', key: 'name', width: 280, ellipsis: true, fixed: 'left' as const,
      sorter: (a: ApplicationItem, b: ApplicationItem) => a.name.localeCompare(b.name),
      render: (text: string, record: ApplicationItem) => (
        <a onClick={() => setDetail(record)}>{text}</a>
      ),
    },
    { title: 'Acronym', dataIndex: 'acronym', key: 'acronym', width: 120, ellipsis: true,
      sorter: (a: ApplicationItem, b: ApplicationItem) => (a.acronym || '').localeCompare(b.acronym || '') },
    { title: 'Correlation ID', dataIndex: 'correlationId', key: 'correlationId', width: 140, ellipsis: true },
    { title: 'Short Description', dataIndex: 'shortDescription', key: 'shortDescription', width: 250, ellipsis: true },
    { title: 'Type', dataIndex: 'applicationType', key: 'applicationType', width: 140, ...filterCol('applicationType') },
    { title: 'Criticality', dataIndex: 'businessCriticality', key: 'businessCriticality', width: 130,
      ...filterCol('businessCriticality'),
      render: (v: string) => {
        if (!v) return '—';
        const color = v.toLowerCase().includes('critical') ? 'red' : v.toLowerCase().includes('high') ? 'orange' : v.toLowerCase().includes('medium') ? 'gold' : 'green';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    { title: 'Lifecycle', dataIndex: 'lifecycle', key: 'lifecycle', width: 120, ...filterCol('lifecycle') },
    { title: 'Lifecycle Status', dataIndex: 'lifecycleStatus', key: 'lifecycleStatus', width: 140, ...filterCol('lifecycleStatus') },
    { title: 'Install Type', dataIndex: 'installType', key: 'installType', width: 120, ...filterCol('installType') },
    { title: 'Discovery Source', dataIndex: 'discoverySource', key: 'discoverySource', width: 140, ...filterCol('discoverySource') },
    { title: 'Customer Facing', dataIndex: 'customerFacing', key: 'customerFacing', width: 130, ...filterCol('customerFacing') },
    { title: 'Internet Facing', dataIndex: 'internetFacing', key: 'internetFacing', width: 130, ...filterCol('internetFacing') },
    { title: 'CPNI Indicator', dataIndex: 'cpniIndicator', key: 'cpniIndicator', width: 130, ...filterCol('cpniIndicator') },
    { title: 'Handle SPI', dataIndex: 'handleSpi', key: 'handleSpi', width: 110, ...filterCol('handleSpi') },
    { title: 'Store SPI', dataIndex: 'storeSpi', key: 'storeSpi', width: 110, ...filterCol('storeSpi') },
    { title: 'PCI Data', dataIndex: 'pciData', key: 'pciData', width: 110, ...filterCol('pciData') },
    { title: 'PCI Data Stored', dataIndex: 'pciDataStored', key: 'pciDataStored', width: 130, ...filterCol('pciDataStored') },
    { title: 'SOX/FSA', dataIndex: 'soxFsa', key: 'soxFsa', width: 110, ...filterCol('soxFsa') },
    { title: 'App Purpose', dataIndex: 'applPurpose', key: 'applPurpose', width: 200, ellipsis: true },
    { title: 'Business Purpose', dataIndex: 'businessPurpose', key: 'businessPurpose', width: 250, ellipsis: true },
    { title: 'User Interface', dataIndex: 'userInterface', key: 'userInterface', width: 130, ...filterCol('userInterface') },
    { title: 'Owner', dataIndex: 'owner', key: 'owner', width: 130, ellipsis: true, render: (v: string) => v || '—' },
  ], [items]);

  const columns = allColumnDefs.filter(c => visibleKeys.has(c.key as string));

  const scrollX = columns.reduce((sum, c) => sum + ((c.width as number) || 150), 0);

  const columnToggleContent = (
    <div style={{ maxHeight: 360, overflowY: 'auto', width: 200 }}>
      <div className="flex gap-2 mb-2 border-b pb-2">
        <Button size="small" type="link" onClick={showAll}>All</Button>
        <Button size="small" type="link" onClick={showDefaults}>Defaults</Button>
      </div>
      {ALL_COLUMNS.map(col => (
        <div key={col.key} className="py-0.5">
          <Checkbox
            checked={visibleKeys.has(col.key)}
            onChange={() => toggleColumn(col.key)}
          >
            <span className="text-xs">{col.title}</span>
          </Checkbox>
        </div>
      ))}
    </div>
  );

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
        <Popover content={columnToggleContent} title="Toggle Columns" trigger="click" placement="bottomRight">
          <Button size="small" icon={<SettingOutlined />}>Columns</Button>
        </Popover>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} of {items.length} applications</span>
        {userRole === 'Super' && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setShowAddForm(true); }}>
          New Application
        </Button>}
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} items` }}
        className="flex-1"
        scroll={{ x: scrollX, y: 'calc(100vh - 220px)' }}
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
            <Descriptions.Item label="Owner">{detail.owner || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <Modal
        title="New Application"
        open={showAddForm}
        onCancel={() => setShowAddForm(false)}
        onOk={() => addForm.submit()}
        okText="Create"
        width={400}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddApplication}>
          <Form.Item name="name" label="Application Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
