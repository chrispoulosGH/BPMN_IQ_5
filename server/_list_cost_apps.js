const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq').then(async () => {
  const col = mongoose.connection.collection('applications');
  const apps = await col.find(
    { annualTotalCosts: { $exists: true, $ne: null } },
    { projection: { name: 1, _id: 0 } }
  ).sort({ name: 1 }).toArray();
  apps.forEach((a, i) => console.log(`${i+1}. ${a.name}`));
  mongoose.disconnect();
});
