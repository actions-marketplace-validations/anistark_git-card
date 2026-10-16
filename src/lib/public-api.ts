// Client-side data layer: public, unauthenticated APIs only, straight from the visitor's browser.
//
//   GitHub REST     /users/:login, /users/:login/orgs        60 requests an hour per visitor
//   GitHub search   repos, commits, PRs, reviews, issues     10 searches a minute per visitor
//   Calendar        public mirrors, with fallbacks           see calendar.ts
//
// GitHub's own calendar and GraphQL API are not usable from a browser without a token, so the calendar comes
// from third parties. It is often the slowest part, so the rest of the profile is handed over first and the
// calendar fills in after. Everything is shaped into the same RawUser that normalize() takes, so the cards,
// the rank and the org grouping do not care where the data came from.

import { fetchCalendar, type Calendar, type CalendarAttempt } from './calendar';
import { normalize, type Profile, type RawUser } from './profile';

const API = 'https://api.github.com';
const SAMPLE = 100; // items fetched per activity search, used for the org breakdown
const OWNER_LOOKUPS = 10; // most extra /users calls spent classifying repo owners as org or user
const PROJECT_LOOKUPS = 10; // other people's repos folded into the repository search, for the projects card

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-found' | 'rate-limit' | 'network',
    /** When the rate limit resets, for a rate-limit error. */
    readonly resetAt?: Date,
  ) {
    super(message);
  }
}

export type Step = 'profile' | 'repos' | 'calendar' | 'activity' | 'orgs';

export interface FetchOptions {
  signal?: AbortSignal;
  onStep?: (step: Step, state: 'start' | 'done' | 'failed') => void;
  /** Injected in tests. */
  fetch?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  /** Calendar retries, injected in tests. */
  calendarRetryDelayMs?: number;
  /**
   * Called once with everything but the calendar, when the calendar is the only part still loading. The final
   * profile, calendar included, is what the returned promise resolves with.
   */
  onPartial?: (partial: PublicProfile) => void;
  /** Each calendar source and attempt, as it starts. */
  onCalendarAttempt?: (a: CalendarAttempt) => void;
}

export type CalendarState = 'loading' | 'ready' | 'offline';

export interface PublicProfile {
  profile: Profile;
  /** Parts that could not be loaded, shown to the visitor instead of failing the whole page. */
  warnings: string[];
  calendar: CalendarState;
  /** Host that served the calendar. */
  calendarSource?: string;
}

// ---- Raw API shapes, only the fields used ----------------------------------------------

interface RestUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  created_at: string;
  followers: number;
  following: number;
  public_repos: number;
  type: 'User' | 'Organization';
}

interface RestOwner {
  login: string;
  avatar_url: string;
  type?: 'User' | 'Organization';
}

interface SearchRepo {
  name: string;
  owner: { login: string };
  topics: string[];
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  language: string | null;
  size: number; // KB
}

interface SearchCommit {
  repository: {
    name: string;
    private: boolean;
    owner: RestOwner & { type: 'User' | 'Organization' };
    description?: string | null;
    html_url?: string;
  };
}

interface SearchIssue {
  repository_url: string; // https://api.github.com/repos/OWNER/NAME
  created_at: string;
}

interface Search<T> {
  total_count: number;
  items: T[];
}

export interface PublicSources {
  user: RestUser;
  orgs: RestOwner[];
  /** The user's own repos, plus the most active of other people's they worked in. */
  repos: Search<SearchRepo>;
  calendar: Calendar | null;
  commits: Search<SearchCommit> | null;
  pullRequests: Search<SearchIssue> | null;
  reviews: Search<SearchIssue> | null;
  issues: Search<SearchIssue> | null;
  /** Owner login (lowercase) to account type, for repos seen only through issue search results. */
  ownerTypes: Record<string, 'User' | 'Organization'>;
}

// ---- Fetching ------------------------------------------------------------------------------

/** Longest any one GitHub request may take. Calendar sources have their own, shorter limit and retries. */
const TIMEOUT_MS = 30_000;

