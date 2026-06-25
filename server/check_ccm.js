const mongoose = require('mongoose');
const Component = require('./models/Component');
const ComponentSearchIndex = require('./models/ComponentSearchIndex');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    console.log('=== CMM COMPONENTS ===');
    const ccmComps = await Component.find({ neighborhoodName: 'CMM' }).select('name parentFactoryName').lean();
    ccmComps.forEach(c => {
      console.log(`  ${c.name} (parent: ${c.parentFactoryName})`);
    });
    
    console.log('\n=== CMM SEARCH INDEX ENTRIES ===');
    const ccmIndex = await ComponentSearchIndex.find({ neighborhoodName: 'CMM' }).select('componentName rowName').limit(10).lean();
    ccmIndex.forEach(e => {
      console.log(`  ${e.componentName}: ${e.rowName}`);
    });
    console.log(`  ... (${await ComponentSearchIndex.countDocuments({ neighborhoodName: 'CMM' })} total)`);
    
    console.log('\n=== AT&T JOURNEY COMPONENTS ===');
    const attComps = await Component.find({ neighborhoodName: 'AT&T Journey' }).select('name parentFactoryName').lean();
    attComps.forEach(c => {
      console.log(`  ${c.name} (parent: ${c.parentFactoryName})`);
    });
    
    console.log('\n=== AT&T JOURNEY SEARCH INDEX (checking both name variants) ===');
    const attIndex1 = await ComponentSearchIndex.countDocuments({ neighborhoodName: 'AT&T Journey' });
    const attIndex2 = await ComponentSearchIndex.countDocuments({ neighborhoodName: 'ATT Journey Model' });
    console.log(`  "AT&T Journey": ${attIndex1}`);
    console.log(`  "ATT Journey Model": ${attIndex2}`);
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}).catch(err => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
