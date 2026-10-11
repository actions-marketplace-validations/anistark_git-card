// Night City theme. The single source of color tokens: the page injects THEME_CSS, and standalone SVG cards
// embed the same values, so a card looks the same inline, in an iframe and as a README image.

const MONO = `"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace`;
// Fallbacks are DIN-style faces that ship with macOS and Windows, for README images where web fonts never load.
const DISPLAY = `"Chakra Petch","Bahnschrift","DIN Alternate","DIN Condensed","Arial Narrow",sans-serif`;

// Night: asphalt black, acid yellow for the UI, cyan for data, neon green for the one hot spot.
const NIGHT = `--bg:#0A0A0C;--surface:#121216;--raised:#1D1D24;--line:#2E2E3A;--text:#F2F2F2;--muted:#8C8C9C;--accent:#FCEE0A;--signal:#FCEE0A;--on-signal:#0A0A0C;--data:#00F0FF;--hot:#39FF14;--sea:#1F5FD6;--peak:#39FF14;--glow-c:#FCEE0A;--glow-o:.22;--glow-filter:url(#gc-f-glow);--scan:rgba(0,0,0,.32);--logo-plate:transparent;--logo-pad:0px;`;
// Day: yellow print. Cards are signal yellow with black ink, the page is concrete.
const DAY = `--bg:#E7E4D6;--surface:#FCEE0A;--raised:#E6D800;--line:#0A0A0C;--text:#0A0A0C;--muted:#57520A;--accent:#0A0A0C;--signal:#FCEE0A;--on-signal:#0A0A0C;--data:#005F66;--hot:#0B7A32;--sea:#1A4FA8;--peak:#0B7A32;--glow-c:#000;--glow-o:0;--glow-filter:none;--scan:rgba(0,0,0,.07);--logo-plate:#0A0A0C;--logo-pad:6px;`;

/** Raw token declarations, for tools that cannot read CSS variables (the PNG renderer). */
export const TOKENS = {
  dark: `--font-mono:${MONO};--font-display:${DISPLAY};${NIGHT}`,
  light: `--font-mono:${MONO};--font-display:${DISPLAY};${DAY}`,
};

/**
 * Day mode is switched off for now: the site, embeds and README images are dark only. Flip this to bring back
 * the light theme, the header toggle and the theme picker in the embed panel. The DAY tokens are kept for that.
 */
export const LIGHT_THEME = false;

export type Theme = 'dark' | 'light' | 'auto';

/** The themes a viewer can pick from. Just dark while LIGHT_THEME is off. */
export const THEME_CHOICES: Theme[] = LIGHT_THEME ? ['auto', 'dark', 'light'] : ['dark'];

export function parseTheme(value: string | null | undefined): Theme {
  if (!LIGHT_THEME) return 'dark';
  return value === 'dark' || value === 'light' ? value : 'auto';
}

/** Page-level tokens. Explicit data-theme wins, otherwise follow the system. Dark only while LIGHT_THEME is off. */
export const THEME_CSS = LIGHT_THEME
  ? `:root{${NIGHT}--font-mono:${MONO};--font-display:${DISPLAY};}:root[data-theme="light"]{${DAY}}@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){${DAY}}}`
  : `:root{${NIGHT}--font-mono:${MONO};--font-display:${DISPLAY};}`;

// Contribution levels 0-4, plus 5 for the peak day. Skyline faces: r right side, f front.
const LEVEL_CSS = [0, 1, 2, 3, 4, 5]
  .map(
    (l) =>
      `.gc-l${l}{fill:var(--l${l});}.gc-sk .r.gc-l${l}{fill:color-mix(in srgb,var(--l${l}) 62%,#000);}.gc-sk .f.gc-l${l}{fill:color-mix(in srgb,var(--l${l}) 40%,#000);}`,
  )
  .join('');

// Skyline only: empty days are sea, and the peak day is a neon green tower.
const SKYLINE_CSS = (
  [
    ['gc-sea', 'var(--sea)'],
    ['gc-tower-peak', 'var(--peak)'],
  ] as const
)
  .map(
    ([cls, fill]) =>
      `.${cls}{fill:${fill};}.gc-sk .r.${cls}{fill:color-mix(in srgb,${fill} 62%,#000);}.gc-sk .f.${cls}{fill:color-mix(in srgb,${fill} 40%,#000);}`,
  )
  .join('');

