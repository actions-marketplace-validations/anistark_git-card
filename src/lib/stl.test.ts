import { describe, expect, it } from 'vitest';
import { demoProfile } from '../og/demo';
import type { Profile } from './profile';
import { boxTriangles, skylineBoxes, skylineStl, STL_DEFAULTS, stlFileName } from './stl';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Every triangle in a binary STL, as its stored normal and three vertices. */
function readStl(buffer: ArrayBuffer): [V, V, V, V][] {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  return Array.from({ length: count }, (_, t) => {
    const at = 84 + t * 50;
    const vec = (i: number): V => [0, 1, 2].map((k) => view.getFloat32(at + (i * 3 + k) * 4, true)) as V;
    return [vec(0), vec(1), vec(2), vec(3)];
  });
}

const active = (p: Profile) => p.weeks.flat().filter((d) => d.count > 0).length;

describe('boxTriangles', () => {
  const tris = boxTriangles([0, 0, 0], [2, 3, 4]);

  it('winds every triangle so its normal points out of the box', () => {
    const centre: V = [1, 1.5, 2];
    for (const [n, a, b, c] of tris) {
      const wound = cross(sub(b, a), sub(c, a));
      expect(dot(wound, n)).toBeGreaterThan(0);
      expect(dot(n, sub(a, centre))).toBeGreaterThan(0);
    }
  });

  it('closes the box: every edge is shared by exactly two triangles, once each way', () => {
    const edges = new Map<string, number>();
    for (const [, a, b, c] of tris) {
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = `${p}>${q}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const [key, n] of edges) {
      const [p, q] = key.split('>');
      expect(n, key).toBe(1);
      expect(edges.get(`${q}>${p}`), `${key} reversed`).toBe(1);
    }
  });
});

describe('skylineStl', () => {
  const profile = demoProfile();
  const buffer = skylineStl(profile);
  const tris = readStl(buffer);

  it('has a plate plus one tower per active day, 12 triangles each', () => {
    expect(tris).toHaveLength((1 + active(profile)) * 12);
    expect(buffer.byteLength).toBe(84 + tris.length * 50);
  });

  it('names itself in the header', () => {
    expect(new TextDecoder().decode(new Uint8Array(buffer, 0, 30))).toBe('git-card skyline @demo, millim');
  });

  it('stores normals that match the winding', () => {
    for (const [n, a, b, c] of tris) expect(dot(cross(sub(b, a), sub(c, a)), n)).toBeGreaterThan(0);
  });

  it('fits the plate and the tallest tower to the options', () => {
    const { pitch, margin, plate, height } = STL_DEFAULTS;
    const all = tris.flatMap(([, a, b, c]) => [a, b, c]);
    const axis = (k: number) => [Math.min(...all.map((v) => v[k])), Math.max(...all.map((v) => v[k]))];
    expect(axis(0)[0]).toBeCloseTo(-margin);
    expect(axis(0)[1]).toBeCloseTo(profile.weeks.length * pitch + margin);
    expect(axis(1)[1]).toBeCloseTo(7 * pitch + margin);
    expect(axis(2)[0]).toBe(0);
    expect(axis(2)[1]).toBeCloseTo(plate + height, 4);
  });

  it('sinks every tower into the plate and gives quiet days a printable height', () => {
    const [, ...towers] = skylineBoxes(profile);
    for (const [min, max] of towers) {
      expect(min[2]).toBeLessThan(STL_DEFAULTS.plate);
      expect(max[2] - STL_DEFAULTS.plate).toBeGreaterThanOrEqual(STL_DEFAULTS.minHeight - 1e-9);
    }
  });

  it('is just the plate for an empty year', () => {
    const empty = { ...profile, weeks: profile.weeks.map((w) => w.map((d) => ({ ...d, count: 0 }))), peakDay: null };
    expect(readStl(skylineStl(empty))).toHaveLength(12);
  });

  it('is named for the login and the year the calendar ends', () => {
    expect(stlFileName({ ...profile, login: 'OctoCat' })).toBe('octocat-skyline-2026.stl');
  });
});
