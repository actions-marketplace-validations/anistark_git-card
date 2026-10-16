import { KINDS, type Profile, type Project } from '../lib/profile';
import { KIND_STYLE } from './Orgs';
import { chamfer, fmt, maxChars, Neon, PAD, SIZES, Shell, truncate, wrap, type CardProps } from './shell';

const COLS = 2;
const GAP = 12;
const ROW_GAP = 8;
const TILE_H = 80;
const TOP = 100;
const BAR_W = 52;
const FOOT = 48;

export const PROJECTS_DEFAULT = 10;
export const PROJECTS_MAX = 50;
/** What the picker on the site offers. */
export const PROJECT_CHOICES = [5, 10, 15, 20, 25, 50];

/**
 * Picker options for a profile with this many projects: every choice below the total, then one "ALL" that
 * stands for the rest. An asked for number that is not a choice, like 7 from a link, is kept.
 */
export function projectChoices(total: number, current = PROJECTS_DEFAULT): { value: number; label: string }[] {
  const values = [...new Set([...PROJECT_CHOICES, current])].sort((a, b) => a - b);
  const below = values.filter((v) => v < total);
  const all = values.find((v) => v >= total);
  return [...below.map((v) => ({ value: v, label: String(v) })), ...(all ? [{ value: all, label: 'ALL' }] : [])];
}

/** The picker option a limit lands on: itself, or "ALL" once it covers every project. */
export function projectChoice(total: number, limit = PROJECTS_DEFAULT): number {
  const choices = projectChoices(total, limit);
  return limit >= total ? (choices.at(-1)?.value ?? limit) : limit;
}

/** How many tiles the card draws: the asked for number, within bounds, and no more than there are projects. */
export function shownProjects(profile: Profile, limit = PROJECTS_DEFAULT): number {
  const n = Number.isFinite(limit) ? Math.round(limit) : PROJECTS_DEFAULT;
  return Math.min(profile.projects.length, Math.max(1, Math.min(PROJECTS_MAX, n)));
}

/** The card grows a row of tiles at a time, and is never shorter than the other cards. */
export function projectsHeight(profile: Profile, limit = PROJECTS_DEFAULT): number {
  const rows = Math.ceil(shownProjects(profile, limit) / COLS);
  return Math.max(SIZES.wide.height, TOP + rows * TILE_H + Math.max(0, rows - 1) * ROW_GAP + FOOT);
}

/** Languages first in the data color, then topics, deduplicated, cut to fit. */
function stack(p: Project, max: number): { langs: string; topics: string } {
  const seen = new Set<string>();
  const take = (list: string[]) => list.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  const langs = take(p.languages).map((l) => l.toUpperCase());
  const topics = take(p.topics);
  let used = 0;
  const fit = (list: string[]) =>
    list.filter((t) => {
      const cost = (used ? 3 : 0) + t.length;
      if (used + cost > max) return false;
      used += cost;
      return true;
    });
  const l = fit(langs);
  const t = fit(topics);
  return { langs: l.join(' · '), topics: (l.length && t.length ? ' · ' : '') + t.join(' · ') };
}

