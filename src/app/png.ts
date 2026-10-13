// The PNG renderer for card downloads, split out so resvg (about 2.5 MB of wasm) and the fonts only load when
// someone asks for a PNG. Same pipeline as the OG images: class selectors and plain colors only.

import wasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';
import { CARD_CSS, LIGHT_THEME, type Theme } from '../cards/style';
import { flattenCss } from '../og/flatten';
import chakraBold from '../og/fonts/ChakraPetch-Bold.ttf.bin?url';
import chakraSemi from '../og/fonts/ChakraPetch-SemiBold.ttf.bin?url';
import mono from '../og/fonts/JetBrainsMono-Regular.ttf.bin?url';
import { rasterize, type RasterAssets } from '../og/resvg';

let assets: Promise<RasterAssets> | null = null;
const load = (url: string) => fetch(url).then((r) => r.arrayBuffer());

export async function rasterizeCard(
  clone: (css: string) => SVGSVGElement,
  inline: (svg: SVGSVGElement) => Promise<void>,
  theme: Theme,
  width: number,
): Promise<Uint8Array> {
  assets ??= Promise.all([load(wasmUrl), Promise.all([chakraSemi, chakraBold, mono].map(load))]).then(([wasm, fonts]) => ({
    wasm,
    fonts,
  }));
  // resvg has no media queries, so "follow the viewer" renders dark.
  const svg = clone(flattenCss(LIGHT_THEME && theme === 'light' ? 'light' : 'dark', CARD_CSS));
  await inline(svg);
  return rasterize(new XMLSerializer().serializeToString(svg), await assets, width);
}
