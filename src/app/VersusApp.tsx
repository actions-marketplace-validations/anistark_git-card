import { useEffect, useMemo, useRef, useState } from 'react';
import { VersusCard } from '../cards/Versus';
import { track } from '../lib/analytics';
import { isValidLogin } from '../lib/profile';
import { hitSearchLimit } from '../lib/public-api';
import { compare, type Side } from '../lib/versus';
import { absolute, urls, versusFromPath } from '../lib/urls';
import { cardPng, download } from './export';
import { submitVersus } from './lookup';
import { ErrorView, Scanning } from './Status';
import { useProfile, type ProfileState } from './useProfile';

/** The two handles in the path. Read once: pages are static, so the URL is the only input. */
function useVersusRoute() {
  const [route] = useState(() => (typeof location === 'undefined' ? null : versusFromPath(location.pathname)));
  return route;
}

/** Two handle fields. Also the page for vs/ and vs/<a>, and the rematch form under a result. */
export function VersusForm({ a, heading = 'Who wins the city?', focus = false }: { a?: string | null; heading?: string; focus?: boolean }) {
  return (
    <section className="hud lookup-panel">
      <p className="eyebrow">Versus // head to head</p>
      <h1 className="title rgb">{heading}</h1>
      <form
        className="lookup versus-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitVersus(event.currentTarget);
        }}
      >
        <label htmlFor="vs-a" className="eyebrow">
          Two GitHub usernames
        </label>
        <div className="versus-row">
          <div className="lookup-row hud">
            <span className="lookup-at" aria-hidden="true">
              &gt; @
            </span>
            <input
              id="vs-a"
              name="a"
              required
              defaultValue={a ?? ''}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="torvalds"
            />
          </div>
          <span className="versus-vs" aria-hidden="true">
            vs
          </span>
          <div className="lookup-row hud">
            <span className="lookup-at" aria-hidden="true">
              &gt; @
            </span>
            <input
              name="b"
              required
              aria-label="Rival's GitHub username"
              autoFocus={focus}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="gaearon"
            />
          </div>
          <button type="submit">Fight</button>
        </div>
      </form>
    </section>
  );
}

/** Retries a side once, a minute after search ran out, so its missing numbers fill in. */
function useSearchRetry(state: ProfileState, reload: () => void) {
  const tried = useRef(false);
  const limited = state.status === 'ready' && hitSearchLimit(state.warnings);
  useEffect(() => {
    if (!limited || tried.current) return;
    tried.current = true;
    const timer = setTimeout(reload, 61_000);
    return () => clearTimeout(timer);
  }, [limited, reload]);
  return limited;
}

