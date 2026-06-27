require('dotenv').config();
const mongoose = require('mongoose');
const Component = require('./models/Component');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      // Get Broadband product to test
      const broadbandComp = await Component.findOne({
        name: 'product',
        parentFactoryName: 'channel',
        neighborhood: 'AT&T Journey'
      }).populate('rows');
      
      console.log('Checking Broadband product:');
      
      if (broadbandComp && broadbandComp.rows) {
        const broadbandRow = broadbandComp.rows.find(r => {
          const name = r.name || r.Name || '';
          return name.toLowerCase().includes('broadband');
        });
        
        if (broadbandRow) {
          console.log(`Found Broadband row`);
          console.log(`  rowName: ${broadbandRow.name || broadbandRow.Name}`);
          console.log(`  parentName: ${broadbandRow.parentName}`);
          
          // Parse parents
          const parents = (broadbandRow.parentName || '')
            .split('|')
            .map(p => p.trim())
            .filter(p => p);
          
          console.log(`  Number of parents: ${parents.length}`);
          parents.forEach((p, idx) => {
            console.log(`    [${idx}] ${p}`);
          });
        } else {
          console.log('Broadband row not found');
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
    }
    
    mongoose.connection.close();
  })
  .catch(error => {
    console.error('Database connection error:', error.message);
    process.exit(1);
  });
