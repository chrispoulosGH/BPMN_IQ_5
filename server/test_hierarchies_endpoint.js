const mongoose = require('mongoose');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    const models = [
      { name: 'CMM', leafComponent: 'Application_Name' },
      { name: 'AT&T Journey', leafComponent: 'Application' },
      { name: 'LBGUPS', leafComponent: 'Application' }
    ];
    
    console.log('=== SIMULATING HIERARCHIES ENDPOINT ===\n');
    
    for (const model of models) {
      console.log(`${model.name} (leaf=${model.leafComponent}):`);
      
      try {
        const entries = await ComponentSearchIndex.find({
          neighborhoodName: model.name,
          componentName: model.leafComponent
        })
        .select('cachedHierarchies rowName')
        .limit(5)
        .lean();
        
        console.log(`  Found ${entries.length} entries with componentName='${model.leafComponent}'`);
        
        if (entries.length > 0) {
          let uniqueHierarchies = new Set();
          let totalHierarchies = 0;
          
          entries.forEach(entry => {
            if (entry.cachedHierarchies && entry.cachedHierarchies.length > 0) {
              entry.cachedHierarchies.forEach(h => {
                const pathKey = h.map(node => node.rowName).join('|');
                uniqueHierarchies.add(pathKey);
                totalHierarchies++;
              });
            }
          });
          
          console.log(`  Total hierarchies in these entries: ${totalHierarchies}`);
          console.log(`  Unique hierarchies: ${uniqueHierarchies.size}`);
          console.log(`  Sample entries:`);
          entries.slice(0, 3).forEach(e => {
            console.log(`    - ${e.rowName}: ${e.cachedHierarchies ? e.cachedHierarchies.length + ' hierarchies' : 'NO HIERARCHIES'}`);
          });
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
