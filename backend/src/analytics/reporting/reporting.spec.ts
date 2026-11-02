import { BadRequestException } from '@nestjs/common';
import { bucketKeys, localDateKey, resolveRange, zonedMidnight } from './date-range';
import { fillSeries, pctChange, safeDiv } from './sql';
import { toCsv } from './csv';

const TZ = 'Australia/Sydney';

describe('reporting date ranges', () => {
  it('finds local midnight across both DST offsets', () => {
    // AEST (UTC+10) in winter, AEDT (UTC+11) in summer.
    expect(zonedMidnight(2026, 7, 1, TZ).toISOString()).toBe('2026-06-30T14:00:00.000Z');
    expect(zonedMidnight(2026, 1, 15, TZ).toISOString()).toBe('2026-01-14T13:00:00.000Z');
    // DST starts 4 Oct 2026; midnight that day is still AEST.
    expect(zonedMidnight(2026, 10, 4, TZ).toISOString()).toBe('2026-10-03T14:00:00.000Z');
  });

  it('handles non-hour offsets (Adelaide is UTC+9:30/+10:30)', () => {
    expect(zonedMidnight(2026, 7, 1, 'Australia/Adelaide').toISOString()).toBe('2026-06-30T14:30:00.000Z');
  });

  it('resolves "7d" as the last seven local calendar days, ending now', () => {
    const now = new Date('2026-10-31T02:00:00Z'); // 1pm 31 Oct in Sydney
    const range = resolveRange({ range: '7d' }, now, TZ);
    expect(range.startDate).toBe('2026-10-25');
    expect(range.endDate).toBe('2026-10-31');
    expect(range.from.toISOString()).toBe('2026-10-24T13:00:00.000Z');
    expect(range.to).toEqual(now);
    // Previous period is the same length, immediately before.
    expect(range.prevTo).toEqual(range.from);
    expect(range.from.getTime() - range.prevFrom.getTime()).toBe(range.to.getTime() - range.from.getTime());
    expect(range.granularity).toBe('day');
  });

  it('uses the local date, not the UTC date, for "today"', () => {
    // 11pm UTC on the 30th is already the 31st in Sydney.
    const now = new Date('2026-10-30T23:00:00Z');
    const range = resolveRange({ range: 'today' }, now, TZ);
    expect(range.startDate).toBe('2026-10-31');
    expect(range.granularity).toBe('hour');
  });

  it('includes the whole last day of a custom range', () => {
    const now = new Date('2026-10-31T02:00:00Z');
    const range = resolveRange({ range: 'custom', from: '2026-03-01', to: '2026-03-31' }, now, TZ);
    expect(range.from.toISOString()).toBe('2026-02-28T13:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-03-31T13:00:00.000Z'); // midnight 1 Apr AEDT
  });

  it('rejects invalid custom ranges', () => {
    const now = new Date('2026-10-31T02:00:00Z');
    expect(() => resolveRange({ range: 'custom', from: '2026-03-01' }, now, TZ)).toThrow(BadRequestException);
    expect(() => resolveRange({ range: 'custom', from: '2026-04-01', to: '2026-03-01' }, now, TZ)).toThrow(BadRequestException);
    expect(() => resolveRange({ range: 'custom', from: '2027-01-01', to: '2027-01-31' }, now, TZ)).toThrow(BadRequestException);
    expect(() => resolveRange({ range: 'forever' }, now, TZ)).toThrow(BadRequestException);
  });

  it('switches granularity with range length and honours overrides', () => {
    const now = new Date('2026-10-31T02:00:00Z');
    expect(resolveRange({ range: '12m' }, now, TZ).granularity).toBe('week');
    expect(resolveRange({ range: '12m', granularity: 'month' }, now, TZ).granularity).toBe('month');
    // An hourly request over a year would be thousands of points: downgraded.
    expect(resolveRange({ range: '12m', granularity: 'hour' }, now, TZ).granularity).toBe('day');
  });
});

describe('bucket keys', () => {
  it('produces one key per local day', () => {
    const now = new Date('2026-10-31T02:00:00Z');
    const range = resolveRange({ range: '7d' }, now, TZ);
    expect(bucketKeys(range.from, range.to, 'day', TZ)).toEqual([
      '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
    ]);
  });

  it('aligns weeks to Monday like Postgres date_trunc', () => {
    const from = zonedMidnight(2026, 10, 1, TZ); // a Thursday
    const to = zonedMidnight(2026, 10, 20, TZ);
    expect(bucketKeys(from, to, 'week', TZ)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('covers months across a year boundary', () => {
    const from = zonedMidnight(2025, 11, 15, TZ);
    const to = zonedMidnight(2026, 2, 2, TZ);
    expect(bucketKeys(from, to, 'month', TZ)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('keeps hourly keys continuous across the DST change', () => {
    const from = zonedMidnight(2026, 10, 4, TZ);
    const to = zonedMidnight(2026, 10, 5, TZ);
    const keys = bucketKeys(from, to, 'hour', TZ);
    expect(keys).toHaveLength(23); // the 2am hour doesn't exist that day
    expect(keys).not.toContain('2026-10-04 02:00');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('formats local date keys in the reporting timezone', () => {
    expect(localDateKey(new Date('2026-10-30T13:30:00Z'), TZ)).toBe('2026-10-31');
  });
});

describe('metric helpers', () => {
  it('never divides by zero', () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(500, 0)).toBeNull(); // "new", not Infinity
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
  });

  it('zero-fills missing buckets and normalises bigint values', () => {
    const series = fillSeries<{ gross: number; orders: number }>(
      ['a', 'b', 'c'],
      [{ bucket: 'b', gross: BigInt(1250), orders: 3 }],
      ['gross', 'orders'],
    );
    expect(series).toEqual([
      { bucket: 'a', gross: 0, orders: 0 },
      { bucket: 'b', gross: 1250, orders: 3 },
      { bucket: 'c', gross: 0, orders: 0 },
    ]);
  });
});

describe('CSV export', () => {
  const columns = [
    { header: 'Name', value: (r: { name: string; amount: number }) => r.name },
    { header: 'Amount', value: (r: { name: string; amount: number }) => r.amount },
  ];

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv([{ name: 'Smith, "Jo"\nFarm', amount: 5 }], columns);
    expect(csv).toBe('﻿Name,Amount\r\n"Smith, ""Jo""\nFarm",5');
  });

  it('neutralises spreadsheet formula injection in text cells', () => {
    const csv = toCsv([{ name: '=HYPERLINK("http://evil")', amount: -12 }], columns);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    // Numbers are left alone, so negative amounts stay numeric.
    expect(csv.endsWith(',-12')).toBe(true);
  });
});
