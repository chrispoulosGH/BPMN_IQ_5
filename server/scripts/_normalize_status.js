const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const col = mongoose.connection.collection('diagrams');
  const r = await col.updateMany(
    { status: { $regex: /[A-Z]/ } },
    [{ $set: { status: { $toLower: '$status' } } }]
  );
  console.log('Normalized', r.modifiedCount, 'diagram statuses to lowercase');
  await mongoose.disconnect();
})();
