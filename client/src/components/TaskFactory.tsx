import { useState, useEffect, useCallback } from 'react';
import { Table, Select, Input, Button, Modal, Form, Tag, App as AntApp, Space, Tooltip, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { TaskRecord, TaskCreatePayload, ReferenceData, TaskAddData } from '../types';
import { getTasks, getTaskReference, createTask, updateTask, deleteTask } from '../api';

interface TaskFactoryProps {
  defaultSearch?: string;
  defaultAddData?: TaskAddData;
  onItemAdded?: () => void;
  onNavigateToFactory?: (tab: string, search: string) => void;
}

export default function TaskFactory({ defaultSearch, defaultAddData, onItemAdded, onNavigateToFactory }: TaskFactoryProps = {}) {
  const { message, modal } = AntApp.useApp();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [refData, setRefData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [form] = Form.useForm();

  // Load reference data once
  useEffect(() => {
    getTaskReference().then(setRefData).catch((e) => message.error(e.message));
  }, [message]);

  // Sync external search prop
  useEffect(() => {
    if (defaultSearch !== undefined) setFilters((f) => ({ ...f, search: defaultSearch }));
  }, [defaultSearch]);

  // Open add form when defaultAddData prop changes
  useEffect(() => {
    if (defaultAddData) {
      setEditingTask(null);
      form.resetFields();
      const formValues: Record<string, unknown> = { name: defaultAddData.name };
      if (defaultAddData.applications?.length) formValues.applications = defaultAddData.applications;
      if (defaultAddData.persona) formValues.persona = defaultAddData.persona;
      if (defaultAddData.businessFlow) formValues.businessFlow = defaultAddData.businessFlow;
      if (defaultAddData.product) formValues.product = defaultAddData.product;
      if (defaultAddData.channel) formValues.channel = defaultAddData.channel;
      if (defaultAddData.domain) formValues.domain = defaultAddData.domain;
      if (defaultAddData.subdomain) formValues.subdomain = defaultAddData.subdomain;
      form.setFieldsValue(formValues);
      setShowForm(true);
    }
  }, [defaultAddData, form]);

  // Load tasks when filters change
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const data = await getTasks(cleanFilters);
      setTasks(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, message]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleCreate = () => {
    setEditingTask(null);
    form.resetFields();
    setShowForm(true);
  };

  const handleEdit = (task: TaskRecord) => {
    setEditingTask(task);
    form.setFieldsValue(task);
    setShowForm(true);
  };

  const handleDelete = (task: TaskRecord) => {
    modal.confirm({
      title: `Delete "${task.name}"?`,
      content: `This will permanently remove the task from ${task.businessFlow} / ${task.product}.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteTask(task._id);
        message.success('Task deleted');
        loadTasks();
      },
    });
  };

  const handleFormSubmit = async (values: TaskCreatePayload) => {
    try {
      if (editingTask) {
        await updateTask(editingTask._id, values);
        message.success('Task updated');
      } else {
        await createTask(values);
        message.success('Task created');
        onItemAdded?.();
      }
      setShowForm(false);
      loadTasks();
    } catch (e: any) {
      message.error(e.response?.data?.error || e.message);
    }
  };

  const columns = [
    { title: 'Task Name', dataIndex: 'name', key: 'name', ellipsis: true, width: 220 },
    { title: 'Business Flow', dataIndex: 'businessFlow', key: 'businessFlow', ellipsis: true, width: 180,
      render: (v: string) => v ? <Typography.Link onClick={() => onNavigateToFactory?.('businessFlows', v)}>{v}</Typography.Link> : '—' },
    { title: 'Product', dataIndex: 'product', key: 'product', width: 140,
      render: (v: string) => v ? <Typography.Link onClick={() => onNavigateToFactory?.('products', v)}>{v}</Typography.Link> : '—' },
    { title: 'Channel', dataIndex: 'channel', key: 'channel', width: 90,
      render: (v: string) => v ? <Typography.Link onClick={() => onNavigateToFactory?.('channels', v)}>{v}</Typography.Link> : '—' },
    { title: 'Persona', dataIndex: 'persona', key: 'persona', width: 130,
      render: (v: string) => v ? <Typography.Link onClick={() => onNavigateToFactory?.('personas', v)}>{v}</Typography.Link> : <Tag>—</Tag>,
    },
    { title: 'Applications', dataIndex: 'applications', key: 'applications', ellipsis: true,
      render: (apps: string[]) => apps?.length
        ? apps.slice(0, 2).map((a, i) => (
            <span key={a}>{i > 0 && ', '}<Typography.Link onClick={() => onNavigateToFactory?.('applications', a)}>{a}</Typography.Link></span>
          )).concat(apps.length > 2 ? [<span key="more"> +{apps.length - 2}</span>] : [])
        : '—',
    },
    { title: '', key: 'actions', width: 80, render: (_: unknown, record: TaskRecord) => (
      <Space size="small">
        <Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
        <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} /></Tooltip>
      </Space>
    )},
  ];

  const filterSelect = (label: string, field: string, options: { name: string }[]) => (
    <Select
      placeholder={label}
      allowClear
      showSearch
      size="small"
      style={{ width: 160 }}
      value={filters[field] || undefined}
      onChange={(v) => setFilters((f) => ({ ...f, [field]: v || '' }))}
      options={options.map((o) => ({ label: o.name, value: o.name }))}
    />
  );

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {refData && (
          <>
            {filterSelect('Business Flow', 'businessFlow', refData.businessFlows)}
            {filterSelect('Product', 'product', refData.products)}
            {filterSelect('Persona', 'persona', refData.personas)}
            {filterSelect('Channel', 'channel', refData.channels)}
          </>
        )}
        <Input
          placeholder="Search tasks…"
          size="small"
          prefix={<SearchOutlined />}
          style={{ width: 180 }}
          allowClear
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <div className="flex-1" />
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          New Task
        </Button>
      </div>

      {/* Table */}
      <Table
        dataSource={tasks}
        columns={columns}
        rowKey="_id"
        size="small"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} tasks` }}
        className="flex-1"
        scroll={{ y: 'calc(100vh - 220px)' }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingTask ? 'Edit Task' : 'New Task'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={() => form.submit()}
        okText={editingTask ? 'Update' : 'Create'}
        width={560}
        destroyOnClose={false}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleFormSubmit} className="mt-4">
          <Form.Item name="name" label="Task Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="businessFlow" label="Business Flow" rules={[{ required: true }]}>
              <Select showSearch options={refData?.businessFlows.map((b) => ({ label: b.name, value: b.name }))} />
            </Form.Item>
            <Form.Item name="product" label="Product" rules={[{ required: true }]}>
              <Select showSearch options={refData?.products.map((p) => ({ label: p.name, value: p.name }))} />
            </Form.Item>
            <Form.Item name="persona" label="Persona">
              <Select allowClear showSearch options={refData?.personas.map((p) => ({ label: p.name, value: p.name }))} />
            </Form.Item>
            <Form.Item name="channel" label="Channel">
              <Select allowClear showSearch options={refData?.channels.map((c) => ({ label: c.name, value: c.name }))} />
            </Form.Item>
            <Form.Item name="domain" label="Domain">
              <Select allowClear showSearch options={refData?.domains.map((d) => ({ label: d.name, value: d.name }))} />
            </Form.Item>
            <Form.Item name="subdomain" label="Subdomain">
              <Select allowClear showSearch options={refData?.subdomains.map((s) => ({ label: s.name, value: s.name }))} />
            </Form.Item>
          </div>
          <Form.Item name="applications" label="Applications">
            <Select mode="multiple" allowClear showSearch options={refData?.applications.map((a) => ({ label: a.name, value: a.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
