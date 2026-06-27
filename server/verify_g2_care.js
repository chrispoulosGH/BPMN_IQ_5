require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      // Method 1: Simple query for G2
      const g2 = await CSI.findOne({
        neighborhoodName: 'AT&T Journey',
        componentName: 'application',
        rowName: 'G2'
      }).select('rowName cachedHierarchies');
      
      if (g2) {
        console.log('✓ Found G2\n');
        
        // Check if any hierarchy contains Care
        const careFound = g2.cachedHierarchies.some(hierarchy => 
          hierarchy.some(node => node.rowName === 'Care' && node.componentName === 'channel')
        );
        
        if (careFound) {
          console.log('✅ G2 contains Care in hierarchies!');
          const careHierarchy = g2.cachedHierarchies.find(h =>
            h.some(n => n.rowName === 'Care' && n.componentName === 'channel')
          );
          console.log('\nCare hierarchy:');
          careHierarchy.forEach((node, idx) => {
            console.log(`  [${idx}] ${node.componentName}: ${node.rowName}`);
          });
        } else {
          console.log('❌ G2 does NOT contain Care in hierarchies');
        }
      } else {
        console.log('❌ G2 not found');
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
