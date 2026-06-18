import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Input, App as AntApp, Tag, Tooltip, Drawer, Descriptions, Popover, Checkbox, Button, Modal, Form, Select, List, Spin, Typography, Space } from 'antd';
import { SearchOutlined, SettingOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ApplicationItem, ServerItem } from '../types';
import { getRefItems, createApplication, updateApplication, getApplicationServers, deleteRefItem, getApplicationByCorrelationId } from '../api';
import type { ColumnsType } from 'antd/es/table';
import { STATE_TRANSITIONS, getAllowedActions, stateTagColor, transitionState } from '../stateUtils';
import { matchesFactorySearch, parseFactorySearch, encodeExactFactorySearch } from '../utils/factorySearch';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';

interface ApplicationFactoryProps {
  defaultSearch?: string;
  defaultAdd?: string;
  userRole?: string | null;
  readOnly?: boolean;
  onNavigateToFactory?: (tab: string, search: string) => void;
  requestedDetailRequest?: { correlationId: string; nonce: number } | null;
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
  { key: 'state', title: 'Status', defaultVisible: true },
  { key: 'owner', title: 'Owner', defaultVisible: true },
];

export default function ApplicationFactory({ defaultSearch, defaultAdd, userRole, readOnly, onNavigateToFactory, requestedDetailRequest }: ApplicationFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [exactSearch, setExactSearch] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [detail, setDetail] = useState<ApplicationItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm] = Form.useForm();
  const [editingApp, setEditingApp] = useState<ApplicationItem | null>(null);
  const [editForm] = Form.useForm();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [detailServers, setDetailServers] = useState<ServerItem[]>([]);
  const [detailServersLoading, setDetailServersLoading] = useState(false);
  const [fullAppDetail, setFullAppDetail] = useState<ApplicationItem | null>(null);
  const [fullAppDetailLoading, setFullAppDetailLoading] = useState(false);
  const handledDetailRequestNonceRef = useRef<number | null>(null);
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
    if (!requestedDetailRequest?.correlationId) return;
    if (handledDetailRequestNonceRef.current === requestedDetailRequest.nonce) return;
    handledDetailRequestNonceRef.current = requestedDetailRequest.nonce;

    const nextDetail = items.find(
      (item) => item.correlationId === requestedDetailRequest.correlationId || (item as any).correlation_id === requestedDetailRequest.correlationId
    );

    if (nextDetail) {
      setDetail(nextDetail);
      return;
    }

    let cancelled = false;
    getApplicationByCorrelationId(requestedDetailRequest.correlationId)
      .then((fullApp) => {
        if (!cancelled && fullApp) {
          setDetail(fullApp);
        }
      })
      .catch(() => {
        // Ignore lookup failures; the click should still leave the user on the Applications tab.
      });

    return () => {
      cancelled = true;
    };
  }, [items, requestedDetailRequest]);

  useEffect(() => {
    if (defaultSearch !== undefined) {
      const parsed = parseFactorySearch(defaultSearch);
      setSearch(parsed.term);
      setExactSearch(parsed.exact);
    }
  }, [defaultSearch]);

  useEffect(() => {
    if (defaultAdd) {
      addForm.resetFields();
      addForm.setFieldsValue({ name: defaultAdd });
      setShowAddForm(true);
    }
  }, [defaultAdd, addForm]);

  useEffect(() => {
    if (!detail?.correlationId) {
      setDetailServers([]);
      return;
    }

    let cancelled = false;
    setDetailServersLoading(true);
    getApplicationServers(detail.correlationId)
      .then((servers) => {
        if (!cancelled) setDetailServers(servers);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setDetailServers([]);
          message.error(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailServersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail, message]);

  // Hydrate full application details when viewing a component with correlation_id
  useEffect(() => {
    if (!detail) {
      setFullAppDetail(null);
      return;
    }

    // Check if detail has a correlation_id field (indicates it's from component collection)
    const correlationId = (detail as any)?.correlation_id || detail.correlationId;
    if (!correlationId) {
      setFullAppDetail(null);
      return;
    }

    let cancelled = false;
    setFullAppDetailLoading(true);
    getApplicationByCorrelationId(correlationId)
      .then((fullApp) => {
        if (!cancelled) setFullAppDetail(fullApp);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setFullAppDetail(null);
          // Don't show error message - full details are optional
        }
      })
      .finally(() => {
        if (!cancelled) setFullAppDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail]);

  const searchToken = exactSearch ? encodeExactFactorySearch(search) : search;
  const filtered = search
    ? items.filter((i) => {
        return matchesFactorySearch([i.name, i.acronym, i.correlationId, i.shortDescription], searchToken);
      })
    : items;

  const handleEdit = (record: ApplicationItem) => {
    setEditingApp(record);
    editForm.setFieldsValue(record);
  };

  const handleUpdateApplication = async (values: Partial<ApplicationItem>) => {
    if (!editingApp) return;
    try {
      await updateApplication(editingApp._id, values);
      message.success('Application updated');
      setEditingApp(null);
      editForm.resetFields();
      loadItems();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const handleAddApplication = async (values: Partial<ApplicationItem> & { name: string }) => {
    try {
      const created = await createApplication({ ...values, state: 'draft' });
      message.success('Application created');
      setShowAddForm(false);
      addForm.resetFields();
      setHighlightId(created._id);
      setTimeout(() => setHighlightId(null), 3000);
      loadItems();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const handleDelete = (record: ApplicationItem) => {
    modal.confirm({
      title: `Delete "${record.name}"?`,
      content: 'This will permanently remove this application.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteRefItem('applications', record._id);
        message.success('Application deleted');
        loadItems();
      },
    });
  };

  const handleBulkDelete = () => {
    if (!selectedRowKeys.length) return;
    modal.confirm({
      title: `Delete ${selectedRowKeys.length} selected applications?`,
      content: `This will permanently remove ${selectedRowKeys.length} selected applications.`,
      okText: 'Delete Selected',
      okButtonProps: { danger: true },
      onOk: async () => {
        await Promise.all(selectedRowKeys.map((id) => deleteRefItem('applications', id)));
        message.success(`Deleted ${selectedRowKeys.length} applications`);
        setSelectedRowKeys([]);
        loadItems();
      },
    });
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
      ...filterCol('acronym'),
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
    { title: 'Status', dataIndex: 'state', key: 'state', width: 140,
      filters: [...new Set(items.map(i => (i as any).state || 'published'))].sort().map(v => ({ text: v, value: v })),
      onFilter: (value: any, record: ApplicationItem) => ((record as any).state || 'published') === value,
      render: (val: string, record: ApplicationItem) => {
        const currentState = (val || 'published').toLowerCase();
        const actions = getAllowedActions(userRole, currentState);
        const tagColor = stateTagColor(currentState);
        if (!actions.length) {
          return <Tag color={tagColor}>{currentState}</Tag>;
        }
        return (
          <Select
            size="small"
            value="__current__"
            style={{ width: '100%' }}
            onChange={async (action) => {
              const rule = STATE_TRANSITIONS.find(t => t.action === action && t.from === currentState);
              if (rule) {
                try {
                  await transitionState('applications', record._id, action, userRole || '');
                  loadItems();
                } catch (e: any) { message.error(e.response?.data?.error || e.message); }
              }
            }}
            options={[
              { label: <Tag color={tagColor}>{currentState}</Tag>, value: '__current__', disabled: true },
              ...actions.map(a => ({ label: `${a.action} → ${a.to}`, value: a.action })),
            ]}
          />
        );
      },
    },
    { title: 'Owner', dataIndex: 'owner', key: 'owner', width: 130, ellipsis: true, render: (v: string) => v || '—' },
    { title: '', key: 'actions', width: 90, render: (_: unknown, record: ApplicationItem) => readOnly ? null : (
      <Space size="small">
        <Tooltip title="Edit">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        </Tooltip>
        <Tooltip title="Delete">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </Tooltip>
      </Space>
    )},
  ], [items, readOnly]);

  const columns = [
    ...allColumnDefs.filter(c => c.key !== 'actions' && visibleKeys.has(c.key as string)),
    ...(readOnly ? [] : [allColumnDefs.find(c => c.key === 'actions')!]),
  ];

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
          onChange={(e) => {
            setSearch(e.target.value);
            setExactSearch(false);
          }}
        />
        <Popover content={columnToggleContent} title="Toggle Columns" trigger="click" placement="bottomRight">
          <Button size="small" icon={<SettingOutlined />}>Columns</Button>
        </Popover>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} of {items.length} applications</span>
        {!readOnly && <Button danger size="small" icon={<DeleteOutlined />} disabled={!selectedRowKeys.length} onClick={handleBulkDelete}>
          Delete Selected ({selectedRowKeys.length})
        </Button>}
        {!readOnly && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setShowAddForm(true); }}>
          New Application
        </Button>}
      </div>

      <Table
        dataSource={filtered}
        columns={enhanceColumnsWithSortAndFilters(columns as any, filtered)}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} items`, position: ['topRight'] }}
        className="flex-1"
        scroll={{ x: scrollX, y: 'calc(100vh - 220px)' }}
        rowClassName={(record) => record._id === highlightId ? 'row-just-created' : ''}
        rowSelection={readOnly ? undefined : {
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
      />

      <Drawer
        title={detail?.name}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={520}
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Correlation ID">
              {(detail as any)?.correlation_id || detail.correlationId || '—'}
            </Descriptions.Item>
            {fullAppDetailLoading && (
              <Descriptions.Item label="Full Details">
                <Spin size="small" /> Loading full application details...
              </Descriptions.Item>
            )}
            {!fullAppDetailLoading && fullAppDetail && (
              <>
                <Descriptions.Item label="Full Details Status">
                  <Tag color="blue">Linked from Application Catalog</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Full Acronym">{fullAppDetail.acronym || '—'}</Descriptions.Item>
                <Descriptions.Item label="Full Short Description">{fullAppDetail.shortDescription || '—'}</Descriptions.Item>
                <Descriptions.Item label="Full Type">{fullAppDetail.applicationType || '—'}</Descriptions.Item>
                <Descriptions.Item label="Full Criticality">{fullAppDetail.businessCriticality || '—'}</Descriptions.Item>
                <Descriptions.Item label="Full Lifecycle Status">{fullAppDetail.lifecycleStatus || '—'}</Descriptions.Item>
              </>
            )}
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
            <Descriptions.Item label="Servers">
              {detailServersLoading ? (
                <Spin size="small" />
              ) : detailServers.length ? (
                <List
                  size="small"
                  dataSource={detailServers}
                  renderItem={(server) => (
                    <List.Item style={{ paddingInline: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography.Link onClick={() => onNavigateToFactory?.('servers', server.name)}>
                          {server.name}
                        </Typography.Link>
                        <span className="text-xs text-gray-500">
                          {[server.hostName, server.fqdn, server.ipAddress].filter(Boolean).join(' | ') || 'No host details'}
                        </span>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                '—'
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <Modal
        title="New Application"
        open={showAddForm}
        onCancel={() => setShowAddForm(false)}
        onOk={() => addForm.submit()}
        okText="Create"
        width={720}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddApplication}>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
              <Input autoFocus />
            </Form.Item>
            <Form.Item name="acronym" label="Acronym"><Input /></Form.Item>
            <Form.Item name="applicationType" label="Application Type">
              <Select allowClear options={['cots','homegrown','saas','tenant','vendor_hosted'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="businessCriticality" label="Business Criticality">
              <Select allowClear options={['mission_critical','business_critical','business_operational','administrative','deferrable','non_essential'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="lifecycle" label="Lifecycle">
              <Select allowClear options={['Ideation','Design','Operational','End of Life','Non Application'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="lifecycleStatus" label="Lifecycle Status">
              <Select allowClear options={['build','in_use','in_maintenance','propose_to_retire','funded_to_retire','tracking','under_evaluation'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="installType" label="Install Type">
              <Select allowClear options={['cloud','hybrid','on_premise','third_party_hosted'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="discoverySource" label="Discovery Source">
              <Select allowClear showSearch options={['CLOUDBAND-USP','MOTS','mots'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="userInterface" label="User Interface">
              <Select allowClear options={['Web GUI','Non-Web GUI','Mobile App','Mobile Web','Hybrid Mobile Apps','Multiple GUI','Command Line','IVR','None-Batch','Non-Graphical','Web Service','Other'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="owner" label="Owner"><Input /></Form.Item>
            <Form.Item name="customerFacing" label="Customer Facing">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="internetFacing" label="Internet Facing">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="cpniIndicator" label="CPNI Indicator">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="handleSpi" label="Handle SPI">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="storeSpi" label="Store SPI">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="pciData" label="PCI Data">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="pciDataStored" label="PCI Data Stored">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }, { label: 'Tokenized', value: 'T' }]} />
            </Form.Item>
            <Form.Item name="soxFsa" label="SOX/FSA">
              <Select allowClear options={[{ label: 'Yes', value: 'Y' }, { label: 'No', value: 'N' }]} />
            </Form.Item>
            <Form.Item name="correlationId" label="Correlation ID"><Input /></Form.Item>
          </div>
          <Form.Item name="shortDescription" label="Short Description"><Input /></Form.Item>
          <Form.Item name="businessPurpose" label="Business Purpose"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="applPurpose" label="Application Purpose"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Edit: ${editingApp?.name ?? ''}`}
        open={!!editingApp}
        onCancel={() => { setEditingApp(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        okText="Save"
        width={600}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateApplication}>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="acronym" label="Acronym"><Input /></Form.Item>
            <Form.Item name="applicationType" label="Type"><Input /></Form.Item>
            <Form.Item name="businessCriticality" label="Criticality"><Input /></Form.Item>
            <Form.Item name="lifecycleStatus" label="Lifecycle Status">
              <Select allowClear options={['build','in_use','in_maintenance','propose_to_retire'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item name="lifecycle" label="Lifecycle"><Input /></Form.Item>
            <Form.Item name="installType" label="Install Type"><Input /></Form.Item>
            <Form.Item name="discoverySource" label="Discovery Source"><Input /></Form.Item>
            <Form.Item name="customerFacing" label="Customer Facing"><Input /></Form.Item>
            <Form.Item name="internetFacing" label="Internet Facing"><Input /></Form.Item>
            <Form.Item name="owner" label="Owner"><Input /></Form.Item>
            <Form.Item name="userInterface" label="User Interface"><Input /></Form.Item>
          </div>
          <Form.Item name="shortDescription" label="Short Description"><Input /></Form.Item>
          <Form.Item name="businessPurpose" label="Business Purpose"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="applPurpose" label="App Purpose"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
