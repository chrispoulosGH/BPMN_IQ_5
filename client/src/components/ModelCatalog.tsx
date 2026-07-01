import { useEffect, useMemo, useState, useRef } from 'react';
import { App as AntApp, Card, Input, Select, Space, Spin, Switch, Table, Tree, Button, Segmented, Checkbox, Popover } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { SearchOutlined, FolderOutlined, TableOutlined, BarsOutlined, UnorderedListOutlined } from '@ant-design/icons';

import { getModelCatalog, type ModelCatalogRow } from '../api';
import { enhanceColumnsWithSortAndFilters } from '../utils/tableEnhancer';

interface ModelCatalogProps {
  modelName: string;
  requestedSearch?: {
    text: string;
    column?: string;
    exact?: boolean;
    trigger: number;
  } | null;
}

export default function ModelCatalog({ modelName, requestedSearch = null }: ModelCatalogProps) {
  const { message } = AntApp.useApp();
  const ALL_COLUMNS_OPTION = '__all__';
  const SEARCH_SETTINGS_STORAGE_PREFIX = 'modelCatalogSearch:';
  const [catalog, setCatalog] = useState<{ columns: string[]; rows: ModelCatalogRow[]; rowCount: number; sourceFileName?: string; pagination?: { currentPage: number; limit: number; totalPages: number; hasMore: boolean } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchColumn, setSearchColumn] = useState<string>(ALL_COLUMNS_OPTION);
  const [searchText, setSearchText] = useState('');
  const [exactSearch, setExactSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'tree-vertical' | 'tree-horizontal'>('table');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [selectedNodeKey, setSelectedNodeKey] = useState<React.Key | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const horizontalTreeContainerRef = useRef<HTMLDivElement>(null);
  const horizontalTreeNodeRefMap = useRef<Map<React.Key, HTMLButtonElement>>(new Map());
  const builtTreeDataRef = useRef<DataNode[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setLoading(true);
      try {
        const nextCatalog = await getModelCatalog(modelName, tablePage, 50);
        console.log('[API_RESPONSE] Full catalog columns from API:', nextCatalog.columns);
        console.log('[API_RESPONSE] Total columns count:', nextCatalog.columns?.length);
        if (nextCatalog.columns && Array.isArray(nextCatalog.columns)) {
          console.log('[API_RESPONSE] Column list with details:', nextCatalog.columns.map((col: string, idx: number) => ({
            index: idx,
            name: col,
            length: col.length,
            startsWithFK: col.toLowerCase().startsWith('fk_')
          })));
        }
        if (!cancelled) {
          setCatalog(nextCatalog);
          // Auto-include FK columns and component columns in visible columns
          if (nextCatalog.columns && Array.isArray(nextCatalog.columns)) {
            const autoVisible = new Set<string>();
            nextCatalog.columns.forEach((col: string) => {
              const colLower = col.toLowerCase();
              if (colLower.startsWith('fk_') || colLower.endsWith('component')) {
                autoVisible.add(col);
              }
            });
            if (autoVisible.size > 0) {
              setVisibleColumns(prev => new Set([...prev, ...autoVisible]));
            }
          }
        }
      } catch (error: any) {
        if (!cancelled) {
          setCatalog(null);
          message.error(error.response?.data?.error || error.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCatalog();
    return () => { cancelled = true; };
  }, [message, modelName, tablePage]);

  useEffect(() => {
    const storageKey = `${SEARCH_SETTINGS_STORAGE_PREFIX}${modelName}`;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        setSearchColumn(ALL_COLUMNS_OPTION);
        setSearchText('');
        setExactSearch(false);
        return;
      }
      const parsed = JSON.parse(raw) as { searchColumn?: string; searchText?: string; exactSearch?: boolean };
      setSearchColumn(parsed.searchColumn || ALL_COLUMNS_OPTION);
      setSearchText(String(parsed.searchText || ''));
      setExactSearch(Boolean(parsed.exactSearch));
    } catch {
      setSearchColumn(ALL_COLUMNS_OPTION);
      setSearchText('');
      setExactSearch(false);
    }
  }, [ALL_COLUMNS_OPTION, SEARCH_SETTINGS_STORAGE_PREFIX, modelName]);

  useEffect(() => {
    const storageKey = `${SEARCH_SETTINGS_STORAGE_PREFIX}${modelName}`;
    const payload = JSON.stringify({ searchColumn, searchText, exactSearch });
    window.sessionStorage.setItem(storageKey, payload);
  }, [SEARCH_SETTINGS_STORAGE_PREFIX, exactSearch, modelName, searchColumn, searchText]);

  useEffect(() => {
    if (!requestedSearch) return;
    setSearchColumn(requestedSearch.column || ALL_COLUMNS_OPTION);
    setSearchText(requestedSearch.text || '');
    setExactSearch(Boolean(requestedSearch.exact));
  }, [ALL_COLUMNS_OPTION, requestedSearch]);

  const columns = useMemo<ColumnsType<ModelCatalogRow>>(() => {
    console.log(`[FK_COLUMN_INIT] Processing catalog:`, {
      name: catalog?.name,
      totalColumns: catalog?.columns?.length,
      columns: catalog?.columns
    });

    // Log ALL columns to see what's actually in the catalog
    console.log(`[FK_COLUMN_INIT_ALL_COLUMNS]`, catalog?.columns?.map((col: string) => ({
      name: col,
      length: col.length,
      startsWith_FK: col.toLowerCase().startsWith('fk_'),
      inVisibleColumns: visibleColumns.has(col),
      charCodes: col.split('').map((c: string) => `${c}(${c.charCodeAt(0)})`)
    })));

    const cols = (catalog?.columns || [])
      .filter(column => visibleColumns.has(column))
      .map((column) => {
        console.log(`[FK_COLUMN_PROCESS] Checking column: "${column}"`);
        
        // ONLY detect foreign key columns with FK_ prefix pattern: FK_Data[Applications].Correlation_ID
        const columnLower = column.toLowerCase();
        const isForeignKeyColumn = columnLower.startsWith('fk_');
        
        console.log(`[FK_COLUMN_PROCESS] "${column}" - starts with FK_? ${isForeignKeyColumn}`);
        
        // Parse FK column to extract:
        // - Target tab from prefix: FK_Data → "Data" tab
        // - Target subtab from brackets: [Applications] → "Applications" subtab  
        // - Search field from suffix: Correlation_ID → searchField
        let targetTab: string | null = null;
        let targetSubtab: string | null = null;
        let searchField: string | null = null;
        
        if (isForeignKeyColumn) {
          // Pattern: FK_Data[Applications].Correlation_ID
          const regexPattern = /FK_([^\[]+)\[([^\]]+)\]\.(.+)$/;
          console.log(`[FK_COLUMN_PARSE] Attempting to parse FK column: "${column}" with pattern: ${regexPattern}`);
          
          const match = column.match(regexPattern);
          console.log(`[FK_COLUMN_PARSE] Regex match result:`, match);
          
          if (match) {
            targetTab = match[1];      // "Data"
            targetSubtab = match[2];   // "Applications"
            searchField = match[3];    // "Correlation_ID"
            console.log(`[FK_COLUMN_SUCCESS] Column "${column}" parsed successfully:`, {
              targetTab,
              targetSubtab,
              searchField
            });
          } else {
            console.warn(`[FK_COLUMN_PARSE_FAIL] Column "${column}" starts with FK_ but regex didn't match. Expected pattern: FK_TabName[SubtabName].FieldName`);
          }
        }

        return {
          title: column,
          key: column,
          dataIndex: ['values', column],
          ellipsis: true,
          render: (value: unknown) => {
            if (value === null || value === undefined || value === '') return '—';
            const valueStr = String(value);
            
            // Render FK columns as links
            if (isForeignKeyColumn && searchField && targetTab && targetSubtab) {
              console.log(`[FK_LINK_RENDER] Rendering "${column}" value "${valueStr}" as link`);
              return (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    console.log(`[FK_LINK_CLICK]`, {
                      column,
                      targetTab,
                      targetSubtab,
                      searchField,
                      valueStr,
                      timestamp: new Date().toISOString()
                    });
                    console.log(`[FK_LINK_CLICK] User clicked: navigating to ${targetTab} > ${targetSubtab} tab, searching by ${searchField}="${valueStr}"`);
                    window.dispatchEvent(new CustomEvent('navigateToApplication', { 
                      detail: { 
                        searchValue: valueStr,
                        searchField: searchField,
                        sourceColumn: column,
                        targetTab,
                        targetSubtab
                      } 
                    }));
                  }}
                  style={{ 
                    color: '#0284c7', 
                    textDecoration: 'underline', 
                    fontWeight: 500, 
                    cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#0369a1')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#0284c7')}
                  title={`Navigate to ${targetTab} > ${targetSubtab}, search by ${searchField}: ${valueStr}`}
                >
                  {valueStr}
                </a>
              );
            } else {
              if (isForeignKeyColumn) {
                console.log(`[FK_LINK_SKIP] Column "${column}" is FK but missing required fields:`, {
                  hasTabs: !!targetTab,
                  hasSubtab: !!targetSubtab,
                  hasSearchField: !!searchField
                });
              }
            }
            
            return valueStr;
          },
        };
      });
    
    const fkColumnCount = cols.filter((c: any) => {
      const colName = c.dataIndex?.[1]?.toLowerCase?.();
      return colName?.startsWith('fk_');
    }).length;
    console.log(`[FK_COLUMN_SUMMARY] Catalog: ${catalog?.name}`, {
      totalColumns: catalog?.columns?.length,
      fkColumnsDetected: fkColumnCount,
      visibleColumns: visibleColumns.size,
      allVisibleColumnNames: Array.from(visibleColumns)
    });
    console.log(`[FK_COLUMN_DEBUG] Checking if FK column exists:`, {
      catalogHasColumns: !!catalog?.columns,
      catalogColumnsCount: catalog?.columns?.length,
      visibleColumnsIncludeFK: Array.from(visibleColumns).filter((col: string) => col.toLowerCase().startsWith('fk_')).length
    });
    return cols;
  }, [catalog, visibleColumns]);

  const filteredRows = useMemo(() => {
    if (!catalog) return [];
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!normalizedSearch) return catalog.rows;

    const columnsToSearch = searchColumn === ALL_COLUMNS_OPTION
      ? catalog.columns
      : [searchColumn];

    return catalog.rows.filter((row) => columnsToSearch.some((column) => {
      const value = row?.values?.[column];
      const normalizedValue = String(value ?? '').toLowerCase().trim();
      return exactSearch ? normalizedValue === normalizedSearch : normalizedValue.includes(normalizedSearch);
    }));
  }, [ALL_COLUMNS_OPTION, catalog, exactSearch, searchColumn, searchText]);

  const componentColumns = useMemo(() => {
    if (!catalog) return [];
    return catalog.columns
      .map((col, index) => ({
        fullName: col,
        typeName: col.replace(/\s*component\s*$/i, '').trim(),
        originalIndex: index,
      }))
      .filter((col) => col.fullName.toLowerCase().endsWith('component'))
      .sort((a, b) => a.originalIndex - b.originalIndex);
  }, [catalog]);

  // Lazy tree building - only build when in tree view mode
  const treeData = useMemo<DataNode[]>(() => {
    // Skip tree building for table view - significant performance improvement
    if (viewMode === 'table') return [];
    if (!catalog || componentColumns.length === 0) return [];

    // Use all rows for tree (not filtered by search) - user can search within tree
    const rowsForTree = catalog.rows;

    const pathToNode = new Map<string, DataNode>();
    const rootNodes: DataNode[] = [];

    rowsForTree.forEach((row) => {
      let currentPath: string[] = [];

      for (let depth = 0; depth < componentColumns.length; depth++) {
        const col = componentColumns[depth];
        const value = row?.values?.[col.fullName];
        if (!value) break;

        const valueStr = String(value).trim();
        currentPath.push(valueStr);
        const pathKey = currentPath.join('|');

        if (!pathToNode.has(pathKey)) {
          const colors = ['#EFF6FF', '#F0FDF4', '#FEF3C7', '#FCE7F3', '#F3E8FF', '#ECFDF5'];
          const bgColor = colors[depth % colors.length];
          const typeColor = ['#0C63E4', '#15803D', '#B45309', '#BE185D', '#6D28D9', '#0891B2'];
          const textColor = typeColor[depth % typeColor.length];

          const node: DataNode & { nodeName?: string } = {
            key: pathKey,
            title: (
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center', width: '100%', padding: '4px 8px' }}>
                <div
                  style={{
                    minWidth: '130px',
                    maxWidth: '130px',
                    textAlign: 'left',
                    color: textColor,
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '4px 8px',
                    backgroundColor: bgColor,
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}
                >
                  {col.typeName}
                </div>
                <div style={{ fontSize: '13px', color: '#1E293B', fontWeight: 500 }}>{valueStr}</div>
              </div>
            ),
            nodeName: valueStr,
            children: [],
            isLeaf: depth === componentColumns.length - 1,
          };

          // Add to parent or to roots
          if (depth === 0) {
            rootNodes.push(node);
          } else {
            const parentPath = currentPath.slice(0, depth).join('|');
            const parentNode = pathToNode.get(parentPath);
            if (parentNode && parentNode.children) {
              parentNode.children.push(node);
            }
          }

          pathToNode.set(pathKey, node);
        }
      }
    });

    return rootNodes.sort((a, b) => {
      const aValue = (a as any).nodeName || '';
      const bValue = (b as any).nodeName || '';
      return String(aValue).localeCompare(String(bValue));
    });
  }, [viewMode, catalog, componentColumns]);

  const handleExpandAll = () => {
    const allKeys: React.Key[] = [];
    const collect = (nodes: DataNode[]) => {
      nodes.forEach((node) => {
        allKeys.push(node.key);
        if (node.children) collect(node.children);
      });
    };
    collect(treeData);
    setExpandedKeys(allKeys);
  };

  const handleCollapseAll = () => {
    setExpandedKeys([]);
  };

  // Horizontal tree view - graph diagram with SVG connectors
  const renderHorizontalTree = () => {
    const NODE_WIDTH = 140;
    const NODE_HEIGHT = 70;
    const COLUMN_GAP = 196;
    const ROW_GAP = 90;
    const PADDING = 40;

    const bgColors = ['#EFF6FF', '#F0FDF4', '#FEF3C7', '#FCE7F3', '#F3E8FF', '#ECFDF5'];
    const textColors = ['#0C63E4', '#15803D', '#B45309', '#BE185D', '#6D28D9', '#0891B2'];

    interface PositionedNode {
      node: DataNode;
      depth: number;
      y: number;
      parentKey: React.Key | null;
    }

    const positioned: PositionedNode[] = [];
    const positionById = new Map<React.Key, { x: number; y: number }>();
    let maxDepth = 0;
    let maxY = 0;

    const traverse = (nodes: DataNode[], depth: number, parentKey: React.Key | null, yOffset: number): number => {
      let currentY = yOffset;
      maxDepth = Math.max(maxDepth, depth);

      for (const node of nodes) {
        positioned.push({ node, depth, y: currentY, parentKey });
        positionById.set(node.key, { x: depth * COLUMN_GAP + PADDING, y: currentY });
        maxY = Math.max(maxY, currentY);

        if (expandedKeys.includes(node.key) && node.children && node.children.length > 0) {
          currentY = traverse(node.children, depth + 1, node.key, currentY);
          currentY += ROW_GAP;
        } else {
          currentY += ROW_GAP;
        }
      }
      return currentY;
    };

    traverse(treeData, 0, null, PADDING);

    const width = (maxDepth + 1) * COLUMN_GAP + PADDING * 2;
    const height = Math.max(600, maxY + PADDING);

    return (
      <div
        ref={horizontalTreeContainerRef}
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          width: '100%',
          height: '100%',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <div style={{ position: 'relative', width, height }}>
          <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
            {positioned
              .filter((p) => p.parentKey !== null)
              .map((p) => {
                const from = positionById.get(p.parentKey!);
                const to = positionById.get(p.node.key);
                if (!from || !to) return null;

                const x1 = from.x + NODE_WIDTH;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_HEIGHT / 2;
                const c1 = x1 + 60;
                const c2 = x2 - 60;
                const path = `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
                
                const lineColor = textColors[p.depth % textColors.length];

                return (
                  <path
                    key={`line-${p.parentKey}-${p.node.key}`}
                    d={path}
                    stroke={lineColor}
                    strokeWidth="2"
                    fill="none"
                    opacity="0.5"
                  />
                );
              })}
          </svg>

          {positioned.map((p) => {
            const pos = positionById.get(p.node.key)!;
            const isSelected = selectedNodeKey === p.node.key;
            const isExpanded = expandedKeys.includes(p.node.key);
            const hasChildren = p.node.children && p.node.children.length > 0;
            
            const bgColor = bgColors[p.depth % bgColors.length];
            const textColor = textColors[p.depth % textColors.length];

            return (
              <button
                key={p.node.key}
                ref={(el) => {
                  if (el) {
                    horizontalTreeNodeRefMap.current.set(p.node.key, el);
                    // Store position as data attributes for easier access
                    (el as any)._posX = pos.x;
                    (el as any)._posY = pos.y;
                  } else {
                    horizontalTreeNodeRefMap.current.delete(p.node.key);
                  }
                }}
                type="button"
                onClick={() => {
                  setSelectedNodeKey(p.node.key);
                }}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  minWidth: NODE_WIDTH,
                  minHeight: NODE_HEIGHT,
                  borderRadius: 8,
                  border: isSelected ? '2px solid #0284c7' : `2px solid ${textColor}`,
                  background: isSelected ? '#ecf0f5' : bgColor,
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gridTemplateRows: 'auto 1fr',
                  gap: 4,
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                  alignItems: 'start',
                  whiteSpace: 'normal',
                }}
              >
                <div style={{ gridColumn: '1 / 2', gridRow: '1 / 3', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px', gap: '3px' }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: textColor,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      textAlign: 'center',
                      lineHeight: '1.1',
                      wordBreak: 'break-word',
                    }}
                  >
                    {componentColumns[p.depth]?.typeName || ''}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: textColor,
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      textAlign: 'center',
                      lineHeight: '1.3',
                      width: '100%',
                    }}
                  >
                    {(p.node as any).nodeName || ''}
                  </div>
                </div>
                {hasChildren && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedKeys(prev =>
                        prev.includes(p.node.key)
                          ? prev.filter(k => k !== p.node.key)
                          : [...prev, p.node.key]
                      );
                    }}
                    style={{
                      gridColumn: '2 / 3',
                      gridRow: '1 / 2',
                      color: textColor,
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: '2px 2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      userSelect: 'none',
                    }}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Auto-scroll horizontal tree to keep selected node centered
  useEffect(() => {
    if (viewMode !== 'tree-horizontal') return;

    const timer = setTimeout(() => {
      const buttonToCenter = selectedNodeKey ? horizontalTreeNodeRefMap.current.get(selectedNodeKey) : null;
      if (buttonToCenter && horizontalTreeContainerRef.current) {
        const container = horizontalTreeContainerRef.current;
        const posX = (buttonToCenter as any)._posX;
        const posY = (buttonToCenter as any)._posY;

        if (typeof posX === 'number' && typeof posY === 'number') {
          const NODE_WIDTH = 140;
          const NODE_HEIGHT = 70;
          
          // Calculate scroll to center the node
          const scrollLeft = posX - (container.clientWidth / 2) + (NODE_WIDTH / 2);
          const scrollTop = posY - (container.clientHeight / 2) + (NODE_HEIGHT / 2);

          container.scrollTo({
            left: Math.max(0, scrollLeft),
            top: Math.max(0, scrollTop),
            behavior: 'smooth',
          });
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedNodeKey, viewMode, expandedKeys]);

  useEffect(() => {
    const typeKeys = treeData.map((node) => node.key);
    setExpandedKeys(typeKeys);
  }, [treeData]);

  useEffect(() => {
    if (!catalog) return;
    const storageKey = `modelCatalogVisibleColumns:${modelName}`;
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        setVisibleColumns(new Set(JSON.parse(stored)));
      } catch {
        setVisibleColumns(new Set(catalog.columns));
      }
    } else {
      setVisibleColumns(new Set(catalog.columns));
    }
  }, [catalog, modelName]);

  useEffect(() => {
    if (!catalog) return;
    const storageKey = `modelCatalogVisibleColumns:${modelName}`;
    window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns, catalog, modelName]);

  return (
    <Card
      title="Model Catalog"
      size="small"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      extra={catalog ? <span style={{ color: '#64748b', fontSize: 12 }}>{catalog.rowCount} rows · {catalog.sourceFileName || 'No source file'}</span> : null}
    >
      {loading ? <Spin /> : null}
      {!loading && !catalog ? <div style={{ color: '#64748b' }}>No model catalog data available.</div> : null}
      {!loading && catalog ? (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as 'table' | 'tree-vertical' | 'tree-horizontal')}
              options={[
                { label: <><TableOutlined /> Table</>, value: 'table' },
                { label: <><UnorderedListOutlined /> Tree</>, value: 'tree-vertical', disabled: componentColumns.length === 0 },
                { label: <><BarsOutlined /> Tree (Horizontal)</>, value: 'tree-horizontal', disabled: componentColumns.length === 0 },
              ]}
            />
            {viewMode === 'table' && catalog ? (
              <Popover
                title="Select Columns"
                content={
                  <div style={{ maxWidth: 300 }}>
                    {catalog.columns.map((col) => (
                      <div key={col} style={{ marginBottom: 8 }}>
                        <Checkbox
                          checked={visibleColumns.has(col)}
                          onChange={(e) => {
                            const newVisible = new Set(visibleColumns);
                            if (e.target.checked) {
                              newVisible.add(col);
                            } else {
                              newVisible.delete(col);
                            }
                            setVisibleColumns(newVisible);
                          }}
                        >
                          {col}
                        </Checkbox>
                      </div>
                    ))}
                  </div>
                }
                trigger="click"
              >
                <Button size="small">Column Picker</Button>
              </Popover>
            ) : null}
            {(viewMode === 'tree-vertical' || viewMode === 'tree-horizontal') && componentColumns.length > 0 ? (
              <>
                <Button size="small" onClick={handleExpandAll}>Expand All</Button>
                <Button size="small" onClick={handleCollapseAll}>Collapse All</Button>
              </>
            ) : null}
          </Space>

          {viewMode === 'table' ? (
            <>
              <Space wrap style={{ marginBottom: 12 }}>
                <Select
                  value={searchColumn}
                  style={{ width: 220 }}
                  onChange={setSearchColumn}
                  options={[
                    { label: 'All columns', value: ALL_COLUMNS_OPTION },
                    ...catalog.columns.map((column) => ({ label: column, value: column })),
                  ]}
                />
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="Search model catalog"
                  style={{ width: 300 }}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                <Space size={6}>
                  <Switch size="small" checked={exactSearch} onChange={setExactSearch} />
                  <span style={{ color: '#64748b', fontSize: 12 }}>Exact</span>
                </Space>
                <span style={{ color: '#64748b', fontSize: 12 }}>
                  Showing {catalog.rows.length} of {catalog.rowCount} rows {catalog.pagination ? `(page ${catalog.pagination.currentPage} of ${catalog.pagination.totalPages})` : ''}
                </span>
              </Space>

              <Table
                rowKey={(_row, index) => `${modelName}-${index}`}
                dataSource={filteredRows}
                columns={enhanceColumnsWithSortAndFilters(columns as any, filteredRows)}
                size="small"
                pagination={{
                  pageSize: 25,
                  showSizeChanger: false,
                  position: ['topRight'],
                }}
                scroll={{ x: 'max-content' }}
              />
              {catalog.pagination && catalog.pagination.hasMore && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <Button onClick={() => setTablePage(tablePage + 1)} loading={loading}>
                    Load More Data (Page {tablePage + 1} of {catalog.pagination.totalPages})
                  </Button>
                </div>
              )}
            </>
          ) : viewMode === 'tree-vertical' ? (
            <div style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '24px',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '2px solid #E2E8F0',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <div style={{ minWidth: '130px', maxWidth: '130px' }}>Component Type</div>
                <div>Value</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>
                <Tree
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  onExpand={setExpandedKeys}
                  style={{ padding: '8px 0' }}
                />
              </div>
            </div>
          ) : (
            renderHorizontalTree()
          )}
        </>
      ) : null}
    </Card>
  );
}