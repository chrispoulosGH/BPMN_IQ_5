import { useState } from 'react';
import { Modal, Form, Input, Space } from 'antd';

interface SaveModalProps {
  open: boolean;
  initial?: { name?: string; description?: string; tags?: string[] };
  onSave: (values: { name: string; description: string; tags: string[] }) => void;
  onClose: () => void;
}

export default function SaveModal({ open, initial = {}, onSave, onClose }: SaveModalProps) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    const tags = (values.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
    onSave({ name: values.name, description: values.description || '', tags });
  };

  return (
    <Modal
      title="Save Diagram to MongoDB"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="Save"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: initial.name || '',
          description: initial.description || '',
          tags: (initial.tags || []).join(', '),
        }}
        className="mt-4"
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input placeholder="My Business Process" autoFocus />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="Optional description…" />
        </Form.Item>
        <Form.Item name="tags" label="Tags (comma-separated)">
          <Input placeholder="order, finance, v2" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
