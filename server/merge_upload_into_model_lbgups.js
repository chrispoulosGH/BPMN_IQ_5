const mongoose = require('mongoose');
const XLSX = require('xlsx');
const fs = require('fs');
const Model = require('./models/Model');

async function parseUpload(path) {
  const workbook = XLSX.readFile(path, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(1);
  const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })[0].map(h => String(h || '').trim());
  const parsed = rows.map(r => headers.reduce((acc, h, i) => { acc[h] = r[i] || ''; return acc; }, {}));
  return { headers, rows: parsed };
}

function getComponentHeaders(headers) {
  return headers.filter(h => /components?$/i.test(String(h || '').trim()));
}

function getBaseName(header) {
  return String(header || '').replace(/components?$/i, '').trim();
}

function getComparable(v) { return String(v || '').trim().toLowerCase(); }

async function main(){
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const path = require('path');
  const uploadPath = path.join(__dirname, '..', 'data', 'LBGUPs Component Data.csv');
  if (!fs.existsSync(uploadPath)) { console.error('Upload file not found:', uploadPath); process.exit(1); }
  const { headers, rows } = await parseUpload(uploadPath);
  const compHeaders = getComponentHeaders(headers);
  console.log('Upload component headers:', compHeaders);
  const baseNames = compHeaders.map(getBaseName);
  console.log('Base names:', baseNames);

  const model = await Model.findOne({ name: 'LBGUPS' });
  if (!model) { console.error('Model LBGUPS not found'); process.exit(1); }

  const modelCols = model.modelCatalogColumns || [];
  console.log('Model catalog columns:', modelCols);

  // Determine matched headers in model for each base name: prefer exact match, else contains
  const matched = baseNames.map(base => {
    const exact = modelCols.find(c => getComparable(c) === getComparable(base));
    if (exact) return exact;
    const contains = modelCols.find(c => getComparable(String(c)).includes(getComparable(base)));
    return contains || null;
  });
  console.log('Matched model headers:', matched);

  const modelTuples = new Set((model.modelCatalogRows || []).map(r => {
    const vals = matched.map(m => getComparable(m ? (r.values?.[m] || '') : ''));
    return vals.join('\u001F');
  }));

  const uploadTuples = new Map();
  rows.forEach((r, idx) => {
    const vals = matched.map(m => getComparable(m ? (r[m] || '') : ''));
    const key = vals.join('\u001F');
    uploadTuples.set(key, uploadTuples.get(key) || { exampleRow: r, count: 0 });
    uploadTuples.get(key).count += 1;
  });

  const missing = [];
  for (const [key, info] of uploadTuples.entries()) {
    if (!modelTuples.has(key)) {
      missing.push({ tuple: key, exampleRow: info.exampleRow, count: info.count });
    }
  }

  console.log('Missing tuple count:', missing.length);
  if (!missing.length) { console.log('Nothing to add'); process.exit(0); }

  // Backup model
  const backupPath = `data/model_backup_LBGUPS_${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(model.toObject(), null, 2));
  console.log('Model backed up to', backupPath);

  // Append missing rows to model.modelCatalogRows with values for matched headers
  for (const m of missing) {
    const parts = m.tuple.split('\u001F');
    const newRow = { values: {} };
    matched.forEach((col, i) => {
      if (col) newRow.values[col] = parts[i] || '';
    });
    model.modelCatalogRows.push(newRow);
  }

  await model.save();
  console.log('Inserted', missing.length, 'rows into model LBGUPS.');
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
