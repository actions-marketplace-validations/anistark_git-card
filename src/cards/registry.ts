import type { ComponentType } from 'react';
import { CitizenCard } from './Citizen';
import { HeatmapCard } from './Heatmap';
import { LanguagesCard } from './Languages';
import { OrgsCard } from './Orgs';
import { OverviewCard } from './Overview';
import { RankCard } from './Rank';
import type { CardProps, CardSize } from './shell';
import { SkylineCard } from './Skyline';
import { StreakCard } from './Streak';
import { TopReposCard } from './TopRepos';

export interface CardDef {
  title: string;
  description: string;
  size: CardSize;
  Component: ComponentType<CardProps>;
  /** Has a richer interactive version on its own page. The SVG stays the image and no-JS fallback. */
  interactive?: boolean;
  /** Dashboard section the card lives in. Defaults to the main grid. */
  section?: 'main' | 'orgs';
}

// Order here is the order on the dashboard. The key is the public URL slug, so never rename one.
export const CARDS = {
  skyline: {
    title: 'Contribution skyline',
    description: 'The last year of contributions as a city. One block per day.',
    size: 'wide',
    Component: SkylineCard,
    interactive: true,
  },
  rank: {
    title: 'Rank',
    description: 'An F to SSS rank: where this profile sits among active GitHub developers, by impact, activity and collaboration.',
    size: 'wide',
    Component: RankCard,
  },
  citizen: {
    title: 'Citizen ID',
    description: 'A Night City ID: a role read from how you work, a clearance from your rank and a bounty on your head.',
    size: 'standard',
    Component: CitizenCard,
  },
  overview: {
    title: 'Profile',
    description: 'Name, bio and the headline numbers.',
    size: 'standard',
    Component: OverviewCard,
  },
  heatmap: {
    title: 'Contribution calendar',
    description: 'Every day of the last year, with the peak day called out.',
    size: 'wide',
    Component: HeatmapCard,
  },
  streak: {
    title: 'Streak',
    description: 'Current and longest streak, plus which weekdays carry the load.',
    size: 'standard',
    Component: StreakCard,
  },
  languages: {
    title: 'Languages',
    description: 'Top languages across public repositories, by bytes of code.',
    size: 'standard',
    Component: LanguagesCard,
  },
  'top-repos': {
    title: 'Top repositories',
    description: 'Most starred public repositories.',
    size: 'standard',
    Component: TopReposCard,
  },
  orgs: {
    title: 'Organizations',
    description: 'Where the work went: commits, pull requests, reviews and issues per organization in the last year.',
    size: 'wide',
    Component: OrgsCard,
    section: 'orgs',
  },
} satisfies Record<string, CardDef>;

export type CardId = keyof typeof CARDS;

export function cardsIn(section: NonNullable<CardDef['section']>): CardId[] {
  return CARD_IDS.filter((id) => ((CARDS[id] as CardDef).section ?? 'main') === section);
}

export function getCard(id: string): (CardDef & { id: CardId }) | null {
  return Object.hasOwn(CARDS, id) ? { id: id as CardId, ...CARDS[id as CardId] } : null;
}

export const CARD_IDS = Object.keys(CARDS) as CardId[];
