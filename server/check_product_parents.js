require('dotenv').config();
const mongoose = require('mongoose');
const Component = require('./models/Component');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      const product = await Component.findOne({ 
        name: 'product', 
        neighborhoodName: 'AT&T Journey' 
      }).lean();

      console.log('=== PRODUCT STRUCTURE ===\n');
      product.rows.forEach((row, idx) => {
        console.log(`Product ${idx}: ${row.values?.name || 'unnamed'}`);
        console.log(`  parentFactoryName: ${row.parentFactoryName}`);
        console.log(`  parentName: ${row.parentName}`);
        console.log('');
      });

      // Check domain component
      const domain = await Component.findOne({ 
        name: 'domain', 
        neighborhoodName: 'AT&T Journey' 
      }).lean();

      console.log('\n=== DOMAIN STRUCTURE (first 3) ===\n');
      domain.rows.slice(0, 3).forEach((row, idx) => {
        console.log(`Domain ${idx}: ${row.values?.name || 'unnamed'}`);
        console.log(`  parentFactoryName: ${row.parentFactoryName}`);
        console.log(`  parentName: ${row.parentName}`);
        console.log('');
      });

    } catch (error) {
      console.error('Error:', error.message);
    }
    
    mongoose.connection.close();
  })
  .catch(error => {
    console.error('Database connection error:', error.message);
    process.exit(1);
  });
