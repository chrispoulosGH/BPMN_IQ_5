const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CanonicalComponent = require('../models/CanonicalComponent');

function escapeRegex(str){ return String(str || '').replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); }

// GET /api/canonical/:neighborhood/:componentType/rows?page=1&limit=100&search=
router.get('/:neighborhood/:componentType/rows', async (req, res) => {
  try {
    const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
    const componentType = String(req.params.componentType || req.query.componentType || '').trim();
    if (!neighborhood || !componentType) return res.status(400).json({ error: 'neighborhood and componentType are required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    // Use case-insensitive exact match for neighborhood and componentType to be forgiving
    const filter = {
      neighborhoodName: { $regex: `^${escapeRegex(neighborhood)}$`, $options: 'i' },
      componentType: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' },
    };
    // Optional search on primaryKey or values.*
    const search = String(req.query.search || '').trim();
    if (search) {
      // match primaryKey or any values property containing the search term (case-insensitive)
      const regex = new RegExp(search.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
      filter.$or = [ { primaryKey: regex }, { 'values': { $elemMatch: { $exists: true } } }, { 'values': { $regex: regex } } ];
    }

    const [total, docs] = await Promise.all([
      CanonicalComponent.countDocuments(filter),
      CanonicalComponent.find(filter).sort({ primaryKey: 1 }).skip(skip).limit(limit).lean(),
    ]);

    const rows = docs.map((d) => ({ primaryKey: d.primaryKey, values: d.values }));

    res.json({ neighborhood, componentType, page, limit, total, rows });
  } catch (err) {
    console.error('[CANONICAL] rows error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/canonical/:neighborhood/:componentType/children?parentKey=...&page=&limit=
router.get('/:neighborhood/:componentType/children', async (req, res) => {
  try {
    const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
    const componentType = String(req.params.componentType || req.query.componentType || '').trim();
    const parentKey = String(req.query.parentKey || '').trim();
    if (!neighborhood || !componentType || !parentKey) return res.status(400).json({ error: 'neighborhood, componentType and parentKey are required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const filter = {
      neighborhoodName: { $regex: `^${escapeRegex(neighborhood)}$`, $options: 'i' },
      parentKeys: parentKey,
    };
    const [total, docs] = await Promise.all([
      CanonicalComponent.countDocuments(filter),
      CanonicalComponent.find(filter).sort({ primaryKey: 1 }).skip(skip).limit(limit).lean(),
    ]);

    const rows = docs.map((d) => ({ primaryKey: d.primaryKey, values: d.values }));
    res.json({ neighborhood, componentType, parentKey, page, limit, total, rows });
  } catch (err) {
    console.error('[CANONICAL] children error', err && err.message);
    res.status(500).json({ error: err.message });
  }
});

    // GET /api/canonical/:neighborhood/types
    router.get('/:neighborhood/types', async (req, res) => {
      try {
        const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
        if (!neighborhood) return res.status(400).json({ error: 'neighborhood is required' });
        const types = await CanonicalComponent.distinct('componentType', { neighborhoodName: neighborhood });
        res.json({ neighborhood, types });
      } catch (err) {
        console.error('[CANONICAL] types error', err && err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/canonical/:neighborhood/:componentType/meta
    router.get('/:neighborhood/:componentType/meta', async (req, res) => {
      try {
        const neighborhood = String(req.params.neighborhood || req.query.neighborhoodName || '').trim();
        const componentType = String(req.params.componentType || req.query.componentType || '').trim();
        if (!neighborhood || !componentType) return res.status(400).json({ error: 'neighborhood and componentType are required' });

        const filter = {
          neighborhoodName: { $regex: `^${escapeRegex(neighborhood)}$`, $options: 'i' },
          componentType: { $regex: `^${escapeRegex(componentType)}$`, $options: 'i' },
        };

        const total = await CanonicalComponent.countDocuments(filter);
        const sample = await CanonicalComponent.find(filter).sort({ primaryKey: 1 }).limit(10).lean();

        const columnsSet = new Set();
        sample.forEach((s) => {
          if (s.values && typeof s.values === 'object') Object.keys(s.values).forEach((k) => columnsSet.add(k));
        });

        res.json({ neighborhood, componentType, total, sampleCount: sample.length, columns: Array.from(columnsSet), sample });
      } catch (err) {
        console.error('[CANONICAL] meta error', err && err.message);
        res.status(500).json({ error: err.message });
      }
    });

module.exports = router;
