import { useEffect } from 'react';
import { CARDS, getCard } from '../cards/registry';
import { PublicApiError } from '../lib/public-api';
import { urls } from '../lib/urls';
import { CardFigure } from './CardFigure';
import { ErrorView, Lookup, Scanning } from './Status';
import { useCardRoute, useParam, useProfile } from './useProfile';

/** /u/<login>/c/<card>, plus ?embed for iframes, ?theme=dark|light, ?weather=off and ?projects=<n>. One card on its own. */
export default function CardApp() {
  const { login, card: id } = useCardRoute();
  const embed = useParam('embed') !== null;
  const weather = useParam('weather') !== 'off';
  const projects = Number(useParam('projects')) || undefined;
  const card = getCard(id);
  const [state] = useProfile(card ? login : null);

  useEffect(() => {
    if (state.status === 'ready' && card) document.title = `${card.title} for @${state.profile.login} · git-card`;
  }, [state, card]);

  if (!card)
    return (
      <ErrorView
        login={login ?? undefined}
        error={new PublicApiError(`There is no card called "${id}". Try one of: ${Object.keys(CARDS).join(', ')}.`, 'not-found')}
      />
    );
  if (state.status === 'empty') return <Lookup heading={`Whose ${card.title.toLowerCase()}?`} />;
  if (state.status === 'loading')
    return embed ? (
      <div className="embed-loading eyebrow">Loading @{state.login}</div>
    ) : (
      <Scanning login={state.login} steps={state.steps} />
    );
  if (state.status === 'error') return <ErrorView login={state.login} error={state.error} />;

  const { profile } = state;
  const calendarLoading = state.calendar === 'loading';
  if (embed) {
    // Interactive cards keep their own pointer handling. The rest link through to the full profile.
    return card.interactive ? (
      <CardFigure profile={profile} card={card.id} live bare calendarLoading={calendarLoading} weather={weather} projects={projects} />
    ) : (
      <a className="embed-card" href={urls.profile(profile.login)} target="_blank" rel="noopener">
        <CardFigure
          profile={profile}
          card={card.id}
          live={false}
          bare
          calendarLoading={calendarLoading}
          weather={weather}
          projects={projects}
        />
      </a>
    );
  }

  return (
    <>
      <nav className="crumbs caption">
        <a href={urls.profile(profile.login)}>@{profile.login}</a> / {card.title}
      </nav>
      <CardFigure profile={profile} card={card.id} solo calendarLoading={calendarLoading} weather={weather} projects={projects} />
    </>
  );
}
