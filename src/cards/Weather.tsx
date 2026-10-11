// Weather drawn over the SVG skyline. Pure shapes and CSS keyframes on opacity and transform, so it animates in
// a README image. With no animation (OG images, reduced motion) every piece rests on a still frame that reads
// on its own: rain mid-fall, a bolt mid-strike, bursts open.

import type { Weather } from '../lib/weather';
import { seeded } from '../lib/seeded';

export type Pt = [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the weather needs to know about the city, all in card coordinates. */
export interface CityView {
  /** A point on the city grid (week, weekday) raised by h city units, in card coordinates. */
  at: (w: number, d: number, h?: number) => Pt;
  /** Card px per city unit. */
  scale: number;
  weeks: number;
  /** Roof centers of the towers, by date. Days with no tower are left out. */
  roofs: Map<string, Pt>;
  /** The peak day, if there is one. */
  peak: string | null;
  /** The card area the weather may draw in. */
  sky: Box;
  /** Unique per card, for clip path ids. */
  id: string;
  /** Seeds the scatter of stars and rain, so a city keeps the same sky between renders. */
  seed: string;
}

const r = (n: number) => Math.round(n * 10) / 10;
const pts = (list: Pt[]) => list.map(([x, y]) => `${r(x)},${r(y)}`).join(' ');

/** Where the back edge of the floor is at x: the horizon the sky ends at. */
function horizon(view: CityView) {
  const [x0, y0] = view.at(-1, -0.1);
  const [x1, y1] = view.at(view.weeks + 1, -0.1);
  return (x: number) => y0 + ((Math.min(Math.max(x, x0), x1) - x0) / (x1 - x0 || 1)) * (y1 - y0);
}

/** Behind the city: stars, the searchlight, clouds and the far fog. */
export function WeatherBack({ weather, view }: { weather: Weather; view: CityView }) {
  const { state } = weather;
  return (
    <g aria-hidden="true" clipPath={`url(#${view.id})`}>
      {state === 'clear' && (
        <>
          <Stars view={view} />
          <Searchlight view={view} />
        </>
      )}
      {state === 'fireworks' && <Stars view={view} count={18} />}
      {state === 'storm' && <Clouds view={view} />}
      {state === 'fog' && <Haze view={view} />}
    </g>
  );
}

/** On the sea tiles, under the towers, in city units: glints where the rain lands. */
export function WeatherGround({ weather, tiles, seed }: { weather: Weather; tiles: Pt[][]; seed: string }) {
  if (weather.state !== 'rain' && weather.state !== 'storm') return null;
  const rand = seeded(`${seed}:glint`);
  const picked = tiles.filter(() => rand() < 0.12).slice(0, 18);
  return (
    <g aria-hidden="true">
      {picked.map((top, i) => {
        const cx = top.reduce((n, p) => n + p[0], 0) / 4;
        const cy = top.reduce((n, p) => n + p[1], 0) / 4;
        const small = top.map(([x, y]): Pt => [cx + (x - cx) * 0.45, cy + (y - cy) * 0.45]);
        return <polygon key={i} className="gc-wx-glint" points={pts(small)} style={{ animationDelay: `${r(rand() * 3)}s` }} />;
      })}
    </g>
  );
}

/** In front of the city: rain, lightning, fog banks and fireworks. */
export function WeatherFront({ weather, view }: { weather: Weather; view: CityView }) {
  const { state } = weather;
  return (
    <g aria-hidden="true" clipPath={`url(#${view.id})`}>
      {state === 'rain' && <Rain view={view} />}
      {state === 'storm' && (
        <>
          <Rain view={view} heavy />
          <Lightning view={view} week={weather.week} />
        </>
      )}
      {state === 'fog' && <FogBanks view={view} />}
      {state === 'fireworks' && <Fireworks view={view} />}
    </g>
  );
}

/** The clip every weather layer shares. Goes in the card's defs. */
export function WeatherClip({ view }: { view: CityView }) {
  const { x, y, w, h } = view.sky;
  return (
    <clipPath id={view.id}>
      <rect x={x} y={y} width={w} height={h} />
    </clipPath>
  );
}

function Stars({ view, count = 34 }: { view: CityView; count?: number }) {
  const rand = seeded(`${view.seed}:stars`);
  const edge = horizon(view);
  const { x, y, w } = view.sky;
  const stars: { x: number; y: number; s: number; d: number }[] = [];
  for (let i = 0; i < count * 4 && stars.length < count; i++) {
    const sx = x + rand() * w;
    const room = edge(sx) - y - 14;
    const sy = y + 4 + rand() * room;
    const s = rand() < 0.25 ? 2 : 1.3;
    if (room > 12) stars.push({ x: sx, y: sy, s, d: rand() * 4 });
  }
  return (
    <g>
      {stars.map((star, i) => (
        <rect
          key={i}
          className="gc-wx-star"
          x={r(star.x)}
          y={r(star.y)}
          width={star.s}
          height={star.s}
          style={{ animationDelay: `${r(star.d)}s` }}
        />
      ))}
    </g>
  );
}

/** A beam from the peak tower's roof, sweeping slowly. */
function Searchlight({ view }: { view: CityView }) {
  const base = view.peak ? view.roofs.get(view.peak) : null;
  if (!base) return null;
  const [bx, by] = base;
  const len = by - view.sky.y + 40;
  const beam: Pt[] = [
    [bx - 1.2, by],
    [bx + 1.2, by],
    [bx + 0.3 * len, by - len],
    [bx + 0.12 * len, by - len],
  ];
  return <polygon className="gc-wx-beam" points={pts(beam)} style={{ transformOrigin: `${r(bx)}px ${r(by)}px` }} />;
}

/** Low, slow clouds along the top of the sky. */
function Clouds({ view }: { view: CityView }) {
  const rand = seeded(`${view.seed}:clouds`);
  const { x, y, w } = view.sky;
  return (
    <g className="gc-wx-cloud" filter="url(#gc-f-fog)">
      {Array.from({ length: 6 }, (_, i) => (
        <ellipse
          key={i}
          cx={r(x + ((i + 0.3 + rand() * 0.4) / 6) * w)}
          cy={r(y + 30 + rand() * 14)}
          rx={r(70 + rand() * 50)}
          ry={r(10 + rand() * 6)}
        />
      ))}
    </g>
  );
}

/** Thin diagonal streaks in two depths. Each layer repeats along its own slant, so the loop has no seam. */
function Rain({ view, heavy = false }: { view: CityView; heavy?: boolean }) {
  const { x, y, w, h } = view.sky;
  const layers = [
    { period: 38, len: 9, per: heavy ? 16 : 11, className: 'gc-wx-rain gc-wx-rain-far' },
    { period: 54, len: 15, per: heavy ? 12 : 8, className: 'gc-wx-rain gc-wx-rain-near' },
  ];
  const slant = 0.25;
  return (
    <g>
      {layers.map((layer, l) => {
        const rand = seeded(`${view.seed}:rain${l}`);
        const rows = Math.ceil(h / layer.period) + 1;
        const span = w + rows * layer.period * slant + 40;
        const tile = Array.from({ length: Math.round((span / 760) * layer.per * 4) }, () => ({
          x: x - 20 + rand() * span,
          y: rand() * layer.period,
        }));
        const streaks = [];
        for (let row = -1; row < rows; row++) {
          for (const drop of tile) {
            const sx = drop.x - row * layer.period * slant;
            const sy = y + row * layer.period + drop.y;
            streaks.push(`M${r(sx)},${r(sy)}l${r(-layer.len * slant)},${layer.len}`);
          }
        }
        return <path key={l} className={layer.className} d={streaks.join('')} />;
      })}
    </g>
  );
}

/** A bolt onto the busiest roof of the week, and the sky flashing with it. */
function Lightning({ view, week }: { view: CityView; week: string[] }) {
  const { x, y, w, h } = view.sky;
  const roofs = week.map((date) => view.roofs.get(date)).filter((p): p is Pt => !!p);
  const target = roofs.reduce<Pt | null>((top, p) => (!top || p[1] < top[1] ? p : top), null) ?? [x + w * 0.75, y + h * 0.6];
  const [tx, ty] = target;
  const start: Pt = [tx + 26, y];
  const steps = 6;
  const bolt: Pt[] = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const jag = i === 0 || i === steps ? 0 : i % 2 ? -10 : 8;
    return [start[0] + (tx - start[0]) * t + jag, start[1] + (ty - 2 - start[1]) * t];
  });
  const fork = bolt[2];
  const branch: Pt[] = [fork, [fork[0] + 14, fork[1] + 12], [fork[0] + 10, fork[1] + 24], [fork[0] + 22, fork[1] + 36]];
  return (
    <g>
      <rect className="gc-wx-flash" x={x} y={y} width={w} height={h} />
      <g className="gc-wx-bolt gc-glow">
        <polyline points={pts(bolt)} fill="none" strokeWidth={2.2} strokeLinejoin="bevel" />
        <polyline points={pts(branch)} fill="none" strokeWidth={1.2} strokeLinejoin="bevel" />
      </g>
    </g>
  );
}

