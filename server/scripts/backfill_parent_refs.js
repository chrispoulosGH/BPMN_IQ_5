require('dotenv').config();
const mongoose = require('mongoose');
const { resolveParentRefs } = require('../lib/resolveParentRefs');

async function main() {
  const neigh = process.argv[2];
  if (!neigh) {
    console.error('Usage: node backfill_parent_refs.js <NEIGHBORHOOD>');
    process.exit(2);
  }
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    const result = await resolveParentRefs({ neighborhoodName: neigh });
    console.log('Backfill result:', result);
  } catch (err) {
    console.error('Backfill error:', err);
  } finally {
    mongoose.connection.close();
  }
}

main();
