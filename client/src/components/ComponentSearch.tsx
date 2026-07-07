import { useState, useCallback, useMemo, useEffect } from 'react';
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
  Pagination,
  AutoComplete,
} from 'antd';
import {
  SearchOutlined,
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
  onRowClick?: (componentId: string, rowId: string, searchTerm?: string, componentName?: string) => void;
  initialSearchTerm?: string;
}

type ViewMode = 'list' | 'tree';

const ComponentSearch: React.FC<ComponentSearchProps> = ({
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
  const [collapsedTreeNodes, setCollapsedTreeNodes] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch type-ahead suggestions
  // Perform indexed search for a given term or componentName
  const performIndexedSearch = useCallback(async (term: string, componentName?: string) => {
    const t = String(term || '').trim();
    if (!t && !componentName) {
      message.warning('Search term must be at least 2 characters');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setResults([]);
    try {
      const params = new URLSearchParams();
      if (t) params.set('term', t);
      if (componentName) params.set('componentName', componentName);
      params.set('neighborhoodName', neighborhoodName);

      const url = `/api/custom-factories/search/indexed?${params.toString()}`;
      console.log('[SEARCH TRACE] performIndexedSearch request', { url, term: t, componentName, neighborhoodName });

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Search failed');
      }

      const data = await response.json();
      console.log('[SEARCH TRACE] performIndexedSearch response', { resultsCount: (data.results || []).length, dataSummary: data.results?.slice(0,5) });
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
  }, [neighborhoodName]);


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
        const rowSug = (data.suggestions || []).map((s: any) => ({
          label: (
            <div onDoubleClick={() => { console.log('[SEARCH TRACE] suggestion dblclick', s.value); performIndexedSearch(s.value); }}>
              {`${s.value} (${s.frequency} occurrences${s.componentNames?.length > 1 ? `, ${s.componentNames.length} components` : ''})`}
            </div>
          ),
          value: s.value,
        }));

        const typeSug = (data.componentTypes || []).map((t: any) => ({
          label: (
            <div onDoubleClick={() => { console.log('[SEARCH TRACE] type suggestion dblclick', t.componentName); performIndexedSearch('', t.componentName); }}>
              {`${t.componentName} (type)`}
            </div>
          ),
          value: `__type__:${t.componentName}`,
        }));

        // Merge types first then row suggestions, de-dupe by value
        const merged = [...typeSug, ...rowSug];
        const seen = new Set<string>();
        const deduped = merged.filter((x) => {
          if (seen.has(x.value)) return false;
          seen.add(x.value);
          return true;
        });
        setSuggestions(deduped);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [neighborhoodName, performIndexedSearch]
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
          setHasSearched(true);
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

  const handleSearch = useCallback(async () => {
    console.debug('[SEARCH TRACE] handleSearch invoked', { searchTerm, neighborhoodName, time: new Date().toISOString() });
    if (!searchTerm || searchTerm.length < 2) {
      message.warning('Search term must be at least 2 characters');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setResults([]); // Clear previous results
    try {
      // Use indexed search endpoint for fast results
      const response = await fetch(
        `/api/custom-factories/search/indexed?neighborhoodName=${encodeURIComponent(
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, viewMode]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedResults.slice(startIndex, startIndex + pageSize);
  }, [sortedResults, currentPage, pageSize]);

  // Group results by component
  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    paginatedResults.forEach(result => {
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
  }, [paginatedResults]);

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
        width: `${Math.max(150, Math.floor(100 / maxHierarchyDepth))}px`,
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
              }}
              style={{ padding: '4px 0', height: 'auto' }}
            >
              {node.rowName}
            </Button>
          );
        },
      });
    }
    return cols;
  }, [maxHierarchyDepth, levelComponentNames, onRowClick]);

  const columns = [
    ...hierarchyColumns,
    {
      title: 'Lineage Path',
      dataIndex: 'hierarchyPath',
      key: 'lineagePath',
      width: '30%',
      render: (path: string) => (
        <Tooltip title={path}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: 420 }}>{path}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Matched Field',
      dataIndex: 'searchMatchFieldName',
      key: 'matchedField',
      width: '12%',
      render: (fieldName: string, record: SearchResult) => (
        <Tooltip title={`${fieldName}: ${record.searchMatchFieldValue}`}>
          <span>{fieldName}</span>
        </Tooltip>
      ),
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
      width: '10%',
      render: (_: any, record: SearchResult) => (
        <Space size="small">
          {onRowClick && (
            <Button
              type="primary"
              size="small"
              onClick={() => onRowClick(record.searchMatchComponentId, record.searchMatchRowId, record.searchMatchRowName)}
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

  // Clone columns with the Lineage Path included (used for tables)
  const columnsWithPath = columns;

  const mergedTree = useMemo(() => buildMergedHierarchyTree(sortedResults), [sortedResults]);

  useEffect(() => {
    setCollapsedTreeNodes(new Set());
  }, [sortedResults]);

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
              {onRowClick ? (
                <Button
                  type="link"
                  size="small"
                  onClick={() => onRowClick(node.componentId, node.rowId, node.rowName, node.componentName)}
                  style={{ padding: '0 4px', height: 'auto' }}
                >
                  {node.rowName}
                </Button>
              ) : (
                <span>{node.rowName}</span>
              )}
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
    [collapsedTreeNodes, onRowClick]
  );

  const treeView = useMemo(() => {
    if (mergedTree.length === 0) {
      return null;
    }

    return (
      <Card size="small">
        <div
          style={{
            maxHeight: 'calc(var(--app-h) - 380px)',
            overflowY: 'auto',
            paddingRight: '8px',
            paddingBottom: '180px',
            scrollPaddingBottom: '180px',
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Merged hierarchy tree</div>
            {renderTreeNodes(mergedTree)}
          </Space>
        </div>
      </Card>
    );
  }, [mergedTree, renderTreeNodes]);

  const paginationBar = sortedResults.length > 0 ? (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={sortedResults.length}
        showSizeChanger
        pageSizeOptions={['10', '25', '50', '100']}
        onChange={(page, size) => {
          setCurrentPage(page);
          if (size && size !== pageSize) {
            setPageSize(size);
          }
        }}
        onShowSizeChange={(_, size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
      />
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space style={{ width: '100%', display: 'flex' }}>
              <AutoComplete
              placeholder="Search component values (min 2 characters)..."
              value={searchTerm}
              onSearch={(value) => { console.log('[SEARCH TRACE] onSearch', value); setSearchTerm(value); }}
              onSelect={(value) => {
                console.log('[SEARCH TRACE] onSelect', value, new Date().toISOString());
                // If a type was selected, set the componentName filter and set searchTerm empty
                if (typeof value === 'string' && value.startsWith('__type__:')) {
                  const type = value.split('__type__:')[1];
                  setSearchTerm('');
                  // Trigger a search scoped to this component type
                  console.log('[SEARCH TRACE] performIndexedSearch invoked for component type', type, new Date().toISOString());
                  performIndexedSearch('', type);
                  return;
                }
                const s = value as string;
                console.log('[SEARCH TRACE] onSelect setting searchTerm', s, new Date().toISOString());
                setSearchTerm(s);
                // Immediately perform the indexed search for the selected suggestion
                console.log('[SEARCH TRACE] performIndexedSearch invoked for term', s, new Date().toISOString());
                performIndexedSearch(s);
              }}
              onChange={(value) => { console.log('[SEARCH TRACE] onChange', value, new Date().toISOString()); setSearchTerm(value); }}
              options={suggestions}
              {...({ loading: loadingSuggestions } as any)}
              onKeyDown={handleKeyDown}
              onFocus={() => console.log('[SEARCH TRACE] onFocus', new Date().toISOString())}
              onBlur={() => console.log('[SEARCH TRACE] onBlur', new Date().toISOString())}
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
            <Button type="primary" onClick={handleSearch} loading={loading} icon={<SearchOutlined />}>
              Search
            </Button>
            <Button
              style={{ marginLeft: 8 }}
              onClick={() => {
                console.log('[SEARCH TRACE] Go button clicked', { searchTerm, neighborhoodName, time: new Date().toISOString() });
                handleSearch();
              }}
              disabled={loading}
              size="middle"
            >
              Go
            </Button>
          </Space>

          <Space wrap>
            <span style={{ color: '#666', fontSize: '12px' }}>View:</span>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[{ label: 'List', value: 'list' }, { label: 'Tree', value: 'tree' }]}
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
              Found {sortedResults.length} matching component{sortedResults.length !== 1 ? 's' : ''}
            </Typography.Text>
          )}
        </Space>
      </Card>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '8px' }}>
        <Spin spinning={loading}>
          {!hasSearched ? (
            <Empty description="Enter a search term above" style={{ marginTop: '40px' }} />
          ) : sortedResults.length === 0 ? (
            <Empty description="No results found" style={{ marginTop: '40px' }} />
          ) : viewMode === 'list' ? (
            <>
              {paginationBar}
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
                        columns={columnsWithPath}
                        dataSource={group.results}
                        rowKey={(record) => record.hierarchyPath}
                        pagination={false}
                        size="small"
                      />
                    ),
                  }))}
                />
              ) : (
                <Table
                  columns={columnsWithPath}
                  dataSource={paginatedResults}
                  rowKey={(record) => record.hierarchyPath}
                  pagination={{
                    current: currentPage,
                    pageSize,
                    total: sortedResults.length,
                    position: ['topRight'],
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '25', '50', '100'],
                    onChange: (page, size) => {
                      setCurrentPage(page);
                      if (size && size !== pageSize) {
                        setPageSize(size);
                      }
                    },
                    onShowSizeChange: (_, size) => {
                      setPageSize(size);
                      setCurrentPage(1);
                    },
                  }}
                  size="small"
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
