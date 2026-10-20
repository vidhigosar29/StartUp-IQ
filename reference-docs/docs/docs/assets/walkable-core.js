/* Deterministic layout for the walkable map, in map units (data/india-map.json).
   How the explorer walks and how the camera follows is the Portfolio Map
   Network's (network-walk.js). */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 1113;

export function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The length of a route through points, in map units. */
export function routeLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

/* Which watercolour sprites belong on which terrain. Ranges get rock, the
   Thar gets scrub, wetlands and the Ghats get trees. `other` covers land no
   Natural Earth region claims. */
export const DECOR_KITS = {
  mtn: ["rock-1", "rock-2", "rock-3", "tree-simple-c"],
  desert: ["shrub-2", "rock-3"],
  wet: ["tree-simple-a", "shrub-1"],
  plateau: ["tree-simple-b", "rock-1", "shrub-1"],
  plain: ["tree-simple-a", "shrub-1"],
  other: ["tree-simple-a", "tree-simple-b", "shrub-1", "rock-1"],
};

/**
 * Scatters decorative sprites across the land, deterministically.
 *
 * Rejection sampling over the map's bounding box: a candidate survives only
 * if it is on land, far enough from the sprites already placed, and clear of
 * every interactive target (`avoid` — incubator icons and state landmarks),
 * because decor must never sit under something the player needs to click.
 * `kindAt` maps a point to a terrain kind, which chooses the sprite kit.
 *
 * Returns the sprites sorted by y, so nearer ones paint over farther ones.
 */
export function placeDecor({
  count,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
  contains,
  kindAt = () => "other",
  avoid = [],
  kits = DECOR_KITS,
  spacing = 7,
  clearance = 14,
  seed = "walkable-decor",
}) {
  const random = seededRandom(seed);
  const placed = [];
  // Bounded work: rejection sampling over a mostly-water box can never be
  // allowed to spin, so the attempt budget is fixed rather than a while-true.
  const attempts = count * 40;
  // Spatial hashes, so the spacing and clearance checks look only at nearby
  // points; the land test (the expensive one) runs last. A candidate must pass
  // all three, so the order does not change which ones survive.
  const cell = Math.max(spacing, clearance, 1);
  const cellKey = (cx, cy) => cx * 65536 + cy;
  const addTo = (grid, point) => {
    const key = cellKey(Math.floor(point.x / cell), Math.floor(point.y / cell));
    const list = grid.get(key);
    if (list) list.push(point);
    else grid.set(key, [point]);
  };
  const anyWithin = (grid, point, radius) => {
    const cx = Math.floor(point.x / cell);
    const cy = Math.floor(point.y / cell);
    const span = Math.ceil(radius / cell);
    for (let i = -span; i <= span; i += 1) {
      for (let j = -span; j <= span; j += 1) {
        const list = grid.get(cellKey(cx + i, cy + j));
        if (list && list.some((other) => distance(point, other) < radius)) return true;
      }
    }
    return false;
  };
  const avoidGrid = new Map();
  for (const target of avoid) addTo(avoidGrid, target);
  const placedGrid = new Map();

  for (let attempt = 0; attempt < attempts && placed.length < count; attempt += 1) {
    const point = { x: random() * width, y: random() * height };
    // Draw the kit roll every iteration so a rejected candidate cannot shift
    // the sequence for the ones that follow — that is what keeps this stable.
    const roll = random();
    const scale = 0.78 + random() * 0.5;
    if (anyWithin(avoidGrid, point, clearance)) continue;
    if (anyWithin(placedGrid, point, spacing)) continue;
    if (!contains(point)) continue;
    const kit = kits[kindAt(point)] || kits.other;
    const prop = { ...point, sprite: kit[Math.floor(roll * kit.length)], scale };
    placed.push(prop);
    addTo(placedGrid, prop);
  }

  return placed.sort((a, b) => a.y - b.y);
}

export function placeOrganizations({
  organizations,
  regionBounds,
  regionAnchors,
  contains,
  minimumDistance = 4,
}) {
  const placed = [];
  const byRegion = new Map();

  for (const organization of [...organizations].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const region = organization.region;
    const bounds = regionBounds[region];
    const anchor = regionAnchors[region];
    if (!bounds || !anchor) continue;

    const regionPlaced = byRegion.get(region) || [];
    const random = seededRandom(`${region}:${organization.slug}`);
    let point = null;
    let lastInside = null;

    for (let pass = 0; pass < 5 && !point; pass += 1) {
      const spacing = minimumDistance * (1 - pass * 0.2);
      for (let attempt = 0; attempt < 800; attempt += 1) {
        const candidate = {
          x: bounds.x + random() * bounds.width,
          y: bounds.y + random() * bounds.height,
        };
        if (!contains(region, candidate)) continue;
        lastInside = candidate;
        if (regionPlaced.every((other) => distance(candidate, other) >= spacing)) {
          point = candidate;
          break;
        }
      }
    }

    point ||= lastInside || anchor;
    regionPlaced.push(point);
    byRegion.set(region, regionPlaced);
    placed.push({ ...organization, x: point.x, y: point.y });
  }

  return placed;
}
