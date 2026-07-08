import { memo, useState } from 'react';
import { App as AntApp, Input, Modal, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadCustomFactory } from '../api';

type Props = {
  open: boolean;
  neighborhoodName: string;
  onClose: () => void;
  onUploaded: (dataType: string) => Promise<void> | void;
};

function DataComponentUploadModal({ open, neighborhoodName, onClose, onUploaded }: Props) {
  const { message } = AntApp.useApp();
  const [dataType, setDataType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  const resetAndClose = () => {
    setDataType('');
    setFile(null);
    onClose();
  };

  const handleUpload = async () => {
    const trimmedType = dataType.trim();
    if (!trimmedType) {
      message.error('Data type is required');
      return;
    }
    if (!file) {
      message.error('CSV file is required');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadCustomFactory({
        neighborhoodName,
        file,
        dataType: trimmedType,
        loadDomain: 'data',
      });
      const uploadedFactories = result.factories || [];
      message.success(uploadedFactories.length === 1
        ? `Data uploaded: ${uploadedFactories[0].name}`
        : `Data uploaded: ${uploadedFactories.length}`);
      setDataType('');
      setFile(null);
      onClose();
      await onUploaded(trimmedType);
    } catch (error: any) {
      message.error(error.response?.data?.error || error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title="Load Data"
      open={open}
      onCancel={resetAndClose}
      onOk={handleUpload}
      okText={uploading ? 'Uploading…' : 'Upload'}
      confirmLoading={uploading}
      destroyOnClose
    >
      <div className="mt-4">
        <div style={{ marginBottom: 12, fontWeight: 500 }}>Data Type</div>
        <Input
          placeholder="e.g., Applications, Server"
          value={dataType}
          onChange={(e) => setDataType(e.target.value)}
          disabled={uploading}
          style={{ marginBottom: 20 }}
        />

        <div style={{ marginBottom: 8, fontWeight: 500 }}>CSV File</div>
        <div style={{ marginBottom: 12 }}>
          <Upload.Dragger
            accept=".csv"
            maxCount={1}
            beforeUpload={(nextFile) => {
              setFile(nextFile);
              return false;
            }}
            onRemove={() => {
              setFile(null);
            }}
            fileList={file ? [file as any] : []}
            disabled={uploading}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Upload a CSV file with data rows</p>
            <p className="ant-upload-hint">CSV should contain Component, Qualifier, and FK_ columns where applicable</p>
          </Upload.Dragger>
        </div>

        <div style={{ color: '#64748b', fontSize: 12 }}>
          The CSV file follows the same load rules as components, with Component columns for hierarchy, Qualifier columns, and FK_ columns.
        </div>
      </div>
    </Modal>
  );
}

export default memo(DataComponentUploadModal);