/** vs/<a>/<b>: two profiles head to head. */
export default function VersusApp() {
  const route = useVersusRoute();
  const a = route?.a ?? null;
  const b = route?.b ?? null;
  const same = !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const playable = !!a && !!b && !same && isValidLogin(a) && isValidLogin(b);
  const [sa, reloadA] = useProfile(playable ? a : null);
  // One profile at a time: two loads at once could spend both visitors' search budgets in the same minute.
  const firstDone = sa.status === 'ready' || sa.status === 'error';
  const [sb, reloadB] = useProfile(playable && firstDone ? b : null);
  const limitedA = useSearchRetry(sa, reloadA);
  const limitedB = useSearchRetry(sb, reloadB);

  const ready = sa.status === 'ready' && sb.status === 'ready' ? { a: sa, b: sb } : null;
  const result = useMemo(() => (sa.status === 'ready' && sb.status === 'ready' ? compare(sa.profile, sb.profile) : null), [sa, sb]);
  const outcome = result?.outcome;
  const margin = result?.margin;

  useEffect(() => {
    if (sa.status === 'ready' && sb.status === 'ready') document.title = `@${sa.profile.login} vs @${sb.profile.login} · git-card`;
  }, [sa, sb]);
  useEffect(() => {
    // Only the shape of the result, never the logins.
    if (outcome && outcome !== 'pending') track('versus', { outcome, margin: margin ?? '' });
  }, [outcome, margin]);

  if (!playable) return <VersusForm a={a} heading={same ? 'A city cannot fight itself.' : undefined} focus={!!a} />;
  if (sa.status === 'error') return <ErrorView login={sa.login} error={sa.error} />;
  if (sb.status === 'error') return <ErrorView login={sb.login} error={sb.error} />;
  if (!ready || !result) {
    const loading = sa.status === 'loading' ? sa : sb.status === 'loading' ? sb : null;
    return loading ? <Scanning login={loading.login} steps={loading.steps} /> : <Scanning login={a!} steps={{}} />;
  }

  const pa = ready.a.profile;
  const pb = ready.b.profile;
  const calendarLoading = ready.a.calendar === 'loading' || ready.b.calendar === 'loading';
  const mark = (winner: Side | null, side: Side) => (winner === side ? 'tape-win' : undefined);

  return (
    <>
      <nav className="crumbs caption">
        <a href={urls.profile(pa.login)}>@{pa.login}</a> vs <a href={urls.profile(pb.login)}>@{pb.login}</a>
      </nav>
      <figure className="card card--wide card--solo versus">
        <div className="card-art" id="versus-art">
          <VersusCard a={pa} b={pb} result={result} calendarLoading={calendarLoading} />
        </div>
        <ShareRow a={pa.login} b={pb.login} />
      </figure>

      {(limitedA || limitedB) && (
        <p className="caption">
          Some numbers for {[limitedA && `@${pa.login}`, limitedB && `@${pb.login}`].filter(Boolean).join(' and ')} hit the search limit.
          Retrying in a minute.
        </p>
      )}

      <section className="tape hud" aria-label="Tale of the tape">
        <p className="eyebrow">Tale of the tape</p>
        <table className="tabular">
          <thead>
            <tr>
              <th scope="col">
                <a href={urls.profile(pa.login)}>@{pa.login}</a>
              </th>
              <th scope="col" className="tape-label" aria-label="Measure" />
              <th scope="col">
                <a href={urls.profile(pb.login)}>@{pb.login}</a>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.key}>
                <td className={mark(row.winner, 'a')}>{row.a}</td>
                <th scope="row" className="tape-label">
                  {row.label}
                </th>
                <td className={mark(row.winner, 'b')}>{row.b}</td>
              </tr>
            ))}
            {result.categories.map((c) => (
              <tr key={c.key}>
                <td className={mark(c.winner, 'a')}>{c.winner === 'a' ? 'Leads' : c.winner ? '' : 'Even'}</td>
                <th scope="row" className="tape-label">
                  {c.label}
                </th>
                <td className={mark(c.winner, 'b')}>{c.winner === 'b' ? 'Leads' : c.winner ? '' : 'Even'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <VersusForm a={pa.login} heading="Rematch?" />
    </>
  );
}

/** Share the result: its link, or a PNG of the card for places that do not take links with previews. */
function ShareRow({ a, b }: { a: string; b: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle');
  const svg = () => document.querySelector<SVGSVGElement>('#versus-art svg.gc');
  const link = absolute(urls.versus(a, b));
  return (
    <figcaption className="embed-actions versus-share">
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={async () => {
          const el = svg();
          if (!el) return;
          setState('busy');
          try {
            download(`${a.toLowerCase()}-vs-${b.toLowerCase()}.png`, await cardPng(el, 'dark'));
            track('download_png', { card: 'versus' });
            setState('idle');
          } catch {
            setState('failed');
          }
        }}
      >
        {state === 'busy' ? 'Rendering' : state === 'failed' ? 'PNG failed, try again' : 'Download PNG'}
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setState('copied');
            track('copy_snippet', { snippet: 'link', card: 'versus' });
            setTimeout(() => setState('idle'), 1600);
          } catch {
            prompt('Copy this link', link);
          }
        }}
      >
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </button>
    </figcaption>
  );
}
