import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Button, App as AntApp, Space, Tooltip, Modal, Form } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { getRefItems, createRefItem, updateRefItem, deleteRefItem, type RefItem } from '../api';

interface ReferenceFactoryProps {
  collection: string;
  title: string;
  defaultSearch?: string;
  defaultAdd?: string;
  onItemAdded?: () => void;
}

export default function ReferenceFactory({ collection, title, defaultSearch, defaultAdd, onItemAdded }: ReferenceFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RefItem | null>(null);
  const [form] = Form.useForm();

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRefItems(collection);
      setItems(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [collection, message]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Sync external search prop
  useEffect(() => {
    if (defaultSearch !== undefined) setSearch(defaultSearch);
  }, [defaultSearch]);

  // Open add form when defaultAdd prop changes
  useEffect(() => {
    if (defaultAdd) {
      setEditingItem(null);
      form.resetFields();
      form.setFieldsValue({ name: defaultAdd });
      setShowForm(true);
    }
  }, [defaultAdd, form]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setShowForm(true);
  };

  const handleEdit = (item: RefItem) => {
    setEditingItem(item);
    form.setFieldsValue({ name: item.name });
    setShowForm(true);
  };

  const handleDelete = (item: RefItem) => {
    modal.confirm({
      title: `Delete "${item.name}"?`,
      content: `This will permanently remove this ${title.toLowerCase()} entry.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteRefItem(collection, item._id);
        message.success('Deleted');
        loadItems();
      },
    });
  };

  const handleFormSubmit = async (values: { name: string }) => {
    try {
      if (editingItem) {
        await updateRefItem(collection, editingItem._id, values.name);
        message.success('Updated');
      } else {
        await createRefItem(collection, values.name);
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
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    { title: '', key: 'actions', width: 80, render: (_: unknown, record: RefItem) => (
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
          placeholder={`Search ${title.toLowerCase()}…`}
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} items</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          New {title}
        </Button>
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
        title={editingItem ? `Edit ${title}` : `New ${title}`}
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
        </Form>
      </Modal>
    </div>
  );
}
