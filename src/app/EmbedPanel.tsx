import { useEffect, useId, useState } from 'react';
import { getCard, type CardId } from '../cards/registry';
import { SIZES } from '../cards/shell';
import { LIGHT_THEME, THEME_CHOICES, type Theme } from '../cards/style';
import { SITE } from '../site';
import { track } from '../lib/analytics';
import { hasCalendar, type Profile } from '../lib/profile';
import { skylineStl, STL_DEFAULTS, stlFileName } from '../lib/stl';
import { absolute, urls } from '../lib/urls';
import { cardPng, cardSvg, download } from './export';

// ---- Hosted snapshots ------------------------------------------------------------------------
// The Pages workflow pre-renders cards for the logins in SNAPSHOT_USERS and publishes an index.

interface Manifest {
  generatedAt: string;
  users: Record<string, { cards: string[] }>;
}

let manifest: Promise<Manifest | null> | null = null;
const loadManifest = () =>
  (manifest ??= fetch(urls.snapshotIndex())
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null));

function useHosted(login: string, card: CardId): boolean {
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    let live = true;
    loadManifest().then((m) => live && setHosted(!!m?.users[login.toLowerCase()]?.cards.includes(card)));
    return () => {
      live = false;
    };
  }, [login, card]);
  return hosted;
}

// ---- UI ----------------------------------------------------------------------------------------

function CopyField({ id, label, value, hint, onCopy }: { id: string; label: string; value: string; hint: string; onCopy: () => void }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copy = async () => {
    onCopy();
    try {
      await navigator.clipboard.writeText(value);
      setCopied('copied');
    } catch {
      (document.getElementById(id) as HTMLInputElement | null)?.select();
      setCopied('manual');
    }
    setTimeout(() => setCopied('idle'), 1600);
  };
  const multiline = value.includes('\n');
  return (
    <div className="embed-field">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <div className="embed-row">
        {multiline ? (
          <textarea id={id} value={value} readOnly spellCheck={false} rows={value.split('\n').length} />
        ) : (
          <input id={id} value={value} readOnly spellCheck={false} />
        )}
        <button type="button" onClick={copy}>
          {copied === 'copied' ? 'Copied' : copied === 'manual' ? 'Press Cmd+C' : 'Copy'}
        </button>
      </div>
      <p className="caption">{hint}</p>
    </div>
  );
}

