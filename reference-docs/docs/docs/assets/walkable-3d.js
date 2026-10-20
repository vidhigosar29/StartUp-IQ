/* ============================================================
   walkable-3d.js — the 3D walkable map of India's startup
   ecosystem. A three.js scene in the spirit of "Summer
   Afternoon": a small explorer on painterly terrain, with the
   guide's real state geometry, terrain, and all 224 incubators.

   The walk itself is the Portfolio Map Network's: the same
   explorer, pace, controls and follow camera as every walk world in
   the network (site/network-walk.js, site/network-avatar.js), with
   India drawn at INDIA_UNITS_PER_KM, and the network's portal to the
   Nexus (site/network-portal.js).

   Everything interactive stays native DOM projected over the
   canvas — buttons and links keep their accessible names, the
   state drawer is the same one the 2D map used, and every
   record remains reachable without walking (see WALKABLE_MAP.md).
   ============================================================ */
import * as THREE from "./vendor/three.module.min.js";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  distance,
  placeDecor,
  placeOrganizations,
  seededRandom,
} from "./walkable-core.js";
import {
  KIND_ORDER,
  buildHeightField,
  decorArchetype,
  sampleGrid,
  valueNoise2D,
} from "./walkable-3d-core.js";
import {
  AREA_LABEL_RANGE,
  AVATAR_HEIGHT,
  AVATAR_RADIUS,
  DRAG_PITCH,
  DRAG_YAW,
  INDIA_UNITS_PER_KM,
  LABEL_RANGE,
  MEET_RANGE,
  ORBIT_RATE,
  PITCH_OFFSET,
  RUN_MULTIPLIER,
  WALK_SPEED,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  cameraPlace,
  cameraRelative,
  clamp,
  damp,
  fogRange,
  fovFor,
  lerpAngle,
  lookLift,
  networkUnitsPerMapUnit,
  pitchFor,
} from "./network-walk.js";
import { createAvatarKit, visitorSpec } from "./network-avatar.js";
import { buildPortal, portalAt, portalFootprint, portalPosts, portalStateAt } from "./network-portal.js";

/** Camera distance (network units) at or within which terrain names and peak markers appear. */
const DETAIL_DISTANCE = 18;
/** Decor scatter budget — instanced, so this stays cheap to render. */
const DECOR_COUNT = 5200;
/** The explorer the props, pins and hills were first drawn against, in map units. */
const LEGACY_EXPLORER_HEIGHT = 7;
/** Pins stand taller than props, as the network's pins do: about 1.5 explorers to the head. */
const PIN_SCALE = 2;
/** Height-field raster resolution. */
const GRID_W = 300;
const GRID_H = Math.round(GRID_W * MAP_HEIGHT / MAP_WIDTH); // 334

const root = document.querySelector("#walkable-map");

if (root) main(root);

