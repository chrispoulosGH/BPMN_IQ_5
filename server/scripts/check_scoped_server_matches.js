'use strict';

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
const neighborhoodName = process.argv[2] || 'LBGUPS';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const components = await db.collection('components').find(
    { neighborhoodName, name: /^application$/i },
    { projection: { rows: 1, columns: 1 } }
  ).toArray();

  const names = new Set();
  const acronyms = new Set();
  const correlationIds = new Set();

  for (const component of components) {
    for (const row of Array.isArray(component?.rows) ? component.rows : []) {
      const values = row?.values || {};

      let name = normalizeText(values.name);
      if (!name) {
        for (const column of Array.isArray(component?.columns) ? component.columns : []) {
          const candidate = normalizeText(values[column]);
          if (candidate) {
            name = candidate;
            break;
          }
        }
      }

      const acronym = normalizeText(values.acronym || values.abbr);
      const correlationId = normalizeText(values.correlationId || values.correlation_id);

      if (name) names.add(name);
      if (acronym) acronyms.add(acronym);
      if (correlationId) correlationIds.add(correlationId);
    }
  }

  const scopedQuery = {
    $or: [
      names.size ? { 'linkedApplications.name': { $in: [...names] } } : null,
      acronyms.size ? { 'linkedApplications.acronym': { $in: [...acronyms] } } : null,
      correlationIds.size ? { 'linkedApplications.correlationId': { $in: [...correlationIds] } } : null,
    ].filter(Boolean),
  };

  const scopedMatches = scopedQuery.$or.length
    ? await db.collection('servers').countDocuments(scopedQuery)
    : 0;
  const allServers = await db.collection('servers').countDocuments({});

  console.log('neighborhood:', neighborhoodName);
  console.log('component identifiers:', {
    names: names.size,
    acronyms: acronyms.size,
    correlationIds: correlationIds.size,
  });
  console.log('scoped server matches:', scopedMatches);
  console.log('all servers:', allServers);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
