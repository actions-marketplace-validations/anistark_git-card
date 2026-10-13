import { describe, expect, it } from 'vitest';
import { barcode, BOUNTY_CAP, bountyFor, citizenNumber, citizenOf, formatBounty, ROLES, type RoleKey } from './citizen';
import type { OwnerActivity, Profile } from './profile';
import type { Rank } from './rank';

interface Shape {
  commits?: number;
  pullRequests?: number;
  reviews?: number;
  issues?: number;
  /** Total work per owner type, one owner each unless `crews` spreads it out. */
  self?: number;
  org?: number;
  user?: number;
  crews?: number;
  languages?: number[];
  byWeekday?: number[];
}

/** A profile with only what roles read. A typical year by default: mostly commits, mostly in its own repos. */
function profile(shape: Shape = {}): Profile {
  const { commits = 300, pullRequests = 40, reviews = 20, issues = 20, self = 250, org = 100, user = 30, crews = 0 } = shape;
  const owner = (type: OwnerActivity['type'], total: number, i = 0) => ({ type, total, login: `${type}${i}` }) as OwnerActivity;
  const owners = [owner('self', self), owner('org', org), owner('user', user)].filter((o) => o.total > 0);
  for (let i = 1; i <= crews; i++) owners.push(owner('user', 20, i));
  return {
    lastYear: { commits, pullRequests, reviews, issues, total: commits + pullRequests + reviews + issues },
    owners,
    languages: (shape.languages ?? [0.6, 0.3, 0.1]).map((share, i) => ({ name: `L${i}`, bytes: 0, share })),
    byWeekday: shape.byWeekday ?? [5, 20, 20, 20, 20, 20, 5],
  } as unknown as Profile;
}

/** A rank with only the category scores roles read. */
const rank = (impact = 0, activity = 0, top = 0.5) =>
  ({
    top,
    categories: [
      { key: 'impact', z: impact },
      { key: 'activity', z: activity },
      { key: 'collaboration', z: 0 },
    ],
  }) as unknown as Rank;

const roleOf = (p: Profile, r = rank()) => citizenOf(p, r).role.key;

describe('citizenOf', () => {
  it('calls a profile with almost no public work a Drifter', () => {
    const empty = citizenOf(profile({ commits: 5, pullRequests: 0, reviews: 0, issues: 0, self: 5, org: 0, user: 0 }), rank());
    expect(empty.role).toBe(ROLES.drifter);
    expect(empty.trait).toBeNull();
  });

  it('still reads a quiet but famous profile as a Headliner', () => {
    expect(roleOf(profile({ commits: 0, pullRequests: 0, reviews: 0, issues: 0 }), rank(3, -1))).toBe('headliner');
  });

  it('gives a typical year a role, not Drifter', () => {
    expect(roleOf(profile())).not.toBe('drifter');
  });

  it.each<[RoleKey, Shape, Rank?]>([
    ['wirejack', { commits: 900, pullRequests: 10, reviews: 5, issues: 5, self: 120, org: 120, user: 120 }],
    ['gatekeeper', { commits: 200, pullRequests: 50, reviews: 300, issues: 10, self: 120, org: 120, user: 120 }],
    ['tracer', { commits: 150, pullRequests: 20, reviews: 10, issues: 120, self: 120, org: 120, user: 120 }],
    ['courier', { self: 40, org: 40, user: 40, crews: 12, commits: 250 }],
    ['lonewolf', { self: 900, org: 10, user: 10, commits: 250 }],
    ['operator', { self: 20, org: 600, user: 20, commits: 250, byWeekday: [0, 30, 30, 30, 30, 30, 0] }],
    ['polyglot', { languages: [0.25, 0.2, 0.2, 0.15, 0.1, 0.1], self: 120, org: 120, user: 120, commits: 250 }],
    ['headliner', { self: 120, org: 120, user: 120, commits: 250 }, rank(3, 0)],
  ])('reads a %s from the shape of the work', (role, shape, r) => {
    expect(roleOf(profile(shape), r)).toBe(role);
  });

  it('names the runner-up as a trait when it stands out', () => {
    const c = citizenOf(profile({ commits: 200, reviews: 300, self: 900, org: 10, user: 10 }), rank());
    expect(c.role.key).toBe('gatekeeper');
    expect(c.trait?.key).toBe('lonewolf');
  });

  it('breaks a tie toward how someone works, before how famous they are', () => {
    const c = citizenOf(profile({ commits: 900, pullRequests: 0, reviews: 0, issues: 0, self: 900, org: 0, user: 0 }), rank(5, 0));
    expect([c.scores.wirejack, c.scores.lonewolf, c.scores.headliner]).toEqual([1, 1, 1]);
    expect(c.role.key).toBe('wirejack');
    expect(c.trait?.key).toBe('lonewolf');
  });
});

describe('bountyFor', () => {
  it('rises with the rank and never falls', () => {
    const tops = [1, 0.5, 0.15, 0.05, 0.01, 0.001, 0.0001, 0.00001];
    const bounties = tops.map((top) => bountyFor(rank(0, 0, top)));
    for (let i = 1; i < bounties.length; i++) expect(bounties[i]).toBeGreaterThanOrEqual(bounties[i - 1]);
  });

  it('puts the bottom near nothing, the top 1% in the tens of thousands and the top 0.01% in the millions', () => {
    expect(bountyFor(rank(0, 0, 1))).toBe(50);
    expect(bountyFor(rank(0, 0, 0.01))).toBe(20_000);
    expect(bountyFor(rank(0, 0, 0.0001))).toBe(7_900_000);
  });

  it('stops at the cap', () => {
    expect(bountyFor(rank(0, 0, 1e-9))).toBe(bountyFor(rank(0, 0, BOUNTY_CAP)));
  });
});

describe('formatBounty', () => {
  it.each([
    [50, '50'],
    [980, '980'],
    [1000, '1K'],
    [1500, '1.5K'],
    [20_000, '20K'],
    [7_900_000, '7.9M'],
    [35_000_000, '35M'],
  ])('%i reads %s', (n, text) => {
    expect(formatBounty(n)).toBe(text);
  });
});

describe('citizenNumber and barcode', () => {
  it('give a login the same number and bars every time, whatever the case', () => {
    expect(citizenNumber('OctoCat')).toBe(citizenNumber('octocat'));
    expect(citizenNumber('octocat')).toMatch(/^NC-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(barcode('octocat', 112)).toEqual(barcode('OctoCat', 112));
  });

  it('give different logins different numbers and bars', () => {
    expect(citizenNumber('octocat')).not.toBe(citizenNumber('torvalds'));
    expect(barcode('octocat', 112)).not.toEqual(barcode('torvalds', 112));
  });

  it('keeps the bars inside the width', () => {
    for (const [x, w] of barcode('octocat', 112)) expect(x + w).toBeLessThanOrEqual(112);
  });
});
