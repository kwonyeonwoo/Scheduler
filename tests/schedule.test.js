import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MONTHLY_HOURS,
  MAX_WEEKLY_HOURS,
  WAGES,
  calculateMonth,
  clampHours,
  getEndTime,
  getWeeklyLimit,
  isIntensiveWorkDate,
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
    semesterEndDate: '2026-06-30',
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  assert.equal(result.totalAccHours, MAX_MONTHLY_HOURS);
  assert.equal(result.days.filter(Boolean).reduce((sum, day) => sum + day.effectiveHours, 0), 80);
});

test('calculateMonth uses effective capped hours to calculate end time', () => {
  const schedule = normalizeSchedule({
    semesterEndDate: '2026-06-30',
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

test('all work modes use the 40-hour weekly limit', () => {
  const schedule = normalizeSchedule({
    defaults: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    exceptions: {
      '2026-07-20': 8, '2026-07-21': 8, '2026-07-22': 8,
      '2026-07-23': 8, '2026-07-24': 8,
    },
  });
  assert.equal(getWeeklyLimit(schedule, '2026-07-20'), MAX_WEEKLY_HOURS);

  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  const week = result.days.filter((day) => day?.dateKey >= '2026-07-20' && day?.dateKey <= '2026-07-26');
  assert.equal(week.reduce((sum, day) => sum + day.effectiveHours, 0), 40);
});

test('intensive work removes the monthly cap only from its configured start date', () => {
  const schedule = normalizeSchedule({
    intensiveWork: true,
    intensiveStartDate: '2026-07-20',
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  const startDay = result.days.find((day) => day?.dateKey === '2026-07-20');

  assert.equal(isIntensiveWorkDate(schedule, '2026-07-19'), false);
  assert.equal(isIntensiveWorkDate(schedule, '2026-07-20'), true);
  assert.equal(startDay.intensiveWork, true);
  assert.equal(result.totalAccHours, 160);
});

test('intensive work without a start date keeps the 80-hour monthly cap', () => {
  const schedule = normalizeSchedule({
    intensiveWork: true,
    intensiveStartDate: '',
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  assert.equal(result.totalAccHours, MAX_MONTHLY_HOURS);
});

test('the requested 6-10, 13-16, and 25 pattern preserves all 80 entered hours', () => {
  const workDates = [
    '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
    '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
    '2026-07-25',
  ];
  const schedule = normalizeSchedule({
    semesterEndDate: '2026-06-30',
    defaults: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    exceptions: Object.fromEntries(workDates.map((dateKey) => [dateKey, 8])),
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  const day25 = result.days.find((day) => day?.dateKey === '2026-07-25');

  assert.equal(result.totalAccHours, 80);
  assert.equal(day25.hours, 8);
  assert.equal(day25.effectiveHours, 8);
});

test('requested hours remain stored even when a statutory cap reduces recognized hours', () => {
  const schedule = normalizeSchedule({
    semesterEndDate: '2026-06-30',
    defaults: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
    exceptions: { '2026-07-31': 8 },
  });
  const result = calculateMonth(schedule, new Date(2026, 6, 1));
  const day31 = result.days.find((day) => day?.dateKey === '2026-07-31');

  assert.equal(result.totalAccHours, 80);
  assert.equal(day31.hours, 8);
  assert.equal(day31.effectiveHours, 0);
});

test('estimated wage follows the selected 2026 on-campus or off-campus rate', () => {
  const base = {
    defaults: { 0: 0, 1: 8, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  };
  const onCampus = calculateMonth(normalizeSchedule({ ...base, workplaceType: 'onCampus' }), new Date(2026, 6, 1));
  const offCampus = calculateMonth(normalizeSchedule({ ...base, workplaceType: 'offCampus' }), new Date(2026, 6, 1));

  assert.equal(onCampus.hourlyWage, WAGES.onCampus);
  assert.equal(offCampus.hourlyWage, WAGES.offCampus);
  assert.equal(onCampus.totalWage, onCampus.totalAccHours * WAGES.onCampus);
  assert.equal(offCampus.totalWage, offCampus.totalAccHours * WAGES.offCampus);
});

test('future Korean lunar holidays are calculated beyond the old 2026 table', () => {
  assert.ok(getHoliday('2027-02-06'));
});
