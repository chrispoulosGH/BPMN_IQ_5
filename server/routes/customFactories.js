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

function getCurrentUserLabel(req) {
  return req.currentUser?.displayName || req.currentUser?.userId || '';
}

function getCurrentUserId(req) {
  return req.currentUser?.userId || '';
}

function createValidationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getValidationMessage(error) {
  if (!error) return 'Unknown error';
  if (error?.errors && typeof error.errors === 'object') {
    const firstKey = Object.keys(error.errors)[0];
    if (firstKey && error.errors[firstKey]?.message) {
      return `${firstKey}: ${error.errors[firstKey].message}`;
    }
  }
  return error.message || 'Unknown error';
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

  await CustomFactory.updateMany(
    {
      $or: [
        { neighborhoodName: { $exists: false } },
        { neighborhoodName: null },
        { neighborhoodName: '' },
      ],
    },
    { $set: { neighborhoodName: DEFAULT_NEIGHBORHOOD_NAME } }
  );
}

async function ensureNeighborhoodRecordsFromFactories() {
  await ensureDefaultNeighborhood();

  const [factoryNeighborhoods, existingNeighborhoods] = await Promise.all([
    CustomFactory.distinct('neighborhoodName', { neighborhoodName: { $type: 'string', $ne: '' } }),
    FactoryNeighborhood.distinct('name'),
  ]);

  const existingNames = new Set(existingNeighborhoods.map((name) => String(name || '').trim()).filter(Boolean));
  const missingNames = factoryNeighborhoods
    .map((name) => String(name || '').trim())
    .filter((name) => name && !existingNames.has(name));

  if (!missingNames.length) return;

  await FactoryNeighborhood.insertMany(
    missingNames.map((name) => ({
      name,
      owner: name === DEFAULT_NEIGHBORHOOD_NAME ? 'System' : '',
      createdBy: name === DEFAULT_NEIGHBORHOOD_NAME ? 'system' : '',
    })),
    { ordered: false }
  ).catch((error) => {
    if (error?.code !== 11000) throw error;
  });
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
  const canWrite = role?.capabilities?.some((capability) => capability.permission && capability.permission !== 'Read');
  if (!canWrite) return res.status(403).json({ error: 'Write access required' });
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
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 2) throw createValidationError('Spreadsheet must include a header row and at least one data row');

  const headers = (matrix[0] || []).map((value) => String(value || '').trim());
  if (!headers.some(Boolean)) throw createValidationError('Spreadsheet header row is empty');

  const rawRows = matrix.slice(1)
    .map((row) => headers.reduce((acc, header, index) => {
      if (header) acc[header] = row[index] ?? '';
      return acc;
    }, {}))
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));

  if (!rawRows.length) throw createValidationError('Spreadsheet does not contain any data rows');
  const { rows, columns } = normalizeRowsAndColumns(rawRows);
  if (!columns.length) throw createValidationError('Spreadsheet does not contain any usable columns');
  validateFactoryRows(rows, columns);
  return { rows, columns, sheetName };
}

function parseNeighborhoodWorkbook(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No worksheet found in ${fileName || 'uploaded file'}`);
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 2) throw createValidationError('Model CSV must include a header row and at least one data row');

  const headers = (matrix[0] || []).map((value) => String(value || '').trim());
  if (!headers.some(Boolean)) throw createValidationError('Model CSV header row is empty');

  const rows = matrix.slice(1)
    .map((row) => headers.reduce((acc, header, index) => {
      if (header) acc[header] = row[index] ?? '';
      return acc;
    }, {}))
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));

  if (!rows.length) throw createValidationError('Model CSV does not contain any usable data rows');
  return { headers, rows, sheetName };
}

function parseModelCatalogWorkbook(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No worksheet found in ${fileName || 'uploaded file'}`);
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 2) throw createValidationError('Model CSV must include a header row and at least one data row');

  const seenHeaders = new Set();
  const columns = (matrix[0] || [])
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (seenHeaders.has(normalized)) {
        throw createValidationError(`Duplicate model column found: ${value}`);
      }
      seenHeaders.add(normalized);
      return true;
    });

  if (!columns.length) throw createValidationError('Model CSV header row is empty');

  const rows = matrix.slice(1)
    .map((row) => columns.reduce((acc, column, index) => {
      acc[column] = row[index] ?? '';
      return acc;
    }, {}))
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));

  if (!rows.length) throw createValidationError('Model CSV does not contain any usable data rows');
  return { columns, rows, sheetName };
}

function getNormalizedText(value) {
  return String(value ?? '').trim();
}

function getFactoryFieldName(label) {
  const trimmed = getNormalizedText(label);
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === PRIMARY_KEY_COLUMN) return PRIMARY_KEY_COLUMN;
  return trimmed.toLowerCase();
}

