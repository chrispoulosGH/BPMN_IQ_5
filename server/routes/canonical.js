const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CanonicalComponent = require('../models/CanonicalComponent');
const CanonicalData = require('../models/CanonicalData');

const ALL_NEIGHBORHOODS_TOKEN = '__all__';

function escapeRegex(str){ return String(str || '').replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); }

function getCanonicalModel(req) {
  return String(req.query.domain || '').trim().toLowerCase() === 'data' ? CanonicalData : CanonicalComponent;
}

function isDataDomain(req) {
  return String(req.query.domain || '').trim().toLowerCase() === 'data';
}

function isAllDataNeighborhood(req, neighborhood) {
  return isDataDomain(req) && String(neighborhood || '').trim().toLowerCase() === ALL_NEIGHBORHOODS_TOKEN;
}

function getNeighborhoodFilter(req, neighborhood) {
  return isAllDataNeighborhood(req, neighborhood)
    ? {}
    : { neighborhoodName: { $regex: `^${escapeRegex(neighborhood)}$`, $options: 'i' } };
}

function getDataBatchCollections() {
  return ['dataBatches'];
}

function primaryKeyFromBatchRow(row) {
  if (!row) return null;
  if (row.primaryKey) return String(row.primaryKey);
  if (row.values && (row.values.name || row.values.Name)) return String(row.values.name || row.values.Name);
  if (row.name || row.Name) return String(row.name || row.Name);
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function batchRowToCanonicalRow(row, batch) {
  const values = row && row.values && typeof row.values === 'object' ? row.values : row;
  const primaryKey = primaryKeyFromBatchRow(row);
  return {
    primaryKey,
    values,
    neighborhoodName: batch.neighborhoodName,
    componentType: batch.componentType || batch.name,
  };
}

// GET /api/canonical/:neighborhood/:componentType/rows?page=1&limit=100&search=
router.get('/:neighborhood/:componentType/rows', async (req, res) => {
  try {
    const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
    const componentType = String(req.params.componentType || req.query.componentType || '').trim();
    const CanonicalModel = getCanonicalModel(req);
    if (!neighborhood || !componentType) return res.status(400).json({ error: 'neighborhood and componentType are required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    // Use case-insensitive exact match for neighborhood and componentType to be forgiving
    const filter = {
      ...getNeighborhoodFilter(req, neighborhood),
      componentType: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' },
    };
    // Optional search on primaryKey or values.*
    const search = String(req.query.search || '').trim();
    if (search) {
      // match primaryKey or any values property containing the search term (case-insensitive)
      const regex = new RegExp(search.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
      filter.$or = [ { primaryKey: regex }, { 'values': { $elemMatch: { $exists: true } } }, { 'values': { $regex: regex } } ];
    }

    const [total, docs] = await Promise.all([
      CanonicalModel.countDocuments(filter),
      CanonicalModel.find(filter).sort({ primaryKey: 1 }).skip(skip).limit(limit).lean(),
    ]);

    let rows = docs.map((d) => ({ primaryKey: d.primaryKey, values: d.values }));
    let effectiveTotal = total;

    if (isDataDomain(req) && !rows.length) {
      const batchDocs = [];
      for (const collectionName of getDataBatchCollections()) {
        const docsFromCollection = await mongoose.connection.db.collection(collectionName)
          .find({
            ...getNeighborhoodFilter(req, neighborhood),
            $or: [
              { componentType: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' } },
              { name: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' } },
            ],
          })
          .project({ rows: 1, componentType: 1, name: 1, neighborhoodName: 1 })
          .toArray();
        batchDocs.push(...docsFromCollection);
      }

      const flattenedRows = [];
      batchDocs.forEach((batch) => {
        (batch.rows || []).forEach((row) => {
          const canonicalRow = batchRowToCanonicalRow(row, batch);
          if (!canonicalRow.primaryKey) return;
          flattenedRows.push(canonicalRow);
        });
      });

      effectiveTotal = flattenedRows.length;
      rows = flattenedRows.slice(skip, skip + limit);
    }

    res.json({ neighborhood, componentType, page, limit, total: effectiveTotal, rows });
  } catch (err) {
    console.error('[CANONICAL] rows error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/canonical/:neighborhood/:componentType/children?parentKey=...&page=&limit=
router.get('/:neighborhood/:componentType/children', async (req, res) => {
  try {
    const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
    const componentType = String(req.params.componentType || req.query.componentType || '').trim();
    const CanonicalModel = getCanonicalModel(req);
    const parentKey = String(req.query.parentKey || '').trim();
    if (!neighborhood || !componentType || !parentKey) return res.status(400).json({ error: 'neighborhood, componentType and parentKey are required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const filter = {
      neighborhoodName: { $regex: `^${escapeRegex(neighborhood)}$`, $options: 'i' },
      parentKeys: parentKey,
    };
    const [total, docs] = await Promise.all([
      CanonicalModel.countDocuments(filter),
      CanonicalModel.find(filter).sort({ primaryKey: 1 }).skip(skip).limit(limit).lean(),
    ]);

    const rows = docs.map((d) => ({ primaryKey: d.primaryKey, values: d.values }));
    res.json({ neighborhood, componentType, parentKey, page, limit, total, rows });
  } catch (err) {
    console.error('[CANONICAL] children error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

    // GET /api/canonical/:neighborhood/types
    router.get('/:neighborhood/types', async (req, res) => {
      try {
        const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
        const CanonicalModel = getCanonicalModel(req);
        if (!neighborhood) return res.status(400).json({ error: 'neighborhood is required' });
        const canonicalTypes = await CanonicalModel.distinct('componentType', getNeighborhoodFilter(req, neighborhood));
        const types = new Set(canonicalTypes.filter(Boolean));
        if (isDataDomain(req)) {
          for (const collectionName of getDataBatchCollections()) {
            const batchTypes = await mongoose.connection.db.collection(collectionName)
              .distinct('componentType', getNeighborhoodFilter(req, neighborhood))
              .catch(() => []);
            batchTypes.filter(Boolean).forEach((type) => types.add(type));
            const batchNames = await mongoose.connection.db.collection(collectionName)
              .distinct('name', getNeighborhoodFilter(req, neighborhood))
              .catch(() => []);
            batchNames.filter(Boolean).forEach((type) => types.add(type));
          }
        }
        res.json({ neighborhood, types: Array.from(types) });
      } catch (err) {
        console.error('[CANONICAL] types error', err && err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/canonical/:neighborhood/:componentType/meta
    router.get('/:neighborhood/:componentType/meta', async (req, res) => {
      try {
        const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
        const componentType = String(req.params.componentType || req.query.componentType || '').trim();
        const CanonicalModel = getCanonicalModel(req);
        const dataDomain = isDataDomain(req);
        if (!neighborhood || !componentType) return res.status(400).json({ error: 'neighborhood and componentType are required' });

        const filter = {
          ...getNeighborhoodFilter(req, neighborhood),
          componentType: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' },
        };

        let total = await CanonicalModel.countDocuments(filter);
        let sample = await CanonicalModel.find(filter).sort({ primaryKey: 1 }).limit(10).lean();

        const columnsSet = new Set();
        sample.forEach((s) => {
          if (s.values && typeof s.values === 'object') Object.keys(s.values).forEach((k) => columnsSet.add(k));
        });

        const db = mongoose.connection.db;
        const batchCollectionNames = dataDomain ? getDataBatchCollections() : ['dataComponentBatches'];
        let batchDocs = [];
        for (const collectionName of batchCollectionNames) {
          const docsFromCollection = await db.collection(collectionName)
            .find({
              ...getNeighborhoodFilter(req, neighborhood),
              $or: [
                { componentType: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' } },
                { name: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' } },
              ],
            })
            .project({ foreignKeyColumns: 1, rows: 1, componentType: 1, name: 1, neighborhoodName: 1 })
            .toArray();
          batchDocs.push(...docsFromCollection);
        }

        if (isDataDomain(req) && !sample.length) {
          const flattenedRows = [];
          batchDocs.forEach((batch) => {
            (batch.rows || []).forEach((row) => {
              const canonicalRow = batchRowToCanonicalRow(row, batch);
              if (!canonicalRow.primaryKey) return;
              flattenedRows.push(canonicalRow);
            });
          });
          total = flattenedRows.length;
          sample = flattenedRows.slice(0, 10).map((row) => ({ values: row.values }));
        }

        const fkByField = new Map();
        batchDocs.forEach((doc) => {
          (doc.foreignKeyColumns || []).forEach((fk) => {
            const key = String(fk.fieldName || fk.sourceColumnName || fk.name || '').trim().toLowerCase();
            if (!key || fkByField.has(key)) return;
            fkByField.set(key, fk);
          });
        });
        const foreignKeyColumns = Array.from(fkByField.values());

        res.json({ neighborhood, componentType, total, sampleCount: sample.length, columns: Array.from(columnsSet), foreignKeyColumns, sample });
      } catch (err) {
        console.error('[CANONICAL] meta error', err && err.message);
        res.status(500).json({ error: err.message });
      }
    });

module.exports = router;
