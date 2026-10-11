import type { ReactNode, SVGProps } from 'react';
import type { Profile } from '../lib/profile';
import { LOGO_LARGE, LOGO_RATIO, LOGO_SMALL } from '../brand/logo-data';
import { standaloneCss, type Theme } from './style';

const LOGO_H = 20;

/**
 * The GIT CARD logo, embedded, so it shows in README images and PNG previews too. In day mode it sits
 * on a dark plate, because its yellow half disappears on the yellow card.
 */
export function Logo({ x, y, height, large = false }: { x: number; y: number; height: number; large?: boolean }) {
  const width = height * LOGO_RATIO;
  const pad = height * 0.2;
  return (
    <g aria-hidden="true">
      <rect className="gc-logo-plate" x={x - pad} y={y - pad} width={width + pad * 2} height={height + pad * 2} rx={pad} />
      <image href={large ? LOGO_LARGE : LOGO_SMALL} x={x} y={y} width={width} height={height} />
    </g>
  );
}

export interface CardProps {
  profile: Profile;
  theme?: Theme;
  /** True when the SVG is served on its own (an <img> in a README). It then carries its own tokens. */
  standalone?: boolean;
  /** The calendar is still on its way: calendar cards show a scanning state instead of saying it is offline. */
  calendarLoading?: boolean;
  /** Weather over the skyline. On unless set to false. */
  weather?: boolean;
}

export const SIZES = {
  standard: { width: 572, height: 400 },
  wide: { width: 760, height: 400 },
} as const;

export type CardSize = keyof typeof SIZES;

export const PAD = 32;
const CUT = 22; // chamfer on the top-right and bottom-left corners

interface ShellProps extends CardProps {
  id: string;
  /** Short HUD code shown top right, like SKY or LNG. */
  tag: string;
  size: CardSize;
  eyebrow: string;
  label: string;
  children: ReactNode;
}

/** Glow and fog filters and the scanline pattern. Ids are fixed: identical in every card, so duplicates on one page resolve to the same thing. */
export function SharedDefs() {
  return (
    <>
      <filter id="gc-f-glow" x="-30%" y="-60%" width="160%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="wide" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="tight" />
        <feMerge>
          <feMergeNode in="wide" />
          <feMergeNode in="tight" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="gc-f-fog" x="-10%" y="-80%" width="120%" height="260%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <pattern id="gc-p-scan" width="4" height="3" patternUnits="userSpaceOnUse">
        <rect className="gc-scanfill" width="4" height="1" />
      </pattern>
    </>
  );
}

export function chamfer(w: number, h: number, inset = 0.5, cut = CUT) {
  const [l, t, r, b] = [inset, inset, w - inset, h - inset];
  return `M${l},${t} H${r - cut} L${r},${t + cut} V${b} H${l + cut} L${l},${b - cut} Z`;
}

export function Shell({ id, tag, size, eyebrow, label, profile, theme = 'auto', standalone, children }: ShellProps) {
  const { width, height } = SIZES[size];
  const titleId = `gc-title-${id}-${profile.login}`;
  const bleedId = `gc-bleed-${id}-${profile.login}`;
  const clipId = `gc-clip-${id}-${profile.login}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={standalone ? width : undefined}
      height={standalone ? height : undefined}
      className="gc"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{label}</title>
      {standalone && <style dangerouslySetInnerHTML={{ __html: standaloneCss(theme) }} />}
      <defs>
        <SharedDefs />
        <radialGradient id={bleedId} cx="100%" cy="0%" r="80%">
          <stop offset="0%" className="gc-bleed" />
          <stop offset="60%" className="gc-bleed" style={{ stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={chamfer(width, height, 0)} />
        </clipPath>
      </defs>

      <path className="gc-bg" d={chamfer(width, height)} />
      <rect width={width} height={height} fill={`url(#${bleedId})`} clipPath={`url(#${clipId})`} />

      {/* HUD trim: a thick bar on the top-left edge, a line inside the top-right cut, a tab bottom right. */}
      <rect className="gc-accent" x={0} y={0} width={72} height={3} />
      <path className="gc-accent-s" d={`M${width - CUT - 10},6 L${width - 6},${CUT + 10}`} strokeWidth={2} fill="none" />
      <rect className="gc-accent" x={width - 40} y={height - 3} width={40} height={3} />

      <g className="gc-a-boot">
        <rect className="gc-accent" x={PAD} y={PAD + 1} width={4} height={13} />
        <text className="gc-eyebrow gc-d" x={PAD + 14} y={PAD + 12}>
          {eyebrow.toUpperCase()}
        </text>
        <text className="gc-muted gc-d" x={width - PAD - CUT + 8} y={PAD + 12} fontSize={13} letterSpacing="0.12em" textAnchor="end">
          //{tag}
        </text>
        {children}
        <text className="gc-muted" x={PAD + CUT - 8} y={height - 22} fontSize={14}>
          @{profile.login}
        </text>
        <Logo x={width - PAD - LOGO_H * LOGO_RATIO} y={height - 22 - 15} height={LOGO_H} />
      </g>

      {/* Scanlines over everything, clipped to the frame. */}
      <rect width={width} height={height} fill="url(#gc-p-scan)" clipPath={`url(#${clipId})`} pointerEvents="none" />
    </svg>
  );
}

