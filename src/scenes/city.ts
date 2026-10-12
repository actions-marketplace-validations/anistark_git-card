// Night City in 3D: every resident's skyline as a district on its own island, all in one sea. One instanced mesh
// for the towers, one for the islands, one invisible box per district for picking, a radar sweep from the old
// town and the same neon bloom as the skyline. Far districts collapse to one tower per week.
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DISTRICT, districtDays, plots, stature, type Resident } from '../lib/city';
import { bloomComposer, readPalette, SEA_WAVE } from './common';

interface Options {
  onHover: (index: number | null) => void;
  /** A click on a district, without a drag in between. */
  onSelect: (index: number) => void;
  onReady: () => void;
  /** Login plates over the districts nearest the view. The scene places them and shows at most `MAX_PLATES`. */
  plates: HTMLElement[];
  /** Small screens: fewer districts in full detail, a lower pixel ratio. */
  small: boolean;
}

export interface CityScene {
  /** Fly to a district and keep it marked. */
  focus: (index: number) => void;
  dispose: () => void;
}

const MAX_H = 7;
const ISLAND_H = 0.35;
const GAP = 0.82;
const RISE_MS = 1800;
const SWEEP_S = 9; // one radar turn
const MAX_PLATES = 18;
const FLY_MS = 1200;

/** Heights over this share of the peak get the top of the ramp. The peak day itself is neon green. */
const levelOf = (h: number) => (h >= 1 ? 5 : h > 0.75 ? 4 : h > 0.55 ? 3 : h > 0.35 ? 2 : 1);

