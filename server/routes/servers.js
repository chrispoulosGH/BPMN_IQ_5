const express = require('express');
const Server = require('../models/Server');

const router = express.Router();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchFilter(search) {
  const value = String(search || '').trim();
  if (!value) return null;
  const regex = new RegExp(escapeRegex(value), 'i');
  return {
    $or: [
      { name: regex },
      { hostName: regex },
      { fqdn: regex },
      { ipAddress: regex },
      { serverSystemId: regex },
      { environment: regex },
      { os: regex },
      { supportGroup: regex },
      { 'linkedApplications.name': regex },
      { 'linkedApplications.correlationId': regex },
      { 'linkedApplications.acronym': regex },
    ],
  };
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.applicationCorrelationId) {
      filter['linkedApplications.correlationId'] = String(req.query.applicationCorrelationId).trim();
    }
    if (req.query.applicationName) {
      filter['linkedApplications.name'] = new RegExp(escapeRegex(String(req.query.applicationName).trim()), 'i');
    }

    const searchFilter = buildSearchFilter(req.query.search);
    const query = searchFilter ? { $and: [filter, searchFilter] } : filter;
    const items = await Server.find(query).sort({ name: 1, hostName: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-application/:correlationId', async (req, res) => {
  try {
    const correlationId = String(req.params.correlationId || '').trim();
    if (!correlationId) return res.status(400).json({ error: 'correlationId is required' });
    const items = await Server.find({ 'linkedApplications.correlationId': correlationId }).sort({ name: 1, hostName: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Server.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Server not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;