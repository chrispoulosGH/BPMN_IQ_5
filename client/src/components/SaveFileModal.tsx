import { Modal, Form, Input } from 'antd';

interface SaveFileModalProps {
  open: boolean;
  onSave: (filename: string) => void;
  onClose: () => void;
}

export default function SaveFileModal({ open, onSave, onClose }: SaveFileModalProps) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    onSave(values.filename.trim());
  };

  return (
    <Modal
      title="Export to Local File"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="Save File"
      destroyOnClose
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="filename"
          label="File name (.bpmn)"
          rules={[{ required: true, message: 'File name is required' }]}
        >
          <Input placeholder="my-process" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}
