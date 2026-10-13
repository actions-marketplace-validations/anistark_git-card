// The one normalized shape every card renders from. Cards never see raw GitHub responses.

export interface Day {
  date: string; // YYYY-MM-DD
  count: number;
  weekday: number; // 0 = Sunday
}

export interface Repo {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
  pushedAt: string;
}

export interface LanguageShare {
  name: string;
  bytes: number;
  share: number; // 0..1
}

export interface Streaks {
  current: number;
  longest: number;
  longestStart: string | null;
  longestEnd: string | null;
}

/** Last-year contribution counts, split by kind. */
export interface Counts {
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  total: number;
}

export const KINDS = ['commits', 'pullRequests', 'reviews', 'issues'] as const;
export type Kind = (typeof KINDS)[number];

export interface RepoActivity extends Counts {
  name: string;
}

/** A repository the user worked in during the last year, with whatever is known about it. */
export interface Project extends Counts {
  owner: string;
  name: string;
  description: string | null;
  url: string;
  stars: number;
  /** Primary language first. Public APIs only know the primary one. */
  languages: string[];
  topics: string[];
}

/** Everything a user did in the last year in repositories owned by one account. */
export interface OwnerActivity extends Counts {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** org: an organization. self: the user's own repos. user: someone else's personal repos. */
  type: 'org' | 'self' | 'user';
  repos: RepoActivity[];
}

export interface Membership {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface Profile {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  websiteUrl: string | null;
  createdAt: string;
  followers: number;
  following: number;
  totals: {
    repos: number;
    stars: number;
    forks: number;
    pullRequests: number;
    issues: number;
    contributions: number; // last 365 days
    commits: number; // last 365 days
  };
  languages: LanguageShare[];
  topRepos: Repo[];
  weeks: Day[][]; // contribution calendar, oldest week first
  streaks: Streaks;
  byWeekday: number[]; // 7 totals, Sunday first
  peakDay: Day | null;
  /** Public contributions in the last year, grouped by repository owner, biggest first. */
  owners: OwnerActivity[];
  /** Public organization memberships, whether or not there was activity. */
  memberOf: Membership[];
  /** Every public repository with contributions in the last year, most active first. */
  projects: Project[];
  /** Last-year totals by kind, from GitHub's own counters. Public activity only with a scopeless token. */
  lastYear: Counts;
  /** Days in the last year with at least one contribution. */
  activeDays: number;
  fetchedAt: string;
}

interface RawRepoContributions {
  repository: {
    name: string;
    isPrivate: boolean;
    owner: { __typename: 'Organization' | 'User'; login: string; avatarUrl: string; name?: string | null };
    description?: string | null;
    url?: string;
    stargazerCount?: number;
    primaryLanguage?: { name: string } | null;
    topics?: string[];
  };
  contributions: { totalCount: number };
}

// Raw GraphQL shape, only the fields we query.
export interface RawUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  websiteUrl: string | null;
  createdAt: string;
  followers: { totalCount: number };
  following: { totalCount: number };
  pullRequests: { totalCount: number };
  issues: { totalCount: number };
  repositories: {
    totalCount: number;
    nodes: Array<{
      name: string;
      description: string | null;
      url: string;
      stargazerCount: number;
      forkCount: number;
      pushedAt: string;
      primaryLanguage: { name: string } | null;
      languages: { edges: Array<{ size: number; node: { name: string } }> };
    }>;
  };
  organizations?: { nodes: Membership[] };
  contributionsCollection: {
    totalCommitContributions: number;
    totalPullRequestContributions?: number;
    totalPullRequestReviewContributions?: number;
    totalIssueContributions?: number;
    commitContributionsByRepository?: RawRepoContributions[];
    pullRequestContributionsByRepository?: RawRepoContributions[];
    pullRequestReviewContributionsByRepository?: RawRepoContributions[];
    issueContributionsByRepository?: RawRepoContributions[];
    contributionCalendar: {
      totalContributions: number;
      weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number; weekday: number }> }>;
    };
  };
}

const TOP_LANGUAGES = 6;
const TOP_REPOS = 6;

