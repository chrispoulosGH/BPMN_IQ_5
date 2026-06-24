const mongoose = require('mongoose');
const Model = require('./models/Model');

async function main(){
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const model = await Model.findOne({ name: 'LBGUPS' }).lean();
  if (!model) { console.error('Model LBGUPS not found'); process.exit(1); }
  console.log('modelCatalogColumns (count):', (model.modelCatalogColumns || []).length);
  console.log(model.modelCatalogColumns);
  console.log('\nSample modelCatalogRows (first 10 tuples for candidate headers):');

  // Candidate headers: find headers that include L0 or L1 or 'L0 Component' etc
  const candidates = (model.modelCatalogColumns || []).filter(h => /l0|l1/i.test(String(h)));
  console.log('candidate headers:', candidates);

  for (let i=0;i<Math.min(10,(model.modelCatalogRows||[]).length);i++){
    const row = model.modelCatalogRows[i];
    const values = {};
    candidates.forEach(c => values[c]= row.values?.[c] || '');
    console.log('row', i+1, values);
  }
  console.log('\nTotal model rows:', (model.modelCatalogRows || []).length);
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