async function get<T>(url: string, opts: FetchOptions, timeoutMs = opts.timeoutMs ?? TIMEOUT_MS): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await doFetch(url, { signal, headers: { accept: 'application/vnd.github+json' } });
  } catch (err) {
    // The visitor navigated away: let it propagate. Our own timeout: report it like any network failure.
    if (opts.signal?.aborted) throw err;
    if (timeout.aborted) throw new PublicApiError('The request took too long.', 'network');
    if ((err as Error).name === 'AbortError') throw err;
    throw new PublicApiError('Could not reach the API. Check your connection.', 'network');
  }
  if (res.status === 404) throw new PublicApiError('Not found.', 'not-found');
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const retryAfter = Number(res.headers.get('retry-after'));
    const resetAt = reset ? new Date(reset * 1000) : retryAfter ? new Date(Date.now() + retryAfter * 1000) : undefined;
    throw new PublicApiError('GitHub rate limit reached.', 'rate-limit', resetAt);
  }
  // Search answers 422 for users it cannot search, for example ones with no public activity.
  if (res.status === 422) return { total_count: 0, items: [] } as T;
  if (!res.ok) throw new PublicApiError(`The API answered ${res.status}.`, 'network');
  return (await res.json()) as T;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const SEARCH_LIMITED = 'search rate limit, try again in a minute';

/** True when some of a profile is missing because search hit its 10 a minute limit, so a retry will fill it in. */
export const hitSearchLimit = (warnings: string[]) => warnings.some((w) => w.includes(SEARCH_LIMITED));

/** Runs an optional part, recording a warning instead of failing the page. Rate limits on core data still throw. */
async function optional<T>(label: string, warnings: string[], run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    const reason = err instanceof PublicApiError && err.kind === 'rate-limit' ? SEARCH_LIMITED : 'unavailable';
    warnings.push(`${label}: ${reason}.`);
    return null;
  }
}

export async function fetchSources(
  login: string,
  opts: FetchOptions = {},
  /** Called with everything but the calendar, if the calendar is still loading once the rest is done. */
  onRest?: (sources: PublicSources, warnings: string[]) => void,
): Promise<{ sources: PublicSources; warnings: string[] }> {
  const warnings: string[] = [];
  const step = opts.onStep ?? (() => {});
  const since = iso(new Date((opts.now ?? new Date()).getTime() - 365 * 86_400_000));
  const q = (query: string) => encodeURIComponent(query);

  step('profile', 'start');
  const user = await get<RestUser>(`${API}/users/${login}`, opts).catch((err) => {
    step('profile', 'failed');
    if (err instanceof PublicApiError && err.kind === 'not-found')
      throw new PublicApiError(`No GitHub account called ${login}.`, 'not-found');
    throw err;
  });
  step('profile', 'done');

  // The calendar lives on other hosts and is often the slowest part, so it runs alongside GitHub's.
  step('calendar', 'start');
  let calendarSettled = false;
  const calendarPromise = optional('Contribution calendar', warnings, () =>
    fetchCalendar(user.login, {
      signal: opts.signal,
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      retryDelayMs: opts.calendarRetryDelayMs,
      onAttempt: opts.onCalendarAttempt,
    }),
  ).then((c) => {
    calendarSettled = true;
    step('calendar', c ? 'done' : 'failed');
    return c;
  });

  step('activity', 'start');
  const search = <T>(label: string, path: string, query: string, sort: string) =>
    optional(label, warnings, () => get<Search<T>>(`${API}/search/${path}?q=${q(query)}&sort=${sort}&order=desc&per_page=${SAMPLE}`, opts));
  // Sequential on purpose: search allows 10 a minute, and a burst is more likely to trip secondary limits.
  const commits = await search<SearchCommit>('Commits', 'commits', `author:${user.login} committer-date:>=${since}`, 'committer-date');
  const pullRequests = await search<SearchIssue>('Pull requests', 'issues', `author:${user.login} type:pr`, 'created');
  const reviews = await search<SearchIssue>('Reviews', 'issues', `reviewed-by:${user.login} type:pr updated:>=${since}`, 'updated');
  const issues = await search<SearchIssue>('Issues', 'issues', `author:${user.login} type:issue created:>=${since}`, 'created');
  step('activity', commits && pullRequests && reviews && issues ? 'done' : 'failed');

  step('orgs', 'start');
  const orgs =
    (await optional('Organization memberships', warnings, () => get<RestOwner[]>(`${API}/users/${user.login}/orgs`, opts))) ?? [];
  const ownerTypes = await classifyOwners(user, orgs, commits, [pullRequests, reviews, issues], opts);
  step('orgs', 'done');

  // After the activity on purpose: search ORs scope qualifiers, so the same search that lists the user's own repos
  // also brings language, topics and description for the busiest repos they do not own, at no extra request.
  step('repos', 'start');
  const elsewhere = projectCandidates({ user, orgs, commits, pullRequests, reviews, issues }, opts.now ?? new Date())
    .filter((r) => r.owner.toLowerCase() !== user.login.toLowerCase())
    .slice(0, PROJECT_LOOKUPS)
    .map((r) => ` repo:${r.owner}/${r.name}`)
    .join('');
  const repos = await get<Search<SearchRepo>>(
    `${API}/search/repositories?q=${q(`user:${user.login} fork:false${elsewhere}`)}&sort=stars&per_page=100`,
    opts,
  );
  step('repos', 'done');

  const rest = { user, orgs, repos, commits, pullRequests, reviews, issues, ownerTypes };
  if (!calendarSettled) onRest?.({ ...rest, calendar: null }, [...warnings]);
  const calendar = await calendarPromise;
  return { sources: { ...rest, calendar }, warnings };
}

