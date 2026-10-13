import { describe, expect, it } from 'vitest';
import { normalize } from './profile';
import {
  calendarWeeks,
  fetchPublicProfile,
  fetchSources,
  genuineCommits,
  projectCandidates,
  PublicApiError,
  toRawUser,
  type PublicProfile,
  type PublicSources,
} from './public-api';

const NOW = new Date('2026-10-01T12:00:00Z');

const issue = (owner: string, repo: string, created = '2026-06-01T00:00:00Z') => ({
  repository_url: `https://api.github.com/repos/${owner}/${repo}`,
  created_at: created,
});
const commit = (owner: string, repo: string, type: 'User' | 'Organization' = 'Organization') => ({
  repository: { name: repo, private: false, owner: { login: owner, avatar_url: 'a', type } },
});

function sources(overrides: Partial<PublicSources> = {}): PublicSources {
  return {
    user: {
      login: 'octo',
      name: 'Octo',
      avatar_url: 'a',
      bio: null,
      location: null,
      company: null,
      blog: '',
      created_at: '2015-01-01T00:00:00Z',
      followers: 10,
      following: 1,
      public_repos: 3,
      type: 'User',
    },
    orgs: [{ login: 'acme', avatar_url: 'a' }],
    repos: {
      total_count: 2,
      items: [
        {
          name: 'big',
          owner: { login: 'octo' },
          topics: [],
          description: null,
          html_url: 'u',
          stargazers_count: 90,
          forks_count: 2,
          pushed_at: '2026-01-01',
          language: 'Go',
          size: 100,
        },
        {
          name: 'small',
          owner: { login: 'octo' },
          topics: [],
          description: null,
          html_url: 'u',
          stargazers_count: 5,
          forks_count: 0,
          pushed_at: '2026-01-01',
          language: null,
          size: 1,
        },
      ],
    },
    calendar: {
      source: 'test',
      total: 6,
      contributions: [
        { date: '2026-09-26', count: 1 }, // Saturday
        { date: '2026-09-27', count: 2 }, // Sunday starts a new week
        { date: '2026-09-28', count: 3 },
        { date: '2026-10-05', count: 9 }, // in the future, dropped
      ],
    },
    commits: {
      total_count: 40,
      items: [
        commit('acme', 'api'),
        commit('acme', 'api'),
        commit('mirror-co', 'copy'),
        commit('octo', 'dotfiles', 'User'),
        commit('rando', 'fork', 'User'),
        commit('bigco', 'lib'),
      ],
    },
    pullRequests: {
      total_count: 120,
      items: [issue('bigco', 'lib'), issue('someone', 'tool'), issue('bigco', 'lib', '2024-01-01T00:00:00Z')],
    },
    reviews: { total_count: 7, items: [issue('acme', 'api')] },
    issues: { total_count: 2, items: [issue('unknown-co', 'thing')] },
    ownerTypes: { octo: 'User', acme: 'Organization', bigco: 'Organization', someone: 'User' },
    ...overrides,
  };
}

describe('calendarWeeks', () => {
  it('starts a new week on Sunday and records weekdays', () => {
    const weeks = calendarWeeks([
      { date: '2026-09-28', count: 3 },
      { date: '2026-09-26', count: 1 },
      { date: '2026-09-27', count: 2 },
    ]);
    expect(weeks.map((w) => w.contributionDays.map((d) => [d.date, d.weekday]))).toEqual([
      [['2026-09-26', 6]],
      [
        ['2026-09-27', 0],
        ['2026-09-28', 1],
      ],
    ]);
  });
});

describe('genuineCommits', () => {
  it('keeps own repos, member orgs and repos with other activity, and drops mirrors', () => {
    const kept = genuineCommits(sources()).map((c) => `${c.owner}/${c.name}`);
    expect(kept).toEqual(['acme/api', 'acme/api', 'octo/dotfiles', 'bigco/lib']);
  });
});

