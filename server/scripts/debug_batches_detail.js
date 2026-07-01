const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
(async function(){
  try{
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const batches = db.collection('dataComponentBatches');
    const neighborhood = process.argv[2] || 'CTX';
    const compNames = await batches.distinct('name', { neighborhoodName: neighborhood });
    const details = [];
    for(const name of compNames){
      const docs = await batches.find({ neighborhoodName: neighborhood, name }).project({ rows: 1 }).toArray();
      let rowCount = 0;
      docs.forEach(d=>{ if (Array.isArray(d.rows)) rowCount+=d.rows.length; });
      details.push({ name, batchDocs: docs.length, totalRows: rowCount });
    }
    console.log(JSON.stringify({ neighborhood, components: details }, null, 2));
    process.exit(0);
  }catch(e){ console.error('ERROR', e); process.exit(1); }
})();
