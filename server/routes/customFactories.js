const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');

const User = require('../models/User');
const CustomFactory = require('../models/CustomFactory');
const FactoryNeighborhood = require('../models/FactoryNeighborhood');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const PRIMARY_KEY_COLUMN = 'name';
const DEFAULT_NEIGHBORHOOD_NAME = 'AT&T Journey';

function createValidationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function ensureDefaultNeighborhood() {
  await FactoryNeighborhood.updateOne(
    { name: DEFAULT_NEIGHBORHOOD_NAME },
    {
      $setOnInsert: {
        name: DEFAULT_NEIGHBORHOOD_NAME,
        owner: 'System',
        createdBy: 'system',
      },
    },
    { upsert: true }
  );
}

async function migrateFactoriesToDefaultNeighborhood() {
  await ensureDefaultNeighborhood();

  const factoriesToMove = await CustomFactory.find(
    { neighborhoodName: { $ne: DEFAULT_NEIGHBORHOOD_NAME } },
    { _id: 1, name: 1, neighborhoodName: 1 }
  ).lean();

  if (!factoriesToMove.length) return;

  const movedNames = new Set();
  for (const factory of factoriesToMove) {
    const normalizedName = String(factory.name || '').trim().toLowerCase();
    if (!normalizedName) continue;
    if (movedNames.has(normalizedName)) {
      throw createValidationError(`Cannot migrate factories into ${DEFAULT_NEIGHBORHOOD_NAME}: duplicate factory name ${factory.name}`, 409);
    }
    movedNames.add(normalizedName);
  }

  const existingDefaultFactories = await CustomFactory.find(
    { neighborhoodName: DEFAULT_NEIGHBORHOOD_NAME },
    { name: 1, _id: 0 }
  ).lean();

  const defaultNames = new Set(existingDefaultFactories.map((factory) => String(factory.name || '').trim().toLowerCase()).filter(Boolean));
  const conflictingFactory = factoriesToMove.find((factory) => defaultNames.has(String(factory.name || '').trim().toLowerCase()));
  if (conflictingFactory) {
    throw createValidationError(`Cannot migrate factories into ${DEFAULT_NEIGHBORHOOD_NAME}: duplicate factory name ${conflictingFactory.name}`, 409);
  }

  await CustomFactory.updateMany(
    { _id: { $in: factoriesToMove.map((factory) => factory._id) } },
    { $set: { neighborhoodName: DEFAULT_NEIGHBORHOOD_NAME } }
  );
}

async function getCurrentRole(req) {
  const userId = req.currentUser?.userId;
  if (!userId) return null;
  const user = await User.findOne({ userId }).lean();
  if (!user?.role) return null;
  return mongoose.connection.collection('roles').findOne({ name: user.role });
}

async function requireAdminWrite(req, res, next) {
  const role = await getCurrentRole(req);
  const canWrite = role?.capabilities?.some((capability) => capability.function === 'Admin' && capability.permission === 'Write');
  if (!canWrite) return res.status(403).json({ error: 'Admin write access required' });
  next();
}

function normalizeColumnName(columnName) {
  const trimmed = String(columnName || '').trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase() === PRIMARY_KEY_COLUMN ? PRIMARY_KEY_COLUMN : trimmed;
}

function normalizeRowsAndColumns(rows) {
  const seen = new Set();
  const columns = [];
  const normalizedRows = rows.map((row) => {
    const nextRow = {};
    for (const key of Object.keys(row || {})) {
      const column = normalizeColumnName(key);
      if (!column || seen.has(column)) continue;
      seen.add(column);
      columns.push(column);
    }

    for (const key of Object.keys(row || {})) {
      const column = normalizeColumnName(key);
      if (!column || Object.prototype.hasOwnProperty.call(nextRow, column)) continue;
      nextRow[column] = row[key] ?? '';
    }
    return nextRow;
  });

  return { rows: normalizedRows, columns };
}

function getNormalizedPrimaryKeyValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validatePrimaryKeyRows(rows) {
  const seen = new Set();

  rows.forEach((row, index) => {
    const rawValue = row?.[PRIMARY_KEY_COLUMN];
    const normalizedValue = getNormalizedPrimaryKeyValue(rawValue);
    if (!normalizedValue) {
      throw createValidationError(`Each row must include a non-empty ${PRIMARY_KEY_COLUMN} value (row ${index + 1})`);
    }
    if (seen.has(normalizedValue)) {
      throw createValidationError(`Duplicate ${PRIMARY_KEY_COLUMN} value found: ${String(rawValue).trim()}`);
    }
    seen.add(normalizedValue);
  });
}

function validateFactoryRows(rows, columns) {
  if (!columns.includes(PRIMARY_KEY_COLUMN)) {
    throw createValidationError(`Spreadsheet must include a ${PRIMARY_KEY_COLUMN} column`);
  }
  validatePrimaryKeyRows(rows);
}

function parseWorkbookRows(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No worksheet found in ${fileName || 'uploaded file'}`);
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rawRows.length) throw createValidationError('Spreadsheet does not contain any data rows');
  const { rows, columns } = normalizeRowsAndColumns(rawRows);
  if (!columns.length) throw createValidationError('Spreadsheet does not contain any usable columns');
  validateFactoryRows(rows, columns);
  return { rows, columns, sheetName };
}

function serializeFactory(factory) {
  const toPlainObject = (value) => {
    if (!value) return {};
    if (value instanceof Map) return Object.fromEntries(value.entries());
    if (typeof value.toObject === 'function') return value.toObject();
    return { ...value };
  };

  return {
    _id: String(factory._id),
    neighborhoodName: factory.neighborhoodName,
    name: factory.name,
    columns: factory.columns,
    owner: factory.owner || '',
    createdBy: factory.createdBy || '',
    sourceFileName: factory.sourceFileName || '',
    createdAt: factory.createdAt,
    updatedAt: factory.updatedAt,
    rowCount: Array.isArray(factory.rows) ? factory.rows.length : 0,
    rows: (factory.rows || []).map((row) => ({
      _id: String(row._id),
      values: toPlainObject(row.values),
      owner: row.owner || '',
      state: row.state || 'staged',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  };
}

router.get('/neighborhoods', async (_req, res) => {
  try {
    await migrateFactoriesToDefaultNeighborhood();
    const [neighborhoods, counts] = await Promise.all([
      FactoryNeighborhood.find({}, { name: 1, owner: 1, createdBy: 1, createdAt: 1, updatedAt: 1, _id: 0 }).sort({ name: 1 }).lean(),
      CustomFactory.aggregate([
        { $group: { _id: '$neighborhoodName', factoryCount: { $sum: 1 }, updatedAt: { $max: '$updatedAt' } } },
      ]),
    ]);
    const countMap = new Map(counts.map((row) => [row._id, row]));
    res.json(neighborhoods.map((neighborhood) => ({
      ...neighborhood,
      factoryCount: countMap.get(neighborhood.name)?.factoryCount || 0,
      updatedAt: countMap.get(neighborhood.name)?.updatedAt || neighborhood.updatedAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureDefaultNeighborhood();
    const neighborhoodName = String(req.query.neighborhoodName || '').trim();
    const query = neighborhoodName ? { neighborhoodName } : {};
    const factories = await CustomFactory.find(query, { neighborhoodName: 1, name: 1, owner: 1, createdBy: 1, sourceFileName: 1, columns: 1, createdAt: 1, updatedAt: 1, rows: 1 })
      .sort({ neighborhoodName: 1, name: 1 })
      .lean();
    res.json(factories.map((factory) => serializeFactory(factory)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const factory = await CustomFactory.findById(req.params.id).lean();
    if (!factory) return res.status(404).json({ error: 'Factory not found' });
    res.json(serializeFactory(factory));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/neighborhoods', requireAdminWrite, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Neighborhood name is required' });
  try {
    await ensureDefaultNeighborhood();
    const existing = await FactoryNeighborhood.exists({ name });
    if (existing) return res.status(409).json({ error: 'Neighborhood already exists' });
    const neighborhood = await FactoryNeighborhood.create({
      name,
      owner: req.currentUser?.displayName || req.currentUser?.userId || '',
      createdBy: req.currentUser?.userId || '',
    });
    res.status(201).json({ name: neighborhood.name, owner: neighborhood.owner, createdBy: neighborhood.createdBy, factoryCount: 0, createdAt: neighborhood.createdAt, updatedAt: neighborhood.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', requireAdminWrite, upload.single('file'), async (req, res) => {
  const neighborhoodName = String(req.body?.neighborhoodName || '').trim();
  const factoryName = String(req.body?.factoryName || '').trim();
  if (!neighborhoodName) return res.status(400).json({ error: 'Neighborhood name is required' });
  if (!factoryName) return res.status(400).json({ error: 'Factory name is required' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'Spreadsheet file is required' });

  try {
    await ensureDefaultNeighborhood();
    const neighborhood = await FactoryNeighborhood.findOne({ name: neighborhoodName }).lean();
    if (!neighborhood) return res.status(404).json({ error: 'Neighborhood not found' });
    const { rows, columns } = parseWorkbookRows(req.file.buffer, req.file.originalname);
    const owner = req.currentUser?.displayName || req.currentUser?.userId || '';
    const createdBy = req.currentUser?.userId || '';
    const factory = await CustomFactory.create({
      neighborhoodName,
      name: factoryName,
      columns,
      owner,
      createdBy,
      sourceFileName: req.file.originalname,
      rows: rows.map((row) => ({
        values: columns.reduce((acc, column) => {
          acc[column] = row[column] ?? '';
          return acc;
        }, {}),
        owner,
        state: 'staged',
      })),
    });
    res.status(201).json(serializeFactory(factory.toObject()));
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Factory already exists in this neighborhood' });
    res.status(err?.status || 500).json({ error: err.message });
  }
});

router.put('/:factoryId/rows/:rowId', requireAdminWrite, async (req, res) => {
  try {
    const factory = await CustomFactory.findById(req.params.factoryId);
    if (!factory) return res.status(404).json({ error: 'Factory not found' });
    const row = factory.rows.id(req.params.rowId);
    if (!row) return res.status(404).json({ error: 'Factory row not found' });

    const nextValues = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {};
    const candidateRows = factory.rows.map((factoryRow) => {
      const values = Object.fromEntries(factory.columns.map((column) => [column, factoryRow.values.get(column) ?? '']));
      if (String(factoryRow._id) === String(row._id)) {
        for (const column of factory.columns) {
          values[column] = nextValues[column] ?? '';
        }
      }
      return values;
    });

    validateFactoryRows(candidateRows, factory.columns);

    for (const column of factory.columns) {
      row.values.set(column, nextValues[column] ?? '');
    }
    row.owner = String(req.body?.owner || row.owner || '').trim();
    row.state = String(req.body?.state || row.state || 'staged').trim() || 'staged';

    await factory.save();
    res.json(serializeFactory(factory.toObject()));
  } catch (err) {
    res.status(err?.status || 500).json({ error: err.message });
  }
});

router.delete('/:factoryId/rows/:rowId', requireAdminWrite, async (req, res) => {
  try {
    const factory = await CustomFactory.findById(req.params.factoryId);
    if (!factory) return res.status(404).json({ error: 'Factory not found' });
    const row = factory.rows.id(req.params.rowId);
    if (!row) return res.status(404).json({ error: 'Factory row not found' });
    row.deleteOne();
    await factory.save();
    res.json(serializeFactory(factory.toObject()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;