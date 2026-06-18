require('dotenv').config();
const mongoose = require('mongoose');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  // Simulate the search endpoint logic
  const searchTerm = 'EDGE';
  const neighborhoodName = 'ATT Journey Model';
  
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  const searchRegex = escapeRegExp(searchTerm);
  const searchPattern = `\\b${searchRegex}\\b`;
  
  const indexResults = await ComponentSearchIndex.find({
    neighborhoodName,
    searchableTextLower: { $regex: searchPattern, $options: 'i' }
  }).lean();
  
  console.log(`\n=== SEARCH FOR "${searchTerm}" ===\n`);
  console.log(`Found ${indexResults.length} matching rows\n`);
  
  // Expand cachedHierarchies or cachedLineagePaths
  const results = [];
  
  for (const indexDoc of indexResults) {
    let hierarchiesData;
    
    if (indexDoc.cachedHierarchies && indexDoc.cachedHierarchies.length > 0) {
      hierarchiesData = indexDoc.cachedHierarchies.map(h => ({
        nodes: h,
        pathStr: h.map(node => node.rowName).join(' > ')
      }));
      console.log(`Using new cachedHierarchies format (${hierarchiesData.length} paths)`);
    } else {
      const paths = indexDoc.cachedLineagePaths || [indexDoc.rowName];
      hierarchiesData = paths.map(pathStr => ({
        nodes: pathStr.split(' > ').map((partName, level) => ({
          componentName: level === pathStr.split(' > ').length - 1 ? indexDoc.componentName : 'Unknown',
          componentId: level === pathStr.split(' > ').length - 1 ? indexDoc.componentId : null,
          rowName: partName,
          rowId: level === pathStr.split(' > ').length - 1 ? indexDoc.rowId : null
        })),
        pathStr
      }));
      console.log(`Using fallback cachedLineagePaths format (${hierarchiesData.length} paths)`);
    }
    
    for (const hierarchyData of hierarchiesData) {
      const hierarchy = hierarchyData.nodes.map((node, level) => ({
        componentName: node.componentName,
        rowName: node.rowName,
        componentId: String(node.componentId || ''),
        rowId: String(node.rowId || ''),
        level,
        values: level === hierarchyData.nodes.length - 1 ? indexDoc.fieldByValue : {}
      }));
      
      results.push({
        searchMatchComponentId: String(indexDoc.componentId),
        searchMatchComponentName: indexDoc.componentName,
        searchMatchRowId: String(indexDoc.rowId),
        searchMatchRowName: indexDoc.rowName,
        hierarchy,
        hierarchyPath: hierarchyData.pathStr,
      });
    }
  }
  
  console.log(`\nExpanded to ${results.length} results\n`);
  
  // Show first result with hierarchy
  if (results.length > 0) {
    const firstResult = results[0];
    console.log('=== FIRST RESULT ===\n');
    console.log('Row:', firstResult.searchMatchRowName);
    console.log('Component:', firstResult.searchMatchComponentName);
    console.log('\nHierarchy Columns:');
    firstResult.hierarchy.forEach(node => {
      console.log(`  Level ${node.level}: ${node.componentName} = ${node.rowName}`);
    });
  }
  
  mongoose.connection.close();
}).catch(e => console.error('Error:', e.message));
