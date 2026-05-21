const express = require('express');
const router = express.Router();
const { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain, BusinessCapability } = require('../models/ReferenceData');

const models = {
  applications: Application,
  businessFlows: BusinessFlow,
  products: Product,
  actors: Actor,
  channels: Channel,
  domains: Domain,
  subdomains: Subdomain,
  businessCapabilities: BusinessCapability,
};

// GET /api/reference/:collection — list all items
router.get('/:collection', async (req, res) => {
  const Model = models[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const items = await Model.find().sort('name').lean();
  res.json(items);
});

// POST /api/reference/:collection — create item
router.post('/:collection', async (req, res) => {
  const Model = models[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    // For collections with extra fields, pass the whole body
    const data = req.params.collection === 'businessCapabilities'
      ? { name: name.trim(), domainName: req.body.domainName, aspect: req.body.aspect, briefDescription: req.body.briefDescription, tmfVersion: req.body.tmfVersion }
      : { name: name.trim() };
    const item = await Model.create(data);
    res.status(201).json(item);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Name already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/reference/:collection/:id — update item
router.put('/:collection/:id', async (req, res) => {
  const Model = models[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const update = req.params.collection === 'businessCapabilities'
      ? { name: name.trim(), domainName: req.body.domainName, aspect: req.body.aspect, briefDescription: req.body.briefDescription, tmfVersion: req.body.tmfVersion }
      : { name: name.trim() };
    const item = await Model.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Name already exists' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/reference/:collection/:id — delete item
router.delete('/:collection/:id', async (req, res) => {
  const Model = models[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const item = await Model.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
