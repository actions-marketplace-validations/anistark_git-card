import { findEggs, MAX_SIGNS, signEggs, type Egg } from '../lib/eggs';
import { hasCalendar, type Profile } from '../lib/profile';
import { weatherFor, type Weather } from '../lib/weather';
import { heightOf, leveller, skylineFill } from './levels';
import { CalendarOffline, PAD, SIZES, Shell, shortDate, type CardProps } from './shell';
import { WeatherBack, WeatherClip, WeatherFront, WeatherGround, type Box, type CityView } from './Weather';

// Oblique projection: weeks run right and slightly down, weekdays run left and down, height is up.
const W = { x: 10, y: 2.4 };
const D = { x: -6.5, y: 5.2 };
const FILL = 0.82;
const MAX_H = 95;
// Rooftop neon sign for an easter egg, in city units.
const SIGN = { h: 11, rise: 12, char: 4.6, pad: 7, gap: 3 };

type Pt = [number, number];
const centerOf = (quad: Pt[]): Pt => [quad.reduce((n, p) => n + p[0], 0) / 4, quad.reduce((n, p) => n + p[1], 0) / 4];
const r = (n: number) => Math.round(n * 10) / 10;
const pts = (list: Pt[]) => list.map(([x, y]) => `${r(x)},${r(y)}`).join(' ');

interface CityProps {
  profile: Profile;
  /** The box the city is scaled to fit and centered in. */
  box: Box;
  /** Stagger each week in with a CSS animation. */
  animate?: boolean;
  /** Weather to draw over the city, and the area it may fill. Defaults to the box. */
  weather?: Weather | null;
  sky?: Box;
}

