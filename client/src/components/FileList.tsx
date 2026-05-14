import { useState, useEffect, useCallback } from 'react';
import { List, Button, Empty, Typography, Popconfirm } from 'antd';
import { FolderOpenOutlined, DeleteOutlined, ImportOutlined } from '@ant-design/icons';
import { getFiles, getFileXml, deleteFile } from '../api';

const { Text } = Typography;

interface FileListProps {
  onLoadXml: (xml: string, filename: string) => void;
  onRefresh: () => void;
  refreshTick: number;
}

export default function FileList({ onLoadXml, onRefresh, refreshTick }: FileListProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFiles();
      setFiles(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const handleLoad = async (filename: string) => {
    const xml = await getFileXml(filename);
    onLoadXml(xml, filename);
  };

  const handleDelete = async (filename: string) => {
    await deleteFile(filename);
    onRefresh();
  };

  return (
    <div className="flex flex-col h-full px-2 pt-3">
      <div className="flex items-center gap-2 px-2 mb-3">
        <FolderOpenOutlined className="text-gray-400" />
        <Text className="!text-gray-300 text-sm font-medium">Local .bpmn Files</Text>
      </div>

      <div className="flex-1 overflow-y-auto">
        <List
          loading={loading}
          dataSource={files}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No .bpmn files found"
                className="py-8"
              />
            ),
          }}
          renderItem={(filename) => (
            <div
              key={filename}
              className="flex items-center gap-2 px-3 py-2 mx-1 mb-1 rounded-md hover:bg-white/5 transition-colors"
            >
              <Text ellipsis className="!text-gray-200 text-xs flex-1">
                {filename}
              </Text>
              <Button
                type="text"
                size="small"
                icon={<ImportOutlined />}
                onClick={() => handleLoad(filename)}
                className="!text-blue-400 hover:!text-blue-300"
              />
              <Popconfirm
                title={`Delete "${filename}"?`}
                onConfirm={() => handleDelete(filename)}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  className="!text-gray-500 hover:!text-red-400"
                />
              </Popconfirm>
            </div>
          )}
        />
      </div>
    </div>
  );
}
