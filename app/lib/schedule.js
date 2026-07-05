export const MAX_MONTHLY_HOURS = 80;
export const MAX_DAILY_HOURS = 8;
export const HOURLY_WAGE = 12790;
export const DAYS_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

export const EMPTY_SCHEDULE = {
  name: '',
  legacyId: null,
  defaults: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  exceptions: {},
  startDefaults: { 0: '09:00', 1: '09:00', 2: '09:00', 3: '09:00', 4: '09:00', 5: '09:00', 6: '09:00' },
  startExceptions: {},
  lunchDefaults: { 0: '1.0', 1: '1.0', 2: '1.0', 3: '1.0', 4: '1.0', 5: '1.0', 6: '1.0' },
  lunchExceptions: {},
};

export function clampHours(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_DAILY_HOURS, Math.round(parsed * 2) / 2));
}

export function normalizeWeekMap(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback;
  return Object.fromEntries(
    Object.keys(fallback).map((key) => [key, source?.[key] ?? fallback[key]])
  );
}

export function normalizeSchedule(data = {}) {
  return {
    name: typeof data.name === 'string' ? data.name : '',
    legacyId: typeof data.legacyId === 'string' ? data.legacyId : null,
    defaults: Object.fromEntries(
      Object.entries(normalizeWeekMap(data.defaults, EMPTY_SCHEDULE.defaults))
        .map(([key, value]) => [key, clampHours(value)])
    ),
    exceptions: Object.fromEntries(
      Object.entries(data.exceptions || {}).map(([key, value]) => [key, clampHours(value)])
    ),
    startDefaults: normalizeWeekMap(data.startDefaults, EMPTY_SCHEDULE.startDefaults),
    startExceptions: data.startExceptions || {},
    lunchDefaults: normalizeWeekMap(data.lunchDefaults, EMPTY_SCHEDULE.lunchDefaults),
    lunchExceptions: data.lunchExceptions || {},
  };
}

export function getEndTime(startTime, effectiveHours, lunchHours) {
  if (!startTime || effectiveHours <= 0) return '';
  const [hours, minutes] = startTime.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  const totalMinutes = hours * 60 + minutes + Math.round((Number(effectiveHours) + Number(lunchHours || 0)) * 60);
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function calculateMonth(schedule, date, getHoliday = () => null) {
  const normalized = normalizeSchedule(schedule);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = Array.from({ length: firstDay.getDay() }, () => null);
  let totalAccHours = 0;

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, day).getDay();
    const holidayName = getHoliday(dateKey);
    const hasException = Object.prototype.hasOwnProperty.call(normalized.exceptions, dateKey);
    let scheduledHours = hasException
      ? clampHours(normalized.exceptions[dateKey])
      : clampHours(normalized.defaults[dayOfWeek]);

    if (holidayName && !hasException) scheduledHours = 0;

    const effectiveHours = Math.min(scheduledHours, Math.max(0, MAX_MONTHLY_HOURS - totalAccHours));
    const type = holidayName && !hasException
      ? 'holiday'
      : effectiveHours < scheduledHours
        ? 'capped'
        : hasException
          ? scheduledHours === 0 ? 'holiday' : 'exception'
          : 'default';
    const start = normalized.startExceptions[dateKey] || normalized.startDefaults[dayOfWeek] || '09:00';
    const lunch = Number(normalized.lunchExceptions[dateKey] ?? normalized.lunchDefaults[dayOfWeek] ?? 1);
    const end = getEndTime(start, effectiveHours, lunch);

    totalAccHours += effectiveHours;
    days.push({
      day,
      dateKey,
      hours: scheduledHours,
      effectiveHours,
      start,
      end,
      lunch,
      type,
      dayOfWeek,
      holidayName,
    });
  }

  return {
    days,
    totalAccHours,
    totalWage: totalAccHours * HOURLY_WAGE,
  };
}

export function getAdjustedHours(schedule, dateKey, targetHours, getHoliday = () => null) {
  const normalized = normalizeSchedule(schedule);
  const [year, month, targetDay] = dateKey.split('-').map(Number);
  let precedingDaysTotal = 0;

  for (let day = 1; day < targetDay; day += 1) {
    const currentKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const hasException = Object.prototype.hasOwnProperty.call(normalized.exceptions, currentKey);
    const holidayName = getHoliday(currentKey);
    let hours = hasException
      ? clampHours(normalized.exceptions[currentKey])
      : clampHours(normalized.defaults[dayOfWeek]);
    if (holidayName && !hasException) hours = 0;
    precedingDaysTotal += hours;
  }

  return Math.min(clampHours(targetHours), Math.max(0, MAX_MONTHLY_HOURS - precedingDaysTotal));
}
