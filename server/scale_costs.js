const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const db = mongoose.connection;
  const diag = await db.collection('diagrams').findOne({ name: 'My_TechFast' });
  const appNames = [...new Set(diag.tasks.flatMap(t => (t.applications||[]).map(a => typeof a==='string'?a:a.name)))];
  const apps = await db.collection('applications').find({ name: { $in: appNames } }).toArray();
  let updated = 0;
  for (const app of apps) {
    const oC  = (app.operationCosts||[]).map(r   => ({ year: r.year, cost: Math.round(r.cost/10) }));
    const dC  = (app.developmentCosts||[]).map(r  => ({ year: r.year, cost: Math.round(r.cost/10) }));
    const aTC = (app.annualTotalCosts||[]).map(r  => ({
      year: r.year,
      operationCost:   Math.round(r.operationCost/10),
      developmentCost: Math.round(r.developmentCost/10),
      totalCost:       Math.round(r.totalCost/10),
    }));
    await db.collection('applications').updateOne(
      { _id: app._id },
      { $set: { operationCosts: oC, developmentCosts: dC, annualTotalCosts: aTC } }
    );
    updated++;
  }
  console.log('Updated', updated, 'apps — all costs divided by 10');
  await mongoose.disconnect();
})();
