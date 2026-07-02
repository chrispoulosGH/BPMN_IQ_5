require('dotenv').config();
const mongoose = require('mongoose');
const CanonicalComponent = require('../models/CanonicalComponent');

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node print_canonical.js <id>');
    process.exit(2);
  }
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    const doc = await CanonicalComponent.findById(id).lean();
    console.log(JSON.stringify(doc, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
