// Night City, the shared city: everyone who runs the Action gets a district, their own skyline on an island in
// one sea. scripts/city.ts writes city.json to the `stats` branch every day and the city page reads it. The
// encoding, the merge and the layout live here so they are tested.

import { heightOf } from '../cards/levels';
import { citizenOf, type Role } from './citizen';
import type { Profile } from './profile';
import { rankProfile } from './rank';

export interface Resident {
  login: string;
  /** Citizen number, in order of arrival. Null for a landmark, a featured profile that never moved in. */
  number: number | null;
  /** The day they moved in. Null for landmarks. */
  since: string | null;
  /** Rank tier name, or '?' when the rank is not complete. */
  tier: string;
  role: Role['key'];
  /** The calendar's first day, YYYY-MM-DD. */
  start: string;
  /** One character per day from `start`: 0 for a day without contributions, else its height in steps 1 to z (base 36). */
  days: string;
  total: number;
  peak: number;
  /** When their data was last fetched. */
  checked: string;
}

export interface CityData {
  updatedAt: string;
  /** The next citizen number. Numbers are never reused, so someone who leaves and comes back gets a new one. */
  next: number;
  residents: Resident[];
}

/** What a resident looks like before the city gives them a number. */
export type ResidentData = Omit<Resident, 'number' | 'since'>;

const STEPS = 35;

/** Each day as one base 36 character, its height relative to the year's peak. Any day with work gets at least 1. */
export function encodeDays(counts: number[], peak: number): string {
  return counts.map((c) => (c > 0 ? Math.max(1, Math.round(heightOf(c, peak) * STEPS)).toString(36) : '0')).join('');
}

/** Heights 0-1 back from the day string. */
export function decodeDays(days: string): number[] {
  return [...days].map((c) => parseInt(c, 36) / STEPS || 0);
}

export function residentData(profile: Profile, at: string): ResidentData {
  const rank = rankProfile(profile);
  const days = profile.weeks.flat();
  const peak = profile.peakDay?.count ?? 0;
  return {
    login: profile.login,
    tier: rank.complete ? rank.tier.name : '?',
    role: citizenOf(profile, rank).role.key,
    start: days[0]?.date ?? at.slice(0, 10),
    days: encodeDays(
      days.map((d) => d.count),
      peak,
    ),
    total: profile.totals.contributions,
    peak,
    checked: at,
  };
}

/** One run's view of who lives in the city. */
export interface Census {
  at: string;
  /** Logins running the Action with the city on, in the order they were found. */
  citizens: string[];
  /** Featured logins. A landmark that also runs the Action is a citizen. */
  landmarks: string[];
  /** Fresh data from this run, keyed by lowercased login. Everyone else keeps their last data. */
  fresh: Map<string, ResidentData>;
}

const key = (login: string) => login.toLowerCase();

export function mergeCity(prev: CityData | null, census: Census): CityData {
  const old = new Map(prev?.residents.map((r) => [key(r.login), r]));
  const today = census.at.slice(0, 10);
  let next = prev?.next ?? 1;
  const data = (login: string) => census.fresh.get(key(login)) ?? old.get(key(login));

  const citizens = [...new Set(census.citizens.map(key))].filter((login) => data(login));
  const settled: Resident[] = [];
  const arriving: string[] = [];
  for (const login of citizens) {
    const was = old.get(login);
    if (was?.number) settled.push({ ...was, ...data(login)!, number: was.number, since: was.since });
    else arriving.push(login);
  }
  // Newcomers get numbers in login order, so a run numbers the same people the same way.
  for (const login of arriving.sort()) settled.push({ ...data(login)!, number: next++, since: today });

  const living = new Set(citizens);
  const landmarks = [...new Set(census.landmarks.map(key))]
    .filter((login) => !living.has(login) && data(login))
    .sort()
    .map((login): Resident => ({ ...data(login)!, number: null, since: null }));

  return {
    updatedAt: census.at,
    next,
    residents: [...settled.sort((a, b) => a.number! - b.number!), ...landmarks],
  };
}

/** Who to fetch this run, at most `max`: anyone with no data yet first, then the longest unchecked. */
export function refreshOrder(prev: CityData | null, logins: string[], max: number): string[] {
  const checked = new Map(prev?.residents.map((r) => [key(r.login), r.checked]));
  return [...new Set(logins.map(key))]
    .sort((a, b) => (checked.get(a) ?? '').localeCompare(checked.get(b) ?? '') || a.localeCompare(b))
    .slice(0, max);
}

// ---- Workflow files ------------------------------------------------------------------------------------------

