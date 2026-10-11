// Renders git-card SVGs to files, for READMEs. Runs in GitHub Actions, where a token is free, so it uses
// GraphQL for exact numbers. The website itself never needs a token.
//
//   tsx scripts/generate.tsx --users anistark,torvalds --out dist/cards          hosted snapshots for Pages
//   tsx scripts/generate.tsx --users anistark --out git-card --flat --cards skyline,rank --themes dark --weather off
//   tsx scripts/generate.tsx --site-og public/og.png                             the site's own preview image
//
// Needs GITHUB_TOKEN for --users. Writes <out>/<login>/<card>[-dark|-light].svg, or <out>/<card>... with --flat,
// plus <out>/index.json listing what was generated.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARD_IDS, getCard, type CardId } from '../src/cards/registry';
import { LIGHT_THEME, type Theme } from '../src/cards/style';
import { fetchProfileGraphQL } from '../src/lib/github';
import { HomeOg, toSvg } from '../src/og/compose';
import { demoProfile } from '../src/og/demo';
import { rasterize } from '../src/og/resvg';

const { values } = parseArgs({
  options: {
    users: { type: 'string', default: '' },
    cards: { type: 'string', default: 'all' },
    // While the light theme is off, every theme renders dark, so one file per card is enough.
    themes: { type: 'string', default: LIGHT_THEME ? 'auto,dark,light' : 'auto' },
    out: { type: 'string', default: 'git-card' },
    flat: { type: 'boolean', default: false },
    // Weather over the skyline, from the last week of work. "off" draws the plain city.
    weather: { type: 'string', default: 'on' },
    'site-og': { type: 'string' },
  },
});

const list = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

async function siteOg(path: string) {
  const require = createRequire(import.meta.url);
  const font = (name: string) => new Uint8Array(readFileSync(new URL(`../src/og/fonts/${name}`, import.meta.url))).buffer;
  const png = await rasterize(toSvg(createElement(HomeOg, { demo: demoProfile() })), {
    wasm: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
    fonts: ['ChakraPetch-SemiBold.ttf.bin', 'ChakraPetch-Bold.ttf.bin', 'JetBrainsMono-Regular.ttf.bin'].map(font),
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  console.log(`site preview -> ${path}`);
}

async function cards(users: string[]) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required to render cards. In Actions, pass ${{ github.token }}.');

  const wanted = values.cards === 'all' ? CARD_IDS : list(values.cards!);
  const unknown = wanted.filter((c) => !getCard(c));
  if (unknown.length) throw new Error(`Unknown cards: ${unknown.join(', ')}. Pick from: ${CARD_IDS.join(', ')}.`);
  const themes = list(values.themes!) as Theme[];
  if (values.flat && users.length > 1) throw new Error('--flat writes one user per folder. Pass a single user.');
  if (values.weather !== 'on' && values.weather !== 'off') throw new Error(`--weather is "on" or "off", not "${values.weather}".`);
  const weather = values.weather === 'on';

  const index: { generatedAt: string; users: Record<string, { cards: string[] }> } = { generatedAt: new Date().toISOString(), users: {} };
  for (const login of users) {
    const profile = await fetchProfileGraphQL(login, token);
    const dir = values.flat ? values.out! : join(values.out!, profile.login.toLowerCase());
    mkdirSync(dir, { recursive: true });
    for (const id of wanted as CardId[]) {
      const { Component } = getCard(id)!;
      for (const theme of themes) {
        const file = join(dir, `${id}${theme === 'auto' ? '' : `-${theme}`}.svg`);
        writeFileSync(file, renderToStaticMarkup(createElement(Component, { profile, theme, standalone: true, weather })));
      }
    }
    index.users[profile.login.toLowerCase()] = { cards: wanted };
    console.log(`@${profile.login}: ${wanted.length} cards x ${themes.length} themes -> ${dir}`);
  }
  mkdirSync(values.out!, { recursive: true });
  writeFileSync(join(values.out!, 'index.json'), JSON.stringify(index, null, 2));
}

const users = list(values.users!);
if (!users.length && !values['site-og']) {
  console.error('Nothing to do. Pass --users and/or --site-og. See the header of this file.');
  process.exit(1);
}
if (values['site-og']) await siteOg(values['site-og']);
if (users.length) await cards(users);
