export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined | Date;
}

// Spreadsheet apps execute cells that start with these characters as
// formulas; prefix them so customer-supplied text can't inject one.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let value = raw instanceof Date ? raw.toISOString() : String(raw);
  if (typeof raw === 'string' && FORMULA_PREFIX.test(value))
    value = `'${value}`;
  if (/[",\n\r]/.test(value)) value = `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }
  // BOM so Excel opens UTF-8 (e.g. "Café Farm") correctly.
  return '﻿' + lines.join('\r\n');
}

export const centsToDollars = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
