require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  const bfComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'business_flow' }).lean();
  
  if (!bfComp || !bfComp.rows || bfComp.rows.length === 0) {
    console.log('No business_flow component or rows found');
    mongoose.connection.close();
    return;
  }
  
  console.log(`\n=== BUSINESS_FLOW COMPONENT STRUCTURE ===\n`);
  console.log(`Total business_flow rows: ${bfComp.rows.length}\n`);
  
  // Show first few rows with all fields
  console.log('First 2 business_flow rows:');
  for (let i = 0; i < Math.min(2, bfComp.rows.length); i++) {
    const row = bfComp.rows[i];
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    console.log(`\n[${i}] Row name: ${vals.name}`);
    console.log(`   Parent: ${row.parentName}`);
    console.log(`   Fields: ${Object.keys(vals).join(', ')}`);
    console.log(`   Values:`, JSON.stringify(vals).substring(0, 200) + '...');
  }
  
  // Check if any business_flow rows have an "application" or "applications" field
  console.log(`\n\n=== CHECKING FOR FIELD REFERENCES ===\n`);
  const allFields = new Set();
  bfComp.rows.forEach(row => {
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    Object.keys(vals).forEach(k => allFields.add(k));
  });
  
  console.log('All fields in business_flow rows:');
  Array.from(allFields).forEach(f => console.log(`  - ${f}`));
  
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
