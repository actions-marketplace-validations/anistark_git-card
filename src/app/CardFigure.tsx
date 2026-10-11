import { useRef } from 'react';
import { CARDS, type CardId } from '../cards/registry';
import type { Profile } from '../lib/profile';
import { urls } from '../lib/urls';
import { EmbedPanel } from './EmbedPanel';
import { Skyline3D } from './Skyline3D';

/** One card: the SVG (plus the 3D view for the skyline), its title link and the embed panel. */
export function CardFigure({
  profile,
  card,
  solo = false,
  live = true,
  bare = false,
  calendarLoading = false,
  weather = true,
}: {
  profile: Profile;
  card: CardId;
  /** Its own page: description and an open embed panel instead of the caption. */
  solo?: boolean;
  /** Use the interactive version when the card has one. */
  live?: boolean;
  /** Just the card, for iframes. */
  bare?: boolean;
  /** The calendar is still on its way. */
  calendarLoading?: boolean;
  /** Weather over the skyline. */
  weather?: boolean;
}) {
  const art = useRef<HTMLDivElement>(null);
  const def = CARDS[card];
  const interactive = 'interactive' in def && def.interactive && live;
  const getSvg = () => art.current?.querySelector<SVGSVGElement>('svg.gc') ?? null;

  return (
    <figure className={`card card--${def.size}${solo ? ' card--solo' : ''}`} id={card}>
      <div ref={art} className={interactive ? 'sky-stack' : 'card-art'}>
        <def.Component profile={profile} calendarLoading={calendarLoading} weather={weather} />
        {interactive && <Skyline3D profile={profile} weather={weather} />}
      </div>
      {bare ? null : solo ? (
        <>
          <p className="caption">{def.description}</p>
          <EmbedPanel login={profile.login} card={card} getSvg={getSvg} open />
        </>
      ) : (
        <figcaption className="card-meta">
          <a className="card-title" href={urls.card(profile.login, card)}>
            {def.title}
          </a>
          <EmbedPanel login={profile.login} card={card} getSvg={getSvg} />
        </figcaption>
      )}
    </figure>
  );
}
