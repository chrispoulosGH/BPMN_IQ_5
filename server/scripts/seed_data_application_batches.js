'use strict';

const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { materializeFromBatches } = require('../lib/materializer');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
const CSV_PATH = path.resolve(__dirname, '../../data/Application Data.csv');
const BATCH_SIZE = Number.parseInt(process.env.DATA_APPLICATION_BATCH_SIZE || '100', 10);
const NEIGHBORHOOD_NAME = String(process.env.DATA_APPLICATION_NEIGHBORHOOD || 'System Components').trim();
const SOURCE_FILE_NAME = path.basename(CSV_PATH);
const COMPONENT_HEADER = 'Application Component';
const CORRELATION_HEADER = 'CORRELATION_ID Qualifier';

function clean(value) {
  return String(value ?? '').trim();
}

function fieldName(label) {
  const text = clean(label);
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function readRows() {
  const workbook = XLSX.readFile(CSV_PATH, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const rows = readRows();
  if (!rows.length) throw new Error(`No rows found in ${CSV_PATH}`);

  const headers = Object.keys(rows[0] || {});
  if (!headers.includes(COMPONENT_HEADER)) {
    throw new Error(`Missing required column: ${COMPONENT_HEADER}`);
  }

  const qualifierColumns = headers
    .filter((header) => header !== COMPONENT_HEADER)
    .map((header) => ({
      name: header,
      sourceColumnName: header,
      fieldName: fieldName(header),
    }))
    .filter((column) => column.fieldName);

  const columns = [
    'name',
    ...qualifierColumns.map((column) => column.fieldName),
    'correlation_id',
  ].filter((column, index, all) => column && all.indexOf(column) === index);

  const rowDocs = rows
    .map((row) => {
      const name = clean(row[COMPONENT_HEADER]);
      if (!name) return null;
      const values = { name };
      qualifierColumns.forEach((column) => {
        values[column.fieldName] = clean(row[column.sourceColumnName]);
      });
      values.correlation_id = clean(row[CORRELATION_HEADER]) || values.correlation_id || '';
      return {
        values,
        foreignKeys: {},
        owner: 'system',
        state: 'staged',
        sourcedFrom: SOURCE_FILE_NAME,
        createdBy: 'system',
        updatedBy: 'system',
        parentFactoryName: '',
        parentName: '',
      };
    })
    .filter(Boolean);

  const dataBatches = db.collection('dataBatches');
  const deleteResult = await dataBatches.deleteMany({
    loadDomain: 'data',
    dataType: { $regex: /^Application$/i },
    sourceFileName: SOURCE_FILE_NAME,
  });

  const now = new Date();
  const docs = [];
  for (let index = 0; index < rowDocs.length; index += BATCH_SIZE) {
    docs.push({
      neighborhoodName: NEIGHBORHOOD_NAME,
      modelName: '',
      name: 'Application',
      loadDomain: 'data',
      dataType: 'Application',
      sourceColumnName: COMPONENT_HEADER,
      shortDescription: '',
      parentFactoryName: '',
      componentType: 'Application',
      columns,
      qualifierColumns,
      foreignKeyColumns: [],
      owner: 'system',
      createdBy: 'system',
      sourceFileName: SOURCE_FILE_NAME,
      rows: rowDocs.slice(index, index + BATCH_SIZE),
      batchId: `data-application-${now.getTime()}-${Math.floor(index / BATCH_SIZE) + 1}`,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (docs.length) await dataBatches.insertMany(docs, { ordered: true });

  console.log(JSON.stringify({
    sourceFileName: SOURCE_FILE_NAME,
    deletedBatches: deleteResult.deletedCount || 0,
    insertedBatches: docs.length,
    insertedRows: rowDocs.length,
    columns: columns.length,
    neighborhoodName: NEIGHBORHOOD_NAME,
  }, null, 2));

  try {
    await materializeFromBatches({ neighborhoodName: NEIGHBORHOOD_NAME, domain: 'data' });
  } catch (err) {
    console.warn('[seed_data_application_batches] materialize failed:', err && err.message);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});