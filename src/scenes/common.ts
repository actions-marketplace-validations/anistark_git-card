// Pieces the 3D scenes share: the palette read from the live page tokens, the sea's swell and the bloom pass.
import { Color, type Camera, type Scene, Vector2, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { WeatherPalette } from './weather';

export interface Palette extends WeatherPalette {
  /** The level ramp: raised for level 0, then toward data, and hot for 5. */
  levels: Color[];
  sea: Color;
  peak: Color;
  surface: Color;
  raised: Color;
}

// Same recipe as the CSS level ramp in cards/style.ts, resolved from the live page tokens.
export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => new Color(css.getPropertyValue(name).trim() || '#000');
  const raised = token('--raised');
  const data = token('--data');
  const surface = token('--surface');
  const mix = (t: number) => new Color().lerpColors(raised, data, t);
  const night = surface.r * 0.2126 + surface.g * 0.7152 + surface.b * 0.0722 < 0.4;
  return {
    levels: [raised, mix(0.3), mix(0.55), mix(0.78), data, token('--hot')],
    sea: token('--sea'),
    peak: token('--peak'),
    surface,
    raised,
    signal: token('--accent'),
    data,
    hot: token('--hot'),
    text: token('--text'),
    rain: token('--rain'),
    fog: token('--fog'),
    night,
  };
}

/**
 * GLSL: the sea at a point. A swell rolls across every 80 units at 80 units per 7 seconds, over a faint constant
 * ripple. Returns (lift, crest), where crest is 0-1 on the swell for the light it catches.
 */
export const SEA_WAVE = /* glsl */ `
  vec2 seaWave( vec2 p, float t ) {
    float d = mod( p.x + p.y * 0.5 - t * 80.0 / 7.0, 80.0 ) - 40.0;
    float swell = exp( -d * d / 10.0 );
    float ripple = sin( p.x * 0.9 + p.y * 1.4 + t * 1.5 );
    return vec2( swell * 0.35 + ripple * 0.03, swell );
  }
`;

/** The neon look: the scene through a soft bloom. */
export function bloomComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.3, 0.62));
  composer.addPass(new OutputPass());
  return composer;
}
