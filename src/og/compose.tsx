// Link preview (Open Graph) images, composed as SVG from the same pieces as the cards and rasterized by resvg.
// Everything here must stay inside what resvg supports: class selectors, plain colors, basic filters.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCard, type CardId } from '../cards/registry';
import { chamfer, fmt, Logo, maxChars, Neon, SharedDefs, truncate } from '../cards/shell';
import { SkylineCity } from '../cards/Skyline';
import { VersusCard } from '../cards/Versus';
import { CARD_CSS } from '../cards/style';
import type { Profile } from '../lib/profile';
import { formatStanding, rankProfile } from '../lib/rank';
import { compare } from '../lib/versus';
import { flattenCss } from './flatten';

export const OG = { width: 1200, height: 630 } as const;
const M = 64; // outer margin

const OG_CSS = `
.og-bg{fill:var(--bg);}
.og-floor{stroke:var(--data);}
.og-horizon{fill:var(--accent);}
.og-frame{fill:none;stroke:var(--line);}
.og-tint{fill:var(--signal);}
`;

let css: string | undefined;
const stylesheet = () => (css ??= flattenCss('dark', CARD_CSS + OG_CSS));

/** Perspective grid floor that recedes to a glowing horizon, like the landing page. */
function Floor({ horizon }: { horizon: number }) {
  const { width, height } = OG;
  const vx = width / 2;
  const rows = Array.from({ length: 9 }, (_, i) => horizon + Math.pow(i / 8, 2.2) * (height - horizon));
  const cols = Array.from({ length: 25 }, (_, i) => (i - 12) * 160);
  return (
    <g>
      <g className="og-floor" strokeWidth={1} opacity={0.32}>
        {rows.map((y) => (
          <line key={`r${y}`} x1={0} x2={width} y1={y} y2={y} />
        ))}
        {cols.map((dx) => (
          <line key={`c${dx}`} x1={vx + dx * 0.08} y1={horizon} x2={vx + dx * 1.6} y2={height} />
        ))}
      </g>
      <rect className="og-horizon gc-glow" x={0} y={horizon - 1} width={width} height={2} />
    </g>
  );
}

