import { barcode, bountyFor, citizenNumber, citizenOf, formatBounty } from '../lib/citizen';
import { findEggs } from '../lib/eggs';
import { formatStanding, rankProfile } from '../lib/rank';
import { seeded } from '../lib/seeded';
import { chamfer, maxChars, Meter, Neon, PAD, SIZES, Shell, truncate, type CardProps } from './shell';

const PHOTO = 112;
const COL = PAD + PHOTO + 24; // the right-hand column
const STAMPS = 3;

/** GitHub serves avatars at any size through ?s=. */
function avatarAt(url: string, px: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('s', String(px));
    return u.href;
  } catch {
    return null;
  }
}

/** Under the photo, and in its place when there is none: a mirrored block face from the login, like an old ID scan. */
function Glyph({ login, x, y, size }: { login: string; x: number; y: number; size: number }) {
  const rand = seeded(`${login.toLowerCase()}:face`);
  const n = 8;
  const cell = size / n;
  const cells: [number, number, number][] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n / 2; col++) {
      const v = rand();
      if (v < 0.45) continue;
      const o = Math.round((0.35 + v * 0.65) * 100) / 100;
      cells.push([col, row, o], [n - 1 - col, row, o]);
    }
  }
  return (
    <g aria-hidden="true">
      <rect className="gc-track" x={x} y={y} width={size} height={size} />
      {cells.map(([c, r, o], i) => (
        <rect key={i} className="gc-data" x={x + c * cell} y={y + r * cell} width={cell} height={cell} opacity={o} />
      ))}
    </g>
  );
}

