require('dotenv').config();
const mongoose = require('mongoose');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

// Accept comma-separated neighborhoods via env or first CLI arg, otherwise fall back to defaults
const NEIGHBORHOODS = process.env.NEIGHBORHOODS
  ? process.env.NEIGHBORHOODS.split(',').map(s => s.trim())
  : (process.argv[2] ? process.argv[2].split(',').map(s => s.trim()) : ['CMM', 'AT&T Journey', 'LBGUPS']);

mongoose.connect(MONGO_URI).then(async () => {
  try {
    console.log('=== CHECKING CACHED HIERARCHIES ===\n');

    for (const hood of NEIGHBORHOODS) {
      console.log(`${hood}:`);
      
      try {
        const entries = await ComponentSearchIndex.find({ neighborhoodName: hood })
          .select('componentName cachedHierarchies cachedLineagePaths')
          .limit(3)
          .lean();
        
        for (const entry of entries) {
          const hasHierarchies = entry.cachedHierarchies && entry.cachedHierarchies.length > 0;
          const hasPaths = entry.cachedLineagePaths && entry.cachedLineagePaths.length > 0;
          console.log(`  ${entry.componentName}:`);
          console.log(`    cachedHierarchies: ${hasHierarchies ? entry.cachedHierarchies.length + ' items' : 'MISSING'}`);
          console.log(`    cachedLineagePaths: ${hasPaths ? entry.cachedLineagePaths.length + ' items' : 'MISSING'}`);
          if (hasHierarchies && entry.cachedHierarchies[0]) {
            console.log(`    First hierarchy has ${entry.cachedHierarchies[0].length} nodes`);
          }
        }
      } catch (err) {
        console.log(`  ERROR: ${err.message}`);
      }
      console.log();
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}).catch(err => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
