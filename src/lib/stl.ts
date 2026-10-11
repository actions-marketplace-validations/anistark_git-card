// A 3D printable skyline: one box per active day on a base plate, written as binary STL by hand. Boxes on a plate
// need nothing from three.js, so this works without WebGL and stays small. Units are millimetres, z is up.

import { skylineCells } from '../cards/levels';
import type { Profile } from './profile';

export interface StlOptions {
  /** Distance between day centres. */
  pitch: number;
  /** Share of the pitch a tower covers, so neighbours have a gap between them like on screen. */
  fill: number;
  /** Tallest tower above the plate. */
  height: number;
  /** Shortest tower for any day with a contribution, so a quiet day still prints. */
  minHeight: number;
  /** Base plate thickness, and its margin around the grid. */
  plate: number;
  margin: number;
  /** How far towers sink into the plate, so slicers see one solid instead of faces that only touch. */
  sink: number;
}

export const STL_DEFAULTS: StlOptions = { pitch: 2.5, fill: 0.84, height: 25, minHeight: 0.6, plate: 3, margin: 4, sink: 0.05 };

type V = [number, number, number];

/** Bytes per triangle in binary STL: a normal and three vertices as float32, then a uint16 attribute. */
const TRIANGLE_BYTES = 50;
const HEADER_BYTES = 84;

/**
 * The 12 triangles of an axis-aligned box, each as [normal, a, b, c], wound counter-clockwise seen from outside so
 * the normal points out.
 */
export function boxTriangles([x0, y0, z0]: V, [x1, y1, z1]: V): [V, V, V, V][] {
  const p = (x: number, y: number, z: number): V => [x, y, z];
  const quad = (n: V, a: V, b: V, c: V, d: V): [V, V, V, V][] => [
    [n, a, b, c],
    [n, a, c, d],
  ];
  return [
    ...quad([0, 0, -1], p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)), // bottom
    ...quad([0, 0, 1], p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)), // top
    ...quad([0, -1, 0], p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)), // front
    ...quad([0, 1, 0], p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)), // back
    ...quad([-1, 0, 0], p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)), // left
    ...quad([1, 0, 0], p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)), // right
  ];
}

/** Every box in the model as [min, max] corners: the plate first, then one tower per active day. */
export function skylineBoxes(profile: Profile, options: Partial<StlOptions> = {}): [V, V][] {
  const o = { ...STL_DEFAULTS, ...options };
  const cells = skylineCells(profile);
  const weeks = profile.weeks.length;
  const inset = (o.pitch * (1 - o.fill)) / 2;
  const boxes: [V, V][] = [
    [
      [-o.margin, -o.margin, 0],
      [weeks * o.pitch + o.margin, 7 * o.pitch + o.margin, o.plate],
    ],
  ];
  for (const [w, d, count, , height] of cells) {
    if (count <= 0) continue;
    // Weeks run left to right. Sunday sits at the back, like the 3D view seen from the front.
    const x = w * o.pitch + inset;
    const y = (6 - d) * o.pitch + inset;
    const h = o.minHeight + height * (o.height - o.minHeight);
    boxes.push([
      [x, y, o.plate - o.sink],
      [x + o.pitch * o.fill, y + o.pitch * o.fill, o.plate + h],
    ]);
  }
  return boxes;
}

/** The skyline as a binary STL file. */
export function skylineStl(profile: Profile, options: Partial<StlOptions> = {}): ArrayBuffer {
  const boxes = skylineBoxes(profile, options);
  const count = boxes.length * 12;
  const buffer = new ArrayBuffer(HEADER_BYTES + count * TRIANGLE_BYTES);
  const view = new DataView(buffer);
  const header = `git-card skyline @${profile.login}, millimetres`.slice(0, 80);
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
  view.setUint32(80, count, true);
  let at = HEADER_BYTES;
  for (const [min, max] of boxes) {
    for (const triangle of boxTriangles(min, max)) {
      for (const v of triangle) {
        for (const n of v) {
          view.setFloat32(at, n, true);
          at += 4;
        }
      }
      at += 2; // attribute byte count, left at 0
    }
  }
  return buffer;
}

/** "anistark-skyline-2026.stl", named for the year the calendar ends in. */
export function stlFileName(profile: Profile): string {
  const last = profile.weeks.at(-1)?.at(-1)?.date ?? profile.fetchedAt;
  return `${profile.login.toLowerCase()}-skyline-${last.slice(0, 4)}.stl`;
}
