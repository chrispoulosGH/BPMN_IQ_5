import * as stringSimilarity from 'string-similarity';
import type { ApplicationItem } from '../types';

export type ApplicationMatchMode = 'correlationId' | 'acronym' | 'name';

export interface ExactApplicationMatchResult {
  matches: ApplicationItem[];
  mode: ApplicationMatchMode | null;
  selected: ApplicationItem | null;
}

export interface FuzzyApplicationMatchResult {
  app: ApplicationItem;
  identifier: string;
  score: number;
  matchedOn: 'name' | 'acronym';
  matchedValue: string;
}

export function normalizeApplicationLookupValue(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function getPreferredApplicationIdentifier(app: ApplicationItem | null | undefined): string | null {
  const correlationId = String(app?.correlationId || '').trim();
  if (correlationId) return correlationId;

  const acronym = String(app?.acronym || '').trim();
  if (acronym) return acronym;

  return null;
}

export function getPreferredApplicationDisplayName(app: ApplicationItem | null | undefined, fallback = ''): string {
  const acronym = String(app?.acronym || '').trim();
  if (acronym) return acronym;

  const name = String(app?.name || '').trim();
  if (name) return name;

  return fallback;
}

export function findExactApplicationMatches(applications: ApplicationItem[], lookupValue: string): ExactApplicationMatchResult {
  const normalizedLookupValue = normalizeApplicationLookupValue(lookupValue);
  if (!normalizedLookupValue) {
    return { matches: [], mode: null, selected: null };
  }

  const byCorrelationId = applications.filter(
    (app) => normalizeApplicationLookupValue(app.correlationId) === normalizedLookupValue
  );
  if (byCorrelationId.length) {
    return { matches: byCorrelationId, mode: 'correlationId', selected: byCorrelationId[0] };
  }

  const byAcronym = applications.filter(
    (app) => normalizeApplicationLookupValue(app.acronym) === normalizedLookupValue
  );
  if (byAcronym.length) {
    return { matches: byAcronym, mode: 'acronym', selected: byAcronym[0] };
  }

  const byName = applications.filter(
    (app) => normalizeApplicationLookupValue(app.name) === normalizedLookupValue
  );
  if (byName.length) {
    return { matches: byName, mode: 'name', selected: byName[0] };
  }

  return { matches: [], mode: null, selected: null };
}

export function buildExactApplicationIdentifierSet(applications: ApplicationItem[]): Set<string> {
  const identifiers = applications.flatMap((app) => {
    const values = [app.correlationId, app.acronym, app.name]
      .map((value) => normalizeApplicationLookupValue(value))
      .filter(Boolean);
    return [...new Set(values)];
  });

  return new Set(identifiers);
}

export function findBestFuzzyApplicationMatch(
  applications: ApplicationItem[],
  lookupValue: string,
  minimumScore = 0.55,
  minimumMargin = 0.08
): FuzzyApplicationMatchResult | null {
  const normalizedLookupValue = normalizeApplicationLookupValue(lookupValue);
  if (!normalizedLookupValue) return null;

  const candidates = applications.flatMap((app) => {
    const identifier = getPreferredApplicationIdentifier(app);
    if (!identifier) return [];

    const entries: Array<{ app: ApplicationItem; identifier: string; matchedOn: 'name' | 'acronym'; matchedValue: string }> = [];
    const acronym = String(app.acronym || '').trim();
    const name = String(app.name || '').trim();

    if (acronym) {
      entries.push({ app, identifier, matchedOn: 'acronym', matchedValue: acronym });
    }
    if (name) {
      entries.push({ app, identifier, matchedOn: 'name', matchedValue: name });
    }

    return entries;
  });

  if (!candidates.length) return null;

  const matchResult = stringSimilarity.findBestMatch(
    normalizedLookupValue,
    candidates.map((candidate) => normalizeApplicationLookupValue(candidate.matchedValue))
  );

  const bestMatch = matchResult.bestMatch;
  if (!bestMatch || bestMatch.rating < minimumScore) return null;

  const sortedRatings = [...matchResult.ratings].sort((left, right) => right.rating - left.rating);
  const secondBestRating = sortedRatings[1]?.rating ?? 0;
  if (bestMatch.rating - secondBestRating < minimumMargin) return null;

  const bestCandidate = candidates.find(
    (candidate) => normalizeApplicationLookupValue(candidate.matchedValue) === bestMatch.target
  );
  if (!bestCandidate) return null;

  return {
    app: bestCandidate.app,
    identifier: bestCandidate.identifier,
    score: bestMatch.rating,
    matchedOn: bestCandidate.matchedOn,
    matchedValue: bestCandidate.matchedValue,
  };
}