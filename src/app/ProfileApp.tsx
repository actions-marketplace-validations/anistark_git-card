import { useEffect, useMemo } from 'react';
import { cardsIn } from '../cards/registry';
import { isValidLogin } from '../lib/profile';
import { rankProfile } from '../lib/rank';
import { urls } from '../lib/urls';
import { CardFigure } from './CardFigure';
import { EggSection } from './EggSection';
import { OrgSection } from './OrgSection';
import { ProfileHeader } from './ProfileHeader';
import { CalendarStatus, ErrorView, Lookup, Scanning, Warnings } from './Status';
import { useLogin, useProfile } from './useProfile';

/** /u/<login>: the whole dashboard, built in the browser from public APIs. */
export default function ProfileApp() {
  const login = useLogin();
  const [state, reload] = useProfile(login);
  const rank = useMemo(() => (state.status === 'ready' ? rankProfile(state.profile) : null), [state]);

  // The lookup form and older links arrive as u/?user=<login>. Show the path form instead.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!login || !isValidLogin(login) || !params.has('user')) return;
    params.delete('user');
    const rest = params.toString();
    history.replaceState(history.state, '', `${urls.profile(login)}${rest ? `?${rest}` : ''}${location.hash}`);
  }, [login]);

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.profile.name || state.profile.login} (@${state.profile.login}) · git-card`;
  }, [state]);

  if (state.status === 'empty') return <Lookup />;
  if (state.status === 'loading') return <Scanning login={state.login} steps={state.steps} />;
  if (state.status === 'error') return <ErrorView login={state.login} error={state.error} />;

  const { profile, warnings, calendar, calendarSource, calendarAttempt } = state;
  const calendarLoading = calendar === 'loading';
  return (
    <>
      <ProfileHeader profile={profile} rank={rank!} calendarLoading={calendarLoading} />
      <Warnings warnings={warnings} />
      {calendarLoading && <CalendarStatus attempt={calendarAttempt} />}
      <div className="cards">
        {cardsIn('main').map((id) => (
          <CardFigure key={id} profile={profile} card={id} calendarLoading={calendarLoading} />
        ))}
      </div>
      <EggSection profile={profile} />
      <OrgSection profile={profile} />
      <p className="caption fetched">
        Public GitHub data, fetched by your browser at {new Date(profile.fetchedAt).toLocaleString()} and cached for an hour.
        {calendarSource ? ` Calendar via ${calendarSource}.` : ''}{' '}
        <button type="button" className="btn-ghost refresh" onClick={reload}>
          Refresh
        </button>
      </p>
    </>
  );
}
