require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      // Find applications with Broadband in hierarchy
      const appsWithBroadband = await CSI.find({
        neighborhoodName: 'AT&T Journey',
        componentName: 'application',
        'cachedHierarchies': {
          $elemMatch: { 'rowName': 'Broadband', 'componentName': 'product' }
        }
      }).lean().limit(1);
      
      console.log('Found', appsWithBroadband.length, 'applications with Broadband\n');
      
      if (appsWithBroadband.length > 0) {
        const app = appsWithBroadband[0];
        console.log('Application:', app.rowName);
        console.log('Total hierarchies:', app.cachedHierarchies.length);
        
        // Find the hierarchy that contains Broadband
        const broadbandHierarchies = app.cachedHierarchies.filter(h => 
          h.some(n => n.rowName === 'Broadband' && n.componentName === 'product')
        );
        
        console.log('\nHierarchies with Broadband:', broadbandHierarchies.length);
        broadbandHierarchies.slice(0, 3).forEach((hier, idx) => {
          console.log(`\n[Path ${idx}]`);
          hier.forEach(node => {
            console.log(`  ${node.componentName.padEnd(15)}: ${node.rowName}`);
          });
        });
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    mongoose.connection.close();
  })
  .catch(error => {
    console.error('Database connection error:', error.message);
    process.exit(1);
  });
