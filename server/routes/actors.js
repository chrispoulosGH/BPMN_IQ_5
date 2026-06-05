const express = require('express');
const router = express.Router();
const Actor = require('../models/Actor');
const { getNeighborhoodName, buildNeighborhoodFilter, withNeighborhood } = require('../utils/neighborhoodScope');

// GET /api/actors — list all
router.get('/', async (req, res) => {
  try {
    const actors = await Actor.find(withNeighborhood(req)).sort({ name: 1 });
    res.json(actors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/actors/search?q=term — full-text search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Query "q" is required.' });
  try {
    const results = await Actor.find(
      withNeighborhood(req, { $text: { $search: q.trim() } }),
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(50);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/actors — create
router.post('/', async (req, res) => {
  try {
    const actor = await Actor.create({ ...req.body, neighborhoodName: getNeighborhoodName(req) });
    res.status(201).json(actor);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An actor with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/actors/:id — update
router.put('/:id', async (req, res) => {
  try {
    const actor = await Actor.findOneAndUpdate({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    }, req.body, { new: true, runValidators: true });
    if (!actor) return res.status(404).json({ error: 'Not found' });
    res.json(actor);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An actor with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/actors/:id — delete
router.delete('/:id', async (req, res) => {
  try {
    await Actor.findOneAndDelete({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
