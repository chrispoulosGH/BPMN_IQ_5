const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const DatabaseInstance = require('../models/DatabaseInstance');

const PRIMARY_CSV_PATH = path.resolve(__dirname, '../../data/x_att2_itap_application_database_instances_coc.csv');
const SECONDARY_CSV_PATH = path.resolve(__dirname, '../../data/x_att2_itap_application_database_instances_coc_2.csv');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\u00a0/g, ' ').trim();
  return text || null;
}

function cleanVersion(value) {
  const text = clean(value);
  if (!text) return null;
  return text.replace(/^v(?:ersion)?\s*/i, '').trim() || null;
}

function pickFirst(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function normalizeVendor(row) {
  const explicitVendor = clean(row.dbinstance_vendor);
  if (explicitVendor) return explicitVendor;

  const className = clean(row.dbinstance_sys_class_name) || '';
  if (/oracle/i.test(className)) return 'Oracle';
  if (/mongo/i.test(className)) return 'MongoDB';
  if (/cassandra/i.test(className)) return 'Apache Cassandra';
  if (/sql/i.test(className)) return 'Microsoft SQL Server';
  if (/mysql/i.test(className)) return 'MySQL';
  if (/postgres/i.test(className)) return 'PostgreSQL';
  if (/db2/i.test(className)) return 'IBM Db2';
  if (/informix/i.test(className)) return 'Informix';
  if (/sybase/i.test(className)) return 'Sybase';
  if (/hbase/i.test(className)) return 'Apache HBase';
  if (/database/i.test(className)) return 'Unknown';

  return className || 'Unknown';
}

function buildSourceKey(row) {
  const instanceName = pickFirst(row.dbinstance_name, row.service_name);
  const className = pickFirst(row.dbinstance_sys_class_name, 'Database Instance');
  return instanceName ? `${instanceName}::${className}` : null;
}

function mergeField(target, key, value) {
  if (target[key] !== null && target[key] !== undefined && target[key] !== '') return;
  target[key] = value;
}

function loadRowsWithHeaders(filePath, headers) {
  const workbook = XLSX.readFile(filePath, { raw: false, dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (headers) {
    return XLSX.utils.sheet_to_json(sheet, { header: headers, range: 0, defval: '' });
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function reseed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const primaryRows = loadRowsWithHeaders(PRIMARY_CSV_PATH);
  const headers = primaryRows[0] ? Object.keys(primaryRows[0]) : [];
  const secondaryRows = loadRowsWithHeaders(SECONDARY_CSV_PATH, headers);
  const rows = [...primaryRows, ...secondaryRows];

  const byKey = new Map();
  let skipped = 0;

  for (const row of rows) {
    const sourceKey = buildSourceKey(row);
    if (!sourceKey) {
      skipped += 1;
      continue;
    }

    let doc = byKey.get(sourceKey);
    if (!doc) {
      doc = {
        sourceKey,
        apmNumber: clean(row.app_number),
        applicationCorrelationId: clean(row.app_correlation_id),
        applicationAcronym: clean(row.app_x_att2_itap_u_appl_acron_nm),
        applicationName: clean(row.app_name),
        applicationInstallStatus: clean(row.app_install_status),
        serviceName: clean(row.service_name),
        instanceName: clean(row.dbinstance_name),
        name: pickFirst(row.dbinstance_name, row.service_name),
        databaseClassName: clean(row.dbinstance_sys_class_name),
        applicationOwner: clean(row.app_it_application_owner),
        lowestLevelOwner: clean(row.coc_lowest_l5_it_owner),
        lowestLevelOwnerUserName: clean(row['coc_lowest_l5_it_owner.user_name']),
        version: cleanVersion(row.dbinstance_version),
        vendor: clean(row.dbinstance_vendor),
        ownedBy: clean(row.dbinstance_owned_by),
        location: clean(row.dbinstance_location),
        lifecycleStageStatus: clean(row.dbinstance_life_cycle_stage_status),
        normalizedVendor: normalizeVendor(row),
        linkedApplications: [],
        healthNotes: [],
        _linkedApplicationKeys: new Set(),
      };
      byKey.set(sourceKey, doc);
    }

    mergeField(doc, 'apmNumber', clean(row.app_number));
    mergeField(doc, 'applicationCorrelationId', clean(row.app_correlation_id));
    mergeField(doc, 'applicationAcronym', clean(row.app_x_att2_itap_u_appl_acron_nm));
    mergeField(doc, 'applicationName', clean(row.app_name));
    mergeField(doc, 'applicationInstallStatus', clean(row.app_install_status));
    mergeField(doc, 'serviceName', clean(row.service_name));
    mergeField(doc, 'instanceName', clean(row.dbinstance_name));
    mergeField(doc, 'name', pickFirst(row.dbinstance_name, row.service_name));
    mergeField(doc, 'databaseClassName', clean(row.dbinstance_sys_class_name));
    mergeField(doc, 'applicationOwner', clean(row.app_it_application_owner));
    mergeField(doc, 'lowestLevelOwner', clean(row.coc_lowest_l5_it_owner));
    mergeField(doc, 'lowestLevelOwnerUserName', clean(row['coc_lowest_l5_it_owner.user_name']));
    mergeField(doc, 'version', cleanVersion(row.dbinstance_version));
    mergeField(doc, 'vendor', clean(row.dbinstance_vendor));
    mergeField(doc, 'ownedBy', clean(row.dbinstance_owned_by));
    mergeField(doc, 'location', clean(row.dbinstance_location));
    mergeField(doc, 'lifecycleStageStatus', clean(row.dbinstance_life_cycle_stage_status));
    mergeField(doc, 'normalizedVendor', normalizeVendor(row));

    const appCorrelationId = clean(row.app_correlation_id);
    const appName = clean(row.app_name);
    const appKey = appCorrelationId || appName;
    if (appKey && !doc._linkedApplicationKeys.has(appKey)) {
      doc._linkedApplicationKeys.add(appKey);
      doc.linkedApplications.push({
        correlationId: appCorrelationId,
        name: appName,
        acronym: clean(row.app_x_att2_itap_u_appl_acron_nm),
        apmNumber: clean(row.app_number),
        serviceName: clean(row.service_name),
      });
    }
  }

  const docs = Array.from(byKey.values()).map((doc) => {
    delete doc._linkedApplicationKeys;
    return doc;
  });

  console.log(`Parsed ${docs.length} unique databases from ${rows.length} rows (${skipped} rows skipped)`);

  await DatabaseInstance.deleteMany({});
  try { await DatabaseInstance.collection.dropIndexes(); } catch (_) {}
  await DatabaseInstance.insertMany(docs, { ordered: false });

  console.log(`Databases in DB: ${await DatabaseInstance.countDocuments()}`);
  await mongoose.disconnect();
  console.log('Done.');
}

reseed().catch((err) => {
  console.error(err);
  process.exit(1);
});