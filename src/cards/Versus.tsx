import { citizenOf } from '../lib/citizen';
import type { Profile } from '../lib/profile';
import { hasCalendar } from '../lib/profile';
import type { Side, Versus } from '../lib/versus';
import { maxChars, Neon, PAD, SIZES, Shell, truncate } from './shell';
import { SkylineCity } from './Skyline';
import type { Theme } from './style';

export interface VersusProps {
  a: Profile;
  b: Profile;
  result: Versus;
  theme?: Theme;
  standalone?: boolean;
  /** A calendar is still on its way, so the result is pending rather than offline. */
  calendarLoading?: boolean;
}

const CITY = { w: 280, top: 150, h: 150 };

/** Two cities facing each other across the sea, the categories between them and the verdict underneath. */
export function VersusCard({ a, b, result, theme, standalone, calendarLoading }: VersusProps) {
  const { width } = SIZES.wide;
  const right = width - PAD;
  const mid = width / 2;
  const nameW = mid - PAD - 48;
  const side = (s: Side) => (s === 'a' ? a : b);
  const tone = (s: Side) => (result.winner === s ? 'gc-accent' : 'gc-fg');
  const sub = (s: Side) => {
    const p = side(s);
    const rank = result.ranks[s];
    return `${rank.complete ? rank.tier.name : '?'} // ${citizenOf(p, rank).role.name.toUpperCase()}`;
  };
  const pending = result.outcome === 'pending';
  const verdict = pending
    ? calendarLoading
      ? 'Scanning calendars. The result lands with them.'
      : 'A calendar is offline, so there is no result yet.'
    : result.verdict;

  // Which way each category's arrow points, toward the side that leads it.
  // y is the label's baseline: a draw gets a short bar under it, a lead an arrow beside it on the leader's side.
  const arrow = (winner: Side | null, y: number) => {
    const reach = 78;
    if (!winner) return <rect className="gc-muted" x={mid - 7} y={y + 10} width={14} height={3} />;
    const dir = winner === 'a' ? -1 : 1;
    const tip = mid + dir * reach;
    const cy = y - 4;
    return <polygon className="gc-accent gc-glow" points={`${tip},${cy} ${tip - dir * 10},${cy - 5.5} ${tip - dir * 10},${cy + 5.5}`} />;
  };

  const city = (p: Profile) =>
    hasCalendar(p) ? (
      <SkylineCity profile={p} box={{ x: PAD, y: CITY.top, w: CITY.w, h: CITY.h }} signs={false} />
    ) : (
      <text
        className="gc-muted gc-d"
        x={PAD + CITY.w / 2}
        y={CITY.top + CITY.h / 2}
        textAnchor="middle"
        fontSize={13}
        letterSpacing="0.16em"
      >
        {calendarLoading ? 'SCANNING' : 'CALENDAR OFFLINE'}
      </text>
    );

  return (
    <Shell
      profile={a}
      theme={theme}
      standalone={standalone}
      id="versus"
      tag="VS"
      size="wide"
      eyebrow="Versus"
      label={`@${a.login} versus @${b.login}${verdict ? `. ${verdict}` : ''}`}
      footer={`@${a.login} vs @${b.login}`}
    >
      {/* The two contenders, mirrored around the middle. */}
      <g className="gc-a-rise">
        <Neon className={`${tone('a')} gc-d`} x={PAD} y={100} fontSize={28} fontWeight={700} split={1.5}>
          {truncate((a.name || a.login).toUpperCase(), maxChars(nameW, 28))}
        </Neon>
        <text className="gc-muted gc-d" x={PAD} y={124} fontSize={13} fontWeight={600} letterSpacing="0.14em">
          {sub('a')}
        </text>
        <Neon className={`${tone('b')} gc-d`} x={right} y={100} fontSize={28} fontWeight={700} split={1.5} textAnchor="end">
          {truncate((b.name || b.login).toUpperCase(), maxChars(nameW, 28))}
        </Neon>
        <text className="gc-muted gc-d" x={right} y={124} fontSize={13} fontWeight={600} letterSpacing="0.14em" textAnchor="end">
          {sub('b')}
        </text>
        <Neon className="gc-hot gc-d" x={mid} y={112} fontSize={40} fontWeight={700} textAnchor="middle" split={2.5}>
          VS
        </Neon>
      </g>

      {/* Cities: a as it is, b mirrored, so their newest weeks meet in the middle. */}
      {city(a)}
      <g transform={`translate(${width} 0) scale(-1 1)`}>{city(b)}</g>

      {/* Categories between the cities, each arrow pointing at the side that leads it. */}
      {result.categories.map((c, i) => {
        const y = 182 + i * 38;
        return (
          <g key={c.key} className="gc-a-fade" style={{ animationDelay: `${400 + i * 120}ms` }}>
            <text className="gc-fg gc-d" x={mid} y={y} fontSize={11} fontWeight={700} letterSpacing="0.14em" textAnchor="middle">
              {c.label.toUpperCase()}
            </text>
            {arrow(pending ? null : c.winner, y)}
          </g>
        );
      })}

      <text
        className={`${pending ? 'gc-muted' : 'gc-accent'} gc-d`}
        x={mid}
        y={334}
        fontSize={16}
        fontWeight={700}
        letterSpacing="0.06em"
        textAnchor="middle"
      >
        {truncate(verdict.toUpperCase(), maxChars(right - PAD, 16))}
      </text>
    </Shell>
  );
}
