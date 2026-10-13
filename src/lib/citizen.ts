// The Night City citizen ID: a role read from how someone works, a bounty from their rank, and an ID number and
// barcode from their login. Fixed rules over the normalized Profile, no extra requests, so the site and the
// Action agree.

import { ownershipSplit, type Profile } from './profile';
import type { Rank } from './rank';
import { hash, seeded } from './seeded';

export type RoleKey = 'wirejack' | 'gatekeeper' | 'tracer' | 'courier' | 'lonewolf' | 'operator' | 'polyglot' | 'headliner';

export interface Role {
  key: RoleKey | 'drifter';
  name: string;
  /** One line on what the role means, shown under it. */
  tagline: string;
}

export const ROLES: Record<RoleKey | 'drifter', Role> = {
  wirejack: { key: 'wirejack', name: 'Wirejack', tagline: 'Lives in the commit log.' },
  gatekeeper: { key: 'gatekeeper', name: 'Gatekeeper', tagline: 'Nothing merges without a look.' },
  tracer: { key: 'tracer', name: 'Tracer', tagline: 'Finds the bug, files the report.' },
  courier: { key: 'courier', name: 'Courier', tagline: 'Runs work between many crews.' },
  lonewolf: { key: 'lonewolf', name: 'Lone Wolf', tagline: 'Builds in their own repos.' },
  operator: { key: 'operator', name: 'Operator', tagline: 'Works the org, nine to five.' },
  polyglot: { key: 'polyglot', name: 'Polyglot', tagline: 'Writes in every language.' },
  headliner: { key: 'headliner', name: 'Headliner', tagline: 'Their name is on the marquee.' },
  drifter: { key: 'drifter', name: 'Drifter', tagline: 'Passing through, no record yet.' },
};

export interface Citizen {
  role: Role;
  /** The runner-up role, or null when nothing else stands out. */
  trait: Role | null;
  /** Each role's score, 0-1. Highest wins. */
  scores: Record<RoleKey, number>;
}

/** Below this much public work in a year, there is too little to read a role from. */
export const DRIFTER_WORK = 20;
/** A runner-up needs at least this score to count as a trait. */
export const TRAIT_MIN = 0.25;

const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** 0 at `from`, 1 at `to`, clamped. */
const ramp = (n: number, from: number, to: number) => clamp((n - from) / (to - from));

export function roleScores(profile: Profile, rank: Rank): Record<RoleKey, number> {
  const { commits, pullRequests, reviews, issues } = profile.lastYear;
  const work = commits + pullRequests + reviews + issues || 1;
  const split = ownershipSplit(profile.owners);
  const owned = split.org + split.self + split.user || 1;
  // An owner counts when it holds a real share of the year, not a single drive-by.
  const crews = profile.owners.filter((o) => o.total >= 3 && o.total / owned >= 0.02).length;
  const [sun, mon, tue, wed, thu, fri, sat] = profile.byWeekday;
  const week = sun + mon + tue + wed + thu + fri + sat;
  const weekdays = week ? (mon + tue + wed + thu + fri) / week : 0;
  const languages = profile.languages.filter((l) => l.share >= 0.06).length;
  const z = (key: string) => rank.categories.find((c) => c.key === key)?.z ?? 0;
  const [impact, activity] = [z('impact'), z('activity')];

  return {
    // Shares are measured against a typical year, which is about three quarters commits.
    wirejack: ramp(commits / work, 0.6, 0.95),
    gatekeeper: ramp(reviews / work, 0, 0.3),
    tracer: ramp(issues / work, 0.02, 0.25),
    courier: ramp(crews, 3, 12),
    lonewolf: ramp(split.self / owned, 0.6, 0.95),
    // Org work, more so when it keeps office hours.
    operator: ramp(split.org / owned, 0.4, 0.9) * (0.6 + 0.4 * ramp(weekdays, 0.6, 0.85)),
    polyglot: ramp(languages, 2, 5),
    // Known for their work more than for how much of it they do lately. Needs real impact to start with.
    headliner: impact >= 1 ? ramp(impact - activity, 0.5, 2.5) : 0,
  };
}

export function citizenOf(profile: Profile, rank: Rank): Citizen {
  const scores = roleScores(profile, rank);
  const { commits, pullRequests, reviews, issues } = profile.lastYear;
  // A stable sort, so a tie goes to the role listed first in ROLES: how someone works comes before how famous they are.
  const ranked = (Object.entries(scores) as [RoleKey, number][]).sort((a, b) => b[1] - a[1]);
  // Someone famous can be quiet this year and still be a headliner. Everyone else needs a year of work to read.
  if (commits + pullRequests + reviews + issues < DRIFTER_WORK && scores.headliner === 0) {
    return { role: ROLES.drifter, trait: null, scores };
  }
  const [[first], [second, runnerUp]] = ranked;
  return { role: ROLES[first], trait: runnerUp >= TRAIT_MIN ? ROLES[second] : null, scores };
}

/** The bounty stops growing past this share of developers, so the very top is in the tens of millions. */
export const BOUNTY_CAP = Math.pow(10, -4.5);

/**
 * A bounty in credits from the rank percentile, on a log scale: about 50 for the bottom of the field, 1K at the
 * top 10%, 20K at the top 1%, 7.9M at the top 0.01% and 35M at most. Two significant figures.
 */
export function bountyFor(rank: Rank): number {
  const x = -Math.log10(Math.min(1, Math.max(rank.top, BOUNTY_CAP)));
  return Number((50 * Math.pow(10, 1.3 * x)).toPrecision(2));
}

/** "7.9M", "20K", "980". */
export function formatBounty(n: number): string {
  if (n >= 1e6) return `${Number((n / 1e6).toPrecision(2))}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${Number((n / 1e3).toPrecision(2))}K`;
  return String(n);
}

/** A stable citizen number from the login, like "NC-4F2A-91C0". */
export function citizenNumber(login: string): string {
  const a = hash(`${login.toLowerCase()}:id`).toString(16).toUpperCase().padStart(8, '0');
  return `NC-${a.slice(0, 4)}-${a.slice(4, 8)}`;
}

/** Barcode bars as [offset, width] pairs across `width`, the same for a login every time. */
export function barcode(login: string, width: number): [number, number][] {
  const rand = seeded(`${login.toLowerCase()}:barcode`);
  const bars: [number, number][] = [];
  for (let x = 0; x < width;) {
    const w = 1 + Math.floor(rand() * 3);
    if (x + w > width) break;
    bars.push([x, w]);
    x += w + 1 + Math.floor(rand() * 2);
  }
  return bars;
}
