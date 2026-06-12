import { useState, useEffect } from 'react';
import { Modal, Table, Button, Input, Select, Space, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';

interface UserRecord {
  _id: string;
  userId: string;
  displayName: string;
  role: string | null;
  lastLogin?: string;
}

interface RoleOption {
  _id: string;
  name: string;
  description?: string;
}

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AdminPanel({ open, onClose }: AdminPanelProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/roles'),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch {
      message.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  const handleRoleChange = async (userId: string, newRole: string | null) => {
    try {
      const res = await api.put(`/admin/users/${userId}`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, role: res.data.role } : u)));
      message.success('Role updated');
    } catch {
      message.error('Failed to update role');
    }
  };

  const handleAdd = async () => {
    if (!newUserId.trim()) { message.warning('User ID is required'); return; }
    setAdding(true);
    try {
      const res = await api.post('/admin/users', {
        userId: newUserId.trim(),
        displayName: newDisplayName.trim() || newUserId.trim(),
        role: newRole || null,
      });
      setUsers((prev) => [...prev, res.data]);
      setShowAdd(false);
      setNewUserId('');
      setNewDisplayName('');
      setNewRole(undefined);
      message.success('User created');
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to create user');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/users/${id}`);
      setUsers((prev) => prev.filter((u) => u._id !== id));
      message.success('User deleted');
    } catch {
      message.error('Failed to delete user');
    }
  };

  const columns = [
    { title: 'User ID', dataIndex: 'userId', key: 'userId', width: 160 },
    { title: 'Display Name', dataIndex: 'displayName', key: 'displayName', width: 180 },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 200,
      render: (role: string | null, record: UserRecord) => (
        <Select
          value={role || undefined}
          placeholder="No role"
          allowClear
          style={{ width: '100%' }}
          onChange={(val) => handleRoleChange(record._id, val || null)}
          options={roles.map((r) => ({ value: r.name, label: r.name }))}
        />
      ),
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: UserRecord) => (
        <Popconfirm title="Delete this user?" onConfirm={() => handleDelete(record._id)}>
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title="User Administration"
      open={open}
      onCancel={onClose}
      width={800}
      footer={null}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAdd(true)}>
            Add User
          </Button>
        </div>

        <Table
          dataSource={users}
          columns={enhanceColumnsWithSortAndFilters(columns as any, users)}
          rowKey="_id"
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ y: 400 }}
        />

        {showAdd && (
          <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Input
                placeholder="User ID (required)"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                onPressEnter={handleAdd}
              />
              <Input
                placeholder="Display Name (optional)"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <Select
                placeholder="Assign role (optional)"
                allowClear
                style={{ width: '100%' }}
                value={newRole}
                onChange={setNewRole}
                options={roles.map((r) => ({ value: r.name, label: r.name }))}
              />
              <Space>
                <Button type="primary" onClick={handleAdd} loading={adding}>Create</Button>
                <Button onClick={() => setShowAdd(false)}>Cancel</Button>
              </Space>
            </Space>
          </div>
        )}
      </Space>
    </Modal>
  );
}
