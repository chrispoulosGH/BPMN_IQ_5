require('dotenv').config();
const mongoose = require('mongoose');
const CanonicalComponent = require('../models/CanonicalComponent');

async function buildHierarchyPaths(doc, canonicalById, visited = new Set()) {
  if (!doc) return [];
  const id = String(doc._id);
  if (visited.has(id)) return [[{ componentName: doc.componentType || doc.component_type || 'unknown', componentId: id, rowName: (doc.values && (doc.values.name || doc.primaryKey)) || doc.primaryKey || id, rowId: id }]];

  // Prepare node
  const node = {
    componentName: doc.componentType || doc.component_type || 'unknown',
    componentId: id,
    rowName: (doc.values && (doc.values.name || doc.primaryKey)) || doc.primaryKey || id,
    rowId: id,
  };

  // If no parentRefs, try parentKeys/parentName fallback
  const parentRefs = Array.isArray(doc.parentRefs) && doc.parentRefs.length > 0 ? doc.parentRefs.map(String) : [];
  if (parentRefs.length === 0) {
    return [[node]];
  }

  const paths = [];
  visited.add(id);
  for (const pref of parentRefs) {
    const parent = canonicalById.get(String(pref));
    if (!parent) {
      paths.push([node]);
      continue;
    }
    const parentPaths = await buildHierarchyPaths(parent, canonicalById, new Set(visited));
    for (const pp of parentPaths) {
      paths.push([...pp, node]);
    }
  }
  return paths;
}

async function main() {
  const idArg = process.argv[2];
  if (!idArg) {
    console.error('Usage: node inspect_lineage.js <canonicalObjectId>');
    process.exit(2);
  }

  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const rows = await CanonicalComponent.find({}).lean();
    const canonicalById = new Map(rows.map(r => [String(r._id), r]));
    const doc = canonicalById.get(idArg) || await CanonicalComponent.findById(idArg).lean();
    if (!doc) {
      console.error('Canonical doc not found for id', idArg);
      process.exit(1);
    }

    const hierarchies = await buildHierarchyPaths(doc, canonicalById);
    console.log(JSON.stringify({ id: idArg, hierarchies }, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.connection.close();
  }
}

main();