/** Flat banks of fog lying along the weekday rows, low over the sea and the lower floors. */
function FogBanks({ view }: { view: CityView }) {
  const banks = [
    { d: -0.4, lift: 4, depth: 2.2 },
    { d: 2.2, lift: 10, depth: 2.4 },
    { d: 4.8, lift: 6, depth: 2.6 },
  ];
  return (
    <g filter="url(#gc-f-fog)">
      {banks.map(({ d, lift, depth }, i) => {
        const band: Pt[] = [
          view.at(-3, d, lift / view.scale),
          view.at(view.weeks + 3, d, lift / view.scale),
          view.at(view.weeks + 3, d + depth, lift / view.scale),
          view.at(-3, d + depth, lift / view.scale),
        ];
        return <polygon key={i} className="gc-wx-fog" points={pts(band)} style={{ animationDelay: `${-i * 3}s` }} />;
      })}
    </g>
  );
}

/** A soft band of haze along the horizon, behind the towers. */
function Haze({ view }: { view: CityView }) {
  const a = view.at(-3, -0.4);
  const b = view.at(view.weeks + 3, -0.4);
  const rise = 46;
  const band: Pt[] = [a, b, [b[0], b[1] - rise], [a[0], a[1] - rise]];
  return (
    <g filter="url(#gc-f-fog)">
      <polygon className="gc-wx-fog gc-wx-haze" points={pts(band)} />
    </g>
  );
}

