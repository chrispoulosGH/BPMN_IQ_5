// No neighborhood/model names are hardcoded. The default (used only when a
// request omits the neighborhood header) and any alias mappings are supplied
// via environment variables so deployments are not tied to specific models.
//   DEFAULT_NEIGHBORHOOD_NAME - a single model name string (default: '')
//   NEIGHBORHOOD_ALIASES      - JSON object mapping a canonical name to an
//                               array of accepted aliases, e.g.
//                               '{"My Model":["My Model","legacy name"]}'
const DEFAULT_NEIGHBORHOOD_NAME = String(process.env.DEFAULT_NEIGHBORHOOD_NAME || '').trim();
const NEIGHBORHOOD_HEADER = 'x-neighborhood-name';
const ALL_NEIGHBORHOODS_TOKEN = '__all__';

function parseNeighborhoodAliases() {
  const raw = process.env.NEIGHBORHOOD_ALIASES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn('[neighborhoodScope] Invalid NEIGHBORHOOD_ALIASES env (expected JSON object):', err && err.message);
    return {};
  }
}

const NEIGHBORHOOD_ALIASES = parseNeighborhoodAliases();

function getNeighborhoodName(req) {
  const headerValue = req?.headers?.[NEIGHBORHOOD_HEADER] || req?.headers?.[NEIGHBORHOOD_HEADER.toUpperCase()];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmed = String(value || '').trim();
  if (trimmed === ALL_NEIGHBORHOODS_TOKEN || trimmed === '*') {
    return ALL_NEIGHBORHOODS_TOKEN;
  }
  return trimmed || DEFAULT_NEIGHBORHOOD_NAME;
}

function buildNeighborhoodFilter(neighborhoodName) {
  if (neighborhoodName === ALL_NEIGHBORHOODS_TOKEN || neighborhoodName === '*') {
    return {};
  }

  const aliases = Array.from(new Set(
    (NEIGHBORHOOD_ALIASES[neighborhoodName] && NEIGHBORHOOD_ALIASES[neighborhoodName].length
      ? NEIGHBORHOOD_ALIASES[neighborhoodName]
      : [neighborhoodName])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  ));

  if (neighborhoodName === DEFAULT_NEIGHBORHOOD_NAME) {
    return {
      $or: [
        aliases.length > 1 ? { neighborhoodName: { $in: aliases } } : { neighborhoodName },
        { neighborhoodName: { $exists: false } },
        { neighborhoodName: null },
        { neighborhoodName: '' },
      ],
    };
  }

  if (aliases.length > 1) {
    return { neighborhoodName: { $in: aliases } };
  }

  return { neighborhoodName };
}

function withNeighborhood(req, filter = {}) {
  const neighborhoodName = getNeighborhoodName(req);
  const neighborhoodFilter = buildNeighborhoodFilter(neighborhoodName);

  if (!Object.keys(neighborhoodFilter).length) {
    return filter && Object.keys(filter).length ? filter : {};
  }

  if (!filter || !Object.keys(filter).length) return neighborhoodFilter;
  return { $and: [neighborhoodFilter, filter] };
}

module.exports = {
  ALL_NEIGHBORHOODS_TOKEN,
  DEFAULT_NEIGHBORHOOD_NAME,
  NEIGHBORHOOD_HEADER,
  buildNeighborhoodFilter,
  getNeighborhoodName,
  withNeighborhood,
};