interface NeonProps extends Omit<SVGProps<SVGTextElement>, 'children'> {
  children: ReactNode;
  /** Pixel offset of the green and cyan ghost copies. */
  split?: number;
}

/** Text with an RGB split and glow. The ghost copies jitter now and then, like a bad signal. */
export function Neon({ children, split = 2, className = '', x = 0, ...rest }: NeonProps) {
  const nx = Number(x);
  return (
    <g>
      <text {...rest} x={nx - split} className={`${className} gc-rgb-r`} aria-hidden="true">
        {children}
      </text>
      <text {...rest} x={nx + split} className={`${className} gc-rgb-c`} aria-hidden="true">
        {children}
      </text>
      <text {...rest} x={nx} className={`${className} gc-glow`}>
        {children}
      </text>
    </g>
  );
}

interface MeterProps {
  x: number;
  y: number;
  width: number;
  /** 0-1 */
  fill: number;
  delay?: number;
}

/** A segmented HUD meter: a thick dashed line, so it reads as cells rather than a smooth bar. */
export function Meter({ x, y, width, fill, delay = 0 }: MeterProps) {
  return (
    <g>
      <line className="gc-track-s" x1={x} x2={x + width} y1={y} y2={y} strokeWidth={8} strokeDasharray="5 2" />
      <line
        className="gc-data-s gc-a-grow"
        x1={x}
        x2={x + Math.max(5, width * fill)}
        y1={y}
        y2={y}
        strokeWidth={8}
        strokeDasharray="5 2"
        style={{ animationDelay: `${delay}ms` }}
      />
    </g>
  );
}

/** In place of calendar-based content when the contribution calendar could not be loaded. */
/** Stands in for calendar-based art: a scanning state while the calendar loads, or a notice that it could not. */
export function CalendarOffline({ width, height, note, loading }: { width: number; height: number; note?: string; loading?: boolean }) {
  const cells = 9;
  return (
    <g className="gc-a-fade">
      <text
        className="gc-accent gc-d"
        x={width / 2}
        y={height / 2 - 4}
        textAnchor="middle"
        fontSize={20}
        fontWeight={700}
        letterSpacing="0.16em"
      >
        {loading ? 'SCANNING CALENDAR' : 'CALENDAR OFFLINE'}
      </text>
      <text className="gc-muted" x={width / 2} y={height / 2 + 24} textAnchor="middle" fontSize={14}>
        {loading ? 'Contribution data is on its way.' : (note ?? 'The contribution calendar could not be loaded. Refresh in a minute.')}
      </text>
      {loading && (
        <g aria-hidden="true">
          {Array.from({ length: cells }, (_, i) => (
            <rect
              key={i}
              className="gc-data gc-a-blink"
              x={width / 2 - (cells * 14) / 2 + i * 14 + 2}
              y={height / 2 + 44}
              width={10}
              height={6}
              style={{ animationDelay: `${i * 110}ms` }}
            />
          ))}
        </g>
      )}
    </g>
  );
}

export { fmt, maxChars, monthName, shortDate, truncate, WEEKDAYS, wrap } from '../lib/format';
