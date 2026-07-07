const express = require('express');
const router = express.Router();
const { materializeFromBatches } = require('../lib/materializer');

// POST /api/materialize?neighborhoodName=CTX
router.post('/', async (req, res) => {
  try {
    const { neighborhoodName, domain } = req.query;
    const result = await materializeFromBatches({ neighborhoodName, domain: String(domain || '').trim().toLowerCase() === 'data' ? 'data' : 'component' });
    // Post-process: rebuild component search index for neighborhood
    try {
      await materializeFromBatches.postProcess({ neighborhoodName, domain: String(domain || '').trim().toLowerCase() === 'data' ? 'data' : 'component' });
    } catch (err) {
      console.error('[MATERIALIZE ROUTE] postProcess failed', err && err.message);
    }
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[materialize]', err);
    res.status(500).json({ error: 'internal_error', details: err.message });
  }
});

module.exports = router;
