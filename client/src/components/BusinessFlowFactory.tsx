import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Button, App as AntApp, Space, Tooltip, Modal, Form, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, LinkOutlined } from '@ant-design/icons';
import { getRefItems, createRefItem, updateRefItem, deleteRefItem, getBusinessFlowMap, type RefItem } from '../api';

interface BusinessFlowFactoryProps {
  defaultSearch?: string;
  onItemAdded?: () => void;
  onOpenDiagram?: (diagramId: string) => void;
  readOnly?: boolean;
  userRole?: string | null;
}

export default function BusinessFlowFactory({ defaultSearch, onItemAdded, onOpenDiagram, readOnly, userRole }: BusinessFlowFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<RefItem[]>([]);
  const [flowMap, setFlowMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RefItem | null>(null);
  const [form] = Form.useForm();

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [data, map] = await Promise.all([
        getRefItems('businessFlows'),
        getBusinessFlowMap(),
      ]);
      setItems(data);
      setFlowMap(map);
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

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setShowForm(true);
  };

  const handleEdit = (item: RefItem) => {
    setEditingItem(item);
    form.setFieldsValue({ name: item.name, owner: item.owner || '' });
    setShowForm(true);
  };

  const handleDelete = (item: RefItem) => {
    modal.confirm({
      title: `Delete "${item.name}"?`,
      content: 'This will permanently remove this business flow entry.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteRefItem('businessFlows', item._id);
        message.success('Deleted');
        loadItems();
      },
    });
  };

  const handleFormSubmit = async (values: { name: string; owner?: string }) => {
    try {
      if (editingItem) {
        await updateRefItem('businessFlows', editingItem._id, values.name, values.owner);
        message.success('Updated');
      } else {
        await createRefItem('businessFlows', values.name, values.owner);
        message.success('Created');
        onItemAdded?.();
      }
      setShowForm(false);
      loadItems();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const filtered = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: RefItem, b: RefItem) => a.name.localeCompare(b.name) },
    { title: 'Owner', dataIndex: 'owner', key: 'owner', width: 150, ellipsis: true,
      render: (v: string) => v || '—' },
    { title: 'BPMN Diagram', key: 'diagram', width: 160,
      render: (_: unknown, record: RefItem) => {
        const diagramId = flowMap[record.name];
        return diagramId
          ? <Typography.Link onClick={() => onOpenDiagram?.(diagramId)}><LinkOutlined /> Open Diagram</Typography.Link>
          : <span className="text-gray-400">—</span>;
      },
      filters: [{ text: 'Has Diagram', value: 'yes' }, { text: 'No Diagram', value: 'no' }],
      onFilter: (value: string | number | boolean, record: RefItem) =>
        value === 'yes' ? !!flowMap[record.name] : !flowMap[record.name],
    },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    { title: '', key: 'actions', width: 80, render: (_: unknown, record: RefItem) => readOnly ? null : (
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
          placeholder="Search business flows…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} items</span>
        {userRole === 'Super' && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          New Business Flow
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
        title={editingItem ? 'Edit Business Flow' : 'New Business Flow'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={() => form.submit()}
        okText={editingItem ? 'Update' : 'Create'}
        width={400}
        destroyOnClose={false}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleFormSubmit} className="mt-4">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="owner" label="Owner">
            <Input placeholder="Owner name or ID" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
