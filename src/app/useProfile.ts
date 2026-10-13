import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../lib/profile';
import { isValidLogin } from '../lib/profile';
import type { CalendarAttempt } from '../lib/calendar';
import { CACHE_PREFIX, fetchPublicProfile, PublicApiError, type CalendarState, type Step } from '../lib/public-api';
import { cardFromPath, loginFromPath } from '../lib/urls';

export type StepState = 'start' | 'done' | 'failed';

export type ProfileState =
  | { status: 'empty' }
  | { status: 'loading'; login: string; steps: Partial<Record<Step, StepState>> }
  | { status: 'error'; login: string; error: PublicApiError | Error }
  | {
      status: 'ready';
      profile: Profile;
      warnings: string[];
      /** 'loading' while the rest of the profile is shown and the calendar is still on its way. */
      calendar: CalendarState;
      calendarSource?: string;
      /** The calendar source and attempt in progress, while loading. */
      calendarAttempt?: CalendarAttempt;
    };

/** Read a query parameter once. Pages are static, so the URL is the only input. */
export function useParam(name: string): string | null {
  const [value] = useState(() => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name)));
  return value;
}

/** The profile's login, from the path (u/<login>). */
export function useLogin(): string | null {
  const [value] = useState(() => (typeof location === 'undefined' ? null : loginFromPath(location.pathname)));
  return value;
}

/** The card page's login and card, from the path (u/<login>/c/<card>). */
export function useCardRoute(): { login: string | null; card: string } {
  const [value] = useState(() => (typeof location === 'undefined' ? null : cardFromPath(location.pathname)) ?? { login: null, card: '' });
  return value;
}

export function useProfile(login: string | null): [ProfileState, () => void] {
  const [reloads, setReloads] = useState(0);
  const [state, setState] = useState<ProfileState>(() => (login ? { status: 'loading', login, steps: {} } : { status: 'empty' }));

  useEffect(() => {
    if (!login) return setState({ status: 'empty' });
    if (!isValidLogin(login)) {
      return setState({ status: 'error', login, error: new PublicApiError(`"${login}" is not a valid GitHub username.`, 'not-found') });
    }
    const ctrl = new AbortController();
    setState({ status: 'loading', login, steps: {} });
    let attempt: CalendarAttempt | undefined;
    fetchPublicProfile(login, {
      signal: ctrl.signal,
      onStep: (step, s) => setState((prev) => (prev.status === 'loading' ? { ...prev, steps: { ...prev.steps, [step]: s } } : prev)),
      // Show the profile as soon as only the calendar is missing. Its cards fill in when it lands.
      onPartial: (partial) => setState({ status: 'ready', ...partial, calendarAttempt: attempt }),
      onCalendarAttempt: (a) => {
        attempt = a;
        setState((prev) => (prev.status === 'ready' && prev.calendar === 'loading' ? { ...prev, calendarAttempt: a } : prev));
      },
    })
      .then((result) => setState({ status: 'ready', ...result }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', login, error });
      });
    return () => ctrl.abort();
  }, [login, reloads]);

  const reload = useCallback(() => {
    if (!login) return;
    try {
      localStorage.removeItem(CACHE_PREFIX + login.toLowerCase());
    } catch {
      // Storage blocked: there is no cache to clear.
    }
    setReloads((n) => n + 1);
  }, [login]);

  return [state, reload];
}