/** A Night City citizen ID: photo, role read from how they work, clearance from the rank, a bounty and egg stamps. */
export function CitizenCard(props: CardProps) {
  const { profile } = props;
  const { width } = SIZES.standard;
  const right = width - PAD;
  const rank = rankProfile(profile);
  const { role, trait } = citizenOf(profile, rank);
  // Without the calendar the rank is not known, so neither is the clearance or the bounty.
  const pending = !rank.complete;
  const bounty = formatBounty(bountyFor(rank));
  const photo = props.avatar ?? avatarAt(profile.avatarUrl, PHOTO * 2);
  const login = profile.login;
  const at = { x: PAD, y: 62 };
  const frame = chamfer(PHOTO, PHOTO, 0, 14);
  const stamps = findEggs(profile)
    .filter((e) => e.sign)
    .slice(0, STAMPS);
  const nameW = right - COL;
  const name = truncate((profile.name || login).toUpperCase(), maxChars(nameW, 30));
  const district = profile.location ? profile.location.toUpperCase() : 'UNREGISTERED';

  return (
    <Shell
      {...props}
      id="citizen"
      tag="CIT"
      size="standard"
      eyebrow="Citizen ID"
      label={`Citizen ID for @${login}: ${role.name}${trait ? ` with a ${trait.name} trait` : ''}${pending ? '' : `, clearance ${rank.tier.name}, bounty ${bounty} credits`}`}
    >
      <defs>
        <clipPath id={`gc-clip-photo-${login}`}>
          <path d={frame} transform={`translate(${at.x} ${at.y})`} />
        </clipPath>
        {/* Duotone ID photo: grayscale with pushed contrast, multiplied with the signal yellow. */}
        <filter id="gc-f-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.25" intercept="-0.1" />
            <feFuncG type="linear" slope="1.25" intercept="-0.1" />
            <feFuncB type="linear" slope="1.25" intercept="-0.1" />
          </feComponentTransfer>
          <feFlood className="gc-duo" result="tint" />
          <feBlend in="SourceGraphic" in2="tint" mode="multiply" />
        </filter>
      </defs>

      {/* Photo, with the generated face underneath in case the image does not load. */}
      <g clipPath={`url(#gc-clip-photo-${login})`}>
        <Glyph login={login} x={at.x} y={at.y} size={PHOTO} />
        {photo && (
          <image
            href={photo}
            x={at.x}
            y={at.y}
            width={PHOTO}
            height={PHOTO}
            preserveAspectRatio="xMidYMid slice"
            filter="url(#gc-f-duotone)"
          />
        )}
      </g>
      <path className="gc-accent-s" d={frame} transform={`translate(${at.x} ${at.y})`} fill="none" strokeWidth={2} />
      <g aria-hidden="true">
        {barcode(login, PHOTO).map(([x, w]) => (
          <rect key={x} className="gc-fg" x={at.x + x} y={at.y + PHOTO + 12} width={w} height={26} opacity={0.85} />
        ))}
      </g>
      <text className="gc-muted gc-num" x={at.x} y={at.y + PHOTO + 54} fontSize={11} letterSpacing="0.08em">
        {citizenNumber(login)}
      </text>

      {/* Identity. */}
      <text className="gc-muted gc-d" x={COL} y={78} fontSize={12} fontWeight={600} letterSpacing="0.16em">
        CITIZEN SINCE {profile.createdAt.slice(0, 4)}
      </text>
      <Neon className="gc-fg gc-d" x={COL} y={112} fontSize={30} fontWeight={700} split={1.5}>
        {name}
      </Neon>
      <text className="gc-muted" x={COL} y={134} fontSize={13}>
        {truncate(`DISTRICT // ${district}`, maxChars(nameW, 13))}
      </text>

      {/* Role. */}
      <g className="gc-a-rise" style={{ animationDelay: '120ms' }}>
        <text className="gc-muted gc-d" x={COL} y={170} fontSize={12} fontWeight={600} letterSpacing="0.16em">
          ROLE
          {trait && (
            <tspan className="gc-data" dx={10}>
              + {trait.name.toUpperCase()}
            </tspan>
          )}
        </text>
        <Neon className="gc-accent gc-d" x={COL} y={204} fontSize={32} fontWeight={700} split={2}>
          {role.name.toUpperCase()}
        </Neon>
        <text className="gc-fg" x={COL} y={226} fontSize={13} opacity={0.85}>
          {truncate(role.tagline, maxChars(272, 13))}
        </text>
      </g>

      {/* Egg stamps, inked at a slant in the corner. */}
      {stamps.map((egg, i) => {
        const w = egg.sign!.length * 8 + 16;
        const cx = right - 34 - (i % 2) * 14;
        const cy = 166 + i * 26;
        return (
          <g key={egg.key} className="gc-a-fade" style={{ animationDelay: `${600 + i * 150}ms` }}>
            <title>{egg.label}</title>
            <g transform={`rotate(${-9 + i * 5} ${cx} ${cy})`}>
              <rect className="gc-sign" x={cx - w / 2} y={cy - 10} width={w} height={20} strokeWidth={1.2} />
              <text className="gc-accent gc-d" x={cx} y={cy + 5} fontSize={12} fontWeight={700} letterSpacing="0.08em" textAnchor="middle">
                {egg.sign}
              </text>
            </g>
          </g>
        );
      })}

      <line className="gc-rule" x1={PAD} x2={right} y1={246} y2={246} strokeDasharray="2 4" />

      {/* Clearance and bounty. */}
      <g className="gc-a-rise" style={{ animationDelay: '240ms' }}>
        <text className="gc-muted gc-d" x={PAD} y={272} fontSize={11} fontWeight={600} letterSpacing="0.16em">
          CLEARANCE
        </text>
        <Neon
          className={`${pending ? 'gc-muted' : rank.elite ? 'gc-hot' : 'gc-fg'} gc-d`}
          x={PAD}
          y={316}
          fontSize={40}
          fontWeight={700}
          split={rank.elite ? 2 : 1}
        >
          {pending ? '?' : rank.tier.name}
        </Neon>
        <text className="gc-muted gc-d" x={PAD} y={338} fontSize={12} fontWeight={600} letterSpacing="0.12em">
          {pending ? (props.calendarLoading ? 'SCANNING' : 'OFFLINE') : rank.tier.title.toUpperCase()}
        </text>

        <text className="gc-muted gc-d" x={PAD + 150} y={272} fontSize={11} fontWeight={600} letterSpacing="0.16em">
          BOUNTY
        </text>
        <text className="gc-accent gc-num gc-d gc-glow" x={PAD + 150} y={312} fontSize={32} fontWeight={700}>
          {pending ? '?' : bounty}
        </text>
        <text className="gc-muted gc-d" x={PAD + 150} y={338} fontSize={12} fontWeight={600} letterSpacing="0.12em">
          CREDITS
        </text>
      </g>

      {/* The three rank categories as short meters. */}
      {rank.categories.map((c, i) => {
        const x = PAD + 264;
        const y = 272 + i * 30;
        return (
          <g key={c.key} className="gc-a-fade" style={{ animationDelay: `${300 + i * 90}ms` }}>
            <text className="gc-fg gc-d" x={x} y={y} fontSize={11} fontWeight={700} letterSpacing="0.14em">
              {c.label.toUpperCase()}
            </text>
            <text className="gc-muted gc-num gc-d" x={right} y={y} fontSize={11} fontWeight={600} textAnchor="end">
              {pending ? '' : formatStanding(c.top).toUpperCase()}
            </text>
            <Meter x={x} y={y + 9} width={right - x} fill={pending ? 0 : 1 - c.top} delay={400 + i * 90} />
          </g>
        );
      })}
    </Shell>
  );
}
