const mongoose = require('mongoose');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    const hoods = ['CMM', 'AT&T Journey', 'LBGUPS'];
    
    console.log('=== CHECKING CACHED HIERARCHIES ===\n');
    
    for (const hood of hoods) {
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
