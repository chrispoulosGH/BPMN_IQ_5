const express = require('express');
const router = express.Router();
const Component = require('../models/CanonicalComponent');
const { buildComponentSummary } = require('../lib/buildComponentSummary');

// GET /api/components - list with optional filters
router.get('/', async (req, res) => {
  try {
    const { neighborhoodName, componentType, q, page = 1, limit = 50, projection } = req.query;
    const filter = {};
    if (neighborhoodName) filter.neighborhoodName = neighborhoodName;
    if (componentType) filter.componentType = componentType;
    if (q) {
      // simple text search against primaryKey and values.name
      filter.$or = [
        { primaryKey: new RegExp(q, 'i') },
        { 'values.name': new RegExp(q, 'i') },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const proj = projection ? JSON.parse(projection) : { primaryKey: 1, componentType: 1, values: 1 };

    const [rows, total] = await Promise.all([
      Component.find(filter).select(proj).skip(skip).limit(parseInt(limit, 10)).lean().exec(),
      Component.countDocuments(filter).exec(),
    ]);

    // Trigger background build of component summaries for this neighborhood when listing components.
    if (neighborhoodName) {
      // fire-and-forget; builder handles its own DB connections
      buildComponentSummary({ neighborhoodName }).then(r => console.log('[buildComponentSummary] processed', r.processed)).catch(err => console.error('[buildComponentSummary]', err));
    }

    res.json({ total, page: parseInt(page, 10), limit: parseInt(limit, 10), rows });
  } catch (err) {
    console.error('[components:list]', err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// GET /api/components/byKey - get by primaryKey + neighborhood
router.get('/byKey', async (req, res) => {
  try {
    const { neighborhoodName, primaryKey } = req.query;
    if (!neighborhoodName || !primaryKey) return res.status(400).json({ error: 'missing_params' });
    const doc = await Component.findOne({ neighborhoodName, primaryKey }).lean().exec();
    if (!doc) return res.status(404).json({ error: 'not_found' });
    res.json(doc);
  } catch (err) {
    console.error('[components:byKey]', err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// GET /api/components/:id - detail
router.get('/:id', async (req, res) => {
  try {
    const doc = await Component.findById(req.params.id).lean().exec();
    if (!doc) return res.status(404).json({ error: 'not_found' });
    res.json(doc);
  } catch (err) {
    console.error('[components:get]', err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

module.exports = router;
