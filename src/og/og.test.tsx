import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CARD_IDS } from '../cards/registry';
import { WEATHER_STATES } from '../lib/weather';
import { CardOg, HomeOg, ProfileOg, toSvg, VersusOg } from './compose';
import { demoProfile } from './demo';
import { flattenCss } from './flatten';
import { rasterize } from './resvg';

const require = createRequire(import.meta.url);
const font = (name: string) => new Uint8Array(readFileSync(new URL(`./fonts/${name}`, import.meta.url))).buffer;
const assets = {
  wasm: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
  fonts: ['ChakraPetch-SemiBold.ttf.bin', 'ChakraPetch-Bold.ttf.bin', 'JetBrainsMono-Regular.ttf.bin'].map(font),
};
// Set OG_OUT=some/dir to write the PNGs out and look at them.
const out = process.env.OG_OUT;

const isPng = (bytes: Uint8Array) => bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG';

describe('flattenCss', () => {
  const css = flattenCss('dark');

  it('leaves no custom properties, color-mix or at-rules for resvg to choke on', () => {
    expect(css).not.toMatch(/var\(|color-mix|@media|@keyframes|--[a-z]/);
  });

  it('resolves tokens and mixes to plain colors', () => {
    expect(css).toContain('.gc-accent{fill:#FCEE0A}');
    expect(css).toMatch(/\.gc-l1\{fill:#[0-9a-f]{6}\}/i);
    expect(css).toContain('url(#gc-f-glow)');
  });
});

describe('OG images', () => {
  const profile = demoProfile();
  const cases: [string, string][] = [
    ['home', toSvg(<HomeOg demo={profile} />)],
    ['profile', toSvg(<ProfileOg profile={profile} />)],
    ...CARD_IDS.map((id): [string, string] => [`card-${id}`, toSvg(<CardOg profile={profile} card={id} />)]),
    ['versus', toSvg(<VersusOg a={profile} b={{ ...demoProfile('storm'), login: 'rival', name: 'Rival' }} />)],
    ...WEATHER_STATES.map((state): [string, string] => [`weather-${state}`, toSvg(<CardOg profile={demoProfile(state)} card="skyline" />)]),
  ];

  it.each(cases)(
    'rasterizes %s to a 1200x630 PNG',
    async (name, svg) => {
      const png = await rasterize(svg, assets);
      expect(isPng(png)).toBe(true);
      // PNG IHDR: width and height are big-endian at bytes 16-23.
      const view = new DataView(png.buffer, png.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${name}.png`), png);
      }
    },
    20_000,
  );
});
