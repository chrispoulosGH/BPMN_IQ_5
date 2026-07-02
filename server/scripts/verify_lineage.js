require('dotenv').config();
const mongoose = require('mongoose');
const ComponentSearchIndex = require('../models/ComponentSearchIndex');

async function main() {
  const neigh = process.argv[2] || 'CTX';
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    // Find entries with the deepest lineage paths
    const entries = await ComponentSearchIndex.find({ neighborhoodName: neigh }).lean();
    let maxDepth = 0;
    let deepest = null;
    let multiParent = null;
    for (const e of entries) {
      const paths = e.cachedLineagePaths || [];
      for (const p of paths) {
        const depth = p.split(' > ').length;
        if (depth > maxDepth) { maxDepth = depth; deepest = e; }
      }
      if (paths.length > 1 && !multiParent) multiParent = e;
    }

    console.log('=== Deepest lineage entry ===');
    if (deepest) {
      console.log('rowName:', deepest.rowName, '| componentName:', deepest.componentName);
      console.log('cachedLineagePaths:');
      (deepest.cachedLineagePaths || []).forEach(p => console.log('   ', p));
    }

    console.log('\n=== Example multi-parent entry ===');
    if (multiParent) {
      console.log('rowName:', multiParent.rowName, '| componentName:', multiParent.componentName);
      console.log('cachedLineagePaths:');
      (multiParent.cachedLineagePaths || []).forEach(p => console.log('   ', p));
    } else {
      console.log('(none found)');
    }

    // Distribution of path depths
    const depthCounts = {};
    for (const e of entries) {
      for (const p of (e.cachedLineagePaths || [])) {
        const d = p.split(' > ').length;
        depthCounts[d] = (depthCounts[d] || 0) + 1;
      }
    }
    console.log('\n=== Lineage depth distribution (depth: count) ===');
    console.log(depthCounts);
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
