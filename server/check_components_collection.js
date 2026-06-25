const mongoose = require('mongoose');
const Component = require('./models/Component');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    const models = ['CMM', 'AT&T Journey', 'LBGUPS'];
    
    console.log('=== CHECKING COMPONENT COLLECTION ===\n');
    
    for (const model of models) {
      const count = await Component.countDocuments({ neighborhoodName: model });
      const entries = await Component.find({ neighborhoodName: model }).select('name parentFactoryName').lean();
      
      console.log(`${model}:`);
      console.log(`  Total components: ${count}`);
      console.log(`  Component names: ${entries.map(e => e.name).join(', ')}`);
      
      // Check for parentFactoryName values
      const parentFactories = new Set(entries.filter(e => e.parentFactoryName).map(e => e.parentFactoryName));
      console.log(`  Parent factory references: ${Array.from(parentFactories).join(', ')}`);
      
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
