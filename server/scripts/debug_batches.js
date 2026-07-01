const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

(async function main(){
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const batches = db.collection('dataComponentBatches');

    const neighborhoods = await batches.distinct('neighborhoodName');
    const output = [];
    for (const n of neighborhoods) {
      const total = await batches.countDocuments({ neighborhoodName: n });
      const compNames = await batches.distinct('name', { neighborhoodName: n });
      output.push({ neighborhood: n, batchCount: total, distinctComponentNames: compNames.length, sampleComponentNames: compNames.slice(0,50) });
    }

    console.log(JSON.stringify({ neighborhoods: output }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();
