require('dotenv').config();
const mongoose = require('mongoose');
const ComponentSearchIndex = require('../models/ComponentSearchIndex');

async function main() {
  const neigh = process.argv[2] || 'CTX';
  const term = process.argv[3] || 'Substitution';
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI);
  try {
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    const searchRegex = escapeRegExp(term);
    const isWordOnly = /^\w+$/.test(term);
    const searchPattern = isWordOnly ? `\\b${searchRegex}\\b` : searchRegex;
    const findQuery = { neighborhoodName: neigh, searchableTextLower: { $regex: searchPattern, $options: 'i' } };
    console.log('findQuery:', JSON.stringify(findQuery));
    const rows = await ComponentSearchIndex.find(findQuery).lean();
    console.log('matched index entries:', rows.length);
    let totalPaths = 0;
    rows.slice(0, 3).forEach(r => {
      console.log('---');
      console.log('rowName:', r.rowName, '| componentName:', r.componentName);
      console.log('cachedLineagePaths count:', (r.cachedLineagePaths || []).length);
      console.log('cachedHierarchies count:', (r.cachedHierarchies || []).length);
      (r.cachedLineagePaths || []).slice(0, 3).forEach(p => console.log('   path:', p));
    });
    rows.forEach(r => { totalPaths += (r.cachedHierarchies || r.cachedLineagePaths || []).length; });
    console.log('total expanded result rows would be:', totalPaths);
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

main();
