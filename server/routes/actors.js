const express = require('express');
const router = express.Router();
const Actor = require('../models/Actor');
const Component = require('../models/Component');
const { getNeighborhoodName, buildNeighborhoodFilter, withNeighborhood } = require('../utils/neighborhoodScope');

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeValue(value).toLowerCase();
}

function getRowValues(values) {
  if (!values) return {};
  if (values instanceof Map) return Object.fromEntries(values.entries());
  return { ...values };
}

function getComponentRowName(row, component) {
  const values = getRowValues(row?.values);
  if (values.name !== undefined && values.name !== null && normalizeValue(values.name)) {
    return normalizeValue(values.name);
  }

  for (const column of Array.isArray(component?.columns) ? component.columns : []) {
    const candidate = normalizeValue(values[column]);
    if (candidate) return candidate;
  }

  return '';
}

async function getActorsFromComponents(req) {
  const neighborhoodName = getNeighborhoodName(req);
  const components = await Component.find({ neighborhoodName }, { name: 1, rows: 1, columns: 1 }).lean();
  const actorComponents = components.filter((component) => normalizeKey(component?.name) === 'actor');

  const seen = new Set();
  const actors = [];
  for (const component of actorComponents) {
    for (const row of Array.isArray(component?.rows) ? component.rows : []) {
      const name = getComponentRowName(row, component);
      if (!name) continue;
      const key = normalizeKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      actors.push({ name, neighborhoodName });
    }
  }

  return actors.sort((left, right) => left.name.localeCompare(right.name));
}

// GET /api/actors — list all
router.get('/', async (req, res) => {
  try {
    const actors = await Actor.find(withNeighborhood(req)).sort({ name: 1 });
    if (actors.length) return res.json(actors);
    const componentActors = await getActorsFromComponents(req);
    res.json(componentActors);
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
    if (results.length) return res.json(results);

    const query = q.trim().toLowerCase();
    const componentActors = await getActorsFromComponents(req);
    const filtered = componentActors.filter((actor) => actor.name.toLowerCase().includes(query));
    res.json(filtered.slice(0, 50));
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
