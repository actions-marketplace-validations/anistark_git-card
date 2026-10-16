import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { leveller } from '../cards/levels';
import { projectChoice, projectChoices, projectsHeight, ProjectsCard, shownProjects } from '../cards/Projects';
import { CARD_IDS, getCard } from '../cards/registry';
import { truncate, wrap } from '../cards/shell';
import {
  activeProjects,
  cleanDescription,
  computeStreaks,
  groupByOwner,
  hasCalendar,
  isValidLogin,
  normalize,
  ownershipSplit,
  type Day,
  type RawUser,
} from './profile';
import { rankProfile } from './rank';

const NOW = new Date('2026-10-01T12:00:00Z');

function days(counts: number[], end = '2026-10-01'): Day[] {
  const last = new Date(`${end}T00:00:00Z`);
  return counts.map((count, i) => {
    const d = new Date(last);
    d.setUTCDate(last.getUTCDate() - (counts.length - 1 - i));
    return { date: d.toISOString().slice(0, 10), count, weekday: d.getUTCDay() };
  });
}

type RepoList = NonNullable<RawUser['contributionsCollection']['commitContributionsByRepository']>;

function repo(owner: string, name: string, n: number, type: 'Organization' | 'User' = 'Organization', isPrivate = false): RepoList[number] {
  return {
    repository: { name, isPrivate, owner: { __typename: type, login: owner, avatarUrl: 'a', name: null } },
    contributions: { totalCount: n },
  };
}

const orgActivity = {
  commitContributionsByRepository: [
    repo('acme', 'api', 40),
    repo('acme', 'web', 10),
    repo('octo-dev', 'dotfiles', 25, 'User'),
    repo('secret-co', 'vault', 99, 'Organization', true),
  ],
  pullRequestContributionsByRepository: [repo('acme', 'api', 5), repo('nodejs', 'node', 3), repo('someone', 'lib', 2, 'User')],
  pullRequestReviewContributionsByRepository: [repo('nodejs', 'node', 12)],
  issueContributionsByRepository: [repo('acme', 'web', 1)],
};

function rawUser(counts: number[], overrides: Partial<RawUser> = {}): RawUser {
  const flat = days(counts);
  const weeks: RawUser['contributionsCollection']['contributionCalendar']['weeks'] = [];
  for (const d of flat) {
    if (!weeks.length || d.weekday === 0) weeks.push({ contributionDays: [] });
    weeks.at(-1)!.contributionDays.push({ date: d.date, contributionCount: d.count, weekday: d.weekday });
  }
  return {
    login: 'octo-dev',
    name: 'Octo Dev',
    avatarUrl: 'https://example.com/a.png',
    bio: 'Builds things that are probably too long to fit on a single line of a card, so this tests wrapping.',
    location: 'Earth',
    company: null,
    websiteUrl: null,
    createdAt: '2014-03-01T00:00:00Z',
    followers: { totalCount: 1200 },
    following: { totalCount: 3 },
    pullRequests: { totalCount: 40 },
    issues: { totalCount: 9 },
    repositories: {
      totalCount: 3,
      nodes: [
        {
          name: 'small',
          description: null,
          url: 'u',
          stargazerCount: 5,
          forkCount: 1,
          pushedAt: '2026-01-01',
          primaryLanguage: { name: 'Go' },
          languages: { edges: [{ size: 300, node: { name: 'Go' } }] },
        },
        {
          name: 'big',
          description: 'x',
          url: 'u',
          stargazerCount: 900,
          forkCount: 40,
          pushedAt: '2026-01-01',
          primaryLanguage: { name: 'TypeScript' },
          languages: {
            edges: [
              { size: 700, node: { name: 'TypeScript' } },
              { size: 100, node: { name: 'CSS' } },
            ],
          },
        },
        {
          name: 'none',
          description: null,
          url: 'u',
          stargazerCount: 0,
          forkCount: 0,
          pushedAt: '2026-01-01',
          primaryLanguage: null,
          languages: { edges: [] },
        },
      ],
    },
    contributionsCollection: {
      totalCommitContributions: counts.reduce((a, b) => a + b, 0),
      contributionCalendar: { totalContributions: counts.reduce((a, b) => a + b, 0), weeks },
      ...orgActivity,
    },
    organizations: {
      nodes: [
        { login: 'acme', name: 'Acme', avatarUrl: 'a' },
        { login: 'quiet-club', name: null, avatarUrl: 'a' },
      ],
    },
    ...overrides,
  };
}

describe('computeStreaks', () => {
  it('counts the current streak through today', () => {
    expect(computeStreaks(days([0, 1, 2, 3]), NOW)).toMatchObject({ current: 3, longest: 3 });
  });

  it('does not break the current streak on an empty today', () => {
    expect(computeStreaks(days([1, 1, 0]), NOW).current).toBe(2);
  });

  it('breaks the current streak on an empty yesterday', () => {
    expect(computeStreaks(days([1, 0, 0]), NOW).current).toBe(0);
  });

  it('finds the longest run and its dates', () => {
    const s = computeStreaks(days([1, 1, 1, 1, 0, 1, 1, 0]), NOW);
    expect(s.longest).toBe(4);
    expect(s.longestStart).toBe('2026-09-24');
    expect(s.longestEnd).toBe('2026-09-27');
  });

  it('handles no activity', () => {
    expect(computeStreaks(days([0, 0, 0]), NOW)).toEqual({ current: 0, longest: 0, longestStart: null, longestEnd: null });
  });
});

