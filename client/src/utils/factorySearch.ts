export const EXACT_FACTORY_SEARCH_PREFIX = '__exact__:';

function normalizeFactorySearchValue(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}

export function encodeExactFactorySearch(term: string): string {
  return `${EXACT_FACTORY_SEARCH_PREFIX}${term}`;
}

export function parseFactorySearch(rawValue?: string | null): { term: string; exact: boolean } {
  const value = String(rawValue || '');
  if (value.startsWith(EXACT_FACTORY_SEARCH_PREFIX)) {
    return { term: value.slice(EXACT_FACTORY_SEARCH_PREFIX.length), exact: true };
  }
  return { term: value, exact: false };
}

export function matchesFactorySearch(values: Array<string | null | undefined>, rawSearch?: string | null): boolean {
  const { term, exact } = parseFactorySearch(rawSearch);
  const normalizedTerm = normalizeFactorySearchValue(term);
  if (!normalizedTerm) return true;

  return values.some((value) => {
    const normalizedValue = normalizeFactorySearchValue(String(value || ''));
    return exact ? normalizedValue === normalizedTerm : normalizedValue.startsWith(normalizedTerm);
  });
}