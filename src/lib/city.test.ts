import { describe, expect, it } from 'vitest';
import { demoProfile } from '../og/demo';
import {
  actionSteps,
  decodeDays,
  DISTRICT,
  districtDays,
  encodeDays,
  mergeCity,
  plots,
  refreshOrder,
  residentData,
  type CityData,
  type ResidentData,
} from './city';

const AT = '2026-10-12T03:41:00.000Z';
const data = (login: string, checked = AT): ResidentData => ({
  login,
  tier: 'B',
  role: 'wirejack',
  start: '2025-10-12',
  days: '0123z',
  total: 100,
  peak: 9,
  checked,
});
const census = (citizens: string[], landmarks: string[] = [], at = AT) => ({
  at,
  citizens,
  landmarks,
  fresh: new Map([...citizens, ...landmarks].map((l) => [l.toLowerCase(), data(l, at)])),
});

describe('day encoding', () => {
  it('keeps empty days empty and every working day visible', () => {
    const days = encodeDays([0, 1, 4, 100, 0], 100);
    expect(days).toBe('047z0');
    expect(days[1]).not.toBe('0');
    const back = decodeDays(days);
    expect(back[0]).toBe(0);
    expect(back[3]).toBe(1);
    expect(back[2]).toBeCloseTo(0.2, 1);
  });

  it('turns a real profile into one character per day', () => {
    const p = demoProfile();
    const r = residentData(p, AT);
    expect(r.days).toHaveLength(p.weeks.flat().length);
    expect(r.days).toMatch(/^[0-9a-z]+$/);
    expect(r.days).toContain('z');
    expect(districtDays(r).length).toBe(p.weeks.flat().filter((d) => d.count > 0).length);
  });

  it('lays the days out in weeks from the first weekday', () => {
    // 2025-10-15 is a Wednesday.
    expect(districtDays({ start: '2025-10-15', days: '1001' })).toEqual([
      [0, 3, 1 / 35],
      [0, 6, 1 / 35],
    ]);
    expect(districtDays({ start: '2025-10-15', days: '00001' })).toEqual([[1, 0, 1 / 35]]);
  });
});

describe('mergeCity', () => {
  it('numbers newcomers in login order and keeps landmarks unnumbered', () => {
    const city = mergeCity(null, census(['zed', 'amy'], ['torvalds']));
    expect(city.residents.map((r) => [r.login, r.number, r.since])).toEqual([
      ['amy', 1, '2026-10-12'],
      ['zed', 2, '2026-10-12'],
      ['torvalds', null, null],
    ]);
    expect(city.next).toBe(3);
  });

  it('keeps numbers when people join or leave, and never reuses one', () => {
    const one = mergeCity(null, census(['amy', 'bob', 'cat']));
    const two = mergeCity(one, census(['cat', 'amy', 'dan'], [], '2026-10-13T03:41:00.000Z'));
    expect(two.residents.map((r) => [r.login, r.number, r.since])).toEqual([
      ['amy', 1, '2026-10-12'],
      ['cat', 3, '2026-10-12'],
      ['dan', 4, '2026-10-13'],
    ]);
    const three = mergeCity(two, census(['amy', 'cat', 'dan', 'bob'], [], '2026-10-14T03:41:00.000Z'));
    expect(three.residents.find((r) => r.login === 'bob')?.number).toBe(5);
  });

  it('makes a landmark who moves in a citizen', () => {
    const one = mergeCity(null, census([], ['torvalds']));
    const two = mergeCity(one, census(['Torvalds'], ['torvalds']));
    expect(two.residents).toHaveLength(1);
    expect(two.residents[0].number).toBe(1);
  });

  it('keeps old data for anyone not refreshed this run, and skips anyone never fetched', () => {
    const one = mergeCity(null, census(['amy']));
    const two = mergeCity(one, { at: '2026-10-13T00:00:00.000Z', citizens: ['amy', 'bob'], landmarks: [], fresh: new Map() });
    expect(two.residents.map((r) => r.login)).toEqual(['amy']);
    expect(two.residents[0].checked).toBe(AT);
    expect(two.next).toBe(2);
  });
});

describe('refreshOrder', () => {
  it('fetches newcomers first, then the stalest', () => {
    const prev: CityData = {
      updatedAt: AT,
      next: 3,
      residents: [
        { ...data('amy', '2026-10-11T00:00:00Z'), number: 1, since: '2026-10-01' },
        { ...data('bob', '2026-10-09T00:00:00Z'), number: 2, since: '2026-10-01' },
      ],
    };
    expect(refreshOrder(prev, ['amy', 'bob', 'cat'], 2)).toEqual(['cat', 'bob']);
  });
});

describe('actionSteps', () => {
  const action = 'anistark/git-card';

  it('reads the username and city inputs of every step that uses the Action', () => {
    const yaml = `
name: cards
on: { schedule: [{ cron: '0 0 * * *' }] }
jobs:
  cards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: anistark/git-card@v0
        with:
          username: "Amy, bob"   # both of us
          cards: skyline
      - name: Org cards
        with:
          username: cat
          city: off
        uses: 'anistark/git-card@main'
      - name: Commit
        run: git push
`;
    expect(actionSteps(yaml, action, 'owner')).toEqual([
      { users: ['Amy', 'bob'], city: true },
      { users: ['cat'], city: false },
    ]);
  });

  it('falls back to the repo owner, and skips users it cannot know', () => {
    const yaml = `
    steps:
      - uses: anistark/git-card@v0
      - uses: anistark/git-card@v0
        with:
          username: \${{ github.repository_owner }}
      - uses: anistark/git-card@v0
        with:
          username: \${{ inputs.who }}
`;
    expect(actionSteps(yaml, action, 'owner').map((s) => s.users)).toEqual([['owner'], ['owner'], []]);
  });

  it('ignores other actions with a similar name', () => {
    expect(actionSteps('      - uses: anistark/git-card-fork@v1', action, 'owner')).toEqual([]);
  });
});

describe('plots', () => {
  it('starts in the middle and never moves a plot when the city grows', () => {
    const small = plots(12);
    expect(small[0]).toEqual({ x: 0, z: 0 });
    expect(plots(300).slice(0, 12)).toEqual(small);
  });

  it('never overlaps two districts', () => {
    const all = plots(400);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const apart = Math.abs(all[i].x - all[j].x) >= DISTRICT.w + 2 || Math.abs(all[i].z - all[j].z) >= DISTRICT.d + 2;
        expect(apart).toBe(true);
      }
    }
  });

  it('grows roughly round, not in a line', () => {
    const all = plots(200);
    const span = (k: 'x' | 'z') => Math.max(...all.map((p) => p[k])) - Math.min(...all.map((p) => p[k]));
    expect(span('x') / span('z')).toBeGreaterThan(0.6);
    expect(span('x') / span('z')).toBeLessThan(1.6);
  });
});
