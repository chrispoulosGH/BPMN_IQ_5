const mongoose = require('mongoose');
const Component = require('./models/Component');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
console.log('Connecting to:', MONGO_URI);

mongoose.connect(MONGO_URI).then(async () => {
  try {
    console.log('Connected successfully\n');
    
    const totalComponents = await Component.countDocuments();
    const totalSearchIndex = await ComponentSearchIndex.countDocuments();
    
    console.log(`Total components in db: ${totalComponents}`);
    console.log(`Total search index entries: ${totalSearchIndex}\n`);
    
    const neighborhoods = await Component.distinct('neighborhoodName');
    console.log('=== COMPONENTS BY NEIGHBORHOOD ===');
    if (neighborhoods.length === 0) {
      console.log('(none)');
    } else {
      for (const n of neighborhoods) {
        const count = await Component.countDocuments({ neighborhoodName: n });
        console.log(`  ${n}: ${count}`);
      }
    }
    
    const indexN = await ComponentSearchIndex.distinct('neighborhoodName');
    console.log('\n=== SEARCH INDEX BY NEIGHBORHOOD ===');
    if (indexN.length === 0) {
      console.log('(none)');
    } else {
      for (const n of indexN) {
        const count = await ComponentSearchIndex.countDocuments({ neighborhoodName: n });
        console.log(`  ${n}: ${count}`);
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
