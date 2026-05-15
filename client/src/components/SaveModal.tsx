import { useState } from 'react';
import { Modal, Form, Input, Space } from 'antd';

interface SaveModalProps {
  open: boolean;
  initial?: { name?: string; description?: string; tags?: string[] };
  isUpdate?: boolean;
  defaultChangeNote?: string;
  onSave: (values: { name: string; description: string; tags: string[]; changeNote?: string }) => void;
  onClose: () => void;
}

export default function SaveModal({ open, initial = {}, isUpdate, defaultChangeNote, onSave, onClose }: SaveModalProps) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    const tags = (values.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
    onSave({ name: values.name, description: values.description || '', tags, changeNote: values.changeNote || undefined });
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
          changeNote: defaultChangeNote || '',
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
        {isUpdate && (
          <Form.Item name="changeNote" label="Change Note">
            <Input.TextArea rows={2} placeholder="Describe what changed…" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