export const CARD_CSS = `
.gc{font-family:var(--font-mono,${MONO});--l0:var(--raised);--l1:color-mix(in srgb,var(--data) 30%,var(--raised));--l2:color-mix(in srgb,var(--data) 55%,var(--raised));--l3:color-mix(in srgb,var(--data) 78%,var(--raised));--l4:var(--data);--l5:var(--hot);}
.gc text{font-family:inherit;}
.gc .gc-d{font-family:var(--font-display,${DISPLAY});}
.gc-bg{fill:var(--surface);stroke:var(--line);}
.gc-scanfill{fill:var(--scan);}
.gc-fg{fill:var(--text);}
.gc-muted{fill:var(--muted);}
.gc-accent{fill:var(--accent);}
.gc-accent-s{stroke:var(--accent);}
.gc-data{fill:var(--data);}
.gc-data-s{stroke:var(--data);}
.gc-hot{fill:var(--hot);}
.gc-on-fill{fill:var(--surface);}
.gc-logo-plate{fill:var(--logo-plate);}
.gc-track{fill:var(--raised);}
.gc-track-s{stroke:var(--raised);}
.gc-rule{stroke:var(--line);}
.gc-eyebrow{font-size:13px;font-weight:600;letter-spacing:.16em;fill:var(--accent);}
.gc-num{font-variant-numeric:tabular-nums;}
.gc-glow{filter:var(--glow-filter);}
.gc-bleed{stop-color:var(--glow-c);stop-opacity:var(--glow-o);}
.gc-rgb-r{fill:var(--hot);opacity:.8;}
.gc-rgb-c{fill:var(--data);opacity:.8;}
.gc-sign{fill:var(--surface);stroke:var(--accent);}
${LEVEL_CSS}
${SKYLINE_CSS}
@keyframes gc-fade{from{opacity:0}}
@keyframes gc-rise{from{opacity:0;transform:translateY(10px)}}
@keyframes gc-grow{from{transform:scaleX(0)}}
@keyframes gc-up{from{transform:scaleY(0)}}
@keyframes gc-blink{0%,100%{opacity:.15}30%{opacity:1}}
@keyframes gc-wave{0%,58%,100%{transform:none;filter:none}68%{transform:translateY(-3px);filter:brightness(1.5)}78%{transform:none;filter:none}}
@keyframes gc-flicker{0%,100%{opacity:1}91%{opacity:.35}92%{opacity:1}94%{opacity:.5}95%{opacity:1}}
@keyframes gc-boot{0%{opacity:0;transform:translateX(-6px)}12%{opacity:1;transform:translateX(5px)}18%{opacity:.4;transform:translateX(-3px)}26%{opacity:1;transform:none}60%{opacity:1}64%{opacity:.6}68%{opacity:1}}
@keyframes gc-jit-r{0%,88%,100%{transform:none}90%{transform:translate(-4px,1px)}93%{transform:translate(3px,-1px)}96%{transform:translate(-2px,0)}}
@keyframes gc-jit-c{0%,88%,100%{transform:none}90%{transform:translate(4px,-1px)}93%{transform:translate(-3px,1px)}96%{transform:translate(2px,0)}}
.gc-a-boot{animation:gc-boot .9s steps(1,end) both;}
.gc-a-fade{animation:gc-fade .6s ease-out both;}
.gc-a-rise{animation:gc-rise .7s cubic-bezier(.22,1,.36,1) both;}
.gc-a-grow{transform-box:fill-box;transform-origin:left;animation:gc-grow .9s cubic-bezier(.22,1,.36,1) both;}
.gc-a-up{transform-box:fill-box;transform-origin:bottom;animation:gc-up .8s cubic-bezier(.22,1,.36,1) both;}
.gc-wave{animation:gc-wave 7s ease-in-out infinite;}
.gc-a-flicker{animation:gc-flicker 6s steps(1,end) infinite;}
.gc-a-blink{opacity:.15;animation:gc-blink 1s ease-in-out infinite;}
.gc-rgb-r{animation:gc-jit-r 4.2s steps(1,end) infinite;}
.gc-rgb-c{animation:gc-jit-c 4.2s steps(1,end) infinite;}
@media (prefers-reduced-motion:reduce){.gc *{animation:none!important;}}
`;

export function standaloneCss(requested: Theme): string {
  const theme = LIGHT_THEME ? requested : 'dark';
  const root = `--font-mono:${MONO};--font-display:${DISPLAY};`;
  const tokens =
    theme === 'dark'
      ? `.gc{${root}${NIGHT}}`
      : theme === 'light'
        ? `.gc{${root}${DAY}}`
        : `.gc{${root}${NIGHT}}@media (prefers-color-scheme:light){.gc{${DAY}}}`;
  return tokens + CARD_CSS;
}
