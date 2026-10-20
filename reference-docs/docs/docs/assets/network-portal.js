/* ============================================================
   network-portal.js — the Portfolio Map Network's portal: a ring
   of light standing in the walk. Walking through it opens the
   Nexus, the network's shared world, where every map in the
   network is a world of its own (wearenexus.xyz).

   Ported from the network's walk worlds (fritzhand/portfolio-map-3d,
   and Embarc Collective's and Ambition Accelerated's maps:
   src/data/portal.ts and src/views/walk/portal.ts): the same ring
   in the network's two colors, swirl, plinth, posts, plaque and
   glow, at the same size, and the same "beside it" and "through
   it" rule. Sizes are in network units; this map's scene is in map
   units, so `nu` (map units per network unit) converts them.

   Here the ring stands ahead of the arrival in Madhya Pradesh, a
   little to the left, its face turned to the spawn, so a visitor
   sees it on arrival (PORTAL_PLACE). It keeps clear of every pin,
   and decor keeps clear of it (walkable-3d.js).

   The placement and state functions are pure (no three.js, no
   DOM; tests/network-portal.test.mjs); buildPortal takes THREE.
   ============================================================ */

/** The ring's radius and thickness, and how close counts as beside it, in network units. */
export const PORTAL_SIZE = { r: 3.4, depth: 0.9, near: 7.5 };

/** Where it stands from the arrival: `ahead` network units, turned `left` radians west of north. */
export const PORTAL_PLACE = { ahead: 15, left: 0.49 };

/**
 * The portal in map units for an arrival point (`spawn`, map x/y with y growing south) and the
 * scale `nu`: its center, its facing (rotation about +y; its face points along (sin, cos) of it,
 * toward the spawn), its radius, depth and near range.
 */
export function portalAt(spawn, nu, place = PORTAL_PLACE) {
  const d = place.ahead * nu;
  const x = spawn.x - Math.sin(place.left) * d;
  const y = spawn.y - Math.cos(place.left) * d;
  return {
    x,
    y,
    facing: Math.atan2(spawn.x - x, spawn.y - y),
    r: PORTAL_SIZE.r * nu,
    depth: PORTAL_SIZE.depth * nu,
    near: PORTAL_SIZE.near * nu,
    nu,
  };
}

/** The portal's two posts (the walker passes between them, through the ring), in map units. */
export function portalPosts(portal) {
  const ux = Math.cos(portal.facing);
  const uy = -Math.sin(portal.facing);
  const offset = portal.r + 0.1 * portal.nu;
  return [-1, 1].map((s) => ({ x: portal.x + ux * s * offset, y: portal.y + uy * s * offset, r: 0.55 * portal.nu }));
}

/** Points along the plinth and before and behind it, for keeping decor clear. */
export function portalFootprint(portal) {
  const ux = Math.cos(portal.facing);
  const uy = -Math.sin(portal.facing);
  const fx = Math.sin(portal.facing);
  const fy = Math.cos(portal.facing);
  const half = portal.r + 0.8 * portal.nu;
  const along = [-1, -0.5, 0, 0.5, 1].map((s) => ({ x: portal.x + ux * s * half, y: portal.y + uy * s * half }));
  const reach = 2.4 * portal.nu;
  return [...along, { x: portal.x + fx * reach, y: portal.y + fy * reach }, { x: portal.x - fx * reach, y: portal.y - fy * reach }];
}

/** Where the walker is: stepping through the ring (in its plane, between the posts), beside it, or away. */
export function portalStateAt(portal, x, y) {
  const dx = x - portal.x;
  const dy = y - portal.y;
  const along = dx * Math.sin(portal.facing) + dy * Math.cos(portal.facing);
  const across = dx * Math.cos(portal.facing) - dy * Math.sin(portal.facing);
  if (Math.abs(along) < 0.75 * portal.nu && Math.abs(across) < portal.r - 0.9 * portal.nu) return "inside";
  return Math.hypot(dx, dy) < portal.near ? "near" : "far";
}

/** "#rrggbb" with an alpha, for canvas gradients. */
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * The portal's model, built in network units and scaled by `portal.nu`.
 * colors: { a, b, text, stone } as "#rrggbb"; font: the UI's font family; words: the plaque's
 * two lines. Returns { group, top (map units above the ground), update(time, reduced),
 * restyle(stone), dispose() }.
 */
