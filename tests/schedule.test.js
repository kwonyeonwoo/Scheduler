import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MONTHLY_HOURS,
  calculateMonth,
  clampHours,
  getAdjustedHours,
  getEndTime,
  normalizeSchedule,
} from '../app/lib/schedule.js';
import { getHoliday } from '../app/lib/holidays.js';

test('clampHours rejects invalid, negative, over-limit, and non-half-hour values', () => {
  assert.equal(clampHours('invalid'), 0);
  assert.equal(clampHours(-4), 0);
  assert.equal(clampHours(20), 8);
  assert.equal(clampHours(3.26), 3.5);
});

test('calculateMonth caps monthly work chronologically at 80 hours', () => {
  const schedule = normalizeSchedule({
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  assert.equal(result.totalAccHours, MAX_MONTHLY_HOURS);
  assert.equal(result.days.filter(Boolean).reduce((sum, day) => sum + day.effectiveHours, 0), 80);
});

test('calculateMonth uses effective capped hours to calculate end time', () => {
  const schedule = normalizeSchedule({
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
    exceptions: { '2026-07-15': 7 },
    startExceptions: { '2026-07-15': '09:00' },
    lunchExceptions: { '2026-07-15': '1.0' },
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  const capped = result.days.find((day) => day?.type === 'capped');
  assert.ok(capped);
  assert.equal(capped.end, getEndTime(capped.start, capped.effectiveHours, capped.lunch));
});

test('holidays are excluded unless the user explicitly overrides them', () => {
  const holidayLookup = (dateKey) => dateKey === '2026-07-06' ? 'Test Holiday' : null;
  const base = normalizeSchedule({ defaults: { 0: 0, 1: 8, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } });
  const withoutOverride = calculateMonth(base, new Date(2026, 6, 1), holidayLookup);
  assert.equal(withoutOverride.days.find((day) => day?.dateKey === '2026-07-06').effectiveHours, 0);

  const withOverride = normalizeSchedule({ ...base, exceptions: { '2026-07-06': 4 } });
  const overridden = calculateMonth(withOverride, new Date(2026, 6, 1), holidayLookup);
  assert.equal(overridden.days.find((day) => day?.dateKey === '2026-07-06').effectiveHours, 4);
});

test('getAdjustedHours respects daily and remaining monthly limits', () => {
  const schedule = normalizeSchedule({
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
  });
  assert.equal(getAdjustedHours(schedule, '2026-07-31', 20), 0);
  assert.equal(getAdjustedHours(schedule, '2026-07-01', 20), 8);
});

test('future Korean lunar holidays are calculated beyond the old 2026 table', () => {
  assert.ok(getHoliday('2027-02-06'));
});
