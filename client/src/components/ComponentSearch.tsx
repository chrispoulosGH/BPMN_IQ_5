import { useState, useCallback, useMemo } from 'react';
import {
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
  Card,
  Collapse,
} from 'antd';
import {
  SearchOutlined,
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
  searchMatchFieldName: string;
  searchMatchFieldValue: string;
  hierarchy: HierarchyNode[];
  hierarchyPath: string;
  state: string;
  owner: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ComponentSearchProps {
  neighborhoodName: string;
  onRowClick?: (componentId: string, rowId: string) => void;
}

type ViewMode = 'list' | 'tree';

const ComponentSearch: React.FC<ComponentSearchProps> = ({
  neighborhoodName,
  onRowClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<'hierarchy' | 'component' | 'name'>('hierarchy');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchTerm || searchTerm.length < 2) {
      message.warning('Search term must be at least 2 characters');
      return;
    }

    setLoading(true);
    setHasSearched(true);
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

  // Group results by component
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    sortedResults.forEach(result => {
      const key = result.searchMatchComponentId;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(result);
    });
    return Array.from(groups.entries()).map(([componentId, items]) => ({
      componentId,
      componentName: items[0]?.searchMatchComponentName || '',
      results: items,
    }));
  }, [sortedResults]);

  const columns = [
    {
      title: 'Hierarchy Path',
      dataIndex: 'hierarchyPath',
      key: 'hierarchyPath',
      width: '35%',
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Matched Field',
      dataIndex: 'searchMatchFieldName',
      key: 'matchedField',
      width: '15%',
      render: (fieldName: string, record: SearchResult) => (
        <Tooltip title={`${fieldName}: ${record.searchMatchFieldValue}`}>
          <span>{fieldName}</span>
        </Tooltip>
      ),
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
      width: '25%',
      render: (_: any, record: SearchResult) => (
        <Space size="small">
          {onRowClick && (
            <Button
              type="primary"
              size="small"
              onClick={() => onRowClick(record.searchMatchComponentId, record.searchMatchRowId)}
            >
              View
            </Button>
          )}
          <Tooltip title="Copy path">
            <Button
              type="text"
              size="small"
              onClick={() => {
                navigator.clipboard.writeText(record.hierarchyPath);
                message.success('Copied to clipboard');
              }}
            >
              Copy
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const treeView = useMemo(() => {
    return sortedResults.map((result, idx) => (
      <Card
        key={`${result.searchMatchRowId}-${idx}`}
        size="small"
        style={{ marginBottom: '12px' }}
        hoverable
      >
        <div style={{ marginBottom: '8px' }}>
          <strong>{result.hierarchyPath}</strong>
        </div>
        
        <div style={{ marginLeft: '12px', fontSize: '12px', color: '#666', marginBottom: '8px' }}>
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

        <div style={{ fontSize: '12px', color: '#999', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
          <Space size="small" wrap>
            <Tag color={result.state === 'published' ? 'green' : result.state === 'invalid' ? 'red' : 'orange'}>
              {result.state}
            </Tag>
            {result.createdBy && <span>Created by: {result.createdBy}</span>}
            {onRowClick && (
              <Button
                type="primary"
                size="small"
                onClick={() => onRowClick(result.searchMatchComponentId, result.searchMatchRowId)}
              >
                View
              </Button>
            )}
          </Space>
        </div>
      </Card>
    ));
  }, [sortedResults, onRowClick]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Search Controls */}
      <Card size="small">
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
            <span style={{ color: '#666', fontSize: '12px' }}>View:</span>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                { label: 'List', value: 'list' },
                { label: 'Tree', value: 'tree' },
              ]}
              size="small"
            />

            {viewMode === 'list' && (
              <>
                <span style={{ color: '#666', fontSize: '12px' }}>Sort by:</span>
                <Select
                  value={sortBy}
                  onChange={setSortBy}
                  style={{ width: 150 }}
                  size="small"
                  options={[
                    { label: 'Hierarchy Path', value: 'hierarchy' },
                    { label: 'Component', value: 'component' },
                    { label: 'Value', value: 'name' },
                  ]}
                />
              </>
            )}
          </Space>

          {sortedResults.length > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
              Found {sortedResults.length} matching component{sortedResults.length !== 1 ? 's' : ''} in {groupedResults.length} component{groupedResults.length !== 1 ? 's' : ''}
            </Typography.Text>
          )}
        </Space>
      </Card>

      {/* Results */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '8px' }}>
        <Spin spinning={loading}>
          {!hasSearched ? (
            <Empty
              description="Enter a search term above"
              style={{ marginTop: '40px' }}
            />
          ) : sortedResults.length === 0 ? (
            <Empty
              description="No results found"
              style={{ marginTop: '40px' }}
            />
          ) : viewMode === 'list' ? (
            <>
              {groupedResults.length > 1 ? (
                <Collapse
                  items={groupedResults.map((group) => ({
                    key: group.componentId,
                    label: (
                      <div>
                        <Tag>{group.componentName}</Tag>
                        <span style={{ marginLeft: '8px', color: '#666' }}>
                          ({group.results.length} match{group.results.length !== 1 ? 'es' : ''})
                        </span>
                      </div>
                    ),
                    children: (
                      <Table
                        columns={columns}
                        dataSource={group.results}
                        rowKey={(record) => record.searchMatchRowId}
                        pagination={false}
                        size="small"
                        scroll={{ x: 1000, y: 400 }}
                      />
                    ),
                  }))}
                />
              ) : (
                <Table
                  columns={columns}
                  dataSource={sortedResults}
                  rowKey={(record) => record.searchMatchRowId}
                  pagination={false}
                  size="small"
                  scroll={{ x: 1000, y: 600 }}
                  style={{ width: '100%' }}
                />
              )}
            </>
          ) : (
            <div>{treeView}</div>
          )}
        </Spin>
      </div>
    </div>
  );
};

export default ComponentSearch;