export interface ActionStep {
  /** Who the step renders cards for: its `username` input, else the repo owner. */
  users: string[];
  /** False when the step sets `city: off`. */
  city: boolean;
}

const unquote = (value: string) =>
  value
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');

/**
 * Every step in a workflow file that uses the Action, with its `username` and `city` inputs. A line scan rather
 * than a YAML parser: it only needs the `with:` block of one step, and a file it cannot read just yields nothing.
 */
export function actionSteps(yaml: string, action: string, owner: string): ActionStep[] {
  const lines = yaml.split(/\r?\n/);
  const indent = (line: string) => line.search(/\S/);
  const uses = new RegExp(`^(\\s*(?:-\\s+)?)uses:\\s*['"]?${action.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}@`, 'i');
  const steps: ActionStep[] = [];

  lines.forEach((line, i) => {
    const match = uses.exec(line);
    if (!match) return;
    const col = match[1].length; // where this step's keys start
    // The step runs from its dash back up the file to the next one at a shallower indent.
    let from = i;
    while (from > 0 && !/^\s*-\s/.test(lines[from]) && indent(lines[from - 1]) >= col - 2) from--;
    let to = i + 1;
    while (to < lines.length && (!lines[to].trim() || (indent(lines[to]) >= col && !/^\s*-\s/.test(lines[to].slice(0, col + 2))))) to++;
    const inputs: Record<string, string> = {};
    for (let j = from; j < to; j++) {
      if (!/^\s*(-\s+)?with:\s*$/.test(lines[j])) continue;
      for (let k = j + 1; k < to && (!lines[k].trim() || indent(lines[k]) > col); k++) {
        const pair = /^\s*([\w-]+):\s*(.*)$/.exec(lines[k]);
        if (pair) inputs[pair[1]] = unquote(pair[2]);
      }
    }
    const raw = inputs.username;
    const users = !raw
      ? [owner]
      : raw.includes('${{')
        ? /^\$\{\{\s*github\.repository_owner\s*\}\}$/.test(raw)
          ? [owner]
          : []
        : raw.split(/[\s,]+/).filter(Boolean);
    steps.push({ users, city: !/^(off|false|no|0)$/i.test(inputs.city ?? '') });
  });
  return steps;
}

// ---- Layout --------------------------------------------------------------------------------------------------

/** A district's footprint in cells: a year of weeks by seven days. */
export const DISTRICT = { w: 53, d: 7 };
/** A district plus its share of the canals around it. */
export const PLOT = { w: 60, d: 14 };

export interface Plot {
  x: number;
  z: number;
}

/**
 * Where the first `count` districts go, in order: rows of plots, every other row shifted by half a plot like
 * bricks, nearest the centre first. The order never changes, so a new arrival never moves anyone else and the
 * oldest citizens are the old town in the middle.
 */
export function plots(count: number): Plot[] {
  if (count <= 0) return [];
  // Enough rows and columns to hold `count` plots in a circle, with room to spare.
  const radius = Math.sqrt((count * PLOT.w * PLOT.d) / Math.PI) * 1.6 + PLOT.w;
  const cols = Math.ceil(radius / PLOT.w) + 1;
  const rows = Math.ceil(radius / PLOT.d) + 1;
  const all: (Plot & { r: number; a: number })[] = [];
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      const x = (i + (Math.abs(j) % 2) / 2) * PLOT.w;
      const z = j * PLOT.d;
      all.push({ x, z, r: Math.round(Math.hypot(x, z) * 1000), a: Math.atan2(z, x) });
    }
  }
  return all
    .sort((p, q) => p.r - q.r || p.a - q.a)
    .slice(0, count)
    .map(({ x, z }) => ({ x, z }));
}

/** How tall a district stands, 0.3-1, from its year's contributions: about 10,000 is full height. */
export function stature(total: number): number {
  return 0.3 + 0.7 * Math.min(1, Math.log10(total + 1) / 4);
}

/** A district's days as [week, weekday, height 0-1], with the empty days left out (they are sea). */
export function districtDays(resident: Pick<Resident, 'start' | 'days'>): [number, number, number][] {
  const first = new Date(`${resident.start}T00:00:00Z`).getUTCDay();
  const out: [number, number, number][] = [];
  decodeDays(resident.days).forEach((h, i) => {
    if (h > 0) out.push([Math.floor((first + i) / 7), (first + i) % 7, h]);
  });
  return out;
}

/** The newest citizens first. */
export function newest(city: CityData, count: number): Resident[] {
  return city.residents
    .filter((r) => r.number !== null)
    .sort((a, b) => b.number! - a.number!)
    .slice(0, count);
}
