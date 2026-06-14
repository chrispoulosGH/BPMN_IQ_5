const DEFAULT_NEIGHBORHOOD_NAME = 'ATT Journey Model';
const NEIGHBORHOOD_HEADER = 'x-neighborhood-name';
const ALL_NEIGHBORHOODS_TOKEN = '__all__';
const NEIGHBORHOOD_ALIASES = {
  [DEFAULT_NEIGHBORHOOD_NAME]: [DEFAULT_NEIGHBORHOOD_NAME, 'AT&T Journey'],
  'LBGUPS Ref Model': ['LBGUPS Ref Model', 'LBGUPS'],
};

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