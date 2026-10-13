// GraphQL data source for the README card generator (scripts/generate.tsx).
import { cleanDescription, normalize, type Profile, type Project, type RawUser } from './profile';

const QUERY = /* GraphQL */ `
  query ($login: String!) {
    user(login: $login) {
      login
      name
      avatarUrl(size: 256)
      bio
      location
      company
      websiteUrl
      createdAt
      followers {
        totalCount
      }
      following {
        totalCount
      }
      pullRequests {
        totalCount
      }
      issues {
        totalCount
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) {
        totalCount
        nodes {
          name
          description
          url
          stargazerCount
          forkCount
          pushedAt
          primaryLanguage {
            name
          }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
              }
            }
          }
        }
      }
      organizations(first: 30) {
        nodes {
          login
          name
          avatarUrl(size: 96)
        }
      }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              weekday
            }
          }
        }
        # For commits, totalCount is the number of commits. For the others it is the number of PRs, reviews or issues.
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            ...Repo
          }
          contributions {
            totalCount
          }
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          repository {
            ...Repo
          }
          contributions {
            totalCount
          }
        }
        pullRequestReviewContributionsByRepository(maxRepositories: 100) {
          repository {
            ...Repo
          }
          contributions {
            totalCount
          }
        }
        issueContributionsByRepository(maxRepositories: 100) {
          repository {
            ...Repo
          }
          contributions {
            totalCount
          }
        }
      }
    }
  }

  # Plain fields only. A nested connection here, like topics, multiplies across 400 repos and times out big accounts.
  fragment Repo on Repository {
    name
    isPrivate
    description
    url
    stargazerCount
    primaryLanguage {
      name
    }
    owner {
      __typename
      login
      avatarUrl(size: 96)
      ... on Organization {
        name
      }
    }
  }
`;

/** How many of the most active projects get their full language list and topics, the most the projects card shows. */
export const PROJECT_DETAILS = 10;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 404 | 429 | 503,
  ) {
    super(message);
  }
}

/**
 * Full-fidelity profile via GraphQL. Needs a token, so it only runs where one is available for free:
 * the README card generator inside GitHub Actions. The website itself uses public-api.ts.
 */
export async function fetchProfileGraphQL(login: string, token: string, attempts = 3): Promise<Profile> {
  let res: Response | undefined;
  // This query is heavy, and GitHub sometimes times out on big accounts. Those 50x answers are worth a retry.
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * 2 ** (i - 1)));
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'git-card' },
      body: JSON.stringify({ query: QUERY, variables: { login } }),
    });
    if (![502, 503, 504].includes(res.status)) break;
  }
  res = res!;

  if (res.status === 401) throw new GitHubError('GitHub token was rejected.', 401);
  if (res.status === 403 || res.status === 429) throw new GitHubError('GitHub rate limit reached. Try again soon.', 429);
  if (!res.ok) throw new GitHubError(`GitHub responded with ${res.status}.`, 503);

  const body = (await res.json()) as {
    data?: { user: RawUser | null };
    errors?: Array<{ type?: string; message: string }>;
  };

  if (body.errors?.some((e) => e.type === 'NOT_FOUND') || body.data?.user === null) {
    throw new GitHubError(`No GitHub user called ${login}.`, 404);
  }
  if (body.errors?.some((e) => e.type === 'RATE_LIMITED')) throw new GitHubError('GitHub rate limit reached. Try again soon.', 429);
  if (!body.data?.user) throw new GitHubError(body.errors?.[0]?.message ?? 'Unexpected response from GitHub.', 503);
  return normalize(body.data.user);
}

interface RawProjectDetails {
  description: string | null;
  languages: { nodes: Array<{ name: string }> };
  repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
}

/**
 * Languages and topics for the most active projects, in a second small query (cost 1), since asking for them
 * in the main one is too heavy. Only the projects card needs it. Best effort: on any failure the profile
 * keeps the primary languages it already has.
 */
export async function withProjectDetails(profile: Profile, token: string, limit = PROJECT_DETAILS): Promise<Profile> {
  const top = profile.projects.slice(0, limit);
  if (!top.length) return profile;
  const vars = top.flatMap((_, i) => [`$o${i}: String!`, `$n${i}: String!`]).join(', ');
  const fields = top
    .map(
      (_, i) => `p${i}: repository(owner: $o${i}, name: $n${i}) {
        description
        languages(first: 3, orderBy: { field: SIZE, direction: DESC }) { nodes { name } }
        repositoryTopics(first: 8) { nodes { topic { name } } }
      }`,
    )
    .join('\n');
  const variables = Object.fromEntries(
    top.flatMap((p, i) => [
      [`o${i}`, p.owner],
      [`n${i}`, p.name],
    ]),
  );
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'git-card' },
      body: JSON.stringify({ query: `query (${vars}) { ${fields} }`, variables }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = ((await res.json()) as { data?: Record<string, RawProjectDetails | null> }).data ?? {};
    const projects: Project[] = profile.projects.map((p, i) => {
      const d = i < top.length ? data[`p${i}`] : null;
      if (!d) return p;
      const languages = d.languages.nodes.map((l) => l.name);
      return {
        ...p,
        description: p.description ?? cleanDescription(d.description),
        languages: languages.length ? languages : p.languages,
        topics: d.repositoryTopics.nodes.map((t) => t.topic.name),
      };
    });
    return { ...profile, projects };
  } catch (err) {
    console.warn(`Project details for @${profile.login} skipped: ${(err as Error).message}`);
    return profile;
  }
}