describe('toRawUser', () => {
  const p = normalize(toRawUser(sources(), NOW), NOW);
  const owners = Object.fromEntries(p.owners.map((o) => [o.login, o]));

  it('maps profile basics and repos', () => {
    expect(p.totals).toMatchObject({ stars: 95, repos: 3, pullRequests: 120, contributions: 6, commits: 40 });
    expect(p.languages.map((l) => l.name)).toEqual(['Go']);
  });

  it('builds the calendar without future days', () => {
    expect(p.weeks.flat().map((d) => d.date)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
    expect(p.activeDays).toBe(3);
  });

  it('counts only last-year PRs per repo', () => {
    expect(owners.bigco.pullRequests).toBe(1);
    expect(owners.bigco.commits).toBe(1);
  });

  it('never counts an unclassified owner as an organization', () => {
    expect(owners['unknown-co'].type).toBe('user');
    expect(owners.acme.type).toBe('org');
    expect(owners.octo.type).toBe('self');
  });

  it('drops mirrors from the org breakdown', () => {
    expect(owners['mirror-co']).toBeUndefined();
    expect(owners.rando).toBeUndefined();
  });

  it('records public memberships', () => {
    expect(p.memberOf.map((m) => m.login)).toEqual(['acme']);
  });

  it("keeps other people's repos from the search out of the user's own", () => {
    const lib = {
      ...sources().repos.items[0],
      name: 'lib',
      owner: { login: 'bigco' },
      description: 'A library',
      html_url: 'https://github.com/bigco/lib',
      stargazers_count: 5000,
      language: 'Rust',
      topics: ['parser', 'wasm'],
    };
    const q = normalize(toRawUser(sources({ repos: { total_count: 3, items: [lib, ...sources().repos.items] } }), NOW), NOW);
    expect(q.topRepos.map((r) => r.name)).toEqual(['big', 'small']);
    expect(q.totals.stars).toBe(95);
    expect(q.projects.find((r) => r.name === 'lib')).toMatchObject({
      owner: 'bigco',
      description: 'A library',
      stars: 5000,
      languages: ['Rust'],
      topics: ['parser', 'wasm'],
      commits: 1,
      pullRequests: 1,
    });
  });

  it('lists active projects with descriptions from commit search', () => {
    const withDescription = commit('acme', 'api');
    const s = sources();
    s.commits!.items[0] = {
      repository: { ...withDescription.repository, description: 'Acme API', html_url: 'https://github.com/acme/api' },
    };
    const q = normalize(toRawUser(s, NOW), NOW);
    expect(q.projects[0]).toMatchObject({ owner: 'acme', name: 'api', total: 3, description: 'Acme API' });
    expect(q.projects.map((r) => r.name)).not.toContain('copy');
  });
});

describe('projectCandidates', () => {
  it('ranks repos by sampled activity, without mirrors', () => {
    expect(projectCandidates(sources(), NOW).map((r) => `${r.owner}/${r.name}:${r.n}`)).toEqual([
      'acme/api:3',
      'bigco/lib:2',
      'octo/dotfiles:1',
      'someone/tool:1',
      'unknown-co/thing:1',
    ]);
  });
});

describe('fetchSources', () => {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  const user = sources().user;

  it('reports a missing account as not found', async () => {
    const fake = async () => json({ message: 'Not Found' }, 404);
    await expect(fetchSources('ghost', { fetch: fake as typeof fetch })).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('turns a core rate limit into an error with the reset time', async () => {
    const fake = async () => json({ message: 'rate limit' }, 403, { 'x-ratelimit-reset': '1790000000' });
    const err = (await fetchSources('octo', { fetch: fake as typeof fetch }).catch((e) => e)) as PublicApiError;
    expect(err.kind).toBe('rate-limit');
    expect(err.resetAt?.getTime()).toBe(1790000000 * 1000);
  });

  it('keeps going with warnings when optional parts fail, and treats 422 as empty', async () => {
    const fake = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/users/octo')) return json(user);
      if (url.includes('/search/repositories')) return json({ total_count: 0, items: [] });
      if (url.includes('contributions-api')) return json({}, 500);
      if (url.includes('/search/commits')) return json({ message: 'rate limit' }, 403);
      if (url.includes('/search/issues')) return json({ message: 'cannot search' }, 422);
      if (url.endsWith('/orgs')) return json([]);
      return json({}, 404);
    };
    const { sources: s, warnings } = await fetchSources('octo', { fetch: fake as typeof fetch, now: NOW, calendarRetryDelayMs: 0 });
    expect(s.calendar).toBeNull();
    expect(s.commits).toBeNull();
    expect(s.pullRequests).toEqual({ total_count: 0, items: [] });
    expect(warnings.toSorted()).toEqual(['Commits: search rate limit, try again in a minute.', 'Contribution calendar: unavailable.']);
  });

  it('folds the busiest repos the user does not own into the repository search', async () => {
    const s = sources();
    let repoQuery = '';
    const fake = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/users/octo')) return json(user);
      if (url.includes('/search/repositories')) {
        repoQuery = new URL(url).searchParams.get('q') ?? '';
        return json({ total_count: 0, items: [] });
      }
      if (url.includes('/search/commits')) return json(s.commits);
      if (url.includes('/search/issues') && url.includes('type%3Apr') && url.includes('author')) return json(s.pullRequests);
      if (url.includes('/search/issues')) return json({ total_count: 0, items: [] });
      if (url.endsWith('/orgs')) return json(s.orgs);
      if (url.includes('/users/')) return json({ ...user, type: 'User' });
      return json({}, 500);
    };
    await fetchSources('octo', { fetch: fake as typeof fetch, now: NOW, calendarRetryDelayMs: 0 });
    expect(repoQuery).toBe('user:octo fork:false repo:acme/api repo:bigco/lib repo:someone/tool');
  });
});

describe('calendar fallbacks and progressive loading', () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const stall = (init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
  const github = (url: string) => {
    if (url.endsWith('/users/octo')) return json(sources().user);
    if (url.endsWith('/orgs')) return json([]);
    return json({ total_count: 0, items: [] });
  };
  const week = [{ date: '2026-09-29', count: 5, intensity: '2' }];

  it('switches to a backup source when the first one stalls', async () => {
    const fake = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('contributions-api')) return stall(init);
      if (url.includes('gh-calendar')) return Promise.resolve(json({ total: 5, contributions: [week] }));
      return Promise.resolve(github(url));
    };
    const { sources: s, warnings } = await fetchSources('octo', {
      fetch: fake as typeof fetch,
      now: NOW,
      timeoutMs: 20,
      calendarRetryDelayMs: 0,
    });
    expect(s.calendar).toEqual({ total: 5, contributions: [{ date: '2026-09-29', count: 5 }], source: 'gh-calendar.rschristian.dev' });
    expect(warnings).toEqual([]);
  });

  it('gives up on the calendar once every source fails, and keeps the rest of the profile', async () => {
    const fake = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return url.includes('api.github.com') ? Promise.resolve(github(url)) : stall(init);
    };
    const result = await fetchPublicProfile('octo', { fetch: fake as typeof fetch, now: NOW, timeoutMs: 10, calendarRetryDelayMs: 0 });
    expect(result.calendar).toBe('offline');
    expect(result.profile.login).toBe('octo');
    expect(result.warnings).toContain('Contribution calendar: unavailable.');
  });

  it('hands over the profile first when the calendar is the last part loading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fake = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('contributions-api')) {
        await gate;
        return json({ total: { lastYear: 5 }, contributions: week });
      }
      return github(url);
    };
    const partials: PublicProfile[] = [];
    const done = fetchPublicProfile('octo', {
      fetch: fake as typeof fetch,
      now: NOW,
      onPartial: (p) => {
        partials.push(p);
        release();
      },
    });
    const result = await done;
    expect(partials).toHaveLength(1);
    expect(partials[0]).toMatchObject({ calendar: 'loading', warnings: [] });
    expect(partials[0].profile.weeks).toEqual([]);
    expect(result).toMatchObject({ calendar: 'ready', calendarSource: 'github-contributions-api.jogruber.de' });
    expect(result.profile.totals.contributions).toBe(5);
  });

  it('skips the partial step when the calendar is already in', async () => {
    const fake = async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('contributions-api') ? json({ total: { lastYear: 5 }, contributions: week }) : github(url);
    };
    const partials: PublicProfile[] = [];
    const result = await fetchPublicProfile('octo', { fetch: fake as typeof fetch, now: NOW, onPartial: (p) => partials.push(p) });
    expect(partials).toEqual([]);
    expect(result.calendar).toBe('ready');
  });
});
