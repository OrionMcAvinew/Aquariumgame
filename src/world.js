// Builds the 3D store: room, furniture units (tanks/shelves), delivery boxes.
import * as THREE from "three";
import { RoundedBoxGeometry } from "../lib/jsm/RoundedBoxGeometry.js";
import {
  STORE, TANK_SLOTS, SHELF_SLOTS, COUNTER, PALLET,
  SHELF_ROWS, ROW_CAP, item, FISH,
} from "./data.js";

// PBR material so surfaces pick up the room environment (reflections, softer
// shading) instead of looking flat. Small decor/coral keep cheaper materials.
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });
// rounded-edge box to soften the blocky furniture
const rbox = (w, h, d, r = 0.05) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.max(0.008, Math.min(r, Math.min(w, h, d) / 2 - 0.004)));

// soft contact-shadow blob to ground furniture on the floor
let _shadowTex = null;
function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}
function addContactShadow(group, w, d, y = 0.02) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  group.add(m);
}

const NAVY = 0x1d3557;
const TRIM = 0xf4f1ea;

// canvas colour helpers (operate on 0xRRGGBB ints)
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const cssOf = (c, a = 1) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
const lightenCss = (c, f) => { const [r, g, b] = rgbOf(c); return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})`; };
const darkenCss = (c, f) => { const [r, g, b] = rgbOf(c); return `rgb(${Math.round(r * (1 - f))},${Math.round(g * (1 - f))},${Math.round(b * (1 - f))})`; };

// deterministic per-slot randomness so decorations don't reshuffle on reload
function seededRand(seed) {
  let s = seed * 2654435761 % 2 ** 32;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function canvasTexture(draw, w = 128, h = 128) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- Room ---------------- */

function makePoster(title, sub, bg, fg) {
  return canvasTexture((ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = fg; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 236, 300);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText(title, 128, 90);
    ctx.font = "100px sans-serif";
    ctx.fillText("🐠", 128, 200);
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(sub, 128, 270);
  }, 256, 320);
}

function makeAisleSign(text, bg) {
  return canvasTexture((ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68);
  }, 512, 128);
}

export function buildRoom(scene, colliders) {
  const { halfW, halfD, wallH, doorHalf } = STORE;

  // Floor: warm orange wood planks
  const floorTex = canvasTexture((ctx) => {
    const tones = ["#b9742f", "#a96527", "#c07f3a", "#b06c2a", "#c8893f"];
    for (let p = 0; p < 4; p++) {
      ctx.fillStyle = tones[p % tones.length];
      ctx.fillRect(0, p * 32, 128, 32);
      // plank seams + grain
      ctx.fillStyle = "rgba(60,30,5,0.45)";
      ctx.fillRect(0, p * 32, 128, 2);
      ctx.fillRect(((p * 53) % 128), p * 32, 2, 32);
      ctx.strokeStyle = "rgba(80,40,10,0.18)";
      for (let g = 0; g < 3; g++) {
        ctx.beginPath();
        ctx.moveTo(0, p * 32 + 8 + g * 8);
        ctx.lineTo(128, p * 32 + 6 + g * 9);
        ctx.stroke();
      }
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(halfW * 0.8, halfD * 0.8);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfD * 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.5 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Outside: sidewalk, road, planters, lamp post
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 8, 4.5), mat(0xa8a5a0));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(0, -0.01, halfD + 2.25);
  scene.add(walk);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 8, 8), mat(0x52555a));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.02, halfD + 8.5);
  scene.add(road);
  for (const px of [-3.2, 3.2]) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.7), mat(0x7f5539));
    planter.position.set(px, 0.25, halfD + 1.1);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mat(0x4f772d));
    bush.position.set(px, 0.75, halfD + 1.1);
    bush.scale.y = 0.8;
    scene.add(planter, bush);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 8), mat(0x343a40));
  post.position.set(6.5, 1.7, halfD + 1.6);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
  lamp.position.set(6.5, 3.4, halfD + 1.6);
  scene.add(post, lamp);

  // Walls: warm butter-yellow
  const wallMat = mat(0xf0e0b2);
  const wall = (w, x, z, rotY, material = wallMat, h = wallH, y = wallH / 2, depth = 0.25) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  wall(halfW * 2, 0, -halfD, 0);                                 // north
  wall(halfD * 2, -halfW, 0, Math.PI / 2);                       // west
  wall(halfD * 2, halfW, 0, Math.PI / 2);                        // east

  // Navy feature panels behind the aquatics section (west wall + NW segment)
  const navyMat = mat(NAVY);
  wall(halfD * 2, -halfW + 0.14, 0, Math.PI / 2, navyMat, 2.75, 1.375, 0.05);
  wall(5.6, -5.0, -halfD + 0.14, 0, navyMat, 2.75, 1.375, 0.05);
  // white trim caps on the panels
  wall(halfD * 2, -halfW + 0.17, 0, Math.PI / 2, mat(TRIM), 0.1, 2.78, 0.06);
  wall(5.6, -5.0, -halfD + 0.17, 0, mat(TRIM), 0.1, 2.78, 0.06);

  // South storefront: knee wall + big glass windows flanking the door
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcfeefb, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, envMapIntensity: 1.5,
  });
  const segW = halfW - doorHalf;
  for (const side of [-1, 1]) {
    const cx = side * (doorHalf + segW / 2);
    wall(segW, cx, halfD, 0, navyMat, 0.8, 0.4);                       // knee wall
    wall(segW, cx, halfD, 0, navyMat, 0.5, wallH - 0.25);              // header band
    const win = new THREE.Mesh(new THREE.BoxGeometry(segW - 0.3, wallH - 1.3, 0.06), glassMat);
    win.position.set(cx, 0.8 + (wallH - 1.3) / 2, halfD);
    scene.add(win);
    // window mullions
    for (let i = 1; i < 3; i++) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.07, wallH - 1.3, 0.1), mat(0x2b2d42));
      mull.position.set(cx - (segW - 0.3) / 2 + ((segW - 0.3) / 3) * i, 0.8 + (wallH - 1.3) / 2, halfD);
      scene.add(mull);
    }
  }
  // door frame + header
  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.45, 0.3), mat(0x2b2d42));
    jamb.position.set(side * doorHalf, 1.225, halfD);
    scene.add(jamb);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.16, wallH - 2.3, 0.25), navyMat);
  header.position.set(0, 2.3 + (wallH - 2.3) / 2, halfD);
  scene.add(header);

  // Ceiling + light fixtures
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfD * 2),
    new THREE.MeshBasicMaterial({ color: 0xe7ebe4 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = wallH;
  scene.add(ceil);
  const fixMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (const x of [-5, 0, 5]) for (const z of [-3.5, 1.5]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.7), fixMat);
    f.position.set(x, wallH - 0.04, z);
    scene.add(f);
  }

  // Hanging aisle signs
  const signDefs = [
    { tex: makeAisleSign("🐠 AQUATICS", "#1d3557"), x: -6.5, rotY: Math.PI / 2 },
    { tex: makeAisleSign("🧰 SUPPLIES", "#2a9d8f"), x: 6.5, rotY: -Math.PI / 2 },
  ];
  for (const s of signDefs) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshLambertMaterial({ map: s.tex, side: THREE.DoubleSide }));
    board.position.set(s.x, 2.65, 0);
    board.rotation.y = s.rotY;
    scene.add(board);
    for (const dz of [-1, 1]) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, wallH - 2.95, 4), mat(0x495057));
      wire.position.set(s.x, (wallH + 2.95) / 2 - 0.18, dz);
      scene.add(wire);
    }
  }

  // Posters
  const posters = [
    { tex: makePoster("NEW!", "Exotic species weekly", "#0b3954", "#ffd166"), x: 0.8, z: -halfD + 0.14, ry: 0 },
    { tex: makePoster("CARE", "Happy fish sell best", "#87431d", "#ffe8d6"), x: 2.2, z: -halfD + 0.14, ry: 0 },
    { tex: makePoster("SALE", "Starter kits in stock", "#283618", "#a3b18a"), x: halfW - 0.14, z: 3.4, ry: -Math.PI / 2 },
  ];
  for (const p of posters) {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4),
      new THREE.MeshLambertMaterial({ map: p.tex }));
    poster.position.set(p.x, 2.1, p.z);
    poster.rotation.y = p.ry;
    scene.add(poster);
  }

  // Welcome mat + outside sign
  const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), mat(0x356a8c));
  matMesh.rotation.x = -Math.PI / 2;
  matMesh.position.set(0, 0.005, halfD - 0.8);
  scene.add(matMesh);
  const signTex = canvasTexture((ctx) => {
    ctx.fillStyle = "#06283d"; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#ffd166"; ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🐠 FIN & FORTUNE", 256, 68);
  }, 512, 128);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25),
    new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 2.9, halfD + 0.15);
  sign.rotation.y = Math.PI;
  scene.add(sign);

  // Decorative plant islands in the middle of the floor
  for (const [ix, iz] of [[-5, 0.1], [6, 0.1]]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.8), mat(0x7f5539));
    base.position.set(ix, 0.275, iz);
    base.castShadow = true;
    scene.add(base);
    const r = seededRand(ix * 17 + 99);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.1 + r() * 0.08, 0.5 + r() * 0.5, 5),
        mat(i % 2 ? 0x4f772d : 0x6a994e)
      );
      leaf.position.set(ix - 0.7 + i * 0.45, 0.75 + r() * 0.2, iz + (r() - 0.5) * 0.4);
      scene.add(leaf);
    }
    colliders.push({ minX: ix - 1.0, maxX: ix + 1.0, minZ: iz - 0.4, maxZ: iz + 0.4 });
  }

  // Big potted palm by the north wall (fills the gap between sections)
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 10), mat(0xa44a3f));
  pot.position.set(0, 0.25, -halfD + 0.55);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 6), mat(0x7f5539));
  trunk.position.set(0, 1.0, -halfD + 0.55);
  scene.add(pot, trunk);
  const palmR = seededRand(404);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.85, 4), mat(0x4f772d));
    leaf.position.set(Math.cos(a) * 0.32, 1.65 + palmR() * 0.1, -halfD + 0.55 + Math.sin(a) * 0.32);
    leaf.rotation.z = Math.cos(a) * 1.15;
    leaf.rotation.x = -Math.sin(a) * 1.15;
    scene.add(leaf);
  }
  colliders.push({ minX: -0.4, maxX: 0.4, minZ: -halfD, maxZ: -halfD + 0.95 });

  // Barrel stack + cardboard pile near the delivery corner
  const barrelMat = [mat(0xc1121f), mat(0xf9c74f)];
  const barrelPos = [[-7.2, 0.3, 6.2], [-7.85, 0.3, 6.05], [-7.5, 0.9, 6.15]];
  barrelPos.forEach(([bx, by, bz], i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 10), barrelMat[i % 2]);
    b.position.set(bx, by, bz);
    b.castShadow = true;
    scene.add(b);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.08, 10), mat(TRIM));
    band.position.set(bx, by + 0.12, bz);
    scene.add(band);
  });
  colliders.push({ minX: -8.2, maxX: -6.85, minZ: 5.7, maxZ: 6.55 });

  // Wall colliders (door stays open but blocked so the player remains inside)
  colliders.push(
    { minX: -halfW - 1, maxX: halfW + 1, minZ: -halfD - 1, maxZ: -halfD + 0.2 },
    { minX: -halfW - 1, maxX: -halfW + 0.2, minZ: -halfD, maxZ: halfD },
    { minX: halfW - 0.2, maxX: halfW + 1, minZ: -halfD, maxZ: halfD },
    { minX: -halfW, maxX: halfW, minZ: halfD - 0.2, maxZ: halfD + 1 },
  );

  // Checkout counter + register
  const counterGroup = new THREE.Group();
  const top = new THREE.Mesh(rbox(COUNTER.w, 0.08, COUNTER.d, 0.035), mat(0x8a5a3b, { roughness: 0.6 }));
  top.position.y = COUNTER.h;
  const body = new THREE.Mesh(rbox(COUNTER.w - 0.1, COUNTER.h, COUNTER.d - 0.15, 0.05), mat(NAVY, { roughness: 0.55 }));
  body.position.y = COUNTER.h / 2;
  const register = new THREE.Mesh(rbox(0.42, 0.3, 0.36, 0.05), mat(0x2b2d42, { roughness: 0.5 }));
  register.position.set(-COUNTER.w / 2 + 0.45, COUNTER.h + 0.19, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x9ef0ff }));
  screen.position.set(-COUNTER.w / 2 + 0.45, COUNTER.h + 0.22, 0.19);
  const cardReader = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), mat(0x495057));
  cardReader.position.set(0.2, COUNTER.h + 0.12, 0.25);
  cardReader.rotation.x = -0.4;
  const bagStand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.25), mat(0xd5bdaf));
  bagStand.position.set(COUNTER.w / 2 - 0.35, COUNTER.h + 0.24, 0);
  counterGroup.add(top, body, register, screen, cardReader, bagStand);
  counterGroup.position.set(COUNTER.x, 0, COUNTER.z);
  counterGroup.traverse((m) => { m.castShadow = true; });
  scene.add(counterGroup);
  addContactShadow(counterGroup, COUNTER.w + 0.5, COUNTER.d + 0.6);
  colliders.push({
    minX: COUNTER.x - COUNTER.w / 2, maxX: COUNTER.x + COUNTER.w / 2,
    minZ: COUNTER.z - COUNTER.d / 2, maxZ: COUNTER.z + COUNTER.d / 2,
  });

  // Delivery pallet
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.4), mat(0xb08954));
  pallet.position.set(PALLET.x, 0.07, PALLET.z);
  pallet.receiveShadow = true;
  scene.add(pallet);
}

/* ---------------- Fish art assets (Kenney Fish Pack, CC0) ---------------- */

// Base sprites are recolored at runtime so a handful of shapes cover the
// whole roster (same approach as commercial recolor sheets). base: PNG to
// load; tint: hue/saturation applied while keeping the original shading.
const SPRITE_MAP = {
  guppy:     { base: "fish_orange" },
  goldfish:  { base: "fish_orange", tint: 0xffb703 },
  danio:     { base: "fish_grey" },
  molly:     { base: "fish_grey",   tint: 0x2b2d42 },
  tetra:     { base: "fish_blue",   tint: 0x00b4d8 },
  cory:      { base: "fish_grey",   tint: 0xc2a37a },
  swordtail: { base: "fish_red" },
  betta:     { base: "fish_red",    tint: 0xb5179e },
  rainbow:   { base: "fish_blue" },
  gourami:   { base: "fish_green" },
  angelfish: { base: "fish_pink",   tint: 0xe9ecef },
  clownfish: { base: "fish_orange", tint: 0xf3722c },
  ram:       { base: "fish_blue",   tint: 0x3a86ff },
  discus:    { base: "fish_pink",   tint: 0x118ab2 },
  oscar:     { base: "fish_brown",  tint: 0x7a3a14 },
  lionfish:  { base: "fish_red",    tint: 0x9b2226 },
  koi:       { base: "fish_orange", tint: 0xf2a65a },
  arowana:   { base: "fish_grey_long_a" },
  platy:     { base: "fish_orange", tint: 0xff5a36 },
  rasbora:   { base: "fish_grey",   tint: 0xd98c5f },
  pleco:     { base: "fish_grey_long_b", tint: 0x5a4632 },
  parrot:    { base: "fish_pink",   tint: 0xff4d4d },
  bluetang:  { base: "fish_blue",   tint: 0x1976d2 },
  mandarin:  { base: "fish_green",  tint: 0x0a9396 },
  // seahorse intentionally absent -> renders with the procedural painter
};

const FISH_FILES = [
  "fish_blue", "fish_brown", "fish_green", "fish_grey",
  "fish_grey_long_a", "fish_grey_long_b", "fish_orange", "fish_pink", "fish_red",
];
export const FISH_IMG = {};

export function loadFishAssets(base = "assets/fish/") {
  return Promise.all(FISH_FILES.map((name) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { FISH_IMG[name] = img; res(); };
    img.onerror = () => res(); // tolerate a missing file -> procedural fallback
    img.src = base + name + ".png";
  })));
}

// Recolor a sprite to `tint` (hue+saturation), preserving its shading & alpha.
function recolorCanvas(img, tint) {
  const w = img.width, h = img.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  if (tint != null) {
    ctx.globalCompositeOperation = "color";
    ctx.fillStyle = cssOf(tint);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in"; // clip back to fish alpha
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  return c;
}

/* ---------------- Fish model (textured crossed-plane sprites) ---------------- */

// Painted body patterns, clipped to the body silhouette.
function drawPattern(ctx, w, h, cx, cy, bh, len, sp) {
  const c2 = sp.pattern2 != null ? sp.pattern2 : sp.fin;
  const backX = cx - len * 0.5, noseX = cx + len * 0.5;
  const R = seededRand(sp.id.length * 131 + 7);
  switch (sp.pattern) {
    case "spots":
      ctx.fillStyle = cssOf(c2, 0.8);
      for (let i = 0; i < 16; i++) {
        const x = backX + R() * len, y = cy - bh + R() * 2 * bh;
        ctx.beginPath(); ctx.arc(x, y, bh * (0.07 + R() * 0.08), 0, Math.PI * 2); ctx.fill();
      }
      break;
    case "vstripe":
      ctx.fillStyle = cssOf(c2, 0.85);
      for (let i = 0; i < 5; i++) {
        const x = backX + len * (0.15 + 0.7 * i / 4);
        ctx.fillRect(x - len * 0.028, cy - bh, len * 0.056, 2 * bh);
      }
      break;
    case "bands": // clownfish-style angled white bands with dark edges
      [0.3, 0.56, 0.82].forEach((t) => {
        const x = backX + len * t;
        ctx.beginPath();
        ctx.moveTo(x - len * 0.07, cy - bh); ctx.lineTo(x + len * 0.03, cy - bh);
        ctx.lineTo(x + len * 0.07, cy + bh); ctx.lineTo(x - len * 0.03, cy + bh);
        ctx.closePath();
        ctx.fillStyle = cssOf(c2, 0.95); ctx.fill();
        ctx.lineWidth = h * 0.02; ctx.strokeStyle = "rgba(20,20,20,0.55)"; ctx.stroke();
      });
      break;
    case "hstripe": // neon tetra lateral line
      ctx.fillStyle = cssOf(c2, 0.92);
      ctx.fillRect(backX, cy - bh * 0.2, len, bh * 0.24);
      ctx.fillStyle = cssOf(sp.fin, 0.9);
      ctx.fillRect(cx - len * 0.05, cy + bh * 0.06, len * 0.55, bh * 0.18);
      break;
    case "zebra":
      ctx.fillStyle = cssOf(c2, 0.8);
      for (let i = 0; i < 9; i++) {
        const x = backX + len * (0.05 + 0.9 * i / 8);
        ctx.fillRect(x - len * 0.013, cy - bh, len * 0.026, 2 * bh);
      }
      break;
    case "marble":
      ctx.fillStyle = cssOf(c2, 0.85);
      for (let i = 0; i < 8; i++) {
        const x = backX + R() * len, y = cy - bh + R() * 2 * bh;
        ctx.beginPath();
        ctx.ellipse(x, y, len * (0.05 + R() * 0.09), bh * (0.2 + R() * 0.3), R() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "patches": { // koi
      const blob = (col, n) => {
        ctx.fillStyle = cssOf(col, 0.95);
        for (let i = 0; i < n; i++) {
          const x = backX + R() * len, y = cy - bh + R() * 2 * bh;
          ctx.beginPath();
          ctx.ellipse(x, y, len * (0.08 + R() * 0.1), bh * (0.3 + R() * 0.35), R() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      blob(c2, 3); blob(0x1a1a1a, 2);
      break;
    }
    case "rainbow": {
      const g = ctx.createLinearGradient(backX, 0, noseX, 0);
      ["#3a86ff", "#4cc9f0", "#06d6a0", "#ffd166", "#f72585"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.fillRect(0, cy - bh, w, 2 * bh); ctx.globalAlpha = 1;
      break;
    }
    case "scale":
      ctx.strokeStyle = cssOf(sp.fin, 0.5); ctx.lineWidth = h * 0.012;
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
        const x = backX + len * (0.08 + 0.86 * i / 8), y = cy - bh * 0.6 + r * bh * 0.6;
        ctx.beginPath(); ctx.arc(x, y, bh * 0.24, 0.25, Math.PI - 0.25); ctx.stroke();
      }
      break;
    case "gradient": {
      const g = ctx.createLinearGradient(backX, 0, noseX, 0);
      g.addColorStop(0, darkenCss(c2, 0.1)); g.addColorStop(1, lightenCss(sp.color, 0.25));
      ctx.globalAlpha = 0.65; ctx.fillStyle = g; ctx.fillRect(0, cy - bh, w, 2 * bh); ctx.globalAlpha = 1;
      break;
    }
  }
}

function drawFish(ctx, w, h, sp) {
  const cx = w * 0.46, cy = h * 0.5;
  const len = w * 0.74, bh = h * (sp.bodyH || 0.42);
  const noseX = cx + len * 0.5, backX = cx - len * 0.5;

  // fins behind body
  ctx.fillStyle = cssOf(sp.fin, 0.9);
  ctx.beginPath(); // dorsal
  ctx.moveTo(cx - bh * 0.2, cy - bh * 0.5);
  ctx.lineTo(cx + len * 0.05, cy - bh * 1.0);
  ctx.lineTo(cx + len * 0.2, cy - bh * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); // pelvic
  ctx.moveTo(cx, cy + bh * 0.45);
  ctx.lineTo(cx + len * 0.02, cy + bh * 0.98);
  ctx.lineTo(cx + len * 0.18, cy + bh * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); // pectoral
  ctx.ellipse(noseX - len * 0.24, cy + bh * 0.28, len * 0.1, bh * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // body silhouette
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(noseX, cy);
    ctx.quadraticCurveTo(cx, cy - bh, backX, cy - bh * 0.4);
    ctx.quadraticCurveTo(backX - len * 0.05, cy, backX, cy + bh * 0.4);
    ctx.quadraticCurveTo(cx, cy + bh, noseX, cy);
    ctx.closePath();
  };
  bodyPath();
  ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(0, cy - bh, 0, cy + bh);
  g.addColorStop(0, lightenCss(sp.color, 0.38));
  g.addColorStop(0.45, cssOf(sp.color));
  g.addColorStop(1, darkenCss(sp.color, 0.32));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  drawPattern(ctx, w, h, cx, cy, bh, len, sp);
  ctx.restore();

  // outline + gill + eye
  bodyPath();
  ctx.lineWidth = Math.max(2, h * 0.024); ctx.strokeStyle = darkenCss(sp.color, 0.5); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(noseX - len * 0.2, cy - bh * 0.5);
  ctx.quadraticCurveTo(noseX - len * 0.3, cy, noseX - len * 0.2, cy + bh * 0.5);
  ctx.lineWidth = Math.max(1, h * 0.012); ctx.strokeStyle = darkenCss(sp.color, 0.28); ctx.stroke();
  const ex = noseX - len * 0.13, ey = cy - bh * 0.12, er = Math.max(3, bh * 0.17);
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.beginPath(); ctx.arc(ex + er * 0.2, ey, er * 0.55, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill();
  ctx.beginPath(); ctx.arc(ex - er * 0.15, ey - er * 0.25, er * 0.2, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
}

function drawSeahorse(ctx, w, h, sp) {
  const cx = w * 0.5, top = h * 0.12;
  ctx.save();
  ctx.translate(cx, top);
  // body: curved tapering tube + snout + curled tail
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(w * 0.45, h * 0.18, w * 0.32, h * 0.5, w * 0.05, h * 0.62);
  ctx.bezierCurveTo(-w * 0.18, h * 0.72, -w * 0.05, h * 0.86, w * 0.12, h * 0.8);
  ctx.lineWidth = Math.max(6, w * 0.16);
  ctx.lineCap = "round";
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, lightenCss(sp.color, 0.3));
  grad.addColorStop(1, darkenCss(sp.color, 0.25));
  ctx.strokeStyle = grad; ctx.stroke();
  // head + snout
  ctx.beginPath(); ctx.arc(0, 0, w * 0.13, 0, Math.PI * 2); ctx.fillStyle = cssOf(sp.color); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.05, -h * 0.02); ctx.lineTo(w * 0.3, h * 0.02); ctx.lineTo(w * 0.05, h * 0.06);
  ctx.closePath(); ctx.fillStyle = darkenCss(sp.color, 0.1); ctx.fill();
  // crest spines
  ctx.strokeStyle = cssOf(sp.fin, 0.9); ctx.lineWidth = w * 0.03;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w * 0.08, h * (0.0 + i * 0.06)); ctx.lineTo(-w * 0.16, h * (-0.02 + i * 0.06)); ctx.stroke(); }
  // eye
  ctx.beginPath(); ctx.arc(-w * 0.01, 0, w * 0.05, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, w * 0.025, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill();
  ctx.restore();
}

// True when a real Kenney sprite is available for this species.
function hasSprite(sp) {
  const m = SPRITE_MAP[sp.id];
  return !!(m && FISH_IMG[m.base]) && sp.tail !== "seahorse";
}

const fishTexCache = new Map();
function fishTexture(sp) {
  if (fishTexCache.has(sp.id)) return fishTexCache.get(sp.id);

  // Preferred path: recolored Kenney sprite (already includes fins + tail).
  if (hasSprite(sp)) {
    const m = SPRITE_MAP[sp.id];
    const img = FISH_IMG[m.base];
    const tex = new THREE.CanvasTexture(recolorCanvas(img, m.tint));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { aspect: img.height / img.width, sprite: true };
    fishTexCache.set(sp.id, tex);
    return tex;
  }

  // Fallback: hand-painted canvas fish (and the bespoke seahorse).
  const seahorse = sp.tail === "seahorse";
  const W = seahorse ? 120 : 208, H = seahorse ? 168 : 120;
  const tex = canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (seahorse) drawSeahorse(ctx, w, h, sp);
    else drawFish(ctx, w, h, sp);
  }, W, H);
  tex.userData = { aspect: H / W, sprite: false };
  fishTexCache.set(sp.id, tex);
  return tex;
}

const tailTexCache = new Map();
function tailTexture(sp) {
  if (tailTexCache.has(sp.id)) return tailTexCache.get(sp.id);
  const tt = sp.tail;
  const tex = canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const ax = w * 0.92, cy = h * 0.5; // attaches at the right edge
    const grad = ctx.createLinearGradient(w * 0.05, 0, ax, 0);
    grad.addColorStop(0, lightenCss(sp.fin, 0.2));
    grad.addColorStop(1, darkenCss(sp.fin, 0.15));
    ctx.fillStyle = grad;
    if (tt === "spiky") { // lionfish rays
      ctx.strokeStyle = cssOf(sp.fin, 0.92); ctx.lineWidth = h * 0.05;
      for (let i = 0; i < 7; i++) {
        const a = -0.75 + 1.5 * i / 6;
        ctx.save(); ctx.translate(ax, cy); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w * 0.8, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = cssOf(sp.pattern2 || 0xffffff, 0.8); ctx.lineWidth = h * 0.018;
      for (let i = 0; i < 7; i++) {
        const a = -0.75 + 1.5 * i / 6;
        ctx.save(); ctx.translate(ax, cy); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-w * 0.2, 0); ctx.lineTo(-w * 0.8, 0); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    ctx.beginPath();
    if (tt === "fork") {
      ctx.moveTo(ax, cy); ctx.lineTo(w * 0.08, h * 0.1); ctx.lineTo(w * 0.36, cy);
      ctx.lineTo(w * 0.08, h * 0.9); ctx.closePath();
    } else if (tt === "sword") {
      ctx.moveTo(ax, cy); ctx.lineTo(w * 0.22, h * 0.34); ctx.lineTo(w * 0.02, h * 0.66);
      ctx.lineTo(w * 0.34, cy + h * 0.05); ctx.closePath();
    } else if (tt === "round") {
      ctx.moveTo(ax, cy); ctx.quadraticCurveTo(w * 0.04, h * 0.08, w * 0.06, cy);
      ctx.quadraticCurveTo(w * 0.04, h * 0.92, ax, cy); ctx.closePath();
    } else { // fan
      ctx.moveTo(ax, cy);
      ctx.quadraticCurveTo(w * 0.12, h * 0.02, w * 0.06, h * 0.28);
      ctx.quadraticCurveTo(w * 0.0, h * 0.5, w * 0.06, h * 0.72);
      ctx.quadraticCurveTo(w * 0.12, h * 0.98, ax, cy); ctx.closePath();
    }
    ctx.fill();
    ctx.lineWidth = h * 0.022; ctx.strokeStyle = darkenCss(sp.fin, 0.4); ctx.stroke();
    ctx.strokeStyle = darkenCss(sp.fin, 0.22); ctx.lineWidth = h * 0.012;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(ax, cy); ctx.lineTo(w * 0.12, h * (0.18 + 0.64 * i / 3)); ctx.stroke();
    }
  }, 128, 128);
  tailTexCache.set(sp.id, tex);
  return tex;
}

function spriteMat(tex) {
  return new THREE.MeshLambertMaterial({
    map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
  });
}

function buildFishMesh(sp, scale = 1) {
  const s = (sp.size || 1) * scale;
  const group = new THREE.Group();
  const tex = fishTexture(sp);
  const sprite = tex.userData.sprite;
  const seahorse = sp.tail === "seahorse";
  const bodyMat = spriteMat(tex);

  // Kenney sprites are a whole fish in a 64x64 frame; procedural fish are
  // tightly cropped, so they use a smaller plane.
  const W = (sprite ? 0.56 : seahorse ? 0.26 : 0.52) * s;
  const H = W * tex.userData.aspect;

  const pA = new THREE.Mesh(new THREE.PlaneGeometry(W, H), bodyMat);
  const pB = pA.clone(); pB.rotation.y = Math.PI / 2;
  group.add(pA, pB);

  // Procedural fish get a separate wiggling tail; sprites already include it.
  let tail = null;
  if (!sprite && !seahorse) {
    const tmat = spriteMat(tailTexture(sp));
    tail = new THREE.Group();
    tail.position.x = -W * 0.46;
    const tW = W * 0.55, tH = H * 1.2;
    const t1 = new THREE.Mesh(new THREE.PlaneGeometry(tW, tH), tmat);
    t1.position.x = -tW * 0.46;
    const t2 = t1.clone(); t2.rotation.y = Math.PI / 2;
    tail.add(t1, t2);
    group.add(tail);
  }
  return { group, tail, sprite };
}

/* ---------------- Fish tank unit (two-tier glowing rack) ---------------- */

/* ---------------- Coral library ---------------- */

const CORAL_PALETTE = [
  0xff6b6b, 0xff7b54, 0xffa62b, 0xf9c74f, 0xf15bb5,
  0xc77dff, 0x9b5de5, 0x00bbf9, 0x00f5d4, 0x4ecdc4, 0xff4d6d,
];

// emissive coral material so reefs glow under the tank light
function coralMat(color, emiss = 0.3) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.emissive = new THREE.Color(color).multiplyScalar(emiss);
  return m;
}
const _UP = new THREE.Vector3(0, 1, 0);
function cylBetween(a, b, r0, r1, material, seg = 6) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(_UP, dir.clone().normalize());
  return m;
}

// Branching staghorn / antler coral
function buildStaghorn(color, rand) {
  const g = new THREE.Group();
  const stalk = coralMat(color, 0.26);
  const tipHex = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).getHex();
  const tipMat = coralMat(tipHex, 0.42);
  const grow = (base, dir, len, rad, depth) => {
    const end = base.clone().addScaledVector(dir, len);
    g.add(cylBetween(base, end, rad, rad * 0.7, depth <= 1 ? tipMat : stalk));
    if (depth <= 0) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.9, 6, 5), tipMat);
      knob.position.copy(end); g.add(knob); return;
    }
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const nd = dir.clone();
      nd.x += (rand() - 0.5) * 1.2; nd.z += (rand() - 0.5) * 1.2; nd.y += rand() * 0.35;
      grow(end, nd.normalize(), len * (0.68 + rand() * 0.16), rad * 0.72, depth - 1);
    }
  };
  const start = new THREE.Vector3((rand() - 0.5) * 0.2, 1, (rand() - 0.5) * 0.2).normalize();
  grow(new THREE.Vector3(0, 0, 0), start, 0.1 + rand() * 0.04, 0.022, 3);
  return g;
}

// Brain coral — ridged dome
const brainTexCache = new Map();
function brainTexture(color) {
  if (brainTexCache.has(color)) return brainTexCache.get(color);
  const tex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = cssOf(color); ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    const R = seededRand(color + 1);
    ctx.strokeStyle = darkenCss(color, 0.45); ctx.lineWidth = w * 0.05;
    for (let l = 0; l < 11; l++) {
      ctx.beginPath();
      let x = R() * w, y = R() * h; ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) { x += (R() - 0.5) * w * 0.45; y += (R() - 0.5) * h * 0.45; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = lightenCss(color, 0.35); ctx.lineWidth = w * 0.022;
    for (let l = 0; l < 7; l++) {
      ctx.beginPath();
      let x = R() * w, y = R() * h; ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (R() - 0.5) * w * 0.35; y += (R() - 0.5) * h * 0.35; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 64, 64);
  brainTexCache.set(color, tex);
  return tex;
}
function buildBrain(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ map: brainTexture(color) });
  m.emissive = new THREE.Color(color).multiplyScalar(0.14);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
  dome.scale.set(1.15, 0.78, 1.15);
  g.add(dome);
  return g;
}

// Sea fan / gorgonian — lacy alpha-textured fan on crossed planes
const fanTexCache = new Map();
function fanTexture(color) {
  if (fanTexCache.has(color)) return fanTexCache.get(color);
  const tex = canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = cssOf(color); ctx.lineCap = "round";
    const R = seededRand(color + 7);
    const branch = (x, y, ang, len, wd, depth) => {
      if (depth < 0 || len < 2.5) return;
      const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      branch(nx, ny, ang - 0.32 - R() * 0.1, len * 0.82, wd * 0.72, depth - 1);
      branch(nx, ny, ang + 0.32 + R() * 0.1, len * 0.82, wd * 0.72, depth - 1);
      if (R() > 0.4) branch(nx, ny, ang + (R() - 0.5) * 0.15, len * 0.86, wd * 0.78, depth - 1);
    };
    branch(w * 0.5, h * 0.97, -Math.PI / 2, h * 0.27, w * 0.07, 5);
  }, 72, 88);
  fanTexCache.set(color, tex);
  return tex;
}
function buildFan(color, rand) {
  const m = new THREE.MeshLambertMaterial({
    map: fanTexture(color), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
  });
  m.emissive = new THREE.Color(color).multiplyScalar(0.22);
  const g = new THREE.Group();
  const w = 0.3, h = 0.34;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.y = h / 2;
  const p2 = p.clone(); p2.rotation.y = Math.PI / 2.4;
  g.add(p, p2);
  g.rotation.y = rand() * Math.PI;
  return g;
}

// Organ-pipe / tube coral
function buildTube(color, rand) {
  const g = new THREE.Group();
  const m = coralMat(color, 0.32);
  const mouth = coralMat(0x1a1a1a, 0);
  const n = 5 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const hh = 0.06 + rand() * 0.13;
    const x = (rand() - 0.5) * 0.13, z = (rand() - 0.5) * 0.11;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, hh, 8), m);
    t.position.set(x, hh / 2, z); g.add(t);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 8), mouth);
    rim.position.set(x, hh, z); g.add(rim);
  }
  return g;
}

// Sea anemone — swaying tentacles around a disc; pushes to `swayers`
function buildAnemone(color, rand, swayers) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), coralMat(color, 0.25));
  disc.scale.y = 0.6; disc.position.y = 0.025; g.add(disc);
  const tipHex = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6).getHex();
  const tcount = 16 + Math.floor(rand() * 8);
  for (let i = 0; i < tcount; i++) {
    const a = (i / tcount) * Math.PI * 2;
    const rr = 0.018 + rand() * 0.03;
    const hh = 0.06 + rand() * 0.06;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, hh, 5), coralMat(color, 0.32));
    t.position.set(Math.cos(a) * rr, 0.03 + hh / 2, Math.sin(a) * rr);
    const baseZ = -Math.cos(a) * 0.55, baseX = Math.sin(a) * 0.55;
    t.rotation.z = baseZ; t.rotation.x = baseX;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), coralMat(tipHex, 0.5));
    tip.position.y = hh / 2; t.add(tip);
    g.add(t);
    swayers.push({ mesh: t, phase: rand() * 6, baseZ, baseX, amp: 0.12 + rand() * 0.12 });
  }
  return g;
}

// Bubble / grape coral — pearly cluster
function buildBubble(color, rand) {
  const g = new THREE.Group();
  const m = coralMat(color, 0.2);
  const n = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const rr = 0.02 + rand() * 0.03;
    const s = new THREE.Mesh(new THREE.SphereGeometry(rr, 8, 6), m);
    s.position.set((rand() - 0.5) * 0.14, rr, (rand() - 0.5) * 0.12);
    g.add(s);
  }
  return g;
}

// Mushroom / leather coral — flat radial cap on a stalk
function buildMushroom(color, rand) {
  const g = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.05, 8), coralMat(0xd8c3a5, 0.1));
  stalk.position.y = 0.025; g.add(stalk);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), coralMat(color, 0.28));
  cap.scale.set(1.25, 0.45, 1.25); cap.position.y = 0.06; g.add(cap);
  const ridgeHex = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3).getHex();
  const ridge = coralMat(ridgeHex, 0.3);
  const rings = 6 + Math.floor(rand() * 4);
  for (let i = 0; i < rings; i++) {
    const a = (i / rings) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.11), ridge);
    r.position.set(Math.cos(a) * 0.055, 0.088, Math.sin(a) * 0.055);
    r.rotation.y = a; g.add(r);
  }
  return g;
}

// Pillar / finger coral — vertical rounded fingers
function buildPillar(color, rand) {
  const g = new THREE.Group();
  const m = coralMat(color, 0.3);
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.12 + rand() * 0.16;
    const x = (rand() - 0.5) * 0.14, z = (rand() - 0.5) * 0.11;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, h, 7), m);
    f.position.set(x, h / 2, z); g.add(f);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.024, 7, 6), m);
    tip.position.set(x, h, z); g.add(tip);
  }
  return g;
}

// Giant clam — ridged shells with a bright wavy mantle
function buildClam(color) {
  const g = new THREE.Group();
  const shell = coralMat(0xeae0cf, 0.08);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), shell);
  bottom.scale.set(1.3, 0.55, 1); bottom.rotation.x = Math.PI; bottom.position.y = 0.06; g.add(bottom);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), shell);
  top.scale.set(1.3, 0.55, 1); top.rotation.x = -0.6; top.position.set(0, 0.07, -0.02); g.add(top);
  const mantle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 18, Math.PI), coralMat(color, 0.45));
  mantle.rotation.x = Math.PI / 2 + 0.25; mantle.position.set(0, 0.07, 0.04); g.add(mantle);
  return g;
}

// Starfish lying on the substrate
function buildStarfish(color) {
  const g = new THREE.Group();
  const m = coralMat(color, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.05), m);
    arm.position.set(Math.cos(a) * 0.05, 0.014, Math.sin(a) * 0.05);
    arm.rotation.y = -a; g.add(arm);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), m);
    tip.position.set(Math.cos(a) * 0.11, 0.014, Math.sin(a) * 0.11); g.add(tip);
  }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m);
  c.scale.y = 0.5; c.position.y = 0.016; g.add(c);
  return g;
}

// Sea urchin — dark body bristling with spikes
function buildUrchin(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), coralMat(color, 0.15));
  body.position.y = 0.05; g.add(body);
  const spikeHex = new THREE.Color(color).lerp(new THREE.Color(0x000000), 0.25).getHex();
  const spikeM = coralMat(spikeHex, 0.1);
  for (let i = 0; i < 28; i++) {
    const u = Math.random(), v = Math.random();
    const th = Math.acos(2 * u - 1), ph = 2 * Math.PI * v;
    const dir = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    if (dir.y < -0.3) continue;
    const len = 0.05 + Math.random() * 0.045;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.006, len, 4), spikeM);
    const base = dir.clone().multiplyScalar(0.055).add(new THREE.Vector3(0, 0.05, 0));
    sp.position.copy(base.addScaledVector(dir, len * 0.5));
    sp.quaternion.setFromUnitVectors(_UP, dir);
    g.add(sp);
  }
  return g;
}

// soft tileable caustic light texture (cached), cloned per tank for offset
let _causticBase = null;
function makeCausticTexture() {
  if (!_causticBase) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const x = c.getContext("2d");
    x.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 18; i++) {
      const px = Math.random() * 128, py = Math.random() * 128, r = 10 + Math.random() * 22;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    _causticBase = c;
  }
  const t = new THREE.CanvasTexture(_causticBase);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.2);
  return t;
}

const MAIN_Y = 0.8;           // main tank base height
const MAIN_H = 0.95;          // main tank height
const DECO_Y = MAIN_Y + MAIN_H + 0.09; // upper display tank base

export class TankUnit {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = TANK_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotY;

    const navyMat = mat(NAVY, { roughness: 0.55 });
    const trimMat = mat(TRIM, { roughness: 0.6 });

    // cabinet base
    const cabinet = new THREE.Mesh(rbox(2.0, MAIN_Y, 0.78, 0.05), navyMat);
    cabinet.position.y = MAIN_Y / 2;
    cabinet.castShadow = true;
    const kick = new THREE.Mesh(rbox(2.0, 0.08, 0.8, 0.03), mat(0x14253c));
    kick.position.y = 0.04;
    const cabTrim = new THREE.Mesh(rbox(2.02, 0.06, 0.8, 0.025), trimMat);
    cabTrim.position.y = MAIN_Y - 0.03;

    // main tank: glowing back panel, water, glass
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x3ec3f7 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.86, MAIN_H - 0.12), this.glowMat);
    glow.position.set(0, MAIN_Y + MAIN_H / 2, -0.3);

    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x4fb4e0, transparent: true, opacity: 0.26, roughness: 0.1, metalness: 0 });
    this.water = new THREE.Mesh(new THREE.BoxGeometry(1.86, MAIN_H - 0.18, 0.58), this.waterMat);
    this.water.position.y = MAIN_Y + (MAIN_H - 0.18) / 2 + 0.1;

    // reflective glass: low roughness + env map reflections
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xeaffff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, envMapIntensity: 1.4,
    });
    this.glass = new THREE.Mesh(rbox(1.94, MAIN_H, 0.7, 0.04), glassMat);
    this.glass.position.y = MAIN_Y + MAIN_H / 2;
    this.glass.userData.interact = { type: "tank", unit: this };

    const gravel = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.08, 0.58), mat(0xc9a86b, { roughness: 1 }));
    gravel.position.y = MAIN_Y + 0.06;

    // hood between tiers with a light strip
    const hood = new THREE.Mesh(rbox(2.0, 0.1, 0.76, 0.04), navyMat);
    hood.position.y = MAIN_Y + MAIN_H + 0.04;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.025, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xf4fcff }));
    strip.position.y = MAIN_Y + MAIN_H - 0.02;

    // shimmering water surface near the top of the tank
    this.surfaceMat = new THREE.MeshBasicMaterial({
      color: 0xbff0ff, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 0.6), this.surfaceMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = MAIN_Y + MAIN_H - 0.14;
    this.surface = surface;

    // angled reflection streak on the front glass
    const highlight = new THREE.Mesh(new THREE.PlaneGeometry(0.4, MAIN_H * 1.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
    highlight.position.set(-0.45, MAIN_Y + MAIN_H / 2, 0.36);
    highlight.rotation.z = 0.5;

    this.group.add(cabinet, kick, cabTrim, glow, this.water, this.glass, gravel, hood, strip, surface, highlight);

    // upper decorative display tank (ambient fish, pure vibes)
    const decoH = 0.5;
    const decoGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.86, decoH - 0.08),
      new THREE.MeshBasicMaterial({ color: 0x59d1f9 }));
    decoGlow.position.set(0, DECO_Y + decoH / 2, -0.28);
    const decoWater = new THREE.Mesh(new THREE.BoxGeometry(1.86, decoH - 0.1, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x4fb4e0, transparent: true, opacity: 0.22, roughness: 0.1 }));
    decoWater.position.y = DECO_Y + decoH / 2;
    const decoGlass = new THREE.Mesh(rbox(1.94, decoH, 0.62, 0.035), glassMat);
    decoGlass.position.y = DECO_Y + decoH / 2;
    const cap = new THREE.Mesh(rbox(2.0, 0.09, 0.7, 0.04), navyMat);
    cap.position.y = DECO_Y + decoH + 0.045;
    const capTrim = new THREE.Mesh(rbox(2.02, 0.04, 0.72, 0.02), trimMat);
    capTrim.position.y = DECO_Y + decoH + 0.11;
    this.group.add(decoGlow, decoWater, decoGlass, cap, capTrim);

    addContactShadow(this.group, 2.4, 1.1);
    this.addDecorations();
    this.addBubbles();
    this.addCaustics();
    this.addFloaties();
    this.addAmbientFish();
    scene.add(this.group);

    const cx = slot.x, cz = slot.z;
    const hw = slot.rotY === 0 ? 1.0 : 0.4, hd = slot.rotY === 0 ? 0.4 : 1.0;
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });

    this.fishMeshes = []; // { mesh, tail, species, school, target, speed, phase }
    this.schoolAnchors = {};
    this.time = Math.random() * 10;
  }

  addDecorations() {
    const r = seededRand(this.slotIndex + 7);
    const floorY = MAIN_Y + 0.1;
    this.swayers = [];

    // A reef garden of distinct coral pieces spread across the tank floor.
    const builders = [
      (c) => buildStaghorn(c, r),
      (c) => buildBrain(c),
      (c) => buildFan(c, r),
      (c) => buildTube(c, r),
      (c) => buildAnemone(c, r, this.swayers),
      (c) => buildBubble(c, r),
      (c) => buildMushroom(c, r),
      (c) => buildPillar(c, r),
    ];
    const n = 3 + Math.floor(r() * 2);
    const used = [];
    for (let i = 0; i < n; i++) {
      // avoid repeating the same coral type twice in a row
      let bi; do { bi = Math.floor(r() * builders.length); } while (used.length && used[used.length - 1] === bi && r() < 0.7);
      used.push(bi);
      const color = CORAL_PALETTE[Math.floor(r() * CORAL_PALETTE.length)];
      const piece = builders[bi](color);
      piece.scale.setScalar(0.8 + r() * 0.6);
      const x = -0.74 + (i + 0.2 + r() * 0.5) * (1.48 / n);
      piece.position.set(x, floorY, (r() - 0.5) * 0.34);
      this.group.add(piece);
    }

    // ground creatures — a clam, starfish, or urchin or two
    const creatures = [(c) => buildClam(c), (c) => buildStarfish(c), (c) => buildUrchin(c)];
    const cn = Math.floor(r() * 2.4);
    for (let i = 0; i < cn; i++) {
      const color = CORAL_PALETTE[Math.floor(r() * CORAL_PALETTE.length)];
      const cr = creatures[Math.floor(r() * creatures.length)](color);
      cr.scale.setScalar(0.8 + r() * 0.5);
      cr.position.set(-0.7 + r() * 1.4, floorY, (r() - 0.5) * 0.4);
      cr.rotation.y = r() * Math.PI * 2;
      this.group.add(cr);
    }

    // a rock or two as a base
    for (let p = 0; p < 2 + Math.floor(r() * 2); p++) {
      const peb = new THREE.Mesh(new THREE.SphereGeometry(0.03 + r() * 0.035, 6, 5),
        mat(p % 2 ? 0x8d99ae : 0xadb5bd));
      peb.position.set(-0.7 + r() * 1.4, floorY + 0.01, (r() - 0.5) * 0.38);
      peb.scale.y = 0.55;
      this.group.add(peb);
    }

    // seaweed strands for greenery
    const nWeed = 2 + Math.floor(r() * 3);
    for (let w = 0; w < nWeed; w++) {
      const x = -0.75 + r() * 1.5, z = (r() - 0.5) * 0.36;
      const h = 0.3 + r() * 0.4;
      const weed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 5), coralMat(0x52b788, 0.12));
      weed.position.set(x, floorY + h / 2, z);
      weed.rotation.z = (r() - 0.5) * 0.3;
      this.group.add(weed);
    }

    // small coral + plants in the upper display tank too
    for (let w = 0; w < 2; w++) {
      const small = buildStaghorn(CORAL_PALETTE[Math.floor(r() * CORAL_PALETTE.length)], r);
      small.scale.setScalar(0.5 + r() * 0.2);
      small.position.set(-0.6 + r() * 1.2, DECO_Y + 0.04, (r() - 0.5) * 0.28);
      this.group.add(small);
      const h = 0.16 + r() * 0.16;
      const weed = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.016, h, 5), coralMat(0x74c69d, 0.12));
      weed.position.set(-0.75 + r() * 1.5, DECO_Y + 0.04 + h / 2, (r() - 0.5) * 0.3);
      this.group.add(weed);
    }
  }

  addBubbles() {
    this.bubbles = [];
    const bubMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.55 });
    const r = seededRand(this.slotIndex + 31);
    const bx = -0.6 + r() * 1.2, bz = (r() - 0.5) * 0.3;
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + r() * 0.012, 5, 4), bubMat);
      b.position.set(bx, MAIN_Y + 0.15 + r() * (MAIN_H - 0.3), bz);
      b.userData.speed = 0.12 + r() * 0.1;
      b.userData.wob = r() * 6;
      this.group.add(b);
      this.bubbles.push(b);
    }
  }

  // moving light caustics rippling across the substrate
  addCaustics() {
    this.causticTex = makeCausticTexture();
    const mat0 = new THREE.MeshBasicMaterial({
      map: this.causticTex, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.58), mat0);
    c.rotation.x = -Math.PI / 2;
    c.position.set(0, MAIN_Y + 0.14, 0);
    this.group.add(c);
  }

  // slow drifting motes for underwater depth
  addFloaties() {
    this.floaties = [];
    const fm = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.22 });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 5, 4), fm);
      s.position.set((Math.random() - 0.5) * 1.6, MAIN_Y + 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
      s.userData.vx = (Math.random() - 0.5) * 0.012;
      s.userData.vy = (Math.random() - 0.5) * 0.008;
      this.group.add(s);
      this.floaties.push(s);
    }
  }

  addAmbientFish() {
    this.ambientFish = [];
    const r = seededRand(this.slotIndex + 77);
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const species = FISH[Math.floor(r() * FISH.length)];
      const { group, tail } = buildFishMesh(species, 0.55);
      const target = () => new THREE.Vector3(
        (r() - 0.5) * 1.5, DECO_Y + 0.12 + r() * 0.28, (r() - 0.5) * 0.3);
      group.position.copy(target());
      this.ambientFish.push({ mesh: group, tail, target: target(), speed: 0.1 + r() * 0.12, phase: r() * 6, newTarget: target });
      this.group.add(group);
    }
  }

  syncFish(fishList) {
    while (this.fishMeshes.length > fishList.length) {
      const f = this.fishMeshes.pop();
      this.group.remove(f.mesh);
    }
    while (this.fishMeshes.length < fishList.length) {
      const sid = fishList[this.fishMeshes.length];
      const species = item(sid);
      const { group, tail } = buildFishMesh(species);
      group.position.copy(this.randomSwimPoint());
      if (species.school) this.ensureAnchor(sid);
      this.fishMeshes.push({
        mesh: group, tail, species: sid, school: !!species.school,
        target: species.school ? this.schoolTargetFor(sid) : this.randomSwimPoint(),
        speed: species.school ? 0.26 + Math.random() * 0.06 : 0.16 + Math.random() * 0.18,
        phase: Math.random() * 6,
      });
      this.group.add(group);
    }
  }

  randomSwimPoint() {
    return new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      MAIN_Y + 0.22 + Math.random() * (MAIN_H - 0.42),
      (Math.random() - 0.5) * 0.34
    );
  }

  // A wandering anchor per schooling species keeps the shoal moving together.
  ensureAnchor(sid) {
    if (!this.schoolAnchors[sid]) {
      this.schoolAnchors[sid] = { pos: this.randomSwimPoint(), target: this.randomSwimPoint() };
    }
  }
  schoolTargetFor(sid) {
    this.ensureAnchor(sid);
    return this.schoolAnchors[sid].pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.18));
  }

  setCare(care) {
    const t = Math.max(0, Math.min(1, care / 100));
    // clean blue -> murky green; backlight dims as the tank fouls
    this.waterMat.color.setHex(0x4fb4e0).lerp(new THREE.Color(0x5a7f3d), 1 - t);
    this.waterMat.opacity = 0.24 + (1 - t) * 0.45;
    this.glowMat.color.setHex(0x3ec3f7).lerp(new THREE.Color(0x4a5a35), 1 - t);
  }

  update(dt) {
    this.time += dt;
    // drift each shoal's anchor around the tank
    for (const sid in this.schoolAnchors) {
      const a = this.schoolAnchors[sid];
      const d = a.target.clone().sub(a.pos);
      if (d.length() < 0.12) a.target = this.randomSwimPoint();
      else a.pos.addScaledVector(d.normalize(), 0.18 * dt);
    }
    for (const f of this.fishMeshes) {
      const d = f.target.clone().sub(f.mesh.position);
      if (d.length() < 0.08) { f.target = f.school ? this.schoolTargetFor(f.species) : this.randomSwimPoint(); continue; }
      d.normalize();
      f.mesh.position.addScaledVector(d, f.speed * dt);
      const yaw = Math.atan2(-d.z, d.x);
      f.mesh.rotation.y += (yaw - f.mesh.rotation.y) * Math.min(1, dt * 4);
      if (f.tail) f.tail.rotation.y = Math.sin(this.time * 9 + f.phase) * 0.5;
      else f.mesh.rotation.z = Math.sin(this.time * 5 + f.phase) * 0.07;
    }
    for (const f of this.ambientFish) {
      const d = f.target.clone().sub(f.mesh.position);
      if (d.length() < 0.06) { f.target = f.newTarget(); continue; }
      d.normalize();
      f.mesh.position.addScaledVector(d, f.speed * dt);
      const yaw = Math.atan2(-d.z, d.x);
      f.mesh.rotation.y += (yaw - f.mesh.rotation.y) * Math.min(1, dt * 4);
      if (f.tail) f.tail.rotation.y = Math.sin(this.time * 8 + f.phase) * 0.5;
      else f.mesh.rotation.z = Math.sin(this.time * 5 + f.phase) * 0.07;
    }
    for (const b of this.bubbles) {
      b.position.y += b.userData.speed * dt;
      b.position.x += Math.sin(this.time * 3 + b.userData.wob) * 0.01 * dt * 60;
      if (b.position.y > MAIN_Y + MAIN_H - 0.12) b.position.y = MAIN_Y + 0.15;
    }
    if (this.swayers) {
      for (const s of this.swayers) {
        s.mesh.rotation.z = s.baseZ + Math.sin(this.time * 2 + s.phase) * s.amp;
        s.mesh.rotation.x = s.baseX + Math.cos(this.time * 1.7 + s.phase) * s.amp * 0.7;
      }
    }
    if (this.causticTex) {
      this.causticTex.offset.x = this.time * 0.02;
      this.causticTex.offset.y = Math.sin(this.time * 0.3) * 0.1;
    }
    if (this.surfaceMat) this.surfaceMat.opacity = 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(this.time * 1.3));
    if (this.floaties) {
      for (const f of this.floaties) {
        f.position.x += f.userData.vx * dt;
        f.position.y += f.userData.vy * dt;
        if (f.position.x < -0.85) f.position.x = 0.85; else if (f.position.x > 0.85) f.position.x = -0.85;
        if (f.position.y < MAIN_Y + 0.15) f.position.y = MAIN_Y + MAIN_H - 0.15;
        else if (f.position.y > MAIN_Y + MAIN_H - 0.15) f.position.y = MAIN_Y + 0.15;
      }
    }
  }
}

/* ---------------- Shelf unit ---------------- */

// Printed retail label for a product (used on box/bottle fronts).
const prodLabelCache = new Map();
function productLabel(prod) {
  if (prodLabelCache.has(prod.id)) return prodLabelCache.get(prod.id);
  const words = prod.name.toUpperCase().split(" ");
  const tex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#f7f3ea"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cssOf(prod.color); ctx.fillRect(0, 0, w, h * 0.34);
    ctx.fillStyle = darkenCss(prod.color, 0.25); ctx.fillRect(0, h * 0.32, w, h * 0.03);
    // brand tab
    ctx.fillStyle = "#1d3557"; ctx.fillRect(w * 0.08, h * 0.06, w * 0.84, h * 0.06);
    // product art swatch
    ctx.fillStyle = cssOf(prod.color); ctx.strokeStyle = darkenCss(prod.color, 0.3);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.55, w * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(w * 0.18)}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(prod.kind === "fish" ? "🐟" : "🐠", w * 0.5, h * 0.55);
    // name
    ctx.fillStyle = "#22303f"; ctx.font = `bold ${Math.round(w * 0.13)}px sans-serif`;
    words.forEach((word, i) => ctx.fillText(word, w * 0.5, h * (0.82 + i * 0.12) - (words.length - 1) * h * 0.06));
  }, 96, 128);
  prodLabelCache.set(prod.id, tex);
  return tex;
}

function productMesh(prod) {
  const g = new THREE.Group();
  const body = mat(prod.color);
  const shape = prod.shape;

  if (shape === "cyl") {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 12), body);
    can.position.y = 0.13;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.04, 12), mat(0x3a4a5a));
    lid.position.y = 0.27;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.12, 12), mat(TRIM));
    band.position.y = 0.12;
    g.add(can, lid, band);
  } else if (shape === "bottle") {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.26, 12), body);
    b.position.y = 0.13;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.07, 10), body);
    neck.position.y = 0.29;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), mat(0x2b2d42));
    cap.position.y = 0.34;
    const lbl = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.13, 12), mat(TRIM));
    lbl.position.y = 0.12;
    g.add(b, neck, cap, lbl);
  } else if (shape === "tube") {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), body);
    t.position.y = 0.18;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 10), mat(0x2b2d42));
    cap.position.y = 0.35;
    g.add(t, cap);
  } else if (shape === "bag") {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), body);
    bag.scale.set(1, 1.3, 0.7);
    bag.position.y = 0.14;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.14), mat(TRIM));
    stripe.position.y = 0.14;
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.04), mat(0x495057));
    clip.position.y = 0.29;
    g.add(bag, stripe, clip);
  } else if (shape === "bar") {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.1), body);
    bar.position.y = 0.18; bar.rotation.z = 0.02;
    const endA = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.12), mat(0x2b2d42));
    endA.position.set(-0.2, 0.18, 0);
    const endB = endA.clone(); endB.position.x = 0.2;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), mat(0x495057));
    stand.position.y = 0.09;
    g.add(bar, endA, endB, stand);
  } else if (shape === "castle") {
    const stone = mat(prod.color);
    const keep = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.18), stone);
    keep.position.y = 0.11; g.add(keep);
    for (const sx of [-0.11, 0.11]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 8), stone);
      turret.position.set(sx, 0.15, 0); g.add(turret);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 8), mat(0xc1121f));
      roof.position.set(sx, 0.34, 0); g.add(roof);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.02), mat(0x2b2118));
    door.position.set(0, 0.06, 0.095); g.add(door);
  } else if (shape === "wood") {
    const r = seededRand(prod.id.length * 17 + 3);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), body);
    trunk.position.y = 0.16; trunk.rotation.z = 0.3;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.035, 0.13 + r() * 0.1, 5), body);
      branch.position.set((r() - 0.5) * 0.12, 0.18 + r() * 0.12, (r() - 0.5) * 0.08);
      branch.rotation.z = (r() - 0.5) * 1.6;
      branch.rotation.x = (r() - 0.5) * 1.0;
      g.add(branch);
    }
  } else { // box with printed front label
    const front = new THREE.MeshLambertMaterial({ map: productLabel(prod) });
    const side = mat(prod.color);
    const top = mat(lightenColor(prod.color));
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.28, 0.16),
      [side, side, top, side, front, side]
    );
    box.position.y = 0.14;
    g.add(box);
  }
  return g;
}

// lighten a colour int (for box tops)
function lightenColor(c) {
  const [r, g, b] = rgbOf(c);
  return (Math.min(255, r + 40) << 16) | (Math.min(255, g + 40) << 8) | Math.min(255, b + 40);
}

export class ShelfUnit {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = SHELF_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotY;

    // warm white retail shelving with a teal header
    const frameMat = mat(0xede4d3, { roughness: 0.75 });
    const back = new THREE.Mesh(rbox(1.9, 2.0, 0.06, 0.02), mat(0xe3d9c6, { roughness: 0.85 }));
    back.position.set(0, 1.0, -0.22);
    back.castShadow = true;
    this.group.add(back);
    for (const sx of [-0.94, 0.94]) {
      const side = new THREE.Mesh(rbox(0.06, 2.0, 0.5, 0.025), frameMat);
      side.position.set(sx, 1.0, 0);
      this.group.add(side);
    }
    for (let i = 0; i < SHELF_ROWS + 1; i++) {
      const board = new THREE.Mesh(rbox(1.9, 0.05, 0.5, 0.022), frameMat);
      board.position.y = 0.25 + i * 0.58;
      this.group.add(board);
    }
    const headerBand = new THREE.Mesh(rbox(1.96, 0.18, 0.52, 0.04), mat(0x2a9d8f, { roughness: 0.6 }));
    headerBand.position.y = 2.12;
    this.group.add(headerBand);
    addContactShadow(this.group, 2.2, 0.8);

    // Invisible interaction volume covering the shelf
    this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 2.2, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hit.position.y = 1.1;
    this.hit.userData.interact = { type: "shelf", unit: this };
    this.group.add(this.hit);

    scene.add(this.group);

    const cx = slot.x, cz = slot.z;
    const horiz = Math.abs(Math.cos(slot.rotY)) > 0.5; // faces north/south
    const hw = horiz ? 0.98 : 0.3, hd = horiz ? 0.3 : 0.98;
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });

    this.stockMeshes = [];
  }

  // rows: [{ product, count }] — packed 4 wide x 2 deep so full rows look full
  syncStock(rows) {
    for (const m of this.stockMeshes) this.group.remove(m);
    this.stockMeshes = [];
    const r = seededRand(this.slotIndex + 51);
    rows.forEach((row, ri) => {
      if (!row.product || row.count <= 0) return;
      const prod = item(row.product);
      const shown = Math.min(row.count, ROW_CAP);
      for (let i = 0; i < shown; i++) {
        const piece = productMesh(prod);
        const col = i % 4, depth = Math.floor(i / 4);
        piece.position.set(-0.66 + col * 0.44, 0.275 + ri * 0.58, 0.12 - depth * 0.24);
        piece.rotation.y = (r() - 0.5) * 0.35;
        this.group.add(piece);
        this.stockMeshes.push(piece);
      }
    });
  }
}

/* ---------------- Delivery boxes ---------------- */

const labelCache = new Map();
function boxLabelTexture(itemId) {
  if (labelCache.has(itemId)) return labelCache.get(itemId);
  const it = item(itemId);
  const tex = canvasTexture((ctx) => {
    ctx.fillStyle = "#c89a62"; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#" + it.color.toString(16).padStart(6, "0");
    ctx.fillRect(0, 44, 256, 40);
    ctx.fillStyle = "#3b2a18"; ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(it.name.toUpperCase(), 128, 32);
    ctx.fillStyle = "#fff";
    ctx.fillText(it.kind === "fish" ? "LIVE FISH" : "SUPPLIES", 128, 74);
  }, 256, 128);
  labelCache.set(itemId, tex);
  return tex;
}

export function createBoxMesh(itemId) {
  const side = new THREE.MeshLambertMaterial({ map: boxLabelTexture(itemId) });
  const plain = mat(0xc89a62);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.42, 0.56),
    [side, side, plain, plain, side, side]
  );
  mesh.castShadow = true;
  return mesh;
}

/* ---------------- Customer mesh ---------------- */

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRT = [0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x9d4edd, 0x118ab2, 0xef476f];
const HAIR = [0x2b2d42, 0x6f4518, 0xbf9b30, 0x778da9, 0x431407];

const PANTS = [0x33415c, 0x2b2d42, 0x4a4e69, 0x5a3e2b, 0x355070];

export function createCustomerMesh(opts = {}) {
  const g = new THREE.Group();
  const shirt = opts.uniform != null ? opts.uniform : SHIRT[(Math.random() * SHIRT.length) | 0];
  const skin = SKIN[(Math.random() * SKIN.length) | 0];
  const pants = opts.uniform != null ? 0x2b2d42 : PANTS[(Math.random() * PANTS.length) | 0];
  const skinMat = mat(skin);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.46, 4, 8), mat(shirt));
  torso.position.y = 0.98; torso.castShadow = true;
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.14, 8), mat(pants));
  hips.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), skinMat);
  head.position.y = 1.46;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.142, 12, 10, 0, Math.PI * 2, 0, 1.15),
    mat(HAIR[(Math.random() * HAIR.length) | 0]));
  hair.position.y = 1.48;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), skinMat);
  nose.position.set(0, 1.44, 0.13);

  // limbs pivot from the top so they can swing while walking
  const limb = (w, h, m, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(w, h, 3, 6), m);
    seg.position.y = -h / 2 - w;
    seg.castShadow = true;
    pivot.add(seg);
    return pivot;
  };
  const armL = limb(0.055, 0.34, mat(shirt), -0.24, 1.18);
  const armR = limb(0.055, 0.34, mat(shirt), 0.24, 1.18);
  const legL = limb(0.07, 0.4, mat(pants), -0.09, 0.66);
  const legR = limb(0.07, 0.4, mat(pants), 0.09, 0.66);

  // shopping basket, shown once they're carrying something
  const basket = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.2),
    mat(Math.random() < 0.5 ? 0xc1121f : 0x2a6f97));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.03), mat(0x343a40));
  handle.position.y = 0.13;
  basket.add(tub, handle);
  basket.position.set(0.34, 0.74, 0);
  basket.visible = false;

  g.add(torso, hips, head, hair, nose, armL, armR, legL, legR, basket);
  if (opts.uniform != null) { // staff get a white apron
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.06), mat(0xf2f1ea));
    apron.position.set(0, 0.92, 0.18);
    g.add(apron);
  }
  g.scale.setScalar(opts.uniform != null ? 1.0 : 0.92 + Math.random() * 0.18);
  g.userData.basket = basket;
  g.userData.limbs = { armL, armR, legL, legR };
  return g;
}

/* ---------------- Checkout (physical register) ---------------- */

// A bagged fish: a knotted water bag with the fish sprite floating inside.
function buildFishBag(species) {
  const g = new THREE.Group();
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xcfeefb, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0, envMapIntensity: 1.3 });
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bagMat);
  bag.scale.set(0.85, 1.08, 0.85); bag.position.y = 0.12;
  const water = new THREE.Mesh(new THREE.SphereGeometry(0.092, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0x6fd0f0, transparent: true, opacity: 0.45 }));
  water.scale.set(0.85, 0.78, 0.85); water.position.y = 0.1;
  const tex = fishTexture(species);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1 * tex.userData.aspect), spriteMat(tex));
  f.position.set(0, 0.1, 0.02);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshLambertMaterial({ color: 0xeaf6ff }));
  knot.position.y = 0.225;
  g.add(bag, water, f, knot);
  g.castShadow = true;
  return g;
}

export class Checkout {
  constructor(game) {
    this.game = game;
    this.items = [];      // refs to the customer's cart entries, each with _mesh/_target
    this.customer = null;

    // little register screen showing the running total
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    this._ctx = c.getContext("2d");
    this._tex = new THREE.CanvasTexture(c);
    this._tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshBasicMaterial({ map: this._tex }));
    screen.position.set(COUNTER.x - COUNTER.w / 2 + 0.45, COUNTER.h + 0.36, COUNTER.z + 0.2);
    game.scene.add(screen);

    // generous invisible hitbox over the register for "charge"
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.7),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(COUNTER.x - COUNTER.w / 2 + 0.45, COUNTER.h + 0.28, COUNTER.z + 0.12);
    hit.userData.interact = { type: "register", checkout: this };
    game.scene.add(hit);
    game.interactables.push(hit);

    // a paper grocery bag on the bagging side; scanned items hop into it
    const bag = new THREE.Group();
    const sack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.26), mat(0xcaa472));
    sack.position.y = 0.17;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.05, 0.29), mat(0xb8915e));
    rim.position.y = 0.345;
    bag.add(sack, rim);
    bag.position.set(COUNTER.x + COUNTER.w / 2 - 0.45, COUNTER.h + 0.04, COUNTER.z + 0.3);
    bag.castShadow = true;
    game.scene.add(bag);
    this.bagPos = bag.position.clone();

    this._draw();
  }

  present(customer) {
    this.clear();
    this.customer = customer;
    const cart = customer.cart;
    const n = cart.length;
    cart.forEach((entry, i) => {
      entry.scanned = false;
      const it = item(entry.id);
      const mesh = it.kind === "fish" ? buildFishBag(it) : (() => { const m = productMesh(it); m.scale.setScalar(1.15); return m; })();
      const slot = this._incoming(i, n);
      mesh.position.set(slot.x, COUNTER.h + 0.05, slot.z);
      mesh.rotation.y = (i % 2 ? 0.3 : -0.3);
      mesh.userData.interact = { type: "scanItem", checkout: this, entry };
      entry._mesh = mesh; entry._to = null; entry._t = 0;
      this.game.scene.add(mesh);
      this.game.interactables.push(mesh);
      this.items.push(entry);
    });
    this._draw();
  }

  _incoming(i, n) {
    const spread = Math.min(1.9, Math.max(0.4, (n - 1) * 0.42));
    const x = n <= 1 ? COUNTER.x : COUNTER.x - spread / 2 + spread * i / (n - 1);
    return { x, z: COUNTER.z - 0.26 }; // customer side of the belt
  }

  scan(entry) {
    if (!entry || entry.scanned) return;
    entry.scanned = true;
    this.game.sound.scan();
    // arc the item into the bag
    entry._from = entry._mesh.position.clone();
    entry._to = this.bagPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.06, (Math.random() - 0.5) * 0.06));
    entry._t = 0;
    const idx = this.game.interactables.indexOf(entry._mesh);
    if (idx >= 0) this.game.interactables.splice(idx, 1); // can't rescan
    this._draw();
  }

  allScanned() { return this.items.length > 0 && this.items.every((e) => e.scanned); }
  total() { return this.items.reduce((s, e) => s + e.price, 0); }
  scannedSum() { return this.items.filter((e) => e.scanned).reduce((s, e) => s + e.price, 0); }
  scannedCount() { return this.items.filter((e) => e.scanned).length; }

  charge() {
    if (!this.customer || !this.allScanned()) return false;
    const c = this.customer;
    this.clear();
    this.game.customers.takePayment(c);
    return true;
  }

  clear() {
    for (const e of this.items) {
      if (e._mesh) {
        this.game.scene.remove(e._mesh);
        const i = this.game.interactables.indexOf(e._mesh);
        if (i >= 0) this.game.interactables.splice(i, 1);
      }
      e._mesh = null; e._to = null;
    }
    this.items = [];
    this.customer = null;
    this._draw();
  }

  update(dt) {
    for (const e of this.items) {
      if (e._mesh && e._to && e._mesh.visible) {
        e._t = Math.min(1, e._t + dt * 1.7);
        const t = e._t;
        e._mesh.position.lerpVectors(e._from, e._to, t);
        e._mesh.position.y += Math.sin(Math.PI * t) * 0.2; // parabolic hop
        e._mesh.rotation.y += dt * 5;
        if (t >= 1) e._mesh.visible = false; // landed in the bag
      }
    }
  }

  _draw() {
    const ctx = this._ctx;
    ctx.fillStyle = "#06140f"; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#0a3a2a"; ctx.fillRect(8, 8, 240, 112);
    ctx.fillStyle = "#9effc8"; ctx.textAlign = "left";
    ctx.font = "bold 22px monospace";
    ctx.fillText("REGISTER", 20, 34);
    ctx.font = "bold 16px monospace";
    ctx.fillText(this.items.length ? `${this.scannedCount()}/${this.items.length} scanned` : "waiting…", 20, 60);
    ctx.textAlign = "right";
    ctx.font = "bold 42px monospace";
    ctx.fillStyle = this.allScanned() ? "#ffe066" : "#9effc8";
    ctx.fillText("$" + this.scannedSum(), 238, 104);
    this._tex.needsUpdate = true;
  }
}
