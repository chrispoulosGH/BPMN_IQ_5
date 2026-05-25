const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq').then(async () => {
  const db = mongoose.connection;
  const bf = await db.collection('businessflows').findOne({ name: 'TechFast' });
  console.log('BusinessFlow keys:', Object.keys(bf));
  console.log('Task count:', bf.tasks?.length);
  const totalApps = bf.tasks?.reduce((s, t) => s + t.applications.length, 0);
  console.log('Total app references:', totalApps);
  // Show one task with costs
  const sampleTask = bf.tasks?.find(t => t.applications.length > 0);
  if (sampleTask) {
    console.log('\nSample task:', sampleTask.name);
    console.log('App:', sampleTask.applications[0].name);
    console.log('First cost entry:', JSON.stringify(sampleTask.applications[0].annualCosts[0]));
    console.log('Last cost entry:', JSON.stringify(sampleTask.applications[0].annualCosts.at(-1)));
  }
  // Confirm apps no longer have cost field
  const appsWithCosts = await db.collection('applications').countDocuments({ annualTotalCosts: { $exists: true } });
  console.log('\nApplications still with annualTotalCosts:', appsWithCosts, '(should be 0)');
  mongoose.disconnect();
});
