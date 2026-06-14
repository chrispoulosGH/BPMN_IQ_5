'use strict';

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Component = require('../models/Component');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function compactKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '');
}

function toValuesObject(values) {
  if (!values) return {};
  if (values instanceof Map) return Object.fromEntries(values.entries());
  return { ...values };
}

function resolveAppName(rowValues, componentColumns) {
  const direct = normalizeText(rowValues?.name);
  if (direct) return direct;
  for (const column of Array.isArray(componentColumns) ? componentColumns : []) {
    const value = normalizeText(rowValues?.[column]);
    if (value) return value;
  }
  return '';
}

function addRef(refMap, ref) {
  const name = normalizeText(ref?.name);
  const acronym = normalizeText(ref?.acronym);
  const correlationId = normalizeText(ref?.correlationId);
  if (!name && !acronym && !correlationId) return;

  const key = `${normalizeKey(name)}|||${normalizeKey(acronym)}|||${normalizeKey(correlationId)}`;
  if (!refMap.has(key)) {
    refMap.set(key, {
      name,
      acronym,
      correlationId,
      count: 0,
      sourceKinds: new Set(),
    });
  }

  const row = refMap.get(key);
  row.count += 1;
  if (ref.sourceKind) row.sourceKinds.add(ref.sourceKind);
}

function bigrams(input) {
  const s = compactKey(input);
  if (s.length < 2) return [s].filter(Boolean);
  const grams = [];
  for (let i = 0; i < s.length - 1; i += 1) grams.push(s.slice(i, i + 2));
  return grams;
}

function diceSimilarity(a, b) {
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (!aGrams.length || !bGrams.length) return 0;

  const aCounts = new Map();
  for (const gram of aGrams) aCounts.set(gram, (aCounts.get(gram) || 0) + 1);

  let overlap = 0;
  for (const gram of bGrams) {
    const count = aCounts.get(gram) || 0;
    if (!count) continue;
    overlap += 1;
    aCounts.set(gram, count - 1);
  }

  return (2 * overlap) / (aGrams.length + bGrams.length);
}

function chooseMostFrequent(refs) {
  if (!refs.length) return null;
  return [...refs].sort((left, right) => right.count - left.count)[0];
}

function buildIndexes(refs) {
  const byName = new Map();
  const byCompactName = new Map();

  for (const ref of refs) {
    const nameKey = normalizeKey(ref.name);
    const compact = compactKey(ref.name);

    if (nameKey) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(ref);
    }

    if (compact) {
      if (!byCompactName.has(compact)) byCompactName.set(compact, []);
      byCompactName.get(compact).push(ref);
    }
  }

  return { byName, byCompactName };
}

function findBestRef(appName, indexes, refs) {
  const exact = chooseMostFrequent(indexes.byName.get(normalizeKey(appName)) || []);
  if (exact) return { ref: exact, mode: 'exact' };

  const compact = chooseMostFrequent(indexes.byCompactName.get(compactKey(appName)) || []);
  if (compact) return { ref: compact, mode: 'compact' };

  const appCompact = compactKey(appName);
  if (appCompact.length < 6) return { ref: null, mode: 'none' };

  let best = null;
  let second = null;
  for (const ref of refs) {
    const refCompact = compactKey(ref.name);
    if (!refCompact || refCompact.length < 6) continue;

    const score = diceSimilarity(appName, ref.name);
    if (!best || score > best.score) {
      second = best;
      best = { ref, score };
    } else if (!second || score > second.score) {
      second = { ref, score };
    }
  }

  if (!best) return { ref: null, mode: 'none' };

  const bestScore = best.score;
  const secondScore = second?.score || 0;
  const margin = bestScore - secondScore;

  if (bestScore >= 0.93 && margin >= 0.05) {
    return { ref: best.ref, mode: 'fuzzy' };
  }

  return { ref: null, mode: 'none' };
}

async function collectAssetRefs(db) {
  const refMap = new Map();

  const serverCursor = db.collection('servers').find({}, { projection: { linkedApplications: 1 } });
  for await (const server of serverCursor) {
    for (const linked of Array.isArray(server?.linkedApplications) ? server.linkedApplications : []) {
      addRef(refMap, {
        name: linked?.name,
        acronym: linked?.acronym,
        correlationId: linked?.correlationId,
        sourceKind: 'server',
      });
    }
  }

  const dbCursor = db.collection('databaseinstances').find(
    {},
    { projection: { applicationName: 1, applicationAcronym: 1, applicationCorrelationId: 1, linkedApplications: 1 } }
  );

  for await (const database of dbCursor) {
    addRef(refMap, {
      name: database?.applicationName,
      acronym: database?.applicationAcronym,
      correlationId: database?.applicationCorrelationId,
      sourceKind: 'database',
    });

    for (const linked of Array.isArray(database?.linkedApplications) ? database.linkedApplications : []) {
      addRef(refMap, {
        name: linked?.name,
        acronym: linked?.acronym,
        correlationId: linked?.correlationId,
        sourceKind: 'database-linked',
      });
    }
  }

  return [...refMap.values()];
}

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const refs = await collectAssetRefs(db);
  const indexes = buildIndexes(refs);

  const appComponents = await Component.find(
    { name: { $regex: /^application$/i } },
    { neighborhoodName: 1, name: 1, columns: 1, rows: 1 }
  );

  const stats = {
    componentsTouched: 0,
    rowsUpdated: 0,
    exactMatches: 0,
    compactMatches: 0,
    fuzzyMatches: 0,
    alreadyMapped: 0,
    noMatch: 0,
  };

  for (const component of appComponents) {
    let touched = false;

    for (const row of component.rows || []) {
      const values = toValuesObject(row.values);
      const appName = resolveAppName(values, component.columns);
      if (!appName) continue;

      const existingCorrelationId = normalizeText(values?.correlationId || values?.correlation_id);
      const existingAcronym = normalizeText(values?.acronym || values?.abbr);
      if (existingCorrelationId || existingAcronym) {
        stats.alreadyMapped += 1;
        continue;
      }

      const match = findBestRef(appName, indexes, refs);
      if (!match.ref) {
        stats.noMatch += 1;
        continue;
      }

      const nextValues = { ...values };
      if (match.ref.correlationId) nextValues.correlationId = match.ref.correlationId;
      if (match.ref.acronym) nextValues.acronym = match.ref.acronym;
      if (match.ref.name) nextValues.mappedAssetName = match.ref.name;
      nextValues.identifierMatchMode = match.mode;

      row.values = nextValues;
      touched = true;
      stats.rowsUpdated += 1;

      if (match.mode === 'exact') stats.exactMatches += 1;
      else if (match.mode === 'compact') stats.compactMatches += 1;
      else if (match.mode === 'fuzzy') stats.fuzzyMatches += 1;
    }

    if (touched) {
      stats.componentsTouched += 1;
      if (!dryRun) await component.save();
    }
  }

  console.log(dryRun ? 'DRY RUN COMPLETE' : 'BACKFILL COMPLETE');
  console.log('asset refs:', refs.length);
  console.log('components touched:', stats.componentsTouched);
  console.log('rows updated:', stats.rowsUpdated);
  console.log('exact matches:', stats.exactMatches);
  console.log('compact matches:', stats.compactMatches);
  console.log('fuzzy matches:', stats.fuzzyMatches);
  console.log('already mapped rows:', stats.alreadyMapped);
  console.log('no match rows:', stats.noMatch);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
