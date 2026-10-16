import type { CalendarAttempt } from '../lib/calendar';
import type { Step } from '../lib/public-api';
import { PublicApiError } from '../lib/public-api';
import { href, urls } from '../lib/urls';
import { submitLookup } from './lookup';
import type { StepState } from './useProfile';

const STEPS: { key: Step; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'calendar', label: 'Contribution calendar' },
  { key: 'activity', label: 'Commits, PRs, reviews, issues' },
  { key: 'orgs', label: 'Organizations' },
  { key: 'repos', label: 'Repositories' },
];

export function Scanning({ login, steps }: { login: string; steps: Partial<Record<Step, StepState>> }) {
  return (
    <section className="scan hud" aria-live="polite" aria-busy="true">
      <p className="eyebrow">Scanning // public GitHub data</p>
      <h1 className="title glitch rgb" data-text={`@${login}`}>
        @{login}
      </h1>
      <ol className="scan-steps tabular">
        {STEPS.map(({ key, label }) => {
          const s = steps[key];
          return (
            <li key={key} className={s ?? 'waiting'}>
              <span className="scan-mark" aria-hidden="true">
                {s === 'done' ? '[OK]' : s === 'failed' ? '[--]' : s === 'start' ? '[..]' : '[  ]'}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ErrorView({ login, error }: { login?: string; error: Error }) {
  const e = error instanceof PublicApiError ? error : null;
  const heading = e?.kind === 'not-found' ? 'Signal lost.' : e?.kind === 'rate-limit' ? 'Throttled.' : 'System fault.';
  const reset = e?.resetAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <section className="error hud">
      <p className="eyebrow tabular">{login ? `@${login} // ` : ''}connection refused</p>
      <h1 className="title glitch rgb" data-text={heading}>
        {heading}
      </h1>
      <p className="lead">{error.message}</p>
      {e?.kind === 'rate-limit' && (
        <p className="caption">
          GitHub lets each visitor make 60 API requests an hour without signing in, and a profile takes about eight.
          {reset ? ` The limit resets at ${reset}.` : ''} Profiles you have already loaded stay cached for an hour.
        </p>
      )}
      <p>
        <a className="btn" href={href('')}>
          Try another handle
        </a>
      </p>
    </section>
  );
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <aside className="warnings" role="status">
      <p className="eyebrow">Partial signal</p>
      <ul className="caption">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </aside>
  );
}

/** Shown only once the first calendar source needed a retry or a fallback, so a quick load never flashes it. */
export function CalendarStatus({ attempt }: { attempt?: CalendarAttempt }) {
  if (!attempt || (attempt.index === 1 && attempt.attempt === 1)) return null;
  const which = attempt.index === 1 ? 'Primary source' : `Backup source ${attempt.index - 1} of ${attempt.sources - 1}`;
  return (
    <aside className="warnings calendar-status" role="status" aria-live="polite">
      <p className="eyebrow">Calendar // rerouting</p>
      <p className="caption tabular">
        {which}, {attempt.source}, attempt {attempt.attempt} of {attempt.attempts}
      </p>
    </aside>
  );
}

export function Lookup({ heading = 'Whose city?' }: { heading?: string }) {
  return (
    <section className="hud lookup-panel">
      <p className="eyebrow">Target handle</p>
      <h1 className="title rgb">{heading}</h1>
      <form
        className="lookup"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitLookup(event.currentTarget);
        }}
      >
        <label htmlFor="login" className="eyebrow">
          GitHub username
        </label>
        <div className="lookup-row hud">
          <span className="lookup-at" aria-hidden="true">
            &gt; @
          </span>
          <input id="login" name="login" required autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="torvalds" />
          <button type="submit">Jack in</button>
        </div>
      </form>
      <p className="caption">
        Or see <a href={urls.profile('torvalds')}>@torvalds</a>
      </p>
    </section>
  );
}
