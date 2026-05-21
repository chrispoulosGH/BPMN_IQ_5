import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Button, App as AntApp, Space, Tooltip, Modal, Form, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { getCapabilities, createCapability, updateCapability, deleteCapability, type CapabilityItem } from '../api';

interface CapabilitiesFactoryProps {
  onNavigateToFactory?: (tab: string, search: string) => void;
  readOnly?: boolean;
}

export default function CapabilitiesFactory({ onNavigateToFactory, readOnly }: CapabilitiesFactoryProps = {}) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<CapabilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CapabilityItem | null>(null);
  const [form] = Form.useForm();

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCapabilities();
      setItems(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setShowForm(true);
  };

  const handleEdit = (item: CapabilityItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      name: item.name,
      domainName: item.domainName,
      aspect: item.aspect,
      briefDescription: item.briefDescription,
      tmfVersion: item.tmfVersion,
      owner: item.owner || '',
    });
    setShowForm(true);
  };

  const handleDelete = (item: CapabilityItem) => {
    modal.confirm({
      title: `Delete "${item.name}"?`,
      content: 'This will permanently remove this business capability entry.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteCapability(item._id);
        message.success('Deleted');
        loadItems();
      },
    });
  };

  const handleFormSubmit = async (values: { name: string; domainName?: string; aspect?: string; briefDescription?: string; tmfVersion?: string; owner?: string }) => {
    try {
      const payload = {
        name: values.name,
        domainName: values.domainName || '',
        aspect: values.aspect || '',
        briefDescription: values.briefDescription || '',
        tmfVersion: values.tmfVersion || 'GB1029C',
        owner: values.owner || '',
      };
      if (editingItem) {
        await updateCapability(editingItem._id, payload);
        message.success('Updated');
      } else {
        await createCapability(payload);
        message.success('Created');
      }
      setShowForm(false);
      loadItems();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const filtered = search
    ? items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.domainName || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.aspect || '').toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 260, sorter: (a: CapabilityItem, b: CapabilityItem) => a.name.localeCompare(b.name) },
    { title: 'Domain', dataIndex: 'domainName', key: 'domainName', width: 200, sorter: (a: CapabilityItem, b: CapabilityItem) => (a.domainName || '').localeCompare(b.domainName || ''),
      render: (v: string) => v ? <Typography.Link onClick={() => onNavigateToFactory?.('domains', v)}>{v}</Typography.Link> : '—' },
    { title: 'Aspect', dataIndex: 'aspect', key: 'aspect', width: 180, sorter: (a: CapabilityItem, b: CapabilityItem) => (a.aspect || '').localeCompare(b.aspect || '') },
    { title: 'Description', dataIndex: 'briefDescription', key: 'briefDescription', ellipsis: true },
    { title: 'TMF Version', dataIndex: 'tmfVersion', key: 'tmfVersion', width: 110 },
    { title: 'Owner', dataIndex: 'owner', key: 'owner', width: 130, ellipsis: true,
      render: (v: string) => v || '—' },
    { title: '', key: 'actions', width: 80, render: (_: unknown, record: CapabilityItem) => readOnly ? null : (
      <Space size="small">
        <Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
        <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} /></Tooltip>
      </Space>
    )},
  ];

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search capabilities…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          allowClear
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} items</span>
        {!readOnly && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          New Capability
        </Button>}
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} items` }}
        className="flex-1"
        scroll={{ y: 'calc(100vh - 220px)' }}
      />

      <Modal
        title={editingItem ? 'Edit Capability' : 'New Capability'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={() => form.submit()}
        okText={editingItem ? 'Update' : 'Create'}
        width={560}
        destroyOnClose={false}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleFormSubmit} className="mt-4">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="domainName" label="Domain Name">
            <Input placeholder="e.g. Operations - Customer Domain" />
          </Form.Item>
          <Form.Item name="aspect" label="Aspect">
            <Input placeholder="e.g. Strategy, Infrastructure, Product" />
          </Form.Item>
          <Form.Item name="briefDescription" label="Brief Description">
            <Input.TextArea rows={3} placeholder="Short description of this capability" />
          </Form.Item>
          <Form.Item name="tmfVersion" label="TMF Version" initialValue="GB1029C">
            <Input placeholder="GB1029C" />
          </Form.Item>
          <Form.Item name="owner" label="Owner">
            <Input placeholder="Owner name or ID" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
