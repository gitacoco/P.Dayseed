import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parse,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

export const DATE_KEY_FORMAT = "yyyy-MM-dd";

export function dateKey(date = new Date()) {
  return format(date, DATE_KEY_FORMAT);
}

export function parseDateKey(key: string) {
  return parse(key, DATE_KEY_FORMAT, new Date());
}

export function readableDate(key: string) {
  return format(parseDateKey(key), "MMM d, yyyy");
}

export function monthTitle(key: string) {
  return format(parseDateKey(key), "MMMM yyyy");
}

export function yearTitle(key: string) {
  return format(parseDateKey(key), "yyyy");
}

export function monthGrid(key: string) {
  const date = parseDateKey(key);
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });

  while (days.length < 42) {
    const next = new Date(days[days.length - 1]);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }

  return days.slice(0, 42).map((day) => ({
    key: dateKey(day),
    inCurrentMonth: day.getMonth() === date.getMonth(),
    isToday: isSameDay(day, new Date()),
  }));
}

export function yearDays(key: string) {
  const date = parseDateKey(key);
  return eachDayOfInterval({
    start: startOfYear(date),
    end: endOfYear(date),
  }).map((day) => dateKey(day));
}

export function weekGrid(key: string) {
  const date = parseDateKey(key);

  return eachDayOfInterval({
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  }).map((day) => ({
    key: dateKey(day),
    isToday: isSameDay(day, new Date()),
  }));
}

export function isFutureDate(key: string) {
  return isAfter(parseDateKey(key), new Date());
}

export function isPastDate(key: string) {
  const today = parseDateKey(dateKey());
  return isBefore(parseDateKey(key), today);
}

export function isTodayKey(key: string) {
  return key === dateKey();
}

export function sameMonth(a: string, b: string) {
  return format(parseDateKey(a), "yyyy-MM") === format(parseDateKey(b), "yyyy-MM");
}

export function sameYear(a: string, b: string) {
  return format(parseDateKey(a), "yyyy") === format(parseDateKey(b), "yyyy");
}
