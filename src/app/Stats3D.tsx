import { useEffect, useRef, useState } from 'react';
import { supportsWebGL } from './webgl';
import { shortDate } from '../lib/format';
import type { Hit, Lane } from '../scenes/stats';

export interface StatLane extends Lane {
  unit: string;
}

const describe = (lanes: StatLane[], dates: string[], { lane, day }: Hit) => {
  const value = lanes[lane].values[day];
  const when = shortDate(dates[day]);
  return value === null
    ? `No ${lanes[lane].label.toLowerCase()} data for ${when}`
    : `${value.toLocaleString()} ${lanes[lane].unit} on ${when}`;
};

/** The stats city. three.js loads when it scrolls near the viewport. Without WebGL it says so and the table carries the numbers. */
export function Stats3D({ lanes, dates }: { lanes: StatLane[]; dates: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLSpanElement[]>([]);
  const first = useRef<HTMLSpanElement>(null);
  const last = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<'idle' | 'ready' | 'unsupported'>('idle');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!supportsWebGL()) {
      setState('unsupported');
      return;
    }
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const { mountStats } = await import('../scenes/stats');
        if (cancelled || !tag.current || !first.current || !last.current) return;
        dispose = mountStats(el, lanes, {
          onHover: (hit) => {
            if (readout.current) readout.current.textContent = hit ? describe(lanes, dates, hit) : 'Drag to orbit';
          },
          onReady: () => setState('ready'),
          laneLabels: labels.current,
          dateLabels: [first.current, last.current],
          tag: tag.current,
          formatTag: ({ lane, day }) => (lanes[lane].values[day] ?? 0).toLocaleString(),
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
  }, [lanes, dates]);

  if (state === 'unsupported') {
    return (
      <p className="caption stats-no3d">The 3D view needs WebGL, which this browser does not have. Every number is in the table below.</p>
    );
  }

  return (
    <div
      ref={host}
      className={state === 'ready' ? 'stats3d hud is-ready' : 'stats3d hud'}
      role="img"
      aria-label={`3D chart of ${lanes.map((l) => l.label.toLowerCase()).join(', ')} per day, ${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}. The same numbers are in the table below.`}
    >
      <div className="sky3d-label eyebrow">Project city · last {dates.length} days</div>
      <div ref={readout} className="sky3d-hover caption tabular" aria-live="polite">
        Drag to orbit
      </div>
      <div className="stats3d-pins" aria-hidden="true">
        {lanes.map((lane, i) => (
          <span
            key={lane.label}
            ref={(el) => {
              if (el) labels.current[i] = el;
            }}
            className="stats3d-lane"
          >
            {lane.label}
          </span>
        ))}
        <span ref={first} className="stats3d-date caption tabular">
          {shortDate(dates[0])}
        </span>
        <span ref={last} className="stats3d-date caption tabular">
          {shortDate(dates[dates.length - 1])}
        </span>
      </div>
      <div ref={tag} className="sky3d-tag tabular" aria-hidden="true" hidden />
    </div>
  );
}
