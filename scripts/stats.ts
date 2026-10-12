// Daily stats for /stats: stars, forks, repos using the Action and, with access, repo traffic. Merges the
// snapshot into a history file. In Actions, the Stats workflow keeps that file on the `stats` branch.
//
//   tsx scripts/stats.ts --history public/stats.local.json
//
// GITHUB_TOKEN covers everything but traffic, which needs admin read on the repo: STATS_TOKEN, a fine-grained
// token with Administration read-only, or any token with push access. Without one the run skips traffic.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { fmt } from '../src/lib/format';
import { mergeSnapshot, type Count, type Snapshot, type StatsHistory, type TrafficDay } from '../src/lib/stats';
import { SITE } from '../src/site';
import { restClient } from './rest';

const { values } = parseArgs({ options: { history: { type: 'string' } } });

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required, since code search needs auth.');
const trafficToken = process.env.STATS_TOKEN || token;

const repo = new URL(SITE.repo).pathname.slice(1);
const action = SITE.action.split('@')[0];
/** Stars and forks past this many are only counted, not dated. */
const MAX_PAGES = 30;

const get = restClient(token);

/** Dates from a paginated list, or null when there are more than MAX_PAGES pages. */
async function dates<T>(path: string, total: number, pick: (item: T) => string, accept?: string): Promise<string[] | null> {
  if (total > MAX_PAGES * 100) return null;
  const out: string[] = [];
  for (let page = 1; out.length < total && page <= MAX_PAGES; page++) {
    const items = await get<T[]>(`${path}?per_page=100&page=${page}`, { accept });
    out.push(...items.map(pick));
    if (items.length < 100) break;
  }
  return out;
}

async function adopters(): Promise<string[] | null> {
  const q = `"${action}" path:.github/workflows`;
  const found = new Set<string>();
  // Code search returns at most 1000 results, 100 a page.
  for (let page = 1; page <= 10; page++) {
    const data = await get<{ total_count: number; items: { repository: { full_name: string } }[] }>(
      `search/code?${new URLSearchParams({ q, per_page: '100', page: String(page) })}`,
    );
    for (const { repository } of data.items) if (repository.full_name.toLowerCase() !== repo.toLowerCase()) found.add(repository.full_name);
    if (page * 100 >= data.total_count) break;
  }
  return [...found];
}

async function traffic(): Promise<Snapshot['traffic']> {
  const read = <T>(path: string) => get<T>(`repos/${repo}/traffic/${path}`, { auth: trafficToken });
  try {
    const [views, clones, referrers, paths] = await Promise.all([
      read<{ count: number; uniques: number; views: TrafficDay[] }>('views?per=day'),
      read<{ count: number; uniques: number; clones: TrafficDay[] }>('clones?per=day'),
      read<{ referrer: string; count: number; uniques: number }[]>('popular/referrers'),
      read<{ path: string; count: number; uniques: number }[]>('popular/paths'),
    ]);
    const count = (name: string, c: { count: number; uniques: number }): Count => ({ name, views: c.count, visitors: c.uniques });
    return {
      views: views.views,
      clones: clones.clones,
      recent: { views: views.count, visitors: views.uniques, clones: clones.count, cloners: clones.uniques },
      referrers: referrers.map((r) => count(r.referrer, r)),
      paths: paths.map((p) => count(p.path.replace(`/${repo}`, '') || '/', p)),
    };
  } catch (error) {
    if ((error as { status?: number }).status !== 403) throw error;
    console.warn('No access to repo traffic, skipping it. Set STATS_TOKEN to a token with Administration read on the repo.');
    return null;
  }
}

const info = await get<{ created_at: string; stargazers_count: number; forks_count: number }>(`repos/${repo}`);
const snapshot: Snapshot = {
  at: new Date().toISOString(),
  createdAt: info.created_at,
  stars: info.stargazers_count,
  forks: info.forks_count,
  starDates: await dates<{ starred_at: string }>(
    `repos/${repo}/stargazers`,
    info.stargazers_count,
    (s) => s.starred_at,
    'application/vnd.github.star+json',
  ),
  forkDates: await dates<{ created_at: string }>(`repos/${repo}/forks`, info.forks_count, (f) => f.created_at),
  // A search that still fails after retrying keeps yesterday's adopters rather than losing the whole run.
  adopters: await adopters().catch((error: Error) => {
    console.warn(`Code search failed, keeping the previous adopters. ${error.message}`);
    return null;
  }),
  traffic: await traffic(),
};

const path = values.history;
const prev = path && existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as StatsHistory) : null;
const history = mergeSnapshot(prev, snapshot);
if (path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(history)}\n`);
}

const lines = [
  snapshot.adopters ? `${snapshot.adopters.length} repos use ${action}` : 'Adopters skipped (code search failed)',
  `${fmt(snapshot.stars)} stars, ${fmt(snapshot.forks)} forks`,
  history.traffic
    ? `Last 14 days: ${fmt(history.recent!.views)} views from ${fmt(history.recent!.visitors)} visitors, ${fmt(history.recent!.clones)} clones`
    : 'Traffic skipped (no access)',
  `${Object.keys(history.days).length} days recorded${path ? ` in ${path}` : ''}`,
];
console.log(lines.join('\n'));
for (const a of history.adopters) console.log(`  ${a.repo} (since ${a.since})`);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const rows = history.adopters.map((a) => `| [${a.repo}](https://github.com/${a.repo}) | ${a.since} |`);
  appendFileSync(
    summary,
    [
      `### ${history.adopters.length} repos use \`${action}\``,
      '',
      ...lines.slice(1).map((l) => `- ${l}`),
      '',
      ...(rows.length ? ['| Repo | Since |', '| --- | --- |', ...rows, ''] : []),
    ].join('\n'),
  );
}
