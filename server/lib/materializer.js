const mongoose = require('mongoose');
const CanonicalComponent = require('../models/CanonicalComponent');
const { populateComponentsFromBatches } = require('./populateComponentsFromBatches');
const { resolveParentRefs } = require('./resolveParentRefs');
const { rebuildSearchIndex } = require('../utils/searchIndexBuilder');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

function primaryKeyFromRow(row) {
  if (!row) return null;
  // Support multiple possible shapes: { values: { name } } or { name }
  if (row.values && (row.values.name || row.values.Name)) return row.values.name || row.values.Name;
  if (row.name || row.Name) return row.name || row.Name;
  // fallback to first string-ish field
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function componentTypeFromRow(row, batch) {
  if (!row && !batch) return 'unknown';
  if (row && (row.componentType || row.component_type)) return row.componentType || row.component_type;
  if (batch && batch.componentType) return batch.componentType;
  if (row && row.values && (row.values.componentType || row.values.component_type)) return row.values.componentType || row.values.component_type;
  return 'unknown';
}

async function materializeFromBatches({ neighborhoodName, batchIds = null, batchSize = 500 } = {}) {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  }

  const db = mongoose.connection.db;
  const query = {};
  if (neighborhoodName) query.neighborhoodName = neighborhoodName;
  if (Array.isArray(batchIds) && batchIds.length) query._id = { $in: batchIds.map(id => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)) };

  const cursor = db.collection('dataComponentBatches').find(query).batchSize(batchSize);
  let totalProcessed = 0;
  while (await cursor.hasNext()) {
    const batch = await cursor.next();
    if (!batch || !Array.isArray(batch.rows)) continue;

    const ops = [];
    for (let i = 0; i < batch.rows.length; i++) {
      const row = batch.rows[i];
      const primaryKey = primaryKeyFromRow(row);
      const componentType = componentTypeFromRow(row, batch);
      if (!primaryKey) continue;

      const filter = { neighborhoodName: batch.neighborhoodName || neighborhoodName || '', componentType, primaryKey };
      const update = {
        $set: { values: (row.values && Object.assign({}, row.values)) || row, neighborhoodName: batch.neighborhoodName || neighborhoodName || '', componentType, primaryKey },
        $addToSet: { sourceBatches: { batchId: String(batch._id), rowIndex: i } },
      };
      ops.push({ updateOne: { filter, update, upsert: true } });
    }

    if (ops.length) {
      // execute bulk in chunks to avoid very large ops
      const chunkSize = 500;
      for (let i = 0; i < ops.length; i += chunkSize) {
        const chunk = ops.slice(i, i + chunkSize);
        await CanonicalComponent.bulkWrite(chunk, { ordered: false });
      }
      totalProcessed += ops.length;
    }
  }

  const result = { processed: totalProcessed };

  // Automatically run postProcess (rebuild ComponentSearchIndex) when neighborhoodName provided
  try {
    await materializeFromBatches.postProcess({ neighborhoodName });
  } catch (err) {
    console.error('[MATERIALIZER] automatic postProcess failed:', err && err.message);
  }

  return result;
}

// After materialization, if neighborhoodName provided, rebuild the ComponentSearchIndex
// so the Component Model search index is ready when load completes.
materializeFromBatches.postProcess = async function({ neighborhoodName } = {}) {
  if (!neighborhoodName) return;
  try {
    console.log('[MATERIALIZER] Post-process: populating legacy Component docs for', neighborhoodName);
    // Populate legacy `components` collection from canonical so the search index builder has source data
    try {
      await populateComponentsFromBatches({ neighborhoodName });
      console.log('[MATERIALIZER] Post-process: legacy Component docs populated for', neighborhoodName);
    } catch (err) {
      console.error('[MATERIALIZER] Post-process populateComponentsFromBatches failed:', err && err.message);
    }

    // Resolve parent/child relationships on canonical docs BEFORE rebuilding the index,
    // so the index builder can walk parentRefs to produce full lineage paths.
    try {
      console.log('[MATERIALIZER] Post-process: resolving parentRefs on canonical docs for', neighborhoodName);
      const refResult = await resolveParentRefs({ neighborhoodName });
      console.log('[MATERIALIZER] Post-process: parentRefs resolved for', neighborhoodName, refResult);
    } catch (err) {
      console.error('[MATERIALIZER] Post-process resolveParentRefs failed:', err && err.message);
    }

    console.log('[MATERIALIZER] Post-process: rebuilding ComponentSearchIndex for', neighborhoodName);
    await rebuildSearchIndex(neighborhoodName);
    console.log('[MATERIALIZER] Post-process: ComponentSearchIndex rebuilt for', neighborhoodName);
  } catch (err) {
    console.error('[MATERIALIZER] Post-process rebuildSearchIndex failed:', err && err.message);
  }
};

module.exports = { materializeFromBatches };

// After materialization completes, also populate legacy `components` collection
// when called directly via scripts or routes. This helper is invoked by callers
// of materializeFromBatches when they want the legacy view to be available.
materializeFromBatches.populateLegacyComponents = async function(opts) {
  try {
    const neighborhoodName = opts && opts.neighborhoodName;
    const r = await populateComponentsFromBatches({ neighborhoodName });
    return r;
  } catch (err) {
    console.error('[MATERIALIZER] populateLegacyComponents failed', err && err.message);
    throw err;
  }
};