describe('normalize', () => {
  const p = normalize(rawUser([0, 3, 1, 8, 0, 2, 5, 1, 1, 1]), NOW);

  it('ranks repos by stars and sums totals', () => {
    expect(p.topRepos.map((r) => r.name)).toEqual(['big', 'small', 'none']);
    expect(p.totals.stars).toBe(905);
    expect(p.totals.forks).toBe(41);
  });

  it('shares languages by bytes', () => {
    expect(p.languages.map((l) => l.name)).toEqual(['TypeScript', 'Go', 'CSS']);
    expect(p.languages[0].share).toBeCloseTo(0.636, 2);
  });

  it('finds the peak day and weekday totals', () => {
    expect(p.peakDay?.count).toBe(8);
    expect(p.byWeekday.reduce((a, b) => a + b, 0)).toBe(22);
  });
});

describe('groupByOwner', () => {
  const owners = groupByOwner(orgActivity as RawUser['contributionsCollection'], 'Octo-Dev');
  const byLogin = Object.fromEntries(owners.map((o) => [o.login, o]));

  it('drops private repositories entirely', () => {
    expect(byLogin['secret-co']).toBeUndefined();
  });

  it('types owners as org, self (case-insensitive) or user', () => {
    expect([byLogin.acme.type, byLogin['octo-dev'].type, byLogin.someone.type, byLogin.nodejs.type]).toEqual([
      'org',
      'self',
      'user',
      'org',
    ]);
  });

  it('sums each kind per owner and per repo', () => {
    expect(byLogin.acme).toMatchObject({ commits: 50, pullRequests: 5, reviews: 0, issues: 1, total: 56 });
    expect(byLogin.acme.repos.map((r) => [r.name, r.total])).toEqual([
      ['api', 45],
      ['web', 11],
    ]);
    expect(byLogin.nodejs).toMatchObject({ pullRequests: 3, reviews: 12, total: 15 });
  });

  it('orders owners by total, biggest first', () => {
    expect(owners.map((o) => o.login)).toEqual(['acme', 'octo-dev', 'nodejs', 'someone']);
  });

  it('splits work between orgs, own repos and other people', () => {
    expect(ownershipSplit(owners)).toEqual({ org: 71, self: 25, user: 2 });
  });
});

describe('activeProjects', () => {
  const withMeta = {
    ...orgActivity,
    pullRequestContributionsByRepository: [
      {
        ...repo('acme', 'api', 5),
        repository: {
          ...repo('acme', 'api', 5).repository,
          description: 'The :rocket: API',
          stargazerCount: 12,
          primaryLanguage: { name: 'Go' },
          topics: ['grpc'],
        },
      },
      repo('nodejs', 'node', 3),
      repo('someone', 'lib', 2, 'User'),
    ],
  };
  const projects = activeProjects(withMeta as RawUser['contributionsCollection']);

  it('lists every public repository once, busiest first', () => {
    expect(projects.map((p) => `${p.owner}/${p.name}:${p.total}`)).toEqual([
      'acme/api:45',
      'octo-dev/dotfiles:25',
      'nodejs/node:15',
      'acme/web:11',
      'someone/lib:2',
    ]);
  });

  it('keeps what any source knew about a repository', () => {
    expect(projects[0]).toMatchObject({
      description: 'The API',
      stars: 12,
      languages: ['Go'],
      topics: ['grpc'],
      commits: 40,
      pullRequests: 5,
    });
    expect(projects[1]).toMatchObject({ description: null, languages: [], url: 'https://github.com/octo-dev/dotfiles' });
  });
});

describe('projects card', () => {
  const withProjects = (n: number) => ({
    ...normalize(rawUser([1, 2, 3]), NOW),
    projects: Array.from({ length: n }, (_, i) => ({
      owner: 'octo-dev',
      name: `repo-${i}`,
      description: null,
      url: 'u',
      stars: 0,
      languages: [],
      topics: [],
      commits: n - i,
      pullRequests: 0,
      reviews: 0,
      issues: 0,
      total: n - i,
    })),
  });
  const viewBox = (svg: string) => svg.match(/viewBox="([^"]+)"/)?.[1];

  it('lists 10 by default, up to 50 when asked, and never more than there are', () => {
    expect(shownProjects(withProjects(25))).toBe(10);
    expect(shownProjects(withProjects(25), 20)).toBe(20);
    expect(shownProjects(withProjects(80), 99)).toBe(50);
    expect(shownProjects(withProjects(25), 0)).toBe(1);
    expect(shownProjects(withProjects(3), 20)).toBe(3);
  });

  it('grows a row at a time, but is never shorter than the other cards', () => {
    expect(projectsHeight(withProjects(25))).toBe(580);
    expect(projectsHeight(withProjects(25), 20)).toBe(1020);
    expect(projectsHeight(withProjects(2))).toBe(400);
    expect(projectsHeight(withProjects(0))).toBe(400);
  });

  it('sizes the SVG to match', () => {
    const svg = renderToStaticMarkup(createElement(ProjectsCard, { profile: withProjects(25), projects: 20 }));
    expect(viewBox(svg)).toBe('0 0 760 1020');
    expect(svg).toContain('TOP <tspan data-gc-pick="">20</tspan>');
    expect(renderToStaticMarkup(createElement(ProjectsCard, { profile: withProjects(4) }))).toContain('<tspan data-gc-pick="">ALL</tspan>');
    expect(viewBox(renderToStaticMarkup(createElement(getCard('projects')!.Component, { profile: withProjects(25) })))).toBe('0 0 760 580');
  });
});

