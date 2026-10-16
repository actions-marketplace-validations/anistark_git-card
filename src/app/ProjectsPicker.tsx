import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { projectChoice, projectChoices } from '../cards/Projects';
import { track } from '../lib/analytics';

interface Box {
  left: number;
  top: number;
  height: number;
  font: number;
  /** Room from the trigger to the card's right edge, so the panel can stay inside it on a narrow screen. */
  room: number;
}

// The wheel is a drum seen side on: each choice sits STEP degrees further round it, with TEETH small teeth between.
const STEP = 34;
const TEETH = 4;
const RADIUS = 112; // px
const PX_PER_STEP = RADIUS * ((STEP * Math.PI) / 180); // how far a drag moves the drum one choice, at its centre
const SETTLE_MS = 240;
const PANEL_W = 260; // matches .pick-panel in app.css
const GEAR_TURN = 30; // degrees the trigger's gear turns per choice

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Ends a move a little past the mark and springs back, like a ratchet clicking into its detent. */
const ratchet = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/** A small cog, drawn as a shape so it needs no icon font. */
function Gear({ angle }: { angle: number }) {
  const teeth = 8;
  const d = Array.from({ length: teeth }, (_, i) => {
    const a = (i / teeth) * Math.PI * 2;
    const w = Math.PI / teeth / 1.6;
    const pt = (r: number, t: number) => `${(12 + r * Math.cos(t)).toFixed(2)},${(12 + r * Math.sin(t)).toFixed(2)}`;
    return `${i ? 'L' : 'M'}${pt(8, a - w * 1.4)} L${pt(11, a - w)} L${pt(11, a + w)} L${pt(8, a + w * 1.4)}`;
  }).join(' ');
  return (
    <svg className="pick-gear" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${angle}deg)` }}>
      <path d={`${d} Z M12,8.6 a3.4,3.4 0 1,0 0.01,0 Z`} fillRule="evenodd" />
    </svg>
  );
}

/**
 * The number in the projects card's "TOP 10", made into a thumbwheel: a drum of gear teeth that turns under a fixed
 * notch and clicks into place on each choice. The card stays a plain SVG, so downloads and README images keep the
 * number as text. The site hides that text and lays this over it.
 */
export function ProjectsPicker({
  art,
  total,
  value,
  onChange,
}: {
  /** The element holding the card's SVG. */
  art: RefObject<HTMLDivElement | null>;
  total: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [open, setOpen] = useState(false);
  const choices = projectChoices(total, value);
  const selected = Math.max(
    0,
    choices.findIndex((c) => c.value === projectChoice(total, value)),
  );
  const last = choices.length - 1;
  // Where the drum is, in choices. Fractional while it turns.
  const [offset, setOffset] = useState(selected);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const motion = useRef({ frame: 0, drag: null as null | { x: number; from: number; id: number }, detent: selected, scroll: 0 });

  // A passive effect, not a layout one: a parent's ref is only attached after its children's layout effects run.
  useEffect(() => {
    const host = art.current;
    if (!host) return;
    const place = () => {
      const svg = host.querySelector<SVGSVGElement>('svg.gc');
      const anchor = host.querySelector<SVGGraphicsElement>('[data-gc-pick]');
      if (!svg || !anchor) return setBox(null);
      // The SVG bounding box ignores the CSS animations the card plays on load, so the spot is right from the start.
      const b = anchor.getBBox();
      const s = svg.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const scale = s.width / svg.viewBox.baseVal.width;
      const left = s.left - h.left + b.x * scale;
      setBox({ left, top: s.top - h.top + b.y * scale, height: b.height * scale, font: 13 * scale, room: h.width - left });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(host);
    return () => ro.disconnect();
  }, [art, value, total]);

  // Closes on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (open) wheel.current?.focus();
  }, [open]);

  // A scroll wheel or trackpad turns the drum. React's wheel listener is passive, so this one is added by hand.
  useEffect(() => {
    const el = wheel.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = motion.current;
      m.scroll += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(m.scroll) < 40) return;
      settleRef.current(Math.round(offsetRef.current) + Math.sign(m.scroll));
      m.scroll = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => () => cancelAnimationFrame(motion.current.frame), []);

  // The latest offset, for event handlers and animation frames that outlive a render.
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const settleRef = useRef<(target: number) => void>(() => {});

  if (!box || choices.length < 2) return null;

  const clamp = (i: number) => Math.max(0, Math.min(last, i));

  /** A light tick under the finger as the drum passes each choice, where the device can. */
  const click = (at: number) => {
    const m = motion.current;
    const detent = clamp(Math.round(at));
    if (detent === m.detent) return;
    m.detent = detent;
    navigator.vibrate?.(4);
  };

  /** Turns the drum to a choice with a ratchet's click, then applies it to the card. */
  const settle = (target: number) => {
    const to = clamp(target);
    const from = offsetRef.current;
    const m = motion.current;
    cancelAnimationFrame(m.frame);
    const done = () => {
      setOffset(to);
      click(to);
      const n = choices[to].value;
      if (n !== choices[selected].value) {
        onChange(n);
        track('pick_projects', { count: n });
      }
    };
    if (reducedMotion() || from === to) return done();
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / SETTLE_MS);
      const at = from + (to - from) * ratchet(t);
      setOffset(at);
      click(at);
      if (t < 1) m.frame = requestAnimationFrame(frame);
      else done();
    };
    m.frame = requestAnimationFrame(frame);
  };
  settleRef.current = settle;

  const show = () => {
    cancelAnimationFrame(motion.current.frame);
    motion.current.detent = selected;
    setOffset(selected);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(motion.current.frame);
    motion.current.drag = { x: e.clientX, from: offsetRef.current, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = motion.current.drag;
    if (!drag || drag.id !== e.pointerId) return;
    let at = drag.from - (e.clientX - drag.x) / PX_PER_STEP;
    // Past either end the drum gives a little, then stops.
    if (at < 0) at = -Math.min(0.6, -at * 0.35);
    if (at > last) at = last + Math.min(0.6, (at - last) * 0.35);
    setOffset(at);
    click(at);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = motion.current.drag;
    if (!drag || drag.id !== e.pointerId) return;
    motion.current.drag = null;
    // A tap without a drag lands on the number under the pointer.
    if (Math.abs(e.clientX - drag.x) < 4) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = (e.clientX - (rect.left + rect.width / 2)) / RADIUS;
      const angle = (Math.asin(Math.max(-1, Math.min(1, dx))) * 180) / Math.PI;
      return settle(Math.round(offsetRef.current + angle / STEP));
    }
    settle(Math.round(offsetRef.current));
  };

  const onKey = (e: KeyboardEvent) => {
    const at = Math.round(offsetRef.current);
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowUp: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at - 1,
      PageUp: at + 2,
      PageDown: at - 2,
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      settle(moves[e.key]);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  // Teeth from a little before the first choice to a little after the last, so the drum never looks cut off.
  const teeth: { at: number; major: boolean }[] = [];
  for (let k = -2 * (TEETH + 1); k <= (last + 2) * (TEETH + 1); k++) teeth.push({ at: k / (TEETH + 1), major: k % (TEETH + 1) === 0 });
  const shown = clamp(Math.round(offset));

  return (
    <div
      ref={root}
      className={`pick${open ? ' is-open' : ''}`}
      style={{ left: box.left, top: box.top, height: box.height, fontSize: box.font }}
    >
      <button
        ref={button}
        type="button"
        className="pick-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Projects to show: ${choices[selected].label}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="pick-value" data-text={choices[open ? shown : selected].label}>
          {choices[open ? shown : selected].label}
        </span>
        <Gear angle={(open ? offset : selected) * GEAR_TURN} />
      </button>
      {open && (
        <div className="pick-panel" role="dialog" aria-label="Projects to show" style={{ left: Math.min(-12, box.room - PANEL_W - 8) }}>
          <p className="pick-head" aria-hidden="true">
            <span>{'// SHOW'}</span>
            <span className="pick-read">{choices[shown].label === 'ALL' ? 'ALL' : choices[shown].label.padStart(2, '0')}</span>
          </p>
          <div
            ref={wheel}
            className="pick-wheel"
            role="slider"
            tabIndex={0}
            aria-label="Projects to show"
            aria-valuemin={choices[0].value}
            aria-valuemax={choices[last].value}
            aria-valuenow={choices[shown].value}
            aria-valuetext={choices[shown].label === 'ALL' ? `All ${total}` : choices[shown].label}
            onKeyDown={onKey}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            // A release the wheel never hears, like one outside the window, still lets the drum settle.
            onLostPointerCapture={onUp}
          >
            <span className="pick-notch" aria-hidden="true" />
            {teeth.map(({ at, major }) => {
              const angle = (at - offset) * STEP;
              if (Math.abs(angle) >= 88) return null;
              const rad = (angle * Math.PI) / 180;
              const face = Math.cos(rad);
              const choice = major && at >= 0 && at <= last ? choices[Math.round(at)] : null;
              const style = {
                transform: `translateX(${(RADIUS * Math.sin(rad)).toFixed(1)}px) scaleX(${face.toFixed(3)})`,
                opacity: 0.15 + 0.85 * face,
              };
              return (
                <span key={at} className={`pick-tooth${major ? ' is-major' : ''}${choice ? ' is-choice' : ''}`} style={style}>
                  {choice && <b className={Math.round(at) === shown ? 'is-on' : undefined}>{choice.label}</b>}
                </span>
              );
            })}
          </div>
          <p className="pick-hint" aria-hidden="true">
            DRAG · SCROLL · ARROWS
          </p>
        </div>
      )}
    </div>
  );
}
