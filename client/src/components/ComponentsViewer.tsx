import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Card, Space, Spin, Tree, Button, Segmented, Tabs, Empty, Input, Drawer, Divider, Descriptions, Badge, Tag, Collapse } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { FolderOutlined, TableOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';

import { getCustomFactories, getComponentHierarchies, getCustomFactory } from '../api';
import type { CustomFactory, CustomFactoryRow, HierarchyPath } from '../types';

interface ComponentsViewerProps {
  neighborhoodName: string;
  onComponentTabSelect?: (componentId: string, componentName: string) => void;
  availableComponentIds?: string[];
  renderComponentContent?: (componentId: string, componentName: string) => React.ReactNode;
}

export default function ComponentsViewer({
  neighborhoodName,
  onComponentTabSelect,
  availableComponentIds = [],
  renderComponentContent,
}: ComponentsViewerProps) {
  const { message } = AntApp.useApp();
  const [hierarchies, setHierarchies] = useState<HierarchyPath[]>([]);
  const [components, setComponents] = useState<CustomFactory[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<React.Key | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<CustomFactory | null>(null);
  const [showMetadataDrawer, setShowMetadataDrawer] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  // Load hierarchies from ComponentSearchIndex
  useEffect(() => {
    let cancelled = false;

    const loadHierarchies = async () => {
      setLoading(true);
      try {
        const result = await getComponentHierarchies(neighborhoodName, 'Application');
        if (!cancelled) {
          setHierarchies(result.paths);
          console.log(`Loaded ${result.paths.length} hierarchy paths`);
        }
      } catch (error: any) {
        if (!cancelled) {
          setHierarchies([]);
          message.error(error.response?.data?.error || error.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadHierarchies();
    return () => { cancelled = true; };
  }, [message, neighborhoodName]);

  // Also load custom factories for table view
  useEffect(() => {
    let cancelled = false;

    const loadComponents = async () => {
      try {
        const allComponents = await getCustomFactories(neighborhoodName);
        if (!cancelled) {
          setComponents(allComponents);
        }
      } catch (error: any) {
        if (!cancelled) {
          setComponents([]);
        }
      }
    };

    loadComponents();
    return () => { cancelled = true; };
  }, [neighborhoodName]);

  const handleTabDragStart = (e: React.DragEvent<HTMLDivElement>, tabId: string) => {
    setDraggedTabId(tabId);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('tabId', tabId);
    }
  };

  const handleTabDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
      e.preventDefault();
    }
  };

  const handleTabDrop = (e: React.DragEvent<HTMLDivElement>, targetTabId: string) => {
    e.preventDefault();
    const sourceTabId = e.dataTransfer?.getData('tabId');

    if (!sourceTabId || sourceTabId === targetTabId) {
      setDraggedTabId(null);
      return;
    }

    const sourceIndex = components.findIndex((c) => c._id === sourceTabId);
    const targetIndex = components.findIndex((c) => c._id === targetTabId);

    if (sourceIndex !== -1 && targetIndex !== -1) {
      const reordered = [...components];
      const [removed] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, removed);
      setComponents(reordered);
    }

    setDraggedTabId(null);
  };

  const handleTabDragEnd = () => {
    setDraggedTabId(null);
  };

  // Handle tree node selection to show metadata
  const handleNodeSelect = async (selectedKeys: React.Key[]) => {
    const nodeKey = selectedKeys[0];
    setSelectedNodeKey(nodeKey);

    if (!nodeKey) {
      setShowMetadataDrawer(false);
      return;
    }

    // Find the matching node across all hierarchy paths
    const keyStr = String(nodeKey);
    let componentId: string | undefined;
    let selectedNodeInfo: any = null;

    // Search through all hierarchies to find the selected node
    for (const hierarchy of hierarchies) {
      const { nodes } = hierarchy;
      for (const node of nodes) {
        // Build a unique key for this node using pathKey pattern
        const nodePathKey = `${node.rowId || node.rowName}-${node.componentName}`;
        if (nodePathKey === keyStr || keyStr.includes(node.rowName)) {
          componentId = node.componentId ? String(node.componentId) : undefined;
          selectedNodeInfo = node;
          break;
        }
      }
      if (componentId) break;
    }

    console.log('Selected node:', { selectedNodeInfo, componentId });

    if (componentId) {
      setLoadingMetadata(true);
      try {
        let component = await getCustomFactory(componentId);
        console.log('Fetched component:', component);

        // If component has foreign keys, follow the link to get metadata from the linked component
        if (component.foreignKeyColumns && component.foreignKeyColumns.length > 0) {
          const firstFK = component.foreignKeyColumns[0];
          console.log('FK found:', firstFK);
          
          // Try to use targetReference as the linked component ID
          if (firstFK.targetReference) {
            try {
              console.log('Fetching linked component with ID:', firstFK.targetReference);
              const linkedComponent = await getCustomFactory(firstFK.targetReference);
              console.log('Linked component fetched:', linkedComponent);
              component = linkedComponent;
            } catch (error) {
              // If targetReference isn't a valid componentId, keep original component
              console.log('Could not fetch linked component, using original');
            }
          }
        }

        setSelectedComponent(component);
        setShowMetadataDrawer(true);
      } catch (error: any) {
        console.error('Error fetching metadata:', error);
        // If component not found, still show drawer with available node info
        setSelectedComponent({
          name: selectedNodeInfo?.rowName,
          sourceColumnName: selectedNodeInfo?.componentName,
          neighborhoodName: neighborhoodName,
        } as any);
        setShowMetadataDrawer(true);
        console.log('Node info displayed (component metadata not found in database)');
      } finally {
        setLoadingMetadata(false);
      }
    } else if (selectedNodeInfo) {
      // Show drawer with available node info even if no componentId
      setSelectedComponent({
        name: selectedNodeInfo.rowName,
        sourceColumnName: selectedNodeInfo.componentName,
        neighborhoodName: neighborhoodName,
      } as any);
      setShowMetadataDrawer(true);
    }
  };
  const filteredComponents = useMemo(() => {
    if (!searchText.trim()) return components;
    const normalized = searchText.toLowerCase();
    return components.filter(
      (c) =>
        c.name.toLowerCase().includes(normalized) ||
        c.sourceColumnName?.toLowerCase().includes(normalized)
    );
  }, [components, searchText]);

  // Build hierarchical tree from component hierarchies with ModelCatalog styling
  const treeData = useMemo<DataNode[]>(() => {
    if (hierarchies.length === 0) return [];

    const pathToNode = new Map<string, DataNode>();
    const rootNodes: DataNode[] = [];
    let nodeId = 0;

    // Color arrays (matching ModelCatalog)
    const bgColors = ['#EFF6FF', '#F0FDF4', '#FEF3C7', '#FCE7F3', '#F3E8FF', '#ECFDF5'];
    const textColors = ['#0C63E4', '#15803D', '#B45309', '#BE185D', '#6D28D9', '#0891B2'];

    hierarchies.forEach((hierarchy) => {
      const { nodes, pathStr } = hierarchy;
      let currentPath: string[] = [];

      nodes.forEach((node, depth) => {
        currentPath.push(node.rowName);
        const pathKey = currentPath.join('|');

        if (!pathToNode.has(pathKey)) {
          const bgColor = bgColors[depth % bgColors.length];
          const textColor = textColors[depth % textColors.length];

          const nodeTitle = (
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
                {node.componentName}
              </div>
              <div style={{ fontSize: '13px', color: '#1E293B', fontWeight: 500 }}>
                {node.rowName}
              </div>
            </div>
          );

          const newNode: DataNode = {
            key: pathKey,
            title: nodeTitle,
            children: [],
            isLeaf: depth === nodes.length - 1,
          };

          if (depth === 0) {
            rootNodes.push(newNode);
          } else {
            const parentPath = currentPath.slice(0, depth).join('|');
            const parentNode = pathToNode.get(parentPath);
            if (parentNode && parentNode.children) {
              parentNode.children.push(newNode);
            }
          }

          pathToNode.set(pathKey, newNode);
        }
      });
    });

    // Sort root nodes alphabetically
    return rootNodes.sort((a, b) => {
      const aText = String(a.title);
      const bText = String(b.title);
      const aValue = aText.match(/\>([^<]+)<\/div>\s*<div/)?.[1] || '';
      const bValue = bText.match(/\>([^<]+)<\/div>\s*<div/)?.[1] || '';
      return String(aValue).localeCompare(String(bValue));
    });
  }, [hierarchies]);

  // Auto-expand tree on load - expand root node
  useEffect(() => {
    if (treeData && treeData.length > 0) {
      setExpandedKeys([treeData[0].key]);
    }
  }, [treeData]);

  // Auto-expand tree on search
  useEffect(() => {
    if (!treeData || treeData.length === 0) return;

    if (searchText.trim()) {
      // Expand all nodes when searching
      const allKeys = treeData
        .flatMap((node) => {
          const keys: React.Key[] = [node.key];
          const collect = (n: DataNode) => {
            if (n.children) {
              n.children.forEach((child) => {
                keys.push(child.key);
                collect(child);
              });
            }
          };
          collect(node);
          return keys;
        });
      setExpandedKeys(allKeys);
    } else {
      // Default: expand root level to show component types
      if (treeData.length > 0) {
        setExpandedKeys([treeData[0].key]);
      }
    }
  }, [treeData, searchText]);

  // Filter tree data based on search text
  const filteredTreeData = useMemo<DataNode[]>(() => {
    if (!searchText.trim()) return treeData;

    const normalized = searchText.toLowerCase();

    const filterNode = (node: DataNode): DataNode | null => {
      const nodeText = String(node.title).toLowerCase();
      const matches = nodeText.includes(normalized);

      const filteredChildren = node.children
        ? node.children
            .map((child) => filterNode(child))
            .filter((child) => child !== null) as DataNode[]
        : undefined;

      if (matches || (filteredChildren && filteredChildren.length > 0)) {
        return {
          ...node,
          children: filteredChildren,
        };
      }

      return null;
    };

    return treeData
      .map((node) => filterNode(node))
      .filter((node) => node !== null) as DataNode[];
  }, [treeData, searchText]);

  // Render table view with all components as tabs
  const tableViewContent = (
    <Tabs
      className="components-table-view"
      defaultActiveKey={availableComponentIds[0] || (components[0]?._id || '')}
      items={components.map((component) => ({
        key: component._id,
        label: (
          <div
            draggable
            onDragStart={(e) => handleTabDragStart(e, component._id)}
            onDragOver={handleTabDragOver}
            onDrop={(e) => handleTabDrop(e, component._id)}
            onDragEnd={handleTabDragEnd}
            style={{
              cursor: draggedTabId === component._id ? 'grabbing' : 'grab',
              padding: '4px 8px',
              borderRadius: '4px',
              background: draggedTabId === component._id ? '#dbeafe' : undefined,
              border: draggedTabId === component._id ? '2px solid #3b82f6' : '1px solid transparent',
              opacity: draggedTabId === component._id ? 0.6 : 1,
              transition: 'all 0.2s ease-in-out',
            }}
          >
            {component.name} ({component.rowCount})
          </div>
        ),
        children: renderComponentContent
          ? renderComponentContent(component._id, component.name)
          : (
              <div style={{ padding: '16px' }}>
                <Empty description={`No data available for ${component.name}`} />
              </div>
            ),
      }))}
    />
  );

  // Render tree view
  const treeViewContent = (
    <div>
      <Input
        placeholder="Search components..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        style={{ marginBottom: '16px' }}
      />
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <Button
          size="small"
          onClick={() => {
            const allKeys = filteredTreeData
              .flatMap((node) => {
                const keys: React.Key[] = [node.key];
                const collect = (n: DataNode) => {
                  if (n.children) {
                    n.children.forEach((child) => {
                      keys.push(child.key);
                      collect(child);
                    });
                  }
                };
                collect(node);
                return keys;
              });
            setExpandedKeys(allKeys);
          }}
        >
          Expand All
        </Button>
        <Button size="small" onClick={() => setExpandedKeys([])}>
          Collapse All
        </Button>
      </div>
      <Tree
        treeData={filteredTreeData}
        expandedKeys={expandedKeys}
        onExpand={setExpandedKeys}
        selectedKeys={selectedNodeKey ? [selectedNodeKey] : []}
        onSelect={handleNodeSelect}
        style={{ padding: '8px 0' }}
      />
    </div>
  );

  return (
    <Card
      title="Application Hierarchy Tree"
      extra={
        <Segmented
          value={viewMode}
          onChange={(value) => setViewMode(value as 'tree' | 'table')}
          options={[
            {
              label: (
                <>
                  <FolderOutlined /> Tree
                </>
              ),
              value: 'tree',
            },
            {
              label: (
                <>
                  <TableOutlined /> Table
                </>
              ),
              value: 'table',
            },
          ]}
        />
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, overflow: 'auto', padding: '16px' }}
    >
      <Spin spinning={loading}>
        {viewMode === 'tree' ? treeViewContent : tableViewContent}
      </Spin>

      {/* Metadata Drawer */}
      <Drawer
        title="Component Metadata"
        placement="right"
        onClose={() => setShowMetadataDrawer(false)}
        open={showMetadataDrawer}
        width={450}
        loading={loadingMetadata}
      >
        <Spin spinning={loadingMetadata}>
          {selectedComponent ? (
            <div>
              {selectedComponent.shortDescription && (
                <>
                  <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f5ff', borderLeft: '3px solid #1890ff', borderRadius: '4px' }}>
                    <strong>Description:</strong>
                    <div style={{ marginTop: '8px', fontSize: '13px', color: '#595959' }}>
                      {selectedComponent.shortDescription}
                    </div>
                  </div>
                  <Divider style={{ margin: '12px 0' }} />
                </>
              )}

              <Descriptions bordered size="small" column={1} style={{ marginBottom: '16px' }}>
                <Descriptions.Item label="Name" labelStyle={{ fontWeight: 600 }}>
                  {selectedComponent.name}
                </Descriptions.Item>
                <Descriptions.Item label="Neighborhood">
                  {selectedComponent.neighborhoodName || 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Source Column">
                  {selectedComponent.sourceColumnName || 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Parent Component">
                  {selectedComponent.parentFactoryName || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Owner">
                  {selectedComponent.owner || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Created By">
                  {selectedComponent.createdBy || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Source File">
                  {selectedComponent.sourceFileName || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Created At">
                  {selectedComponent.createdAt
                    ? new Date(selectedComponent.createdAt).toLocaleString()
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Row Count">
                  <Badge count={selectedComponent.rowCount} style={{ backgroundColor: '#52c41a' }} />
                </Descriptions.Item>
              </Descriptions>

              {selectedComponent.columns && selectedComponent.columns.length > 0 && (
                <>
                  <Divider>Columns</Divider>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {selectedComponent.columns.map((col) => (
                      <Tag key={col} color="blue">
                        {col}
                      </Tag>
                    ))}
                  </div>
                </>
              )}

              {selectedComponent.qualifierColumns && selectedComponent.qualifierColumns.length > 0 && (
                <>
                  <Divider>Qualifier Columns</Divider>
                  <Collapse
                    items={selectedComponent.qualifierColumns.map((qc) => ({
                      key: qc.name,
                      label: qc.name,
                      children: (
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="Source Column">
                            {qc.sourceColumnName}
                          </Descriptions.Item>
                          <Descriptions.Item label="Field Name">
                            {qc.fieldName}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    }))}
                    size="small"
                  />
                </>
              )}

              {selectedComponent.foreignKeyColumns && selectedComponent.foreignKeyColumns.length > 0 && (
                <>
                  <Divider>Foreign Keys</Divider>
                  <Collapse
                    items={selectedComponent.foreignKeyColumns.map((fk) => ({
                      key: fk.name,
                      label: fk.name,
                      children: (
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="Source Column">
                            {fk.sourceColumnName}
                          </Descriptions.Item>
                          <Descriptions.Item label="Field Name">
                            {fk.fieldName}
                          </Descriptions.Item>
                          <Descriptions.Item label="Target Reference">
                            {fk.targetReference || '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Target Group">
                            {fk.targetGroup || '—'}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    }))}
                    size="small"
                  />
                </>
              )}

              {selectedComponent.rowCount > 0 && (
                <>
                  <Divider>Sample Rows ({selectedComponent.rowCount} total)</Divider>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '12px' }}>
                    {selectedComponent.rows?.slice(0, 5).map((row, idx) => (
                      <div key={idx} style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                        <strong>Row {idx + 1}</strong>
                        <div style={{ marginTop: '4px', fontSize: '11px' }}>
                          {Object.entries(row.values || {}).map(([key, value]) => (
                            <div key={key}>
                              <strong>{key}:</strong> {String(value || '—')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {selectedComponent.rowCount > 5 && (
                      <div style={{ textAlign: 'center', color: '#999', fontSize: '12px', marginTop: '8px' }}>
                        +{selectedComponent.rowCount - 5} more rows
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <Empty description="Select a component to view metadata" />
          )}
        </Spin>
      </Drawer>
    </Card>
  );
}