const BURSTS = ['gc-accent-s', 'gc-data-s', 'gc-hot-s'];

/** Bursts over the newest weeks, one after another, each clear of the roofs below it. */
function Fireworks({ view }: { view: CityView }) {
  const rand = seeded(`${view.seed}:fireworks`);
  const { x, y, w } = view.sky;
  const roofs = [...view.roofs.values()];
  const right = view.at(view.weeks - 1, 3);
  // Three in a row over the newest weeks, pulled in from the edge so none is cut off.
  const mid = Math.min(right[0] - 60, x + w - 120);
  const centers: Pt[] = [-1, 0, 1].map((k) => {
    const cx = mid + k * 70;
    const below = Math.min(right[1], ...roofs.filter((p) => Math.abs(p[0] - cx) < 36).map((p) => p[1]));
    return [cx, Math.max(y + 34, below - 44 - (k === 0 ? 22 : 0))];
  });
  return (
    <g>
      {centers.map(([cx, cy], i) => {
        const size = 22 + rand() * 10;
        // Rays at 15 + 30k degrees: never perfectly flat or upright, which the glow filter would clip away.
        const rays = Array.from({ length: 12 }, (_, k) => {
          const a = ((15 + k * 30) * Math.PI) / 180;
          return `M${r(cx + Math.cos(a) * size * 0.35)},${r(cy + Math.sin(a) * size * 0.35)}L${r(cx + Math.cos(a) * size)},${r(cy + Math.sin(a) * size)}`;
        }).join('');
        return (
          <g key={i} className="gc-wx-burst" style={{ animationDelay: `${i * 0.9}s` }}>
            <path className={`${BURSTS[i % BURSTS.length]} gc-glow`} d={rays} strokeWidth={1.6} strokeLinecap="round" fill="none" />
          </g>
        );
      })}
    </g>
  );
}
