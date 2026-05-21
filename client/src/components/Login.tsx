import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface LoginProps {
  onLogin: (user: { _id: string; userId: string; displayName: string; role?: string | null; capabilities?: { function: string; permission: string }[] }) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (values: { userId: string; password?: string }) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: values.userId.trim(), password: values.password || '' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      onLogin(data.user);
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <Card className="w-[380px] shadow-lg" bordered={false}>
        <div className="text-center mb-6">
          <Title level={3} className="!mb-1">BPMN IQ</Title>
          <Text type="secondary">Sign in to continue</Text>
        </div>

        {error && <Alert message={error} type="error" showIcon className="mb-4" closable onClose={() => setError('')} />}

        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item
            name="userId"
            label="User ID"
            rules={[{ required: true, message: 'User ID is required' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Enter your user ID"
              size="large"
              autoFocus
            />
          </Form.Item>

          <Form.Item name="password" label="Password">
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password (optional)"
              size="large"
            />
          </Form.Item>

          <Form.Item className="!mb-0">
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center mt-4">
          <Text type="secondary" className="text-xs">
            First time? Enter your User ID to create an account.
          </Text>
        </div>
      </Card>
    </div>
  );
}
