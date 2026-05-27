import { useState, useEffect, useCallback } from 'react';
import { List, Typography, Tag, Space, Button, Popconfirm, Empty, Alert } from 'antd';
import {
  DeleteOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { DiagramMeta } from '../types';
import { getDiagrams, searchDiagrams, deleteDiagram } from '../api';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface DiagramListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onDelete?: (id: string) => void;
  refreshTick: number;
  searchQuery: string;
  readOnly?: boolean;
}

export default function DiagramList({ selectedId, onSelect, onRefresh, onDelete, refreshTick, searchQuery, readOnly }: DiagramListProps) {
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (searchQuery.trim()) {
        const results = await searchDiagrams(searchQuery.trim());
        setDiagrams(results);
      } else {
        const data = await getDiagrams();
        setDiagrams(data);
      }
    } catch (err: any) {
      const msg = err?.message?.includes('Network Error')
        ? 'Cannot connect to server — is the backend running?'
        : `Failed to load diagrams: ${err?.message || 'Unknown error'}`;
      setError(msg);
      setDiagrams([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  // Debounced search on query change
  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, load]);

  const handleDelete = async (e: React.MouseEvent | undefined, id: string) => {
    e?.stopPropagation();
    await deleteDiagram(id);
    onDelete?.(id);
    onRefresh();
  };

  return (
    <>
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          className="mx-1 mb-2"
          onClose={() => setError(null)}
        />
      )}
      <Text type="secondary" className="text-xs px-2 mb-1 block">{diagrams.length} diagrams</Text>
      <List
        loading={loading}
        dataSource={diagrams}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={searchQuery ? 'No matches found' : 'No diagrams saved'}
              className="py-6"
            />
          ),
        }}
        renderItem={(item) => (
          <div
            key={item._id}
          onClick={() => onSelect(item._id)}
          className={`diagram-list-item cursor-pointer rounded-md mx-1 mb-1 px-3 py-2.5 group ${
            selectedId === item._id ? 'active' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <FileTextOutlined className="text-blue-500 text-xs flex-shrink-0" />
                <Text strong ellipsis className="text-sm block max-w-[180px]">
                  {item.name}
                </Text>
              </div>

              <Space size={4} className="mb-0.5">
                <ClockCircleOutlined className="text-gray-400 text-[10px]" />
                <Text type="secondary" className="text-xs">
                  {dayjs(item.updatedAt).fromNow()}
                </Text>
                <Text type="secondary" className="text-xs">
                  · v{item.version}
                </Text>
              </Space>

              {item.status && (
                <div className="mt-0.5">
                  <Tag
                    color={
                      item.status === 'published' ? 'green' :
                      item.status === 'staged' ? 'blue' :
                      item.status === 'draft' ? 'default' :
                      item.status === 'archived' ? 'red' : 'default'
                    }
                    className="!text-[10px] !leading-4 !m-0 capitalize"
                  >
                    {item.status}
                  </Tag>
                </div>
              )}
            </div>

            {!readOnly && <Popconfirm
              title="Delete this diagram?"
              onConfirm={(e) => handleDelete(e as React.MouseEvent | undefined, item._id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
              placement="left"
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </Popconfirm>}
          </div>
        </div>
      )}
    />
    </>
  );
}
