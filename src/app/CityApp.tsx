import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../lib/analytics';
import { ROLES } from '../lib/citizen';
import { DISTRICT, districtDays, newest, plots, type CityData, type Resident } from '../lib/city';
import { fmt, shortDate } from '../lib/format';
import { cityFromPath, urls } from '../lib/urls';
import type { CityScene } from '../scenes/city';
import { SITE } from '../site';
import { actionWorkflow, CopyField } from './EmbedPanel';
import { supportsWebGL } from './webgl';

type State = { status: 'loading' } | { status: 'empty' } | { status: 'error' } | { status: 'ready'; city: CityData };

function useCity(): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    fetch(urls.cityData(), { cache: 'no-cache' })
      .then(async (res) => {
        // No census yet: the first one runs with the daily Stats workflow.
        if (res.status === 404) return { status: 'empty' } as const;
        if (!res.ok) throw new Error(String(res.status));
        const city = (await res.json()) as CityData;
        return city.residents.length ? ({ status: 'ready', city } as const) : ({ status: 'empty' } as const);
      })
      .catch(() => ({ status: 'error' }) as const)
      .then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

const day = (date: string) => `${shortDate(date)} ${date.slice(0, 4)}`;
const who = (r: Resident) => (r.number === null ? 'Landmark' : `Citizen #${r.number}`);
/** How to move around, for a mouse or a touch screen. */
const hint = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
    ? 'Drag to orbit · pinch to zoom · tap a district'
    : 'Drag to orbit · scroll to zoom · click a district';
const describe = (r: Resident) => `@${r.login} · ${who(r)} · Rank ${r.tier} · ${ROLES[r.role].name}`;

/**
 * The city from above, in SVG: the first paint, and all there is without WebGL. Each week is one cell, up to
 * `MAP_WEEKS` districts. Past that, plain islands, since tens of thousands of cells would slow the page.
 */
const MAP_WEEKS = 150;

