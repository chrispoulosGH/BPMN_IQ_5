require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  const comps = await Component.find({ neighborhoodName: 'ATT Journey Model' }).lean();
  let total = 0;
  const results = {};
  
  for (const comp of comps) {
    let compCount = 0;
    for (const row of (comp.rows || [])) {
      const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
      const str = JSON.stringify(vals);
      if (str.includes('EDGE')) {
        compCount++;
        total++;
      }
    }
    if (compCount > 0) {
      results[comp.name] = compCount;
    }
  }
  
  console.log('EDGE instances by component:');
  Object.entries(results).forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`);
  });
  console.log(`\nTotal: ${total}`);
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
