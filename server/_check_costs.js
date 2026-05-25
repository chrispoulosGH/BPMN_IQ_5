const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq').then(async () => {
  const col = mongoose.connection.collection('applications');
  const total = await col.countDocuments();
  const withCosts = await col.countDocuments({ annualTotalCosts: { $exists: true, $ne: null } });
  const withCostsArr = await col.countDocuments({ annualTotalCosts: { $exists: true, $type: 'array', $not: { $size: 0 } } });
  console.log('Total apps:', total);
  console.log('With annualTotalCosts (non-null):', withCosts);
  console.log('With annualTotalCosts (non-empty array):', withCostsArr);
  const sample = await col.find(
    { annualTotalCosts: { $exists: true, $ne: null } },
    { projection: { name: 1, annualTotalCosts: 1, _id: 0 } }
  ).limit(3).toArray();
  if (sample.length) {
    sample.forEach(a => {
      console.log('\n---', a.name);
      console.log(JSON.stringify(a.annualTotalCosts, null, 2).substring(0, 300));
    });
  } else {
    // Check what fields apps actually have
    const oneApp = await col.findOne({}, { projection: { name: 1, _id: 0 } });
    const keys = await col.findOne({});
    console.log('No cost data found. Sample app fields:', Object.keys(keys || {}).join(', '));
  }
  mongoose.disconnect();
});