export function mountCity(host: HTMLElement, residents: Resident[], opts: Options): CityScene {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const places = plots(residents.length);
  const fullDetail = opts.small ? 120 : 320;

  // Towers: each day with work, or each week's busiest day for districts past the detail limit.
  interface Tower {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    level: number;
    district: number;
  }
  const towers: Tower[] = [];
  residents.forEach((r, i) => {
    const { x, z } = places[i];
    const lift = stature(r.total);
    const days = districtDays(r);
    if (i < fullDetail) {
      for (const [week, day, h] of days) {
        towers.push({
          x: x + week - DISTRICT.w / 2 + 0.5,
          z: z + day - DISTRICT.d / 2 + 0.5,
          w: GAP,
          d: GAP,
          h: 0.15 + h * MAX_H * lift,
          level: levelOf(h),
          district: i,
        });
      }
      return;
    }
    const weeks = new Map<number, number>();
    for (const [week, , h] of days) weeks.set(week, Math.max(weeks.get(week) ?? 0, h));
    for (const [week, h] of weeks) {
      towers.push({
        x: x + week - DISTRICT.w / 2 + 0.5,
        z,
        w: GAP,
        d: DISTRICT.d - 1.5,
        h: 0.15 + h * MAX_H * lift,
        level: levelOf(h),
        district: i,
      });
    }
  });
  const radius = Math.max(36, ...places.map((p) => Math.hypot(p.x, p.z) + DISTRICT.w / 2));

  const renderer = new WebGLRenderer({ antialias: !opts.small });
  renderer.setPixelRatio(Math.min(devicePixelRatio, opts.small ? 1.5 : 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const fog = new Fog(0x000000, 100, 400);
  scene.fog = fog;
  const camera = new PerspectiveCamera(32, 1, 1, radius * 14);
  scene.add(new AmbientLight(0xffffff, 1.1));
  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(10, 18, 8);
  const fill = new DirectionalLight(0xffffff, 0.4);
  fill.position.set(-12, 6, -10);
  scene.add(key, fill);
  const city = new Group();
  scene.add(city);

  // The radar: buildings light up as the sweep from the old town passes over them.
  const uniforms = {
    uGlow: { value: 0.22 },
    uSweep: { value: -99 },
    uBeamColor: { value: new Color() },
  };
  const box = new BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0); // grow up from the ground
  const towerMaterial = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
  towerMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCityXZ;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
        vec4 cityPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          cityPos = instanceMatrix * cityPos;
        #endif
        vCityXZ = cityPos.xz;`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vCityXZ;\nuniform float uGlow;\nuniform float uSweep;\nuniform vec3 uBeamColor;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          totalEmissiveRadiance += vColor.rgb * uGlow;
        #endif
        // How far behind the sweep this point is, in radians. The glow fades out behind it like a radar trail.
        float behind = mod( uSweep - atan( -vCityXZ.y, vCityXZ.x ), 6.2831853 );
        totalEmissiveRadiance += uBeamColor * ( smoothstep( 0.45, 0.0, behind ) * 0.35 + step( behind, 0.025 ) * 0.25 );`,
      );
  };
  const towerMesh = new InstancedMesh(box, towerMaterial, Math.max(1, towers.length));
  towerMesh.count = towers.length;
  city.add(towerMesh);

  // Islands: a low slab under each district. Landmarks get a yellow rim to tell them from citizens.
  const islandMaterial = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
  const islands = new InstancedMesh(box, islandMaterial, Math.max(1, residents.length));
  islands.count = residents.length;
  city.add(islands);
  const rims = new InstancedMesh(
    box,
    new MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
    Math.max(1, residents.length),
  );
  rims.count = residents.length;
  city.add(rims);

  // Picking: an invisible box over each district, as tall as its tallest tower.
  const pickMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const picks = new InstancedMesh(box, pickMaterial, Math.max(1, residents.length));
  picks.count = residents.length;
  city.add(picks);

  // The sea: one plane, shaded per pixel with the same swell as the skyline's sea tiles, and a faint grid.
  const seaUniforms = {
    uTime: { value: 0 },
    uSea: { value: new Color() },
    uSurface: { value: new Color() },
    uGrid: { value: new Color() },
    uWave: { value: reduced ? 0 : 1 },
  };
  const seaMaterial = new MeshBasicMaterial();
  seaMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seaUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec2 vSeaXZ;\nuniform float uTime;\nuniform float uWave;\nuniform vec3 uSea;\nuniform vec3 uSurface;\nuniform vec3 uGrid;\n${SEA_WAVE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wave = seaWave( vSeaXZ, uTime );
        vec2 cell = abs( fract( vSeaXZ / 4.0 ) - 0.5 );
        float line = 1.0 - smoothstep( 0.0, 0.035, min( cell.x, cell.y ) );
        // Dark water close to the page, the swell catching a little of the sea color as it passes. Linear color, so small mixes.
        diffuseColor.rgb = mix( uSurface, uSea, 0.05 + 0.1 * wave.y * uWave ) + uGrid * line * 0.025;`,
      );
  };
  const sea = new Mesh(new PlaneGeometry(radius * 8, radius * 8), seaMaterial);
  sea.rotation.x = -Math.PI / 2;
  city.add(sea);

  // The sweep's beam, a thin line from the centre out past the last district.
  const beamMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const beamGeometry = new PlaneGeometry(radius + 10, 0.25);
  beamGeometry.translate((radius + 10) / 2, 0, 0);
  const beam = new Mesh(beamGeometry, beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.y = ISLAND_H + 0.05;
  beam.visible = !reduced;
  city.add(beam);

  const composer = bloomComposer(renderer, scene, camera);

  const dummy = new Object3D();
  const place = (progress: (t: Tower) => number) => {
    towers.forEach((t, i) => {
      dummy.position.set(t.x, ISLAND_H, t.z);
      dummy.scale.set(t.w, Math.max(0.02, t.h * progress(t)), t.d);
      dummy.updateMatrix();
      towerMesh.setMatrixAt(i, dummy.matrix);
    });
    towerMesh.instanceMatrix.needsUpdate = true;
    towerMesh.computeBoundingSphere();
  };
  const tallest = residents.map(() => 0);
  for (const t of towers) tallest[t.district] = Math.max(tallest[t.district], t.h);
  places.forEach(({ x, z }, i) => {
    dummy.position.set(x, 0, z);
    dummy.scale.set(DISTRICT.w + 1.5, ISLAND_H, DISTRICT.d + 1.5);
    dummy.updateMatrix();
    islands.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(DISTRICT.w + 1.9, 0.06, DISTRICT.d + 1.9);
    dummy.position.y = ISLAND_H * 0.5;
    dummy.updateMatrix();
    rims.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0;
    dummy.scale.set(DISTRICT.w + 1.5, ISLAND_H + tallest[i] + 0.5, DISTRICT.d + 1.5);
    dummy.updateMatrix();
    picks.setMatrixAt(i, dummy.matrix);
  });
  for (const mesh of [islands, rims, picks]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  let marked = -1;
  let hovered = -1;
  let night = true;
  // Citizens have a cyan rim, landmarks a yellow one, and the hovered or focused district lights up.
  let rimColors = { citizen: new Color(), landmark: new Color(), active: new Color() };
  const paintRims = () => {
    residents.forEach((r, i) =>
      rims.setColorAt(i, i === marked || i === hovered ? rimColors.active : r.number === null ? rimColors.landmark : rimColors.citizen),
    );
    if (rims.instanceColor) rims.instanceColor.needsUpdate = true;
  };
  const paint = () => {
    const palette = readPalette();
    night = palette.night;
    const peak = palette.peak.clone().multiplyScalar(night ? 1.4 : 1);
    towers.forEach((t, i) => towerMesh.setColorAt(i, t.level === 5 ? peak : palette.levels[t.level]));
    residents.forEach((_, i) => islands.setColorAt(i, palette.raised));
    for (const mesh of [towerMesh, islands]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    rimColors = {
      citizen: palette.raised.clone().lerp(palette.data, 0.35).multiplyScalar(0.7),
      landmark: palette.signal.clone().multiplyScalar(0.7),
      active: palette.data.clone().multiplyScalar(1.3),
    };
    paintRims();
    scene.background = palette.surface;
    fog.color.copy(palette.surface);
    seaUniforms.uSea.value.copy(palette.sea);
    seaUniforms.uSurface.value.copy(palette.surface);
    seaUniforms.uGrid.value.copy(palette.signal);
    uniforms.uBeamColor.value.copy(palette.signal).multiplyScalar(night ? 0.85 : 0.5);
    beamMaterial.color.copy(palette.signal);
    render();
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {
    enableDamping: !reduced,
    dampingFactor: 0.08,
    screenSpacePanning: false,
    minDistance: 18,
    maxDistance: radius * 3.2,
    minPolarAngle: 0.15,
    maxPolarAngle: 1.32,
  });
  renderer.domElement.style.touchAction = 'none';

  // The opening view: the whole city from above and to the south, a bit tilted.
  const overview = () => {
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const fit = radius / (tanV * Math.min(1, camera.aspect));
    return { target: new Vector3(0, 0, 0), position: new Vector3(0, fit * 0.55, fit * 0.82) };
  };
  const start = overview();
  controls.target.copy(start.target);
  camera.position.copy(start.position);

  // Flying: target and camera ease to the new view.
  let flight: { from: { target: Vector3; position: Vector3 }; to: { target: Vector3; position: Vector3 }; at: number } | null = null;
  const flyTo = (to: { target: Vector3; position: Vector3 }) => {
    if (reduced) {
      controls.target.copy(to.target);
      camera.position.copy(to.position);
      controls.update();
      render();
      return;
    }
    flight = { from: { target: controls.target.clone(), position: camera.position.clone() }, to, at: performance.now() };
    play();
  };

  const plateAt = new Vector3();
  const placed: { x: number; y: number }[] = [];
  function placePlates() {
    // Plates only once the view is close enough to read them, nearest first, never one on top of another.
    // The marked and hovered districts always get theirs.
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const near = ((DISTRICT.w * 0.62) / tanV) * 2.2;
    const order = places
      .map((p, i) => ({ i, d: camera.position.distanceTo(plateAt.set(p.x, 0, p.z)) }))
      .filter(({ i, d }) => d < near || i === marked || i === hovered)
      .sort((a, b) => Number(b.i === hovered || b.i === marked) - Number(a.i === hovered || a.i === marked) || a.d - b.d)
      .map((p) => p.i);
    placed.length = 0;
    const shown = new Map<number, string>();
    for (const i of order) {
      if (shown.size >= MAX_PLATES) break;
      plateAt
        .set(places[i].x, ISLAND_H + tallest[i] + 1, places[i].z)
        .applyMatrix4(city.matrixWorld)
        .project(camera);
      if (plateAt.z > 1 || Math.abs(plateAt.x) > 1.05 || Math.abs(plateAt.y) > 1.05) continue;
      const x = ((plateAt.x + 1) / 2) * host.clientWidth;
      const y = ((1 - plateAt.y) / 2) * host.clientHeight;
      if (placed.some((p) => Math.abs(p.x - x) < 110 && Math.abs(p.y - y) < 24)) continue;
      placed.push({ x, y });
      shown.set(i, `translate(${x}px, ${y}px) translate(-50%, -100%)`);
    }
    opts.plates.forEach((el, i) => {
      const at = shown.get(i);
      el.hidden = !at;
      if (!at) return;
      el.classList.toggle('is-active', i === marked || i === hovered);
      el.style.transform = at;
    });
  }

  function render() {
    // Fog starts a little short of what the camera looks at, so zooming out never buries the city.
    const distance = camera.position.distanceTo(controls.target);
    fog.near = distance * 0.85;
    fog.far = distance + radius * 1.8;
    if (night) composer.render();
    else renderer.render(scene, camera);
    placePlates();
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

  const ray = new Raycaster();
  const pointer = new Vector2();
  const pick = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(picks)[0]?.instanceId ?? -1;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons) return; // dragging the view
    const hit = pick(event);
    if (hit === hovered) return;
    hovered = hit;
    renderer.domElement.style.cursor = hit >= 0 ? 'pointer' : '';
    opts.onHover(hit >= 0 ? hit : null);
    paintRims();
    play();
  };
  const onPointerLeave = () => {
    if (hovered < 0) return;
    hovered = -1;
    opts.onHover(null);
    paintRims();
    play();
  };
  let down: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent) => (down = { x: event.clientX, y: event.clientY });
  const onPointerUp = (event: PointerEvent) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    down = null;
    const hit = pick(event);
    if (hit >= 0) opts.onSelect(hit);
  };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  // Only animate while on screen. With reduced motion, only render when something changes.
  let frame = 0;
  let visible = true;
  let born = -1;
  let risen = reduced;
  const tick = (now: number) => {
    frame = 0;
    if (!visible) return;
    if (born < 0) born = now;
    const t = (now - born) / RISE_MS;
    if (!risen) {
      // The old town rises first, then the city spreads out from it.
      place((tower) => {
        const local = MathUtils.clamp(t * 1.7 - (tower.district / Math.max(1, residents.length)) * 0.7, 0, 1);
        return 1 - Math.pow(1 - local, 3);
      });
      if (t >= 1) risen = true;
    }
    let moving = !reduced;
    if (flight) {
      const k = MathUtils.clamp((now - flight.at) / FLY_MS, 0, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      controls.target.lerpVectors(flight.from.target, flight.to.target, e);
      camera.position.lerpVectors(flight.from.position, flight.to.position, e);
      if (k >= 1) flight = null;
      moving = true;
    }
    if (!reduced) {
      const seconds = now / 1000;
      seaUniforms.uTime.value = seconds;
      const sweep = ((seconds / SWEEP_S) % 1) * Math.PI * 2;
      uniforms.uSweep.value = sweep;
      beam.rotation.z = sweep; // the beam lies flat, so its own z turns it around the city's y
    }
    controls.update(); // can fire 'change', which may already have asked for the next frame
    render();
    if ((moving || !risen) && !frame) frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  controls.addEventListener('change', () => (reduced && !flight ? render() : play()));

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
  });
  io.observe(host);
  const themeObserver = new MutationObserver(paint);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  place(() => (reduced ? 1 : 0));
  paint();
  controls.update();
  resize();
  play();
  requestAnimationFrame(opts.onReady);

  return {
    focus(index) {
      const p = places[index];
      if (!p) return;
      marked = index;
      paintRims();
      const target = new Vector3(p.x, ISLAND_H + 1.5, p.z);
      // Keep the current heading, just far enough back to frame the whole district.
      const tanV = Math.tan((camera.fov * Math.PI) / 360);
      const distance = (DISTRICT.w * 0.62) / (tanV * Math.min(1, camera.aspect));
      const heading = camera.position.clone().sub(controls.target).setY(0);
      if (heading.lengthSq() < 1) heading.set(0, 0, 1);
      heading.normalize().multiplyScalar(distance * 0.85);
      flyTo({
        target,
        position: target
          .clone()
          .add(heading)
          .setY(target.y + distance * 0.5),
      });
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      composer.dispose();
      box.dispose();
      beamGeometry.dispose();
      sea.geometry.dispose();
      for (const m of [towerMaterial, islandMaterial, rims.material as MeshBasicMaterial, pickMaterial, seaMaterial, beamMaterial])
        m.dispose();
      for (const m of [towerMesh, islands, rims, picks]) m.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