function splitMultiValue(value) {
  return getNormalizedText(value)
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeDistinctQualifierValues(currentValue, nextValue) {
  const merged = new Map();

  splitMultiValue(currentValue).forEach((value) => {
    merged.set(value.toLowerCase(), value);
  });
  splitMultiValue(nextValue).forEach((value) => {
    merged.set(value.toLowerCase(), value);
  });

  return Array.from(merged.values()).join(' | ');
}

function deriveNeighborhoodSchema(headers) {
  const factoryDefinitions = [];
  const normalizedFactoryNames = new Set();

  headers.forEach((header, index) => {
    const trimmedHeader = getNormalizedText(header);
    if (!trimmedHeader) return;

    if (/\bfactory$/i.test(trimmedHeader)) {
      const factoryName = trimmedHeader.replace(/\bfactory$/i, '').trim();
      if (!factoryName) return;
      const normalizedFactoryName = factoryName.toLowerCase();
      if (normalizedFactoryNames.has(normalizedFactoryName)) {
        throw createValidationError(`Duplicate factory column found for ${factoryName}`);
      }

      const parentFactoryName = factoryDefinitions[factoryDefinitions.length - 1]?.name || '';
      factoryDefinitions.push({
        name: factoryName,
        sourceColumnName: trimmedHeader,
        columnIndex: index,
        parentFactoryName,
        level: factoryDefinitions.length,
        qualifiers: [],
      });
      normalizedFactoryNames.add(normalizedFactoryName);
      return;
    }

    const matchingFactory = [...factoryDefinitions]
      .sort((left, right) => right.sourceColumnName.length - left.sourceColumnName.length)
      .find((factoryDefinition) => trimmedHeader.toLowerCase().startsWith(`${factoryDefinition.sourceColumnName.toLowerCase()} `));

    if (!matchingFactory) return;

    const qualifierName = trimmedHeader.slice(matchingFactory.sourceColumnName.length).trim();
    if (!qualifierName) return;
    const fieldName = getFactoryFieldName(qualifierName);
    if (!fieldName || fieldName === PRIMARY_KEY_COLUMN) {
      throw createValidationError(`Qualifier column ${trimmedHeader} resolves to an invalid field name`);
    }
    if (matchingFactory.qualifiers.some((qualifier) => qualifier.fieldName === fieldName)) {
      throw createValidationError(`Duplicate qualifier column found for ${matchingFactory.name}: ${qualifierName}`);
    }

    matchingFactory.qualifiers.push({
      name: qualifierName,
      sourceColumnName: trimmedHeader,
      fieldName,
      columnIndex: index,
    });
  });

  if (!factoryDefinitions.length) {
    throw createValidationError('Model CSV does not contain any factory columns');
  }

  return factoryDefinitions;
}

function buildNeighborhoodFactories({ neighborhoodName, rows, definitions, sourceFileName, owner, createdBy }) {
  const factoryRowMaps = new Map(definitions.map((definition) => [definition.name, new Map()]));

  rows.forEach((row, rowIndex) => {
    const rowFactoryValues = new Map(definitions.map((definition) => [definition.name, getNormalizedText(row[definition.sourceColumnName]) ]));

    definitions.forEach((definition) => {
      const factoryValue = rowFactoryValues.get(definition.name) || '';
      if (!factoryValue) return;

      const parentName = definition.parentFactoryName ? (rowFactoryValues.get(definition.parentFactoryName) || '') : '';
      if (definition.parentFactoryName && !parentName) {
        throw createValidationError(`Row ${rowIndex + 2}: ${definition.name} requires a ${definition.parentFactoryName} parent value`);
      }

      const qualifierValues = definition.qualifiers.reduce((acc, qualifier) => {
        acc[qualifier.fieldName] = getNormalizedText(row[qualifier.sourceColumnName]);
        return acc;
      }, {});

      const primaryKey = getNormalizedPrimaryKeyValue(factoryValue);
      const rowMap = factoryRowMaps.get(definition.name);
      const existingRow = rowMap.get(primaryKey);

      if (!existingRow) {
        rowMap.set(primaryKey, {
          values: { [PRIMARY_KEY_COLUMN]: factoryValue, ...qualifierValues },
          owner,
          state: 'staged',
          sourcedFrom: sourceFileName,
          createdBy,
          updatedBy: createdBy,
          parentFactoryName: definition.parentFactoryName,
          parentName,
        });
        return;
      }

      if ((existingRow.parentName || '') !== parentName) {
        throw createValidationError(`Factory value ${factoryValue} in ${definition.name} maps to multiple parents`);
      }

      Object.entries(qualifierValues).forEach(([fieldName, nextValue]) => {
        const currentValue = getNormalizedText(existingRow.values?.[fieldName]);
        if (!currentValue) {
          existingRow.values[fieldName] = nextValue;
          return;
        }
        if (nextValue && currentValue !== nextValue) {
          existingRow.values[fieldName] = mergeDistinctQualifierValues(currentValue, nextValue);
        }
      });
    });
  });

  return definitions.map((definition) => {
    const columns = [PRIMARY_KEY_COLUMN, ...definition.qualifiers.map((qualifier) => qualifier.fieldName)];
    const builtRows = Array.from(factoryRowMaps.get(definition.name).values());
    validateFactoryRows(builtRows.map((row) => row.values), columns);
    return {
      neighborhoodName,
      name: definition.name,
      sourceColumnName: definition.sourceColumnName,
      parentFactoryName: definition.parentFactoryName,
      qualifierColumns: definition.qualifiers.map((qualifier) => ({
        name: qualifier.name,
        sourceColumnName: qualifier.sourceColumnName,
        fieldName: qualifier.fieldName,
      })),
      columns,
      owner,
      createdBy,
      sourceFileName,
      rows: builtRows,
    };
  });
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
    sourceColumnName: factory.sourceColumnName || '',
    parentFactoryName: factory.parentFactoryName || '',
    columns: factory.columns,
    qualifierColumns: (factory.qualifierColumns || []).map((qualifier) => ({
      name: qualifier.name,
      sourceColumnName: qualifier.sourceColumnName,
      fieldName: qualifier.fieldName,
    })),
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
      sourcedFrom: row.sourcedFrom || '',
      createdBy: row.createdBy || '',
      updatedBy: row.updatedBy || '',
      parentFactoryName: row.parentFactoryName || '',
      parentName: row.parentName || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  };
}

