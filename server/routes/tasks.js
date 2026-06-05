const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain, LineOfBusiness } = require('../models/ReferenceData');
const { getNeighborhoodName, buildNeighborhoodFilter, withNeighborhood } = require('../utils/neighborhoodScope');

const APPLICATION_FIELDS = [
  'name',
  'correlationId',
  'shortDescription',
  'applicationType',
  'businessCriticality',
  'discoverySource',
  'installType',
  'cpniIndicator',
  'customerFacing',
  'handleSpi',
  'internetFacing',
  'pciData',
  'soxFsa',
  'storeSpi',
  'acronym',
  'applPurpose',
  'lifecycle',
  'lifecycleStatus',
  'businessPurpose',
  'pciDataStored',
  'userInterface',
  'owner',
  'state',
];

function pickFields(source, allowed) {
  const output = {};
  for (const field of allowed) {
    if (source[field] !== undefined) output[field] = source[field];
  }
  return output;
}

function duplicateErrorMessage(err) {
  const key = Object.keys(err?.keyPattern || {})[0] || '';
  if (key === 'correlationId') return 'Application correlationId already exists';
  if (key === 'name') return 'Application name already exists';
  return 'Already exists';
}

// ─── Reference Data ──────────────────────────────────────────
const refModels = { businessFlows: BusinessFlow, products: Product, applications: Application, actors: Actor, channels: Channel, domains: Domain, subdomains: Subdomain, linesOfBusiness: LineOfBusiness };

router.get('/reference', async (_req, res) => {
  const req = _req;
  const [businessFlows, products, applications, actors, channels, domains, subdomains, linesOfBusiness] = await Promise.all([
    BusinessFlow.find(withNeighborhood(req)).sort('name').lean(),
    Product.find(withNeighborhood(req)).sort('name').lean(),
    Application.find(withNeighborhood(req)).sort('name').lean(),
    Actor.find(withNeighborhood(req)).sort('name').lean(),
    Channel.find(withNeighborhood(req)).sort('name').lean(),
    Domain.find(withNeighborhood(req)).sort('name').lean(),
    Subdomain.find(withNeighborhood(req)).sort('name').lean(),
    LineOfBusiness.find(withNeighborhood(req)).sort('name').lean(),
  ]);
  res.json({ businessFlows, products, applications, actors, channels, domains, subdomains, linesOfBusiness });
});

// CRUD for individual reference collections
router.get('/reference/applications/by-correlation/:correlationId', async (req, res) => {
  const correlationId = String(req.params.correlationId || '').trim();
  if (!correlationId) return res.status(400).json({ error: 'correlationId is required' });

  const item = await Application.findOne({
    $and: [
      buildNeighborhoodFilter(getNeighborhoodName(req)),
      { correlationId },
    ],
  }).lean();
  if (!item) return res.status(404).json({ error: 'Application not found' });
  res.json(item);
});

router.get('/reference/:collection', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const items = await Model.find(withNeighborhood(req)).sort('name').lean();
  res.json(items);
});

router.post('/reference/:collection', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  try {
    const isApplications = req.params.collection === 'applications';
    const data = isApplications
      ? { neighborhoodName: getNeighborhoodName(req), ...pickFields(req.body, APPLICATION_FIELDS) }
      : { neighborhoodName: getNeighborhoodName(req), name: req.body.name };

    if (!isApplications) {
      if (req.body.owner !== undefined) data.owner = req.body.owner;
      if (req.body.state !== undefined) data.state = req.body.state;
    }

    const item = await Model.create(data);
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: duplicateErrorMessage(err) });
    res.status(400).json({ error: err.message });
  }
});

router.put('/reference/:collection/:id', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  try {
    const isApplications = req.params.collection === 'applications';
    const update = isApplications
      ? pickFields(req.body, APPLICATION_FIELDS)
      : { name: req.body.name };

    if (!isApplications && req.body.owner !== undefined) update.owner = req.body.owner;

    const item = await Model.findOneAndUpdate({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    }, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: duplicateErrorMessage(err) });
    res.status(400).json({ error: err.message });
  }
});

router.delete('/reference/:collection/:id', async (req, res) => {
  const Model = refModels[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const item = await Model.findOneAndDelete({
    $and: [
      buildNeighborhoodFilter(getNeighborhoodName(req)),
      { _id: req.params.id },
    ],
  });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ─── Tasks CRUD ──────────────────────────────────────────────

// GET /api/tasks/names — distinct task names for autocomplete (must be before /:id)
// Optional ?businessFlow=X to scope to a specific business flow
router.get('/names', async (req, res) => {
  const filter = withNeighborhood(req, req.query.businessFlow ? { businessFlow: req.query.businessFlow } : {});
  const names = await Task.distinct('name', filter);
  res.json(names.sort());
});

// List tasks (with optional filters)
router.get('/', async (req, res) => {
  const extraFilter = {};
  if (req.query.businessFlow) extraFilter.businessFlow = req.query.businessFlow;
  if (req.query.product) extraFilter.product = req.query.product;
  if (req.query.actor) extraFilter.actor = req.query.actor;
  if (req.query.channel) extraFilter.channel = req.query.channel;
  if (req.query.domain) extraFilter.domain = req.query.domain;
  if (req.query.search) {
    if (String(req.query.exact || '') === '1') {
      extraFilter.name = String(req.query.search);
    } else {
      extraFilter.name = { $regex: req.query.search, $options: 'i' };
    }
  }

  const filter = withNeighborhood(req, extraFilter);
  const tasks = await Task.find(filter).sort({ businessFlow: 1, sequence: 1, name: 1 }).lean();
  res.json(tasks);
});

// Get single task
router.get('/:id', async (req, res) => {
  const task = await Task.findOne({
    $and: [
      buildNeighborhoodFilter(getNeighborhoodName(req)),
      { _id: req.params.id },
    ],
  }).lean();
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Create task
router.post('/', async (req, res) => {
  try {
    const task = await Task.create({ ...req.body, neighborhoodName: getNeighborhoodName(req) });
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
    const task = await Task.findOneAndUpdate({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    }, { $set: req.body }, { new: true, runValidators: true });
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
  const task = await Task.findOneAndDelete({
    $and: [
      buildNeighborhoodFilter(getNeighborhoodName(req)),
      { _id: req.params.id },
    ],
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ success: true });
});

// ─── Validate task names against Task Factory ────────────────
// POST /api/tasks/validate  { taskNames: string[] }
// Returns { valid: string[], invalid: string[] }
router.post('/validate', async (req, res) => {
  const { taskNames, businessFlow } = req.body;
  if (!Array.isArray(taskNames)) return res.status(400).json({ error: 'taskNames must be an array' });

  // Get distinct task names scoped to the businessFlow if provided, otherwise all
  const filter = withNeighborhood(req, businessFlow ? { businessFlow } : {});
  const knownNames = await Task.distinct('name', filter);
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
