require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  const appComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'application' }).lean();
  
  if (!appComp || !appComp.rows || appComp.rows.length === 0) {
    console.log('No application component or rows found');
    mongoose.connection.close();
    return;
  }
  
  console.log(`\n=== APPLICATION COMPONENT STRUCTURE ===\n`);
  console.log(`Total application rows: ${appComp.rows.length}\n`);
  
  // Find EDGE
  console.log('=== LOOKING FOR EDGE ===\n');
  const edgeRows = appComp.rows.filter(row => {
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    return vals.name === 'EDGE';
  });
  
  console.log(`Found ${edgeRows.length} rows named EDGE`);
  edgeRows.forEach((row, idx) => {
    console.log(`\n[${idx}] EDGE row:`);
    console.log(`   Parent (Task): ${row.parentName}`);
    console.log(`   Parent Component: ${row.parentFactoryName || 'unknown'}`);
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    console.log(`   Fields: ${Object.keys(vals).join(', ')}`);
  });
  
  // Check if Task rows reference applications
  console.log('\n\n=== CHECKING TASK COMPONENT FOR APPLICATION REFERENCES ===\n');
  const taskComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'Task' }).lean();
  if (taskComp && taskComp.rows) {
    const allFields = new Set();
    taskComp.rows.forEach(row => {
      const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
      Object.keys(vals).forEach(k => allFields.add(k));
    });
    
    console.log('All fields in Task rows:');
    Array.from(allFields).forEach(f => console.log(`  - ${f}`));
    
    // Look for any Task row that references EDGE
    console.log('\n\nTask rows that reference EDGE:');
    let edgeTaskCount = 0;
    taskComp.rows.forEach(row => {
      const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
      if (JSON.stringify(vals).includes('EDGE')) {
        edgeTaskCount++;
        console.log(`\n[${edgeTaskCount}] Task: ${vals.name}`);
        console.log(`    Parent: ${row.parentName}`);
        console.log(`    Values: ${JSON.stringify(vals)}`);
      }
    });
    
    if (edgeTaskCount === 0) {
      console.log('None found');
    }
  }
  
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
