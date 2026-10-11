// Card files from the card already on the page: a standalone SVG, or a PNG for places that do not take SVG.

import { standaloneCss, type Theme } from '../cards/style';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A copy of the card that stands on its own: namespace and size set, ready for a stylesheet. */
function cloneCard(svg: SVGSVGElement, css: string): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.viewBox.baseVal;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = css;
  clone.insertBefore(style, clone.querySelector('title')?.nextSibling ?? clone.firstChild);
  return clone;
}

/**
 * Remote images (the avatar) become data URIs, since an SVG used as an image cannot load anything, and neither
 * can resvg. One that fails is dropped, so the card shows what is under it instead of a broken image.
 */
async function inlineImages(clone: SVGSVGElement): Promise<void> {
  const images = [...clone.querySelectorAll('image')].filter((img) => /^https?:/.test(img.getAttribute('href') ?? ''));
  await Promise.all(
    images.map(async (img) => {
      try {
        const res = await fetch(img.getAttribute('href')!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        img.setAttribute('href', data);
      } catch {
        img.remove();
      }
    }),
  );
}

/** The card as a standalone SVG file, with its own theme tokens and any images embedded. */
export async function cardSvg(svg: SVGSVGElement, theme: Theme): Promise<string> {
  const clone = cloneCard(svg, standaloneCss(theme));
  await inlineImages(clone);
  return new XMLSerializer().serializeToString(clone);
}

/** The card as a PNG at twice its size. resvg, its wasm and the fonts only load on the first call. */
export async function cardPng(svg: SVGSVGElement, theme: Theme): Promise<Blob> {
  const { rasterizeCard } = await import('./png');
  const png = await rasterizeCard((css) => cloneCard(svg, css), inlineImages, theme, svg.viewBox.baseVal.width * 2);
  return new Blob([png as BlobPart], { type: 'image/png' });
}

export function download(name: string, data: string | Blob) {
  const blob = typeof data === 'string' ? new Blob([data], { type: 'image/svg+xml' }) : data;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
