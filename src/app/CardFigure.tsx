import { useRef, useState } from 'react';
import { PROJECTS_DEFAULT } from '../cards/Projects';
import { CARDS, type CardId } from '../cards/registry';
import type { Profile } from '../lib/profile';
import { urls } from '../lib/urls';
import { EmbedPanel } from './EmbedPanel';
import { ProjectsPicker } from './ProjectsPicker';
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
  projects: initialProjects = PROJECTS_DEFAULT,
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
  /** How many projects the projects card starts with. Visitors can pick another number on the card. */
  projects?: number;
}) {
  const art = useRef<HTMLDivElement>(null);
  const def = CARDS[card];
  const interactive = 'interactive' in def && def.interactive && live;
  const getSvg = () => art.current?.querySelector<SVGSVGElement>('svg.gc') ?? null;
  const [projects, setProjects] = useState(initialProjects);
  const picker = card === 'projects' && !bare;

  return (
    <figure className={`card card--${def.size}${solo ? ' card--solo' : ''}`} id={card}>
      <div ref={art} className={`${interactive ? 'sky-stack' : 'card-art'}${picker ? ' has-picker' : ''}`}>
        <def.Component profile={profile} calendarLoading={calendarLoading} weather={weather} projects={projects} />
        {picker && <ProjectsPicker art={art} total={profile.projects.length} value={projects} onChange={setProjects} />}
        {interactive && <Skyline3D profile={profile} weather={weather} />}
      </div>
      {bare ? null : solo ? (
        <>
          <p className="caption">{def.description}</p>
          <EmbedPanel login={profile.login} card={card} getSvg={getSvg} profile={profile} projects={picker ? projects : undefined} open />
        </>
      ) : (
        <figcaption className="card-meta">
          <a className="card-title" href={urls.card(profile.login, card)}>
            {def.title}
          </a>
          <EmbedPanel login={profile.login} card={card} getSvg={getSvg} profile={profile} projects={picker ? projects : undefined} />
        </figcaption>
      )}
    </figure>
  );
}