export function buildPortal(THREE, portal, colors, { font = "system-ui, sans-serif", words = ["THE NEXUS", "Portfolio Map Network"] } = {}) {
  const owned = [];
  const own = (x) => (owned.push(x), x);
  const group = new THREE.Group();
  group.name = "nexus-portal";
  group.rotation.y = portal.facing;
  group.scale.setScalar(portal.nu);
  const R = PORTAL_SIZE.r;
  const cy = R + 0.55;
  const a = new THREE.Color(colors.a);
  const b = new THREE.Color(colors.b);

  // The ring, colored around its circumference from one network color to the other and back.
  const torus = own(new THREE.TorusGeometry(R, 0.32, 14, 72));
  const n = torus.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i += 1) {
    const t = Math.atan2(torus.attributes.position.getY(i), torus.attributes.position.getX(i));
    c.copy(a).lerp(b, (Math.sin(t) + 1) / 2);
    col.set([c.r, c.g, c.b], i * 3);
  }
  torus.setAttribute("color", new THREE.BufferAttribute(col, 3));
  torus.translate(0, cy, 0);
  const ring = new THREE.Mesh(torus, own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  ring.name = "portal-ring";
  group.add(ring);

  // The plinth under the ring, and the two posts the walker passes between.
  const stone = own(new THREE.MeshLambertMaterial({ color: new THREE.Color(colors.stone), flatShading: true }));
  const plinth = new THREE.Mesh(own(new THREE.BoxGeometry(R * 2 + 1.6, 0.5, PORTAL_SIZE.depth + 0.8).translate(0, 0.25, 0)), stone);
  const postGeometry = own(new THREE.CylinderGeometry(0.42, 0.55, cy - 0.3, 10));
  const posts = [-1, 1].map((s) => {
    const post = new THREE.Mesh(postGeometry, stone);
    post.position.set(s * (R + 0.1), 0.5 + (cy - 0.3) / 2 - 0.25, 0);
    return post;
  });
  for (const mesh of [plinth, ...posts]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The swirl inside the ring.
  const uniforms = { uTime: { value: 0 }, uA: { value: a }, uB: { value: b } };
  const swirl = new THREE.Mesh(
    own(new THREE.CircleGeometry(R - 0.2, 64).translate(0, cy, 0)),
    own(new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uA;
        uniform vec3 uB;
        varying vec2 vUv;
        void main() {
          vec2 q = vUv - 0.5;
          float r = length(q) * 2.0;
          float a = atan(q.y, q.x);
          float s = sin(a * 3.0 + r * 9.0 - uTime * 1.6) * 0.5 + 0.5;
          vec3 col = mix(uA, uB, s);
          col = mix(col, vec3(1.0), smoothstep(0.35, 0.0, r) * 0.55);
          float alpha = (0.35 + 0.4 * s) * smoothstep(1.0, 0.82, r);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }`,
    })),
  );
  swirl.name = "portal-swirl";
  swirl.renderOrder = 2;
  group.add(swirl);

  // A glow on the ground before and behind it.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const gctx = glowCanvas.getContext("2d", { willReadFrequently: true });
  const g = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, rgba(colors.a, 0.55));
  g.addColorStop(0.5, rgba(colors.b, 0.22));
  g.addColorStop(1, rgba(colors.b, 0));
  gctx.fillStyle = g;
  gctx.fillRect(0, 0, 128, 128);
  const glowTexture = own(new THREE.CanvasTexture(glowCanvas));
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    own(new THREE.PlaneGeometry(R * 3.2, R * 3.2).rotateX(-Math.PI / 2).translate(0, 0.06, 0)),
    own(new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, toneMapped: false })),
  );
  group.add(glow);

  // The words on the plaque's two faces, in the UI's typeface, repainted when the web font arrives.
  const textCanvas = document.createElement("canvas");
  textCanvas.width = 1024;
  textCanvas.height = 160;
  const tctx = textCanvas.getContext("2d", { willReadFrequently: true });
  const textTexture = own(new THREE.CanvasTexture(textCanvas));
  textTexture.colorSpace = THREE.SRGBColorSpace;
  textTexture.anisotropy = 4;
  const paintWords = () => {
    tctx.clearRect(0, 0, 1024, 160);
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillStyle = colors.text;
    tctx.font = `700 78px ${font}`;
    tctx.fillText(words[0], 512, 58);
    tctx.fillStyle = colors.a;
    tctx.font = `500 40px ${font}`;
    tctx.fillText(words[1], 512, 124);
    textTexture.needsUpdate = true;
  };
  paintWords();
  let disposed = false;
  (document.fonts?.ready ?? Promise.resolve()).then(() => !disposed && paintWords());
  const wordsMaterial = own(new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  // A dark plaque on the ring's crown carries them, readable from both sides.
  const ww = R * 2.1;
  const wh = ww * (160 / 1024);
  const plaqueY = cy + R + 0.35 + wh / 2;
  const plaque = new THREE.Mesh(own(new THREE.BoxGeometry(ww + 0.3, wh + 0.2, 0.14).translate(0, plaqueY, 0)), stone);
  group.add(plaque);
  const wordsGeometry = own(new THREE.PlaneGeometry(ww, wh));
  for (const side of [1, -1]) {
    const plane = new THREE.Mesh(wordsGeometry, wordsMaterial);
    plane.position.set(0, plaqueY, side * 0.08);
    if (side < 0) plane.rotation.y = Math.PI;
    group.add(plane);
  }

  return {
    group,
    top: (plaqueY + wh / 2 + 0.1) * portal.nu,
    update(time, reduced) {
      if (!reduced) uniforms.uTime.value = time;
    },
    restyle(nextStone) {
      stone.color.set(nextStone);
    },
    dispose() {
      disposed = true;
      for (const x of owned) x.dispose();
    },
  };
}
