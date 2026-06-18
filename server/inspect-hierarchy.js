require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  const comps = await Component.find({ neighborhoodName: 'ATT Journey Model' }).lean();
  
  console.log('\n=== COMPONENT INVENTORY ===\n');
  comps.forEach(c => {
    const rowCount = (c.rows || []).length;
    console.log(`${c.name}: ${rowCount} rows`);
  });
  
  console.log('\n=== SEARCHING FOR ROWS WITH FIELD CONTAINING "application" ===\n');
  
  let edgeReferences = 0;
  comps.forEach(comp => {
    (comp.rows || []).forEach(row => {
      const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
      
      // Check if row has an "application" field with EDGE
      if (vals.application === 'EDGE' || (typeof vals.application === 'string' && vals.application.includes('EDGE'))) {
        edgeReferences++;
        console.log(`Found in ${comp.name}: ${vals.name || 'unnamed'}`);
        console.log(`  Application: ${vals.application}`);
        console.log(`  Parent: ${row.parentName}`);
        console.log();
      }
    });
  });
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Rows with application=EDGE: ${edgeReferences}`);
  
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
