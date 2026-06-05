export const EXACT_FACTORY_SEARCH_PREFIX = '__exact__:';

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
  const normalizedTerm = term.toLowerCase().trim();
  if (!normalizedTerm) return true;

  return values.some((value) => {
    const normalizedValue = String(value || '').toLowerCase().trim();
    return exact ? normalizedValue === normalizedTerm : normalizedValue.includes(normalizedTerm);
  });
}