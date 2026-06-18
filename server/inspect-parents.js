require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  
  // Find a Task that's a parent of EDGE
  const taskComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'Task' }).lean();
  
  if (!taskComp) {
    console.log('No Task component found');
    mongoose.connection.close();
    return;
  }
  
  console.log('=== TASK COMPONENT METADATA ===');
  console.log(`Name: ${taskComp.name}`);
  console.log(`Parent factory: ${taskComp.parentFactoryName}`);
  console.log(`Total rows: ${(taskComp.rows || []).length}\n`);
  
  // Look for tasks that should be parents of EDGE
  const targetTasks = [
    'Select Job / View Comments',
    'Arrive on Prem / Update Job',
    'Mark Job Complete',
    'Review Jobs',
    'Review Order w/Customer',
    'Create Appointment',
    'View Job (Technician)',
    'Close Job'
  ];
  
  console.log('=== CHECKING TARGET TASK ROWS ===\n');
  
  targetTasks.forEach(taskName => {
    const taskRow = taskComp.rows?.find(r => {
      const vals = r.values instanceof Map ? Object.fromEntries(r.values.entries()) : r.values;
      return vals.name === taskName;
    });
    
    if (taskRow) {
      console.log(`Task: ${taskName}`);
      console.log(`  Parent name: ${taskRow.parentName}`);
      console.log(`  Parent factory: ${taskRow.parentFactoryName}`);
      console.log();
    } else {
      console.log(`Task NOT FOUND: ${taskName}`);
    }
  });
  
  // Now check if business_flow exists and its parent
  const bfComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'business_flow' }).lean();
  
  if (bfComp) {
    console.log('\n=== BUSINESS_FLOW COMPONENT METADATA ===');
    console.log(`Name: ${bfComp.name}`);
    console.log(`Parent factory: ${bfComp.parentFactoryName}`);
    
    // Find a business flow that could be parent of a task
    const bfRow = bfComp.rows?.find(r => {
      const vals = r.values instanceof Map ? Object.fromEntries(r.values.entries()) : r.values;
      return vals.name === 'Expert Path Repair';
    });
    
    if (bfRow) {
      console.log(`\nBusiness Flow: Expert Path Repair`);
      console.log(`  Parent name: ${bfRow.parentName}`);
      console.log(`  Parent factory: ${bfRow.parentFactoryName}`);
    }
  }
  
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
