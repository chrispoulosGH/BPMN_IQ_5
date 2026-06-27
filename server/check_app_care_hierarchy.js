require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      // Get an application entry with Care in its hierarchy
      const appWithCare = await CSI.findOne({
        neighborhoodName: 'AT&T Journey',
        componentName: 'application',
        'cachedHierarchies': {
          $elemMatch: { 'rowName': 'Care', 'componentName': 'channel' }
        }
      }).lean();

      if (appWithCare) {
        console.log('✅ Found APPLICATION entry with Care in hierarchy\n');
        console.log(`Application: ${appWithCare.rowName}\n`);
        
        // Get the Care-containing hierarchy
        const careHierarchy = appWithCare.cachedHierarchies.find(h => 
          h.some(n => n.rowName === 'Care' && n.componentName === 'channel')
        );
        
        if (careHierarchy) {
          console.log(`Hierarchy depth: ${careHierarchy.length}`);
          console.log('Full path:');
          careHierarchy.forEach((node, idx) => {
            console.log(`  [${idx}] ${node.componentName}: ${node.rowName}`);
          });
        }
      } else {
        console.log('❌ No APPLICATION entries with Care found!');
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
