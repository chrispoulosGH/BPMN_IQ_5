const express = require('express');
const router = express.Router();
const Diagram = require('../models/Diagram');

// GET /api/diagrams — list all (optionally filter by name)
router.get('/', async (req, res) => {
  try {
    const diagrams = await Diagram.find({}, '-xml').sort({ updatedAt: -1 });
    res.json(diagrams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagrams/search?q=term — full-text search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }
  try {
    const results = await Diagram.find(
      { $text: { $search: q.trim() } },
      { score: { $meta: 'textScore' }, xml: 0 }
    ).sort({ score: { $meta: 'textScore' } });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagrams/:id — get single diagram with XML
router.get('/:id', async (req, res) => {
  try {
    const diagram = await Diagram.findById(req.params.id);
    if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
    res.json(diagram);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/diagrams — create new diagram
router.post('/', async (req, res) => {
  const { name, description, xml, tags, capabilities } = req.body;
  if (!name || !xml) {
    return res.status(400).json({ error: 'Fields "name" and "xml" are required.' });
  }
  try {
    const diagram = await Diagram.create({ name, description, xml, tags, capabilities });
    res.status(201).json(diagram);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/diagrams/:id — update diagram
router.put('/:id', async (req, res) => {
  const { name, description, xml, tags, capabilities, changeNote } = req.body;
  try {
    const $set = {};
    if (name !== undefined) $set.name = name;
    if (description !== undefined) $set.description = description;
    if (xml !== undefined) $set.xml = xml;
    if (tags !== undefined) $set.tags = tags;
    if (capabilities !== undefined) $set.capabilities = capabilities;

    const update = { $set, $inc: { version: 1 } };

    // Append change note to history
    if (changeNote) {
      update.$push = {
        changeHistory: {
          date: new Date(),
          userId: changeNote.userId,
          note: changeNote.note,
        },
      };
    }

    const diagram = await Diagram.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
    res.json(diagram);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/diagrams/:id — delete diagram
router.delete('/:id', async (req, res) => {
  try {
    const diagram = await Diagram.findByIdAndDelete(req.params.id);
    if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
    res.json({ message: 'Diagram deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
