const mongoose = require('mongoose');
const Component = require('../models/Component');

async function populateComponentsFromBatches({ neighborhoodName, batchSize = 100 } = {}) {
  if (mongoose.connection.readyState === 0) {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  }

  const db = mongoose.connection.db;
  const batches = db.collection('dataComponentBatches');

  const query = {};
  if (neighborhoodName) query.neighborhoodName = neighborhoodName;

  // Get distinct component names for this neighborhood
  const compNames = await batches.distinct('name', query);
  let created = 0;

  const MAX_ROWS_PER_DOC = parseInt(process.env.MAX_ROWS_PER_COMPONENT || '500', 10);
  for (const name of compNames) {
    // Fetch all batch docs for this component name
    const docs = await batches.find({ ...(query), name }).toArray();
    if (!Array.isArray(docs) || docs.length === 0) continue;

    // Merge columns and rows
    const columnsSet = new Set();
    const rows = [];
    for (const d of docs) {
      const batchRows = Array.isArray(d.rows) ? d.rows : [];
      for (let i = 0; i < batchRows.length; i++) {
        const r = batchRows[i];
        const values = r && r.values && typeof r.values === 'object' ? { ...r.values } : (typeof r === 'object' ? { ...r } : {});
        Object.keys(values).forEach((k) => columnsSet.add(k));
        // Respect maximum rows per document to avoid exceeding BSON limits
        if (rows.length < MAX_ROWS_PER_DOC) {
          rows.push({ values, owner: r.owner || '', state: r.state || 'staged', sourcedFrom: r.sourcedFrom || '', createdBy: r.createdBy || '', updatedBy: r.updatedBy || '' });
        }
      }
    }

    const columns = Array.from(columnsSet);

    const componentDoc = {
      neighborhoodName: neighborhoodName || (docs[0] && docs[0].neighborhoodName) || '',
      modelName: neighborhoodName || (docs[0] && docs[0].neighborhoodName) || '',
      name: name,
      sourceColumnName: docs[0]?.sourceColumnName || '',
      parentFactoryName: docs[0]?.parentFactoryName || '',
      componentType: docs[0]?.componentType || '',
      columns,
      qualifierColumns: docs[0]?.qualifierColumns || [],
      foreignKeyColumns: docs[0]?.foreignKeyColumns || [],
      owner: docs[0]?.owner || '',
      createdBy: docs[0]?.createdBy || 'system',
      sourceFileName: docs[0]?.sourceFileName || '',
      rows,
    };

    // Upsert into components collection (rows may be capped to avoid huge documents)
    try {
      await Component.replaceOne({ neighborhoodName: componentDoc.neighborhoodName, name: componentDoc.name }, componentDoc, { upsert: true });
      created++;
    } catch (err) {
      console.error('[POPULATE_COMPONENTS] Failed to upsert', componentDoc.name, err && err.message);
    }
  }

  return { createdComponents: created, compNames: compNames.length };
}

module.exports = { populateComponentsFromBatches };
