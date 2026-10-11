// Easter eggs: hidden badges found in the contribution calendar alone. Day eggs hang a neon sign on the
// tower of the day that earned them. No extra requests, everything comes from the normalized Profile.

import { hasCalendar, type Day, type Profile } from './profile';

export interface EggDef {
  key: string;
  /** Short text for the rooftop sign. Null for eggs with no day to sit on. */
  sign: string | null;
  label: string;
  /** How it was earned, shown once found. */
  hint: string;
}

export interface Egg extends EggDef {
  /** The day that earned it, or null when it is a pattern across the year. */
  date: string | null;
}

// Rarest first. When there is only room for a few signs, the first ones win.
export const EGGS: EggDef[] = [
  { key: 'leap', sign: '2/29', label: 'Leap day', hint: 'Contributed on 29 February.' },
  { key: 'xmas', sign: 'XMAS', label: 'Christmas shift', hint: 'Contributed on Christmas Day.' },
  { key: 'newyear', sign: 'HNY', label: 'First light', hint: 'Contributed on New Year’s Day.' },
  { key: 'pi', sign: '3.14', label: 'Pi day', hint: 'Contributed on 14 March.' },
  { key: 'halloween', sign: 'BOO', label: 'Night of the living commits', hint: 'Contributed on Halloween.' },
  { key: 'devday', sign: '256', label: 'Programmers’ day', hint: 'Contributed on the 256th day of the year.' },
  { key: 'cakeday', sign: 'CAKE', label: 'Cake day', hint: 'Contributed on the anniversary of joining GitHub.' },
  { key: 'friday13', sign: '13', label: 'Unlucky for some', hint: 'Contributed on a Friday the 13th.' },
  { key: 'perfect30', sign: 'ALL', label: 'Full month', hint: 'Contributed on every day of a calendar month.' },
  { key: 'marathon', sign: '100', label: 'Marathon', hint: 'Kept a streak going for 100 days or more.' },
  { key: 'perfect7', sign: '7/7', label: 'Full week', hint: 'Contributed on every day of a week.' },
  { key: 'comeback', sign: 'BACK', label: 'Comeback', hint: 'Came back after 30 days or more away.' },
  { key: 'weekender', sign: null, label: 'Weekend warrior', hint: 'Weekends busier than weekdays, on average.' },
];

/** Most rooftop signs a skyline shows, so the city does not get cluttered. */
export const MAX_SIGNS = 3;

const COMEBACK_GAP = 30;
const MARATHON = 100;
const DAY_MS = 86_400_000;

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function dayOfYear(date: string): number {
  return Math.round((time(date) - Date.UTC(Number(date.slice(0, 4)), 0, 1)) / DAY_MS) + 1;
}

function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

function lastActive(days: Day[], test: (day: Day) => boolean): string | null {
  for (let i = days.length - 1; i >= 0; i--) if (days[i].count > 0 && test(days[i])) return days[i].date;
  return null;
}

function onDate(days: Day[], monthDay: string): string | null {
  return lastActive(days, (d) => d.date.slice(5) === monthDay);
}

function perfectWeek(weeks: Day[][]): string | null {
  for (let w = weeks.length - 1; w >= 0; w--) {
    const week = weeks[w];
    if (week.length === 7 && week.every((d) => d.count > 0)) return week[6].date;
  }
  return null;
}

function perfectMonth(days: Day[]): string | null {
  const months = new Map<string, Day[]>();
  for (const d of days) {
    const month = d.date.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(d);
  }
  for (const [month, list] of [...months].reverse()) {
    if (list.length === daysInMonth(month) && list.every((d) => d.count > 0)) return list.at(-1)!.date;
  }
  return null;
}

function comeback(days: Day[]): string | null {
  let found: string | null = null;
  let previous: string | null = null;
  for (const d of days) {
    if (d.count === 0) continue;
    if (previous && (time(d.date) - time(previous)) / DAY_MS > COMEBACK_GAP) found = d.date;
    previous = d.date;
  }
  return found;
}

function weekender(profile: Profile): boolean {
  const [sun, mon, tue, wed, thu, fri, sat] = profile.byWeekday;
  return profile.activeDays >= 20 && (sat + sun) / 2 > (mon + tue + wed + thu + fri) / 5;
}

export function findEggs(profile: Profile): Egg[] {
  if (!hasCalendar(profile)) return [];
  const days = profile.weeks.flat();
  const joined = profile.createdAt.slice(0, 10);
  const { longest, longestEnd } = profile.streaks;

  // A date for day eggs, true for patterns with no single day, null or false when not found.
  const found: Record<string, string | boolean | null> = {
    leap: onDate(days, '02-29'),
    xmas: onDate(days, '12-25'),
    newyear: onDate(days, '01-01'),
    pi: onDate(days, '03-14'),
    halloween: onDate(days, '10-31'),
    devday: lastActive(days, (d) => dayOfYear(d.date) === 256),
    cakeday: lastActive(days, (d) => d.date.slice(5) === joined.slice(5) && d.date > joined),
    friday13: lastActive(days, (d) => d.weekday === 5 && d.date.endsWith('-13')),
    perfect30: perfectMonth(days),
    marathon: longest >= MARATHON ? longestEnd : null,
    perfect7: perfectWeek(profile.weeks),
    comeback: comeback(days),
    weekender: weekender(profile),
  };

  return EGGS.filter((def) => found[def.key]).map((def) => {
    const hit = found[def.key];
    return { ...def, date: typeof hit === 'string' ? hit : null };
  });
}

export function signEggs(eggs: Egg[]): (Egg & { sign: string; date: string })[] {
  return eggs.filter((e): e is Egg & { sign: string; date: string } => !!e.sign && !!e.date);
}
