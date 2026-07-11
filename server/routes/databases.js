const express = require('express');
const DatabaseInstance = require('../models/DatabaseInstance');
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
      correlationIds.length ? { applicationCorrelationId: { $in: correlationIds } } : null,
      correlationIds.length ? { 'linkedApplications.correlationId': { $in: correlationIds } } : null,
      acronyms.length ? { applicationAcronym: { $in: acronyms } } : null,
      acronyms.length ? { 'linkedApplications.acronym': { $in: acronyms } } : null,
      names.length ? { applicationName: { $in: names } } : null,
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
    const appScope = await buildNeighborhoodApplicationFilter(req);
    const query = {
      $and: [
        appScope,
        {
          $or: [
            { applicationCorrelationId: correlationId },
            { 'linkedApplications.correlationId': correlationId },
          ],
        },
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
    const appScope = await buildNeighborhoodApplicationFilter(req);
    const item = await DatabaseInstance.findOne({ $and: [appScope, { _id: req.params.id }] }).lean();
    if (!item) return res.status(404).json({ error: 'Database not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const appScope = await buildNeighborhoodApplicationFilter(req);
    const item = await DatabaseInstance.findOneAndDelete({ $and: [appScope, { _id: req.params.id }] });
    if (!item) return res.status(404).json({ error: 'Database not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;