function main(root) {
  /* ---------------- data ---------------- */
  const readJSON = (id) => JSON.parse(document.getElementById(id)?.textContent || "null");
  const incubators = readJSON("walkable-incubators") || [];
  const map = readJSON("india-map-data");
  const terrain = readJSON("india-terrain-data") || { relief: [], rivers: [], lakes: [], peaks: [] };
  const stateRecords = readJSON("walkable-states") || [];
  const stateMeta = Object.fromEntries(stateRecords.map((state) => [state.state, state]));
  const mapStates = map?.states || {};
  if (!mapStates.Lakshadweep?.d) {
    mapStates.Lakshadweep = {
      cx: 163.3,
      cy: 964.4,
      d: [
        "M148,952a2,2 0 1,0 0,4a2,2 0 1,0 0,-4",
        "M156,961.5a1.75,1.75 0 1,0 0,3.5a1.75,1.75 0 1,0 0,-3.5",
        "M163,962a2.25,2.25 0 1,0 0,4.5a2.25,2.25 0 1,0 0,-4.5",
        "M169,975.5a1.75,1.75 0 1,0 0,3.5a1.75,1.75 0 1,0 0,-3.5",
        "M174,988a2,2 0 1,0 0,4a2,2 0 1,0 0,-4",
        "M178,1031.5a2.5,2.5 0 1,0 0,5a2.5,2.5 0 1,0 0,-5",
      ].join(""),
    };
  }

  /* ---------------- the network's scale ----------------
     The scene is drawn in map units (3.1 km each: data/india-map.json's
     projection), and this world at INDIA_UNITS_PER_KM, so one network unit
     is NU map units. Props, pins and the hills were first drawn against a
     7-unit explorer; the network's explorer is AVATAR_HEIGHT network units,
     so they shrink by SIZE and keep their proportions to the walker. */
  const NU = 1 / networkUnitsPerMapUnit(map?.proj?.s || 35.917286940741604, INDIA_UNITS_PER_KM);
  const SIZE = (AVATAR_HEIGHT * NU) / LEGACY_EXPLORER_HEIGHT;
  /** Overlay draw distances, in map units. */
  const RANGE = {
    org: LABEL_RANGE * NU,
    landmark: AREA_LABEL_RANGE * NU,
    wayfinder: 300 * SIZE,
    transfer: 560 * SIZE,
    label: 380 * SIZE,
  };

  /* ---------------- DOM ---------------- */
  const viewport = root.querySelector(".walkable-viewport");
  const canvas = root.querySelector(".walkable-canvas");
  const overlay = root.querySelector(".walkable-overlay");
  const orgLayer = root.querySelector(".walkable-orgs");
  const landmarkLayer = root.querySelector(".walkable-landmarks");
  const wayfinderLayer = root.querySelector(".walkable-wayfinders");
  const labelLayer = root.querySelector(".walkable-terrain-labels");
  const fallback = root.querySelector(".walkable-3d-fallback");
  const minimapDot = root.querySelector(".walkable-minimap-dot");
  const nearbyButton = root.querySelector("#walkable-nearby");
  const zoomIn = root.querySelector("#walkable-zoom-in");
  const zoomOut = root.querySelector("#walkable-zoom-out");
  const zoomReset = root.querySelector("#walkable-zoom-reset");
  const zoomLevel = root.querySelector("#walkable-zoom-level");
  const recenter = root.querySelector("#walkable-recenter");
  const help = root.querySelector("#walkable-help");
  const drawer = root.querySelector("#state-drawer");
  const drawerBackdrop = root.querySelector(".walkable-drawer-backdrop");
  const drawerPanel = root.querySelector(".walkable-drawer-panel");
  const drawerBody = root.querySelector(".walkable-drawer-body");
  const drawerTitle = root.querySelector("#state-drawer-title");
  const drawerClose = root.querySelector("#state-drawer-close");
  const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* The Nexus portal (network-portal.js): its prompt, and the card shown on the way through. */
  const PORTAL_HREF = root.dataset.portalHref || "";
  const portalPrompt = root.querySelector("#walkable-portal");
  const portalDeparture = root.querySelector("#walkable-portal-departure");
  const portalStay = root.querySelector("#walkable-portal-stay");

  /* ---------------- renderer, or the graceful exit ---------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    if (!renderer.getContext()) throw new Error("no context");
  } catch {
    fallback.hidden = false;
    canvas.hidden = true;
    return;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* ---------------- shared labels/icons (as on the 2D map) ---------------- */
  const typeLabels = {
    Academic: "Academic incubator",
    TBI: "Technology Business Incubator",
    AIC: "Atal Incubation Centre",
    Government: "Government incubator",
    "Sector-specific": "Sector-specific incubator",
    Private: "Private incubator",
  };
  const typeKeys = {
    Academic: "academic",
    TBI: "tbi",
    AIC: "aic",
    Government: "government",
    "Sector-specific": "sector",
    Private: "private",
  };
  const iconPaths = {
    academic: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    tbi: '<path d="M12 21v-9"/><path d="M12 14c-5 0-7-3-7-7 4 0 7 2 7 7Zm0-3c4 0 6-3 6-6-4 0-6 2-6 6Z"/>',
    aic: '<path d="M14.5 4.5C17 2 20 2 20 2s0 3-2.5 5.5l-7 7-4-4 8-6Z"/><circle cx="15.5" cy="6.5" r="1.5"/><path d="M10.5 7H6L3 10l4 1.5M14 14l-1.5 4.5L9.5 21 9 15.5"/><path d="M7 17c-2 0-3 1-3 3 2 0 3-1 3-3Z"/>',
    government: '<path d="m3 9 9-5 9 5"/><path d="M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 20h18"/>',
    sector: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v4m0 10v4M3 12h4m10 0h4"/>',
    private: '<path d="M9 7V5h6v2"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 12h18m-11 0v2h4v-2"/>',
  };
  const icon = (type) => {
    const key = typeKeys[type] || type;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key] || iconPaths.private}</svg>`;
  };
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  /* ---------------- geometry hit-testing (identical to 2D) ---------------- */
  const hitContext = document.createElement("canvas").getContext("2d");
  const paths = Object.fromEntries(Object.entries(mapStates).map(([name, shape]) => [name, new Path2D(shape.d)]));
  const landPaths = Object.values(paths);
  const containsLand = (point) => landPaths.some((path) => hitContext.isPointInPath(path, point.x, point.y));
  const containsState = (name, point) => Boolean(paths[name] && hitContext.isPointInPath(paths[name], point.x, point.y));
  const safeAnchor = (name) => {
    const shape = mapStates[name];
    const origin = { x: shape?.cx || MAP_WIDTH / 2, y: shape?.cy || MAP_HEIGHT / 2 };
    if (containsState(name, origin)) return origin;
    for (let radius = 2; radius <= 80; radius += 2) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const point = { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
        if (containsState(name, point)) return point;
      }
    }
    return origin;
  };

  /* State bounding boxes come from a throwaway measuring SVG so incubator
     placement stays byte-identical with what the 2D map computed. */
  const stateAnchors = {};
  const stateBounds = {};
  {
    const svgNS = "http://www.w3.org/2000/svg";
    const measure = document.createElementNS(svgNS, "svg");
    measure.setAttribute("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
    measure.style.cssText = "position:absolute;left:-9999px;top:0;width:100px;height:111px;";
    document.body.append(measure);
    for (const [name, shape] of Object.entries(mapStates)) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", shape.d);
      measure.append(path);
      const box = path.getBBox();
      stateBounds[name] = { x: box.x, y: box.y, width: box.width, height: box.height };
      stateAnchors[name] = safeAnchor(name);
    }
    measure.remove();
  }

  const reliefOrder = { mtn: 0, desert: 1, wet: 2, plateau: 3, plain: 4 };
  const relief = [...(terrain.relief || [])].sort(
    (a, b) => (reliefOrder[a.kind] ?? 9) - (reliefOrder[b.kind] ?? 9));
  const reliefHitPaths = relief.map((region) => [region.kind, new Path2D(region.d)]);
  const kindAt = (point) => {
    for (const [kind, path] of reliefHitPaths)
      if (hitContext.isPointInPath(path, point.x, point.y)) return kind;
    return "other";
  };

  /* ---------------- palette from the design tokens ---------------- */
  const cssColor = (name, fallbackColor) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallbackColor;
  };
  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  function readPalette() {
    return {
      dark: isDark(),
      water: cssColor("--walk-water", "#dbeef4"),
      land: cssColor("--walk-land", "#e6efd2"),
      landAlt: cssColor("--walk-land-alt", "#d4e4b8"),
      border: cssColor("--walk-land-border", "#718b5b"),
      relief: {
        mtn: cssColor("--walk-relief-mtn", "#c3cfa4"),
        plateau: cssColor("--walk-relief-plateau", "#dfe3bd"),
        desert: cssColor("--walk-relief-desert", "#f0e6c4"),
        wet: cssColor("--walk-relief-wet", "#c2d9c4"),
        plain: cssColor("--walk-relief-plain", "#e8f0d2"),
      },
      river: cssColor("--walk-river", "#8fbccf"),
      lake: cssColor("--walk-lake", "#9fcbdc"),
      skyTop: cssColor("--walk3d-sky-top", "#6fb2e4"),
      skyHorizon: cssColor("--walk3d-sky-horizon", "#f3ecd7"),
      sea: cssColor("--walk3d-sea", "#8ec7db"),
      seaDeep: cssColor("--walk3d-sea-deep", "#5da3c2"),
      fog: cssColor("--walk3d-fog", "#e9eedd"),
      sun: cssColor("--walk3d-sun", "#fff3da"),
      cloud: cssColor("--walk3d-cloud", "#fffaf0"),
      trunk: cssColor("--walk3d-trunk", "#8a6642"),
      canopyA: cssColor("--walk3d-canopy-a", "#7fae62"),
      canopyB: cssColor("--walk3d-canopy-b", "#96a45c"),
      pine: cssColor("--walk3d-pine", "#5d8b58"),
      shrub: cssColor("--walk3d-shrub", "#a4b36a"),
      rock: cssColor("--walk3d-rock", "#b0a894"),
      orgTypes: {
        academic: cssColor("--org-academic", "#6d4fc4"),
        tbi: cssColor("--org-tbi", "#1f7a4d"),
        aic: cssColor("--org-aic", "#c05621"),
        government: cssColor("--org-government", "#b7791f"),
        sector: cssColor("--org-sector", "#0f766e"),
        private: cssColor("--org-private", "#2b6cb0"),
      },
    };
  }
  let palette = readPalette();

  /* ---------------- raster masks → height field ---------------- */
  const kindIndex = Object.fromEntries(KIND_ORDER.map((kind, index) => [kind, index]));
  function rasterizeGrids() {
    const canvas2d = document.createElement("canvas");
    canvas2d.width = GRID_W;
    canvas2d.height = GRID_H;
    const ctx = canvas2d.getContext("2d", { willReadFrequently: true });
    ctx.scale(GRID_W / MAP_WIDTH, GRID_H / MAP_HEIGHT);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.fillStyle = "#fff";
    for (const path of landPaths) ctx.fill(path);
    const landData = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    const land = new Float32Array(GRID_W * GRID_H);
    for (let index = 0; index < land.length; index += 1) land[index] = landData[index * 4] > 127 ? 1 : 0;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    // Painted lowest-priority first so the kind map matches kindAt()'s
    // first-match-wins order (mtn beats everything it overlaps).
    for (const region of [...relief].reverse()) {
      const index = kindIndex[region.kind] ?? 0;
      ctx.fillStyle = `rgb(${index * 40},0,0)`;
      ctx.fill(new Path2D(region.d));
    }
    const kindData = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    const kind = new Uint8Array(GRID_W * GRID_H);
    for (let index = 0; index < kind.length; index += 1) {
      kind[index] = Math.min(KIND_ORDER.length - 1, Math.round(kindData[index * 4] / 40));
    }
    return { land, kind };
  }
  const { land: landGrid, kind: kindGrid } = rasterizeGrids();
  const toGrid = (point) => ({
    x: point.x / MAP_WIDTH * (GRID_W - 1),
    y: point.y / MAP_HEIGHT * (GRID_H - 1),
  });
  /* Every landmark gets guaranteed dry ground under it; islands smaller than
     a raster cell (Lakshadweep's atolls) get their islets stamped directly. */
  const lakshadweepIslets = [
    { x: 150, y: 954 }, { x: 157.75, y: 963.25 }, { x: 165.25, y: 964.25 },
    { x: 170.75, y: 977.25 }, { x: 176, y: 990 }, { x: 180.5, y: 1034 },
  ];
  const bumps = [...Object.values(stateAnchors), ...lakshadweepIslets].map((anchor) => {
    const grid = toGrid(anchor);
    return { x: grid.x, y: grid.y, radius: 2.6, height: 1.7 };
  });
  const heightGrid = buildHeightField({
    width: GRID_W, height: GRID_H, land: landGrid, kind: kindGrid, bumps,
  });
  const heightAt = (x, y) => {
    const grid = toGrid({ x, y });
    return sampleGrid(heightGrid, GRID_W, GRID_H, grid.x, grid.y) * SIZE;
  };
  const groundAt = (x, y) => Math.max(heightAt(x, y), 0.35 * SIZE);

  /* ---------------- ground texture ---------------- */
  const TEXTURE_W = 2048;
  const TEXTURE_H = Math.round(TEXTURE_W * MAP_HEIGHT / MAP_WIDTH);
  const groundCanvas = document.createElement("canvas");
  groundCanvas.width = TEXTURE_W;
  groundCanvas.height = TEXTURE_H;
  const landUnion = new Path2D();
  for (const [, shape] of Object.entries(mapStates)) landUnion.addPath(new Path2D(shape.d));

  function paintGround() {
    const ctx = groundCanvas.getContext("2d");
    ctx.setTransform(TEXTURE_W / MAP_WIDTH, 0, 0, TEXTURE_H / MAP_HEIGHT, 0, 0);
    ctx.fillStyle = palette.water;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Shallow-water shelf: a soft halo hugging the coastline, visible through
    // the translucent sea surface.
    ctx.save();
    ctx.strokeStyle = palette.landAlt;
    ctx.globalAlpha = 0.4;
    ctx.lineJoin = "round";
    for (const width of [14, 7]) {
      ctx.lineWidth = width;
      ctx.stroke(landUnion);
    }
    ctx.restore();

    const statePaths = Object.entries(mapStates);
    statePaths.forEach(([, shape], index) => {
      // nth-child(3n) in the 2D stylesheet — every third state takes the
      // alternate tone, so the patchwork reads the same from the air.
      ctx.fillStyle = (index + 1) % 3 === 0 ? palette.landAlt : palette.land;
      ctx.fill(new Path2D(shape.d));
    });

    ctx.save();
    ctx.clip(landUnion);
    ctx.globalAlpha = 0.62;
    for (const region of [...relief].reverse()) {
      ctx.fillStyle = palette.relief[region.kind] || palette.land;
      ctx.fill(new Path2D(region.d));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.river;
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const river of terrain.rivers || []) ctx.stroke(new Path2D(river.d));
    ctx.fillStyle = palette.lake;
    for (const lake of terrain.lakes || []) ctx.fill(new Path2D(lake.d));
    ctx.restore();

    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = "round";
    for (const [, shape] of statePaths) ctx.stroke(new Path2D(shape.d));
  }
  paintGround();
  const groundTexture = new THREE.CanvasTexture(groundCanvas);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ---------------- scene ---------------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 6000);
  const centerX = MAP_WIDTH / 2;
  const centerZ = MAP_HEIGHT / 2;

  scene.fog = new THREE.Fog(new THREE.Color(palette.fog), fogRange(ZOOM_DEFAULT).near * NU, fogRange(ZOOM_DEFAULT).far * NU);

  // Sky dome: a vertical gradient, unaffected by fog.
  const skyUniforms = {
    topColor: { value: new THREE.Color(palette.skyTop) },
    horizonColor: { value: new THREE.Color(palette.skyHorizon) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2800, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vPos;
        void main() {
          float t = smoothstep(-80.0, 700.0, vPos.y);
          gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
        }`,
    }),
  );
  sky.position.set(centerX, 0, centerZ);
  scene.add(sky);

  /* Dusk needs stronger fill than daylight: the dark palette's albedo is
     already deep, so without the boost the world crushes to black. */
  const hemisphere = new THREE.HemisphereLight(
    new THREE.Color(palette.skyHorizon), new THREE.Color(palette.land),
    palette.dark ? 1.9 : 1.15);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(new THREE.Color(palette.sun), palette.dark ? 2.6 : 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  /* The shadow box follows the walker, sized to what the follow camera sees. */
  const SHADOW_HALF = 60 * NU;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400 * NU;
  sun.shadow.camera.left = -SHADOW_HALF;
  sun.shadow.camera.right = SHADOW_HALF;
  sun.shadow.camera.top = SHADOW_HALF;
  sun.shadow.camera.bottom = -SHADOW_HALF;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Terrain: the whole map as one displaced, textured plane.
  const SEGMENTS_X = 240;
  const SEGMENTS_Z = 267;
  const terrainGeometry = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT, SEGMENTS_X, SEGMENTS_Z);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(centerX, 0, centerZ);
  {
    const positions = terrainGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, heightAt(positions.getX(index), positions.getZ(index)));
    }
    terrainGeometry.computeVertexNormals();
  }
  const terrainMaterial = new THREE.MeshLambertMaterial({ map: groundTexture });
  const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // Sea: a translucent disc with a scrolling generated normal map, so the sun
  // glints move like slow swell. The shallow shelf painted on the ground
  // texture shows through near every coast.
  const seaNormalTexture = (() => {
    const size = 128;
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = size;
    noiseCanvas.height = size;
    const ctx = noiseCanvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    const noise = valueNoise2D("walkable-sea");
    const heightOf = (x, y) => noise(x * 0.09, y * 0.09) + 0.4 * noise(x * 0.23 + 40, y * 0.23 + 40);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = heightOf(x + 1, y) - heightOf(x - 1, y);
        const dy = heightOf(x, y + 1) - heightOf(x, y - 1);
        const offset = (y * size + x) * 4;
        image.data[offset] = 128 + dx * 220;
        image.data[offset + 1] = 128 + dy * 220;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(noiseCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(90, 90);
    return texture;
  })();
  const seaMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(palette.sea),
    specular: new THREE.Color(palette.sun),
    shininess: 120,
    transparent: true,
    opacity: 0.82,
    normalMap: seaNormalTexture,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const seaMesh = new THREE.Mesh(new THREE.CircleGeometry(3200, 48), seaMaterial);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.set(centerX, 0, centerZ);
  scene.add(seaMesh);

  // Clouds: a few soft billboards drifting far overhead.
  const cloudTexture = (() => {
    const size = 256;
    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width = size;
    cloudCanvas.height = size;
    const ctx = cloudCanvas.getContext("2d");
    const random = seededRandom("walkable-clouds");
    for (let blob = 0; blob < 14; blob += 1) {
      const radius = 26 + random() * 42;
      const x = size * (0.2 + random() * 0.6);
      const y = size * (0.35 + random() * 0.3);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.85)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(cloudCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const clouds = [];
  {
    const random = seededRandom("walkable-cloud-field");
    for (let index = 0; index < 16; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: cloudTexture,
        color: new THREE.Color(palette.cloud),
        transparent: true,
        opacity: 0.55 + random() * 0.25,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(random() * 2400 - 700, 150 + random() * 110, random() * 2500 - 700);
      const scale = 130 + random() * 160;
      sprite.scale.set(scale, scale * 0.42, 1);
      sprite.userData.speed = 1.5 + random() * 2;
      scene.add(sprite);
      clouds.push(sprite);
    }
  }

  /* ---------------- decor: instanced trees, pines, shrubs, rocks ------- */
  const placedIncubators = placeOrganizations({
    organizations: incubators,
    regionBounds: stateBounds,
    regionAnchors: stateAnchors,
    contains: containsState,
  });

  const signs = [
    { x: 277, y: 205, targets: ["Jammu and Kashmir", "Himachal Pradesh", "Punjab"] },
    { x: 319, y: 323, targets: ["Delhi", "Haryana", "Uttarakhand", "Uttar Pradesh"] },
    { x: 188, y: 493, targets: ["Rajasthan", "Gujarat", "Maharashtra"] },
    { x: 388, y: 505, targets: ["Madhya Pradesh", "Chhattisgarh", "Odisha"] },
    { x: 570, y: 506, targets: ["Bihar", "Jharkhand", "West Bengal", "Odisha"] },
    { x: 747, y: 409, targets: ["Sikkim", "Assam", "Meghalaya", "Arunachal Pradesh"] },
    { x: 872, y: 443, targets: ["Nagaland", "Manipur", "Mizoram", "Tripura"] },
    { x: 363, y: 694, targets: ["Maharashtra", "Telangana", "Andhra Pradesh", "Karnataka"] },
    { x: 335, y: 844, targets: ["Karnataka", "Tamil Nadu", "Kerala", "Puducherry"] },
  ];
  const transfers = [
    { x: 286, y: 974, label: "Ferry to Lakshadweep", destination: "Lakshadweep" },
    { x: 163.3, y: 982, label: "Return to Kerala", destination: "Kerala" },
    { x: 410, y: 895, label: "Sail to Andaman & Nicobar", destination: "Andaman and Nicobar Islands" },
    { x: 840, y: 950, label: "Return to Tamil Nadu", destination: "Tamil Nadu" },
  ];

  /* The Nexus portal stands ahead of the arrival in Madhya Pradesh (network-portal.js PORTAL_PLACE). */
  const portal = PORTAL_HREF && portalPrompt && stateAnchors["Madhya Pradesh"] ? portalAt(stateAnchors["Madhya Pradesh"], NU) : null;

  const decor = placeDecor({
    count: DECOR_COUNT,
    spacing: 7 * SIZE * 1.6,
    clearance: 14 * SIZE,
    contains: containsLand,
    kindAt,
    avoid: [
      ...placedIncubators,
      ...Object.values(stateAnchors),
      ...signs.map(({ x, y }) => ({ x, y })),
      ...transfers.map(({ x, y }) => ({ x, y })),
      ...(portal ? portalFootprint(portal) : []),
    ],
  });

  const decorGroups = {
    tree: decor.filter((item) => decorArchetype(item.sprite) === "tree" && !item.sprite.endsWith("c")),
    pine: decor.filter((item) => item.sprite === "tree-simple-c"),
    shrub: decor.filter((item) => decorArchetype(item.sprite) === "shrub"),
    rock: decor.filter((item) => decorArchetype(item.sprite) === "rock"),
  };
  const decorMeshes = []; // [{mesh, group, colorOf}]
  function addInstanced(items, geometry, material, colorOf, place) {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.castShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((item, index) => {
      const ground = groundAt(item.x, item.y);
      const spin = seededRandom(`decor-spin:${item.x.toFixed(2)}:${item.y.toFixed(2)}`)();
      quaternion.setFromAxisAngle(up, spin * Math.PI * 2);
      const { position, scale } = place(item, ground);
      // Drawn against the old explorer: shrink to the network's, heights above the ground with them.
      position.y = ground + (position.y - ground) * SIZE;
      scale.multiplyScalar(SIZE);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colorOf(item, index));
    });
    scene.add(mesh);
    decorMeshes.push({ mesh, items, colorOf });
  }
  const decorColor = (hex, jitterSeed, amount = 0.08) => (item, index) => {
    const color = new THREE.Color(hex);
    const jitter = seededRandom(`${jitterSeed}:${index}`)();
    color.offsetHSL(0, 0, (jitter - 0.5) * amount * 2);
    return color;
  };
  function buildDecor() {
    for (const entry of decorMeshes) {
      scene.remove(entry.mesh);
      entry.mesh.dispose();
    }
    decorMeshes.length = 0;
    const scaleOf = (item, base) => item.scale * base;
    // Round tree: blobby canopy on a short trunk (trunk merged into the cone
    // of the canopy visually; two instanced meshes would double draw calls
    // for little gain at this art scale).
    const canopy = new THREE.IcosahedronGeometry(2.1, 1);
    canopy.translate(0, 3.6, 0);
    const trunkless = new THREE.CylinderGeometry(0.34, 0.44, 2.6, 6);
    trunkless.translate(0, 1.2, 0);
    addInstanced(decorGroups.tree, mergeGeometry([canopy, trunkless]),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      (item, index) => (item.sprite.endsWith("b")
        ? decorColor(palette.canopyB, "canopy-b")(item, index)
        : decorColor(palette.canopyA, "canopy-a")(item, index)),
      (item, ground) => ({
        position: new THREE.Vector3(item.x, ground - 0.15, item.y),
        scale: new THREE.Vector3(scaleOf(item, 1), scaleOf(item, 1), scaleOf(item, 1)),
      }));
    const pine = new THREE.ConeGeometry(1.7, 4.6, 7);
    pine.translate(0, 3.4, 0);
    const pineTrunk = new THREE.CylinderGeometry(0.3, 0.4, 1.4, 6);
    pineTrunk.translate(0, 0.7, 0);
    addInstanced(decorGroups.pine, mergeGeometry([pine, pineTrunk]),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      decorColor(palette.pine, "pine"),
      (item, ground) => ({
        position: new THREE.Vector3(item.x, ground - 0.15, item.y),
        scale: new THREE.Vector3(scaleOf(item, 1), scaleOf(item, 1), scaleOf(item, 1)),
      }));
    const shrubGeometry = new THREE.IcosahedronGeometry(1.15, 1);
    shrubGeometry.scale(1, 0.72, 1);
    shrubGeometry.translate(0, 0.6, 0);
    addInstanced(decorGroups.shrub, shrubGeometry,
      new THREE.MeshLambertMaterial({ flatShading: true }),
      decorColor(palette.shrub, "shrub", 0.1),
      (item, ground) => ({
        position: new THREE.Vector3(item.x, ground - 0.1, item.y),
        scale: new THREE.Vector3(scaleOf(item, 1), scaleOf(item, 1), scaleOf(item, 1)),
      }));
    const rockGeometry = new THREE.DodecahedronGeometry(1.05, 0);
    rockGeometry.scale(1.25, 0.8, 1);
    rockGeometry.translate(0, 0.45, 0);
    addInstanced(decorGroups.rock, rockGeometry,
      new THREE.MeshLambertMaterial({ flatShading: true }),
      decorColor(palette.rock, "rock", 0.09),
      (item, ground) => ({
        position: new THREE.Vector3(item.x, ground - 0.1, item.y),
        scale: new THREE.Vector3(scaleOf(item, 1), scaleOf(item, 0.85), scaleOf(item, 1)),
      }));
  }
  function mergeGeometry(geometries) {
    // Minimal non-indexed merge — enough for two convex primitives.
    let total = 0;
    const prepared = geometries.map((geometry) => {
      const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
      total += nonIndexed.attributes.position.count;
      return nonIndexed;
    });
    const positions = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    let offset = 0;
    for (const geometry of prepared) {
      positions.set(geometry.attributes.position.array, offset * 3);
      normals.set(geometry.attributes.normal.array, offset * 3);
      offset += geometry.attributes.position.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    return merged;
  }
  buildDecor();

  /* ---------------- incubator pins (instanced, clickable) -------------- */
  let pinCones;
  let pinHeads;
  function buildPins() {
    if (pinCones) {
      scene.remove(pinCones);
      scene.remove(pinHeads);
      pinCones.dispose();
      pinHeads.dispose();
    }
    const pin = SIZE * PIN_SCALE;
    const coneGeometry = new THREE.ConeGeometry(1.1 * pin, 3.1 * pin, 10);
    coneGeometry.rotateX(Math.PI); // tip down
    const headGeometry = new THREE.SphereGeometry(1.15 * pin, 12, 10);
    const material = new THREE.MeshLambertMaterial();
    pinCones = new THREE.InstancedMesh(coneGeometry, material.clone(), placedIncubators.length);
    pinHeads = new THREE.InstancedMesh(headGeometry, material.clone(), placedIncubators.length);
    pinCones.castShadow = true;
    const matrix = new THREE.Matrix4();
    placedIncubators.forEach((incubator, index) => {
      const ground = groundAt(incubator.x, incubator.y);
      const color = new THREE.Color(palette.orgTypes[typeKeys[incubator.type] || "private"]);
      matrix.makeTranslation(incubator.x, ground + 2 * pin, incubator.y);
      pinCones.setMatrixAt(index, matrix);
      pinCones.setColorAt(index, color);
      matrix.makeTranslation(incubator.x, ground + 4.1 * pin, incubator.y);
      pinHeads.setMatrixAt(index, matrix);
      pinHeads.setColorAt(index, color);
    });
    scene.add(pinCones);
    scene.add(pinHeads);
  }
  buildPins();

  /* ---------------- the Nexus portal ---------------- */
  const portalStone = () => `#${new THREE.Color(cssColor("--nexus-ground", "#0a081e")).lerp(new THREE.Color(palette.rock), 0.25).getHexString()}`;
  const portalModel = portal ? buildPortal(THREE, portal, {
    a: cssColor("--nexus-a", "#3ee6ff"),
    b: cssColor("--nexus-b", "#8b5cf6"),
    text: cssColor("--nexus-text", "#ffffff"),
    stone: portalStone(),
  }, { font: cssColor("--font-body", "system-ui, sans-serif") }) : null;
  if (portalModel) {
    portalModel.group.position.set(portal.x, groundAt(portal.x, portal.y), portal.y);
    scene.add(portalModel.group);
  }
  /* The posts are obstacles the walker goes around (through the ring, between them). */
  const portalBlocks = portal ? portalPosts(portal).map((post) => ({ x: post.x, y: post.y, r: post.r + AVATAR_RADIUS * NU })) : [];

  /* ---------------- the explorer (the network's) ---------------- */
  const { buildAvatar } = createAvatarKit(THREE);
  const explorer = buildAvatar(visitorSpec());
  const avatar = explorer.root;
  avatar.scale.setScalar(NU); // built in network units
  scene.add(avatar);

  /* ---------------- overlay elements ---------------- */
  const tracked = []; // {el, x, z, lift, range, scaleBias}
  function track(el, x, z, { lift = 0, range = Infinity, scaleBias = 1 } = {}) {
    el.style.left = "0";
    el.style.top = "0";
    const entry = { el, x, z, lift, range, scaleBias, shown: true };
    tracked.push(entry);
    return entry;
  }

  for (const incubator of placedIncubators) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "walkable-org";
    button.dataset.type = typeKeys[incubator.type] || "private";
    button.dataset.state = incubator.region;
    button.dataset.slug = incubator.slug;
    button.setAttribute("aria-label", `${incubator.name}, ${typeLabels[incubator.type] || incubator.type}`);
    button.innerHTML = `${icon(incubator.type)}<span>${escapeHTML(incubator.shortName || incubator.name)}</span>`;
    button.addEventListener("click", () => openState(incubator.region, button, incubator.slug));
    orgLayer.append(button);
    track(button, incubator.x, incubator.y, { lift: 6 * SIZE * PIN_SCALE, range: RANGE.org });
  }

  for (const state of stateRecords) {
    const anchor = stateAnchors[state.state];
    if (!anchor) continue;
    const count = incubators.filter((incubator) => incubator.region === state.state).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `walkable-landmark${count ? "" : " is-empty"}`;
    button.innerHTML = `<span class="walkable-landmark-pin" aria-hidden="true"></span><strong>${escapeHTML(state.state)}</strong><small>${count} incubator${count === 1 ? "" : "s"} · ${state.schemes.length} schemes</small>`;
    button.setAttribute("aria-label", `Open ${state.state}`);
    button.addEventListener("click", () => openState(state.state, button));
    landmarkLayer.append(button);
    track(button, anchor.x, anchor.y, { lift: 8 * SIZE * PIN_SCALE, range: RANGE.landmark, scaleBias: 1.05 });
  }

  for (const sign of signs) {
    const signpost = document.createElement("div");
    signpost.className = "walkable-wayfinder";
    signpost.innerHTML = sign.targets.map((name) => {
      const target = stateAnchors[name];
      const angle = Math.atan2(target.y - sign.y, target.x - sign.x) * 180 / Math.PI;
      return `<button type="button" data-state="${escapeHTML(name)}"><span class="walkable-wayfinder-arrow" style="transform:rotate(${angle}deg)" aria-hidden="true">→</span>${escapeHTML(name)}</button>`;
    }).join("");
    signpost.querySelectorAll("button").forEach((button) =>
      button.addEventListener("click", () => openState(button.dataset.state, button)));
    wayfinderLayer.append(signpost);
    track(signpost, sign.x, sign.y, { lift: 5 * SIZE * PIN_SCALE, range: RANGE.wayfinder });
  }

  for (const transfer of transfers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "walkable-transfer";
    button.innerHTML = `<span aria-hidden="true">⛴</span><strong>${escapeHTML(transfer.label)}</strong>`;
    button.setAttribute("aria-label", `${transfer.label}. Move avatar to ${transfer.destination}.`);
    button.addEventListener("click", () => travelTo(transfer.destination));
    wayfinderLayer.append(button);
    track(button, transfer.x, transfer.y, { lift: 2.5 * SIZE * PIN_SCALE, range: RANGE.transfer });
  }

  const labelledRelief = relief.filter((region) => region.lx && region.name);
  for (const region of labelledRelief) {
    const label = document.createElement("div");
    label.className = "walkable-terrain-name";
    label.dataset.kind = region.kind;
    label.textContent = region.name;
    labelLayer.append(label);
    track(label, region.lx, region.ly, { lift: 12 * SIZE, range: RANGE.label });
  }
  for (const peak of terrain.peaks || []) {
    const label = document.createElement("div");
    label.className = "walkable-peak";
    label.innerHTML = `<span class="walkable-peak-mark" aria-hidden="true"></span><strong>${escapeHTML(peak.name)}</strong><small>${peak.elevation.toLocaleString("en-IN")} m</small>`;
    labelLayer.append(label);
    track(label, peak.x, peak.y, { lift: 6 * SIZE, range: RANGE.label });
  }

  /* ---------------- minimap ---------------- */
  root.querySelector(".walkable-minimap-map").innerHTML = Object.entries(mapStates).map(([name, shape]) =>
    `<path data-state="${escapeHTML(name)}" d="${shape.d}"></path>`).join("");
  root.querySelectorAll(".walkable-minimap-states button").forEach((button) => {
    const anchor = stateAnchors[button.dataset.state];
    if (!anchor) return;
    button.style.left = `${anchor.x / MAP_WIDTH * 100}%`;
    button.style.top = `${anchor.y / MAP_HEIGHT * 100}%`;
    button.addEventListener("click", () => openState(button.dataset.state, button));
  });

  /* ---------------- state: the walker and the follow camera ----------------
     As the network's walk engine keeps them: distances in network units,
     positions in map units. A link from the Nexus to an incubator
     (?incubator=<its network id>) starts the walk in front of its pin. */
  let position = { ...stateAnchors["Madhya Pradesh"] };
  let heading = 0; // the walker's facing, radians about +y (0 faces +z, south)
  let yaw = 0; // camera orbit: 0 puts the camera south of the walker, looking north
  {
    const wanted = new URLSearchParams(location.search).get("incubator");
    const target = wanted && placedIncubators.find((incubator) => incubator.nid === wanted);
    // Three units from the pin on dry land (south first, so the camera looks north at it), facing it.
    const spot = target && [[0, 3], [0, -3], [3, 0], [-3, 0]]
      .map(([dx, dy]) => ({ x: target.x + dx * NU, y: target.y + dy * NU }))
      .find((point) => containsLand(point));
    if (spot) {
      position = spot;
      heading = Math.atan2(target.x - spot.x, target.y - spot.y);
      yaw = heading + Math.PI;
    }
  }
  let speed01 = 0; // 0 idle, 1 walking, up to RUN_MULTIPLIER running
  let running = false;
  let yawTarget = yaw;
  let dist = ZOOM_DEFAULT;
  let distTarget = ZOOM_DEFAULT;
  let pitchOff = 0;
  const orbit = { q: false, e: false };
  let nearbyState = "";
  let nearbyIncubator = null;
  let portalState = "far"; // "far" | "near" | "inside" (network-portal.js portalStateAt)
  let leaving = false;
  let leaveTimer = 0;
  let lastTrigger = null;
  const pressed = new Set();
  const cameraTarget = new THREE.Vector3();
  /* Pins are obstacles the walker goes around, as in every network walk world. */
  const pinRadius = (1.15 * SIZE * PIN_SCALE * 0.6) + AVATAR_RADIUS * NU;

  function placeCamera(elapsed, instant) {
    const ground = groundAt(position.x, position.y);
    yaw = instant ? yawTarget : lerpAngle(yaw, yawTarget, damp(12, elapsed));
    dist = instant ? distTarget : dist + (distTarget - dist) * damp(9, elapsed);
    const pitch = clamp(pitchFor(dist) + pitchOff, 0.1, 1.32);
    const tx = position.x;
    const ty = ground + 1.35 * NU;
    const tz = position.y;
    if (instant) cameraTarget.set(tx, ty, tz);
    else {
      const k = damp(11, elapsed);
      cameraTarget.x += (tx - cameraTarget.x) * k;
      cameraTarget.y += (ty - cameraTarget.y) * k;
      cameraTarget.z += (tz - cameraTarget.z) * k;
    }
    const place = cameraPlace(cameraTarget, yaw, pitch, dist * NU);
    // Never below the ground: check the camera's spot and halfway back to the walker.
    const floor = Math.max(groundAt(place.x, place.z), groundAt((place.x + tx) / 2, (place.z + tz) / 2)) + 1.1 * NU;
    camera.position.set(place.x, Math.max(place.y, floor), place.z);
    camera.lookAt(cameraTarget.x, cameraTarget.y + (0.25 + lookLift(dist)) * NU, cameraTarget.z);
    const fog = fogRange(dist);
    scene.fog.near = fog.near * NU;
    scene.fog.far = fog.far * NU;
  }
  {
    const startGround = groundAt(position.x, position.y);
    avatar.position.set(position.x, startGround, position.y);
    avatar.rotation.y = heading;
    placeCamera(0, true);
  }

  function updateNearby() {
    const mapPoint = { x: position.x, y: position.y };
    const currentState = stateRecords.find((state) => containsState(state.state, mapPoint))?.state || "";
    nearbyState = currentState;

    let nearestIncubator = null;
    for (const incubator of placedIncubators) {
      if (incubator.region !== currentState) continue;
      const candidate = { incubator, distance: distance(position, incubator) };
      if (!nearestIncubator || candidate.distance < nearestIncubator.distance) nearestIncubator = candidate;
    }
    const nextIncubator = nearestIncubator && nearestIncubator.distance < MEET_RANGE * NU
      ? nearestIncubator.incubator : null;
    if (nextIncubator?.slug !== nearbyIncubator?.slug) {
      nearbyIncubator = nextIncubator;
      root.querySelectorAll(".walkable-org.is-nearby").forEach((button) => button.classList.remove("is-nearby"));
      if (nearbyIncubator) {
        root.querySelector(`.walkable-org[data-slug="${CSS.escape(nearbyIncubator.slug)}"]`)?.classList.add("is-nearby");
      }
    }
    // Beside the portal, with no pin in meeting range: the way to the Nexus.
    const portalShown = portalState !== "far" && !nearbyIncubator && !leaving;
    if (portalPrompt) portalPrompt.hidden = !portalShown;
    if (portalShown || leaving) {
      nearbyButton.hidden = true;
      return;
    }
    if (nearbyIncubator) {
      nearbyButton.hidden = false;
      nearbyButton.dataset.kind = "incubator";
      nearbyButton.dataset.state = currentState;
      nearbyButton.innerHTML = `Learn about <strong>${escapeHTML(nearbyIncubator.shortName || nearbyIncubator.name)}</strong><span>Enter</span>`;
      return;
    }
    if (currentState) {
      nearbyButton.hidden = false;
      nearbyButton.dataset.kind = "state";
      nearbyButton.dataset.state = currentState;
      nearbyButton.innerHTML = `Explore <strong>${escapeHTML(currentState)}</strong><span>Enter</span>`;
    } else {
      nearbyButton.hidden = true;
      delete nearbyButton.dataset.kind;
      delete nearbyButton.dataset.state;
    }
  }

  /* ---------------- overlay projection ---------------- */
  const projectVector = new THREE.Vector3();
  let viewWidth = 1;
  let viewHeight = 1;
  /* Labels never cover the portal from behind (as the network's area labels
     never cover a landmark): one farther from the camera than the ring whose
     box would fall on it steps aside while it does. */
  const portalBox = { on: false, x0: 0, y0: 0, x1: 0, y1: 0, depth: 0 };
  function measurePortal() {
    portalBox.on = false;
    if (!portalModel) return;
    const ground = groundAt(portal.x, portal.y);
    const ux = Math.cos(portal.facing);
    const uz = -Math.sin(portal.facing);
    const half = portal.r + 0.8 * NU;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const side of [-1, 1]) {
      for (const lift of [0, portalModel.top]) {
        projectVector.set(portal.x + ux * side * half, ground + lift, portal.y + uz * side * half).project(camera);
        if (projectVector.z >= 1) return;
        const sx = (projectVector.x * 0.5 + 0.5) * viewWidth;
        const sy = (-projectVector.y * 0.5 + 0.5) * viewHeight;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    }
    Object.assign(portalBox, { on: true, x0, y0, x1, y1, depth: camera.position.distanceTo(projectVector.set(portal.x, ground, portal.y)) });
  }
  function projectOverlay() {
    measurePortal();
    for (const entry of tracked) {
      const range = Math.hypot(entry.x - position.x, entry.z - position.y);
      let show = range <= entry.range;
      let sx = 0;
      let sy = 0;
      let scale = 1;
      if (show) {
        projectVector.set(entry.x, groundAt(entry.x, entry.z) + entry.lift, entry.z);
        projectVector.project(camera);
        if (projectVector.z >= 1 ||
            projectVector.x < -1.15 || projectVector.x > 1.15 ||
            projectVector.y < -1.2 || projectVector.y > 1.25) {
          show = false;
        } else {
          sx = (projectVector.x * 0.5 + 0.5) * viewWidth;
          sy = (-projectVector.y * 0.5 + 0.5) * viewHeight;
          const cameraDistance = camera.position.distanceTo(
            projectVector.set(entry.x, groundAt(entry.x, entry.z), entry.z));
          scale = Math.min(1.15, Math.max(0.5, (ZOOM_DEFAULT * NU * 1.25) / cameraDistance)) * entry.scaleBias;
          if (portalBox.on && cameraDistance > portalBox.depth && sx > portalBox.x0 - 160 && sx < portalBox.x1 + 160 &&
              sy > portalBox.y0 && sy < portalBox.y1 + 80) {
            // Only now read the label's size (kept from when it last showed: a hidden one measures 0).
            if (entry.el.offsetWidth) { entry.ow = entry.el.offsetWidth; entry.oh = entry.el.offsetHeight; }
            const w = ((entry.ow || 0) * scale) / 2;
            const h = (entry.oh || 0) * scale;
            if (sx + w > portalBox.x0 && sx - w < portalBox.x1 && sy > portalBox.y0 && sy - h < portalBox.y1) show = false;
          }
        }
      }
      if (show) {
        entry.el.style.transform =
          `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
        // z-order: nearer overlays paint above farther ones.
        entry.el.style.zIndex = `${Math.max(1, Math.round(1400 - entry.z + position.y))}`;
      }
      if (show !== entry.shown) {
        entry.shown = show;
        entry.el.classList.toggle("is-offstage", !show);
      }
    }
  }

  /* ---------------- frame loop ----------------
     The network's step: every control is camera-relative (forward walks away
     from the camera), Shift runs, Q / E orbit the camera, a long frame is
     sub-stepped so the walker cannot tunnel through a pin, and the walker
     stays on India's land, sliding along the coast. */
  const clock = new THREE.Clock();
  const tryMove = (from, dx, dy) => {
    let next = { x: from.x + dx, y: from.y + dy };
    // Around pins, not through them.
    for (const pin of placedIncubators) {
      const ox = next.x - pin.x;
      const oy = next.y - pin.y;
      if (Math.abs(ox) > pinRadius || Math.abs(oy) > pinRadius) continue;
      const d = Math.hypot(ox, oy);
      if (d >= pinRadius) continue;
      next = d < 1e-6 ? { x: pin.x + pinRadius, y: pin.y } : { x: pin.x + (ox / d) * pinRadius, y: pin.y + (oy / d) * pinRadius };
    }
    for (const post of portalBlocks) {
      const ox = next.x - post.x;
      const oy = next.y - post.y;
      const d = Math.hypot(ox, oy);
      if (d >= post.r) continue;
      next = d < 1e-6 ? { x: post.x + post.r, y: post.y } : { x: post.x + (ox / d) * post.r, y: post.y + (oy / d) * post.r };
    }
    if (containsLand(next)) return next;
    if (containsLand({ x: next.x, y: from.y })) return { x: next.x, y: from.y }; // slide along the coast
    if (containsLand({ x: from.x, y: next.y })) return { x: from.x, y: next.y };
    return from;
  };
  function frame() {
    const elapsed = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    const free = drawer.hidden;

    let forward = 0;
    let right = 0;
    if (free) {
      if (pressed.has("up")) forward += 1;
      if (pressed.has("down")) forward -= 1;
      if (pressed.has("right")) right += 1;
      if (pressed.has("left")) right -= 1;
      forward -= stickDelta.y;
      right += stickDelta.x;
    }
    const rot = free ? (orbit.q ? 1 : 0) - (orbit.e ? 1 : 0) : 0;
    if (rot) {
      yawTarget += rot * ORBIT_RATE * elapsed;
      if (!motionOK) yaw = yawTarget;
    }
    const magnitude = Math.min(1, Math.hypot(forward, right));
    if (magnitude < 0.05) {
      speed01 += (0 - speed01) * damp(14, elapsed);
      if (speed01 < 0.01) speed01 = 0;
    } else {
      const direction = cameraRelative(forward, right, yaw);
      const speed = WALK_SPEED * NU * (running ? RUN_MULTIPLIER : 1) * magnitude;
      const travel = speed * elapsed;
      const steps = Math.max(1, Math.ceil(travel / (0.35 * NU)));
      const start = position;
      for (let step = 0; step < steps; step += 1) {
        position = tryMove(position, (direction.x * travel) / steps, (direction.z * travel) / steps);
      }
      const moved = Math.hypot(position.x - start.x, position.y - start.y);
      const want = Math.atan2(direction.x, direction.z);
      heading = motionOK ? lerpAngle(heading, want, damp(14, elapsed)) : want;
      const actual = elapsed > 0 ? moved / elapsed / (WALK_SPEED * NU) : 0;
      speed01 += (Math.min(RUN_MULTIPLIER, actual) - speed01) * damp(16, elapsed);
    }

    const ground = groundAt(position.x, position.y);
    avatar.position.set(position.x, ground, position.y);
    avatar.rotation.y = heading;
    explorer.animate(elapsed, time, speed01, !motionOK);

    placeCamera(elapsed, !motionOK);

    sun.position.set(position.x - 160 * NU, 260 * NU, position.y + 120 * NU);
    sun.target.position.set(position.x, 0, position.y);

    if (motionOK) {
      seaNormalTexture.offset.set(time * 0.008, time * 0.011);
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * elapsed;
        if (cloud.position.x > 1900) cloud.position.x = -750;
      }
    }

    if (portal) {
      const state = portalStateAt(portal, position.x, position.y);
      if (state !== portalState) {
        portalState = state;
        // Stepping into the ring starts the way through; walking away from the portal cancels it.
        if (state === "inside") leaveThroughPortal();
        else if (state === "far" && leaving) stayHere();
      }
      portalModel.update(time, !motionOK);
    }

    updateNearby();
    projectOverlay();
    minimapDot.style.left = `${position.x / MAP_WIDTH * 100}%`;
    minimapDot.style.top = `${position.y / MAP_HEIGHT * 100}%`;

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  /* ---------------- resize ---------------- */
  function resize() {
    viewWidth = viewport.clientWidth;
    viewHeight = viewport.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewWidth, viewHeight);
    camera.aspect = viewWidth / Math.max(1, viewHeight);
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  /* ---------------- zoom & camera controls ----------------
     The network's follow camera: from ZOOM_MIN to ZOOM_MAX network units out,
     ZOOM_DEFAULT to start; the readout is relative to that start (100%). */
  function setDistance(next) {
    distTarget = clamp(next, ZOOM_MIN, ZOOM_MAX);
    if (!motionOK) dist = distTarget;
    root.dataset.detail = distTarget <= DETAIL_DISTANCE ? "on" : "off";
    zoomLevel.value = `${Math.round((ZOOM_DEFAULT / distTarget) * 100)}%`;
    zoomLevel.textContent = zoomLevel.value;
    zoomIn.disabled = distTarget <= ZOOM_MIN + 1e-6;
    zoomOut.disabled = distTarget >= ZOOM_MAX - 1e-6;
    zoomReset.disabled = distTarget === ZOOM_DEFAULT;
  }
  const zoomBy = (factor) => setDistance(distTarget * factor);
  zoomIn.addEventListener("click", () => zoomBy(ZOOM_STEP));
  zoomOut.addEventListener("click", () => zoomBy(1 / ZOOM_STEP));
  zoomReset.addEventListener("click", () => setDistance(ZOOM_DEFAULT));
  /* Recenter: swing the camera back behind the walker and level the orbit (zoom is kept). */
  recenter.addEventListener("click", () => {
    pressed.clear();
    yawTarget = heading + Math.PI;
    pitchOff = 0;
    if (!motionOK) yaw = yawTarget;
  });

  /* Pointer input, by device:
     - touch: a floating thumbstick — the base circle spawns under the finger,
       the drag deflection (÷75px, length-clamped to 1) walks the avatar at
       analog speed relative to the camera. A second finger pinch-zooms and
       lets the stick go; a tap without a drag is a click.
     - mouse: drag orbits the camera; a short press-and-release is a click
       (pin raycast / open the state under the cursor). */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const stickElement = viewport.querySelector(".walkable-stick");
  const stickKnob = viewport.querySelector(".walkable-stick-knob");
  const STICK_RADIUS = 75;
  const STICK_KNOB_TRAVEL = 36;
  const stickDelta = { x: 0, y: 0 };
  let stickPointer = null;
  let stickOrigin = { x: 0, y: 0 };
  let stickMoved = false;
  let dragPointer = null;
  let dragMoved = false;
  let dragLast = { x: 0, y: 0 };
  const touchPoints = new Map();
  let pinchDistance = 0;
  let pinchZoom = 1;

  function placeStickKnob() {
    stickKnob.style.transform =
      `translate(${(stickDelta.x * STICK_KNOB_TRAVEL).toFixed(1)}px, ${(stickDelta.y * STICK_KNOB_TRAVEL).toFixed(1)}px)`;
  }
  function startStick(event) {
    stickPointer = event.pointerId;
    stickMoved = false;
    stickOrigin = { x: event.clientX, y: event.clientY };
    const rect = viewport.getBoundingClientRect();
    stickElement.style.left = `${event.clientX - rect.left}px`;
    stickElement.style.top = `${event.clientY - rect.top}px`;
    stickElement.dataset.active = "true";
    placeStickKnob();
  }
  function moveStick(event) {
    const dx = event.clientX - stickOrigin.x;
    const dy = event.clientY - stickOrigin.y;
    const pixels = Math.hypot(dx, dy);
    if (pixels > 7) stickMoved = true;
    const scale = pixels > STICK_RADIUS ? 1 / pixels : 1 / STICK_RADIUS;
    stickDelta.x = dx * scale;
    stickDelta.y = dy * scale;
    placeStickKnob();
  }
  function endStick() {
    if (stickPointer === null) return;
    stickPointer = null;
    stickDelta.x = 0;
    stickDelta.y = 0;
    delete stickElement.dataset.active;
    placeStickKnob();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size === 2) {
        const [first, second] = [...touchPoints.values()];
        pinchDistance = Math.hypot(second.x - first.x, second.y - first.y);
        pinchZoom = distTarget;
        endStick();
        return;
      }
      if (touchPoints.size === 1) {
        startStick(event);
        try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
      }
      return;
    }
    dragPointer = event.pointerId;
    dragMoved = false;
    dragLast = { x: event.clientX, y: event.clientY };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      if (!touchPoints.has(event.pointerId)) return;
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size === 2 && pinchDistance) {
        event.preventDefault();
        const [first, second] = [...touchPoints.values()];
        const now = Math.hypot(second.x - first.x, second.y - first.y);
        if (now > 0) setDistance(pinchZoom * (pinchDistance / now));
        return;
      }
      if (event.pointerId === stickPointer) {
        event.preventDefault();
        moveStick(event);
      }
      return;
    }
    if (event.pointerId !== dragPointer) return;
    const dx = event.clientX - dragLast.x;
    const dy = event.clientY - dragLast.y;
    if (dragMoved || Math.hypot(dx, dy) > 4) {
      dragMoved = true;
      yawTarget -= dx * DRAG_YAW;
      if (!motionOK) yaw = yawTarget;
      pitchOff = clamp(pitchOff + dy * DRAG_PITCH, PITCH_OFFSET.min, PITCH_OFFSET.max);
      dragLast = { x: event.clientX, y: event.clientY };
    }
  });
  const endPointer = (event) => {
    touchPoints.delete(event.pointerId);
    if (touchPoints.size < 2) pinchDistance = 0;
    if (event.pointerId === stickPointer) {
      if (!stickMoved) clickScene(event);
      endStick();
      return;
    }
    if (event.pointerId !== dragPointer) return;
    dragPointer = null;
    if (!dragMoved) clickScene(event);
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  /* All canvas interaction is pointer-driven, so the compatibility mouse
     events a touch tap synthesizes are pure hazard: by the time they fire,
     a drawer opened by that same tap sits under the finger, and the
     synthetic click would land on its backdrop and close it again. */
  canvas.addEventListener("touchend", (event) => event.preventDefault(), { passive: false });
  function clickScene(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([pinHeads, pinCones]);
    if (hits.length) {
      const incubator = placedIncubators[hits[0].instanceId];
      if (incubator) openState(incubator.region, canvas, incubator.slug);
      return;
    }
    const groundHits = raycaster.intersectObject(terrainMesh);
    if (groundHits.length) {
      const point = groundHits[0].point;
      const target = { x: point.x, y: point.z };
      const state = stateRecords.find((record) => containsState(record.state, target))?.state;
      if (state) openState(state, canvas);
    }
  }
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    zoomBy(Math.exp(clamp(delta, -200, 200) * (event.ctrlKey ? 0.004 : 0.0012)));
  }, { passive: false });

  /* ---------------- keyboard & D-pad ---------------- */
  function setDirection(direction, on) {
    on ? pressed.add(direction) : pressed.delete(direction);
  }
  function travelTo(stateName) {
    const destination = stateAnchors[stateName];
    if (!destination) return;
    pressed.clear();
    position = { ...destination };
    placeCamera(0, true);
  }
  const keyDirection = {
    ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
  };
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && portal && portalState !== "far" && !nearbyIncubator && !leaving && drawer.hidden &&
        !/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(document.activeElement?.tagName || "")) {
      event.preventDefault();
      leaveThroughPortal();
      return;
    }
    if (event.key === "Enter" && nearbyState && drawer.hidden && !/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(document.activeElement?.tagName || "")) {
      event.preventDefault();
      openState(nearbyState, nearbyButton, nearbyIncubator?.region === nearbyState ? nearbyIncubator.slug : "");
      return;
    }
    if (event.key === "Shift") running = true;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
    if (!typing && drawer.hidden) {
      if (event.code === "KeyQ") { orbit.q = true; return; }
      if (event.code === "KeyE") { orbit.e = true; return; }
      if (event.key === "+" || event.key === "=") { zoomBy(ZOOM_STEP); return; }
      if (event.key === "-" || event.key === "_") { zoomBy(1 / ZOOM_STEP); return; }
    }
    const direction = keyDirection[event.key];
    if (!direction || !drawer.hidden || typing) return;
    event.preventDefault();
    setDirection(direction, true);
  });
  window.addEventListener("keyup", (event) => {
    const direction = keyDirection[event.key];
    if (direction) setDirection(direction, false);
    if (event.key === "Shift") running = false;
    if (event.code === "KeyQ") orbit.q = false;
    if (event.code === "KeyE") orbit.e = false;
  });
  const releaseAll = () => {
    pressed.clear();
    running = false;
    orbit.q = orbit.e = false;
  };
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
  root.querySelectorAll(".walkable-dpad button").forEach((button) => {
    const release = () => setDirection(button.dataset.direction, false);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setDirection(button.dataset.direction, true);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  /* ---------------- state drawer (as on the 2D map) ---------------- */
  function incubatorRow(incubator, focused) {
    const key = typeKeys[incubator.type] || "private";
    const content = `<span class="walkable-drawer-icon">${icon(incubator.type)}</span>
      <span><strong>${escapeHTML(incubator.name)}</strong><small>${escapeHTML(typeLabels[incubator.type] || incubator.type)}${incubator.city ? ` · ${escapeHTML(incubator.city)}` : ""}</small></span>
      <span aria-hidden="true">${incubator.website ? "↗" : ""}</span>`;
    return incubator.website
      ? `<a class="walkable-drawer-org${focused ? " is-focused" : ""}" href="${escapeHTML(incubator.website)}" target="_blank" rel="noopener" data-type="${key}">${content}</a>`
      : `<div class="walkable-drawer-org${focused ? " is-focused" : ""}" data-type="${key}">${content}</div>`;
  }

  function renderDrawer(stateName, focusedSlug = "") {
    const state = stateMeta[stateName];
    const local = incubators.filter((incubator) => incubator.region === stateName);
    const counts = Object.entries(local.reduce((all, incubator) => {
      all[incubator.type] = (all[incubator.type] || 0) + 1;
      return all;
    }, {})).sort((a, b) => b[1] - a[1]);
    drawerTitle.textContent = stateName;
    drawerBody.innerHTML = `
      ${state?.policy ? `<p class="walkable-drawer-policy">${escapeHTML(state.policy)}${state.period ? ` · ${escapeHTML(state.period)}` : ""}</p>` : ""}
      <p class="walkable-drawer-description">${escapeHTML(state?.summary || "Explore this state or union territory’s incubators and startup support.")}</p>
      <div class="walkable-drawer-stats">
        <span>${local.length} incubator${local.length === 1 ? "" : "s"}</span>
        <span>${state?.schemes?.length || 0} state scheme${state?.schemes?.length === 1 ? "" : "s"}</span>
        ${counts.map(([type, count]) => `<span data-type="${typeKeys[type]}">${icon(type)}${escapeHTML(typeLabels[type] || type)} · ${count}</span>`).join("")}
      </div>
      <div class="walkable-drawer-filters">
        <label><span>Search this state</span><input id="walkable-state-search" type="search" placeholder="Incubator name or city…"></label>
        <label><span>Incubator type</span><select id="walkable-state-type"><option value="">All types</option>${counts.map(([type]) => `<option value="${escapeHTML(type)}">${escapeHTML(typeLabels[type] || type)}</option>`).join("")}</select></label>
      </div>
      <div class="walkable-drawer-list" id="walkable-state-list">${local.length ? local.map((incubator) => incubatorRow(incubator, incubator.slug === focusedSlug)).join("") : `<p class="walkable-drawer-empty">No incubators are currently listed for this state or UT.</p>`}</div>
      <div class="walkable-drawer-links">
        <a class="btn btn-primary" href="incubators.html?state=${encodeURIComponent(stateName)}&view=map">Open incubator map</a>
        <a class="btn btn-ghost" href="state-schemes.html?state=${encodeURIComponent(stateName)}&view=map">View state schemes</a>
      </div>`;
    const search = drawerBody.querySelector("#walkable-state-search");
    const type = drawerBody.querySelector("#walkable-state-type");
    const list = drawerBody.querySelector("#walkable-state-list");
    const filter = () => {
      const query = search.value.trim().toLowerCase();
      const filtered = local.filter((incubator) =>
        (!type.value || incubator.type === type.value) &&
        (!query || `${incubator.name} ${incubator.host || ""} ${incubator.city || ""}`.toLowerCase().includes(query)));
      list.innerHTML = filtered.length
        ? filtered.map((incubator) => incubatorRow(incubator, incubator.slug === focusedSlug)).join("")
        : `<p class="walkable-drawer-empty">No incubators match those filters.</p>`;
    };
    search.addEventListener("input", filter);
    type.addEventListener("change", filter);
  }

  function openState(stateName, trigger, focusedSlug = "") {
    if (!stateMeta[stateName]) return;
    lastTrigger = trigger || document.activeElement;
    pressed.clear();
    renderDrawer(stateName, focusedSlug);
    drawer.hidden = false;
    document.body.classList.add("walkable-drawer-open");
    root.querySelectorAll(".walkable-minimap-states button").forEach((button) =>
      button.classList.toggle("is-active", button.dataset.state === stateName));
    drawerClose.focus();
    if (focusedSlug) requestAnimationFrame(() => drawerBody.querySelector(".is-focused")?.scrollIntoView({ block: "center" }));
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    document.body.classList.remove("walkable-drawer-open");
    root.querySelectorAll(".walkable-minimap-states button").forEach((button) => button.classList.remove("is-active"));
    lastTrigger?.focus?.();
  }
  nearbyButton.addEventListener("click", () => {
    if (nearbyState) openState(nearbyState, nearbyButton, nearbyIncubator?.region === nearbyState ? nearbyIncubator.slug : "");
  });
  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  drawer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = [...drawerPanel.querySelectorAll('button, a, input, select, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.disabled);
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  help.addEventListener("click", () => root.querySelector(".walkable-intro").classList.toggle("is-open"));
  root.querySelector("#walkable-intro-close").addEventListener("click", () => root.querySelector(".walkable-intro").classList.remove("is-open"));

  /* ---------------- through the portal ----------------
     A short card in the network's colors says where the visitor is going,
     then the Nexus opens. "Stay here" (or Escape) cancels; so does walking
     away from the portal. */
  const PORTAL_DELAY_MS = 1600;
  function leaveThroughPortal() {
    if (!portal || leaving || !portalDeparture) return;
    leaving = true;
    portalDeparture.hidden = false;
    portalDeparture.classList.toggle("is-still", !motionOK);
    portalStay?.focus({ preventScroll: true });
    leaveTimer = window.setTimeout(() => window.location.assign(PORTAL_HREF), motionOK ? PORTAL_DELAY_MS : PORTAL_DELAY_MS + 600);
  }
  function stayHere() {
    if (!leaving) return;
    leaving = false;
    window.clearTimeout(leaveTimer);
    portalDeparture.hidden = true;
    viewport.focus({ preventScroll: true });
  }
  portalStay?.addEventListener("click", stayHere);
  window.addEventListener("keydown", (event) => {
    if (leaving && event.key === "Escape") {
      event.preventDefault();
      stayHere();
    }
  });
  portalPrompt?.addEventListener("click", (event) => {
    event.preventDefault();
    leaveThroughPortal();
  });
  // Coming back with the browser's Back button restores this page from the cache, mid-departure.
  window.addEventListener("pageshow", (event) => { if (event.persisted) stayHere(); });

  /* ---------------- theme switching ---------------- */
  function applyPalette() {
    palette = readPalette();
    paintGround();
    groundTexture.needsUpdate = true;
    skyUniforms.topColor.value.set(palette.skyTop);
    skyUniforms.horizonColor.value.set(palette.skyHorizon);
    scene.fog.color.set(palette.fog);
    hemisphere.color.set(palette.skyHorizon);
    hemisphere.groundColor.set(palette.land);
    hemisphere.intensity = palette.dark ? 1.9 : 1.15;
    sun.color.set(palette.sun);
    sun.intensity = palette.dark ? 2.6 : 2.3;
    seaMaterial.color.set(palette.sea);
    seaMaterial.specular.set(palette.sun);
    for (const cloud of clouds) cloud.material.color.set(palette.cloud);
    buildDecor();
    buildPins();
    portalModel?.restyle(portalStone());
  }
  const themeObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === "data-theme")) applyPalette();
  });
  themeObserver.observe(document.documentElement, { attributes: true });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyPalette);

  /* ---------------- go ---------------- */
  setDistance(ZOOM_DEFAULT);
  updateNearby();
}
