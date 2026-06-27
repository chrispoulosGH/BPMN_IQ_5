require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      const app = await CSI.findOne({
        neighborhoodName: 'AT&T Journey',
        componentName: 'application',
        rowName: 'Infor'
      }).lean();
      
      if (app) {
        console.log('Application: Infor');
        console.log('Total hierarchies:', app.cachedHierarchies.length);
        console.log('\nChannels in hierarchies:');
        
        app.cachedHierarchies.forEach((hier, idx) => {
          const channelNode = hier.find(n => n.componentName === 'channel');
          if (channelNode) {
            console.log(`  [${idx}] ${channelNode.rowName}`);
          }
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