/** Works out whether each repo owner is an organization. Free where commit results or memberships say so. */
async function classifyOwners(
  user: RestUser,
  orgs: RestOwner[],
  commits: Search<SearchCommit> | null,
  issueSearches: (Search<SearchIssue> | null)[],
  opts: FetchOptions,
): Promise<Record<string, 'User' | 'Organization'>> {
  const types: Record<string, 'User' | 'Organization'> = { [user.login.toLowerCase()]: 'User', ...cachedOwnerTypes() };
  for (const o of orgs) types[o.login.toLowerCase()] = 'Organization';
  for (const c of commits?.items ?? []) types[c.repository.owner.login.toLowerCase()] = c.repository.owner.type;

  const unknown = [...new Set(issueSearches.flatMap((s) => s?.items ?? []).map((i) => ownerOf(i.repository_url).toLowerCase()))].filter(
    (o) => !(o in types),
  );
  for (const owner of unknown.slice(0, OWNER_LOOKUPS)) {
    try {
      types[owner] = (await get<RestUser>(`${API}/users/${owner}`, opts)).type;
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      break; // most likely the rate limit; leave the rest unclassified
    }
  }
  saveOwnerTypes(types);
  return types;
}

const OWNER_CACHE = 'gc:owner-types:v1';

function cachedOwnerTypes(): Record<string, 'User' | 'Organization'> {
  try {
    return JSON.parse(localStorage.getItem(OWNER_CACHE) ?? '{}');
  } catch {
    return {};
  }
}

function saveOwnerTypes(types: Record<string, 'User' | 'Organization'>) {
  try {
    localStorage.setItem(OWNER_CACHE, JSON.stringify(types));
  } catch {
    // Storage can be blocked. Owners are then looked up again next time.
  }
}

// ---- Mapping into the GraphQL-shaped RawUser ------------------------------------------------

export function ownerOf(repositoryUrl: string): string {
  return repositoryUrl.split('/repos/')[1]?.split('/')[0] ?? '';
}

function repoOf(repositoryUrl: string): string {
  return repositoryUrl.split('/repos/')[1]?.split('/')[1] ?? '';
}

type RepoContributions = NonNullable<RawUser['contributionsCollection']['commitContributionsByRepository']>;

/** Counts sampled items per repository, in the per-repository shape GraphQL would return. */
function byRepository(
  items: { owner: string; name: string; private?: boolean }[],
  types: Record<string, 'User' | 'Organization'>,
  meta = new Map<string, RepoMeta>(),
): RepoContributions {
  const counts = new Map<string, { owner: string; name: string; private: boolean; n: number }>();
  for (const it of items) {
    const key = `${it.owner}/${it.name}`.toLowerCase();
    const entry = counts.get(key) ?? { owner: it.owner, name: it.name, private: !!it.private, n: 0 };
    entry.n++;
    counts.set(key, entry);
  }
  return [...counts.values()].map((c) => ({
    repository: {
      name: c.name,
      isPrivate: c.private,
      // Unclassified owners count as people, so a guess can never inflate the organization numbers.
      owner: { __typename: types[c.owner.toLowerCase()] ?? 'User', login: c.owner, avatarUrl: `https://github.com/${c.owner}.png?size=96` },
      ...meta.get(`${c.owner}/${c.name}`.toLowerCase()),
    },
    contributions: { totalCount: c.n },
  }));
}

