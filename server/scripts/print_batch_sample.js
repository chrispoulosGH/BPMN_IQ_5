require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const neigh = process.argv[2] || 'CTX';
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    const db = mongoose.connection.db;
    const doc = await db.collection('dataComponentBatches').findOne({ neighborhoodName: neigh });
    console.log(JSON.stringify(doc, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
