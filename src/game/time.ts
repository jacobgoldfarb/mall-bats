export const START_YEAR = 2004;
export const START_MONTH = 9;
export const START_DATE = 1;
export const AUCTION_DAY = 91;

export type Phase = 'night' | 'morning' | 'open' | 'closing';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateOf(day: number): Date {
  return new Date(START_YEAR, START_MONTH, START_DATE + day);
}

export const dayOf = (t: number) => Math.floor(t / 1440);
export const minuteOfDay = (t: number) => ((t % 1440) + 1440) % 1440;

export function formatDate(day: number): string {
  const d = dateOf(day);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatClock(t: number): string {
  const m = minuteOfDay(t);
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function weekday(day: number): number {
  return dateOf(day).getDay();
}

export const weekdayName = (day: number) => WEEKDAYS[weekday(day)];

export const weekOf = (day: number) => Math.floor((day + 4) / 7);

export function morningOf(today: number, day: number): string {
  if (day === today) return 'this morning';
  if (day === today + 1) return 'tomorrow morning';
  return `${weekdayName(day)} morning`;
}

export function md(day: number): [number, number] {
  const d = dateOf(day);
  return [d.getMonth() + 1, d.getDate()];
}

export function mallHours(day: number): { open: number; close: number } | null {
  const [m, d] = md(day);
  const wd = weekday(day);
  if (m === 11 && d === 25) return null;
  if (m === 12 && d === 25) return null;
  if (m === 11 && d === 26) return { open: 5 * 60, close: 23 * 60 };
  if (m === 12 && d === 24) return { open: 9 * 60, close: 18 * 60 };
  if (m === 12 && d === 26) return { open: 8 * 60, close: 21 * 60 };
  if (m === 12 && d === 31) return { open: 10 * 60, close: 18 * 60 };
  if (m === 12 && d < 24) return wd === 0 ? { open: 10 * 60, close: 20 * 60 } : { open: 9 * 60, close: 22 * 60 };
  return wd === 0 ? { open: 11 * 60, close: 18 * 60 } : { open: 10 * 60, close: 21 * 60 };
}

export const CLOSING_SPAN = 90;

export function phaseAt(t: number): Phase {
  const day = dayOf(t);
  const m = minuteOfDay(t);
  const hours = mallHours(day);
  if (!hours) return 'night';
  if (m >= hours.open && m < hours.close) return 'open';
  if (m >= hours.close && m < hours.close + CLOSING_SPAN) return 'closing';
  if (m >= 360 && m < hours.open) return 'morning';
  if (hours.open < 360 && m >= hours.open - 60 && m < hours.open) return 'morning';
  return 'night';
}

export function phaseLabel(p: Phase, day: number): string {
  if (!mallHours(day)) return 'MALL CLOSED TODAY';
  return { night: 'AFTER HOURS', morning: 'STAFF ARRIVING', open: 'MALL OPEN', closing: 'CLOSING UP' }[p];
}

const gauss = (x: number, mu: number, s: number) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

export function seasonFactor(day: number): number {
  const [m, d] = md(day);
  if (m === 11 && d === 26) return 3.2;
  if (m === 12 && d === 26) return 2.2;
  if (m === 12 && d === 24) return 1.9;
  if (m === 12 && d < 24) return 1.45 + (d / 24) * 0.35;
  if (m === 12) return 1.15;
  if (m === 10 && d >= 25) return 1.2;
  if (m === 11 && d > 26) return 1.4;
  return 1;
}

export function hourCurve(m: number): number {
  const h = m / 60;
  return Math.min(1.1, 0.3 + 0.45 * gauss(h, 13, 2.2) + 0.6 * gauss(h, 18.5, 2));
}

export function isCold(day: number): boolean {
  const [m, d] = md(day);
  return m === 12 || (m === 11 && d >= 20);
}

export function seasonName(day: number): string {
  const [m, d] = md(day);
  if (m === 10) return d >= 25 ? 'Halloween' : 'Fall';
  if (m === 11) return d >= 26 ? 'Holiday Rush' : 'Late Fall';
  return d <= 25 ? 'Holiday Rush' : 'Year End';
}