/** A PNG of the card, for X, LinkedIn and anywhere else that does not take SVG. */
function PngField({ card, file, getSvg, theme }: { card: CardId; file: string; getSvg: () => SVGSVGElement | null; theme: Theme }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const save = async () => {
    const svg = getSvg();
    if (!svg || state === 'busy') return;
    setState('busy');
    try {
      download(file, await cardPng(svg, theme));
      track('download_png', { card });
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  return (
    <div className="embed-field">
      <span className="eyebrow">Image</span>
      <div className="embed-actions">
        <button type="button" onClick={save} disabled={state === 'busy'}>
          {state === 'busy' ? 'Rendering' : `Download ${file}`}
        </button>
      </div>
      <p className="caption">
        {state === 'failed'
          ? 'The PNG could not be rendered. Try again, or download the SVG.'
          : 'For X, LinkedIn and anywhere that does not take SVG.'}
      </p>
    </div>
  );
}

/** The skyline as a 3D printable model. Built from the profile alone, so it works without WebGL. */
function StlField({ profile }: { profile: Profile }) {
  const name = stlFileName(profile);
  const { pitch, margin } = STL_DEFAULTS;
  const cm = Math.round((profile.weeks.length * pitch + margin * 2) / 10);
  return (
    <div className="embed-field">
      <span className="eyebrow">3D print</span>
      <div className="embed-actions">
        <button
          type="button"
          onClick={() => {
            download(name, new Blob([skylineStl(profile)], { type: 'model/stl' }));
            track('download_stl', { from: 'embed' });
          }}
        >
          Download {name}
        </button>
      </div>
      <p className="caption">{`A printable model of the year in millimetres, about ${cm} cm wide with towers up to ${STL_DEFAULTS.height} mm.`}</p>
    </div>
  );
}

export function EmbedPanel({
  login,
  card,
  getSvg,
  profile,
  open = false,
}: {
  login: string;
  card: CardId;
  getSvg: () => SVGSVGElement | null;
  /** The skyline offers a 3D print of it. */
  profile?: Profile;
  open?: boolean;
}) {
  const uid = useId();
  const [theme, setTheme] = useState<Theme>('auto');
  const hosted = useHosted(login, card);
  const def = getCard(card)!;
  const { width, height } = SIZES[def.size];
  const suffix = theme === 'auto' ? '' : `-${theme}`;
  const file = `${card}${suffix}.svg`;
  const alt = `${def.title} for @${login}`;
  // The README link carries UTM tags, since GA cannot see the card itself inside a rendered README.
  const readmeLink = absolute(urls.profile(login, { source: 'readme', medium: 'card', campaign: card }));
  const copied = (snippet: string) => () => track('copy_snippet', { snippet, card, hosted });

  const action = `# .github/workflows/git-card.yml in your profile repo
name: git-card
on:
  schedule: [{ cron: '17 3 * * *' }]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  cards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ${SITE.action}
        with:
          username: ${login}
          cards: ${card}${LIGHT_THEME ? `\n          theme: ${theme}` : ''}
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add git-card
          git diff --staged --quiet || git commit -m "Update git-card"
          git push`;

  return (
    <details className="embed" open={open}>
      <summary className="eyebrow">Embed</summary>
      <div className="embed-body hud">
        {LIGHT_THEME && (
          <fieldset className="embed-theme">
            <legend className="eyebrow">Theme</legend>
            {THEME_CHOICES.map((t) => (
              <label key={t}>
                <input type="radio" name={`${uid}-theme`} value={t} checked={theme === t} onChange={() => setTheme(t)} />
                {t === 'auto' ? 'Follow viewer' : t}
              </label>
            ))}
          </fieldset>
        )}

        {hosted ? (
          <CopyField
            id={`${uid}-md`}
            label="README"
            value={`[![${alt}](${absolute(urls.snapshotSvg(login, card, theme))})](${readmeLink})`}
            hint="A hosted image, refreshed daily. Paste it into any README."
            onCopy={copied('readme')}
          />
        ) : (
          <>
            <CopyField
              id={`${uid}-md`}
              label="README"
              value={`[![${alt}](./git-card/${file})](${readmeLink})`}
              hint="READMEs need an image file. Download it into a git-card folder in your repo, or let the Action below keep it fresh."
              onCopy={copied('readme')}
            />
            <div className="embed-actions">
              <button
                type="button"
                onClick={async () => {
                  const svg = getSvg();
                  if (!svg) return;
                  download(file, await cardSvg(svg, theme));
                  track('download_svg', { card });
                }}
              >
                Download {file}
              </button>
            </div>
            <CopyField
              id={`${uid}-action`}
              label="Auto-update with GitHub Actions"
              value={action}
              hint="Re-renders the card every day with fresh data and commits it to your repo."
              onCopy={copied('action')}
            />
          </>
        )}

        <PngField card={card} file={`${card}${suffix}.png`} getSvg={getSvg} theme={theme} />
        {card === 'skyline' && profile && hasCalendar(profile) && <StlField profile={profile} />}
        <CopyField
          id={`${uid}-link`}
          label="Link"
          value={absolute(urls.card(login, card, { theme }))}
          hint="Share this card on its own page."
          onCopy={copied('link')}
        />
        <CopyField
          id={`${uid}-iframe`}
          label="iframe"
          value={`<iframe src="${absolute(urls.card(login, card, { embed: true, theme }))}" width="${width}" height="${height}" style="border:0;max-width:100%;aspect-ratio:${width}/${height};height:auto" loading="lazy" title="${alt}"></iframe>`}
          hint={
            def.interactive
              ? 'Live and interactive, with the 3D view. For blogs and portfolios.'
              : 'Live and animated. For blogs and portfolios.'
          }
          onCopy={copied('iframe')}
        />
      </div>
    </details>
  );
}