/**
 * Commit search matches a person's authored commits wherever they have been copied: forks, mirrors, imports.
 * Only count commits in repos where the work plausibly happened: the person's own repos, organizations they
 * are a public member of, and repos where they also opened PRs, reviewed or filed issues.
 */
type Activity = Pick<PublicSources, 'user' | 'orgs' | 'commits' | 'pullRequests' | 'reviews' | 'issues'>;
type Item = { owner: string; name: string; private?: boolean };

export function genuineCommits(s: Activity): { owner: string; name: string; private: boolean }[] {
  const self = s.user.login.toLowerCase();
  const members = new Set(s.orgs.map((o) => o.login.toLowerCase()));
  const engaged = new Set(
    [s.pullRequests, s.reviews, s.issues]
      .flatMap((search) => search?.items ?? [])
      .map((i) => `${ownerOf(i.repository_url)}/${repoOf(i.repository_url)}`.toLowerCase()),
  );
  return (s.commits?.items ?? [])
    .map((c) => ({ owner: c.repository.owner.login, name: c.repository.name, private: c.repository.private }))
    .filter(({ owner, name }) => {
      const o = owner.toLowerCase();
      return o === self || members.has(o) || engaged.has(`${o}/${name.toLowerCase()}`);
    });
}

/** Splits a flat run of days into Sunday-first weeks, like GitHub's calendar. */
export function calendarWeeks(
  days: { date: string; count: number }[],
): RawUser['contributionsCollection']['contributionCalendar']['weeks'] {
  const weeks: RawUser['contributionsCollection']['contributionCalendar']['weeks'] = [];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const weekday = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (!weeks.length || weekday === 0) weeks.push({ contributionDays: [] });
    weeks.at(-1)!.contributionDays.push({ date: d.date, contributionCount: d.count, weekday });
  }
  return weeks;
}

/** The sampled last-year activity, one item per contribution, as each per-repository list counts it. */
function contributionItems(s: Activity, now: Date): Record<'commits' | 'pullRequests' | 'reviews' | 'issues', Item[]> {
  const since = iso(new Date(now.getTime() - 365 * 86_400_000));
  const issueItems = (search: Search<SearchIssue> | null, recentOnly: boolean) =>
    (search?.items ?? [])
      .filter((i) => !recentOnly || i.created_at.slice(0, 10) >= since)
      .map((i) => ({ owner: ownerOf(i.repository_url), name: repoOf(i.repository_url) }));
  return {
    commits: genuineCommits(s),
    // All-time PR search, so only the PRs inside the window count.
    pullRequests: issueItems(s.pullRequests, true),
    reviews: issueItems(s.reviews, false),
    issues: issueItems(s.issues, false),
  };
}

/** Public repos with sampled activity, busiest first. */
export function projectCandidates(s: Activity, now = new Date()): { owner: string; name: string; n: number }[] {
  const counts = new Map<string, { owner: string; name: string; n: number }>();
  for (const it of Object.values(contributionItems(s, now)).flat()) {
    if (it.private) continue;
    const key = `${it.owner}/${it.name}`.toLowerCase();
    const entry = counts.get(key) ?? { owner: it.owner, name: it.name, n: 0 };
    entry.n++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n);
}

type RepoMeta = Pick<RepoContributions[number]['repository'], 'description' | 'url' | 'stargazerCount' | 'primaryLanguage' | 'topics'>;

/** What the repository and commit searches say about each repo, keyed by lowercase owner/name. */
function repoMeta(s: PublicSources): Map<string, RepoMeta> {
  const meta = new Map<string, RepoMeta>();
  for (const { repository: r } of s.commits?.items ?? []) {
    if (r.description) meta.set(`${r.owner.login}/${r.name}`.toLowerCase(), { description: r.description, url: r.html_url });
  }
  for (const r of s.repos.items) {
    meta.set(`${r.owner.login}/${r.name}`.toLowerCase(), {
      description: r.description,
      url: r.html_url,
      stargazerCount: r.stargazers_count,
      primaryLanguage: r.language ? { name: r.language } : null,
      topics: r.topics,
    });
  }
  return meta;
}

