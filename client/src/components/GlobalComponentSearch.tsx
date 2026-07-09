import { memo, useState, useCallback, useMemo, useEffect } from 'react';
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
  Pagination,
  AutoComplete,
} from 'antd';
import {
  SearchOutlined,
  CloseOutlined,
  DownOutlined,
  RightOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { buildMergedHierarchyTree, type MergedHierarchyTreeNode } from '../utils/mergedHierarchyTree';

interface HierarchyNode {
  componentName: string;
  rowName: string;
  componentId: string;
  rowId: string;
  level: number;
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

interface GlobalComponentSearchProps {
  open: boolean;
  onClose: () => void;
  neighborhoodName: string;
  onRowClick?: (componentId: string, rowId: string, searchTerm?: string, componentName?: string) => void;
  initialSearchTerm?: string;
}

type ViewMode = 'list' | 'tree';

const GlobalComponentSearch: React.FC<GlobalComponentSearchProps> = ({
  open,
  onClose,
  neighborhoodName,
  onRowClick,
  initialSearchTerm = '',
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<'hierarchy' | 'component' | 'name'>('hierarchy');
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [collapsedTreeNodes, setCollapsedTreeNodes] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);

  // Fetch type-ahead suggestions
  const handleTypeahead = useCallback(
    async (value: string) => {
      if (!value || value.length < 1) {
        setSuggestions([]);
        return;
      }

      setLoadingSuggestions(true);
      try {
        const response = await fetch(
          `/api/custom-factories/search/typeahead?neighborhoodName=${encodeURIComponent(
            neighborhoodName
          )}&prefix=${encodeURIComponent(value)}&limit=10`
        );

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const data = await response.json();
        setSuggestions(
          data.suggestions?.map((s: any) => ({
            label: `${s.value} (${s.frequency} occurrences${s.componentNames?.length > 1 ? `, ${s.componentNames.length} components` : ''})`,
            value: s.value,
          })) || []
        );
      } catch (err) {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [neighborhoodName]
  );

  // Debounce typeahead
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        handleTypeahead(searchTerm);
      } else {
        // Clear results if search is cleared
        setResults([]);
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, handleTypeahead]);

  // Auto-execute search if initialSearchTerm is provided
  useEffect(() => {
    if (initialSearchTerm && initialSearchTerm.length >= 2) {
      setSearchTerm(initialSearchTerm);
      // Schedule search execution after a short delay to ensure state is updated
      const timer = setTimeout(() => {
        (async () => {
          setLoading(true);
          setResults([]);
          try {
            const response = await fetch(
              `/api/custom-factories/search/indexed?neighborhoodName=${encodeURIComponent(
                neighborhoodName
              )}&term=${encodeURIComponent(initialSearchTerm)}`
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Search failed');
            }

            const data = await response.json();
            setResults(data.results || []);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Search failed';
            console.error(`Search error: ${errorMsg}`);
            setResults([]);
          } finally {
            setLoading(false);
          }
        })();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialSearchTerm, neighborhoodName]);

  const handleSearch = useCallback(async (overrideTerm?: string) => {
    const effectiveTerm = (typeof overrideTerm === 'string' ? overrideTerm : searchTerm) || '';
    console.log('%c[SEARCH TRACE] handleSearch invoked', 'color:#0a0;font-weight:bold', {
      overrideTerm,
      searchTerm,
      effectiveTerm,
      neighborhoodName,
    });
    if (!effectiveTerm || effectiveTerm.length < 2) {
      console.warn('[SEARCH TRACE] aborting: term too short', effectiveTerm);
      message.warning('Search term must be at least 2 characters');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setResults([]); // Clear previous results
    try {
      const url = `/api/custom-factories/search/indexed?neighborhoodName=${encodeURIComponent(
        neighborhoodName
      )}&term=${encodeURIComponent(effectiveTerm)}`;
      console.log('[SEARCH TRACE] fetching', url);
      // Use indexed search endpoint for fast results
      const response = await fetch(url);

      console.log('[SEARCH TRACE] response status', response.status);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Search failed');
      }

      const data = await response.json();
      console.log('[SEARCH TRACE] results count', (data.results || []).length, data);
      setResults(data.results || []);

      if (data.results?.length === 0) {
        message.info('No components found matching your search');
      }
    } catch (err) {
      console.error('[SEARCH TRACE] fetch error', err);
      const errorMsg = err instanceof Error ? err.message : 'Search failed';
      message.error(`Search error: ${errorMsg}`);
      setResults([]);
    } finally {
      setLoading(false);
      setCurrentPage(1); // Reset pagination on new search
    }
  }, [searchTerm, neighborhoodName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        console.log('[SEARCH TRACE] Enter key pressed');
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

  // Calculate paginated data
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedResults.slice(startIndex, endIndex);
  }, [sortedResults, currentPage, pageSize]);

  // Find max hierarchy depth
  const maxHierarchyDepth = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.max(...results.map(r => r.hierarchy.length));
  }, [results]);

  // Extract component names for each level to use as column headers
  const levelComponentNames = useMemo(() => {
    const names = new Map<number, string>();
    if (results.length > 0) {
      results.forEach(result => {
        result.hierarchy.forEach(node => {
          if (!names.has(node.level)) {
            names.set(node.level, node.componentName);
          }
        });
      });
    }
    return names;
  }, [results]);

  // Build dynamic hierarchy columns
  const hierarchyColumns = useMemo(() => {
    const cols = [];
    for (let level = 0; level < maxHierarchyDepth; level++) {
      cols.push({
        title: levelComponentNames.get(level) || `Level ${level}`,
        key: `hierarchy_${level}`,
        width: `${Math.max(120, Math.floor(80 / maxHierarchyDepth))}px`,
        render: (_: any, record: SearchResult) => {
          const node = record.hierarchy[level];
          if (!node) return '-';
          return (
            <Button
              type="link"
              size="small"
              onClick={() => {
                if (onRowClick) {
                  onRowClick(node.componentId, node.rowId, node.rowName, node.componentName);
                }
                onClose();
              }}
              title={node.rowName}
              style={{ padding: '4px 0', height: 'auto', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {node.rowName}
            </Button>
          );
        },
      });
    }
    return cols;
  }, [maxHierarchyDepth, levelComponentNames, onClose]);

  const columns = [
    ...hierarchyColumns,
    {
      title: 'Component',
      dataIndex: 'searchMatchComponentName',
      key: 'component',
      width: '12%',
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: 'State',
      dataIndex: 'state',
      key: 'state',
      width: '8%',
      render: (state: string) => {
        const color = state === 'published' ? 'green' : state === 'invalid' ? 'red' : 'orange';
        return <Tag color={color}>{state}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '10%',
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

  const mergedTree = useMemo(() => buildMergedHierarchyTree(sortedResults), [sortedResults]);

  useEffect(() => {
    setCollapsedTreeNodes(new Set());
  }, [paginatedResults]);

  const renderTreeNodes = useCallback(
    (nodes: MergedHierarchyTreeNode<SearchResult>[]) =>
      nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const matchCount = node.results.length;
        const isCollapsed = collapsedTreeNodes.has(node.key);

        return (
          <div
            key={node.key}
            style={{
              marginBottom: '10px',
              paddingLeft: '12px',
              borderLeft: hasChildren ? '1px solid #e5e7eb' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {hasChildren ? (
                <Button
                  type="text"
                  size="small"
                  icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
                  onClick={() => {
                    setCollapsedTreeNodes((current) => {
                      const next = new Set(current);
                      if (next.has(node.key)) {
                        next.delete(node.key);
                      } else {
                        next.add(node.key);
                      }
                      return next;
                    });
                  }}
                  style={{ padding: 0, width: 20, height: 20, color: '#999' }}
                />
              ) : (
                <span style={{ width: 20 }} />
              )}
              <Tag color={hasChildren ? 'default' : 'blue'}>{node.componentName}</Tag>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  if (onRowClick) {
                    onRowClick(node.componentId, node.rowId, node.rowName, node.componentName);
                  }
                  onClose();
                }}
                title={node.rowName}
                style={{ padding: '0 4px', height: 'auto', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {node.rowName}
              </Button>
              {matchCount > 0 && <Tag color="geekblue">{matchCount} match{matchCount === 1 ? '' : 'es'}</Tag>}
              <Tooltip title="Copy hierarchy path">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(node.path);
                    message.success('Copied to clipboard');
                  }}
                />
              </Tooltip>
            </div>

            {node.results.length > 0 && node.results[0] && (
              <div style={{ marginTop: '4px', marginLeft: '20px', fontSize: '12px', color: '#999' }}>
                <Tag color={node.results[0].state === 'published' ? 'green' : node.results[0].state === 'invalid' ? 'red' : 'orange'}>
                  {node.results[0].state}
                </Tag>
                {node.results[0].createdBy && <span style={{ marginLeft: '8px' }}>Created by: {node.results[0].createdBy}</span>}
                {node.results[0].updatedBy && <span style={{ marginLeft: '8px' }}>Updated by: {node.results[0].updatedBy}</span>}
              </div>
            )}

            {hasChildren && !isCollapsed && (
              <div style={{ marginLeft: '18px', marginTop: '8px' }}>{renderTreeNodes(node.children)}</div>
            )}
          </div>
        );
      }),
    [collapsedTreeNodes, onClose, onRowClick]
  );

  const treeView = useMemo(() => {
    if (mergedTree.length === 0) {
      return null;
    }

    return (
      <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #f0f0f0', borderRadius: '4px', backgroundColor: '#fafafa' }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Merged hierarchy tree</div>
        <div
          style={{
            maxHeight: '50vh',
            overflowY: 'auto',
            paddingRight: '8px',
            paddingBottom: '180px',
            scrollPaddingBottom: '180px',
          }}
        >
          {renderTreeNodes(mergedTree)}
        </div>
      </div>
    );
  }, [mergedTree, renderTreeNodes]);

  return (
    <Modal
      title="Global Component Search"
      open={open}
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
          <Space style={{ width: '100%', display: 'flex' }}>
            <AutoComplete
              placeholder="Search component values (min 2 characters)..."
              value={searchTerm}
              onSearch={(value) => setSearchTerm(value)}
              onSelect={(value) => {
                const selected = String(value);
                console.log('[SEARCH TRACE] onSelect', selected);
                setSearchTerm(selected);
                // Selecting a suggestion should immediately run the search
                handleSearch(selected);
              }}
              onChange={(value) => setSearchTerm(value)}
              options={suggestions}
              {...({ loading: loadingSuggestions } as any)}
              onKeyDown={handleKeyDown}
              style={{ flex: 1, minWidth: '300px' }}
              popupMatchSelectWidth={false}
              notFoundContent={
                loadingSuggestions ? (
                  <div style={{ padding: '8px 12px' }}><Spin size="small" /></div>
                ) : searchTerm.length > 0 ? (
                  <div style={{ padding: '8px 12px', color: '#999' }}>No suggestions found</div>
                ) : null
              }
              prefix={<SearchOutlined />}
              allowClear
            />
            <Button
              type="primary"
              onClick={() => {
                console.log('[SEARCH TRACE] Search button clicked');
                handleSearch();
              }}
              loading={loading}
              icon={<SearchOutlined />}
            >
              Search
            </Button>
          </Space>

          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
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
              <span style={{ fontSize: '12px', color: '#666' }}>
                {paginatedResults.length === 0 && currentPage > 1
                  ? '0'
                  : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sortedResults.length)}`} of {sortedResults.length} results
              </span>
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
            dataSource={paginatedResults}
            rowKey={(record) => `${record.searchMatchRowId}::${record.hierarchyPath}`}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: sortedResults.length,
              onChange: (page) => setCurrentPage(page),
              onShowSizeChange: (_, size) => {
                setPageSize(size);
                setCurrentPage(1);
              },
              pageSizeOptions: ['25', '50', '100', '200'],
              showSizeChanger: true,
              showTotal: (total) => `${total} results`,
              position: ['topRight'],
            }}
            size="small"
            scroll={{ x: 1200, y: 600 }}
          />
        ) : (
          <div>
              <div style={{ padding: '16px', maxHeight: '600px', overflowY: 'auto' }}>{treeView}</div>
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default memo(GlobalComponentSearch);