/** Shared chrome: background, floor, HUD frame, logo, scanlines. */
function Frame({ right, horizon = 500, children }: { right: string; horizon?: number; children: ReactNode }) {
  const { width, height } = OG;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="gc">
      <style dangerouslySetInnerHTML={{ __html: stylesheet() }} />
      <defs>
        <SharedDefs />
        <radialGradient id="og-bleed" cx="100%" cy="0%" r="75%">
          <stop offset="0%" className="gc-bleed" />
          <stop offset="60%" className="gc-bleed" style={{ stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <rect className="og-bg" width={width} height={height} />
      <rect width={width} height={height} fill="url(#og-bleed)" />
      <Floor horizon={horizon} />

      <path className="og-frame" d={chamfer(width - 32, height - 32, 0.5, 28)} transform="translate(16 16)" strokeWidth={1.5} />
      <rect className="gc-accent" x={16} y={16} width={120} height={4} />
      <rect className="gc-accent" x={width - 16 - 80} y={height - 20} width={80} height={4} />

      <Logo x={M} y={M - 34} height={48} large />
      <text className="gc-muted gc-d" x={width - M - 20} y={M - 3} fontSize={20} fontWeight={600} letterSpacing="0.14em" textAnchor="end">
        {right}
      </text>

      {children}

      <rect width={width} height={height} fill="url(#gc-p-scan)" />
    </svg>
  );
}

function Stat({
  x,
  y,
  value,
  label,
  hero,
  tone = 'gc-accent',
}: {
  x: number;
  y: number;
  value: string;
  label: string;
  hero?: boolean;
  tone?: string;
}) {
  return (
    <g>
      {hero ? (
        <Neon className={`${tone} gc-d`} x={x} y={y} fontSize={56} fontWeight={700} split={2.5}>
          {value}
        </Neon>
      ) : (
        <text className="gc-fg gc-d" x={x} y={y} fontSize={56} fontWeight={700}>
          {value}
        </text>
      )}
      <text className="gc-muted gc-d" x={x} y={y + 30} fontSize={17} fontWeight={600} letterSpacing="0.16em">
        {label.toUpperCase()}
      </text>
    </g>
  );
}

/** Profile preview: identity and headline numbers on the left, the contribution city on the right. */
export function ProfileOg({ profile, avatar }: { profile: Profile; avatar?: string | null }) {
  const size = 112;
  const at = { x: M, y: 104 };
  const textX = at.x + size + 28;
  const textW = 560 - textX;
  const nameText = (profile.name || profile.login).toUpperCase();
  const nameSize = Math.max(30, Math.min(56, Math.floor(textW / (nameText.length * 0.62))));
  const sub = `@${profile.login} // SINCE ${profile.createdAt.slice(0, 4)}`;
  const rank = rankProfile(profile);
  const frame = chamfer(size, size, 0, 16);

  return (
    <Frame right="//SUBJECT FILE" horizon={540}>
      <defs>
        <clipPath id="og-avatar">
          <path d={frame} transform={`translate(${at.x} ${at.y})`} />
        </clipPath>
        {/* Duotone ID photo: grayscale with pushed contrast, multiplied with the signal yellow. */}
        <filter id="og-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.25" intercept="-0.1" />
            <feFuncG type="linear" slope="1.25" intercept="-0.1" />
            <feFuncB type="linear" slope="1.25" intercept="-0.1" />
          </feComponentTransfer>
          <feFlood floodColor="#FCEE0A" result="tint" />
          <feBlend in="SourceGraphic" in2="tint" mode="multiply" />
        </filter>
      </defs>
      {avatar ? (
        <image
          href={avatar}
          x={at.x}
          y={at.y}
          width={size}
          height={size}
          clipPath="url(#og-avatar)"
          filter="url(#og-duotone)"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <path className="og-tint" d={frame} transform={`translate(${at.x} ${at.y})`} />
      )}
      <path className="gc-accent-s" d={frame} transform={`translate(${at.x} ${at.y})`} fill="none" strokeWidth={2} />

      <text className="gc-accent gc-d" x={textX} y={at.y + 24} fontSize={17} fontWeight={600} letterSpacing="0.18em">
        {truncate(sub, maxChars(textW, 17 * 1.25))}
      </text>
      <Neon className="gc-fg gc-d" x={textX} y={at.y + 36 + nameSize * 0.9} fontSize={nameSize} fontWeight={700} split={2.5}>
        {truncate(nameText, Math.max(8, Math.floor(textW / (nameSize * 0.62))))}
      </Neon>

      <Stat x={M} y={340} value={fmt(profile.totals.stars)} label="Stars earned" hero />
      <Stat x={M + 250} y={340} value={fmt(profile.totals.contributions)} label="Contributions" />
      <Stat x={M} y={460} value={`${profile.streaks.current}d`} label="Current streak" />
      <Stat
        x={M + 250}
        y={460}
        value={rank.complete ? `RANK ${rank.tier.name}` : 'RANK ?'}
        label={rank.complete ? formatStanding(rank.top) : 'Calendar offline'}
        hero={rank.complete && rank.elite}
        tone="gc-hot"
      />

      <SkylineCity profile={profile} box={{ x: 590, y: 110, w: 560, h: 400 }} animate={false} />
    </Frame>
  );
}

/** A single card, scaled up and framed. Pass the avatar as a data URI for cards that show it, since resvg cannot fetch. */
export function CardOg({ profile, card, avatar }: { profile: Profile; card: CardId; avatar?: string }) {
  const def = getCard(card)!;
  const box = { x: 70, y: 100, w: OG.width - 140, h: OG.height - 140 };
  return (
    <Frame right={`@${profile.login} // ${def.title.toUpperCase()}`}>
      <svg x={box.x} y={box.y} width={box.w} height={box.h}>
        <def.Component profile={profile} avatar={avatar} />
      </svg>
    </Frame>
  );
}

/** Two profiles head to head: the versus card, scaled up and framed. */
export function VersusOg({ a, b }: { a: Profile; b: Profile }) {
  const box = { x: 70, y: 100, w: OG.width - 140, h: OG.height - 140 };
  return (
    <Frame right={`@${a.login} VS @${b.login}`}>
      <svg x={box.x} y={box.y} width={box.w} height={box.h}>
        <VersusCard a={a} b={b} result={compare(a, b)} />
      </svg>
    </Frame>
  );
}

/** The site's own preview: the pitch on the left, a demo city on the right. */
export function HomeOg({ demo }: { demo: Profile }) {
  return (
    <Frame right="//PUBLIC GITHUB DATA">
      <text className="gc-accent gc-d" x={M} y={170} fontSize={18} fontWeight={600} letterSpacing="0.2em">
        TYPE A HANDLE // GET A CITY
      </text>
      <Neon className="gc-fg gc-d" x={M} y={260} fontSize={78} fontWeight={700} split={3}>
        YOUR GITHUB,
      </Neon>
      <Neon className="gc-accent gc-d" x={M} y={340} fontSize={78} fontWeight={700} split={3}>
        AS A CITY.
      </Neon>
      <text className="gc-muted" x={M} y={410} fontSize={22}>
        Skylines, streaks, languages. Every card embeds.
      </text>
      <SkylineCity profile={demo} box={{ x: 620, y: 130, w: 530, h: 400 }} animate={false} />
    </Frame>
  );
}

export const toSvg = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
