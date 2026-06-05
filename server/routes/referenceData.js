const express = require('express');
const router = express.Router();
const { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain, BusinessCapability } = require('../models/ReferenceData');
const { getNeighborhoodName, buildNeighborhoodFilter, withNeighborhood } = require('../utils/neighborhoodScope');

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
  const items = await Model.find(withNeighborhood(req)).sort('name').lean();
  res.json(items);
});

// POST /api/reference/:collection — create item
router.post('/:collection', async (req, res) => {
  const Model = models[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Unknown collection' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    let data;
    if (req.params.collection === 'businessCapabilities') {
      data = { name: name.trim(), domainName: req.body.domainName, aspect: req.body.aspect, briefDescription: req.body.briefDescription, tmfVersion: req.body.tmfVersion };
    } else if (req.params.collection === 'applications') {
      const APP_FIELDS = ['acronym','correlationId','shortDescription','applicationType','businessCriticality','discoverySource','installType','cpniIndicator','customerFacing','handleSpi','internetFacing','pciData','soxFsa','storeSpi','applPurpose','lifecycle','lifecycleStatus','businessPurpose','pciDataStored','userInterface','owner'];
      data = { neighborhoodName: getNeighborhoodName(req), name: name.trim(), state: req.body.state || 'draft' };
      for (const f of APP_FIELDS) {
        if (f in req.body) data[f] = req.body[f] || null;
      }
    } else {
      data = { neighborhoodName: getNeighborhoodName(req), name: name.trim() };
    }
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
    let update;
    if (req.params.collection === 'businessCapabilities') {
      update = { name: name.trim(), domainName: req.body.domainName, aspect: req.body.aspect, briefDescription: req.body.briefDescription, tmfVersion: req.body.tmfVersion };
    } else if (req.params.collection === 'applications') {
      const APP_FIELDS = ['acronym','shortDescription','applicationType','businessCriticality','discoverySource','installType','cpniIndicator','customerFacing','handleSpi','internetFacing','pciData','soxFsa','storeSpi','applPurpose','lifecycle','lifecycleStatus','businessPurpose','pciDataStored','userInterface','owner'];
      update = { name: name.trim() };
      for (const f of APP_FIELDS) {
        if (f in req.body) update[f] = req.body[f] || null;
      }
    } else {
      update = { name: name.trim() };
    }
    const item = await Model.findOneAndUpdate({
      $and: [
        buildNeighborhoodFilter(getNeighborhoodName(req)),
        { _id: req.params.id },
      ],
    }, update, { new: true });
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
  const item = await Model.findOneAndDelete({
    $and: [
      buildNeighborhoodFilter(getNeighborhoodName(req)),
      { _id: req.params.id },
    ],
  });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
