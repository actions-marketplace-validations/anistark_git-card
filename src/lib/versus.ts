// Versus: two profiles head to head. A tale of the tape row by row, the three rank categories, an overall result
// by rank with a draw zone, and a short verdict picked from fixed lines. No extra requests beyond the two profiles.

import { bountyFor, citizenOf, formatBounty } from './citizen';
import { fmt } from './format';
import type { Profile } from './profile';
import { rankProfile, type Category, type Rank } from './rank';
import { hash } from './seeded';

export type Side = 'a' | 'b';

export interface Row {
  key: string;
  label: string;
  a: string;
  b: string;
  /** Who leads this row, or null for a tie or a row that is only for show. */
  winner: Side | null;
}

export interface CategoryResult {
  key: Category;
  label: string;
  /** Who leads, or null when the two are within the draw zone. */
  winner: Side | null;
  /** How far apart, in rank z-score units, positive when a leads. */
  gap: number;
}

export type Outcome = 'win' | 'draw' | 'pending';
export type Margin = 'draw' | 'narrow' | 'clear' | 'rout';

export interface Versus {
  rows: Row[];
  categories: CategoryResult[];
  /** 'pending' when a rank is not known yet (a calendar is missing), so there is no fair overall result. */
  outcome: Outcome;
  winner: Side | null;
  margin: Margin | null;
  /** One line on the result. Empty while pending. */
  verdict: string;
  ranks: { a: Rank; b: Rank };
}

/** Within this many z-score units, a category or the whole match is a draw. */
export const DRAW_ZONE = 0.15;
/** Up to this gap a win is narrow, up to the next it is clear, past it a rout. */
export const MARGINS = { narrow: 0.6, clear: 1.5 };

const lead = (a: number, b: number): Side | null => (a > b ? 'a' : b > a ? 'b' : null);

function rows(a: Profile, b: Profile, ra: Rank, rb: Rank): Row[] {
  const complete = ra.complete && rb.complete;
  const number = (key: string, label: string, get: (p: Profile) => number): Row => ({
    key,
    label,
    a: fmt(get(a)),
    b: fmt(get(b)),
    winner: lead(get(a), get(b)),
  });
  const language = (p: Profile) => p.languages[0]?.name ?? 'None';
  return [
    {
      key: 'rank',
      label: 'Rank',
      a: ra.complete ? ra.tier.name : '?',
      b: rb.complete ? rb.tier.name : '?',
      // A lower share of developers above you is a better rank.
      winner: complete ? lead(rb.top, ra.top) : null,
    },
    {
      key: 'bounty',
      label: 'Bounty',
      a: ra.complete ? `${formatBounty(bountyFor(ra))} CR` : '?',
      b: rb.complete ? `${formatBounty(bountyFor(rb))} CR` : '?',
      winner: complete ? lead(bountyFor(ra), bountyFor(rb)) : null,
    },
    { key: 'role', label: 'Role', a: citizenOf(a, ra).role.name, b: citizenOf(b, rb).role.name, winner: null },
    number('contributions', 'Contributions', (p) => p.totals.contributions),
    number('active', 'Active days', (p) => p.activeDays),
    number('streak', 'Longest streak', (p) => p.streaks.longest),
    number('stars', 'Stars', (p) => p.totals.stars),
    number('followers', 'Followers', (p) => p.followers),
    { key: 'language', label: 'Top language', a: language(a), b: language(b), winner: null },
  ];
}

// Fixed lines. {w} is the winner, {l} the other side, {c} the category that did the most for the winner.
const LINES: Record<Margin, string[]> = {
  draw: ['Dead heat. Neither city blinks.', 'Too close to call. Call it a draw.', 'Even match. Run it back next month.'],
  narrow: ['{w} edges it by a whisker.', '{w} by a nose. {l} is right behind.', 'Photo finish, {w} just ahead.'],
  clear: ['{w} takes it, mostly on {c}.', '{w} wins on {c}. {l} will want a rematch.', 'A clear win for {w}, built on {c}.'],
  rout: ['{w} owns this town.', 'Not close. {w} runs the city.', '{w} wins going away.'],
};

/** Head to head, from a's side. Swapping a and b mirrors every result. */
export function compare(a: Profile, b: Profile): Versus {
  const ra = rankProfile(a);
  const rb = rankProfile(b);
  const categories: CategoryResult[] = ra.categories.map((ca) => {
    const cb = rb.categories.find((c) => c.key === ca.key)!;
    const gap = ca.z - cb.z;
    return { key: ca.key, label: ca.label, gap, winner: Math.abs(gap) < DRAW_ZONE ? null : gap > 0 ? 'a' : 'b' };
  });
  const base = { rows: rows(a, b, ra, rb), categories, ranks: { a: ra, b: rb } };
  if (!ra.complete || !rb.complete) return { ...base, outcome: 'pending', winner: null, margin: null, verdict: '' };

  const gap = ra.z - rb.z;
  const size = Math.abs(gap);
  const margin: Margin = size < DRAW_ZONE ? 'draw' : size < MARGINS.narrow ? 'narrow' : size < MARGINS.clear ? 'clear' : 'rout';
  const winner: Side | null = margin === 'draw' ? null : gap > 0 ? 'a' : 'b';
  // The category that did the most for the winner.
  const sign = winner === 'b' ? -1 : 1;
  const best = [...categories].sort((x, y) => sign * y.gap - sign * x.gap)[0];
  // The same pair, in either order, always gets the same line.
  const pair = [a.login.toLowerCase(), b.login.toLowerCase()].sort().join(':');
  const lines = LINES[margin];
  const name = (side: Side) => `@${side === 'a' ? a.login : b.login}`;
  const verdict = lines[hash(pair) % lines.length]
    .replace('{w}', winner ? name(winner) : '')
    .replace('{l}', winner ? name(winner === 'a' ? 'b' : 'a') : '')
    .replace('{c}', best.label.toLowerCase());
  return { ...base, outcome: margin === 'draw' ? 'draw' : 'win', winner, margin, verdict };
}