export function normalize(raw: RawUser, now = new Date()): Profile {
  const repos = raw.repositories.nodes;

  const bytesByLang = new Map<string, number>();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      bytesByLang.set(node.name, (bytesByLang.get(node.name) ?? 0) + size);
    }
  }
  const totalBytes = [...bytesByLang.values()].reduce((a, b) => a + b, 0);
  const languages = [...bytesByLang.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LANGUAGES)
    .map(([name, bytes]) => ({ name, bytes, share: totalBytes ? bytes / totalBytes : 0 }));

  const topRepos: Repo[] = [...repos]
    .sort((a, b) => b.stargazerCount - a.stargazerCount)
    .slice(0, TOP_REPOS)
    .map((r) => ({
      name: r.name,
      description: r.description,
      url: r.url,
      stars: r.stargazerCount,
      forks: r.forkCount,
      language: r.primaryLanguage?.name ?? null,
      pushedAt: r.pushedAt,
    }));

  const calendar = raw.contributionsCollection.contributionCalendar;
  const weeks: Day[][] = calendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, weekday: d.weekday })),
  );
  const days = weeks.flat();

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  let peakDay: Day | null = null;
  for (const d of days) {
    byWeekday[d.weekday] += d.count;
    if (d.count > 0 && (!peakDay || d.count > peakDay.count)) peakDay = d;
  }

  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatarUrl,
    bio: raw.bio,
    location: raw.location,
    company: raw.company,
    websiteUrl: raw.websiteUrl,
    createdAt: raw.createdAt,
    followers: raw.followers.totalCount,
    following: raw.following.totalCount,
    totals: {
      repos: raw.repositories.totalCount,
      // Repos are fetched sorted by stars, so the first page holds nearly all of them.
      stars: repos.reduce((n, r) => n + r.stargazerCount, 0),
      forks: repos.reduce((n, r) => n + r.forkCount, 0),
      pullRequests: raw.pullRequests.totalCount,
      issues: raw.issues.totalCount,
      contributions: calendar.totalContributions,
      commits: raw.contributionsCollection.totalCommitContributions,
    },
    languages,
    topRepos,
    weeks,
    streaks: computeStreaks(days, now),
    byWeekday,
    peakDay,
    owners: groupByOwner(raw.contributionsCollection, raw.login),
    projects: activeProjects(raw.contributionsCollection),
    lastYear: lastYearCounts(raw.contributionsCollection),
    activeDays: days.filter((d) => d.count > 0).length,
    memberOf: raw.organizations?.nodes ?? [],
    fetchedAt: now.toISOString(),
  };
}

function lastYearCounts(cc: RawUser['contributionsCollection']): Counts {
  const commits = cc.totalCommitContributions;
  const pullRequests = cc.totalPullRequestContributions ?? 0;
  const reviews = cc.totalPullRequestReviewContributions ?? 0;
  const issues = cc.totalIssueContributions ?? 0;
  return { commits, pullRequests, reviews, issues, total: commits + pullRequests + reviews + issues };
}

/** False when the contribution calendar could not be loaded, so calendar-based numbers would read as zero. */
export function hasCalendar(p: Profile): boolean {
  return p.weeks.some((w) => w.length > 0);
}

const zero = (): Counts => ({ commits: 0, pullRequests: 0, reviews: 0, issues: 0, total: 0 });

/**
 * Folds the four per-repository contribution lists into one entry per owner, each with its repos.
 * Private repositories are dropped even if the token can see them, because pages are public.
 */
function byKind(cc: RawUser['contributionsCollection']): [Kind, RawRepoContributions[] | undefined][] {
  return [
    ['commits', cc.commitContributionsByRepository],
    ['pullRequests', cc.pullRequestContributionsByRepository],
    ['reviews', cc.pullRequestReviewContributionsByRepository],
    ['issues', cc.issueContributionsByRepository],
  ];
}

