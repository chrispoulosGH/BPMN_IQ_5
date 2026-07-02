require('dotenv').config();
const mongoose = require('mongoose');
const CanonicalComponent = require('../models/CanonicalComponent');

async function main() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    const withParentRefs = await CanonicalComponent.countDocuments({ parentRefs: { $exists: true, $ne: [] } });
    const withParentKeys = await CanonicalComponent.countDocuments({ parentKeys: { $exists: true, $ne: [] } });
    const withValuesParentName = await CanonicalComponent.countDocuments({ 'values.parentName': { $exists: true, $ne: '' } });
    console.log({ withParentRefs, withParentKeys, withValuesParentName });
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
