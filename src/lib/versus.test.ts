import { describe, expect, it } from 'vitest';
import { demoProfile } from '../og/demo';
import type { Profile } from './profile';
import { compare, DRAW_ZONE, type Side } from './versus';

const base = demoProfile();
const as = (login: string, p: Profile = base): Profile => ({ ...p, login, name: login });
/** The demo year with more reach: stars and followers scaled up. */
const famous = (login: string, scale: number): Profile =>
  as(login, { ...base, totals: { ...base.totals, stars: base.totals.stars + 400 * scale }, followers: base.followers + 100 * scale });
const empty = as('ghost', {
  ...base,
  weeks: base.weeks.map((w) => w.map((d) => ({ ...d, count: 0 }))),
  totals: { ...base.totals, contributions: 0, commits: 0, stars: 0 },
  activeDays: 0,
  followers: 0,
  peakDay: null,
});
const flip = (s: Side | null) => (s === 'a' ? 'b' : s === 'b' ? 'a' : null);

describe('compare', () => {
  it('calls identical profiles a draw', () => {
    const v = compare(as('left'), as('right'));
    expect(v.outcome).toBe('draw');
    expect(v.winner).toBeNull();
    expect(v.categories.every((c) => c.winner === null)).toBe(true);
    expect(v.verdict).not.toMatch(/@/);
  });

  it('gives a clear win to the stronger profile and names the category that did it', () => {
    const v = compare(famous('star', 40), as('rookie'));
    expect(v.outcome).toBe('win');
    expect(v.winner).toBe('a');
    expect(['narrow', 'clear', 'rout']).toContain(v.margin);
    expect(v.categories.find((c) => c.key === 'impact')?.winner).toBe('a');
    expect(v.rows.find((r) => r.key === 'stars')?.winner).toBe('a');
  });

  it('routs an empty profile', () => {
    const v = compare(as('anyone'), empty);
    expect(v.winner).toBe('a');
    expect(v.margin).toBe('rout');
    expect(v.verdict).toContain('@anyone');
  });

  it('keeps a near tie inside the draw zone', () => {
    const known = (login: string, stars: number): Profile => as(login, { ...base, totals: { ...base.totals, stars }, followers: 300 });
    const v = compare(known('a1', 1020), known('b1', 1000));
    expect(Math.abs(v.ranks.a.z - v.ranks.b.z)).toBeLessThan(DRAW_ZONE);
    expect(v.outcome).toBe('draw');
  });

  it('mirrors every result when the sides swap, with the same line for the pair', () => {
    const one = compare(famous('star', 12), as('rookie'));
    const two = compare(as('rookie'), famous('star', 12));
    expect(two.winner).toBe(flip(one.winner));
    expect(two.margin).toBe(one.margin);
    expect(two.verdict).toBe(one.verdict);
    expect(two.categories.map((c) => c.winner)).toEqual(one.categories.map((c) => flip(c.winner)));
    expect(two.rows.map((r) => r.winner)).toEqual(one.rows.map((r) => flip(r.winner)));
  });

  it('holds the result while a calendar is missing', () => {
    const v = compare(as('anyone'), { ...empty, weeks: [] });
    expect(v.outcome).toBe('pending');
    expect(v.verdict).toBe('');
    expect(v.rows.find((r) => r.key === 'rank')).toMatchObject({ b: '?', winner: null });
  });

  it('keeps show-only rows out of the scoring', () => {
    const v = compare(famous('star', 40), as('rookie'));
    expect(v.rows.find((r) => r.key === 'role')?.winner).toBeNull();
    expect(v.rows.find((r) => r.key === 'language')?.winner).toBeNull();
  });

  it('has no em dashes or semicolons in any verdict', () => {
    for (const scale of [0, 0.05, 2, 12, 40]) {
      for (const other of ['b1', 'b2', 'b3', 'b4', 'b5']) expect(compare(famous('a', scale), as(other)).verdict).not.toMatch(/[—;]/);
    }
  });
});
