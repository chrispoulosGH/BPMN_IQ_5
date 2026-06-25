const ComponentSearchIndex = require('../models/ComponentSearchIndex');
const Component = require('../models/Component');

/**
 * Rebuild the search index for all components in a neighborhood
 * This should be called after component uploads or updates
 */
async function rebuildSearchIndex(neighborhoodName) {
  console.log(`[INDEX] Starting rebuild for neighborhood: ${neighborhoodName}`);

  try {
    // Get all components
    const components = await Component.find({ neighborhoodName }).lean();
    if (!components.length) {
      console.log(`[INDEX] No components found for neighborhood: ${neighborhoodName}`);
      return;
    }

    console.log(`[INDEX] Found ${components.length} components for ${neighborhoodName}:`, components.map(c => ({ name: c.name, rowCount: (c.rows || []).length, parentFactoryName: c.parentFactoryName })));

    // Create component map for hierarchy lookup
    const componentMap = new Map(components.map(c => [normalizeValue(c.name), c]));

    // Helper function to normalize values for comparison
    function normalizeValue(val) {
      return String(val || '').trim().toLowerCase();
    }

    // Helper function to extract row values
    function getRowValues(row) {
      if (!row.values) return {};
      if (row.values instanceof Map) return Object.fromEntries(row.values.entries());
      if (typeof row.values.toObject === 'function') return row.values.toObject();
      if (typeof row.values === 'object') return { ...row.values };
      return { ...row };
    }

    // Helper to build ALL hierarchy paths for a row (one per parent if multiple parents exist)
    // Returns array of hierarchies, where each hierarchy is an array of {componentName, rowName, componentId, rowId}
    const buildAllHierarchyPaths = async (component, row) => {
      const rowValues = getRowValues(row);
      const rowName = String(rowValues.name || row.name || 'unnamed').trim();

      const parentNames = row.parentName
        ? row.parentName.split('|').map(p => p.trim()).filter(p => p)
        : [];

      if (parentNames.length === 0) {
        // No parents - just return the row in current component
        return [[{ componentName: component.name, componentId: String(component._id), rowName, rowId: String(row._id) }]];
      }

      // For each parent, build a complete hierarchy path
      const hierarchies = [];

      for (const parentName of parentNames) {
        const parentComponentName = component.parentFactoryName;
        const parentComponent = componentMap.get(normalizeValue(parentComponentName));

        if (!parentComponent) {
          // Fallback if parent component not found
          hierarchies.push([{ componentName: component.name, componentId: String(component._id), rowName, rowId: String(row._id) }]);
          continue;
        }

        // Find parent row
        const parentRow = parentComponent.rows?.find(r => {
          const pRowValues = getRowValues(r);
          const pName = String(pRowValues.name || r.name || 'unnamed').trim();
          return normalizeValue(pName) === normalizeValue(parentName);
        });

        if (!parentRow) {
          // Fallback if parent row not found
          hierarchies.push([{ componentName: component.name, componentId: String(component._id), rowName, rowId: String(row._id) }]);
          continue;
        }

        // Build hierarchy by walking up from this parent
        const hierarchyPath = [];
        let currentComponent = parentComponent;
        let currentRow = parentRow;
        const visitedKeys = new Set();

        while (currentComponent && currentRow) {
          const currentRowValues = getRowValues(currentRow);
          const currentRowName = String(currentRowValues.name || currentRow.name || 'unnamed').trim();

          const key = `${currentComponent.name}:${currentRowName}`;
          if (visitedKeys.has(key)) break; // Prevent infinite loops
          visitedKeys.add(key);

          hierarchyPath.unshift({
            componentName: currentComponent.name,
            componentId: String(currentComponent._id),
            rowName: currentRowName,
            rowId: String(currentRow._id)
          });

          // Get first parent only (simple walk-up, not combinatorial)
          const currentParentNames = currentRow.parentName
            ? currentRow.parentName.split('|').map(p => p.trim()).filter(p => p)
            : [];

          if (currentParentNames.length === 0) break; // No more parents

          const nextParentComponent = componentMap.get(normalizeValue(currentComponent.parentFactoryName || ''));
          if (!nextParentComponent) break;

          const nextParentRow = nextParentComponent.rows?.find(r => {
            const pRowValues = getRowValues(r);
            const pName = String(pRowValues.name || r.name || 'unnamed').trim();
            return normalizeValue(pName) === normalizeValue(currentParentNames[0]);
          });

          if (!nextParentRow) break;

          currentComponent = nextParentComponent;
          currentRow = nextParentRow;
        }

        // Add the row itself at the end
        hierarchyPath.push({
          componentName: component.name,
          componentId: String(component._id),
          rowName,
          rowId: String(row._id)
        });
        hierarchies.push(hierarchyPath);
      }

      return hierarchies.length > 0 ? hierarchies : [[{ componentName: component.name, componentId: String(component._id), rowName, rowId: String(row._id) }]];
    };

    // Build index entries
    const indexEntries = [];
    let totalRowsProcessed = 0;

    for (const component of components) {
      const rows = component.rows || [];

      for (const row of rows) {
        const rowValues = getRowValues(row);
        const rowName = String(rowValues.name || row.name || 'unnamed').trim();

        // Build searchable text from all values
        const allValuesStr = Object.values(rowValues)
          .map(v => String(v || '').trim())
          .filter(v => v)
          .join(' ');

        // Build ALL lineage paths (one per parent if multiple parents)
        const hierarchies = await buildAllHierarchyPaths(component, row);

        if (!hierarchies || hierarchies.length === 0) {
          console.log(`[INDEX] WARNING: No hierarchies built for ${component.name}/${rowName}`);
        }

        // Convert hierarchies to path strings for backward compatibility
        const pathStrings = hierarchies.map(h => h.map(node => node.rowName).join(' > '));

        // Create ONE index entry with ALL paths
        indexEntries.push({
          neighborhoodName,
          componentName: component.name,
          componentId: component._id,
          rowId: row._id,
          rowName,
          searchableTextLower: allValuesStr.toLowerCase(),
          allValues: [rowName, ...Object.values(rowValues)].map(v => String(v || '')),
          fieldByValue: rowValues,
          cachedLineagePaths: pathStrings, // Multiple paths if multiple parents (backward compatibility)
          cachedHierarchies: hierarchies, // Structured hierarchy data with component names
          updatedAt: new Date(),
        });

        totalRowsProcessed++;
      }
    }

    // Clear old index for this neighborhood
    await ComponentSearchIndex.deleteMany({ neighborhoodName });

    // Bulk insert new index
    if (indexEntries.length > 0) {
      await ComponentSearchIndex.insertMany(indexEntries);
      console.log(`[INDEX] Successfully indexed ${indexEntries.length} entries`);
    }

    console.log(`[INDEX] Rebuild complete: ${neighborhoodName}`);
    return { success: true, entriesCount: indexEntries.length };
  } catch (error) {
    console.error(`[INDEX] Error rebuilding index for ${neighborhoodName}:`, error);
    throw error;
  }
}

module.exports = { rebuildSearchIndex };
