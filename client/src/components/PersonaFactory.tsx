import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Button, App as AntApp, Space, Tooltip, Modal, Form } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { getPersonas, createPersona, updatePersona, deletePersona, type PersonaItem } from '../api';

interface PersonaFactoryProps {
  defaultAdd?: string;
  onItemAdded?: () => void;
}

export default function PersonaFactory({ defaultAdd, onItemAdded }: PersonaFactoryProps) {
  const { message, modal } = AntApp.useApp();
  const [items, setItems] = useState<PersonaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PersonaItem | null>(null);
  const [form] = Form.useForm();

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPersonas();
      setItems(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Open Add modal when navigated from BpmnEditor properties panel
  useEffect(() => {
    console.log('[PersonaFactory] defaultAdd effect:', defaultAdd);
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

  const handleEdit = (item: PersonaItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      name: item.name,
      role: item.role,
      description: item.description,
    });
    setShowForm(true);
  };

  const handleDelete = (item: PersonaItem) => {
    modal.confirm({
      title: `Delete "${item.name}"?`,
      content: 'This will permanently remove this persona.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deletePersona(item._id);
        message.success('Deleted');
        loadItems();
      },
    });
  };

  const handleFormSubmit = async (values: { name: string; role?: string; description?: string }) => {
    try {
      const payload = {
        name: values.name,
        role: values.role || '',
        description: values.description || '',
      };
      if (editingItem) {
        await updatePersona(editingItem._id, payload);
        message.success('Updated');
      } else {
        await createPersona(payload);
        message.success('Created');
      }
      setShowForm(false);
      loadItems();
      onItemAdded?.();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const filtered = search
    ? items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.role || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 220, sorter: (a: PersonaItem, b: PersonaItem) => a.name.localeCompare(b.name) },
    { title: 'Role', dataIndex: 'role', key: 'role', width: 200, sorter: (a: PersonaItem, b: PersonaItem) => (a.role || '').localeCompare(b.role || '') },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '', key: 'actions', width: 80, render: (_: unknown, record: PersonaItem) => (
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
          placeholder="Search personas…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 280 }}
          allowClear
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{filtered.length} items</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          New Persona
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
        title={editingItem ? 'Edit Persona' : 'New Persona'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={() => form.submit()}
        okText={editingItem ? 'Update' : 'Create'}
        width={500}
        destroyOnClose={false}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleFormSubmit} className="mt-4">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Customer, Agent, Technician" />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Input placeholder="e.g. End User, Support Staff, Field Engineer" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Brief description of this persona's responsibilities" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