function Tile({ p, i, x, y, w, self }: { p: Project; i: number; x: number; y: number; w: number; self: string }) {
  const inner = w - 28;
  const nameX = 40;
  const right = w - 14;
  const barX = right - 40 - BAR_W;
  const own = p.owner.toLowerCase() === self.toLowerCase();
  const nameMax = maxChars(barX - 10 - nameX, 15);
  const name = own ? truncate(p.name, nameMax) : truncate(`${p.owner}/${p.name}`, nameMax);
  const ownerLen = own ? 0 : Math.min(name.length, p.owner.length + 1);
  const breakdown = KINDS.filter((k) => p[k])
    .map((k) => `${fmt(p[k])} ${KIND_STYLE[k].label.toUpperCase()}`)
    .join(' · ');
  const lines = p.description ? wrap(p.description, maxChars(inner, 12), 2) : [breakdown];
  // The stack line is letter spaced, so each glyph takes a little more than the usual 0.6em.
  const { langs, topics } = stack(p, Math.floor(inner / (11 * 0.65)));
  let bx = barX;

  return (
    <g transform={`translate(${x}, ${y})`} className="gc-a-rise" style={{ animationDelay: `${120 + i * 70}ms` }}>
      <path className="gc-rule" d={chamfer(w, TILE_H, 0.5, 10)} fill="none" />
      <rect className={i === 0 ? 'gc-accent' : 'gc-track'} x={0} y={12} width={3} height={TILE_H - 24} />
      <text className={`gc-d ${i === 0 ? 'gc-accent' : 'gc-muted'}`} x={14} y={24} fontSize={12} fontWeight={700}>
        {String(i + 1).padStart(2, '0')}
      </text>
      <text x={nameX} y={24} fontSize={15}>
        {ownerLen > 0 && <tspan className="gc-muted">{name.slice(0, ownerLen)}</tspan>}
        <tspan className="gc-fg">{name.slice(ownerLen)}</tspan>
      </text>
      {/* The year's mix of work in this repo, colored like the orgs card. */}
      {KINDS.map((kind) => {
        const segW = (p[kind] / p.total) * BAR_W;
        const seg = segW > 0 && (
          <rect key={kind} className={KIND_STYLE[kind].className} x={bx} y={16} width={Math.max(1, segW - 1)} height={7} />
        );
        bx += segW;
        return seg;
      })}
      <text className="gc-num gc-d gc-data" x={right} y={24} fontSize={16} fontWeight={600} textAnchor="end">
        {fmt(p.total)}
      </text>
      {lines.map((line, j) => (
        <text key={j} className="gc-muted" x={14} y={43 + j * 14} fontSize={12}>
          {line}
        </text>
      ))}
      {(langs || topics) && (
        <text x={14} y={TILE_H - 9} fontSize={11} fontWeight={600} letterSpacing="0.04em">
          {langs && <tspan className="gc-data">{langs}</tspan>}
          {topics && <tspan className="gc-muted">{topics}</tspan>}
        </text>
      )}
    </g>
  );
}

/** Which color is which kind of work, packed against the right edge. */
function Legend({ right }: { right: number }) {
  // Swatch, gap, then the letter spaced label, at roughly 0.72em a glyph.
  const widths = KINDS.map((k) => 15 + KIND_STYLE[k].label.length * 12 * 0.72);
  let x = right - widths.reduce((a, b) => a + b, 0) - 20 * (KINDS.length - 1);
  return (
    <g>
      {KINDS.map((kind, i) => {
        const at = x;
        x += widths[i] + 20;
        return (
          <g key={kind} transform={`translate(${at}, 84)`}>
            <rect className={KIND_STYLE[kind].className} x={0} y={-9} width={9} height={9} />
            <text className="gc-muted gc-d" x={15} y={0} fontSize={12} fontWeight={600} letterSpacing="0.12em">
              {KIND_STYLE[kind].label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function ProjectsCard(props: CardProps) {
  const { profile } = props;
  const { width } = SIZES.tall;
  const right = width - PAD;
  const projects = profile.projects;
  const shown = projects.slice(0, shownProjects(profile, props.projects));
  const tileW = (right - PAD - GAP * (COLS - 1)) / COLS;
  const count = String(projects.length);

  return (
    <Shell
      {...props}
      id="projects"
      tag="PRJ"
      size="tall"
      height={projectsHeight(profile, props.projects)}
      eyebrow="Active projects · last 12 months"
      label={`${projects.length} projects with public contributions in the last year. Most active: ${shown
        .map((p) => `${p.owner}/${p.name} (${p.total} contributions${p.languages[0] ? `, ${p.languages[0]}` : ''})`)
        .join(', ')}`}
    >
      <g className="gc-a-rise">
        <Neon className="gc-accent gc-num gc-d" x={PAD} y={86} fontSize={34} fontWeight={700}>
          {count}
        </Neon>
        <text className="gc-muted gc-d" x={PAD + count.length * 21 + 12} y={84} fontSize={13} fontWeight={600} letterSpacing="0.16em">
          {projects.length === 1 ? 'PROJECT' : 'PROJECTS'}
          {/* The site lays its picker over the marked number. Everywhere else it is plain text. */}
          {shown.length > 0 && (projects.length > shown.length ? ' · TOP ' : ' · ')}
          {shown.length > 0 && <tspan data-gc-pick="">{projects.length > shown.length ? shown.length : 'ALL'}</tspan>}
        </text>
      </g>

      {shown.length > 0 && <Legend right={right} />}

      {shown.length === 0 ? (
        <text className="gc-muted" x={PAD} y={190} fontSize={16}>
          NO SIGNAL. No public contributions in the last 12 months.
        </text>
      ) : (
        shown.map((p, i) => (
          <Tile
            key={`${p.owner}/${p.name}`}
            p={p}
            i={i}
            x={PAD + (i % COLS) * (tileW + GAP)}
            y={TOP + Math.floor(i / COLS) * (TILE_H + ROW_GAP)}
            w={tileW}
            self={profile.login}
          />
        ))
      )}
    </Shell>
  );
}