/** The isometric city itself: one block per day on a grid floor. Shared by the skyline card and the OG image. */
export function SkylineCity({ profile, box, animate = true, weather, sky = box }: CityProps) {
  const level = leveller(profile);
  const max = profile.peakDay?.count ?? 0;
  const weeks = profile.weeks.length;

  const columns = profile.weeks.map((week, w) =>
    week.map((day) => {
      const px = w * W.x + day.weekday * D.x;
      const py = w * W.y + day.weekday * D.y;
      const a: Pt = [px, py];
      const b: Pt = [px + FILL * W.x, py + FILL * W.y];
      const c: Pt = [b[0] + FILL * D.x, b[1] + FILL * D.y];
      const e: Pt = [px + FILL * D.x, py + FILL * D.y];
      const h = day.count > 0 ? 2 + heightOf(day.count, max) * MAX_H : 0;
      const up = ([x, y]: Pt): Pt => [x, y - h];
      return { day, level: level(day), h, top: [up(a), up(b), up(c), up(e)], right: [b, c, up(c), up(b)], front: [e, c, up(c), up(e)] };
    }),
  );

  const signs = placeSigns(findEggs(profile), columns.flat());
  const all = [
    ...columns.flat().flatMap((col) => [...col.top, ...col.right, ...col.front]),
    ...signs.flatMap((s): Pt[] => [
      [s.x, s.y],
      [s.x + s.w, s.y],
    ]),
  ] as Pt[];
  if (!all.length) return null; // no calendar: nothing to draw, and no bounds to fit
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(box.w / (maxX - minX || 1), box.h / (maxY - minY || 1));
  const tx = box.x + (box.w - (maxX - minX) * scale) / 2 - minX * scale;
  const ty = box.y + (box.h - (maxY - minY) * scale) / 2 - minY * scale;

  // Floor line between two (week, weekday) grid points, in the same projection as the buildings.
  const at = ([w, d]: Pt): Pt => [w * W.x + d * D.x, w * W.y + d * D.y];
  const seg = (a: Pt, b: Pt) => {
    const [[x1, y1], [x2, y2]] = [at(a), at(b)];
    return { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2) };
  };

  // The same transform the city groups apply, so weather can draw in card coordinates around the city.
  const k = r(scale * 100) / 100;
  const transform = `translate(${r(tx)} ${r(ty)}) scale(${k})`;
  const screen = ([x, y]: Pt): Pt => [r(tx) + x * k, r(ty) + y * k];
  const view: CityView | null = weather
    ? {
        at: (w, d, h = 0) => screen([w * W.x + d * D.x, w * W.y + d * D.y - h]),
        scale: k,
        weeks,
        roofs: new Map(columns.flat().flatMap((c): [string, Pt][] => (c.h > 0 ? [[c.day.date, screen(centerOf(c.top))]] : []))),
        peak: profile.peakDay?.date ?? null,
        sky,
        id: `gc-wx-${profile.login}`,
        seed: profile.login.toLowerCase(),
      }
    : null;
  const fade = animate ? 'gc-a-fade' : undefined;

  return (
    <g>
      {weather && view && (
        <g className={fade}>
          <defs>
            <WeatherClip view={view} />
          </defs>
          <WeatherBack weather={weather} view={view} />
        </g>
      )}
      <g className="gc-sk" transform={transform}>
        {/* Grid floor: lines along each weekday row and every fourth week. */}
        <g className="gc-accent-s" strokeWidth={0.6} opacity={0.35}>
          {Array.from({ length: 8 }, (_, d) => (
            <line key={`d${d}`} {...seg([-1, d - 0.1], [weeks + 1, d - 0.1])} />
          ))}
          {Array.from({ length: Math.ceil(weeks / 4) + 2 }, (_, i) => (
            <line key={`w${i}`} {...seg([i * 4 - 1, -0.1], [i * 4 - 1, 6.9])} />
          ))}
        </g>
        {/* Sea first: flat tiles on the ground can never hide a building. Grouped by week so a wave can sweep across. */}
        <g className={animate ? 'gc-a-fade' : undefined}>
          {columns.map((col, w) => (
            <g key={w} className={animate ? 'gc-wave' : undefined} style={animate ? { animationDelay: `${w * 60}ms` } : undefined}>
              {col
                .filter((c) => c.level === 0)
                .map(({ day, top }) => (
                  <polygon key={day.date} className="gc-sea" points={pts(top)}>
                    <title>{`0 on ${shortDate(day.date)}`}</title>
                  </polygon>
                ))}
            </g>
          ))}
        </g>
        {weather && (
          <WeatherGround
            weather={weather}
            tiles={columns.flat().flatMap((c) => (c.level === 0 ? [c.top] : []))}
            seed={profile.login.toLowerCase()}
          />
        )}
        {columns.map((col, w) => (
          <g key={w} className={animate ? 'gc-a-rise' : undefined} style={animate ? { animationDelay: `${w * 12}ms` } : undefined}>
            {col
              .filter((c) => c.level > 0)
              .map(({ day, level: l, h, top, right, front }) => (
                <g key={day.date} className={l === 5 ? 'gc-glow' : undefined}>
                  <title>{`${day.count} on ${shortDate(day.date)}`}</title>
                  {h > 0 && <polygon className={`r ${skylineFill(l)}`} points={pts(right)} />}
                  {h > 0 && <polygon className={`f ${skylineFill(l)}`} points={pts(front)} />}
                  <polygon className={skylineFill(l)} points={pts(top)} />
                </g>
              ))}
          </g>
        ))}
      </g>
      {weather && view && (
        <g className={fade}>
          <WeatherFront weather={weather} view={view} />
        </g>
      )}
      {signs.length > 0 && (
        <g transform={transform}>
          <g className={animate ? 'gc-a-fade' : undefined} style={animate ? { animationDelay: '1.2s' } : undefined}>
            {signs.map(({ egg, x, y, w, roof }, i) => (
              <g key={egg.key}>
                <title>{`${egg.label}: ${shortDate(egg.date)} ${egg.date.slice(0, 4)}`}</title>
                <line className="gc-accent-s" x1={r(x + w / 2)} y1={r(roof)} x2={r(x + w / 2)} y2={r(y + SIGN.h)} strokeWidth={0.8} />
                <g className={animate ? 'gc-glow gc-a-flicker' : 'gc-glow'} style={animate ? { animationDelay: `${i * 1.7}s` } : undefined}>
                  <rect className="gc-sign" x={r(x)} y={r(y)} width={r(w)} height={SIGN.h} strokeWidth={0.8} />
                  <text
                    className="gc-accent gc-d"
                    x={r(x + w / 2)}
                    y={r(y + 8)}
                    fontSize={7}
                    fontWeight={700}
                    letterSpacing="0.06em"
                    textAnchor="middle"
                  >
                    {egg.sign}
                  </text>
                </g>
              </g>
            ))}
          </g>
        </g>
      )}
    </g>
  );
}

