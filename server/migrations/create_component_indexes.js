const mongoose = require('mongoose');
const Component = require('../models/CanonicalComponent');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yourDbName';

async function run() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to', MONGO_URI);
  try {
    // Ensures indexes declared in the schema are created
    await Component.init();
    console.log('Component indexes created/ensured');
  } catch (err) {
    console.error('Error creating indexes', err);
    process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
