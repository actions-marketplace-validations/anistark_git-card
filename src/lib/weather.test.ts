import { describe, expect, it } from 'vitest';
import { demoProfile } from '../og/demo';
import { normalize, type RawUser } from './profile';
import { FIREWORKS_DAYS, FOG_DAYS, WEATHER_STATES, weatherFor } from './weather';

type Weeks = RawUser['contributionsCollection']['contributionCalendar']['weeks'];

const DAYS = 53 * 7;

/** A year of calendar, 53 full weeks from a Sunday. `count` gets each day's index, 0 oldest, and its weekday. */
function profile(count: (i: number, weekday: number) => number) {
  const from = Date.parse('2025-10-05T00:00:00Z');
  const weeks: Weeks = [];
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      const i = w * 7 + d;
      const n = count(i, d);
      total += n;
      contributionDays.push({ date: new Date(from + i * 86_400_000).toISOString().slice(0, 10), contributionCount: n, weekday: d });
    }
    weeks.push({ contributionDays });
  }
  return normalize(
    {
      login: 'octo',
      name: null,
      avatarUrl: '',
      bio: null,
      location: null,
      company: null,
      websiteUrl: null,
      createdAt: '2016-01-01T00:00:00Z',
      followers: { totalCount: 0 },
      following: { totalCount: 0 },
      pullRequests: { totalCount: 0 },
      issues: { totalCount: 0 },
      repositories: { totalCount: 0, nodes: [] },
      contributionsCollection: { totalCommitContributions: total, contributionCalendar: { totalContributions: total, weeks } },
    },
    new Date(from + DAYS * 86_400_000),
  );
}

/** Four on weekdays, nothing at weekends: 20 a week, never a long streak. */
const weekdays = (_: number, weekday: number) => (weekday > 0 && weekday < 6 ? 4 : 0);
/** The usual weekday rhythm, with the last `n` days replaced. */
const ending = (tail: number[]) => profile((i, d) => (i >= DAYS - tail.length ? tail[i - (DAYS - tail.length)] : weekdays(i, d)));
const state = (p: ReturnType<typeof profile>) => weatherFor(p)?.state;

describe('weatherFor', () => {
  it('has no weather without a calendar', () => {
    expect(weatherFor({ ...profile(() => 0), weeks: [] })).toBeNull();
  });

  it('is foggy over an empty year', () => {
    expect(weatherFor(profile(() => 0))).toMatchObject({ state: 'fog', reason: 'No contributions this year' });
  });

  it('is clear on an ordinary week', () => {
    expect(weatherFor(profile(weekdays))).toMatchObject({ state: 'clear', label: 'clear' });
  });

  /** The weekday rhythm, then a run of `n` active days ending today, with an empty day before it. */
  const streak = (n: number, before: (i: number, weekday: number) => number = weekdays) =>
    profile((i, d) => (i >= DAYS - n ? 1 : i === DAYS - n - 1 ? 0 : before(i, d)));

  it('sets off fireworks when a streak first reaches two weeks', () => {
    expect(weatherFor(streak(14))).toMatchObject({ state: 'fireworks', reason: '14 day streak, a new best' });
    expect(state(streak(13))).not.toBe('fireworks');
  });

  it(`keeps the fireworks for ${FIREWORKS_DAYS} days, not for the whole streak`, () => {
    expect(state(streak(13 + FIREWORKS_DAYS))).toBe('fireworks');
    expect(state(streak(14 + FIREWORKS_DAYS))).not.toBe('fireworks');
  });

  it("sets them off again when the streak passes the year's old best", () => {
    const old = (i: number, d: number) => (i >= 10 && i < 40 ? 1 : i === 9 || i === 40 ? 0 : weekdays(i, d));
    expect(weatherFor(streak(31, old))).toMatchObject({ state: 'fireworks', reason: "31 day streak, past the year's best of 30" });
    expect(state(streak(30, old))).not.toBe('fireworks');
    expect(state(streak(30 + FIREWORKS_DAYS, old))).toBe('fireworks');
    expect(state(streak(31 + FIREWORKS_DAYS, old))).not.toBe('fireworks');
  });

  it('marks every hundred days of a streak', () => {
    expect(weatherFor(streak(100))).toMatchObject({ state: 'fireworks', reason: '100 day streak and counting' });
    expect(state(streak(99 + FIREWORKS_DAYS))).toBe('fireworks');
    expect(state(streak(100 + FIREWORKS_DAYS))).not.toBe('fireworks');
    expect(state(streak(300))).toBe('fireworks');
  });

  it('counts the streak up to yesterday when today is still empty', () => {
    const p = profile((i, d) => (i === DAYS - 1 ? 0 : i >= DAYS - 15 ? 1 : i === DAYS - 16 ? 0 : weekdays(i, d)));
    expect(weatherFor(p)).toMatchObject({ state: 'fireworks', reason: '14 day streak, a new best' });
  });

  it('storms when the last seven days are the busiest of the year', () => {
    expect(weatherFor(ending([0, 9, 9, 9, 9, 9, 0]))).toMatchObject({
      state: 'storm',
      reason: '45 contributions this week, the busiest of the year',
    });
    expect(state(ending([0, 5, 4, 4, 4, 4, 0]))).toBe('storm');
    // Matching an earlier week is not enough, or a regular rhythm would storm every day.
    expect(state(ending([0, 4, 4, 4, 4, 4, 0]))).toBe('clear');
    expect(state(profile((i, d) => (i === 40 ? 9 : weekdays(i, d))))).toBe('clear');
  });

  it('needs a real week of work for a storm', () => {
    expect(state(profile((i) => (i === DAYS - 2 ? 9 : 0)))).not.toBe('storm');
    expect(state(profile((i) => (i === DAYS - 2 ? 10 : 0)))).toBe('storm');
  });

  it(`rolls in fog after ${FOG_DAYS} quiet days`, () => {
    expect(weatherFor(ending([4, ...Array(FOG_DAYS).fill(0)]))).toMatchObject({
      state: 'fog',
      reason: '14 days since the last contribution',
    });
    expect(state(ending([4, ...Array(FOG_DAYS - 1).fill(0)]))).toBe('rain');
  });

  it('rains when the week is under a quarter of the usual', () => {
    // The usual week is 20, so 4 is under a quarter and 5 is not.
    expect(weatherFor(ending([0, 4, 0, 0, 0, 0, 0]))).toMatchObject({
      state: 'rain',
      label: 'neon rain',
      reason: '4 contributions this week, under a quarter of the usual 20',
    });
    expect(state(ending([0, 5, 0, 0, 0, 0, 0]))).toBe('clear');
  });

  it('never rains on a profile whose usual week is empty', () => {
    expect(state(profile((i) => (i % 30 === 0 ? 1 : 0)))).not.toBe('rain');
  });

  it('does not count an empty today, which is not over yet', () => {
    const p = ending([0, 4, 4, 4, 4, 4, 0, 0]);
    expect(weatherFor(p)!.week).toHaveLength(7);
    expect(weatherFor(p)!.week.at(-1)).toBe(p.weeks.at(-1)!.at(-2)!.date);
    // With contributions today, today is in the week.
    const busy = ending([0, 4, 4, 4, 4, 4, 0, 4]);
    expect(weatherFor(busy)!.week.at(-1)).toBe(busy.weeks.at(-1)!.at(-1)!.date);
  });

  it.each(WEATHER_STATES)('puts the demo city in %s', (s) => {
    expect(state(demoProfile(s))).toBe(s);
  });
});
