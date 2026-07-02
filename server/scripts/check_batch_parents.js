require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const neigh = process.argv[2] || '';
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    const db = mongoose.connection.db;
    const match = neigh ? { neighborhoodName: neigh } : {};
    const batches = await db.collection('dataComponentBatches').find(match).toArray();
    let rowsWithParentName = 0;
    let batchesWithParentFactory = 0;
    for (const b of batches) {
      if (b.parentFactoryName) batchesWithParentFactory++;
      const rows = Array.isArray(b.rows) ? b.rows : [];
      for (const r of rows) {
        if ((r.parentName && String(r.parentName).trim() !== '') || (r.parentFactoryName && String(r.parentFactoryName).trim() !== '')) rowsWithParentName++;
      }
    }
    console.log({ batches: batches.length, batchesWithParentFactory, rowsWithParentName });
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
