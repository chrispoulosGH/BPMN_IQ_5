const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const Server = require('../models/Server');

const CSV_PATH = path.resolve(__dirname, '../../data/ITAP_SRV_BRD_appication_homegrown_production.csv');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\u00a0/g, ' ').trim();
  return text || null;
}

function cleanNumber(value) {
  const text = clean(value);
  if (!text) return null;
  const numeric = Number(text.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanBoolean(value) {
  const text = clean(value);
  if (!text) return null;
  if (/^(true|y|yes|1)$/i.test(text)) return true;
  if (/^(false|n|no|0)$/i.test(text)) return false;
  return null;
}

function pickFirst(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function buildSourceKey(row) {
  return pickFirst(row.SVR_SYS_ID, row.SVR_OBJ_ID, row.SVR_NM, row.SVR_FQDN, row.SVR_HOST_NM, row.SVR_IP_ADDR);
}

function mergeField(target, key, value) {
  if (target[key] !== null && target[key] !== undefined && target[key] !== '') return;
  target[key] = value;
}

async function reseed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const workbook = XLSX.readFile(CSV_PATH, { raw: false, dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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
        name: pickFirst(row.SVR_NM, row.SVR_HOST_NM, row.SVR_FQDN, row.SVR_IP_ADDR),
        serverSystemId: clean(row.SVR_SYS_ID),
        objectId: clean(row.SVR_OBJ_ID),
        assetId: clean(row.SVR_ASSET_ID),
        assetTag: clean(row.SVR_ASSET_TAG),
        hostName: clean(row.SVR_HOST_NM),
        fqdn: clean(row.SVR_FQDN),
        ipAddress: clean(row.SVR_IP_ADDR),
        macAddress: clean(row.SVR_MAC_ADDR),
        environment: clean(row.SVR_ENVRN),
        installStatus: clean(row.SVR_INSL_STS),
        operationalStatus: clean(row.SVR_OPRNL_STS),
        lifecycleStage: clean(row.SVR_LFCYC_STG),
        lifecycleStatus: clean(row.SVR_LFCYC_STG_STS),
        usedFor: clean(row.SVR_USED_FOR),
        os: clean(row.SVR_OS),
        osVersion: clean(row.SVR_OS_VRSN),
        osDomain: clean(row.SVR_OS_DOMN),
        osServicePack: clean(row.SVR_OS_SRV_PACK),
        normalizedOs: clean(row.SVR_NRMLZ_OS),
        normalizedOsVersion: clean(row.SVR_NRMLZ_OS_VRSN),
        normalizedOsServicePack: clean(row.SVR_NRMLZ_OS_SRV_PACK),
        vendorName: clean(row.SVR_VNDR_NM),
        manufacturer: clean(row.SVR_MNFCTR),
        modelNumber: pickFirst(row.SVR_MODEL_NBR, row.SVR_MODEL_ID),
        serialNumber: clean(row.SVR_SER_NBR),
        cpuCount: cleanNumber(row.SVR_CPU_COUNT),
        cpuName: pickFirst(row.SVR_NRMLZ_CPU_NM, row.SVR_CPU_NM, row.SVR_PRCSR_NM, row.SVR_DISC_CPU_NM),
        cpuSpeed: pickFirst(row.SVR_NRMLZ_CPU_SPEED, row.SVR_CPU_SPEED),
        ram: cleanNumber(row.SVR_RAM),
        location: clean(row.SVR_LOC),
        supportGroup: clean(row.SVR_SUPT_GRP),
        supportedBy: clean(row.SVR_SUPTED_BY),
        managedByGroup: clean(row.SVR_MNGD_BY_GRP),
        cloudAccountId: clean(row.SVR_CLD_ACCT_ID),
        internetFacing: clean(row.SVR_INTNET_FCG),
        virtualized: cleanBoolean(row.SVR_VRTL),
        className: clean(row.SVR_SYS_CLASS_NM),
        relationTypes: [],
        relationPorts: [],
        linkedApplications: [],
        _linkedApplicationKeys: new Set(),
        _relationTypes: new Set(),
        _relationPorts: new Set(),
      };
      byKey.set(sourceKey, doc);
    }

    mergeField(doc, 'name', pickFirst(row.SVR_NM, row.SVR_HOST_NM, row.SVR_FQDN, row.SVR_IP_ADDR));
    mergeField(doc, 'serverSystemId', clean(row.SVR_SYS_ID));
    mergeField(doc, 'objectId', clean(row.SVR_OBJ_ID));
    mergeField(doc, 'assetId', clean(row.SVR_ASSET_ID));
    mergeField(doc, 'assetTag', clean(row.SVR_ASSET_TAG));
    mergeField(doc, 'hostName', clean(row.SVR_HOST_NM));
    mergeField(doc, 'fqdn', clean(row.SVR_FQDN));
    mergeField(doc, 'ipAddress', clean(row.SVR_IP_ADDR));
    mergeField(doc, 'macAddress', clean(row.SVR_MAC_ADDR));
    mergeField(doc, 'environment', clean(row.SVR_ENVRN));
    mergeField(doc, 'installStatus', clean(row.SVR_INSL_STS));
    mergeField(doc, 'operationalStatus', clean(row.SVR_OPRNL_STS));
    mergeField(doc, 'lifecycleStage', clean(row.SVR_LFCYC_STG));
    mergeField(doc, 'lifecycleStatus', clean(row.SVR_LFCYC_STG_STS));
    mergeField(doc, 'usedFor', clean(row.SVR_USED_FOR));
    mergeField(doc, 'os', clean(row.SVR_OS));
    mergeField(doc, 'osVersion', clean(row.SVR_OS_VRSN));
    mergeField(doc, 'osDomain', clean(row.SVR_OS_DOMN));
    mergeField(doc, 'osServicePack', clean(row.SVR_OS_SRV_PACK));
    mergeField(doc, 'normalizedOs', clean(row.SVR_NRMLZ_OS));
    mergeField(doc, 'normalizedOsVersion', clean(row.SVR_NRMLZ_OS_VRSN));
    mergeField(doc, 'normalizedOsServicePack', clean(row.SVR_NRMLZ_OS_SRV_PACK));
    mergeField(doc, 'vendorName', clean(row.SVR_VNDR_NM));
    mergeField(doc, 'manufacturer', clean(row.SVR_MNFCTR));
    mergeField(doc, 'modelNumber', pickFirst(row.SVR_MODEL_NBR, row.SVR_MODEL_ID));
    mergeField(doc, 'serialNumber', clean(row.SVR_SER_NBR));
    mergeField(doc, 'cpuCount', cleanNumber(row.SVR_CPU_COUNT));
    mergeField(doc, 'cpuName', pickFirst(row.SVR_NRMLZ_CPU_NM, row.SVR_CPU_NM, row.SVR_PRCSR_NM, row.SVR_DISC_CPU_NM));
    mergeField(doc, 'cpuSpeed', pickFirst(row.SVR_NRMLZ_CPU_SPEED, row.SVR_CPU_SPEED));
    mergeField(doc, 'ram', cleanNumber(row.SVR_RAM));
    mergeField(doc, 'location', clean(row.SVR_LOC));
    mergeField(doc, 'supportGroup', clean(row.SVR_SUPT_GRP));
    mergeField(doc, 'supportedBy', clean(row.SVR_SUPTED_BY));
    mergeField(doc, 'managedByGroup', clean(row.SVR_MNGD_BY_GRP));
    mergeField(doc, 'cloudAccountId', clean(row.SVR_CLD_ACCT_ID));
    mergeField(doc, 'internetFacing', clean(row.SVR_INTNET_FCG));
    mergeField(doc, 'virtualized', cleanBoolean(row.SVR_VRTL));
    mergeField(doc, 'className', clean(row.SVR_SYS_CLASS_NM));

    const relationType = clean(row.REL_TYPE);
    if (relationType) doc._relationTypes.add(relationType);
    const relationPort = clean(row.REL_PORT);
    if (relationPort) doc._relationPorts.add(relationPort);

    const appCorrelationId = clean(row.APP_CRLTN_ID);
    const appName = clean(row.APP_NM);
    const appKey = appCorrelationId || appName;
    if (appKey && !doc._linkedApplicationKeys.has(appKey)) {
      doc._linkedApplicationKeys.add(appKey);
      doc.linkedApplications.push({
        correlationId: appCorrelationId,
        name: appName,
        acronym: clean(row.APP_ACRON_NM),
        apmNumber: clean(row.APM_NBR),
        relationType,
        relationSystemId: clean(row.REL_SYS_ID),
      });
    }
  }

  const docs = Array.from(byKey.values()).map((doc) => {
    doc.relationTypes = Array.from(doc._relationTypes).sort();
    doc.relationPorts = Array.from(doc._relationPorts).sort();
    delete doc._linkedApplicationKeys;
    delete doc._relationTypes;
    delete doc._relationPorts;
    return doc;
  });

  console.log(`Parsed ${docs.length} unique servers from ${rows.length} rows (${skipped} rows skipped)`);

  await Server.deleteMany({});
  try { await Server.collection.dropIndexes(); } catch (_) {}
  await Server.insertMany(docs, { ordered: false });

  console.log(`Servers in DB: ${await Server.countDocuments()}`);
  await mongoose.disconnect();
  console.log('Done.');
}

reseed().catch((err) => {
  console.error(err);
  process.exit(1);
});