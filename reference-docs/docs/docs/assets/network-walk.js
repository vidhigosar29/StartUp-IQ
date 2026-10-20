/* ============================================================
   network-walk.js — the Portfolio Map Network's walk physics.

   Every walk world in the network walks the same way: Embarc
   Collective's member map, the Ambition Accelerated community map
   and every map built on fritzhand/portfolio-map-3d run one walk
   engine. These are its values and rules, ported from that engine
   (src/views/walk/nav.ts and the engine's step and follow camera),
   so a visitor who crosses from one world to another finds the
   same walker, the same pace and the same camera.

   Values are in network units: a walker 1.8 units tall. A world
   drawn from a map chooses how many network units it gives a
   kilometre: the network's walkable Floridas use 1.5; this map
   draws India at INDIA_UNITS_PER_KM (a third of that), so the walk
   across the country takes about as long as the walk down Florida.
   The scene is in map units (data/india-map.json), so
   networkUnitsPerMapUnit() turns one into the other. Pure: no
   three.js, no DOM (tested in tests/network-walk.test.mjs).
   ============================================================ */

/** Kilometres per degree of latitude (and of longitude × cos(latitude)). */
export const KM_PER_DEGREE = 111.32;
/** The network's ground scale for its walkable Floridas (Ambition Accelerated's and the Florida Ecosystem Map). */
export const NETWORK_UNITS_PER_KM = 1.5;
/** This map's: India is about three times Florida's length, so a third of the scale keeps the walk across it as long. */
export const INDIA_UNITS_PER_KM = 0.5;

/** Walking speed, units per second; Shift runs at RUN_MULTIPLIER times it. */
export const WALK_SPEED = 9;
export const RUN_MULTIPLIER = 1.9;
/** The walker: its height and its collision radius. */
export const AVATAR_HEIGHT = 1.8;
export const AVATAR_RADIUS = 0.38;
/** The follow camera's distance from the walker: closest, farthest, and where it starts. */
export const ZOOM_MIN = 8;
export const ZOOM_MAX = 70;
export const ZOOM_DEFAULT = 22;
/** One press of a zoom button (or + / -) moves the camera by this factor. */
export const ZOOM_STEP = 0.85;
/** Q / E orbit the camera at this rate, radians per second. */
export const ORBIT_RATE = 1.9;
/** Drag to look: radians per pixel, sideways and up/down, and how far the tilt may go. */
export const DRAG_YAW = 0.0065;
export const DRAG_PITCH = 0.0035;
export const PITCH_OFFSET = { min: -0.22, max: 0.38 };
/** Within this distance of a pin, the HUD offers to meet it. */
export const MEET_RANGE = 4.5;
/** Pin names show within this distance of the walker. */
export const LABEL_RANGE = 16;
/** Area (district or region) labels show within this distance. */
export const AREA_LABEL_RANGE = 340;

/** Network units per unit of a map drawn by an equirectangular projection with `s` map units per degree. */
export function networkUnitsPerMapUnit(s, unitsPerKm = NETWORK_UNITS_PER_KM) {
  return (KM_PER_DEGREE / s) * unitsPerKm;
}

export const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

/** Frame-rate independent smoothing factor. */
export function damp(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

/** Shortest-arc interpolation between two angles (radians). */
export function lerpAngle(from, to, t) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

/** 0 at the closest zoom, 1 at the farthest. */
export function zoomT(distance) {
  return Math.min(1, Math.max(0, (distance - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
}

/** Camera pitch (radians above the horizon) for a follow distance: low and close, high and far. */
export function pitchFor(distance) {
  return 0.22 + Math.pow(zoomT(distance), 1.3) * 0.8;
}

/** How far above the walker the camera aims: up the road when close, straight down at it when far. */
export function lookLift(distance) {
  return 2.2 * (1 - zoomT(distance));
}

/** The camera's vertical field of view (degrees) for a viewport aspect: wider on a phone held upright. */
export function fovFor(aspect) {
  return aspect >= 1 ? 50 : Math.min(66, 50 + (1 - aspect) * 30);
}

/** Fog for a follow distance: the far world fades a little later the farther out the camera sits. */
export function fogRange(distance) {
  return { near: 110 + distance * 2, far: 420 + distance * 6 };
}

/** A movement vector with diagonal input no faster than straight input. */
export function normalizeMovement(x, z) {
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

/**
 * Camera-relative movement, for every control: keys, the D-pad and the stick alike.
 * `forward` / `right` are input axes in [-1, 1] (forward = away from the camera);
 * `cameraYaw` is the camera's orbit angle, with the camera at target + (sin yaw, cos yaw) × distance.
 */
export function cameraRelative(forward, right, cameraYaw) {
  const n = normalizeMovement(right, forward);
  const fx = -Math.sin(cameraYaw);
  const fz = -Math.cos(cameraYaw);
  return { x: fx * n.z + -fz * n.x, z: fz * n.z + fx * n.x };
}

/** The camera's place for a target, an orbit angle, a pitch and a distance. */
export function cameraPlace(target, yaw, pitch, distance) {
  const h = Math.cos(pitch) * distance;
  return { x: target.x + Math.sin(yaw) * h, y: target.y + Math.sin(pitch) * distance, z: target.z + Math.cos(yaw) * h };
}

/** Seconds to walk (or, with `run`, to run) a route whose length is `length` network units. */
export function traverseSeconds(length, run = false) {
  return length / (WALK_SPEED * (run ? RUN_MULTIPLIER : 1));
}
