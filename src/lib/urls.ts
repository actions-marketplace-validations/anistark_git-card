// Every internal link goes through here, because a GitHub Pages project site lives under /<repo>/.
// Profiles live at u/<login>, their cards at u/<login>/c/<card>, head to heads at vs/<a>/<b> and districts of the
// shared city at city/<login>. A static host has no
// rewrites, so most of those paths have no file: GitHub Pages serves 404.html for them, and it renders the page.

import type { Theme } from '../cards/style';
import { SITE } from '../site';

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');

export const href = (path = '') => BASE + path.replace(/^\//, '');

/** UTM tags, so Google Analytics can tell which pasted snippet a visit came from. */
export interface Utm {
  source: string;
  medium: string;
  campaign?: string;
}

export interface CardLinkOptions {
  embed?: boolean;
  theme?: Theme;
  /** False turns the skyline's weather off. */
  weather?: boolean;
  /** How many projects the projects card lists, when not the default. */
  projects?: number;
}

const query = (params: Record<string, string | boolean | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== false && v !== 'auto')
    .map(([k, v]) => (v === true ? k : `${k}=${encodeURIComponent(String(v))}`));
  return parts.length ? `?${parts.join('&')}` : '';
};

/** A pathname relative to the site's base, without the leading slash. */
const sitePath = (pathname: string) => (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, ''));

/** The login in a profile path (u/<login>), or null for any other page. */
export function loginFromPath(pathname: string): string | null {
  return /^u\/([A-Za-z0-9-]{1,39})\/?$/.exec(sitePath(pathname))?.[1] ?? null;
}

/** The two logins in a versus path (vs/<a>/<b>), or just the first (vs/<a>). Null for any other page. */
export function versusFromPath(pathname: string): { a: string; b: string | null } | null {
  const match = /^vs\/([A-Za-z0-9-]{1,39})(?:\/([A-Za-z0-9-]{1,39}))?\/?$/.exec(sitePath(pathname));
  return match ? { a: match[1], b: match[2] ?? null } : null;
}

/** The city, optionally focused on one district (city/<login>). Null for any other page. */
export function cityFromPath(pathname: string): { login: string | null } | null {
  const match = /^city(?:\/([A-Za-z0-9-]{1,39}))?\/?$/.exec(sitePath(pathname));
  return match ? { login: match[1] ?? null } : null;
}

/** The login and card in a card path (u/<login>/c/<card>), or null for any other page. */
export function cardFromPath(pathname: string): { login: string; card: string } | null {
  const match = /^u\/([A-Za-z0-9-]{1,39})\/c\/([a-z0-9-]+)\/?$/.exec(sitePath(pathname));
  return match ? { login: match[1], card: match[2] } : null;
}

const utm = (tags?: Utm) => tags && { utm_source: tags.source, utm_medium: tags.medium, utm_campaign: tags.campaign };

export const urls = {
  home: () => href(''),
  rank: () => href('rank/'),
  /** The Stats workflow's history file on the `stats` branch. In dev, the copy `just stats` writes. */
  statsHistory: () =>
    import.meta.env?.DEV ? href('stats.local.json') : `${SITE.repo.replace('github.com', 'raw.githubusercontent.com')}/stats/history.json`,
  profile: (login: string, tags?: Utm) => href(`u/${login.toLowerCase()}${query({ ...utm(tags) })}`),
  card: (login: string, card: string, opts: CardLinkOptions = {}) =>
    href(
      `u/${login.toLowerCase()}/c/${card}${query({
        embed: opts.embed,
        theme: opts.theme,
        weather: opts.weather === false ? 'off' : undefined,
        projects: opts.projects === undefined ? undefined : String(opts.projects),
      })}`,
    ),
  /** Two profiles head to head. Without b, the page asks for a rival. */
  versus: (a: string, b?: string) => href(`vs/${a.toLowerCase()}${b ? `/${b.toLowerCase()}` : ''}`),
  /** The shared city, or one district in it. */
  city: (login?: string) => href(`city/${login ? login.toLowerCase() : ''}`),
  /** The City census on the `stats` branch. In dev, the copy `just city` writes. */
  cityData: () =>
    import.meta.env?.DEV ? href('city.local.json') : `${SITE.repo.replace('github.com', 'raw.githubusercontent.com')}/stats/city.json`,
  /** Pre-rendered SVGs published with the site for the logins in SNAPSHOT_USERS. */
  snapshotIndex: () => href('cards/index.json'),
  snapshotSvg: (login: string, card: string, theme: Theme = 'auto') =>
    href(`cards/${login.toLowerCase()}/${card}${theme === 'auto' ? '' : `-${theme}`}.svg`),
};

/** Absolute URL for copy-paste snippets, against wherever the site is being served from. */
export const absolute = (path: string) => new URL(path, typeof location === 'undefined' ? 'https://example.com' : location.origin).href;