function CityMap({ residents, selected, onSelect }: { residents: Resident[]; selected: number | null; onSelect: (i: number) => void }) {
  const places = useMemo(() => plots(residents.length), [residents.length]);
  const pad = 8;
  const xs = places.map((p) => p.x);
  const zs = places.map((p) => p.z);
  const minX = Math.min(...xs) - DISTRICT.w / 2 - pad;
  const minZ = Math.min(...zs) - DISTRICT.d / 2 - pad;
  const width = Math.max(...xs) - Math.min(...xs) + DISTRICT.w + pad * 2;
  const height = Math.max(...zs) - Math.min(...zs) + DISTRICT.d + pad * 2;
  const labels = residents.length <= 40;
  const detail = residents.length <= MAP_WEEKS;
  return (
    <svg className="city-map" viewBox={`${minX} ${minZ} ${width} ${height}`} role="img" aria-label="Map of the city from above">
      {residents.map((r, i) => {
        const { x, z } = places[i];
        const weeks = new Map<number, number>();
        if (detail) for (const [week, , h] of districtDays(r)) weeks.set(week, Math.max(weeks.get(week) ?? 0, h));
        return (
          <g
            key={r.login}
            className={`city-map-district${r.number === null ? ' is-landmark' : ''}${selected === i ? ' is-active' : ''}`}
            onClick={() => onSelect(i)}
          >
            <rect
              className="city-map-island"
              x={x - DISTRICT.w / 2 - 0.75}
              y={z - DISTRICT.d / 2 - 0.75}
              width={DISTRICT.w + 1.5}
              height={DISTRICT.d + 1.5}
            />
            {[...weeks].map(([week, h]) => (
              <rect
                key={week}
                className={h >= 1 ? 'city-map-peak' : 'city-map-week'}
                x={x - DISTRICT.w / 2 + week + 0.1}
                y={z - DISTRICT.d / 2 + 0.6}
                width={0.8}
                height={DISTRICT.d - 1.2}
                opacity={h >= 1 ? 1 : 0.25 + h * 0.75}
              />
            ))}
            {labels && (
              <text className="city-map-label" x={x} y={z + DISTRICT.d / 2 + 3.6} textAnchor="middle" fontSize={3}>
                @{r.login}
              </text>
            )}
            <title>{describe(r)}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** The 3D city over the map. three.js loads straight away, since the city is the page. */
function CityStage({
  residents,
  selected,
  onSelect,
}: {
  residents: Resident[];
  selected: number | null;
  onSelect: (i: number, via: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const plates = useRef<HTMLSpanElement[]>([]);
  const scene = useRef<CityScene | null>(null);
  const [ready, setReady] = useState(false);
  const pick = useRef(onSelect);
  pick.current = onSelect;

  useEffect(() => {
    const el = host.current;
    if (!el || !supportsWebGL()) return;
    let cancelled = false;
    import('../scenes/city').then(({ mountCity }) => {
      if (cancelled) return;
      scene.current = mountCity(el, residents, {
        onHover: (i) => {
          if (readout.current) readout.current.textContent = i === null ? hint() : describe(residents[i]);
        },
        onSelect: (i) => pick.current(i, 'click'),
        onReady: () => setReady(true),
        plates: plates.current,
        small: matchMedia('(max-width: 760px)').matches,
      });
    });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [residents]);

  // Fly to the selected district, once the scene is up and whenever the selection changes.
  useEffect(() => {
    if (ready && selected !== null) scene.current?.focus(selected);
  }, [ready, selected]);

  return (
    <div className="city-stage">
      <CityMap residents={residents} selected={selected} onSelect={(i) => onSelect(i, 'map')} />
      <div ref={host} className={ready ? 'city3d is-ready' : 'city3d'} role="img" aria-label="3D map of the shared city">
        <div ref={readout} className="city3d-hover caption tabular" aria-live="polite">
          {hint()}
        </div>
        <div className="city3d-plates" aria-hidden="true">
          {residents.map((r, i) => (
            <span
              key={r.login}
              ref={(el) => {
                if (el) plates.current[i] = el;
              }}
              className={r.number === null ? 'city-plate is-landmark' : 'city-plate'}
              hidden
            >
              @{r.login}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function District({ resident }: { resident: Resident }) {
  return (
    <aside className="city-district hud" aria-live="polite">
      <img
        key={resident.login}
        src={`https://github.com/${resident.login}.png?size=96`}
        alt=""
        width={48}
        height={48}
        onError={(event) => (event.currentTarget.hidden = true)}
      />
      <div>
        <p className="eyebrow">{resident.number === null ? 'Landmark' : `Citizen #${resident.number}`}</p>
        <p className="city-district-name">@{resident.login}</p>
        <p className="caption tabular">
          Rank {resident.tier} · {ROLES[resident.role].name} · {resident.total.toLocaleString()} contributions this year
          {resident.since && ` · moved in ${day(resident.since)}`}
        </p>
      </div>
      <div className="city-district-links">
        <a className="btn" href={urls.profile(resident.login)}>
          Profile
        </a>
        <a className="btn btn-ghost" href={urls.versus(resident.login)}>
          Versus
        </a>
      </div>
    </aside>
  );
}

function Search({ residents, onFind }: { residents: Resident[]; onFind: (i: number) => void }) {
  const [missing, setMissing] = useState<string | null>(null);
  return (
    <form
      className="lookup city-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const value = String(new FormData(event.currentTarget).get('who') ?? '')
          .trim()
          .replace(/^@/, '')
          .toLowerCase();
        const i = residents.findIndex((r) => r.login.toLowerCase() === value);
        setMissing(i < 0 && value ? value : null);
        if (i >= 0) onFind(i);
      }}
    >
      <label htmlFor="city-who" className="eyebrow">
        Find a resident
      </label>
      <div className="lookup-row hud">
        <span className="lookup-at" aria-hidden="true">
          &gt; @
        </span>
        <input
          id="city-who"
          name="who"
          list="city-logins"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="anistark"
        />
        <button type="submit">Find</button>
      </div>
      <datalist id="city-logins">
        {residents.map((r) => (
          <option key={r.login} value={r.login} />
        ))}
      </datalist>
      {missing && (
        <p className="caption">
          @{missing} has not moved in yet. Their <a href={urls.profile(missing)}>profile</a> is still open.
        </p>
      )}
    </form>
  );
}

function MoveIn() {
  return (
    <section className="city-section">
      <p className="eyebrow">Move in</p>
      <h2 className="title rgb">Get a district of your own.</h2>
      <p className="lead">
        Run the git-card Action in your profile repo and you move in with the next daily census, numbered in order of arrival.
      </p>
      <CopyField
        id="city-action"
        label="Workflow"
        value={actionWorkflow({ cards: 'skyline,rank' })}
        hint="Renders your cards every day and commits them. The census finds it through GitHub code search."
        onCopy={() => track('copy_snippet', { snippet: 'action', card: 'city' })}
      />
      <p className="caption">
        To keep your cards but stay out of the city, add <code>city: off</code> under <code>with:</code>. To be taken out by hand,{' '}
        <a href={SITE.issues}>open an issue</a>.
      </p>
    </section>
  );
}

export default function CityApp() {
  const [route] = useState(() => (typeof location === 'undefined' ? null : cityFromPath(location.pathname)));
  const state = useCity();
  const city = state.status === 'ready' ? state.city : null;
  const residents = city?.residents ?? null;
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!residents) return;
    track('city_visit', { residents: residents.length });
    if (!route?.login) return;
    const i = residents.findIndex((r) => r.login.toLowerCase() === route.login!.toLowerCase());
    if (i >= 0) {
      setSelected(i);
      track('city_focus', { via: 'link' });
    }
  }, [residents, route]);

  useEffect(() => {
    if (residents && selected !== null) document.title = `@${residents[selected].login} in Night City · git-card`;
  }, [residents, selected]);

  const select = (i: number, via: string) => {
    if (!residents) return;
    setSelected(i);
    history.replaceState(null, '', urls.city(residents[i].login));
    // How a district was found, never whose it is.
    track('city_focus', { via });
  };

  const citizens = residents?.filter((r) => r.number !== null) ?? [];
  const landmarks = (residents?.length ?? 0) - citizens.length;

  return (
    <section className="city-page">
      <p className="eyebrow">Night City // shared city</p>
      <h1 className="display glitch rgb" data-text="Night City.">
        Night <span className="neon">City.</span>
      </h1>
      <p className="lead">
        Everyone who runs the git-card Action gets a district, their own year of work as a skyline on an island, all in one sea. The oldest
        citizens are the old town in the middle.
      </p>

      {state.status === 'loading' && <p className="caption city-status">Loading the census</p>}
      {state.status === 'error' && <p className="caption city-status">The census could not be loaded. Try again in a minute.</p>}
      {state.status === 'empty' && (
        <p className="caption city-status">No one has moved in yet. The census runs once a day with the Stats workflow.</p>
      )}

      {residents && (
        <>
          <ul className="stat-tiles city-tiles">
            <li className="stat-tile hud">
              <span className="stat-label">Citizens</span>
              <span className="stat-value tabular">{citizens.length.toLocaleString()}</span>
              <span className="caption">Running the Action</span>
            </li>
            <li className="stat-tile hud">
              <span className="stat-label">Landmarks</span>
              <span className="stat-value tabular">{landmarks.toLocaleString()}</span>
              <span className="caption">Featured profiles, yellow shores</span>
            </li>
            <li className="stat-tile hud">
              <span className="stat-label">Towers</span>
              <span className="stat-value tabular">{fmt(residents.reduce((n, r) => n + r.total, 0))}</span>
              <span className="caption">Contributions this year</span>
            </li>
          </ul>

          <Search residents={residents} onFind={(i) => select(i, 'search')} />
          <CityStage residents={residents} selected={selected} onSelect={select} />
          {selected !== null && <District resident={residents[selected]} />}

          {citizens.length > 0 && (
            <section className="city-section">
              <p className="eyebrow">Newest arrivals</p>
              <ul className="adopters">
                {newest(city!, 6).map((r) => (
                  <li key={r.login}>
                    <button type="button" className="link-button" onClick={() => select(residents.indexOf(r), 'arrivals')}>
                      #{r.number} @{r.login}
                    </button>
                    <span className="caption tabular">{r.since && day(r.since)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {state.status !== 'loading' && <MoveIn />}

      {residents && (
        <section className="city-section">
          <p className="eyebrow">Directory</p>
          <h2 className="title rgb">Everyone in town.</h2>
          <div className="table-wrap">
            <table className="metric-table tabular">
              <thead>
                <tr>
                  <th scope="col">No.</th>
                  <th scope="col">Resident</th>
                  <th scope="col">Rank</th>
                  <th scope="col">Role</th>
                  <th scope="col">Contributions</th>
                  <th scope="col">Moved in</th>
                </tr>
              </thead>
              <tbody>
                {residents.map((r, i) => (
                  <tr key={r.login}>
                    <td>{r.number ?? 'Landmark'}</td>
                    <th scope="row">
                      <button type="button" className="link-button" onClick={() => select(i, 'directory')}>
                        @{r.login}
                      </button>
                    </th>
                    <td>{r.tier}</td>
                    <td>{ROLES[r.role].name}</td>
                    <td>{r.total.toLocaleString()}</td>
                    <td>{r.since ? day(r.since) : '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {city && (
            <ul className="fine-print">
              <li>
                Census of {new Date(city.updatedAt).toLocaleString()}, from GitHub code search and the GitHub API. The raw file is{' '}
                <a href={urls.cityData()}>city.json</a>.
              </li>
              <li>Code search skips some repos, so someone who just added the Action can take a few days to move in.</li>
              <li>Each district is the last year of contributions, and taller the busier that year was.</li>
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
