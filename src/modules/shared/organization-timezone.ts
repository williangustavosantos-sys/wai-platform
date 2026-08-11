export interface OrganizationMonthRange {
  month: string;
  startAt: string;
  endAt: string;
}

export interface OrganizationDayRange {
  date: string;
  startAt: string;
  endAt: string;
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DEFAULT_TIMEZONE = 'Europe/Rome';

function assertValidTimezone(timezone: string): string {
  const candidate = timezone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function toNumber(value: string | undefined): number {
  return Number(value || '0');
}

function getParts(value: Date, timezone: string): DateTimeParts {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: assertValidTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);

  const parts = Object.fromEntries(values.map((part) => [part.type, part.value]));
  return {
    year: toNumber(parts.year),
    month: toNumber(parts.month),
    day: toNumber(parts.day),
    hour: toNumber(parts.hour),
    minute: toNumber(parts.minute),
    second: toNumber(parts.second),
  };
}

function formatPart(value: number): string {
  return String(value).padStart(2, '0');
}

function localPartsToEpoch(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function timezoneOffsetMilliseconds(instant: Date, timezone: string): number {
  return localPartsToEpoch(getParts(instant, timezone)) - instant.getTime();
}

function parseLocalDateTime(value: string): DateTimeParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const parts: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || '0'),
  };

  const date = new Date(localPartsToEpoch(parts));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59
  ) {
    return null;
  }

  return parts;
}

function sameParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second;
}

/**
 * Converts an ISO-like local value from an organization's IANA timezone to UTC.
 * It rejects non-existent local times instead of silently shifting a booking across DST.
 */
export function organizationLocalDateTimeToUtc(value: string, timezone: string): string | null {
  const local = parseLocalDateTime(value);
  if (!local) return null;

  const safeTimezone = assertValidTimezone(timezone);
  const assumedUtc = localPartsToEpoch(local);
  let instant = new Date(assumedUtc - timezoneOffsetMilliseconds(new Date(assumedUtc), safeTimezone));
  instant = new Date(assumedUtc - timezoneOffsetMilliseconds(instant, safeTimezone));

  return sameParts(getParts(instant, safeTimezone), local) ? instant.toISOString() : null;
}

export function getOrganizationDateKey(value: string | Date, timezone: string): string {
  const parts = getParts(new Date(value), timezone);
  return `${parts.year}-${formatPart(parts.month)}-${formatPart(parts.day)}`;
}

export function getOrganizationMonth(value: Date, timezone: string): string {
  const parts = getParts(value, timezone);
  return `${parts.year}-${formatPart(parts.month)}`;
}

export function isOrganizationMonth(value: string | undefined): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  return true;
}

export function getOrganizationMonthRange(month: string, timezone: string): OrganizationMonthRange {
  if (!isOrganizationMonth(month)) {
    throw new Error('Mês organizacional inválido. Use YYYY-MM.');
  }

  const [year, monthIndex] = month.split('-').map(Number);
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;
  const nextYear = monthIndex === 12 ? year + 1 : year;
  const startAt = organizationLocalDateTimeToUtc(`${year}-${formatPart(monthIndex)}-01T00:00:00`, timezone);
  const endAt = organizationLocalDateTimeToUtc(`${nextYear}-${formatPart(nextMonth)}-01T00:00:00`, timezone);

  if (!startAt || !endAt) {
    throw new Error('Não foi possível calcular o intervalo mensal da organização.');
  }

  return { month, startAt, endAt };
}

export function getOrganizationDayRange(date: string, timezone: string): OrganizationDayRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)) {
    throw new Error('Data organizacional inválida. Use YYYY-MM-DD.');
  }

  const [year, month, day] = date.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) {
    throw new Error('Data organizacional inválida.');
  }
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = `${next.getUTCFullYear()}-${formatPart(next.getUTCMonth() + 1)}-${formatPart(next.getUTCDate())}`;
  const startAt = organizationLocalDateTimeToUtc(`${date}T00:00:00`, timezone);
  const endAt = organizationLocalDateTimeToUtc(`${nextDate}T00:00:00`, timezone);

  if (!startAt || !endAt) {
    throw new Error('Não foi possível calcular o intervalo diário da organização.');
  }

  return { date, startAt, endAt };
}

export function toOrganizationDateTimeInput(value: string | Date, timezone: string): string {
  const parts = getParts(new Date(value), timezone);
  return `${parts.year}-${formatPart(parts.month)}-${formatPart(parts.day)}T${formatPart(parts.hour)}:${formatPart(parts.minute)}`;
}

export function formatOrganizationDateTime(
  value: string | Date,
  timezone: string,
  locale = 'it-IT',
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: assertValidTimezone(timezone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(new Date(value));
}

export function formatOrganizationMonth(month: string, timezone: string, locale = 'it-IT'): string {
  const range = getOrganizationMonthRange(month, timezone);
  return new Intl.DateTimeFormat(locale, {
    timeZone: assertValidTimezone(timezone),
    month: 'long',
    year: 'numeric',
  }).format(new Date(range.startAt));
}