export function toRawUser(s: PublicSources, now = new Date()): RawUser {
  // Calendar sources can include a few days past "today" in some timezones; keep the last 371 at most.
  const days = (s.calendar?.contributions ?? []).filter((d) => d.date <= iso(now)).slice(-371);
  const items = contributionItems(s, now);
  const meta = repoMeta(s);
  const own = s.repos.items.filter((r) => r.owner.login.toLowerCase() === s.user.login.toLowerCase());

  return {
    login: s.user.login,
    name: s.user.name,
    avatarUrl: s.user.avatar_url,
    bio: s.user.bio,
    location: s.user.location,
    company: s.user.company,
    websiteUrl: s.user.blog || null,
    createdAt: s.user.created_at,
    followers: { totalCount: s.user.followers },
    following: { totalCount: s.user.following },
    pullRequests: { totalCount: s.pullRequests?.total_count ?? 0 },
    issues: { totalCount: s.issues?.total_count ?? 0 },
    repositories: {
      totalCount: s.user.public_repos,
      nodes: own.map((r) => ({
        name: r.name,
        description: r.description,
        url: r.html_url,
        stargazerCount: r.stargazers_count,
        forkCount: r.forks_count,
        pushedAt: r.pushed_at,
        primaryLanguage: r.language ? { name: r.language } : null,
        // Public APIs give one language per repo without a call per repo, so weight it by repo size.
        languages: { edges: r.language ? [{ size: Math.max(1, r.size) * 1024, node: { name: r.language } }] : [] },
      })),
    },
    organizations: { nodes: s.orgs.map((o) => ({ login: o.login, name: null, avatarUrl: o.avatar_url })) },
    contributionsCollection: {
      totalCommitContributions: s.commits?.total_count ?? 0,
      // All-time PR search, so the last-year count is what the sample shows inside the window.
      totalPullRequestContributions: items.pullRequests.length,
      totalPullRequestReviewContributions: s.reviews?.total_count ?? 0,
      totalIssueContributions: s.issues?.total_count ?? 0,
      contributionCalendar: {
        totalContributions: s.calendar?.total ?? days.reduce((n, d) => n + d.count, 0),
        weeks: calendarWeeks(days),
      },
      commitContributionsByRepository: byRepository(items.commits, s.ownerTypes, meta),
      pullRequestContributionsByRepository: byRepository(items.pullRequests, s.ownerTypes, meta),
      pullRequestReviewContributionsByRepository: byRepository(items.reviews, s.ownerTypes, meta),
      issueContributionsByRepository: byRepository(items.issues, s.ownerTypes, meta),
    },
  };
}

// ---- Entry point with a short-lived local cache ------------------------------------------------

// Bump when the Profile shape changes, so cached profiles from before do not reach cards that expect more.
export const CACHE_PREFIX = 'gc:profile:v2:';
const TTL_MS = 60 * 60 * 1000;

export async function fetchPublicProfile(login: string, opts: FetchOptions = {}): Promise<PublicProfile> {
  const key = CACHE_PREFIX + login.toLowerCase();
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null') as (PublicProfile & { at: number }) | null;
    if (cached && Date.now() - cached.at < TTL_MS) return { ...cached, calendar: 'ready' };
  } catch {
    // No storage, or a stale shape. Fetch fresh.
  }

  const now = opts.now ?? new Date();
  const { sources, warnings } = await fetchSources(login, opts, (rest, partialWarnings) =>
    opts.onPartial?.({ profile: normalize(toRawUser(rest, now), now), warnings: partialWarnings, calendar: 'loading' }),
  );
  const result: PublicProfile = {
    profile: normalize(toRawUser(sources, now), now),
    warnings,
    calendar: sources.calendar ? 'ready' : 'offline',
    calendarSource: sources.calendar?.source,
  };
  // Only cache complete profiles, so a calendar or search hiccup is retried on the next load, not kept for an hour.
  if (!warnings.length) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...result, at: Date.now() }));
    } catch {
      // Storage full or blocked. The next visit fetches again.
    }
  }
  return result;
}