function serializeModelCatalog(model) {
  const toPlainObject = (value) => {
    if (!value) return {};
    if (value instanceof Map) return Object.fromEntries(value.entries());
    if (typeof value.toObject === 'function') return value.toObject();
    return { ...value };
  };

  return {
    name: model.name,
    columns: model.modelCatalogColumns || [],
    rowCount: Array.isArray(model.modelCatalogRows) ? model.modelCatalogRows.length : 0,
    rows: (model.modelCatalogRows || []).map((row) => ({ values: toPlainObject(row.values) })),
    sourceFileName: model.sourceFileName || '',
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

router.get('/neighborhoods', async (_req, res) => {
  try {
    await migrateFactoriesToDefaultNeighborhood();
    await ensureNeighborhoodRecordsFromFactories();
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

router.get('/neighborhoods/:name/catalog', async (req, res) => {
  try {
    await ensureNeighborhoodRecordsFromFactories();
    const name = String(req.params?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Model name is required' });

    const model = await FactoryNeighborhood.findOne({ name }).lean();
    if (!model) return res.status(404).json({ error: 'Model not found' });

    res.json(serializeModelCatalog(model));
  } catch (err) {
    res.status(err?.status || 500).json({ error: getValidationMessage(err) });
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

router.post('/neighborhoods', requireAdminWrite, upload.single('file'), async (req, res) => {
  const name = String(req.body?.name || req.body?.neighborhoodName || '').trim();
  if (!name) return res.status(400).json({ error: 'Model name is required' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'Model CSV file is required' });
  let neighborhood = null;
  try {
    await ensureDefaultNeighborhood();
    await ensureNeighborhoodRecordsFromFactories();
    const existing = await FactoryNeighborhood.exists({ name });
    if (existing) return res.status(409).json({ error: 'Model already exists' });

    const owner = getCurrentUserLabel(req);
    const createdBy = getCurrentUserId(req);
    const { columns, rows } = parseModelCatalogWorkbook(req.file.buffer, req.file.originalname);
    const { headers, rows: factorySourceRows } = parseNeighborhoodWorkbook(req.file.buffer, req.file.originalname);
    const schemaFactories = deriveNeighborhoodSchema(headers);
    const builtFactories = buildNeighborhoodFactories({
      neighborhoodName: name,
      rows: factorySourceRows,
      definitions: schemaFactories,
      sourceFileName: req.file.originalname,
      owner,
      createdBy,
    });

    neighborhood = await FactoryNeighborhood.create({
      name,
      owner,
      createdBy,
      sourceFileName: req.file.originalname,
      modelCatalogColumns: columns,
      modelCatalogRows: rows.map((row) => ({ values: row })),
      schemaFactories: schemaFactories.map((factory) => ({
        name: factory.name,
        sourceColumnName: factory.sourceColumnName,
        parentFactoryName: factory.parentFactoryName,
        qualifierColumns: factory.qualifiers.map((qualifier) => ({
          name: qualifier.name,
          sourceColumnName: qualifier.sourceColumnName,
          fieldName: qualifier.fieldName,
        })),
        level: factory.level,
      })),
    });

    await CustomFactory.insertMany(builtFactories, { ordered: true });

    res.status(201).json({
      name: neighborhood.name,
      owner: neighborhood.owner,
      createdBy: neighborhood.createdBy,
      factoryCount: builtFactories.length,
      createdAt: neighborhood.createdAt,
      updatedAt: neighborhood.updatedAt,
    });
  } catch (err) {
    if (neighborhood?._id) {
      await Promise.all([
        FactoryNeighborhood.deleteOne({ _id: neighborhood._id }).catch(() => null),
        CustomFactory.deleteMany({ neighborhoodName: name }).catch(() => null),
      ]);
    }
    if (err?.code === 11000) return res.status(409).json({ error: 'Model already exists' });
    res.status(err?.status || 500).json({ error: getValidationMessage(err) });
  }
});

router.delete('/neighborhoods/:name', requireAdminWrite, async (req, res) => {
  const name = String(req.params?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Model name is required' });

  try {
    const neighborhood = await FactoryNeighborhood.findOne({ name }, { _id: 1, name: 1 }).lean();
    if (!neighborhood) return res.status(404).json({ error: 'Model not found' });

    const [deletedFactories, deletedNeighborhood] = await Promise.all([
      CustomFactory.deleteMany({ neighborhoodName: name }),
      FactoryNeighborhood.deleteOne({ _id: neighborhood._id }),
    ]);

    if ((deletedNeighborhood.deletedCount || 0) !== 1) {
      throw createValidationError(`Failed to delete model ${name}`, 500);
    }

    const remainingFactoryCount = await CustomFactory.countDocuments({ neighborhoodName: name });
    if (remainingFactoryCount > 0) {
      throw createValidationError(`Model ${name} still has ${remainingFactoryCount} factories after delete`, 500);
    }

    res.json({
      success: true,
      name,
      deletedNeighborhoodCount: deletedNeighborhood.deletedCount || 0,
      deletedFactoryCount: deletedFactories.deletedCount || 0,
    });
  } catch (err) {
    res.status(err?.status || 500).json({ error: getValidationMessage(err) });
  }
});

router.post('/upload', requireAdminWrite, upload.single('file'), async (req, res) => {
  const neighborhoodName = String(req.body?.neighborhoodName || '').trim();
  const factoryName = String(req.body?.factoryName || '').trim();
  if (!neighborhoodName) return res.status(400).json({ error: 'Model name is required' });
  if (!factoryName) return res.status(400).json({ error: 'Factory name is required' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'Spreadsheet file is required' });

  try {
    await ensureDefaultNeighborhood();
    const neighborhood = await FactoryNeighborhood.findOne({ name: neighborhoodName }).lean();
    if (!neighborhood) return res.status(404).json({ error: 'Model not found' });
    const { rows, columns } = parseWorkbookRows(req.file.buffer, req.file.originalname);
    const owner = req.currentUser?.displayName || req.currentUser?.userId || '';
    const createdBy = req.currentUser?.userId || '';
    const factory = await CustomFactory.create({
      neighborhoodName,
      name: factoryName,
      sourceColumnName: factoryName,
      parentFactoryName: '',
      columns,
      qualifierColumns: columns.filter((column) => column !== PRIMARY_KEY_COLUMN).map((column) => ({
        name: column,
        sourceColumnName: column,
        fieldName: column,
      })),
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
        sourcedFrom: req.file.originalname,
        createdBy,
        updatedBy: createdBy,
      })),
    });
    res.status(201).json(serializeFactory(factory.toObject()));
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Factory already exists in this model' });
    res.status(err?.status || 500).json({ error: getValidationMessage(err) });
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
    row.updatedBy = getCurrentUserId(req);

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

router.delete('/:factoryId', requireAdminWrite, async (req, res) => {
  try {
    const factory = await CustomFactory.findById(req.params.factoryId).lean();
    if (!factory) return res.status(404).json({ error: 'Factory not found' });

    await CustomFactory.deleteOne({ _id: factory._id });
    await FactoryNeighborhood.updateOne(
      { name: factory.neighborhoodName },
      {
        $pull: {
          schemaFactories: {
            $or: [
              { name: factory.name },
              ...(factory.sourceColumnName ? [{ sourceColumnName: factory.sourceColumnName }] : []),
            ],
          },
        },
      }
    );

    res.json({ success: true, factoryId: String(factory._id), neighborhoodName: factory.neighborhoodName, name: factory.name });
  } catch (err) {
    res.status(err?.status || 500).json({ error: getValidationMessage(err) });
  }
});

module.exports = router;