'use strict';
// Strict ISO dates for the injected clock and the packet dates (V1): one form each, real calendar dates, a time zone for instants.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 86400000;
const SKEW_MS = 5 * 60 * 1000;

// Epoch ms of the UTC midnight of a real calendar date, or NaN (month 13, 2026-02-30, 0000-00-00 and 2027-02-29 all fail the round trip).
function dayStart(y, m, d) {
  if (y < 1 || m < 1 || m > 12 || d < 1) return NaN;
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.getTime() : NaN;
}

// YYYY-MM-DD only. Returns epoch ms of the day start or NaN.
function parseDate(value) {
  const m = typeof value === 'string' ? DATE_ONLY.exec(value) : null;
  return m ? dayStart(Number(m[1]), Number(m[2]), Number(m[3])) : NaN;
}

// YYYY-MM-DDTHH:MM:SS[.fff] followed by Z or +-HH:MM. Returns epoch ms (UTC) or NaN.
function parseInstant(value) {
  const m = typeof value === 'string' ? INSTANT.exec(value) : null;
  if (!m) return NaN;
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  const base = dayStart(Number(m[1]), Number(m[2]), Number(m[3]));
  const zone = m[7] === 'Z' ? 0 : (m[7][0] === '-' ? -1 : 1) * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(4, 6)));
  const zoneOk = m[7] === 'Z' || (Number(m[7].slice(1, 3)) <= 23 && Number(m[7].slice(4, 6)) <= 59);
  if (Number.isNaN(base) || h > 23 || mi > 59 || s > 59 || !zoneOk) return NaN;
  return base + ((h * 60 + mi) * 60 + s) * 1000 - zone * 60000;
}

// The injected clock: an ISO instant or a date alone (read as 00:00:00Z).
const parseClock = (value) => (typeof value === 'string' && DATE_ONLY.test(value) ? parseDate(value) : parseInstant(value));

// Whole UTC days between a day start and the UTC day of an instant: the 7-day price rule counts calendar days.
const utcDay = (instantMs) => instantMs - (((instantMs % DAY_MS) + DAY_MS) % DAY_MS);
const ageDays = (dayMs, instantMs) => Math.round((utcDay(instantMs) - dayMs) / DAY_MS);

module.exports = { parseDate, parseInstant, parseClock, ageDays, utcDay, DAY_MS, SKEW_MS };
