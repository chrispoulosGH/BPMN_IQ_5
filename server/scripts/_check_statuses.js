const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const col = mongoose.connection.collection('diagrams');
  const total = await col.countDocuments({});
  const published = await col.countDocuments({ status: 'published' });
  console.log('Published:', published, '/ Total:', total);
  const statuses = await col.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
  console.log('Status breakdown:', JSON.stringify(statuses));
  await mongoose.disconnect();
})();
