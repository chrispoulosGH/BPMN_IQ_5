/**
 * upsert_applications.js
 *
 * Upserts Application documents from app_ref_data.csv.
 * Uses updateOne + upsert:true so only CSV-sourced fields are set —
 * any other fields on existing documents (cost data, custom fields, etc.)
 * are left completely untouched.
 *
 * Usage: node upsert_applications.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const CSV_PATH = path.resolve(__dirname, '../data/app_ref_data.csv');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

// ── CSV parser (handles quoted fields with embedded commas/newlines) ──────────
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

async function run() {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('applications');
  console.log('Connected to MongoDB —', MONGO_URI);

  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);

  const idx = (colName) => {
    const i = headers.indexOf(colName);
    if (i === -1) console.warn(`  WARNING: column "${colName}" not found`);
    return i;
  };

  // Map CSV columns → schema fields
  const COLS = {
    name:             idx('NAME'),
    correlationId:    idx('CORRELATION_ID'),
    shortDescription: idx('SHORT_DESCRIPTION'),
    applicationType:  idx('APPLICATION_TYPE'),
    businessCriticality: idx('BUSINESS_CRITICALITY'),
    discoverySource:  idx('DISCOVERY_SOURCE'),
    installType:      idx('INSTALL_TYPE'),
    cpniIndicator:    idx('X_ATT2_ITAP_CPNI_INDICATOR'),
    customerFacing:   idx('X_ATT2_ITAP_CUSTOMER_FACING'),
    handleSpi:        idx('X_ATT2_ITAP_HANDLE_SPI'),
    internetFacing:   idx('X_ATT2_ITAP_INTERNET_FACING'),
    pciData:          idx('X_ATT2_ITAP_PCI_DATA'),
    soxFsa:           idx('X_ATT2_ITAP_SOX_FSA'),
    storeSpi:         idx('X_ATT2_ITAP_STORE_SPI'),
    acronym:          idx('X_ATT2_ITAP_U_APPL_ACRON_NM'),
    applPurpose:      idx('X_ATT2_ITAP_U_APPL_PURPOSE'),
    lifecycle:        idx('X_ATT2_ITAP_U_APPLICATION_LIFECYCLE_2'),
    lifecycleStatus:  idx('X_ATT2_ITAP_U_APPLICATION_LIFECYCLE_STATUS_1'),
    businessPurpose:  idx('X_ATT2_ITAP_U_BUSINESS_PURPOSE'),
    pciDataStored:    idx('X_ATT2_ITAP_U_PCI_DATA_STORED'),
    userInterface:    idx('X_ATT2_ITAP_U_USER_INTERFACE'),
  };

  console.log(`CSV: ${lines.length - 1} data rows`);

  const val = (fields, i) => {
    if (i === -1) return null;
    const v = (fields[i] || '').trim();
    return v || null;
  };

  let upserted = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set();
  const BATCH = 200;
  const ops = [];

  const flush = async () => {
    if (!ops.length) return;
    const res = await col.bulkWrite(ops, { ordered: false });
    upserted += res.upsertedCount;
    updated  += res.modifiedCount;
    ops.length = 0;
  };

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const name = val(fields, COLS.name);
    if (!name) { skipped++; continue; }
    if (seen.has(name)) { skipped++; continue; }  // keep first occurrence only
    seen.add(name);

    const setDoc = { name };
    for (const [field, colI] of Object.entries(COLS)) {
      if (field === 'name') continue;
      setDoc[field] = val(fields, colI);
    }

    ops.push({
      updateOne: {
        filter: { name },
        update: { $set: setDoc },
        upsert: true,
      },
    });

    if (ops.length >= BATCH) await flush();
  }
  await flush();

  const total = await col.countDocuments();
  console.log(`\nUpsert complete:`);
  console.log(`  Inserted (new): ${upserted}`);
  console.log(`  Updated (existing): ${updated}`);
  console.log(`  Rows skipped (blank name / duplicate): ${skipped}`);
  console.log(`  Total applications in collection: ${total}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
