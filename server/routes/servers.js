const express = require('express');
const Server = require('../models/Server');
const { getNeighborhoodName, buildNeighborhoodFilter } = require('../utils/neighborhoodScope');
const { listApplicationReferences } = require('../utils/applicationReferenceLookup');

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

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function buildNeighborhoodApplicationFilter(req) {
  const neighborhoodName = getNeighborhoodName(req);
  const applications = await listApplicationReferences(neighborhoodName);

  const correlationIds = applications.map((item) => String(item.correlationId || '').trim()).filter(Boolean);
  const acronyms = applications.map((item) => String(item.acronym || '').trim()).filter(Boolean);
  const names = applications.map((item) => String(item.name || '').trim()).filter(Boolean);

  if (!correlationIds.length && !acronyms.length && !names.length) {
    return { _id: null };
  }

  return {
    $or: [
      correlationIds.length ? { 'linkedApplications.correlationId': { $in: correlationIds } } : null,
      acronyms.length ? { 'linkedApplications.acronym': { $in: acronyms } } : null,
      names.length ? { 'linkedApplications.name': { $in: names } } : null,
    ].filter(Boolean),
  };
}

router.get('/', async (req, res) => {
  try {
    const filter = await buildNeighborhoodApplicationFilter(req);
    const debugInput = {
      applicationCorrelationId: req.query.applicationCorrelationId || null,
      applicationName: req.query.applicationName || null,
      search: req.query.search || null,
    };

    if (req.query.applicationCorrelationId) {
      filter['linkedApplications.correlationId'] = String(req.query.applicationCorrelationId).trim();
    }
    if (req.query.applicationName) {
      const appRegex = new RegExp(escapeRegex(String(req.query.applicationName).trim()), 'i');
      filter.$or = [
        { 'linkedApplications.acronym': appRegex },
      ];
    }

    const searchFilter = buildSearchFilter(req.query.search);
    const query = searchFilter ? { $and: [filter, searchFilter] } : filter;
    console.log('[servers:/] request params:', safeJson(debugInput));
    console.log('[servers:/] effective query:', safeJson(query));

    const items = await Server.find(query).sort({ name: 1, hostName: 1 }).lean();
    console.log('[servers:/] match count:', items.length);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-application/:correlationId', async (req, res) => {
  try {
    const correlationId = String(req.params.correlationId || '').trim();
    if (!correlationId) return res.status(400).json({ error: 'correlationId is required' });
    const appScope = await buildNeighborhoodApplicationFilter(req);
    const query = { $and: [appScope, { 'linkedApplications.correlationId': correlationId }] };
    console.log('[servers:/by-application] correlationId:', correlationId);
    console.log('[servers:/by-application] effective query:', safeJson(query));

    const items = await Server.find(query).sort({ name: 1, hostName: 1 }).lean();
    console.log('[servers:/by-application] match count:', items.length);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const appScope = await buildNeighborhoodApplicationFilter(req);
    const item = await Server.findOne({ $and: [appScope, { _id: req.params.id }] }).lean();
    if (!item) return res.status(404).json({ error: 'Server not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const appScope = await buildNeighborhoodApplicationFilter(req);
    const item = await Server.findOneAndDelete({ $and: [appScope, { _id: req.params.id }] });
    if (!item) return res.status(404).json({ error: 'Server not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;