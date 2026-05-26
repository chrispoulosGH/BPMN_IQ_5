'use strict';
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const CSV_PATH = path.resolve(__dirname, '../data/app_ref_data.csv');
const MONGO_URI = 'mongodb://127.0.0.1:27017/bpmn_iq';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

(async () => {
  await mongoose.connect(MONGO_URI);

  // Build set of names from CSV
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const nameIdx = headers.indexOf('NAME');
  const csvNames = new Set();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const name = (fields[nameIdx] || '').trim();
    if (name) csvNames.add(name);
  }
  console.log(`CSV unique names loaded: ${csvNames.size}`);

  // Get all names from MongoDB
  const apps = await mongoose.connection
    .collection('applications')
    .find({}, { projection: { name: 1, _id: 0 } })
    .toArray();

  const notInCSV = apps
    .map(a => a.name)
    .filter(n => n && !csvNames.has(n))
    .sort();

  console.log(`\nApps in MongoDB NOT in CSV: ${notInCSV.length}`);
  notInCSV.forEach(n => console.log(' -', n));

  if (notInCSV.length > 0) {
    const result = await mongoose.connection
      .collection('applications')
      .deleteMany({ name: { $in: notInCSV } });
    console.log(`\nDeleted: ${result.deletedCount} documents`);
  }

  const remaining = await mongoose.connection.collection('applications').countDocuments();
  console.log(`Remaining applications: ${remaining}`);

  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
