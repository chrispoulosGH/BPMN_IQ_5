require('dotenv').config();
const mongoose = require('mongoose');
const Component = require('./models/Component');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      // Get all channel entries
      const careEntries = await ComponentSearchIndex.find({
        neighborhoodName: 'AT&T Journey',
        componentName: 'product',
        rowName: { $in: ['Broadband', 'Finance'] } // Products with Care
      }).lean();

      console.log('\n=== CARE/RETAIL PRODUCTS IN SEARCH INDEX ===\n');
      careEntries.forEach(entry => {
        console.log(`\nProduct: ${entry.rowName}`);
        console.log(`Cached Hierarchies: ${entry.cachedHierarchies?.length || 0}`);
        if (entry.cachedHierarchies) {
          entry.cachedHierarchies.forEach((hier, idx) => {
            const path = hier.map(n => n.rowName).join(' > ');
            const depth = hier.length;
            console.log(`  [${idx}] (depth ${depth}): ${path}`);
          });
        }
      });

      // Check if Care/Retail products have all the way to Application
      const appEntries = await ComponentSearchIndex.find({
        neighborhoodName: 'AT&T Journey',
        componentName: 'Application'
      }).lean();

      console.log('\n\n=== CHECKING APPLICATION ENTRIES WITH CARE ===\n');
      let careCount = 0;
      appEntries.slice(0, 5).forEach(entry => {
        if (entry.cachedHierarchies) {
          entry.cachedHierarchies.forEach(hier => {
            const hasCare = hier.some(n => n.rowName === 'Care');
            if (hasCare) {
              careCount++;
              const path = hier.map(n => n.rowName).join(' > ');
              console.log(`${path}`);
            }
          });
        }
      });
      console.log(`\nTotal Care apps found in first 5 app entries: ${careCount}`);

    } catch (error) {
      console.error('Error:', error.message);
    }
    
    mongoose.connection.close();
  })
  .catch(error => {
    console.error('Database connection error:', error.message);
    process.exit(1);
  });
