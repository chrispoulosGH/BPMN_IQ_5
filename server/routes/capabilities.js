const express = require('express');
const router = express.Router();
const Capability = require('../models/Capability');
const { matchCapabilities } = require('../services/capabilityMatcher');
const { getNeighborhoodName, buildNeighborhoodFilter, withNeighborhood } = require('../utils/neighborhoodScope');

// GET /api/capabilities — list all (paginated, lightweight fields)
router.get('/', async (req, res) => {
  try {
    const { domain, aspect, limit = 50, skip = 0 } = req.query;
    const extraFilter = {};
    if (domain) extraFilter.domainName = new RegExp(domain, 'i');
    if (aspect) extraFilter.aspect = new RegExp(aspect, 'i');
    const filter = withNeighborhood(req, extraFilter);

    const capabilities = await Capability.find(filter, {
      capabilityId: 1,
      name: 1,
      domainName: 1,
      aspect: 1,
      domainIndependentName: 1,
      briefDescription: 1,
      tmfStatus: 1,
    })
      .sort({ aspectOrder: 1, domainOrder: 1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const total = await Capability.countDocuments(filter);
    res.json({ total, capabilities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/capabilities/search?q=term — full-text search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }
  try {
    const results = await Capability.find(
      withNeighborhood(req, { $text: { $search: q.trim() } }),
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(50);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/capabilities/domains — list distinct domains
router.get('/domains', async (req, res) => {
  try {
    const domains = await Capability.distinct('domainName', withNeighborhood(req));
    res.json(domains.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/capabilities/aspects — list distinct aspects
router.get('/aspects', async (req, res) => {
  try {
    const aspects = await Capability.distinct('aspect', withNeighborhood(req));
    res.json(aspects.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/capabilities/match — LLM-powered capability matching from BPMN XML
router.post('/match', async (req, res) => {
  const { xml } = req.body;
  if (!xml || !xml.trim()) {
    return res.status(400).json({ error: 'BPMN XML body is required.' });
  }
  try {
    const result = await matchCapabilities(xml);
    res.json(result);
  } catch (err) {
    console.error('Capability match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/capabilities/:id — get single capability by capabilityId
router.get('/:id', async (req, res) => {
  try {
    const cap = await Capability.findOne({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { capabilityId: Number(req.params.id) },
      ],
    });
    if (!cap) return res.status(404).json({ error: 'Capability not found.' });
    res.json(cap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/capabilities — create a new capability
router.post('/', async (req, res) => {
  try {
    // Auto-assign capabilityId if not provided
    if (!req.body.capabilityId) {
      const max = await Capability.findOne(withNeighborhood(req)).sort('-capabilityId').lean();
      req.body.capabilityId = (max?.capabilityId || 0) + 1;
    }
    const cap = await Capability.create({ ...req.body, neighborhoodName: getNeighborhoodName(req) });
    res.status(201).json(cap);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Capability already exists' });
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/capabilities/:id — update capability by _id
router.put('/:id', async (req, res) => {
  try {
    const cap = await Capability.findOneAndUpdate({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    }, { $set: req.body }, { new: true, runValidators: true });
    if (!cap) return res.status(404).json({ error: 'Capability not found.' });
    res.json(cap);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/capabilities/:id — delete capability by _id
router.delete('/:id', async (req, res) => {
  try {
    const cap = await Capability.findOneAndDelete({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    });
    if (!cap) return res.status(404).json({ error: 'Capability not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
