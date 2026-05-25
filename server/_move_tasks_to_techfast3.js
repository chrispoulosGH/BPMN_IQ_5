const mongoose = require('mongoose');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const db = mongoose.connection;
  const col = db.collection('businessflows');

  const techfast = await col.findOne({ name: 'TechFast' });
  if (!techfast) { console.error('TechFast not found'); process.exit(1); }

  const tasks = techfast.tasks || [];
  console.log(`TechFast has ${tasks.length} tasks`);

  // Upsert TechFast_3 with tasks moved from TechFast
  const result = await col.findOneAndUpdate(
    { name: 'TechFast_3' },
    { $set: { tasks } },
    { upsert: true, returnDocument: 'after' }
  );
  console.log(`TechFast_3 updated — tasks: ${result.tasks?.length ?? 0}`);

  // Clear tasks from TechFast
  await col.updateOne({ name: 'TechFast' }, { $set: { tasks: [] } });
  console.log('TechFast tasks cleared');

  await mongoose.disconnect();
})();
