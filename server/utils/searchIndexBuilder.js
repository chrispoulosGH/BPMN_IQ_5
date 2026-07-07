const mongoose = require('mongoose');
const ComponentSearchIndex = require('../models/ComponentSearchIndex');
const CanonicalComponent = require('../models/CanonicalComponent');

/**
 * Rebuild the search index for all components in a neighborhood
 * This should be called after component uploads or updates
 */
async function rebuildSearchIndex(neighborhoodName, options = {}) {
  const CanonicalModel = options.CanonicalModel || CanonicalComponent;
  const SearchIndexModel = options.SearchIndexModel || ComponentSearchIndex;
  const indexLabel = options.indexLabel || 'ComponentSearchIndex';
  const dataType = options.dataType || '';

  console.log(`[INDEX] Starting ${indexLabel} rebuild for neighborhood: ${neighborhoodName}`);

  try {
    // Get canonical rows and group into synthesized "components" by componentType
    const canonicalRows = await CanonicalModel.find({ neighborhoodName }).lean();
    if (!canonicalRows.length) {
      console.log(`[INDEX] No canonical rows found for ${indexLabel} neighborhood: ${neighborhoodName}`);
      return;
    }

    // Group by componentType
    const componentsByType = new Map();
    for (const r of canonicalRows) {
      const type = (r.componentType || r.component_type || 'unknown') + '';
      if (!componentsByType.has(type)) componentsByType.set(type, []);
      componentsByType.get(type).push(r);
    }

    const components = Array.from(componentsByType.keys()).map(type => {
      const rows = componentsByType.get(type).map(r => ({
        _id: r._id,
        values: r.values || {},
        // preserve any parentName present on the canonical row values
        parentName: (r.values && (r.values.parentName || r.values.parent)) || r.parentName || null,
        // include parentRefs (array of canonical ObjectId strings) for link-based hierarchies
        parentRefs: Array.isArray(r.parentRefs) ? r.parentRefs : [],
      }));
      return {
        _id: type,
        name: type,
        // canonical rows don't carry a parentFactoryName by default; leave empty
        parentFactoryName: '',
        rows,
      };
    });

    console.log(`[INDEX] Synthesized ${components.length} components from canonicalcomponents for ${neighborhoodName}`);

    // Create component map for hierarchy lookup
    const componentMap = new Map(components.map(c => [normalizeValue(c.name), c]));

    // Also create a map of canonical rows by their _id for direct parentRef lookups
    const canonicalById = new Map(canonicalRows.map(r => [String(r._id), r]));

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

    // Helper to build ALL hierarchy paths for a row (recursively handling multiple parents)
    // Returns array of hierarchies, where each hierarchy is an array of {componentName, rowName, componentId, rowId}
    const buildAllHierarchyPaths = async (component, row, visitedRowKeys = new Set()) => {
      const rowValues = getRowValues(row);
      const rowName = String(rowValues.name || row.name || 'unnamed').trim();
      const currentRowKey = `${component.name}:${String(row._id)}`;

      // Prevent infinite loops
      if (visitedRowKeys.has(currentRowKey)) {
        return [[{ componentName: component.name, componentId: String(component._id), rowName, rowId: String(row._id) }]];
      }

      // Use canonical parentRefs when available (preferred), otherwise fall back to parentName
      const parentRefs = Array.isArray(row.parentRefs) && row.parentRefs.length > 0 ? row.parentRefs.map(String) : [];

      // Helper to produce a single-node fallback path
      const singleNode = [{ componentName: component.name, componentId: String(component._id), rowName, rowId: String(row._id) }];

      if (parentRefs.length === 0) {
        // No explicit parentRefs - fall back to legacy parentName parsing
        const parentNames = row.parentName
          ? row.parentName.split('|').map(p => p.trim()).filter(p => p)
          : [];

        if (parentNames.length === 0) {
          return [singleNode];
        }

        const hierarchies = [];
        for (const parentName of parentNames) {
          const parentComponentName = component.parentFactoryName;
          const parentComponent = componentMap.get(normalizeValue(parentComponentName));

          if (!parentComponent) {
            hierarchies.push(singleNode);
            continue;
          }

          // Find parent row by name
          const parentRow = parentComponent.rows?.find(r => {
            const pRowValues = getRowValues(r);
            const pName = String(pRowValues.name || r.name || 'unnamed').trim();
            return normalizeValue(pName) === normalizeValue(parentName);
          });

          if (!parentRow) {
            hierarchies.push(singleNode);
            continue;
          }

          const pathVisitedSet = new Set(visitedRowKeys);
          pathVisitedSet.add(currentRowKey);
          const parentHierarchies = await buildAllHierarchyPaths(parentComponent, parentRow, pathVisitedSet);
          parentHierarchies.forEach(parentPath => {
            const fullPath = [...parentPath, {
              componentName: component.name,
              componentId: String(component._id),
              rowName,
              rowId: String(row._id)
            }];
            hierarchies.push(fullPath);
          });
        }

        return hierarchies.length > 0 ? hierarchies : [singleNode];
      }

      // Build hierarchies from parentRefs (canonical link-based)
      const hierarchies = [];
      for (const parentRefId of parentRefs) {
        const parentCanonical = canonicalById.get(String(parentRefId));
        if (!parentCanonical) {
          hierarchies.push(singleNode);
          continue;
        }

        const parentComponentName = parentCanonical.componentType || parentCanonical.component_type || 'unknown';
        const parentComponent = componentMap.get(normalizeValue(parentComponentName));

        if (!parentComponent) {
          hierarchies.push(singleNode);
          continue;
        }

        // Find the parent row in the parentComponent by matching _id
        const parentRow = parentComponent.rows?.find(r => String(r._id) === String(parentRefId));

        if (!parentRow) {
          hierarchies.push(singleNode);
          continue;
        }

        const pathVisitedSet = new Set(visitedRowKeys);
        pathVisitedSet.add(currentRowKey);
        const parentHierarchies = await buildAllHierarchyPaths(parentComponent, parentRow, pathVisitedSet);
        parentHierarchies.forEach(parentPath => {
          const fullPath = [...parentPath, {
            componentName: component.name,
            componentId: String(component._id),
            rowName,
            rowId: String(row._id)
          }];
          hierarchies.push(fullPath);
        });
      }

      return hierarchies.length > 0 ? hierarchies : [singleNode];
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
          componentId: mongoose.isValidObjectId(component._id) ? component._id : null,
          rowId: mongoose.isValidObjectId(row._id) ? row._id : null,
          rowName,
          searchableTextLower: allValuesStr.toLowerCase(),
          allValues: [rowName, ...Object.values(rowValues)].map(v => String(v || '')),
          fieldByValue: rowValues,
          cachedLineagePaths: pathStrings, // Multiple paths if multiple parents (backward compatibility)
          // Ensure componentId/rowId inside cachedHierarchies are ObjectIds or null
          cachedHierarchies: hierarchies.map(path => path.map(node => ({
            componentName: node.componentName,
            componentId: mongoose.isValidObjectId(node.componentId) ? node.componentId : null,
            rowName: node.rowName,
            rowId: mongoose.isValidObjectId(node.rowId) ? node.rowId : null,
          }))), // Structured hierarchy data with component names
          dataType: rowValues.dataType || row.dataType || dataType,
          updatedAt: new Date(),
        });

        totalRowsProcessed++;
      }
    }

    // Clear old index for this neighborhood
    await SearchIndexModel.deleteMany({ neighborhoodName });

    // Bulk insert new index
    if (indexEntries.length > 0) {
      await SearchIndexModel.insertMany(indexEntries);
      console.log(`[INDEX] Successfully indexed ${indexEntries.length} entries into ${indexLabel}`);
    }

    console.log(`[INDEX] ${indexLabel} rebuild complete: ${neighborhoodName}`);
    return { success: true, entriesCount: indexEntries.length };
  } catch (error) {
    console.error(`[INDEX] Error rebuilding ${indexLabel} for ${neighborhoodName}:`, error);
    throw error;
  }
}

module.exports = { rebuildSearchIndex };
