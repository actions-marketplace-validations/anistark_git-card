// Night City census: everyone whose workflow runs the Action moves in, with their skyline, rank and role. Merges
// the run into city.json. In Actions, the Stats workflow keeps that file on the `stats` branch next to history.json.
//
//   tsx scripts/city.ts --out public/city.local.json
//   tsx scripts/city.ts --out public/city.local.json --fake 1000   # a made-up city, for checking the page at scale
//
// Code search needs a token, so GITHUB_TOKEN is required. Each profile is one GraphQL query (cost 1, a few
// seconds), so a run refreshes at most --max residents, newcomers first, and everyone else keeps their last data.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { actionSteps, mergeCity, refreshOrder, residentData, type CityData, type ResidentData } from '../src/lib/city';
import { featuredLogins } from '../src/lib/featured';
import { fetchProfileGraphQL, GitHubError } from '../src/lib/github';
import { isValidLogin } from '../src/lib/profile';
import { seeded } from '../src/lib/seeded';
import { demoProfile } from '../src/og/demo';
import { SITE } from '../src/site';
import { restClient } from './rest';

const { values } = parseArgs({
  options: { out: { type: 'string' }, max: { type: 'string', default: '300' }, fake: { type: 'string' } },
});
const out = values.out;
const at = new Date().toISOString();
const prev = out && existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as CityData) : null;

function save(city: CityData) {
  if (!out) return;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(city)}\n`);
}

if (values.fake) {
  // Every resident is a variation on the demo year, so the page can be checked with any number of them.
  const base = demoProfile();
  const n = Number(values.fake);
  const fresh = new Map<string, ResidentData>();
  const citizens: string[] = [];
  for (let i = 0; i < n; i++) {
    const login = `citizen-${String(i + 1).padStart(4, '0')}`;
    const rand = seeded(login);
    const busy = rand() * 2.2;
    const quiet = 0.15 + rand() * 0.8;
    const weeks = base.weeks.map((w) => w.map((d) => ({ ...d, count: rand() < quiet ? Math.round(d.count * busy) : 0 })));
    const peak = weeks.flat().reduce((m, d) => (d.count > (m?.count ?? 0) ? d : m), null as (typeof weeks)[0][0] | null);
    const total = weeks.flat().reduce((s, d) => s + d.count, 0);
    fresh.set(login, {
      ...residentData({ ...base, login, weeks, peakDay: peak, totals: { ...base.totals, contributions: total } }, at),
      tier: ['C', 'B', 'A', 'A+', 'S'][Math.floor(rand() * 5)],
    });
    citizens.push(login);
  }
  const city = mergeCity(null, { at, citizens, landmarks: [], fresh });
  save(city);
  console.log(`Wrote a made-up city of ${city.residents.length} residents${out ? ` to ${out}` : ''}`);
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required, since code search needs auth.');
const get = restClient(token);
const repo = new URL(SITE.repo).pathname.slice(1).toLowerCase();
const action = SITE.action.split('@')[0];
const blocked = new Set<string>(SITE.city.blocklist.map((l) => l.toLowerCase()));

/** Every workflow file that mentions the Action. Code search returns at most 1000 results, 100 a page. */
async function workflowFiles(): Promise<{ repo: string; owner: string; path: string }[]> {
  const q = `"${action}" path:.github/workflows`;
  const found: { repo: string; owner: string; path: string }[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await get<{ total_count: number; items: { path: string; repository: { full_name: string; owner: { login: string } } }[] }>(
      `search/code?${new URLSearchParams({ q, per_page: '100', page: String(page) })}`,
    );
    for (const { path, repository } of data.items) {
      if (repository.full_name.toLowerCase() !== repo) found.push({ repo: repository.full_name, owner: repository.owner.login, path });
    }
    if (page * 100 >= data.total_count) break;
  }
  return found;
}

/** Who moves in, in the order found: each step's users, unless any of their steps says `city: off`. */
async function census(): Promise<string[]> {
  const users = new Map<string, boolean>();
  for (const file of await workflowFiles()) {
    const yaml = await get<string>(`repos/${file.repo}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}`, {
      accept: 'application/vnd.github.raw+json',
      text: true,
    }).catch(() => '');
    for (const step of actionSteps(yaml, action, file.owner)) {
      for (const user of step.users.map((u) => u.toLowerCase()).filter(isValidLogin))
        users.set(user, (users.get(user) ?? true) && step.city);
    }
  }
  return [...users].filter(([login, city]) => city && !blocked.has(login)).map(([login]) => login);
}

/** A few at a time: the profile query is heavy, and GitHub times out on big accounts under load. */
async function fetchAll(logins: string[]): Promise<{ fresh: Map<string, ResidentData>; gone: Set<string> }> {
  const fresh = new Map<string, ResidentData>();
  const gone = new Set<string>();
  const queue = [...logins];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let login = queue.shift(); login; login = queue.shift()) {
        try {
          fresh.set(login, residentData(await fetchProfileGraphQL(login, token!), at));
        } catch (error) {
          // 404: an organisation, or an account that no longer exists. Anything else keeps their last data.
          if (error instanceof GitHubError && error.status === 404) gone.add(login);
          else console.warn(`Could not fetch ${login}: ${(error as Error).message}`);
        }
      }
    }),
  );
  return { fresh, gone };
}

const found = await census().catch((error: Error) => {
  // A search that still fails after retrying keeps yesterday's citizens rather than emptying the city.
  console.warn(`Code search failed, keeping the previous citizens. ${error.message}`);
  return prev?.residents.filter((r) => r.number !== null).map((r) => r.login.toLowerCase()) ?? [];
});
const landmarks = featuredLogins().filter((l) => !blocked.has(l));
const { fresh, gone } = await fetchAll(refreshOrder(prev, [...found, ...landmarks], Number(values.max)));
const keep = (logins: string[]) => logins.filter((l) => !gone.has(l));
const city = mergeCity(prev, { at, citizens: keep(found), landmarks: keep(landmarks), fresh });
save(city);

const citizens = city.residents.filter((r) => r.number !== null);
console.log(
  [
    `${citizens.length} citizens and ${city.residents.length - citizens.length} landmarks${out ? ` in ${out}` : ''}`,
    `Refreshed ${fresh.size}, dropped ${gone.size} (organisations or missing accounts)`,
    ...citizens.map((r) => `  #${r.number} ${r.login} (since ${r.since})`),
  ].join('\n'),
);
