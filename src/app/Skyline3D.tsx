import { useEffect, useRef, useState } from 'react';
import { supportsWebGL } from './webgl';
import { skylineCells } from '../cards/levels';
import { track } from '../lib/analytics';
import { findEggs, MAX_SIGNS, signEggs } from '../lib/eggs';
import { shortDate } from '../lib/format';
import { hasCalendar, type Profile } from '../lib/profile';
import { skylineStl, stlFileName } from '../lib/stl';
import { weatherFor } from '../lib/weather';
import { download } from './export';

/**
 * Sits on top of the static SVG skyline and fades in once WebGL has drawn, so there is never an empty box.
 * three.js is only downloaded when the skyline scrolls near the viewport. Without WebGL the SVG stays.
 */
export function Skyline3D({ profile, weather: showWeather = true }: { profile: Profile; weather?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !supportsWebGL()) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const { mountSkyline } = await import('../scenes/skyline');
        if (cancelled) return;
        // One egg per day, the rarest, when two land on the same date.
        const eggs = new Map<string, ReturnType<typeof signEggs>[number]>();
        for (const egg of signEggs(findEggs(profile))) if (!eggs.has(egg.date)) eggs.set(egg.date, egg);
        const seen = new Set<string>();
        dispose = mountSkyline(el, skylineCells(profile), profile.weeks.length, {
          onHover: (cell) => {
            const egg = cell && eggs.get(cell[5]);
            if (egg && !seen.has(egg.key)) {
              seen.add(egg.key);
              track('egg_hover', { egg: egg.key });
            }
            if (readout.current)
              readout.current.textContent = cell
                ? `${egg ? `${egg.label}: ` : ''}${cell[2]} on ${shortDate(cell[5])} ${cell[5].slice(0, 4)}`
                : 'Drag to orbit';
          },
          onReady: () => setReady(true),
          tag: tag.current ?? undefined,
          signs: [...eggs.values()].slice(0, MAX_SIGNS).map(({ date, sign }) => ({ date, text: sign })),
          weather: showWeather ? weatherFor(profile) : null,
          seed: profile.login.toLowerCase(),
        });
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      dispose?.();
    };
  }, [profile, showWeather]);

  // No calendar: the SVG card underneath shows "calendar offline", so there is nothing to draw on top of it.
  if (!hasCalendar(profile)) return null;
  // The scene draws the weather, and the label names it, with the reason on hover.
  const weather = showWeather ? weatherFor(profile) : null;

  return (
    <div
      ref={host}
      className={ready ? 'sky3d is-ready' : 'sky3d'}
      role="img"
      aria-label={`3D skyline of ${profile.login}'s contributions over the last year`}
    >
      <div className="sky3d-label eyebrow" title={weather?.reason}>
        Contribution skyline · 3D{weather && ` · Forecast: ${weather.label}`}
      </div>
      <button
        type="button"
        className="btn-ghost sky3d-stl"
        title="Download a 3D printable model of this skyline"
        onClick={() => {
          download(stlFileName(profile), new Blob([skylineStl(profile)], { type: 'model/stl' }));
          track('download_stl', { from: '3d' });
        }}
      >
        STL
      </button>
      <div ref={readout} className="sky3d-hover caption tabular" aria-live="polite">
        Drag to orbit
      </div>
      {/* The hovered tower's count, floating over it. The scene moves it, the readout above speaks it. */}
      <div ref={tag} className="sky3d-tag tabular" aria-hidden="true" hidden />
    </div>
  );
}
