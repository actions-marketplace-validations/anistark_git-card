import { EGGS, findEggs } from '../lib/eggs';
import { shortDate } from '../lib/format';
import { hasCalendar, type Profile } from '../lib/profile';

/** The easter eggs this year turned up, with the rest as locked silhouettes so people know there are more. */
export function EggSection({ profile }: { profile: Profile }) {
  if (!hasCalendar(profile)) return null;
  const found = findEggs(profile);
  const have = new Set(found.map((e) => e.key));
  const locked = EGGS.filter((e) => !have.has(e.key));

  return (
    <section className="egg-section" aria-labelledby="eggs-heading">
      <p className="eyebrow">
        Easter eggs // {found.length} of {EGGS.length} found
      </p>
      <h2 className="title rgb" id="eggs-heading">
        Hidden in the calendar.
      </h2>
      <p className="lead">
        {found.length
          ? 'Some days hang a neon sign on the skyline. These are the ones this year turned up.'
          : 'Some days hang a neon sign on the skyline. None turned up this year, yet.'}
      </p>
      {found.length > 0 && (
        <ul className="eggs">
          {found.map((egg) => (
            <li key={egg.key} className="egg hud">
              <span className="egg-sign">{egg.sign ?? '★'}</span>
              <span className="egg-label">{egg.label}</span>
              <span className="caption">{egg.hint}</span>
              <span className="caption tabular">{egg.date ? `${shortDate(egg.date)} ${egg.date.slice(0, 4)}` : 'Across the year'}</span>
            </li>
          ))}
        </ul>
      )}
      {locked.length > 0 && (
        <div className="eggs-locked">
          <span className="caption">{locked.length} still hidden</span>
          <ul aria-hidden="true">
            {locked.map((egg) => (
              <li key={egg.key} className="egg-sign">
                {'?'.repeat(egg.sign?.length ?? 1)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
