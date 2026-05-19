const express = require('express');
const router = express.Router();
const Persona = require('../models/Persona');

// GET /api/personas — list all
router.get('/', async (req, res) => {
  try {
    const personas = await Persona.find().sort({ name: 1 });
    res.json(personas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/personas/search?q=term — full-text search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Query "q" is required.' });
  try {
    const results = await Persona.find(
      { $text: { $search: q.trim() } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(50);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/personas — create
router.post('/', async (req, res) => {
  try {
    const persona = await Persona.create(req.body);
    res.status(201).json(persona);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A persona with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/personas/:id — update
router.put('/:id', async (req, res) => {
  try {
    const persona = await Persona.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!persona) return res.status(404).json({ error: 'Not found' });
    res.json(persona);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A persona with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/personas/:id — delete
router.delete('/:id', async (req, res) => {
  try {
    await Persona.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
