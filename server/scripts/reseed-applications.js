/**
 * Reseed Application reference data from app_ref_data.csv.
 * Drops the existing Application collection and rebuilds from CSV.
 *
 * Usage: node scripts/reseed-applications.js
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Application } = require('../models/ReferenceData');

const CSV_PATH = path.resolve(__dirname, '../../data/app_ref_data.csv');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

async function reseed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);

  // Find column indices for the fields we need
  const colIdx = (name) => {
    const idx = headers.indexOf(name);
    if (idx === -1) console.warn(`WARNING: Column "${name}" not found in CSV`);
    return idx;
  };

  const cols = {
    name: colIdx('NAME'),
    correlationId: colIdx('CORRELATION_ID'),
    shortDescription: colIdx('SHORT_DESCRIPTION'),
    applicationType: colIdx('APPLICATION_TYPE'),
    businessCriticality: colIdx('BUSINESS_CRITICALITY'),
    discoverySource: colIdx('DISCOVERY_SOURCE'),
    installType: colIdx('INSTALL_TYPE'),
    cpniIndicator: colIdx('X_ATT2_ITAP_CPNI_INDICATOR'),
    customerFacing: colIdx('X_ATT2_ITAP_CUSTOMER_FACING'),
    handleSpi: colIdx('X_ATT2_ITAP_HANDLE_SPI'),
    internetFacing: colIdx('X_ATT2_ITAP_INTERNET_FACING'),
    pciData: colIdx('X_ATT2_ITAP_PCI_DATA'),
    soxFsa: colIdx('X_ATT2_ITAP_SOX_FSA'),
    storeSpi: colIdx('X_ATT2_ITAP_STORE_SPI'),
    acronym: colIdx('X_ATT2_ITAP_U_APPL_ACRON_NM'),
    applPurpose: colIdx('X_ATT2_ITAP_U_APPL_PURPOSE'),
    lifecycle: colIdx('X_ATT2_ITAP_U_APPLICATION_LIFECYCLE_2'),
    lifecycleStatus: colIdx('X_ATT2_ITAP_U_APPLICATION_LIFECYCLE_STATUS_1'),
    businessPurpose: colIdx('X_ATT2_ITAP_U_BUSINESS_PURPOSE'),
    pciDataStored: colIdx('X_ATT2_ITAP_U_PCI_DATA_STORED'),
    userInterface: colIdx('X_ATT2_ITAP_U_USER_INTERFACE'),
  };

  console.log(`CSV: ${lines.length - 1} data rows, ${headers.length} columns`);

  // Parse rows
  const docs = [];
  const seen = new Set();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const name = (fields[cols.name] || '').trim();
    if (!name) { skipped++; continue; }
    if (seen.has(name)) { skipped++; continue; } // dedup by name
    seen.add(name);

    const val = (idx) => {
      if (idx === -1) return null;
      const v = (fields[idx] || '').trim();
      return v || null;
    };

    docs.push({
      name,
      correlationId: val(cols.correlationId),
      shortDescription: val(cols.shortDescription),
      applicationType: val(cols.applicationType),
      businessCriticality: val(cols.businessCriticality),
      discoverySource: val(cols.discoverySource),
      installType: val(cols.installType),
      cpniIndicator: val(cols.cpniIndicator),
      customerFacing: val(cols.customerFacing),
      handleSpi: val(cols.handleSpi),
      internetFacing: val(cols.internetFacing),
      pciData: val(cols.pciData),
      soxFsa: val(cols.soxFsa),
      storeSpi: val(cols.storeSpi),
      acronym: val(cols.acronym),
      applPurpose: val(cols.applPurpose),
      lifecycle: val(cols.lifecycle),
      lifecycleStatus: val(cols.lifecycleStatus),
      businessPurpose: val(cols.businessPurpose),
      pciDataStored: val(cols.pciDataStored),
      userInterface: val(cols.userInterface),
    });
  }

  console.log(`Parsed ${docs.length} unique applications (${skipped} rows skipped)`);

  // Drop and rebuild
  console.log('Dropping Application collection...');
  await Application.deleteMany({});
  // Drop old indexes that may conflict with new schema
  try { await Application.collection.dropIndexes(); } catch (_) {}

  console.log('Inserting applications...');
  // Insert in batches of 500
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    await Application.insertMany(docs.slice(i, i + BATCH), { ordered: false });
  }

  const count = await Application.countDocuments();
  console.log(`Applications in DB: ${count}`);

  await mongoose.disconnect();
  console.log('Done.');
}

reseed().catch(err => {
  console.error(err);
  process.exit(1);
});
