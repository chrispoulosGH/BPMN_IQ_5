const DataSearchIndex = require('../models/DataSearchIndex');
const Data = require('../models/Data');

const APPLICATION_ALIASES = ['application', 'applications'];
const APPLICATION_REGEX = new RegExp(`^(?:${APPLICATION_ALIASES.map(escapeRegex).join('|')})$`, 'i');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toPlainObject(value) {
  if (!value || typeof value !== 'object') return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return Array.isArray(value) ? {} : value;
}

function getFieldValue(source, aliases) {
  const normalizedAliases = aliases.map((alias) => normalizeKey(alias));
  const values = toPlainObject(source);
  for (const [key, rawValue] of Object.entries(values)) {
    if (!normalizedAliases.includes(normalizeKey(key))) continue;
    const value = normalizeValue(rawValue);
    if (value) return value;
  }
  return '';
}

function buildApplicationItem(source, fallbackId, neighborhoodName = '') {
  const values = toPlainObject(source);
  const name = getFieldValue(values, ['name', 'application name', 'application_name']) || normalizeValue(values.rowName) || normalizeValue(values.name) || normalizeValue(fallbackId);
  const correlationId = getFieldValue(values, ['correlationId', 'correlation_id', 'application correlation id', 'app correlation id']);
  const acronym = getFieldValue(values, ['acronym', 'application acronym', 'app acronym']);

  if (!name && !correlationId && !acronym) return null;

  return {
    _id: String(fallbackId || correlationId || acronym || name || `${neighborhoodName}:application`),
    neighborhoodName: normalizeValue(neighborhoodName),
    name,
    acronym,
    correlationId,
    shortDescription: getFieldValue(values, ['shortDescription', 'short_description', 'description']),
    applicationType: getFieldValue(values, ['applicationType', 'application_type', 'type']),
    businessCriticality: getFieldValue(values, ['businessCriticality', 'business_criticality', 'criticality']),
    discoverySource: getFieldValue(values, ['discoverySource', 'discovery_source']),
    installType: getFieldValue(values, ['installType', 'install_type']),
    cpniIndicator: getFieldValue(values, ['cpniIndicator', 'cpni_indicator']),
    customerFacing: getFieldValue(values, ['customerFacing', 'customer_facing']),
    handleSpi: getFieldValue(values, ['handleSpi', 'handle_spi']),
    internetFacing: getFieldValue(values, ['internetFacing', 'internet_facing']),
    pciData: getFieldValue(values, ['pciData', 'pci_data']),
    soxFsa: getFieldValue(values, ['soxFsa', 'sox_fsa']),
    storeSpi: getFieldValue(values, ['storeSpi', 'store_spi']),
    applPurpose: getFieldValue(values, ['applPurpose', 'applicationPurpose', 'application_purpose']),
    lifecycle: getFieldValue(values, ['lifecycle']),
    lifecycleStatus: getFieldValue(values, ['lifecycleStatus', 'lifecycle_status']),
    businessPurpose: getFieldValue(values, ['businessPurpose', 'business_purpose']),
    pciDataStored: getFieldValue(values, ['pciDataStored', 'pci_data_stored']),
    userInterface: getFieldValue(values, ['userInterface', 'user_interface']),
    owner: getFieldValue(values, ['owner']),
    state: getFieldValue(values, ['state']) || 'draft',
  };
}

function dedupeAndSortApplicationItems(items) {
  const seen = new Set();
  const uniqueItems = [];

  for (const item of items) {
    if (!item) continue;
    const key = normalizeKey(item.correlationId || item.acronym || item.name || item._id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueItems.push(item);
  }

  return uniqueItems.sort((left, right) => {
    const leftName = normalizeValue(left.name).toLowerCase();
    const rightName = normalizeValue(right.name).toLowerCase();
    if (leftName !== rightName) return leftName.localeCompare(rightName);
    return normalizeValue(left.correlationId).localeCompare(normalizeValue(right.correlationId));
  });
}

async function loadApplicationReferencesFromSearchIndex(neighborhoodName) {
  const docs = await DataSearchIndex.find(
    {
      neighborhoodName: normalizeValue(neighborhoodName),
      $or: [
        { dataType: APPLICATION_REGEX },
        { componentName: APPLICATION_REGEX },
      ],
    },
    {
      rowName: 1,
      fieldByValue: 1,
      dataType: 1,
      componentName: 1,
    }
  ).sort({ rowName: 1, _id: 1 }).lean();

  return dedupeAndSortApplicationItems(
    docs.map((doc) => buildApplicationItem({ ...(doc.fieldByValue || {}), rowName: doc.rowName, dataType: doc.dataType, componentName: doc.componentName }, doc._id, neighborhoodName)).filter(Boolean)
  );
}

async function loadApplicationReferencesFromData(neighborhoodName) {
  const docs = await Data.find(
    {
      neighborhoodName: normalizeValue(neighborhoodName),
      $or: [
        { dataType: APPLICATION_REGEX },
        { componentType: APPLICATION_REGEX },
        { name: APPLICATION_REGEX },
      ],
    },
    {
      name: 1,
      dataType: 1,
      componentType: 1,
      rows: 1,
    }
  ).lean();

  const items = [];

  for (const doc of docs) {
    const rows = Array.isArray(doc.rows) ? doc.rows : [];
    for (const [index, row] of rows.entries()) {
      const values = row && typeof row.values === 'object' ? toPlainObject(row.values) : toPlainObject(row);
      const item = buildApplicationItem(
        {
          ...values,
          rowName: values.name || doc.name || row?.tuple || '',
          dataType: doc.dataType,
          componentName: doc.componentType || doc.name,
        },
        row?._id || `${doc._id}:${index}`,
        neighborhoodName
      );
      if (item) items.push(item);
    }
  }

  return dedupeAndSortApplicationItems(items);
}

async function listApplicationReferences(neighborhoodName) {
  const normalizedNeighborhoodName = normalizeValue(neighborhoodName);
  const fromIndex = await loadApplicationReferencesFromSearchIndex(normalizedNeighborhoodName);
  if (fromIndex.length) return fromIndex;
  return loadApplicationReferencesFromData(normalizedNeighborhoodName);
}

async function findApplicationReferenceByField(neighborhoodName, fieldName, value) {
  const normalizedValue = normalizeKey(value);
  if (!normalizedValue) return null;
  const items = await listApplicationReferences(neighborhoodName);
  return items.find((item) => normalizeKey(item[fieldName]) === normalizedValue) || null;
}

async function findApplicationByCorrelationId(neighborhoodName, correlationId) {
  return findApplicationReferenceByField(neighborhoodName, 'correlationId', correlationId);
}

async function findApplicationByAcronym(neighborhoodName, acronym) {
  return findApplicationReferenceByField(neighborhoodName, 'acronym', acronym);
}

async function findApplicationByName(neighborhoodName, name) {
  return findApplicationReferenceByField(neighborhoodName, 'name', name);
}

module.exports = {
  APPLICATION_ALIASES,
  APPLICATION_REGEX,
  buildApplicationItem,
  dedupeAndSortApplicationItems,
  findApplicationByAcronym,
  findApplicationByCorrelationId,
  findApplicationByName,
  listApplicationReferences,
};