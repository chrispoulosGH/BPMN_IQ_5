export interface HierarchyPathNode {
  componentName: string;
  rowName: string;
  componentId: string;
  rowId: string;
  level: number;
}

export interface MergedHierarchyTreeNode<TResult> {
  key: string;
  componentName: string;
  rowName: string;
  componentId: string;
  rowId: string;
  level: number;
  path: string;
  results: TResult[];
  children: MergedHierarchyTreeNode<TResult>[];
}

interface TreeBuilderNode<TResult> {
  key: string;
  componentName: string;
  rowName: string;
  componentId: string;
  rowId: string;
  level: number;
  path: string;
  results: TResult[];
  childrenByKey: Map<string, TreeBuilderNode<TResult>>;
}

export interface HierarchyTreeSource {
  hierarchy: HierarchyPathNode[];
}

function makeNodeKey(node: HierarchyPathNode): string {
  return [node.componentId, node.rowId, node.rowName].join('::');
}

function sortNodes<TResult>(nodes: TreeBuilderNode<TResult>[]): TreeBuilderNode<TResult>[] {
  return [...nodes].sort((left, right) => {
    const rowComparison = left.rowName.localeCompare(right.rowName);
    if (rowComparison !== 0) return rowComparison;
    const componentComparison = left.componentName.localeCompare(right.componentName);
    if (componentComparison !== 0) return componentComparison;
    return left.path.localeCompare(right.path);
  });
}

function convertNode<TResult>(node: TreeBuilderNode<TResult>): MergedHierarchyTreeNode<TResult> {
  return {
    key: node.key,
    componentName: node.componentName,
    rowName: node.rowName,
    componentId: node.componentId,
    rowId: node.rowId,
    level: node.level,
    path: node.path,
    results: node.results,
    children: sortNodes(Array.from(node.childrenByKey.values())).map(convertNode),
  };
}

export function buildMergedHierarchyTree<TResult extends HierarchyTreeSource>(results: TResult[]): MergedHierarchyTreeNode<TResult>[] {
  const roots = new Map<string, TreeBuilderNode<TResult>>();

  for (const result of results) {
    let levelNodes = roots;
    const pathParts: string[] = [];

    result.hierarchy.forEach((node, index) => {
      const nodeKey = makeNodeKey(node);
      const path = [...pathParts, node.rowName].join(' > ');
      let treeNode = levelNodes.get(nodeKey);

      if (!treeNode) {
        treeNode = {
          key: path || nodeKey,
          componentName: node.componentName,
          rowName: node.rowName,
          componentId: node.componentId,
          rowId: node.rowId,
          level: node.level,
          path,
          results: [],
          childrenByKey: new Map<string, TreeBuilderNode<TResult>>(),
        };
        levelNodes.set(nodeKey, treeNode);
      }

      if (index === result.hierarchy.length - 1) {
        treeNode.results.push(result);
      }

      pathParts.push(node.rowName);
      levelNodes = treeNode.childrenByKey;
    });
  }

  return sortNodes(Array.from(roots.values())).map(convertNode);
}