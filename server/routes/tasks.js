const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain, LineOfBusiness } = require('../models/ReferenceData');

// ─── Reference Data ──────────────────────────────────────────
const refModels = { businessFlows: BusinessFlow, products: Product, applications: Application, actors: Actor, channels: Channel, domains: Domain, subdomains: Subdomain, linesOfBusiness: LineOfBusiness };

router.get('/reference', async (_req, res) => {
  const [businessFlows, products, applications, actors, channels, domains, subdomains, linesOfBusiness] = await Promise.all([
    BusinessFlow.find().sort('name').lean(),
    Product.find().sort('name').lean(),
    Application.find().sort('name').lean(),
    Actor.find().sort('name').lean(),
    Channel.find().sort('name').lean(),
    Domain.find().sort('name').lean(),
    Subdomain.find().sort('name').lean(),
    LineOfBusiness.find().sort('name').lean(),
  ]);
  res.json({ businessFlows, products, applications, actors, channels, domains, subdomains, linesOfBusiness });
});

// CRUD for individual reference collections
router.get('/reference/:collection', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const items = await Model.find().sort('name').lean();
  res.json(items);
});

router.post('/reference/:collection', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  try {
    const data = { name: req.body.name };
    if (req.body.owner !== undefined) data.owner = req.body.owner;
    if (req.body.state !== undefined) data.state = req.body.state;
    const item = await Model.create(data);
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already exists' });
    res.status(400).json({ error: err.message });
  }
});

router.put('/reference/:collection/:id', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  try {
    const update = { name: req.body.name };
    if (req.body.owner !== undefined) update.owner = req.body.owner;
    const item = await Model.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already exists' });
    res.status(400).json({ error: err.message });
  }
});

router.delete('/reference/:collection/:id', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const item = await Model.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ─── Tasks CRUD ──────────────────────────────────────────────

// GET /api/tasks/names — distinct task names for autocomplete (must be before /:id)
router.get('/names', async (_req, res) => {
  const names = await Task.distinct('name');
  res.json(names.sort());
});

// List tasks (with optional filters)
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.businessFlow) filter.businessFlow = req.query.businessFlow;
  if (req.query.product) filter.product = req.query.product;
  if (req.query.actor) filter.actor = req.query.actor;
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.domain) filter.domain = req.query.domain;
  if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };

  const tasks = await Task.find(filter).sort({ businessFlow: 1, sequence: 1, name: 1 }).lean();
  res.json(tasks);
});

// Get single task
router.get('/:id', async (req, res) => {
  const task = await Task.findById(req.params.id).lean();
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Create task
router.post('/', async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.status(201).json(task);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Task with this name/flow/product already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Task with this name/flow/product already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ success: true });
});

// ─── Validate task names against Task Factory ────────────────
// POST /api/tasks/validate  { taskNames: string[] }
// Returns { valid: string[], invalid: string[] }
router.post('/validate', async (req, res) => {
  const { taskNames } = req.body;
  if (!Array.isArray(taskNames)) return res.status(400).json({ error: 'taskNames must be an array' });

  // Get all distinct task names from the factory
  const knownNames = await Task.distinct('name');
  const knownSet = new Set(knownNames.map((n) => n.toLowerCase().trim()));

  const valid = [];
  const invalid = [];
  for (const name of taskNames) {
    if (knownSet.has(name.toLowerCase().trim())) {
      valid.push(name);
    } else {
      invalid.push(name);
    }
  }
  res.json({ valid, invalid });
});

module.exports = router;
