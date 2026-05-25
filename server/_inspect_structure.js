const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq').then(async () => {
  const db = mongoose.connection;

  // Check businessflow structure
  const bf = await db.collection('businessflows').findOne({ name: 'TechFast' });
  console.log('=== BusinessFlow doc keys:', bf ? Object.keys(bf) : 'NOT FOUND');
  if (bf) console.log(JSON.stringify(bf, null, 2).substring(0, 500));

  console.log('\n=== Task sample (TechFast):');
  const task = await db.collection('tasks').findOne({ businessFlow: 'TechFast' });
  if (task) console.log(JSON.stringify(task, null, 2).substring(0, 400));

  console.log('\n=== All TechFast tasks with apps:');
  const tasks = await db.collection('tasks').find({ businessFlow: 'TechFast' }, { projection: { name: 1, applications: 1, _id: 0 } }).toArray();
  tasks.forEach(t => console.log(t.name, '->', JSON.stringify(t.applications)));

  console.log('\n=== App cost sample (Avertack):');
  const app = await db.collection('applications').findOne({ name: 'Avertack' }, { projection: { name: 1, annualTotalCosts: 1, _id: 0 } });
  if (app) console.log(JSON.stringify(app.annualTotalCosts?.[0]));

  mongoose.disconnect();
});
