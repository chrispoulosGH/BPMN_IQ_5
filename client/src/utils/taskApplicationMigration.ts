export function mergeTaskApplicationNames(existingNames: string[], incomingNames: string[]): string[] {
  const mergedNames = new Map<string, string>();

  for (const name of [...existingNames, ...incomingNames]) {
    const trimmedName = name.trim();
    if (!trimmedName) continue;
    const normalizedName = trimmedName.toLowerCase();
    if (!mergedNames.has(normalizedName)) {
      mergedNames.set(normalizedName, trimmedName);
    }
  }

  return [...mergedNames.values()];
}