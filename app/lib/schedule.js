export const MAX_MONTHLY_HOURS = 80;
export const MAX_DAILY_HOURS = 8;
export const TERM_WEEKLY_HOURS = 20;
export const VACATION_WEEKLY_HOURS = 40;
export const SEMESTER_MAX_HOURS = 640;
export const WAGES = {
  onCampus: 10320,
  offCampus: 12790,
};
export const DAYS_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

export const EMPTY_SCHEDULE = {
  name: '',
  legacyId: null,
  semesterEndDate: '',
  workplaceType: 'offCampus',
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
    semesterEndDate: typeof data.semesterEndDate === 'string' ? data.semesterEndDate : '',
    workplaceType: data.workplaceType === 'onCampus' ? 'onCampus' : 'offCampus',
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

export function getWeeklyLimit(schedule, dateKey) {
  if (!schedule.semesterEndDate || dateKey <= schedule.semesterEndDate) {
    return TERM_WEEKLY_HOURS;
  }
  return VACATION_WEEKLY_HOURS;
}

function getScheduledHours(schedule, date, getHoliday) {
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const hasException = Object.prototype.hasOwnProperty.call(schedule.exceptions, dateKey);
  let hours = hasException
    ? clampHours(schedule.exceptions[dateKey])
    : clampHours(schedule.defaults[date.getDay()]);
  if (getHoliday(dateKey) && !hasException) hours = 0;
  return { dateKey, hours };
}

export function calculateMonth(schedule, date, getHoliday = () => null) {
  const normalized = normalizeSchedule(schedule);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = Array.from({ length: firstDay.getDay() }, () => null);
  let totalAccHours = 0;
  let weeklyAccHours = 0;
  const daysSinceMonday = (firstDay.getDay() + 6) % 7;
  for (let offset = daysSinceMonday; offset > 0; offset -= 1) {
    const previousDate = new Date(year, month, 1 - offset);
    const previous = getScheduledHours(normalized, previousDate, getHoliday);
    weeklyAccHours += Math.min(
      previous.hours,
      Math.max(0, getWeeklyLimit(normalized, previous.dateKey) - weeklyAccHours)
    );
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, day).getDay();
    if (dayOfWeek === 1) weeklyAccHours = 0;
    const holidayName = getHoliday(dateKey);
    const hasException = Object.prototype.hasOwnProperty.call(normalized.exceptions, dateKey);
    let scheduledHours = hasException
      ? clampHours(normalized.exceptions[dateKey])
      : clampHours(normalized.defaults[dayOfWeek]);

    if (holidayName && !hasException) scheduledHours = 0;

    const weeklyLimit = getWeeklyLimit(normalized, dateKey);
    const effectiveHours = Math.min(
      scheduledHours,
      Math.max(0, MAX_MONTHLY_HOURS - totalAccHours),
      Math.max(0, weeklyLimit - weeklyAccHours)
    );
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
    weeklyAccHours += effectiveHours;
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
      weeklyLimit,
      periodType: normalized.semesterEndDate && dateKey > normalized.semesterEndDate ? 'vacation' : 'term',
    });
  }

  return {
    days,
    totalAccHours,
    totalWage: totalAccHours * WAGES[normalized.workplaceType],
    hourlyWage: WAGES[normalized.workplaceType],
  };
}
