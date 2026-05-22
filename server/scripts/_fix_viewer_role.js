const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const r = await mongoose.connection.collection('users').updateOne(
    { userId: 'Viewer' },
    { $set: { role: 'Viewer' } }
  );
  console.log('Updated:', r.modifiedCount);
  await mongoose.disconnect();
})();
