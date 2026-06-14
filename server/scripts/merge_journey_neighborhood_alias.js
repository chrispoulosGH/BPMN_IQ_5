'use strict';

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
const from = process.argv[2] || 'AT&T Journey';
const to = process.argv[3] || 'ATT Journey Model';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const beforeFrom = await db.collection('diagrams').countDocuments({ neighborhoodName: from });
  const beforeTo = await db.collection('diagrams').countDocuments({ neighborhoodName: to });

  const result = await db.collection('diagrams').updateMany(
    { neighborhoodName: from },
    { $set: { neighborhoodName: to } }
  );

  const afterFrom = await db.collection('diagrams').countDocuments({ neighborhoodName: from });
  const afterTo = await db.collection('diagrams').countDocuments({ neighborhoodName: to });

  console.log(JSON.stringify({
    from,
    to,
    beforeFrom,
    beforeTo,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    afterFrom,
    afterTo,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
