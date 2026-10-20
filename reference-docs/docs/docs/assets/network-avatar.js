/* ============================================================
   network-avatar.js — the Portfolio Map Network's explorer.

   The same small low-poly walker every walk world in the network
   draws (fritzhand/portfolio-map-3d, src/views/walk/avatar.ts):
   about 1.8 network units tall, built from an AvatarSpec (shirt
   color, accent, skin tone, one of six hats and one of four pieces
   of gear), with the same walk cycle and idle breathing. Each
   visitor gets a look of their own, derived from a random id kept
   in this browser, so it stays the same visit to visit.

   three.js is passed in (createAvatarKit(THREE)) rather than
   imported, so the page loads exactly one copy of it. Faces +z at
   heading 0; heading is rotation.y.
   ============================================================ */

export const HATS = ["cap", "straw", "beanie", "bucket", "visor", "none"];
export const GEAR = ["backpack", "satchel", "scarf", "none"];
/** Explorer outfit colors, as the network's maps pick them. */
export const BODY_COLORS = ["#02c492", "#2a78d6", "#4a3aa7", "#c2185b", "#e34948", "#eb6834", "#1f9a3a", "#7a9a01", "#9a5bd6", "#00a3b4"];
export const ACCENT_COLORS = ["#94339b", "#f5b301", "#ffffff", "#1d1f24", "#12a594", "#ff8a3d", "#6fb7ff", "#f2e8cf"];
export const SKIN_TONES = ["#f6d7c3", "#ecc19c", "#d39a6e", "#b07b52", "#8a5a3b", "#5e3a24"];

