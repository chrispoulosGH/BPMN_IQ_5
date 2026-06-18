require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq').then(async () => {
  const Component = require('./models/Component');
  const appComp = await Component.findOne({ neighborhoodName: 'ATT Journey Model', name: 'application' }).lean();
  
  if (!appComp || !appComp.rows) {
    console.log('No application component');
    mongoose.connection.close();
    return;
  }
  
  console.log('=== ALL APPLICATIONS AND THEIR PARENT TASKS ===\n');
  
  appComp.rows.forEach(row => {
    const vals = row.values instanceof Map ? Object.fromEntries(row.values.entries()) : row.values;
    const parentNames = row.parentName ? row.parentName.split('|').map(p => p.trim()) : [];
    
    console.log(`Application: ${vals.name}`);
    console.log(`  Parent tasks (${parentNames.length}): ${parentNames.join(', ')}`);
    console.log();
  });
  
  mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
