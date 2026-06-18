require('dotenv').config();
const mongoose = require('mongoose');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const doc = await ComponentSearchIndex.findOne({
    neighborhoodName: 'ATT Journey Model',
    searchableTextLower: { $regex: '\\bedge\\b', $options: 'i' }
  }).lean();

  if (doc) {
    console.log('\n=== FOUND EDGE DOCUMENT ===\n');
    console.log('Row Name:', doc.rowName);
    console.log('Component Name:', doc.componentName);
    console.log('Has cachedHierarchies:', !!doc.cachedHierarchies);
    console.log('Has cachedLineagePaths:', !!doc.cachedLineagePaths);

    if (doc.cachedHierarchies && doc.cachedHierarchies.length > 0) {
      console.log('\n=== HIERARCHIES ===\n');
      doc.cachedHierarchies.forEach((hierarchy, hIdx) => {
        console.log(`Hierarchy ${hIdx + 1} (${hierarchy.length} nodes):`);
        hierarchy.forEach((node, nIdx) => {
          console.log(`  [${nIdx}] ${node.componentName}: ${node.rowName}`);
        });
        console.log('');
      });
    }

    if (doc.cachedLineagePaths && doc.cachedLineagePaths.length > 0) {
      console.log('=== LINEAGE PATHS (BACKWARD COMPATIBILITY) ===\n');
      doc.cachedLineagePaths.forEach((path, idx) => {
        console.log(`Path ${idx + 1}: ${path}`);
      });
    }
  } else {
    console.log('No EDGE document found');
  }
  mongoose.connection.close();
}).catch(e => console.error('Error:', e.message));