describe('projectChoices', () => {
  const labels = (total: number, current?: number) => projectChoices(total, current).map((c) => c.label);

  it('offers the choices below the total, then ALL for the rest', () => {
    expect(labels(25)).toEqual(['5', '10', '15', '20', 'ALL']);
    expect(labels(23)).toEqual(['5', '10', '15', '20', 'ALL']);
    expect(labels(80)).toEqual(['5', '10', '15', '20', '25', '50']);
    expect(labels(4)).toEqual(['ALL']);
  });

  it('keeps a number from a link that is not one of the choices', () => {
    expect(labels(40, 7)).toEqual(['5', '7', '10', '15', '20', '25', 'ALL']);
  });

  it('lands on ALL once a limit covers every project', () => {
    expect(projectChoice(23, 10)).toBe(10);
    expect(projectChoice(23, 50)).toBe(25);
    expect(projectChoice(25, 25)).toBe(25);
  });
});

describe('cleanDescription', () => {
  it('drops emoji and shortcodes the card fonts cannot draw', () => {
    expect(cleanDescription('🚀 Fast :zap: builds  for\nall')).toBe('Fast builds for all');
    expect(cleanDescription(':tada:')).toBeNull();
    expect(cleanDescription(null)).toBeNull();
  });
});

describe('leveller', () => {
  it('gives empty days 0 and the peak day 5', () => {
    const p = normalize(rawUser([0, 1, 2, 3, 4, 50]), NOW);
    const level = leveller(p);
    const flat = p.weeks.flat();
    expect(level(flat[0])).toBe(0);
    expect(level(flat.at(-1)!)).toBe(5);
    expect(
      flat
        .slice(1, 5)
        .map(level)
        .every((l) => l >= 1 && l <= 4),
    ).toBe(true);
  });
});

describe('isValidLogin', () => {
  it.each(['torvalds', 'a', 'octo-dev', 'A1-b2', 'x'.repeat(39)])('accepts %s', (l) => expect(isValidLogin(l)).toBe(true));
  it.each(['', '-a', 'a-', 'a--b', 'a_b', 'a/b', '../etc', 'x'.repeat(40), '<script>'])('rejects %s', (l) =>
    expect(isValidLogin(l)).toBe(false),
  );
});

describe('text helpers', () => {
  it('truncates with an ellipsis inside the budget', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });

  it('wraps on words and marks overflow', () => {
    const lines = wrap('one two three four five six', 9, 2);
    expect(lines).toEqual(['one two', 'three…']);
    expect(lines.every((l) => l.length <= 9)).toBe(true);
  });
});

describe('cards', () => {
  const profiles = {
    active: normalize(rawUser(Array.from({ length: 371 }, (_, i) => (i * 7) % 11)), NOW),
    empty: normalize(
      rawUser(
        Array.from({ length: 371 }, () => 0),
        {
          bio: null,
          name: null,
          repositories: { totalCount: 0, nodes: [] },
        },
      ),
      NOW,
    ),
    // The calendar mirror failed: no days at all.
    'no-calendar': normalize(rawUser([]), NOW),
  };

  it('treats a profile without calendar days as incomplete', () => {
    expect(hasCalendar(profiles['no-calendar'])).toBe(false);
    expect(hasCalendar(profiles.active)).toBe(true);
    expect(rankProfile(profiles['no-calendar']).complete).toBe(false);
    expect(rankProfile(profiles.active).complete).toBe(true);
  });

  it.each(['skyline', 'heatmap', 'streak', 'rank'] as const)('shows %s as offline without a calendar', (id) => {
    const svg = renderToStaticMarkup(createElement(getCard(id)!.Component, { profile: profiles['no-calendar'], standalone: true }));
    expect(svg).toMatch(/CALENDAR OFFLINE/);
  });

  for (const [kind, profile] of Object.entries(profiles)) {
    it.each(CARD_IDS)(`renders %s for an ${kind} profile as a standalone SVG`, (id) => {
      const svg = renderToStaticMarkup(createElement(getCard(id)!.Component, { profile, theme: 'dark', standalone: true }));
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('<style>');
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    });
  }
});
