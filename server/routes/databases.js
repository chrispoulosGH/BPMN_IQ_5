const express = require('express');
const DatabaseInstance = require('../models/DatabaseInstance');

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
      { instanceName: regex },
      { serviceName: regex },
      { applicationName: regex },
      { applicationAcronym: regex },
      { applicationCorrelationId: regex },
      { databaseClassName: regex },
      { vendor: regex },
      { normalizedVendor: regex },
      { version: regex },
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

router.get('/', async (req, res) => {
  try {
    const filter = {};
    const debugInput = {
      applicationCorrelationId: req.query.applicationCorrelationId || null,
      applicationName: req.query.applicationName || null,
      search: req.query.search || null,
    };

    if (req.query.applicationCorrelationId) {
      const correlationId = String(req.query.applicationCorrelationId).trim();
      filter.$or = [
        { applicationCorrelationId: correlationId },
        { 'linkedApplications.correlationId': correlationId },
      ];
    }

    if (req.query.applicationName) {
      const appRegex = new RegExp(escapeRegex(String(req.query.applicationName).trim()), 'i');
      const nameFilter = {
        $or: [
          { applicationAcronym: appRegex },
          { 'linkedApplications.acronym': appRegex },
        ],
      };
      if (filter.$or) {
        filter.$and = [nameFilter, { $or: filter.$or }];
        delete filter.$or;
      } else {
        Object.assign(filter, nameFilter);
      }
    }

    const searchFilter = buildSearchFilter(req.query.search);
    const query = searchFilter ? { $and: [filter, searchFilter] } : filter;
    console.log('[databases:/] request params:', safeJson(debugInput));
    console.log('[databases:/] effective query:', safeJson(query));

    const items = await DatabaseInstance.find(query).sort({ name: 1, instanceName: 1 }).lean();
    console.log('[databases:/] match count:', items.length);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/by-application/:correlationId', async (req, res) => {
  try {
    const correlationId = String(req.params.correlationId || '').trim();
    if (!correlationId) return res.status(400).json({ error: 'correlationId is required' });
    const query = {
      $or: [
        { applicationCorrelationId: correlationId },
        { 'linkedApplications.correlationId': correlationId },
      ],
    };
    console.log('[databases:/by-application] correlationId:', correlationId);
    console.log('[databases:/by-application] effective query:', safeJson(query));

    const items = await DatabaseInstance.find(query).sort({ name: 1, instanceName: 1 }).lean();
    console.log('[databases:/by-application] match count:', items.length);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await DatabaseInstance.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Database not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;