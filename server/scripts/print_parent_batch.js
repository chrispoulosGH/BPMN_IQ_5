require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const neigh = process.argv[2] || 'CTX';
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    const db = mongoose.connection.db;
    // find a batch where parentFactoryName is set OR a row has parentName
    const batch = await db.collection('dataComponentBatches').findOne({ neighborhoodName: neigh, parentFactoryName: { $ne: '' } });
    if (batch) {
      console.log('=== Batch with parentFactoryName ===');
      console.log('name:', batch.name, '| componentType:', batch.componentType, '| parentFactoryName:', batch.parentFactoryName);
      console.log('sample rows:');
      (batch.rows || []).slice(0, 5).forEach((r, i) => {
        console.log(`  [${i}] name=${r.values?.name} parentName=${JSON.stringify(r.parentName)} parentFactoryName=${JSON.stringify(r.parentFactoryName)}`);
      });
    } else {
      console.log('No batch with parentFactoryName found');
    }
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
