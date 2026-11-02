import { BadRequestException } from '@nestjs/common';

// All timestamps are stored in UTC. Reports are bucketed and bounded by
// calendar days in a single reporting timezone so "today" and "this year"
// mean the same thing to every Australian user regardless of server locale.
export const REPORTING_TIMEZONE =
  process.env.REPORTING_TIMEZONE || 'Australia/Sydney';

export const RANGE_PRESETS = [
  'today',
  '7d',
  '30d',
  '90d',
  'ytd',
  '12m',
  'custom',
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const GRANULARITIES = ['hour', 'day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export interface ResolvedRange {
  preset: RangePreset;
  timezone: string;
  /** Inclusive UTC start instant. */
  from: Date;
  /** Exclusive UTC end instant (capped at "now"). */
  to: Date;
  /** Equal-length window immediately before [from, to). */
  prevFrom: Date;
  prevTo: Date;
  /** Local calendar dates (YYYY-MM-DD), inclusive, for display. */
  startDate: string;
  endDate: string;
  granularity: Granularity;
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

export function localParts(date: Date, tz = REPORTING_TIMEZONE): LocalParts {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

// Offset (ms) between the timezone's wall clock and UTC at the given instant.
function tzOffsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

/** UTC instant of local midnight on the given calendar date in `tz`. */
export function zonedMidnight(
  year: number,
  month: number,
  day: number,
  tz = REPORTING_TIMEZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day);
  let result = guess - tzOffsetMs(new Date(guess), tz);
  // Second pass corrects for a DST transition between the guess and result.
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

export function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function localDateKey(date: Date, tz = REPORTING_TIMEZONE) {
  const p = localParts(date, tz);
  return toDateKey(p.year, p.month, p.day);
}

// Pure calendar arithmetic on Y-M-D, independent of any timezone.
function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function parseDateKey(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match)
    throw new BadRequestException(`Invalid date "${key}", expected YYYY-MM-DD`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function midnightOfKey(key: string, tz: string) {
  const { year, month, day } = parseDateKey(key);
  return zonedMidnight(year, month, day, tz);
}

function autoGranularity(days: number): Granularity {
  if (days <= 2) return 'hour';
  if (days <= 92) return 'day';
  if (days <= 400) return 'week';
  return 'month';
}

// Upper bound on chart points so a user-chosen granularity can't explode the response.
const MAX_BUCKETS = 800;

export function resolveRange(
  query: { range?: string; from?: string; to?: string; granularity?: string },
  now = new Date(),
  tz = REPORTING_TIMEZONE,
): ResolvedRange {
  const preset = (query.range || '30d') as RangePreset;
  if (!RANGE_PRESETS.includes(preset)) {
    throw new BadRequestException(`Unknown range "${query.range}"`);
  }

  const todayKey = localDateKey(now, tz);
  let startKey: string;
  let endKey = todayKey;

  switch (preset) {
    case 'today':
      startKey = todayKey;
      break;
    case '7d':
      startKey = addDays(todayKey, -6);
      break;
    case '30d':
      startKey = addDays(todayKey, -29);
      break;
    case '90d':
      startKey = addDays(todayKey, -89);
      break;
    case 'ytd':
      startKey = `${todayKey.slice(0, 4)}-01-01`;
      break;
    case '12m':
      startKey = addDays(todayKey, -364);
      break;
    case 'custom': {
      if (!query.from || !query.to) {
        throw new BadRequestException(
          'Custom ranges need both "from" and "to" dates',
        );
      }
      parseDateKey(query.from);
      parseDateKey(query.to);
      startKey = query.from;
      endKey = query.to;
      if (startKey > endKey) {
        throw new BadRequestException('"from" must be on or before "to"');
      }
      break;
    }
  }

  const from = midnightOfKey(startKey, tz);
  const endExclusive = midnightOfKey(addDays(endKey, 1), tz);
  const to = endExclusive > now ? now : endExclusive;
  if (to <= from) {
    throw new BadRequestException(
      'The selected range is entirely in the future',
    );
  }

  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = from;

  const days = Math.max(
    1,
    Math.round((endExclusive.getTime() - from.getTime()) / 86_400_000),
  );
  let granularity = autoGranularity(days);
  if (query.granularity) {
    if (!GRANULARITIES.includes(query.granularity as Granularity)) {
      throw new BadRequestException(
        `Unknown granularity "${query.granularity}"`,
      );
    }
    granularity = query.granularity as Granularity;
  }
  if (granularity === 'hour' && days > MAX_BUCKETS / 24) granularity = 'day';
  if (granularity === 'day' && days > MAX_BUCKETS) granularity = 'week';

  return {
    preset,
    timezone: tz,
    from,
    to,
    prevFrom,
    prevTo,
    startDate: startKey,
    endDate: endKey,
    granularity,
  };
}

/**
 * Bucket keys covering [from, to) for the given granularity, matching the keys
 * produced by `bucketKeySql` so query results can be zero-filled.
 */
export function bucketKeys(
  from: Date,
  to: Date,
  granularity: Granularity,
  tz = REPORTING_TIMEZONE,
): string[] {
  const keys: string[] = [];
  if (granularity === 'hour') {
    const start = localParts(from, tz);
    let cursor = new Date(from.getTime() - start.minute * 60_000);
    while (cursor < to && keys.length < MAX_BUCKETS) {
      const p = localParts(cursor, tz);
      const key = `${toDateKey(p.year, p.month, p.day)} ${String(p.hour).padStart(2, '0')}:00`;
      if (keys[keys.length - 1] !== key) keys.push(key);
      cursor = new Date(cursor.getTime() + 3_600_000);
    }
    return keys;
  }

  const lastKey = localDateKey(new Date(to.getTime() - 1), tz);
  let key = localDateKey(from, tz);
  if (granularity === 'week') {
    // ISO weeks start on Monday, matching Postgres date_trunc('week').
    const [y, m, d] = key.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    key = addDays(key, -((dow + 6) % 7));
  } else if (granularity === 'month') {
    key = `${key.slice(0, 7)}-01`;
  }

  while (key <= lastKey && keys.length < MAX_BUCKETS) {
    keys.push(key);
    if (granularity === 'day') key = addDays(key, 1);
    else if (granularity === 'week') key = addDays(key, 7);
    else {
      const [y, m] = key.split('-').map(Number);
      key =
        m === 12
          ? `${y + 1}-01-01`
          : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    }
  }
  return keys;
}

/** Previous-period bucket keys aligned index-for-index with the current period. */
export function previousBucketKeys(range: ResolvedRange) {
  return bucketKeys(
    range.prevFrom,
    range.prevTo,
    range.granularity,
    range.timezone,
  );
}

/** "2026-10-31 14:05" in the reporting timezone — for CSV exports. */
export function localDateTimeString(
  date: Date | null | undefined,
  tz = REPORTING_TIMEZONE,
) {
  if (!date) return '';
  const p = localParts(date, tz);
  return `${toDateKey(p.year, p.month, p.day)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000);
}
