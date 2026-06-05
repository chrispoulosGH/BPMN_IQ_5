const DEFAULT_NEIGHBORHOOD_NAME = 'AT&T Journey';
const NEIGHBORHOOD_HEADER = 'x-neighborhood-name';

function getNeighborhoodName(req) {
  const headerValue = req?.headers?.[NEIGHBORHOOD_HEADER] || req?.headers?.[NEIGHBORHOOD_HEADER.toUpperCase()];
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_NEIGHBORHOOD_NAME;
}

function buildNeighborhoodFilter(neighborhoodName) {
  if (neighborhoodName === DEFAULT_NEIGHBORHOOD_NAME) {
    return {
      $or: [
        { neighborhoodName },
        { neighborhoodName: { $exists: false } },
        { neighborhoodName: null },
        { neighborhoodName: '' },
      ],
    };
  }

  return { neighborhoodName };
}

function withNeighborhood(req, filter = {}) {
  const neighborhoodName = getNeighborhoodName(req);
  const neighborhoodFilter = buildNeighborhoodFilter(neighborhoodName);

  if (!filter || !Object.keys(filter).length) return neighborhoodFilter;
  return { $and: [neighborhoodFilter, filter] };
}

module.exports = {
  DEFAULT_NEIGHBORHOOD_NAME,
  NEIGHBORHOOD_HEADER,
  buildNeighborhoodFilter,
  getNeighborhoodName,
  withNeighborhood,
};