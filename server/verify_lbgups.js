require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      const app = await CSI.findOne({ 
        neighborhoodName: 'LBGUPS',
        componentName: 'Application'
      }).select('rowName cachedHierarchies -_id').lean();
      
      if (app) {
        console.log('✓ Application:', app.rowName);
        console.log('  Hierarchies count:', app.cachedHierarchies.length);
        if (app.cachedHierarchies[0]) {
          console.log('  First hierarchy depth:', app.cachedHierarchies[0].length);
          console.log('  Path:');
          app.cachedHierarchies[0].forEach((node, i) => {
            console.log(`    [${i}] ${node.componentName}: ${node.rowName}`);
          });
        }
      } else {
        console.log('✗ No application found');
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
