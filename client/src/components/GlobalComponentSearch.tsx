import { useState, useCallback, useMemo } from 'react';
import {
  Modal,
  Input,
  Button,
  Table,
  Space,
  Spin,
  Empty,
  Tag,
  Typography,
  Tooltip,
  Segmented,
  Select,
} from 'antd';
import {
  SearchOutlined,
  CloseOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { message } from 'antd';

interface HierarchyNode {
  componentName: string;
  rowName: string;
  componentId: string;
  rowId: string;
  level: number;
  values: Record<string, any>;
}

interface SearchResult {
  searchMatchComponentId: string;
  searchMatchComponentName: string;
  searchMatchRowId: string;
  searchMatchRowName: string;
  hierarchy: HierarchyNode[];
  hierarchyPath: string;
  state: string;
  owner: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface GlobalComponentSearchProps {
  visible: boolean;
  neighborhoodName: string;
  onClose: () => void;
}

type ViewMode = 'list' | 'tree';

const GlobalComponentSearch: React.FC<GlobalComponentSearchProps> = ({
  visible,
  neighborhoodName,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<'hierarchy' | 'component' | 'name'>('hierarchy');

  const handleSearch = useCallback(async () => {
    if (!searchTerm || searchTerm.length < 2) {
      message.warning('Search term must be at least 2 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/custom-factories/search/global?neighborhoodName=${encodeURIComponent(
          neighborhoodName
        )}&term=${encodeURIComponent(searchTerm)}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Search failed');
      }

      const data = await response.json();
      setResults(data.results || []);

      if (data.results?.length === 0) {
        message.info('No components found matching your search');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Search failed';
      message.error(`Search error: ${errorMsg}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, neighborhoodName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    
    if (sortBy === 'hierarchy') {
      sorted.sort((a, b) => a.hierarchyPath.localeCompare(b.hierarchyPath));
    } else if (sortBy === 'component') {
      sorted.sort((a, b) =>
        a.searchMatchComponentName.localeCompare(b.searchMatchComponentName)
      );
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.searchMatchRowName.localeCompare(b.searchMatchRowName));
    }
    
    return sorted;
  }, [results, sortBy]);

  const columns = [
    {
      title: 'Hierarchy Path',
      dataIndex: 'hierarchyPath',
      key: 'hierarchyPath',
      width: '40%',
      render: (text: string, record: SearchResult) => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Component',
      dataIndex: 'searchMatchComponentName',
      key: 'component',
      width: '20%',
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: 'Value',
      dataIndex: 'searchMatchRowName',
      key: 'value',
      width: '15%',
    },
    {
      title: 'State',
      dataIndex: 'state',
      key: 'state',
      width: '10%',
      render: (state: string) => {
        const color = state === 'published' ? 'green' : state === 'invalid' ? 'red' : 'orange';
        return <Tag color={color}>{state}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '15%',
      render: (_: any, record: SearchResult) => (
        <Space size="small">
          <Tooltip title="Copy hierarchy path">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(record.hierarchyPath);
                message.success('Copied to clipboard');
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const treeView = useMemo(() => {
    return sortedResults.map((result, idx) => (
      <div
        key={`${result.searchMatchRowId}-${idx}`}
        style={{
          marginBottom: '16px',
          padding: '12px',
          border: '1px solid #f0f0f0',
          borderRadius: '4px',
          backgroundColor: '#fafafa',
        }}
      >
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
          <span>{result.hierarchyPath}</span>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            style={{ marginLeft: '8px' }}
            onClick={() => {
              navigator.clipboard.writeText(result.hierarchyPath);
              message.success('Copied to clipboard');
            }}
          />
        </div>
        
        <div style={{ marginLeft: '12px', fontSize: '12px', color: '#666' }}>
          {result.hierarchy.map((node, level) => (
            <div key={`${node.rowId}-${level}`} style={{ marginBottom: '4px' }}>
              <span style={{ marginRight: '8px', color: '#999' }}>
                {Array(level * 2)
                  .fill('─')
                  .join('')}
              </span>
              <span style={{ fontWeight: node.level === result.hierarchy.length - 1 ? 'bold' : 'normal' }}>
                <Tag color={node.level === result.hierarchy.length - 1 ? 'blue' : 'default'}>
                  {node.componentName}
                </Tag>
                {node.rowName}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
          <Tag color={result.state === 'published' ? 'green' : result.state === 'invalid' ? 'red' : 'orange'}>
            {result.state}
          </Tag>
          {result.createdBy && <span> | Created by: {result.createdBy}</span>}
          {result.updatedBy && <span> | Updated by: {result.updatedBy}</span>}
        </div>
      </div>
    ));
  }, [sortedResults]);

  return (
    <Modal
      title="Global Component Search"
      visible={visible}
      onCancel={onClose}
      width={1200}
      bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <div style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space style={{ width: '100%' }}>
            <Input
              placeholder="Search component values (min 2 characters)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              prefix={<SearchOutlined />}
              allowClear
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              onClick={handleSearch}
              loading={loading}
              icon={<SearchOutlined />}
            >
              Search
            </Button>
          </Space>

          <Space wrap>
            <span style={{ color: '#666' }}>View:</span>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                { label: 'List View', value: 'list' },
                { label: 'Tree View', value: 'tree' },
              ]}
            />

            {viewMode === 'list' && (
              <>
                <span style={{ color: '#666' }}>Sort by:</span>
                <Select
                  value={sortBy}
                  onChange={setSortBy}
                  style={{ width: 180 }}
                  options={[
                    { label: 'Hierarchy Path', value: 'hierarchy' },
                    { label: 'Component Name', value: 'component' },
                    { label: 'Row Value', value: 'name' },
                  ]}
                />
              </>
            )}
          </Space>

          {sortedResults.length > 0 && (
            <Typography.Text type="secondary">
              Found {sortedResults.length} matching component{sortedResults.length !== 1 ? 's' : ''}
            </Typography.Text>
          )}
        </Space>
      </div>

      <Spin spinning={loading}>
        {sortedResults.length === 0 && !loading ? (
          <Empty
            description={
              searchTerm ? 'No results found' : 'Enter a search term and click Search'
            }
            style={{ marginTop: '40px' }}
          />
        ) : viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={sortedResults}
            rowKey={(record) => `${record.searchMatchRowId}`}
            pagination={{
              pageSize: 20,
              showTotal: (total) => `Total ${total} items`,
            }}
            size="small"
            scroll={{ x: 1200 }}
          />
        ) : (
          <div style={{ padding: '16px' }}>{treeView}</div>
        )}
      </Spin>
    </Modal>
  );
};

export default GlobalComponentSearch;
