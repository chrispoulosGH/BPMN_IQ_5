const fs = require('fs');
const path = require('path');

const modelPath = path.join(__dirname, '..', 'data', 'LBGUPS Model Data.csv');
const srcPath = path.join(__dirname, '..', 'data', 'LBGUPs Component Data.csv');

// Minimal CSV parser that handles quoted fields and commas inside quotes
function parseCsv(p) {
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      obj[headers[i]] = fields[i] ?? '';
    }
    return obj;
  }).filter((r) => Object.values(r).some((v) => String(v || '').trim()));
  return { headers, rows };
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') { result.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result.map((v) => v.trim());
}

function getComparable(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

try {
  const model = parseCsv(modelPath);
  const src = parseCsv(srcPath);

  const compCols = src.headers.filter((h) => /components?$/i.test(h));
  if (!compCols.length) {
    console.error('No "Component" columns found in upload file');
    process.exit(2);
  }

  const compBaseNames = compCols.map((h) => h.replace(/components?$/i, '').trim());
  console.log('Component columns (upload):', compCols);
  console.log('Upload base names:', compBaseNames);

  const modelHeaderLower = model.headers.map((h) => String(h || '').trim().toLowerCase().replace(/\s*component\s*$/,'').trim());
  // Determine which upload component base names match model columns
  const matched = [];
  const unmatched = [];
  compBaseNames.forEach((base, idx) => {
    const pos = modelHeaderLower.indexOf(base.toLowerCase());
    if (pos >= 0) matched.push({ uploadHeader: compCols[idx], base, modelHeaderIndex: pos });
    else unmatched.push({ uploadHeader: compCols[idx], base });
  });
  console.log('Matched component columns:', matched.map(m=>m.uploadHeader));
  if (unmatched.length) console.warn('Unmatched upload component columns (will be ignored for tuple validation):', unmatched.map(u=>u.uploadHeader));

  const tupleSet = new Set();
  const usedModelCols = matched.map((m) => ({ base: m.base, header: model.headers[m.modelHeaderIndex], index: m.modelHeaderIndex }));
  model.rows.forEach((row) => {
    const tuple = usedModelCols.map((c) => getComparable(row[c.header] || '')).join('\u001F');
    tupleSet.add(tuple);
  });

  const fails = [];
  src.rows.forEach((row, ri) => {
    const tuple = usedModelCols.map((c) => {
      // upload header corresponding to this base name
      const uploadHeader = compCols.find(h => h.replace(/components?$/i,'').trim().toLowerCase() === c.base.toLowerCase());
      return getComparable(row[uploadHeader] || '');
    }).join('\u001F');
    if (!tupleSet.has(tuple)) {
      fails.push({ rowNumber: ri + 2, tuple, values: Object.fromEntries(usedModelCols.map((c) => [c.header, String(row[compCols.find(h=>h.replace(/components?$/i,'').trim().toLowerCase()===c.base.toLowerCase())] || '')])) });
    }
  });

  console.log('Total upload rows:', src.rows.length);
  console.log('Total failing tuples:', fails.length);
  console.log('First 20 failing rows:');
  console.log(JSON.stringify(fails.slice(0, 20), null, 2));
} catch (e) {
  console.error('ERROR', e && e.message ? e.message : e);
  process.exit(1);
}
