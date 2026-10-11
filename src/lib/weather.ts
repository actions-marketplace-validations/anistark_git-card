// Weather over the skyline, from the last week or two of work. Every rule compares a profile with itself,
// never with other people, so a quiet developer is not always in the rain. No extra requests: the calendar
// alone decides, so the site and the Action agree, and a README skyline changes its mood day to day.

import { hasCalendar, type Day, type Profile } from './profile';

export const WEATHER_STATES = ['fireworks', 'storm', 'fog', 'rain', 'clear'] as const;
export type WeatherState = (typeof WEATHER_STATES)[number];

export interface Weather {
  state: WeatherState;
  /** Short name for the forecast, like "neon rain". */
  label: string;
  /** Why, in one line. */
  reason: string;
  /** Dates of the week the forecast looks at, oldest first. */
  week: string[];
}

export const WEATHER_LABELS: Record<WeatherState, string> = {
  fireworks: 'fireworks',
  storm: 'storm',
  fog: 'fog',
  rain: 'neon rain',
  clear: 'clear',
};

/** The shortest streak that can set off fireworks. */
export const FIREWORKS_STREAK = 14;
/** Fireworks last this many days after a streak beats the year's old best, or passes a milestone. */
export const FIREWORKS_DAYS = 7;
/** Every this many days of streak is a milestone. */
export const FIREWORKS_MILESTONE = 100;
/** Days without a contribution before the fog rolls in. */
export const FOG_DAYS = 14;
/** Below this share of a usual week, it rains. */
export const RAIN_SHARE = 0.25;
/** A busiest week needs at least this many contributions to count as a storm. */
export const STORM_MIN = 10;

const sum = (days: Day[]) => days.reduce((n, d) => n + d.count, 0);

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Longest run of active days in a list. */
function longestRun(days: Day[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) best = Math.max(best, (run = d.count > 0 ? run + 1 : 0));
  return best;
}

/**
 * Why the current streak sets off fireworks today, or null. They are an event, not a state: a week after the
 * streak beats the year's old best (or first reaches two weeks), and a week after each hundred days.
 */
function celebration(days: Day[]): string | null {
  let current = 0;
  while (current < days.length && days[days.length - 1 - current].count > 0) current++;
  if (current < FIREWORKS_STREAK) return null;
  if (current % FIREWORKS_MILESTONE < FIREWORKS_DAYS && current >= FIREWORKS_MILESTONE) return `${current} day streak and counting`;
  const before = longestRun(days.slice(0, days.length - current - 1));
  const record = Math.max(before, FIREWORKS_STREAK - 1);
  if (current > record && current - record <= FIREWORKS_DAYS)
    return before >= FIREWORKS_STREAK ? `${current} day streak, past the year's best of ${before}` : `${current} day streak, a new best`;
  return null;
}

/**
 * Today's weather, or null without a calendar. The calendar's last day is today, and an empty today does
 * not count yet (it is not over), the same way streaks treat it. First match wins.
 */
export function weatherFor(profile: Profile): Weather | null {
  if (!hasCalendar(profile)) return null;
  const all = profile.weeks.flat();
  const days = all.at(-1)!.count === 0 ? all.slice(0, -1) : all;
  const week = days.slice(-7);
  const recent = sum(week);
  const make = (state: WeatherState, reason: string): Weather => ({
    state,
    label: WEATHER_LABELS[state],
    reason,
    week: week.map((d) => d.date),
  });

  const party = celebration(days);
  if (party) return make('fireworks', party);

  // Busiest of every 7-day window, and of those that end before this week starts. Matching an earlier week is
  // not enough, or a perfectly regular rhythm would storm every day.
  let busiest = 0;
  let before = 0;
  for (let i = 0; i + 7 <= days.length; i++) {
    const total = sum(days.slice(i, i + 7));
    busiest = Math.max(busiest, total);
    if (i + 14 <= days.length) before = Math.max(before, total);
  }
  if (recent >= STORM_MIN && recent >= busiest && recent > before)
    return make('storm', `${plural(recent, 'contribution')} this week, the busiest of the year`);

  const last = all.findLastIndex((d) => d.count > 0);
  if (last < 0) return make('fog', 'No contributions this year');
  const quiet = all.length - 1 - last;
  if (quiet >= FOG_DAYS) return make('fog', `${plural(quiet, 'day')} since the last contribution`);

  const usual = median(profile.weeks.filter((w) => w.length === 7).map(sum));
  if (recent < usual * RAIN_SHARE)
    return make('rain', `${plural(recent, 'contribution')} this week, under a quarter of the usual ${Math.round(usual)}`);

  return make('clear', `${plural(recent, 'contribution')} this week, clear skies`);
}
