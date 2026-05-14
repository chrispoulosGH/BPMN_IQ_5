/**
 * Seed script: Parse GB1029C Excel and load into MongoDB capabilities collection.
 * Usage: node scripts/seed-capabilities.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const Capability = require('../models/Capability');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
const EXCEL_PATH = path.resolve('C:/code/reference/GB1029C_TMForum_Capability_Map_v3.1.0.xlsx');

async function seed() {
  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  // Read Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['Capabilities'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Skip header row
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.length > 0 && r[14] != null);

  console.log(`Parsed ${dataRows.length} capabilities from Excel.`);

  // Map rows to documents
  const docs = dataRows.map((row) => ({
    aspectOrder: row[0] || 0,
    domainOrder: row[1] || 0,
    domainName: (row[2] || '').toString().trim(),
    aspect: (row[3] || '').toString().trim(),
    domainIndependentName: (row[4] || '').toString().trim(),
    name: (row[5] || '').toString().trim(),
    briefDescription: (row[6] || '').toString().trim(),
    fullDescription: (row[8] || '').toString().trim(),
    definition: (row[9] || '').toString().trim(),
    characteristics: (row[10] || '').toString().trim(),
    decompositionExamples: (row[11] || '').toString().trim(),
    references: (row[13] || '').toString().trim(),
    capabilityId: Number(row[14]),
    tmfStatus: (row[15] || '').toString().trim(),
    tmfVersion: (row[16] || '').toString().trim(),
  }));

  // Clear existing and bulk insert
  await Capability.deleteMany({});
  const result = await Capability.insertMany(docs, { ordered: false });
  console.log(`Inserted ${result.length} capabilities into MongoDB.`);

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
