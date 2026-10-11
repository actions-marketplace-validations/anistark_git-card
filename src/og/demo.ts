import { normalize, type Profile, type RawUser } from '../lib/profile';
import type { WeatherState } from '../lib/weather';

// Counts for the last days of the year, newest last, that put the demo city in each weather.
const TAILS: Record<WeatherState, number[]> = {
  clear: [2, 9, 11, 8, 10, 12, 3],
  // A 24 day streak, just past the demo year's best of 22.
  fireworks: [0, ...Array.from({ length: 24 }, (_, i) => 2 + (i % 5))],
  storm: [0, 22, 31, 18, 40, 27, 35, 24],
  fog: Array(20).fill(0),
  rain: [0, 1, 0, 0, 0, 0, 0],
};

/**
 * A made-up but believable year for the site's own preview image. Seeded, so the image is stable. Pass a
 * weather state to rewrite the last days so the forecast lands on it.
 */
export function demoProfile(weather?: WeatherState): Profile {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const start = Date.UTC(2025, 9, 5); // a Sunday

  const weeks: RawUser['contributionsCollection']['contributionCalendar']['weeks'] = [];
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start + (w * 7 + d) * 86_400_000).toISOString().slice(0, 10);
      const weekday = d === 0 || d === 6 ? 0.3 : 1;
      const season = 0.6 + 0.4 * Math.sin(w / 5);
      const crunch = w > 38 && w < 43 ? 16 * rand() : 0;
      const count = rand() < 0.14 ? 0 : Math.round(rand() * 12 * weekday * season + crunch);
      total += count;
      contributionDays.push({ date, contributionCount: count, weekday: d });
    }
    weeks.push({ contributionDays });
  }
  const days = weeks.flatMap((w) => w.contributionDays);
  (weather ? TAILS[weather] : []).forEach((count, i, tail) => {
    const day = days[days.length - tail.length + i];
    total += count - day.contributionCount;
    day.contributionCount = count;
  });

  return normalize(
    {
      login: 'demo',
      name: 'Demo',
      avatarUrl: '',
      bio: null,
      location: null,
      company: null,
      websiteUrl: null,
      createdAt: '2016-01-01T00:00:00Z',
      followers: { totalCount: 0 },
      following: { totalCount: 0 },
      pullRequests: { totalCount: 0 },
      issues: { totalCount: 0 },
      repositories: { totalCount: 0, nodes: [] },
      contributionsCollection: { totalCommitContributions: total, contributionCalendar: { totalContributions: total, weeks } },
    },
    new Date(start + 53 * 7 * 86_400_000),
  );
}