interface Sign {
  egg: Egg & { sign: string; date: string };
  /** Top-left of the sign, and the roof it stands on, in city units. */
  x: number;
  y: number;
  w: number;
  roof: number;
}

/** Signs for the rarest eggs, each on its day's roof, skipping any that would overlap one already placed. */
function placeSigns(eggs: Egg[], cells: { day: { date: string }; h: number; top: Pt[] }[]): Sign[] {
  const byDate = new Map(cells.map((c) => [c.day.date, c]));
  const placed: Sign[] = [];
  for (const egg of signEggs(eggs)) {
    const cell = byDate.get(egg.date);
    if (!cell || cell.h === 0) continue;
    const cx = cell.top.reduce((n, p) => n + p[0], 0) / 4;
    const roof = cell.top.reduce((n, p) => n + p[1], 0) / 4;
    const w = egg.sign.length * SIGN.char + SIGN.pad;
    const sign = { egg, x: cx - w / 2, y: roof - SIGN.rise - SIGN.h, w, roof };
    const clash = placed.some((o) => Math.abs(o.x + o.w / 2 - cx) < (o.w + w) / 2 + SIGN.gap && Math.abs(o.y - sign.y) < SIGN.h + SIGN.gap);
    if (!clash) placed.push(sign);
    if (placed.length === MAX_SIGNS) break;
  }
  return placed;
}

/** The isometric SVG skyline. Doubles as the README image and the no-JS fallback for the 3D one. */
export function SkylineCard(props: CardProps) {
  const { profile } = props;
  const { width, height } = SIZES.wide;
  const first = profile.weeks[0]?.[0]?.date;
  const last = profile.weeks.at(-1)?.at(-1)?.date;
  const weather = props.weather === false || props.calendarLoading ? null : weatherFor(profile);

  return (
    <Shell
      {...props}
      id="skyline"
      tag="SKY"
      size="wide"
      eyebrow="Contribution skyline"
      label={`Contribution skyline: ${profile.totals.contributions} contributions in the last year${weather ? `. Forecast: ${weather.label}` : ''}`}
    >
      {first && last && (
        <text className="gc-muted" x={PAD} y={PAD + 36} fontSize={13}>
          {shortDate(first)} {first.slice(0, 4)} to {shortDate(last)} {last.slice(0, 4)}
        </text>
      )}
      {weather && (
        <text className="gc-muted" x={width - PAD} y={PAD + 36} fontSize={13} textAnchor="end">
          <title>{weather.reason}</title>
          Forecast: <tspan className="gc-fg">{weather.label}</tspan>
        </text>
      )}
      {hasCalendar(profile) ? (
        <SkylineCity
          profile={profile}
          box={{ x: PAD, y: 92, w: width - PAD * 2, h: height - 92 - 52 }}
          weather={weather}
          sky={{ x: 1, y: 76, w: width - 2, h: height - 76 - 46 }}
        />
      ) : (
        <CalendarOffline width={width} height={height} loading={props.calendarLoading} />
      )}
    </Shell>
  );
}
