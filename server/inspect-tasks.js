require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  const taskComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'Task' }).lean();
  
  if (!taskComp || !taskComp.rows || taskComp.rows.length === 0) {
    console.log('No Task component or rows found');
    mongoose.connection.close();
    return;
  }
  
  console.log(`\n=== TASK COMPONENT STRUCTURE ===\n`);
  console.log(`Total Task rows: ${taskComp.rows.length}\n`);
  
  // Show first few rows with all fields
  console.log('First 3 Task rows:');
  for (let i = 0; i < Math.min(3, taskComp.rows.length); i++) {
    const row = taskComp.rows[i];
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    console.log(`\n[${i}] Row name: ${vals.name}`);
    console.log(`   Parent: ${row.parentName}`);
    console.log(`   Fields: ${Object.keys(vals).join(', ')}`);
    if (Object.keys(vals).length <= 10) {
      console.log(`   Values:`, JSON.stringify(vals, null, 2));
    }
  }
  
  // Check if any task rows reference EDGE in any field
  console.log(`\n\n=== SEARCHING TASK ROWS FOR "EDGE" ===\n`);
  let edgeCount = 0;
  taskComp.rows.forEach((row, idx) => {
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    if (JSON.stringify(vals).includes('EDGE')) {
      edgeCount++;
      console.log(`[${edgeCount}] Row: ${vals.name}`);
      console.log(`    Parent: ${row.parentName}`);
      console.log(`    Full values: ${JSON.stringify(vals)}`);
    }
  });
  
  if (edgeCount === 0) {
    console.log('No EDGE references found in Task rows');
  }
  
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
