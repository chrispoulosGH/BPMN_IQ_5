import type { ColumnsType } from 'antd/es/table';

type AnyRecord = Record<string, any>;

type DataIndex = string | number | Array<string | number>;

function toPath(dataIndex: DataIndex | undefined, key?: string): Array<string | number> {
  if (Array.isArray(dataIndex)) return dataIndex;
  if (typeof dataIndex === 'string' || typeof dataIndex === 'number') return [dataIndex];
  if (key) return [key];
  return [];
}

function getValue(record: AnyRecord, dataIndex: DataIndex | undefined, key?: string): unknown {
  const path = toPath(dataIndex, key);
  if (!path.length) return undefined;

  let current: unknown = record;
  for (const segment of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as AnyRecord)[segment as any];
  }
  return current;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => toText(item)).filter(Boolean).join(', ');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function compareValues(left: unknown, right: unknown): number {
  const leftText = toText(left);
  const rightText = toText(right);

  const leftNum = Number(leftText);
  const rightNum = Number(rightText);
  if (leftText && rightText && Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    return leftNum - rightNum;
  }

  const leftDate = Date.parse(leftText);
  const rightDate = Date.parse(rightText);
  if (leftText && rightText && !Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
    return leftDate - rightDate;
  }

  return leftText.localeCompare(rightText, undefined, { sensitivity: 'base', numeric: true });
}

export function enhanceColumnsWithSortAndFilters<T extends object>(columns: ColumnsType<T>, dataSource: T[]): ColumnsType<T> {
  const apply = (input: any[]): any[] => input.map((column) => {
    const next = { ...column } as any;

    if (Array.isArray(next.children) && next.children.length) {
      next.children = apply(next.children);
      return next;
    }

    const key = String(next.key || '');
    const titleText = typeof next.title === 'string' ? next.title.trim() : '';
    const isActionColumn = key === 'actions' || key === 'action' || titleText === '';
    const dataIndex: DataIndex | undefined = next.dataIndex;

    if (isActionColumn || (!dataIndex && !key)) {
      return next;
    }

    if (typeof next.sorter !== 'function') {
      next.sorter = (left: T, right: T) => compareValues(
        getValue(left as AnyRecord, dataIndex, key),
        getValue(right as AnyRecord, dataIndex, key)
      );
    }

    if (!next.filters) {
      const unique = new Set<string>();
      for (const row of dataSource) {
        const text = toText(getValue(row as AnyRecord, dataIndex, key));
        if (text) unique.add(text);
      }

      const values = Array.from(unique)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
        .slice(0, 500);

      if (values.length) {
        next.filters = values.map((value) => ({ text: value, value }));
        if (!next.onFilter) {
          next.onFilter = (value: unknown, record: T) => {
            const cell = toText(getValue(record as AnyRecord, dataIndex, key)).toLowerCase();
            return cell.includes(String(value || '').toLowerCase());
          };
        }
      }
    }

    if (next.filters && next.filterSearch === undefined) {
      next.filterSearch = true;
    }

    return next;
  });

  return apply(columns as any) as ColumnsType<T>;
}
