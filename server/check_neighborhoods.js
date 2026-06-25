const mongoose = require('mongoose');
const Component = require('./models/Component');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    // Get all unique neighborhoodName values
    const neighborhoods = await Component.distinct('neighborhoodName');
    console.log('Neighborhoods in database:');
    neighborhoods.forEach(n => console.log(`  "${n}"`));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}).catch(err => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
