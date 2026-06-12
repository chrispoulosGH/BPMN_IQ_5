import { useState, useEffect } from 'react';
import { Modal, Form, Input, Spin } from 'antd';
import { getDiagrams } from '../api';

interface AddToFactoryModalProps {
  open: boolean;
  initialName?: string;
  onSave: (values: { name: string; description: string; tags: string[] }) => void;
  onClose: () => void;
}

export default function AddToFactoryModal({ open, initialName = '', onSave, onClose }: AddToFactoryModalProps) {
  const [form] = Form.useForm();
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch existing diagram names when modal opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      getDiagrams()
        .then((diagrams) => {
          setExistingNames(new Set(diagrams.map((d) => d.name.toLowerCase().trim())));
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const tags = (values.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
    onSave({ name: values.name.trim(), description: values.description || '', tags });
  };

  return (
    <Modal
      title="Add to BPMN Component"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="Add to Component"
      destroyOnClose
      okButtonProps={{ disabled: loading }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ name: initialName, description: '', tags: '' }}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Diagram Name"
            rules={[
              { required: true, message: 'Name is required' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  if (existingNames.has(value.toLowerCase().trim())) {
                    return Promise.reject(new Error('A diagram with this name already exists'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder="My Business Process" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional description…" />
          </Form.Item>
          <Form.Item name="tags" label="Tags (comma-separated)">
            <Input placeholder="order, finance, v2" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
