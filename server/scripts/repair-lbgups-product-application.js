const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const Component = require('../models/Component');

const NEIGHBORHOOD = 'LBGUPS';
const PRIMARY_KEY_COLUMN = 'name';
const SOURCE_FILE = path.resolve(__dirname, '../../data/LBGUPs Component Data.csv');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function getHeaderKey(headers, candidates) {
  for (let i = 0; i < candidates.length; i += 1) {
    const cand = lower(candidates[i]);
    for (let h = 0; h < headers.length; h += 1) {
      if (lower(headers[h]) === cand) return headers[h];
    }
  }
  return '';
}

function parseRows(filePath) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', raw: false, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No worksheet found in source file');

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (!matrix.length) throw new Error('Source file is empty');

  const headers = (matrix[0] || []).map((v) => text(v)).filter(Boolean);
  const rows = matrix.slice(1)
    .map((row) => {
      const out = {};
      for (let i = 0; i < headers.length; i += 1) {
        out[headers[i]] = row[i] == null ? '' : row[i];
      }
      return out;
    })
    .filter((row) => Object.keys(row).some((k) => text(row[k])));

  return { headers, rows };
}

function distinctValues(rows, header) {
  const seen = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = text(rows[i][header]);
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  }
  return Array.from(seen.values());
}

async function upsertComponent(options) {
  const name = options.name;
  const sourceColumnName = options.sourceColumnName;
  const parentFactoryName = options.parentFactoryName;
  const values = options.values;

  let component = await Component.findOne({ neighborhoodName: NEIGHBORHOOD, name });
  const nowUser = 'system-repair';
  const sourceFileName = path.basename(SOURCE_FILE);

  if (!component) {
    component = new Component({
      neighborhoodName: NEIGHBORHOOD,
      name,
      sourceColumnName,
      parentFactoryName,
      qualifierColumns: [],
      columns: [PRIMARY_KEY_COLUMN],
      owner: '',
      createdBy: nowUser,
      sourceFileName,
      rows: [],
    });
  }

  component.sourceColumnName = component.sourceColumnName || sourceColumnName;
  component.parentFactoryName = component.parentFactoryName || parentFactoryName;
  component.columns = Array.isArray(component.columns) && component.columns.length
    ? component.columns
    : [PRIMARY_KEY_COLUMN];
  component.sourceFileName = sourceFileName;

  const existing = new Set((component.rows || []).map((row) => lower(row.values && row.values.get
    ? row.values.get(PRIMARY_KEY_COLUMN)
    : row.values && row.values[PRIMARY_KEY_COLUMN])));

  let inserted = 0;
  for (let i = 0; i < values.length; i += 1) {
    const val = text(values[i]);
    const key = val.toLowerCase();
    if (!key || existing.has(key)) continue;

    component.rows.push({
      values: { [PRIMARY_KEY_COLUMN]: val },
      owner: '',
      state: 'staged',
      sourcedFrom: sourceFileName,
      createdBy: nowUser,
      updatedBy: nowUser,
      parentFactoryName,
      parentName: '',
    });
    existing.add(key);
    inserted += 1;
  }

  await component.save();
  return { inserted, totalRows: (component.rows || []).length };
}

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error('Source file not found: ' + SOURCE_FILE);
  }

  const parsed = parseRows(SOURCE_FILE);
  const productHeader = getHeaderKey(parsed.headers, ['Product Component', 'product']);
  const applicationHeader = getHeaderKey(parsed.headers, ['Application Component', 'application', 'applications']);

  if (!productHeader) throw new Error('Could not find Product header in source file');
  if (!applicationHeader) throw new Error('Could not find Application header in source file');

  const productValues = distinctValues(parsed.rows, productHeader);
  const applicationValues = distinctValues(parsed.rows, applicationHeader);

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  await mongoose.connect(mongoUri);

  try {
    const productResult = await upsertComponent({
      name: 'Product',
      sourceColumnName: productHeader,
      parentFactoryName: 'Channel',
      values: productValues,
    });

    const appResult = await upsertComponent({
      name: 'Application',
      sourceColumnName: applicationHeader,
      parentFactoryName: 'Task',
      values: applicationValues,
    });

    console.log('Repair completed for neighborhood:', NEIGHBORHOOD);
    console.log('Product header:', productHeader, 'distinct:', productValues.length, 'inserted:', productResult.inserted, 'total rows:', productResult.totalRows);
    console.log('Application header:', applicationHeader, 'distinct:', applicationValues.length, 'inserted:', appResult.inserted, 'total rows:', appResult.totalRows);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