function hash32(text, salt = 0) {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
const pick = (list, id, salt) => list[hash32(id, salt) % list.length];

/** The look an id gets: deterministic, so the same id always draws the same explorer. */
export function specFor(id) {
  const spec = {
    body: pick(BODY_COLORS, id, 1),
    accent: pick(ACCENT_COLORS, id, 2),
    skin: pick(SKIN_TONES, id, 3),
    hat: pick(HATS, id, 4),
    gear: pick(GEAR, id, 5),
  };
  if (spec.accent === spec.body) spec.accent = "#ffffff";
  return spec;
}

const VISITOR_KEY = "india-map-explorer-v1";

/** This browser's explorer: a random id kept in localStorage (a fresh one each visit where storage is off). */
export function visitorSpec() {
  let id = "";
  try {
    id = localStorage.getItem(VISITOR_KEY) || "";
  } catch { /* storage off */ }
  if (!/^[a-z0-9]{8,32}$/.test(id)) {
    const bytes = new Uint8Array(8);
    (globalThis.crypto?.getRandomValues?.(bytes)) ?? bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    id = [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
    try {
      localStorage.setItem(VISITOR_KEY, id);
    } catch { /* storage off */ }
  }
  return specFor(id);
}

/** Small deterministic hash of the spec (FNV-1a). */
export function specHash(spec, salt = 0) {
  const text = `${spec.body}|${spec.accent}|${spec.skin}|${spec.hat}|${spec.gear}|${salt}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createAvatarKit(THREE) {
  const INK = new THREE.Color("#1d1f24");
  const STRAW = new THREE.Color("#e6c67a");
  const WHITE = new THREE.Color("#ffffff");
  /* Hair and trousers are derived from the spec, so every viewer draws the same explorer. */
  const HAIR = ["#2b1d16", "#3a2a20", "#6b3e22", "#a0522d", "#d8b46a", "#8c8c8c"].map((h) => new THREE.Color(h));
  const TROUSERS = ["#2d4a65", "#3b4252", "#5b4a3a", "#55613a", "#c9b48f", "#1d2a3a"].map((h) => new THREE.Color(h));

  const c = (v) => (typeof v === "string" ? new THREE.Color(v) : v.clone());
  const mixc = (a, b, t) => a.clone().lerp(b, t);
  /** Perceived lightness 0..1, to keep accents readable against the shirt. */
  const luma = (k) => 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;

  /** Vertex-color a geometry (non-indexed, no uvs), so parts in different colors merge into one mesh. */
  function paint(geometry, color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (g.attributes.uv) g.deleteAttribute("uv");
    return g;
  }
  /** Merge painted parts (position + color) into one geometry. */
  function merge(parts) {
    let count = 0;
    for (const p of parts) count += p.attributes.position.count;
    const position = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    let offset = 0;
    for (const p of parts) {
      position.set(p.attributes.position.array, offset * 3);
      color.set(p.attributes.color.array, offset * 3);
      offset += p.attributes.position.count;
      p.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
    merged.setAttribute("color", new THREE.BufferAttribute(color, 3));
    merged.computeVertexNormals();
    return merged;
  }
  const at = (g, x, y, z, color) => paint(g.translate(x, y, z), color);

  /** The hat, in head-local coordinates (head center at the origin, skull radius 0.2). */
  function hatParts(hat, accent, body) {
    const dark = mixc(accent, INK, 0.28);
    const trim = Math.abs(luma(accent) - luma(body)) < 0.12 ? mixc(accent, luma(accent) > 0.5 ? INK : WHITE, 0.45) : dark;
    switch (hat) {
      case "cap": {
        const brim = new THREE.CylinderGeometry(0.15, 0.17, 0.03, 12, 1, false, -Math.PI / 2, Math.PI).scale(1.15, 1, 1.7);
        return [
          at(new THREE.SphereGeometry(0.218, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.03, 0, accent),
          at(brim, 0, 0.05, 0.15, trim),
          at(new THREE.SphereGeometry(0.035, 6, 4), 0, 0.245, 0, trim),
        ];
      }
      case "straw":
        return [
          at(new THREE.CylinderGeometry(0.44, 0.44, 0.025, 20), 0, 0.1, 0, STRAW),
          at(new THREE.CylinderGeometry(0.17, 0.205, 0.18, 14), 0, 0.2, 0, STRAW),
          at(new THREE.CylinderGeometry(0.212, 0.212, 0.055, 14), 0, 0.14, 0, accent),
        ];
      case "beanie":
        return [
          at(new THREE.SphereGeometry(0.224, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(1, 1.18, 1), 0, 0.01, 0, accent),
          at(new THREE.TorusGeometry(0.208, 0.042, 6, 18).rotateX(Math.PI / 2), 0, 0.03, 0, trim),
          at(new THREE.IcosahedronGeometry(0.075, 1), 0, 0.29, 0, trim),
        ];
      case "bucket":
        return [
          at(new THREE.CylinderGeometry(0.175, 0.22, 0.17, 14), 0, 0.15, 0, accent),
          at(new THREE.CylinderGeometry(0.23, 0.34, 0.05, 18), 0, 0.055, 0, accent),
          at(new THREE.CylinderGeometry(0.222, 0.222, 0.045, 14), 0, 0.09, 0, trim),
        ];
      case "visor": {
        const brim = new THREE.CylinderGeometry(0.17, 0.19, 0.03, 12, 1, false, -Math.PI / 2, Math.PI).scale(1.2, 1, 1.9);
        return [at(new THREE.TorusGeometry(0.205, 0.03, 6, 20).rotateX(Math.PI / 2), 0, 0.07, 0, accent), at(brim, 0, 0.07, 0.16, accent)];
      }
      default:
        return [];
    }
  }

  /** Gear, in avatar coordinates (feet at y=0, facing +z). Torso surface is ~0.25 from the axis. */
  function gearParts(gear, accent, body) {
    const dark = mixc(accent, INK, 0.3);
    const tone = Math.abs(luma(accent) - luma(body)) < 0.12 ? mixc(accent, luma(accent) > 0.5 ? INK : WHITE, 0.4) : accent;
    switch (gear) {
      case "backpack":
        return [
          at(new THREE.BoxGeometry(0.4, 0.46, 0.2), 0, 1.2, -0.29, tone),
          at(new THREE.BoxGeometry(0.42, 0.15, 0.22), 0, 1.38, -0.29, dark),
          at(new THREE.BoxGeometry(0.26, 0.14, 0.06), 0, 1.08, -0.41, dark),
          at(new THREE.BoxGeometry(0.06, 0.5, 0.03), -0.12, 1.22, 0.245, dark),
          at(new THREE.BoxGeometry(0.06, 0.5, 0.03), 0.12, 1.22, 0.245, dark),
        ];
      case "satchel": {
        const front = new THREE.BoxGeometry(0.06, 0.82, 0.03).rotateZ(0.72);
        const back = new THREE.BoxGeometry(0.06, 0.82, 0.03).rotateZ(0.72);
        return [
          at(front, 0.02, 1.2, 0.255, dark),
          at(back, 0.02, 1.2, -0.255, dark),
          at(new THREE.BoxGeometry(0.14, 0.3, 0.34), 0.33, 0.93, 0.0, tone),
          at(new THREE.BoxGeometry(0.15, 0.1, 0.35), 0.33, 1.06, 0.0, dark),
        ];
      }
      case "scarf":
        return [
          at(new THREE.TorusGeometry(0.17, 0.065, 6, 16).rotateX(Math.PI / 2), 0, 1.5, 0, tone),
          at(new THREE.BoxGeometry(0.11, 0.34, 0.05).rotateZ(-0.12), 0.09, 1.32, 0.24, tone),
          at(new THREE.BoxGeometry(0.11, 0.3, 0.05).rotateX(-0.25), -0.05, 1.33, -0.25, dark),
        ];
      default:
        return [];
    }
  }

  /** The explorer for a spec, in network units (about 1.8 tall). */
  function buildAvatar(spec) {
    const root = new THREE.Group();
    root.name = "avatar";
    const body = c(spec.body);
    const accent = c(spec.accent);
    const skin = c(spec.skin);
    const shirtDark = mixc(body, INK, 0.25);
    const hair = HAIR[specHash(spec, 1) % HAIR.length].clone();
    let pants = TROUSERS[specHash(spec, 2) % TROUSERS.length].clone();
    if (Math.abs(luma(pants) - luma(body)) < 0.06) pants = mixc(pants, INK, 0.4);
    const shoes = luma(accent) > 0.85 ? WHITE.clone() : mixc(accent, INK, 0.35);
    const stripe = Math.abs(luma(accent) - luma(body)) < 0.1 ? mixc(body, luma(body) > 0.5 ? INK : WHITE, 0.55) : accent;
    const scale = 0.94 + (specHash(spec, 3) % 13) / 100;

    const geos = [];
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const meshOf = (parts) => {
      const g = merge(parts);
      geos.push(g);
      const m = new THREE.Mesh(g, material);
      m.castShadow = true;
      return m;
    };

    const leg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.13 * side, 0.78, 0);
      pivot.add(meshOf([at(new THREE.CapsuleGeometry(0.11, 0.44, 3, 8), 0, -0.36, 0, pants), at(new THREE.BoxGeometry(0.2, 0.12, 0.3), 0, -0.72, 0.05, shoes)]));
      return pivot;
    };
    const leftLeg = leg(-1);
    const rightLeg = leg(1);

    const bodyGroup = new THREE.Group();
    const hip = meshOf([at(new THREE.CylinderGeometry(0.25, 0.23, 0.22, 10), 0, 0.84, 0, pants)]);

    const chest = new THREE.Group();
    chest.position.y = 0.92;
    const chestParts = [
      at(new THREE.CylinderGeometry(0.22, 0.28, 0.58, 10), 0, 1.2, 0, body),
      at(new THREE.CylinderGeometry(0.246, 0.256, 0.09, 10), 0, 1.24, 0, stripe),
      at(new THREE.CylinderGeometry(0.13, 0.2, 0.08, 10), 0, 1.5, 0, shirtDark),
      ...gearParts(spec.gear, accent, body),
    ];
    for (const g of chestParts) g.translate(0, -0.92, 0);
    chest.add(meshOf(chestParts));

    const arm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.3 * side, 1.43, 0);
      pivot.rotation.z = 0.12 * side;
      pivot.add(meshOf([at(new THREE.CapsuleGeometry(0.075, 0.36, 3, 8), 0, -0.24, 0, body), at(new THREE.SphereGeometry(0.075, 8, 6), 0, -0.5, 0, skin)]));
      return pivot;
    };
    const leftArm = arm(-1);
    const rightArm = arm(1);

    const head = new THREE.Group();
    head.position.y = 1.66;
    const blush = mixc(skin, new THREE.Color("#ff8a8a"), 0.35);
    head.add(meshOf([
      at(new THREE.SphereGeometry(0.2, 14, 10), 0, 0, 0, skin),
      at(new THREE.SphereGeometry(0.212, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).rotateX(-0.42), 0, 0.012, -0.01, hair),
      at(new THREE.SphereGeometry(0.027, 6, 4), -0.075, 0.015, 0.183, INK),
      at(new THREE.SphereGeometry(0.027, 6, 4), 0.075, 0.015, 0.183, INK),
      at(new THREE.SphereGeometry(0.03, 6, 4).scale(1.3, 0.7, 0.5), -0.12, -0.05, 0.155, blush),
      at(new THREE.SphereGeometry(0.03, 6, 4).scale(1.3, 0.7, 0.5), 0.12, -0.05, 0.155, blush),
      ...hatParts(spec.hat, accent, body),
    ]));

    bodyGroup.add(hip, chest, leftArm, rightArm, head);

    // A soft blob shadow keeps the walker grounded even outside the shadow map.
    const blobMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.22, depthWrite: false });
    const blobGeo = new THREE.CircleGeometry(0.42, 20);
    geos.push(blobGeo);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.05;
    blob.renderOrder = 2;

    const figure = new THREE.Group();
    figure.scale.setScalar(scale);
    figure.add(leftLeg, rightLeg, bodyGroup);
    root.add(figure, blob);

    let phase = Math.random() * Math.PI * 2;
    let swingAmp = 0;
    const lookPhase = Math.random() * 10;
    /** Advance the walk cycle or idle breathing. speed01: 0 idle, 1 walk, more than 1 run. */
    const animate = (dt, time, speed01, reduced) => {
      if (reduced) {
        leftLeg.rotation.x = rightLeg.rotation.x = 0;
        leftArm.rotation.x = rightArm.rotation.x = 0;
        bodyGroup.position.y = 0;
        bodyGroup.rotation.x = 0;
        chest.scale.set(1, 1, 1);
        head.rotation.y = 0;
        return;
      }
      const moving = speed01 > 0.02;
      const run = speed01 > 1.05;
      phase += dt * (run ? 13 : 9.5) * Math.max(0.35, Math.min(1, speed01));
      const targetAmp = moving ? (run ? 0.85 : 0.6) * Math.min(1, speed01 + 0.25) : 0;
      swingAmp += (targetAmp - swingAmp) * Math.min(1, dt * 12);
      const swing = Math.sin(phase) * swingAmp;
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.9;
      rightArm.rotation.x = swing * 0.9;
      const breathe = Math.sin(time * 2.1 + lookPhase);
      bodyGroup.position.y = moving ? Math.abs(Math.sin(phase)) * 0.07 * swingAmp : breathe * 0.01;
      const k = moving ? 0 : 1;
      chest.scale.set(1 + breathe * 0.014 * k, 1 + breathe * 0.024 * k, 1 + breathe * 0.014 * k);
      bodyGroup.rotation.x = run ? 0.12 : moving ? 0.04 : 0;
      head.rotation.y = moving ? head.rotation.y * 0.9 : Math.sin(time * 0.6 + lookPhase) * 0.2;
    };

    const dispose = () => {
      for (const g of geos) g.dispose();
      material.dispose();
      blobMat.dispose();
    };

    return { root, spec, animate, dispose };
  }

  return { buildAvatar };
}
