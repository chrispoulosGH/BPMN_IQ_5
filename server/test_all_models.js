const mongoose = require('mongoose');
const Component = require('./models/Component');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    const neighborhoods = ['CMM', 'AT&T Journey', 'LBGUPS'];
    
    console.log('=== TESTING LEAF COMPONENT DETECTION ===\n');
    
    for (const neighborhoodName of neighborhoods) {
      console.log(`${neighborhoodName}:`);
      
      try {
        // Get components
        const components = await Component.find({ neighborhoodName })
          .select('name parentFactoryName')
          .lean();
        
        if (!components.length) {
          console.log('  ERROR: No components found\n');
          continue;
        }
        
        // Detect leaf
        const componentNameSet = new Set(components.map(c => c.name));
        const parentReferences = new Set(
          components
            .filter(c => c.parentFactoryName && componentNameSet.has(c.parentFactoryName))
            .map(c => c.parentFactoryName)
        );
        
        const leafComponents = components.filter(c => !parentReferences.has(c.name));
        const leafComponent = leafComponents.length > 0 ? leafComponents[0].name : 'Application';
        
        console.log(`  Leaf: ${leafComponent}`);
        
        // Check if hierarchies exist for this leaf
        const hierarchyCount = await ComponentSearchIndex.countDocuments({
          neighborhoodName,
          componentName: leafComponent
        });
        
        console.log(`  Search index entries for "${leafComponent}": ${hierarchyCount}`);
        
        // List all component names in search index for this neighborhood
        const componentNamesInIndex = await ComponentSearchIndex.distinct('componentName', { neighborhoodName });
        console.log(`  All component names in index: ${componentNamesInIndex.join(', ')}\n`);
      } catch (err) {
        console.log(`  ERROR: ${err.message}\n`);
      }
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
