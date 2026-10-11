// Weather for the 3D skyline: the same five states as the SVG card (src/cards/Weather.tsx), built from plain
// three.js objects. Rain, lightning, fog and fireworks live in the city group, so they sway with it. Stars and
// clouds hang on the camera as a backdrop, because the camera looks down on the city and a sky behind it in
// world space would sit below the ground.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Fog,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Vector3,
  type Blending,
  type Material,
} from 'three';
import type { WeatherState } from '../lib/weather';

export interface WeatherPalette {
  rain: Color;
  fog: Color;
  signal: Color;
  data: Color;
  hot: Color;
  text: Color;
  night: boolean;
}

export interface WeatherSetup {
  state: WeatherState;
  /** Roof of the busiest tower of the forecast week, in city coordinates. Lightning strikes it. */
  strike: Vector3 | null;
  /** Roof of the peak tower, in city coordinates. The searchlight stands on it. */
  peak: Vector3 | null;
  /** Half the city's width along the weeks. */
  reach: number;
  /** Seeds the scatter, so a city keeps the same sky between visits. */
  seed: string;
  /** Freeze on a still frame. */
  still: boolean;
}

export interface WeatherScene {
  /** Advance to a time in seconds. Returns how bright a lightning flash is right now, 0-1. */
  update(seconds: number): number;
  paint(palette: WeatherPalette): void;
  /** Fit the camera backdrop to a new aspect ratio. */
  resize(aspect: number): void;
  dispose(): void;
}

