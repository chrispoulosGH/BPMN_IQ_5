const mongoose = require('mongoose');
const Component = require('./models/Component');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI).then(async () => {
  try {
    const neighborhoods = ['CMM', 'AT&T Journey', 'LBGUPS'];
    
    for (const neighborhood of neighborhoods) {
      const components = await Component.find({ neighborhoodName: neighborhood })
        .select('name parentFactoryName')
        .lean();
      
      if (!components.length) {
        console.log(`${neighborhood}: (no components)`);
        continue;
      }
      
      // Find leaf component
      const componentNames = new Set(components.map(c => c.name));
      const parentReferences = new Set(
        components
          .filter(c => c.parentFactoryName && componentNames.has(c.parentFactoryName))
          .map(c => c.parentFactoryName)
      );
      
      const leafComponents = components.filter(c => !parentReferences.has(c.name));
      const leafComponent = leafComponents.length > 0 ? leafComponents[0].name : 'Application';
      
      console.log(`${neighborhood}:`);
      console.log(`  Components: ${components.map(c => c.name).join(' -> ')}`);
      console.log(`  Parent refs: {${Array.from(parentReferences).join(', ')}}`);
      console.log(`  Leaf: ${leafComponent}\n`);
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
