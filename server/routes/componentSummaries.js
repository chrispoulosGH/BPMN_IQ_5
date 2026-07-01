const express = require('express');
const router = express.Router();
const ComponentSummary = require('../models/ComponentSummary');

// GET /api/component-summaries - list summaries
router.get('/', async (req, res) => {
  try {
    const { neighborhoodName, primaryKey, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (neighborhoodName) filter.neighborhoodName = neighborhoodName;
    if (primaryKey) filter.primaryKey = primaryKey;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const [rows, total] = await Promise.all([
      ComponentSummary.find(filter).skip(skip).limit(parseInt(limit, 10)).lean().exec(),
      ComponentSummary.countDocuments(filter).exec(),
    ]);
    res.json({ total, page: parseInt(page, 10), limit: parseInt(limit, 10), rows });
  } catch (err) {
    console.error('[componentSummaries:list]', err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

// GET /api/component-summaries/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await ComponentSummary.findById(req.params.id).lean().exec();
    if (!doc) return res.status(404).json({ error: 'not_found' });
    res.json(doc);
  } catch (err) {
    console.error('[componentSummaries:get]', err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

module.exports = router;