export function groupByOwner(cc: RawUser['contributionsCollection'], self: string): OwnerActivity[] {
  const sources = byKind(cc);
  const owners = new Map<string, OwnerActivity & { byRepo: Map<string, RepoActivity> }>();

  for (const [kind, list] of sources) {
    for (const { repository, contributions } of list ?? []) {
      if (repository.isPrivate || contributions.totalCount === 0) continue;
      const { owner } = repository;
      const key = owner.login.toLowerCase();
      let entry = owners.get(key);
      if (!entry) {
        const type = owner.login.toLowerCase() === self.toLowerCase() ? 'self' : owner.__typename === 'Organization' ? 'org' : 'user';
        entry = { login: owner.login, name: owner.name ?? null, avatarUrl: owner.avatarUrl, type, repos: [], byRepo: new Map(), ...zero() };
        owners.set(key, entry);
      }
      let repo = entry.byRepo.get(repository.name);
      if (!repo) {
        repo = { name: repository.name, ...zero() };
        entry.byRepo.set(repository.name, repo);
      }
      const n = contributions.totalCount;
      repo[kind] += n;
      repo.total += n;
      entry[kind] += n;
      entry.total += n;
    }
  }

  return [...owners.values()]
    .map(({ byRepo, ...owner }) => ({ ...owner, repos: [...byRepo.values()].sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));
}

/** Folds the four per-repository contribution lists into one entry per repository, most active first. Public only. */
export function activeProjects(cc: RawUser['contributionsCollection']): Project[] {
  const projects = new Map<string, Project>();
  for (const [kind, list] of byKind(cc)) {
    for (const { repository: r, contributions } of list ?? []) {
      if (r.isPrivate || contributions.totalCount === 0) continue;
      const key = `${r.owner.login}/${r.name}`.toLowerCase();
      let p = projects.get(key);
      if (!p) {
        p = {
          owner: r.owner.login,
          name: r.name,
          description: null,
          url: `https://github.com/${r.owner.login}/${r.name}`,
          stars: 0,
          languages: [],
          topics: [],
          ...zero(),
        };
        projects.set(key, p);
      }
      // The same repository shows up once per kind, and not every source knows everything about it.
      p.description ??= cleanDescription(r.description);
      if (r.url) p.url = r.url;
      p.stars = Math.max(p.stars, r.stargazerCount ?? 0);
      if (!p.languages.length && r.primaryLanguage) p.languages = [r.primaryLanguage.name];
      if (!p.topics.length && r.topics) p.topics = r.topics;
      p[kind] += contributions.totalCount;
      p.total += contributions.totalCount;
    }
  }
  return [...projects.values()].sort((a, b) => b.total - a.total || b.stars - a.stars || a.name.localeCompare(b.name));
}

/** Drops emoji and :shortcodes:, which the card fonts cannot draw, and squeezes the whitespace. Null when nothing is left. */
export function cleanDescription(text: string | null | undefined): string | null {
  const clean = (text ?? '')
    .replace(/:[a-z0-9_+-]+:/gi, ' ')
    .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || null;
}

/** Share of public contributions that went to organizations, the user's own repos, and other people's. */
export function ownershipSplit(owners: OwnerActivity[]): Record<OwnerActivity['type'], number> {
  const split = { org: 0, self: 0, user: 0 };
  for (const o of owners) split[o.type] += o.total;
  return split;
}

export function computeStreaks(days: Day[], now = new Date()): Streaks {
  let longest = 0;
  let longestStart: string | null = null;
  let longestEnd: string | null = null;
  let run = 0;
  let runStart: string | null = null;

  for (const d of days) {
    if (d.count > 0) {
      if (run === 0) runStart = d.date;
      run++;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = d.date;
      }
    } else {
      run = 0;
    }
  }

  // Today is not over yet, so an empty today does not break the current streak.
  const today = now.toISOString().slice(0, 10);
  let i = days.length - 1;
  while (i >= 0 && days[i].date > today) i--;
  if (i >= 0 && days[i].date === today && days[i].count === 0) i--;
  let current = 0;
  while (i >= 0 && days[i].count > 0) {
    current++;
    i--;
  }

  return { current, longest, longestStart, longestEnd };
}

// GitHub logins: alphanumerics and single hyphens, no leading or trailing hyphen, max 39 chars.
const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function isValidLogin(login: string): boolean {
  return LOGIN_RE.test(login);
}
