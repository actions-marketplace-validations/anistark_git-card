// The 3D contribution skyline. Plain three.js with named imports so the bundle tree-shakes.
// Night mode: emissive neon buildings, bloom, a grid floor and a scanner beam sweeping the weeks.
// Day mode: the same city printed in ink on yellow, no bloom.
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** [week, weekday, count, level 0-5, height 0-1, date] */
export type Cell = [number, number, number, number, number, string];

interface Options {
  onHover: (cell: Cell | null) => void;
  onReady: () => void;
  /** Floats over the hovered tower with its count, kept on top of it as the view moves. Positioned in host pixels. */
  tag?: HTMLElement;
  /** Easter egg neon signs, each floating over its day's tower like the tag. */
  signs?: { date: string; text: string }[];
}

const GAP = 0.82;
const MAX_H = 7;
const RISE_MS = 1600;
const SWEEP_MS = 5200; // one scanner pass, including the rest before the next

interface Palette {
  levels: Color[];
  sea: Color;
  peak: Color;
  surface: Color;
  signal: Color;
  night: boolean;
}

// Same recipe as the CSS level ramp in cards/style.ts, resolved from the live page tokens.
function readPalette(): Palette {
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
    signal: token('--accent'),
    night,
  };
}

export function mountSkyline(host: HTMLElement, cells: Cell[], weeks: number, { onHover, onReady, tag, signs = [] }: Options): () => void {
  // No calendar, no city. Three.js also cannot build per-tile colors for an empty set.
  if (!cells.length) return () => {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const fog = new Fog(0x000000, 55, 120);
  scene.fog = fog;
  const camera = new PerspectiveCamera(30, 1, 1, 400);
  camera.position.set(0, 36, 54);
  scene.add(new AmbientLight(0xffffff, 1.1));
  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(10, 18, 8);
  const fill = new DirectionalLight(0xffffff, 0.4);
  fill.position.set(-12, 6, -10);
  scene.add(key, fill);

  const city = new Group();
  scene.add(city);

  // Buildings glow in their own color, and light up as the scanner passes over them.
  const uniforms = {
    uGlow: { value: 0.22 },
    uBeamX: { value: -999 },
    uBeamColor: { value: new Color() },
    uTime: { value: 0 },
    uWave: { value: reduced ? 0 : 1 },
  };
  const geometry = new BoxGeometry(1, 1, 1);
  // 1 for sea tiles (empty days), which the vertex shader moves as waves. Buildings stay put.
  geometry.setAttribute('aSea', new InstancedBufferAttribute(new Float32Array(cells.map((c) => (c[3] === 0 ? 1 : 0))), 1));
  const material = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSea;\nuniform float uTime;\nuniform float uWave;\nvarying float vCityX;\nvarying float vCrest;',
      )
      .replace(
        '#include <project_vertex>',
        `vec4 cityPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          cityPos = instanceMatrix * cityPos;
        #endif
        // Sea: a swell rolls across every 7 seconds over a faint constant ripple.
        float front = mix( -40.0, 40.0, mod( uTime, 7.0 ) / 7.0 );
        float d = cityPos.x + cityPos.z * 0.5 - front;
        float swell = exp( -d * d / 10.0 );
        float ripple = sin( cityPos.x * 0.9 + cityPos.z * 1.4 + uTime * 1.5 );
        cityPos.y += aSea * uWave * ( swell * 0.35 + ripple * 0.03 );
        vCrest = aSea * uWave * swell;
        vCityX = cityPos.x;
        vec4 mvPosition = modelViewMatrix * cityPos;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vCityX;\nvarying float vCrest;\nuniform float uGlow;\nuniform float uBeamX;\nuniform vec3 uBeamColor;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          totalEmissiveRadiance += vColor.rgb * uGlow;
          totalEmissiveRadiance += vColor.rgb * vCrest * 0.9; // wave crests catch the light
        #endif
        totalEmissiveRadiance += uBeamColor * smoothstep( 1.4, 0.0, abs( vCityX - uBeamX ) );`,
      );
  };
  const mesh = new InstancedMesh(geometry, material, cells.length);
  city.add(mesh);

  const grid = new GridHelper(90, 90);
  const gridMaterial = grid.material as LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.depthWrite = false;
  // Cell centers sit on whole or half units depending on the week count. Shift the grid to run between buildings.
  grid.position.set(weeks % 2 === 0 ? 0.5 : 0, -0.01, 0.5);
  // The wire floor is faint under the city and dissolves within a few cells of it, instead of running to the fog.
  gridMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uOffset = { value: new Vector2(grid.position.x, grid.position.z) };
    shader.uniforms.uHalf = { value: new Vector2(weeks / 2 + 0.5, 3.5) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uOffset;\nvarying vec2 vFloor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = position.xz + uOffset;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uHalf;\nvarying vec2 vFloor;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float outside = length( max( abs( vFloor ) - uHalf, 0.0 ) );
        diffuseColor.a *= 1.0 - smoothstep( 0.0, 9.0, outside );`,
      );
  };
  city.add(grid);

  const beamMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  const beam = new Mesh(new PlaneGeometry(0.12, 9), beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.y = 0.05;
  beam.visible = false;
  city.add(beam);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.3, 0.62));
  composer.addPass(new OutputPass());

  let night = true;
  const paint = () => {
    const palette = readPalette();
    night = palette.night;
    // The peak day burns brighter than everything else so bloom catches it.
    const peak = palette.peak.clone().multiplyScalar(night ? 1.4 : 1); // brighter than the rest so bloom catches it, without a big halo
    // Empty days are sea, the peak day is a bright neon green tower, the rest use the cyan ramp.
    cells.forEach((cell, i) => mesh.setColorAt(i, cell[3] === 5 ? peak : cell[3] === 0 ? palette.sea : palette.levels[cell[3]]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.background = palette.surface;
    fog.color.copy(palette.surface);
    uniforms.uGlow.value = night ? 0.22 : 0;
    uniforms.uBeamColor.value.copy(palette.signal).multiplyScalar(night ? 0.85 : 0.5);
    gridMaterial.color.copy(palette.signal);
    gridMaterial.opacity = night ? 0.12 : 0.08;
    beamMaterial.color.copy(palette.signal);
    beamMaterial.blending = night ? AdditiveBlending : NormalBlending;
    render();
  };

  const dummy = new Object3D();
  const place = (progress: (cell: Cell) => number) => {
    cells.forEach((cell, i) => {
      const [w, d, count, , height] = cell;
      const full = count > 0 ? 0.15 + height * MAX_H : 0.04;
      const h = Math.max(0.04, full * progress(cell));
      dummy.position.set(w - weeks / 2, h / 2, d - 3);
      dummy.scale.set(GAP, h, GAP);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {
    enableZoom: false,
    enablePan: false,
    minPolarAngle: 0.3,
    maxPolarAngle: 1.35,
    minAzimuthAngle: -0.9,
    maxAzimuthAngle: 0.9,
  });
  controls.target.set(0, 1.5, 0);
  renderer.domElement.style.touchAction = 'pan-y'; // let vertical swipes scroll the page on phones
  controls.update();

  const signEls = signs.flatMap(({ date, text }, i) => {
    const index = cells.findIndex((c) => c[5] === date && c[2] > 0);
    if (index < 0) return [];
    const el = Object.assign(document.createElement('div'), { className: 'sky3d-sign', textContent: text });
    el.setAttribute('aria-hidden', 'true');
    el.style.animationDelay = `${i * 1.7}s`;
    host.appendChild(el);
    return [{ index, el }];
  });

  function render() {
    if (night) composer.render();
    else renderer.render(scene, camera);
    placeOverlays();
  }

  function placeOverlays() {
    placeTag();
    for (const { index, el } of signEls) {
      el.hidden = index === hovered; // the count tag takes its place
      if (!el.hidden) el.style.transform = roofAt(index);
    }
  }

  // A tower's top, projected to the screen every frame, since the city rises, sways and orbits.
  const instance = new Matrix4();
  const top = new Vector3();
  const turn = new Quaternion();
  const size = new Vector3();
  function roofAt(index: number) {
    mesh.getMatrixAt(index, instance);
    instance.decompose(top, turn, size);
    top.y += size.y / 2;
    top.applyMatrix4(mesh.matrixWorld).project(camera);
    return `translate(${((top.x + 1) / 2) * host.clientWidth}px, ${((1 - top.y) / 2) * host.clientHeight}px) translate(-50%, -100%)`;
  }
  function placeTag() {
    if (!tag) return;
    const cell = cells[hovered];
    if (!cell || cell[2] === 0) {
      tag.hidden = true;
      return;
    }
    tag.textContent = cell[2].toLocaleString();
    tag.style.transform = roofAt(hovered);
    tag.hidden = false;
  }

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };

  // Hover picking for the day readout.
  const ray = new Raycaster();
  const pointer = new Vector2();
  let hovered = -1;
  const onPointerMove = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(mesh)[0]?.instanceId ?? -1;
    if (hit === hovered) return;
    hovered = hit;
    onHover(hit >= 0 ? cells[hit] : null);
    placeOverlays();
  };
  const onPointerLeave = () => {
    hovered = -1;
    onHover(null);
    placeOverlays();
  };
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  // Only animate while on screen. With reduced motion, only render when something changes.
  let frame = 0;
  let visible = true;
  let start = -1;
  let risen = reduced;
  const reach = weeks / 2 + 2;
  const tick = (now: number) => {
    frame = 0;
    if (!visible) return;
    if (start < 0) start = now;
    const t = (now - start) / RISE_MS;
    if (!risen) {
      // Weeks rise left to right, each easing out.
      place((cell) => {
        const local = Math.min(1, Math.max(0, t * 1.6 - (cell[0] / weeks) * 0.6));
        return 1 - Math.pow(1 - local, 3);
      });
      if (t >= 1) risen = true;
    }
    if (!reduced) {
      city.rotation.y = Math.sin((now / 1000) * 0.18) * 0.22; // a slow sway, never showing the back
      uniforms.uTime.value = now / 1000;
      // The scanner starts once the city is up, crosses in the first 60% of each cycle, then rests.
      const phase = risen ? ((((now - start - RISE_MS) % SWEEP_MS) + SWEEP_MS) % SWEEP_MS) / (SWEEP_MS * 0.6) : 2;
      beam.visible = phase <= 1;
      beam.position.x = -reach + phase * reach * 2;
      uniforms.uBeamX.value = beam.visible ? beam.position.x : -999;
    }
    render();
    if (!reduced || !risen) frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  controls.addEventListener('change', () => (reduced ? render() : play()));

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
  });
  io.observe(host);

  const media = matchMedia('(prefers-color-scheme: light)');
  media.addEventListener('change', paint);
  const themeObserver = new MutationObserver(paint);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  place(() => (reduced ? 1 : 0));
  paint(); // before the first sized render, so the shader compiles with instance colors
  resize();
  play();
  requestAnimationFrame(onReady);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    io.disconnect();
    themeObserver.disconnect();
    media.removeEventListener('change', paint);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
    controls.dispose();
    composer.dispose();
    geometry.dispose();
    material.dispose();
    gridMaterial.dispose();
    grid.geometry.dispose();
    beam.geometry.dispose();
    beamMaterial.dispose();
    mesh.dispose();
    for (const { el } of signEls) el.remove();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
