// Detects "cost_grp_N" columns (e.g. "dev_cost_2020 cost_grp_1") and groups every
// column sharing the same N into one cost structure, so multi-year / multi-metric
// cost data can be charted together instead of as isolated fields.

const COST_GROUP_PATTERN = /cost[_\s]*grp[_\s]*(\d+)\s*$/i;
const COMPONENT_COLUMN_PATTERN = /\bcomponents?\s*$/i;
const YEAR_PATTERN = /((?:19|20)\d{2})\s*$/;

export interface CostColumnMeta {
  column: string;
  metric: string;
  year: number | null;
}

export interface CostGroupRow {
  label: string;
  total: number;
  byYear: Record<number, number>;
  byMetric: Record<string, number>;
}

export interface CostGroup {
  groupId: string;
  columns: string[];
  metrics: string[];
  years: number[];
  rows: CostGroupRow[];
}

function parseCostColumnLabel(rawColumn: string, groupId: string): { metric: string; year: number | null } {
  const suffixPattern = new RegExp(`\\s*cost[_\\s]*grp[_\\s]*${groupId}\\s*$`, 'i');
  const base = rawColumn.replace(suffixPattern, '').trim();
  const yearMatch = base.match(YEAR_PATTERN);
  if (!yearMatch) return { metric: base || 'value', year: null };
  const year = Number(yearMatch[1]);
  const metric = base.slice(0, yearMatch.index).trim().replace(/[_\s]+$/, '') || 'value';
  return { metric, year };
}

function findIdentityColumn(dataColumns: string[]): string | null {
  return dataColumns.find((col) => COMPONENT_COLUMN_PATTERN.test(String(col || '').trim())) || null;
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(String(raw).replace(/[$,]/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function getRowValues(row: { values?: Record<string, unknown> } | Record<string, unknown>): Record<string, unknown> {
  const asAny = row as any;
  return (asAny?.values && typeof asAny.values === 'object') ? asAny.values : asAny;
}

export function buildCostGroups(
  dataColumns: string[],
  dataRows: Array<{ values?: Record<string, unknown> } | Record<string, unknown>>,
): CostGroup[] {
  if (!dataColumns?.length || !dataRows?.length) return [];

  const columnsByGroup = new Map<string, string[]>();
  for (const rawColumn of dataColumns) {
    const column = String(rawColumn || '').trim();
    const match = column.match(COST_GROUP_PATTERN);
    if (!match) continue;
    const groupId = match[1];
    if (!columnsByGroup.has(groupId)) columnsByGroup.set(groupId, []);
    columnsByGroup.get(groupId)!.push(column);
  }
  if (!columnsByGroup.size) return [];

  const identityColumn = findIdentityColumn(dataColumns);

  const groups: CostGroup[] = [];
  for (const [groupId, columns] of columnsByGroup.entries()) {
    const colMeta: CostColumnMeta[] = columns.map((column) => ({ column, ...parseCostColumnLabel(column, groupId) }));
    const metrics = Array.from(new Set(colMeta.map((c) => c.metric)));
    const years = Array.from(new Set(colMeta.map((c) => c.year).filter((y): y is number => y != null))).sort((a, b) => a - b);

    const rowsByLabel = new Map<string, CostGroupRow>();
    for (const row of dataRows) {
      const values = getRowValues(row);
      const label = identityColumn ? String(values[identityColumn] ?? '').trim() : '';
      if (!label) continue;

      const entry = rowsByLabel.get(label) || { label, total: 0, byYear: {}, byMetric: {} };
      for (const meta of colMeta) {
        const num = toNumber(values[meta.column]);
        if (num == null) continue;
        entry.total += num;
        if (meta.year != null) entry.byYear[meta.year] = (entry.byYear[meta.year] || 0) + num;
        entry.byMetric[meta.metric] = (entry.byMetric[meta.metric] || 0) + num;
      }
      rowsByLabel.set(label, entry);
    }

    const rows = Array.from(rowsByLabel.values())
      .filter((r) => r.total !== 0 || Object.keys(r.byYear).length > 0)
      .sort((a, b) => b.total - a.total);

    groups.push({ groupId, columns, metrics, years, rows });
  }

  return groups.sort((a, b) => a.groupId.localeCompare(b.groupId, undefined, { numeric: true }));
}
