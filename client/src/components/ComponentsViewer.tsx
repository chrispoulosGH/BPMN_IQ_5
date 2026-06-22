import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Card, Space, Spin, Tree, Button, Segmented, Tabs, Empty, Input } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { FolderOutlined, TableOutlined, SearchOutlined } from '@ant-design/icons';

import { getCustomFactories } from '../api';
import type { CustomFactory, CustomFactoryRow } from '../types';

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
  const [components, setComponents] = useState<CustomFactory[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');

  // Load components
  useEffect(() => {
    let cancelled = false;

    const loadComponents = async () => {
      setLoading(true);
      try {
        const allComponents = await getCustomFactories(neighborhoodName);
        if (!cancelled) {
          setComponents(allComponents);
          // Auto-expand tree on load
          const rootKeys = allComponents
            .filter((c) => !c.parentFactoryName)
            .map((c) => c._id);
          setExpandedKeys(rootKeys);
        }
      } catch (error: any) {
        if (!cancelled) {
          setComponents([]);
          message.error(error.response?.data?.error || error.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadComponents();
    return () => { cancelled = true; };
  }, [message, neighborhoodName]);

  // Filter components based on search text
  const filteredComponents = useMemo(() => {
    if (!searchText.trim()) return components;
    const normalized = searchText.toLowerCase();
    return components.filter(
      (c) =>
        c.name.toLowerCase().includes(normalized) ||
        c.sourceColumnName?.toLowerCase().includes(normalized)
    );
  }, [components, searchText]);

  // Get component columns in hierarchical order from component relationships
  const componentColumns = useMemo(() => {
    if (filteredComponents.length === 0) return [];

    // Build hierarchy map: parent name -> children
    const childrenByParent = new Map<string | null, CustomFactory[]>();
    filteredComponents.forEach((component) => {
      const parentName = component.parentFactoryName || null;
      if (!childrenByParent.has(parentName)) {
        childrenByParent.set(parentName, []);
      }
      childrenByParent.get(parentName)!.push(component);
    });

    // Get roots (components with no parent)
    const roots = childrenByParent.get(null) || [];

    // Depth-first traversal to get components in order
    const ordered: CustomFactory[] = [];
    const visited = new Set<string>();

    const traverse = (component: CustomFactory) => {
      if (visited.has(component._id)) return;
      visited.add(component._id);
      ordered.push(component);

      // Add children in order
      const children = childrenByParent.get(component.name) || [];
      children.forEach((child) => traverse(child));
    };

    roots.forEach((root) => traverse(root));

    return ordered.map((comp) => ({
      id: comp._id,
      name: comp.name,
      sourceColumnName: comp.sourceColumnName,
      component: comp,
    }));
  }, [filteredComponents]);

  // Build hierarchical tree structure from component data
  const treeData = useMemo<DataNode[]>(() => {
    if (componentColumns.length === 0) return [];

    const pathToNode = new Map<string, DataNode>();
    const rootNodes: DataNode[] = [];

    // Find the root component (should be first in componentColumns)
    const rootComponent = componentColumns[0]?.component;
    if (!rootComponent) return [];

    // Iterate through root component rows and build full hierarchy
    (rootComponent.rows || []).forEach((row) => {
      let currentPath: string[] = [];

      // Build path through all component levels
      for (let depth = 0; depth < componentColumns.length; depth++) {
        const colInfo = componentColumns[depth];
        const component = colInfo.component;

        // Get value from row - use sourceColumnName or component name
        const columnName = component.sourceColumnName || component.name;
        const value = String(row?.values?.[columnName] || '').trim();

        if (!value) break; // Stop if no value at this level

        currentPath.push(value);
        const pathKey = currentPath.join('|');

        if (!pathToNode.has(pathKey)) {
          const colors = ['#EFF6FF', '#F0FDF4', '#FEF3C7', '#FCE7F3', '#F3E8FF', '#ECFDF5'];
          const bgColor = colors[depth % colors.length];
          const typeColor = ['#0C63E4', '#15803D', '#B45309', '#BE185D', '#6D28D9', '#0891B2'];
          const textColor = typeColor[depth % typeColor.length];

          const node: DataNode = {
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
                  {colInfo.name}
                </div>
                <div style={{ fontSize: '13px', color: '#1E293B', fontWeight: 500 }}>{value}</div>
              </div>
            ),
            children: [],
            isLeaf: depth === componentColumns.length - 1,
          };

          // Add to parent or to roots
          if (depth === 0) {
            rootNodes.push(node);
          } else {
            const parentPath = currentPath.slice(0, depth).join('|');
            const parentNode = pathToNode.get(parentPath);
            if (parentNode?.children) {
              parentNode.children.push(node);
            }
          }

          pathToNode.set(pathKey, node);
        }
      }
    });

    // Deduplicate root nodes
    const uniqueRoots: DataNode[] = [];
    const seenKeys = new Set<React.Key>();

    rootNodes.forEach((node) => {
      if (!seenKeys.has(node.key)) {
        seenKeys.add(node.key);
        uniqueRoots.push(node);
      }
    });

    return uniqueRoots.sort((a, b) => {
      const aText = String(a.key);
      const bText = String(b.key);
      return aText.localeCompare(bText);
    });
  }, [componentColumns]);

  // Render table view with all components as tabs
  const tableViewContent = (
    <Tabs
      className="components-table-view"
      defaultActiveKey={availableComponentIds[0] || (components[0]?._id || '')}
      items={components.map((component) => ({
        key: component._id,
        label: <>{component.name} ({component.rowCount})</>,
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
          }}
        >
          Expand All
        </Button>
        <Button size="small" onClick={() => setExpandedKeys([])}>
          Collapse All
        </Button>
      </div>
      <Tree
        treeData={treeData}
        expandedKeys={expandedKeys}
        onExpand={setExpandedKeys}
        style={{ padding: '8px 0' }}
      />
    </div>
  );

  return (
    <Card
      title="Component Browser"
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
    </Card>
  );
}