/** Small seeded generator (mulberry32), so the same login always gets the same scatter. */
function random(seed: string) {
  let a = 2166136261;
  for (const c of seed) a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft white blob on a transparent canvas, for star points, sparks, clouds and fog sheets. */
function softTexture(w = 64, h = 64) {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d')!;
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / 2, h / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  return new CanvasTexture(canvas);
}

// Same timing as the SVG keyframes, so both views flash on the same beat.
const STRIKE_S = 6;
const BURST_S = 2.7;
const SWEEP_S = 14;

/** How bright the bolt is at a point in the strike cycle: two quick flashes near the end. */
function strikeAt(seconds: number): number {
  const p = (seconds % STRIKE_S) / STRIKE_S;
  if (p < 0.79 || p >= 0.87) return 0;
  return p < 0.81 ? 1 : p < 0.83 ? 0.15 : 1;
}

export function addWeather(city: Group, camera: PerspectiveCamera, fog: Fog, setup: WeatherSetup): WeatherScene {
  const { state, reach, still } = setup;
  const rand = random(`${setup.seed}:3d`);
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(thing: T) => (disposables.push(thing), thing);
  const blended: Material[] = [];
  const updates: ((s: number) => void)[] = [];
  const painters: ((p: WeatherPalette) => void)[] = [];
  let flash = 0;

  // Backdrop on the camera: one unit is half the view height, x is scaled by the aspect ratio on resize.
  const backdrop = new Group();
  const DEPTH = 150;
  const halfH = DEPTH * Math.tan(((camera.fov / 2) * Math.PI) / 180);
  backdrop.position.z = -DEPTH;
  camera.add(backdrop);

  const dot = own(softTexture());

  // ---- Stars ------------------------------------------------------------------------------------
  if (state === 'clear' || state === 'fireworks') {
    // Two layers twinkling out of step. Pixel sized, so they stay crisp at any distance.
    for (const layer of [0, 1]) {
      const count = state === 'clear' ? 70 : 35;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) positions.set([rand() * 2 - 1, 0.2 + rand() * 0.8, 0], i * 3);
      const geometry = own(new BufferGeometry());
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      const material = own(
        new PointsMaterial({ size: layer ? 2.4 : 1.6, sizeAttenuation: false, map: dot, transparent: true, depthWrite: false, fog: false }),
      );
      const points = new Points(geometry, material);
      backdrop.add(points);
      painters.push((p) => material.color.copy(p.text));
      updates.push((s) => (material.opacity = 0.55 + 0.35 * Math.sin(s * 1.7 + layer * Math.PI)));
    }
  }

  // ---- Searchlight ------------------------------------------------------------------------------
  if (state === 'clear' && setup.peak) {
    const height = 26;
    const geometry = own(new ConeGeometry(1.7, height, 32, 1, true));
    geometry.rotateX(Math.PI); // apex down
    geometry.translate(0, height / 2, 0); // apex at the origin, on the roof
    // Fades out toward the far end, and in from the roof so the base does not look like a hard point.
    const material = own(
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0.05 } },
        vertexShader: `varying float vT; void main() { vT = position.y / ${height.toFixed(1)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vT;
          void main() { gl_FragColor = vec4(uColor, uOpacity * (1.0 - vT) * smoothstep(0.0, 0.08, vT)); }`,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    blended.push(material);
    const beam = new Mesh(geometry, material);
    const mount = new Group();
    mount.position.copy(setup.peak);
    mount.rotation.x = -0.35; // lean away from the viewer, into the sky behind
    mount.add(beam);
    city.add(mount);
    painters.push((p) => {
      material.uniforms.uColor.value.copy(p.signal);
      material.uniforms.uOpacity.value = p.night ? 0.05 : 0.12; // both faces add up, and bloom brightens it
    });
    updates.push((s) => (beam.rotation.z = 0.05 + 0.32 * Math.sin((s / SWEEP_S) * Math.PI * 2)));
  }

  // ---- Rain -------------------------------------------------------------------------------------
  if (state === 'rain' || state === 'storm') {
    const count = state === 'storm' ? 1600 : 900;
    const box = { x: reach + 8, top: 19, z0: -12, z1: 9 };
    const len = 0.9;
    const slant = 0.24;
    const drops = Array.from({ length: count }, () => ({
      x: (rand() * 2 - 1) * box.x,
      y: rand() * box.top,
      z: box.z0 + rand() * (box.z1 - box.z0),
      speed: 18 + rand() * 9,
    }));
    const positions = new Float32Array(count * 6);
    const geometry = own(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = own(new LineBasicMaterial({ transparent: true, depthWrite: false }));
    blended.push(material);
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    city.add(lines);
    const write = (s: number) => {
      drops.forEach((d, i) => {
        // Fall from the drop's own start, wrapping back to the top: no state, so a still frame is just a time.
        const y = (((d.y - s * d.speed) % box.top) + box.top) % box.top;
        const x = d.x - (d.y - y) * slant;
        positions.set([x, y, d.z, x + len * slant, y + len, d.z], i * 6);
      });
      geometry.attributes.position.needsUpdate = true;
    };
    painters.push((p) => {
      material.color.copy(p.rain);
      material.opacity = state === 'storm' ? 0.4 : 0.45;
    });
    updates.push(write);
  }

  // ---- Lightning and storm clouds ---------------------------------------------------------------
  if (state === 'storm') {
    const target = setup.strike ?? new Vector3(reach * 0.6, 2, 0);
    // From the city side of the roof, so a strike on the last week still comes down in view.
    const start = new Vector3(target.x - 4, 20, target.z - 3);
    const steps = 7;
    const bolt: Vector3[] = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const jag = i === 0 || i === steps ? 0 : (i % 2 ? -0.9 : 0.8) * (1 - t * 0.4);
      return new Vector3().lerpVectors(start, target, t).add(new Vector3(jag, 0, jag * 0.3));
    });
    const fork = bolt[2];
    const branch = [
      fork,
      fork.clone().add(new Vector3(1.4, -1.6, 0.4)),
      fork.clone().add(new Vector3(1.1, -3.1, 0.6)),
      fork.clone().add(new Vector3(2.2, -4.4, 0.8)),
    ];
    const material = own(new LineBasicMaterial({ transparent: true, depthWrite: false }));
    blended.push(material);
    // Two strands a hair apart, since WebGL lines are one pixel wide. Bloom does the rest, so keep them dim
    // or the glow washes over the whole frame.
    for (const offset of [0, 0.06]) {
      for (const path of [bolt, branch]) {
        const geometry = own(new BufferGeometry().setFromPoints(path.map((p) => p.clone().add(new Vector3(offset, 0, offset)))));
        city.add(new Line(geometry, material));
      }
    }
    painters.push((p) => material.color.copy(p.signal).multiplyScalar(p.night ? 0.9 : 1));
    updates.push((s) => {
      flash = still ? 0 : strikeAt(s);
      material.opacity = still ? 1 : flash;
    });

    // Clouds: soft dark blobs along the top of the view, drifting slowly.
    const cloudMaterial = own(new MeshBasicMaterial({ map: dot, transparent: true, depthWrite: false, fog: false }));
    const plane = own(new PlaneGeometry(1, 1));
    const clouds = Array.from({ length: 7 }, (_, i) => {
      const cloud = new Mesh(plane, cloudMaterial);
      cloud.position.set(-1.1 + (i / 6) * 2.2 + (rand() - 0.5) * 0.2, 0.78 + rand() * 0.14, 0);
      cloud.scale.set(0.55 + rand() * 0.4, 0.2 + rand() * 0.1, 1);
      backdrop.add(cloud);
      return { cloud, x: cloud.position.x };
    });
    painters.push((p) => {
      cloudMaterial.color.copy(p.fog);
      cloudMaterial.opacity = 0.5;
    });
    updates.push((s) => clouds.forEach((c, i) => (c.cloud.position.x = c.x + Math.sin(s * 0.25 + i) * 0.04)));
  }

  // ---- Fog ----------------------------------------------------------------------------------------
  if (state === 'fog') {
    fog.near = 32;
    fog.far = 88;
    const material = own(new MeshBasicMaterial({ map: dot, transparent: true, depthWrite: false }));
    const plane = own(new PlaneGeometry(1, 1));
    // Low sheets lying along the weekday rows, drifting back and forth. Towers rise through them.
    const sheets = [
      { y: 0.4, z: -3.5, depth: 6 },
      { y: 1.1, z: 0, depth: 7 },
      { y: 0.7, z: 3.6, depth: 6 },
      { y: 1.9, z: -1.5, depth: 8 },
      { y: 2.8, z: 1.5, depth: 9 },
      { y: 0.3, z: 7, depth: 7 },
    ].map(({ y, z, depth }, i) => {
      const sheet = new Mesh(plane, material);
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.set(0, y, z);
      sheet.scale.set(reach * 2.4 + 10 * (i % 2), depth, 1);
      city.add(sheet);
      return { sheet, phase: i * 1.9 };
    });
    painters.push((p) => {
      material.color.copy(p.fog);
      material.opacity = 0.7;
    });
    updates.push((s) => sheets.forEach(({ sheet, phase }) => (sheet.position.x = Math.sin(s * 0.35 + phase) * 2.2)));
  }

  // ---- Fireworks ----------------------------------------------------------------------------------
  if (state === 'fireworks') {
    const sparks = 160;
    const bursts = [0, 1, 2].map((i) => {
      const center = new Vector3(reach - 15 + i * 7, 8.5 + (i === 1 ? 2 : 0) + rand(), -1 + rand() * 1.5);
      const directions = Array.from({ length: sparks }, () => {
        // Even-ish spread on a sphere.
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        return new Vector3(r * Math.cos(a), u, r * Math.sin(a)).multiplyScalar(0.75 + rand() * 0.25);
      });
      const positions = new Float32Array(sparks * 3);
      const geometry = own(new BufferGeometry());
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      const material = own(new PointsMaterial({ size: 0.8, map: dot, transparent: true, depthWrite: false }));
      blended.push(material);
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      city.add(points);
      return { i, center, directions, positions, geometry, material, size: 5 + rand() * 1.5 };
    });
    const tones: (keyof WeatherPalette)[] = ['signal', 'data', 'hot'];
    painters.push((p) => bursts.forEach((b) => b.material.color.copy(p[tones[b.i]] as Color).multiplyScalar(p.night ? 1.8 : 1)));
    updates.push((s) => {
      for (const b of bursts) {
        // Open fast, hang, fade and sag. The still frame is a burst at full size.
        const phase = still ? 0.45 : ((((s - b.i * 0.9) % BURST_S) + BURST_S) % BURST_S) / BURST_S;
        const open = 1 - Math.pow(1 - Math.min(1, phase / 0.5), 3);
        const sag = phase * phase * 2.5;
        b.material.opacity = phase < 0.08 ? phase / 0.08 : phase < 0.5 ? 1 : Math.max(0, 1 - (phase - 0.5) / 0.22);
        b.directions.forEach((d, k) =>
          b.positions.set(
            [b.center.x + d.x * b.size * open, b.center.y + d.y * b.size * open - sag, b.center.z + d.z * b.size * open],
            k * 3,
          ),
        );
        b.geometry.attributes.position.needsUpdate = true;
      }
    });
  }

  return {
    update(seconds) {
      for (const u of updates) u(seconds);
      return flash;
    },
    paint(palette) {
      const blending: Blending = palette.night ? AdditiveBlending : NormalBlending;
      for (const m of blended) {
        m.blending = blending;
        m.needsUpdate = true;
      }
      for (const p of painters) p(palette);
    },
    resize(aspect) {
      backdrop.scale.set(halfH * aspect, halfH, 1);
    },
    dispose() {
      backdrop.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
