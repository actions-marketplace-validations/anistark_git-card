import { describe, expect, it } from 'vitest';
import { dayOfYear, EGGS, findEggs } from './eggs';
import { normalize, type RawUser } from './profile';

type Weeks = RawUser['contributionsCollection']['contributionCalendar']['weeks'];

/** A year of calendar from `start` (a Sunday), 53 weeks, with counts from `count`. */
function profile(count: (date: string, weekday: number) => number, { start = '2025-10-05', createdAt = '2016-01-01T00:00:00Z' } = {}) {
  const from = Date.parse(`${start}T00:00:00Z`);
  const weeks: Weeks = [];
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(from + (w * 7 + d) * 86_400_000).toISOString().slice(0, 10);
      const n = count(date, d);
      total += n;
      contributionDays.push({ date, contributionCount: n, weekday: d });
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
      createdAt,
      followers: { totalCount: 0 },
      following: { totalCount: 0 },
      pullRequests: { totalCount: 0 },
      issues: { totalCount: 0 },
      repositories: { totalCount: 0, nodes: [] },
      contributionsCollection: { totalCommitContributions: total, contributionCalendar: { totalContributions: total, weeks } },
    },
    new Date(from + 53 * 7 * 86_400_000),
  );
}

/** Active only on the given dates. */
const only = (...dates: string[]) => profile((date) => (dates.includes(date) ? 3 : 0));
const keys = (p: ReturnType<typeof profile>) => findEggs(p).map((e) => e.key);
const egg = (p: ReturnType<typeof profile>, key: string) => findEggs(p).find((e) => e.key === key);

describe('findEggs', () => {
  it('finds nothing in an empty year or a missing calendar', () => {
    expect(findEggs(profile(() => 0))).toEqual([]);
    const empty = profile(() => 0);
    expect(findEggs({ ...empty, weeks: [] })).toEqual([]);
  });

  it.each([
    ['xmas', '2025-12-25'],
    ['newyear', '2026-01-01'],
    ['pi', '2026-03-14'],
    ['halloween', '2025-10-31'],
    ['devday', '2026-09-13'],
    ['friday13', '2026-02-13'],
  ])('%s on %s', (key, date) => {
    expect(egg(only(date), key)?.date).toBe(date);
  });

  it('needs a contribution on the day itself', () => {
    expect(keys(only('2025-12-24', '2025-12-26'))).not.toContain('xmas');
  });

  it('finds a leap day only in a leap year', () => {
    const leap = profile((date) => (date === '2028-02-29' ? 1 : 0), { start: '2027-10-03' });
    expect(egg(leap, 'leap')?.date).toBe('2028-02-29');
    expect(keys(only('2026-02-28', '2026-03-01'))).not.toContain('leap');
  });

  it('counts the 256th day from 1 January, a day earlier in leap years', () => {
    expect(dayOfYear('2026-09-13')).toBe(256);
    expect(dayOfYear('2028-09-12')).toBe(256);
    expect(dayOfYear('2026-01-01')).toBe(1);
  });

  it('skips a Friday the 13th that is not a Friday, and a 13th Friday that is not the 13th', () => {
    expect(keys(only('2026-01-13', '2026-01-16'))).not.toContain('friday13');
  });

  it('celebrates the join anniversary, but not the join day itself', () => {
    const p = (createdAt: string) => profile((date) => (date === '2026-04-02' ? 1 : 0), { createdAt });
    expect(egg(p('2019-04-02T08:00:00Z'), 'cakeday')?.date).toBe('2026-04-02');
    expect(keys(p('2026-04-02T08:00:00Z'))).not.toContain('cakeday');
  });

  it('picks the most recent day when a date appears twice in the window', () => {
    // 53 weeks from 26 October 2025 run to 31 October 2026, so Halloween is in it twice.
    const p = profile((date) => (date.endsWith('-10-31') ? 1 : 0), { start: '2025-10-26' });
    expect(p.weeks.flat().filter((d) => d.date.endsWith('-10-31'))).toHaveLength(2);
    expect(egg(p, 'halloween')?.date).toBe('2026-10-31');
  });

  it('finds a full week, ending on its Saturday', () => {
    const p = profile((date) => (date >= '2026-03-01' && date <= '2026-03-07' ? 1 : 0));
    expect(egg(p, 'perfect7')?.date).toBe('2026-03-07');
    const gap = profile((date) => (date >= '2026-03-01' && date <= '2026-03-07' && date !== '2026-03-04' ? 1 : 0));
    expect(keys(gap)).not.toContain('perfect7');
  });

  it('finds a full calendar month, but not one cut off by the window', () => {
    const feb = profile((date) => (date.startsWith('2026-02') ? 1 : 0));
    expect(egg(feb, 'perfect30')?.date).toBe('2026-02-28');
    // The window starts on 5 October, so October 2025 is never complete.
    const oct = profile((date) => (date.startsWith('2025-10') ? 1 : 0));
    expect(keys(oct)).not.toContain('perfect30');
  });

  it('finds a marathon at 100 days, at the end of the streak', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    const run = (n: number) =>
      profile((date) => {
        const i = (Date.parse(`${date}T00:00:00Z`) - start) / 86_400_000;
        return i >= 0 && i < n ? 1 : 0;
      });
    expect(egg(run(100), 'marathon')?.date).toBe('2026-04-10');
    expect(keys(run(99))).not.toContain('marathon');
  });

  it('finds a comeback after more than 30 days away, the most recent one', () => {
    expect(egg(only('2026-01-01', '2026-02-01', '2026-02-02'), 'comeback')?.date).toBe('2026-02-01');
    expect(keys(only('2026-01-01', '2026-01-31'))).not.toContain('comeback');
    expect(egg(only('2025-11-01', '2025-12-15', '2026-03-01'), 'comeback')?.date).toBe('2026-03-01');
  });

  it('does not count the quiet start of the window as a comeback', () => {
    expect(keys(only('2026-06-01'))).not.toContain('comeback');
  });

  it('finds a weekend warrior with no date, and needs enough activity', () => {
    const weekends = profile((_, weekday) => (weekday === 0 || weekday === 6 ? 4 : weekday === 3 ? 1 : 0));
    expect(egg(weekends, 'weekender')).toMatchObject({ date: null, sign: null });
    expect(keys(only('2026-01-03', '2026-01-04'))).not.toContain('weekender');
    expect(keys(profile((_, weekday) => (weekday > 0 && weekday < 6 ? 2 : 1)))).not.toContain('weekender');
  });

  it('returns eggs rarest first, in the EGGS order', () => {
    const order = EGGS.map((e) => e.key);
    const found = keys(profile(() => 1));
    expect(found.length).toBeGreaterThan(5);
    expect([...found].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(found);
  });

  it('has short signs and unique keys', () => {
    expect(new Set(EGGS.map((e) => e.key)).size).toBe(EGGS.length);
    for (const e of EGGS) if (e.sign) expect(e.sign.length).toBeLessThanOrEqual(4);
  });
});
