// Builds the 3D store: room, furniture units (tanks/shelves), delivery boxes.
import * as THREE from "three";
import { RoundedBoxGeometry } from "../lib/jsm/RoundedBoxGeometry.js";
import { GLTFLoader } from "../lib/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "../lib/jsm/utils/SkeletonUtils.js";
import {
  STORE, TANK_SLOTS, SHELF_SLOTS, COUNTER, PALLET,
  SHELF_ROWS, ROW_CAP, item, FISH, FRAGRACK_SLOTS, TANK_COLS, TANK_ROW_Y, coralValue,
} from "./data.js";

// PBR material so surfaces pick up the room environment (reflections, softer
// shading) instead of looking flat. Small decor/coral keep cheaper materials.
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });
let COUNTER_GLTF = null; // optional checkout-counter model (replaces the procedural one)
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

// Continuous built-in cabinetry that frames the grid of wall tanks.
function buildTankWall(scene, colliders) {
  const x = -9.0;
  const navy = mat(NAVY, { roughness: 0.55 });
  const trimMat = mat(TRIM, { roughness: 0.6 });
  const frameMat = mat(0x14161b, { roughness: 0.5, metalness: 0.4 });
  const zMin = -6.5, zMax = 6.5, zLen = zMax - zMin;
  const baseY = TANK_ROW_Y[0], topY = TANK_ROW_Y[1], tankH = 0.82;

  // base cabinet under the bottom row + toe kick
  const base = new THREE.Mesh(rbox(0.62, baseY, zLen, 0.04), navy);
  base.position.set(x, baseY / 2, 0); base.castShadow = true; scene.add(base);
  const kick = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, zLen), mat(0x14253c));
  kick.position.set(x, 0.05, 0); scene.add(kick);
  const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, zLen + 0.04), trimMat);
  baseTrim.position.set(x, baseY - 0.02, 0); scene.add(baseTrim);

  // back panel against the wall
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, topY + tankH + 0.4, zLen + 0.1), navy);
  back.position.set(x - 0.34, (topY + tankH + 0.4) / 2, 0); scene.add(back);

  // mid rail between the two rows
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.64, baseY + tankH + 0.06 - (baseY + tankH), zLen), navy);
  const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, zLen), navy);
  midRail.position.set(x, baseY + tankH + 0.06, 0); scene.add(midRail);
  void mid;

  // vertical dividers between/around columns
  const gaps = [zMin];
  for (let i = 0; i < TANK_COLS.length - 1; i++) gaps.push((TANK_COLS[i] + TANK_COLS[i + 1]) / 2);
  gaps.push(zMax);
  for (const gz of gaps) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.66, topY + tankH - baseY, 0.14), frameMat);
    post.position.set(x, baseY + (topY + tankH - baseY) / 2, gz); scene.add(post);
  }

  // lit top valance
  const valance = new THREE.Mesh(rbox(0.72, 0.34, zLen + 0.06, 0.04), navy);
  valance.position.set(x, topY + tankH + 0.27, 0); scene.add(valance);
  const valTrim = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, zLen + 0.08), trimMat);
  valTrim.position.set(x, topY + tankH + 0.12, 0); scene.add(valTrim);
  const valLED = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, zLen - 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf6ff).multiplyScalar(1.4) }));
  valLED.position.set(x + 0.28, topY + tankH + 0.1, 0); scene.add(valLED);

  colliders.push({ minX: -10, maxX: -8.45, minZ: zMin - 0.2, maxZ: zMax + 0.2 });
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
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3c4).multiplyScalar(1.6) }));
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
  const fixMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(1.3) });
  for (const x of [-5, 5]) for (const z of [-3.5, 1.5]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.55), fixMat);
    f.position.set(x, wallH - 0.04, z);
    scene.add(f);
  }
  // modern rectangular ring light over the central aisle (like the reference)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff8ec).multiplyScalar(1.6) });
  const ringFrameMat = mat(0xced4da, { roughness: 0.5, metalness: 0.3 });
  const ring = new THREE.Group();
  const rw = 3.6, rd = 1.5, tk = 0.16;
  for (const [bw, bd, bx, bz] of [[rw, tk, 0, -rd / 2], [rw, tk, 0, rd / 2], [tk, rd, -rw / 2, 0], [tk, rd, rw / 2, 0]]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(bw + tk, 0.1, bd), ringFrameMat);
    frame.position.set(bx, wallH - 0.02, bz);
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, bd * 0.55), ringMat);
    lightBar.position.set(bx, wallH - 0.06, bz);
    ring.add(frame, lightBar);
  }
  ring.position.set(0, 0, -1.5);
  scene.add(ring);

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

  // Checkout counter — use the loaded model if present, else the procedural one.
  // (The functional register screen + bag are added separately by the Checkout class.)
  if (COUNTER_GLTF) {
    const c = COUNTER_GLTF;
    c.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        // The raw Meshy export ships geometry only; without normals a lit
        // material renders pure black, so synthesize them when missing.
        if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        o.material = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.8 });
      }
    });
    c.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(c);
    const sz = new THREE.Vector3(); box.getSize(sz);
    c.scale.setScalar(COUNTER.h / sz.y); // match the counter working height
    c.rotation.y = Math.PI;               // face the player side (+z)
    c.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(c);
    c.position.set(COUNTER.x, -box.min.y, COUNTER.z);
    scene.add(c);
    addContactShadow(c, COUNTER.w + 0.6, COUNTER.d + 0.8);
  } else {
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
  }
  colliders.push({
    minX: COUNTER.x - COUNTER.w / 2, maxX: COUNTER.x + COUNTER.w / 2,
    minZ: COUNTER.z - COUNTER.d / 2, maxZ: COUNTER.z + COUNTER.d / 2,
  });

  // Delivery pallet
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.4), mat(0xb08954));
  pallet.position.set(PALLET.x, 0.07, PALLET.z);
  pallet.receiveShadow = true;
  scene.add(pallet);

  buildTankWall(scene, colliders);
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

// per-shape body proportions + fin style so each species reads distinctly
const FISH_SHAPE = {
  normal:   { lenK: 1.0,  bhK: 1.0,  nose: 0.5,  fin: "normal" },
  round:    { lenK: 0.82, bhK: 1.22, nose: 0.42, fin: "fan" },
  tall:     { lenK: 0.78, bhK: 1.0,  nose: 0.44, fin: "tall" },
  long:     { lenK: 1.32, bhK: 0.82, nose: 0.5,  fin: "small" },
  tetra:    { lenK: 1.05, bhK: 0.92, nose: 0.5,  fin: "small" },
  betta:    { lenK: 0.86, bhK: 1.0,  nose: 0.46, fin: "betta" },
  lionfish: { lenK: 0.95, bhK: 1.05, nose: 0.48, fin: "lion" },
};

function drawFish(ctx, w, h, sp) {
  const S = FISH_SHAPE[sp.shape] || FISH_SHAPE.normal;
  const cx = w * 0.46, cy = h * 0.5;
  const len = w * 0.7 * S.lenK, bh = h * (sp.bodyH || 0.42) * S.bhK;
  const noseX = cx + len * S.nose, backX = cx - len * 0.5;
  const finCol = cssOf(sp.fin, 0.9);
  const finSoft = cssOf(sp.fin, 0.55);

  // ---- fins (drawn behind the body) ----
  ctx.fillStyle = finCol;
  if (S.fin === "betta") {
    ctx.fillStyle = finSoft;
    ctx.beginPath(); // sweeping dorsal
    ctx.moveTo(backX + len * 0.1, cy - bh * 0.4);
    ctx.quadraticCurveTo(cx - len * 0.1, cy - bh * 2.0, noseX - len * 0.25, cy - bh * 0.5);
    ctx.quadraticCurveTo(cx, cy - bh * 0.8, backX + len * 0.1, cy - bh * 0.4);
    ctx.fill();
    ctx.beginPath(); // sweeping anal fin
    ctx.moveTo(backX + len * 0.12, cy + bh * 0.4);
    ctx.quadraticCurveTo(cx - len * 0.05, cy + bh * 2.1, noseX - len * 0.3, cy + bh * 0.5);
    ctx.quadraticCurveTo(cx, cy + bh * 0.9, backX + len * 0.12, cy + bh * 0.4);
    ctx.fill();
  } else if (S.fin === "tall") {
    ctx.beginPath(); // tall dorsal
    ctx.moveTo(cx - len * 0.18, cy - bh * 0.55);
    ctx.lineTo(cx + len * 0.02, cy - bh * 1.6);
    ctx.lineTo(cx + len * 0.32, cy - bh * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); // tall anal
    ctx.moveTo(cx - len * 0.12, cy + bh * 0.55);
    ctx.lineTo(cx + len * 0.04, cy + bh * 1.55);
    ctx.lineTo(cx + len * 0.3, cy + bh * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = finCol; ctx.lineWidth = h * 0.018; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx + len * 0.05, cy + bh * 0.7); ctx.lineTo(cx - len * 0.02, cy + bh * 2.0); ctx.stroke();
  } else if (S.fin === "lion") {
    ctx.strokeStyle = finCol; ctx.lineCap = "round";
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      const r2 = bh * (1.35 + (i % 2) * 0.4);
      ctx.lineWidth = h * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * bh * 0.55, cy + Math.sin(a) * bh * 0.5);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.85);
      ctx.stroke();
    }
    ctx.strokeStyle = cssOf(sp.pattern2 || 0xffffff, 0.7); ctx.lineWidth = h * 0.008;
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * bh * 0.85, cy + Math.sin(a) * bh * 0.75);
      ctx.lineTo(cx + Math.cos(a) * bh * 1.25, cy + Math.sin(a) * bh * 1.1);
      ctx.stroke();
    }
  } else if (S.fin === "fan") {
    ctx.beginPath();
    ctx.moveTo(cx - len * 0.2, cy - bh * 0.55);
    ctx.quadraticCurveTo(cx, cy - bh * 1.15, cx + len * 0.22, cy - bh * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(noseX - len * 0.28, cy + bh * 0.3, len * 0.12, bh * 0.32, -0.5, 0, Math.PI * 2); ctx.fill();
  } else if (S.fin === "small") {
    ctx.beginPath();
    ctx.moveTo(cx - bh * 0.1, cy - bh * 0.45);
    ctx.lineTo(cx + len * 0.08, cy - bh * 0.85);
    ctx.lineTo(cx + len * 0.22, cy - bh * 0.45);
    ctx.closePath(); ctx.fill();
  } else { // normal: dorsal + pelvic + pectoral
    ctx.beginPath();
    ctx.moveTo(cx - bh * 0.2, cy - bh * 0.5); ctx.lineTo(cx + len * 0.05, cy - bh * 1.05); ctx.lineTo(cx + len * 0.2, cy - bh * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy + bh * 0.45); ctx.lineTo(cx + len * 0.02, cy + bh * 0.98); ctx.lineTo(cx + len * 0.18, cy + bh * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(noseX - len * 0.24, cy + bh * 0.28, len * 0.1, bh * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
  }

  // ---- body silhouette (rounder head for round/tall bodies) ----
  const round = sp.shape === "round" || sp.shape === "tall";
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(noseX, cy - (round ? bh * 0.12 : 0));
    ctx.quadraticCurveTo(cx + len * (round ? 0.1 : 0), cy - bh, backX, cy - bh * 0.4);
    ctx.quadraticCurveTo(backX - len * 0.05, cy, backX, cy + bh * 0.4);
    ctx.quadraticCurveTo(cx + len * (round ? 0.1 : 0), cy + bh, noseX, cy + (round ? bh * 0.12 : 0));
    if (round) ctx.quadraticCurveTo(noseX + len * 0.06, cy, noseX, cy - bh * 0.12);
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
  const ex = noseX - len * 0.14, ey = cy - bh * 0.12, er = Math.max(3, bh * 0.16);
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

// Use species-shaped procedural art so every fish reads as its own species.
// (Kenney sprites reused too few silhouettes.) Sprites stay as a safety net.
const USE_SPRITES = false;
function hasSprite(sp) {
  const m = SPRITE_MAP[sp.id];
  return USE_SPRITES && !!(m && FISH_IMG[m.base]) && sp.tail !== "seahorse";
}

const fishTexCache = new Map();
export function fishTexture(sp) {
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
  // unlit: the painted texture already has its shading, so this keeps the
  // fish vivid and readable instead of desaturating under the room lighting.
  return new THREE.MeshBasicMaterial({
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
  // ~quarter of the old size so fish fit the tank and don't clip the glass when turning
  const W = (sprite ? 0.18 : seahorse ? 0.1 : 0.16) * s;
  const H = W * tex.userData.aspect;

  const pA = new THREE.Mesh(new THREE.PlaneGeometry(W, H), bodyMat);
  const pB = pA.clone(); pB.rotation.y = Math.PI / 2;
  group.add(pA, pB);

  // Procedural fish get a separate wiggling tail; sprites already include it.
  // Flowing tails (betta / fancy goldfish) are larger.
  const TAIL_SCALE = { betta: 1.7, round: 1.45, lionfish: 1.3, tall: 1.0, long: 0.9, tetra: 0.9 };
  let tail = null;
  if (!sprite && !seahorse) {
    const tmat = spriteMat(tailTexture(sp));
    tail = new THREE.Group();
    tail.position.x = -W * 0.46;
    const ts = TAIL_SCALE[sp.shape] || 1.0;
    const tW = W * 0.55 * ts, tH = H * 1.2 * ts;
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

// vivid neon reef-coral colours (like a live coral sales tank under actinics)
const CORAL_PALETTE = [
  0xff206e, 0xff5d00, 0xffd400, 0x05ffa1, 0x00e5ff,
  0x7c1fff, 0xff00a0, 0x7cff00, 0x00ffd0, 0xff3860, 0x39ff14,
];

// emissive coral material so reefs glow (and bloom) under the tank light.
// emissiveIntensity > 1 pushes the neon colours into HDR so they bloom.
function coralMat(color, emiss = 1.15) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.emissive = new THREE.Color(color);
  m.emissiveIntensity = emiss;
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

// Natural rock formation / cave centerpiece (freshwater aquascape look)
function buildRockMound(rand, scale = 1) {
  const g = new THREE.Group();
  const mats = [mat(0x6b5642, { roughness: 0.95 }), mat(0x8a7559, { roughness: 0.95 }), mat(0x55504a, { roughness: 0.95 })];
  const n = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const rr = (0.07 + rand() * 0.07) * scale;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), mats[Math.floor(rand() * 3)]);
    rock.position.set((rand() - 0.5) * 0.3 * scale, rr * 0.65 + i * 0.015, (rand() - 0.5) * 0.14);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.scale.set(1 + rand() * 0.4, 0.7 + rand() * 0.3, 1 + rand() * 0.4);
    g.add(rock);
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

const TANK_W = 3.0;    // wide dimension (local x)
const TANK_D = 0.55;   // depth (local z); front face is +z
const TANK_H = 0.82;   // interior height (local y, base at 0)
const FLOOR_Y = 0.07;  // gravel top

// A single built-in tank set into the wall grid (positioned by slot.y per row).
export class TankUnit {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = TANK_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, slot.y, slot.z);
    this.group.rotation.y = slot.rotY;
    const frontZ = TANK_D / 2;

    // glowing back panel
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x3ec3f7 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(TANK_W - 0.08, TANK_H - 0.06), this.glowMat);
    glow.position.set(0, TANK_H / 2, -TANK_D / 2 + 0.015);

    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x4fb4e0, transparent: true, opacity: 0.26, roughness: 0.1, metalness: 0 });
    this.water = new THREE.Mesh(new THREE.BoxGeometry(TANK_W - 0.06, TANK_H - 0.16, TANK_D - 0.06), this.waterMat);
    this.water.position.y = FLOOR_Y + (TANK_H - 0.16) / 2;

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xeaffff, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0, envMapIntensity: 1.5,
    });
    this.glass = new THREE.Mesh(rbox(TANK_W, TANK_H, TANK_D, 0.02), glassMat);
    this.glass.position.y = TANK_H / 2;
    this.glass.userData.interact = { type: "tank", unit: this };

    const gravel = new THREE.Mesh(new THREE.BoxGeometry(TANK_W - 0.06, 0.08, TANK_D - 0.06), mat(0xc9a86b, { roughness: 1 }));
    gravel.position.y = FLOOR_Y;

    // slim built-in black frame around the front opening
    const frameMat = mat(0x14161b, { roughness: 0.5, metalness: 0.4 });
    const fThk = 0.05;
    const frame = [];
    frame.push(new THREE.Mesh(new THREE.BoxGeometry(TANK_W, fThk, 0.06), frameMat)); frame[0].position.set(0, TANK_H, frontZ);
    frame.push(new THREE.Mesh(new THREE.BoxGeometry(TANK_W, fThk, 0.06), frameMat)); frame[1].position.set(0, 0, frontZ);
    frame.push(new THREE.Mesh(new THREE.BoxGeometry(fThk, TANK_H, 0.06), frameMat)); frame[2].position.set(-TANK_W / 2, TANK_H / 2, frontZ);
    frame.push(new THREE.Mesh(new THREE.BoxGeometry(fThk, TANK_H, 0.06), frameMat)); frame[3].position.set(TANK_W / 2, TANK_H / 2, frontZ);

    // top light strip + actinic accent
    const strip = new THREE.Mesh(new THREE.BoxGeometry(TANK_W - 0.2, 0.025, 0.45),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf4fcff).multiplyScalar(1.4) }));
    strip.position.set(0, TANK_H - 0.03, 0);
    const actinic = new THREE.Mesh(new THREE.BoxGeometry(TANK_W - 0.3, 0.02, 0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a3df0).multiplyScalar(1.25) }));
    actinic.position.set(0, TANK_H - 0.03, frontZ - 0.1);

    // shimmering surface + glass reflection streak
    this.surfaceMat = new THREE.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false });
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(TANK_W - 0.1, TANK_D - 0.06), this.surfaceMat);
    surface.rotation.x = -Math.PI / 2; surface.position.y = TANK_H - 0.1;
    const highlight = new THREE.Mesh(new THREE.PlaneGeometry(0.5, TANK_H * 1.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
    highlight.position.set(-TANK_W * 0.28, TANK_H / 2, frontZ - 0.02); highlight.rotation.z = 0.5;

    this.group.add(glow, this.water, this.glass, gravel, ...frame, strip, actinic, surface, highlight);

    this.addDecorations();
    this.addBubbles();
    this.addCaustics();
    this.addFloaties();
    scene.add(this.group);

    this.fishMeshes = [];
    this.schoolAnchors = {};
    this.time = Math.random() * 10;
  }

  addDecorations() {
    const r = seededRand(this.slotIndex + 7);
    const floorY = FLOOR_Y + 0.03;
    const HW = TANK_W / 2 - 0.25, HD = TANK_D / 2 - 0.1;
    this.swayers = [];
    const builders = [
      (c) => buildStaghorn(c, r), (c) => buildBrain(c), (c) => buildFan(c, r),
      (c) => buildTube(c, r), (c) => buildAnemone(c, r, this.swayers),
      (c) => buildBubble(c, r), (c) => buildMushroom(c, r), (c) => buildPillar(c, r),
    ];
    // a natural rock formation as the centerpiece
    const mound = buildRockMound(r, 0.9 + r() * 0.4);
    mound.position.set((r() - 0.5) * HW, floorY, -HD * 0.3);
    this.group.add(mound);

    const n = 4 + Math.floor(r() * 3);
    const used = [];
    for (let i = 0; i < n; i++) {
      let bi; do { bi = Math.floor(r() * builders.length); } while (used.length && used[used.length - 1] === bi && r() < 0.7);
      used.push(bi);
      const color = CORAL_PALETTE[Math.floor(r() * CORAL_PALETTE.length)];
      const piece = builders[bi](color);
      piece.scale.setScalar(0.75 + r() * 0.5);
      piece.position.set(-HW + (i + 0.2 + r() * 0.5) * (2 * HW / n), floorY, (r() - 0.5) * 2 * HD);
      this.group.add(piece);
    }
    const creatures = [(c) => buildClam(c), (c) => buildStarfish(c), (c) => buildUrchin(c)];
    const cn = Math.floor(r() * 2.4);
    for (let i = 0; i < cn; i++) {
      const cr = creatures[Math.floor(r() * creatures.length)](CORAL_PALETTE[Math.floor(r() * CORAL_PALETTE.length)]);
      cr.scale.setScalar(0.8 + r() * 0.5);
      cr.position.set((r() - 0.5) * 2 * HW, floorY, (r() - 0.5) * 2 * HD);
      cr.rotation.y = r() * Math.PI * 2;
      this.group.add(cr);
    }
    for (let p = 0; p < 2 + Math.floor(r() * 2); p++) {
      const peb = new THREE.Mesh(new THREE.SphereGeometry(0.03 + r() * 0.035, 6, 5), mat(p % 2 ? 0x8d99ae : 0xadb5bd));
      peb.position.set((r() - 0.5) * 2 * HW, floorY, (r() - 0.5) * 2 * HD); peb.scale.y = 0.55;
      this.group.add(peb);
    }
    const nWeed = 2 + Math.floor(r() * 3);
    for (let w = 0; w < nWeed; w++) {
      const h = 0.25 + r() * 0.35;
      const weed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 5), coralMat(0x52b788, 0.12));
      weed.position.set((r() - 0.5) * 2 * HW, floorY + h / 2, (r() - 0.5) * 2 * HD);
      weed.rotation.z = (r() - 0.5) * 0.3;
      this.group.add(weed);
    }
  }

  addBubbles() {
    this.bubbles = [];
    const bubMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.55 });
    const r = seededRand(this.slotIndex + 31);
    const bx = (r() - 0.5) * (TANK_W - 0.6), bz = (r() - 0.5) * 0.3;
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.011 + r() * 0.011, 5, 4), bubMat);
      b.position.set(bx, FLOOR_Y + 0.1 + r() * (TANK_H - 0.25), bz);
      b.userData.speed = 0.12 + r() * 0.1; b.userData.wob = r() * 6;
      this.group.add(b); this.bubbles.push(b);
    }
  }

  addCaustics() {
    this.causticTex = makeCausticTexture();
    const c = new THREE.Mesh(new THREE.PlaneGeometry(TANK_W - 0.1, TANK_D - 0.06),
      new THREE.MeshBasicMaterial({ map: this.causticTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    c.rotation.x = -Math.PI / 2; c.position.y = FLOOR_Y + 0.05;
    this.group.add(c);
  }

  addFloaties() {
    this.floaties = [];
    const fm = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.22 });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 5, 4), fm);
      s.position.set((Math.random() - 0.5) * (TANK_W - 0.3), FLOOR_Y + 0.1 + Math.random() * (TANK_H - 0.2), (Math.random() - 0.5) * 0.4);
      s.userData.vx = (Math.random() - 0.5) * 0.012; s.userData.vy = (Math.random() - 0.5) * 0.008;
      this.group.add(s); this.floaties.push(s);
    }
  }

  syncFish(fishList) {
    while (this.fishMeshes.length > fishList.length) {
      const f = this.fishMeshes.pop();
      this.group.remove(f.mesh);
    }
    while (this.fishMeshes.length < fishList.length) {
      const f = fishList[this.fishMeshes.length];
      const sid = (f && f.id) ? f.id : f; // tolerate legacy plain ids
      const species = item(sid);
      const { group, tail } = buildFishMesh(species);
      if (f && f.rare) group.scale.multiplyScalar(1.25); // rare morphs are a bit bigger
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
      (Math.random() - 0.5) * (TANK_W - 0.5),
      0.22 + Math.random() * (TANK_H - 0.42),
      (Math.random() - 0.5) * (TANK_D - 0.34) // keep clear of the front/back glass
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
      (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.08));
  }

  setCare(care) {
    const t = Math.max(0, Math.min(1, care / 100));
    // clean blue -> murky green; backlight dims as the tank fouls
    this.waterMat.color.setHex(0x4fb4e0).lerp(new THREE.Color(0x5a7f3d), 1 - t);
    this.waterMat.opacity = 0.24 + (1 - t) * 0.45;
    // HDR backlight (>1) so it blooms; dims toward green as the tank fouls
    this.glowMat.color.setHex(0x3ec3f7).lerp(new THREE.Color(0x4a5a35), 1 - t).multiplyScalar(1.2);
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
    for (const b of this.bubbles) {
      b.position.y += b.userData.speed * dt;
      b.position.x += Math.sin(this.time * 3 + b.userData.wob) * 0.01 * dt * 60;
      if (b.position.y > TANK_H - 0.1) b.position.y = FLOOR_Y + 0.1;
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
        const bx = TANK_W / 2 - 0.15;
        if (f.position.x < -bx) f.position.x = bx; else if (f.position.x > bx) f.position.x = -bx;
        if (f.position.y < FLOOR_Y + 0.1) f.position.y = TANK_H - 0.15;
        else if (f.position.y > TANK_H - 0.15) f.position.y = FLOOR_Y + 0.1;
      }
    }
  }
}

/* ---------------- Shelf unit ---------------- */

// ---- Product packaging art ----
const PROD_ICON = {
  food: "🍤", net: "🥅", gravel: "🪨", plant: "🌿", decor: "🪸", thermo: "🌡️",
  heater: "🔥", pump: "💨", cond: "💧", light: "💡", testkit: "🧪", filter: "⚙️",
  wood: "🪵", castle: "🏰", kit: "📦", bg: "🖼️", airstone: "🫧", vacuum: "🧹", medicine: "💊",
  shipwreck: "⚓", frozen: "🧊", saltmix: "🧂", powerhead: "🌀", calcium: "🧴", alk: "🧴",
  wavemaker: "🌊", salinity: "🌡️", skimmer: "🌀", uv: "🔆", reefled: "💡",
};
const prodIcon = (p) => PROD_ICON[p.id] || (p.kind === "coral" ? "🪸" : "🐠");

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Front label for boxes / pouches (portrait)
const boxLabelCache = new Map();
function productLabel(prod) {
  if (boxLabelCache.has(prod.id)) return boxLabelCache.get(prod.id);
  const tex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#f6f2e8"; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.3);
    g.addColorStop(0, lightenCss(prod.color, 0.25)); g.addColorStop(1, cssOf(prod.color));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.3);
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(w * 0.11)}px sans-serif`; ctx.textAlign = "left";
    ctx.fillText("AQUAPRO", w * 0.08, h * 0.155);
    // icon panel
    ctx.fillStyle = "#ffffff"; roundRectPath(ctx, w * 0.13, h * 0.36, w * 0.74, h * 0.34, 10); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = cssOf(prod.color); ctx.stroke();
    ctx.font = `${Math.round(w * 0.4)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(prodIcon(prod), w * 0.5, h * 0.55);
    // name
    ctx.fillStyle = "#243240"; ctx.font = `bold ${Math.round(w * 0.12)}px sans-serif`;
    prod.name.toUpperCase().split(" ").forEach((wd, i) => ctx.fillText(wd, w * 0.5, h * (0.79 + i * 0.1)));
    ctx.fillStyle = cssOf(prod.color); ctx.fillRect(0, h * 0.96, w, h * 0.04);
  }, 128, 160);
  boxLabelCache.set(prod.id, tex);
  return tex;
}

// Wraparound label for cans / bottles / tubes (lands on the cylinder side)
const wrapLabelCache = new Map();
function wrapLabel(prod) {
  if (wrapLabelCache.has(prod.id)) return wrapLabelCache.get(prod.id);
  const tex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#f6f2e8"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cssOf(prod.color); ctx.fillRect(0, 0, w, h * 0.22); ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = darkenCss(prod.color, 0.25); ctx.fillRect(0, h * 0.22, w, h * 0.02); ctx.fillRect(0, h * 0.76, w, h * 0.02);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = `bold ${Math.round(h * 0.12)}px sans-serif`;
    ctx.fillText("AQUAPRO", w * 0.5, h * 0.11);
    ctx.font = `${Math.round(h * 0.32)}px sans-serif`;
    ctx.fillText(prodIcon(prod), w * 0.5, h * 0.47);
    ctx.fillStyle = "#243240"; ctx.font = `bold ${Math.round(h * 0.11)}px sans-serif`;
    ctx.fillText(prod.name.toUpperCase(), w * 0.5, h * 0.89);
  }, 256, 128);
  wrapLabelCache.set(prod.id, tex);
  return tex;
}

function productMesh(prod) {
  const g = new THREE.Group();
  const shape = prod.shape;

  if (shape === "cyl") { // labelled can with metal caps
    const sideMat = new THREE.MeshStandardMaterial({ map: wrapLabel(prod), roughness: 0.5, metalness: 0.1 });
    const capMat = mat(0xc2c6cc, { roughness: 0.3, metalness: 0.75 });
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 22), [sideMat, capMat, capMat]);
    can.position.y = 0.14;
    const rimT = new THREE.Mesh(new THREE.CylinderGeometry(0.089, 0.089, 0.02, 22), capMat); rimT.position.y = 0.27;
    const rimB = rimT.clone(); rimB.position.y = 0.01;
    g.add(can, rimT, rimB);
  } else if (shape === "bottle") {
    const glass = mat(prod.color, { roughness: 0.2, metalness: 0.05 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.2, 18), glass); body.position.y = 0.12;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.062, 0.06, 16), glass); shoulder.position.y = 0.25;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 12), glass); neck.position.y = 0.3;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 12), mat(0x2b2d42, { roughness: 0.4 })); cap.position.y = 0.34;
    const lbl = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.072, 0.13, 18, 1, true),
      new THREE.MeshStandardMaterial({ map: wrapLabel(prod), roughness: 0.6 })); lbl.position.y = 0.11;
    g.add(body, shoulder, neck, cap, lbl);
  } else if (shape === "tube") {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 16), mat(prod.color, { roughness: 0.3, metalness: 0.2 })); t.position.y = 0.18;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 16), mat(0x2b2d42)); cap.position.y = 0.36;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.08, 16, 1, true),
      new THREE.MeshStandardMaterial({ map: wrapLabel(prod), roughness: 0.6 })); ring.position.y = 0.15;
    g.add(t, cap, ring);
  } else if (shape === "bag") { // crimped pouch with a front label
    const pouch = new THREE.Mesh(rbox(0.22, 0.26, 0.1, 0.05), mat(prod.color, { roughness: 0.9 })); pouch.position.y = 0.15;
    const crimp = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.035, 0.11), mat(0x4a5560, { roughness: 0.8 })); crimp.position.y = 0.29;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.21),
      new THREE.MeshStandardMaterial({ map: productLabel(prod), roughness: 0.85 })); label.position.set(0, 0.15, 0.052);
    g.add(pouch, crimp, label);
  } else if (shape === "bar") { // sleek LED light bar
    const housing = new THREE.Mesh(rbox(0.42, 0.06, 0.1, 0.025), mat(0x2b2d42, { roughness: 0.35, metalness: 0.5 })); housing.position.y = 0.21;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(prod.color).multiplyScalar(1.15) })); strip.position.set(0, 0.178, 0.03);
    const legA = new THREE.Mesh(rbox(0.05, 0.18, 0.09, 0.02), mat(0x495057)); legA.position.set(-0.19, 0.09, 0);
    const legB = legA.clone(); legB.position.x = 0.19;
    g.add(housing, strip, legA, legB);
  } else if (shape === "castle") {
    const stone = mat(prod.color, { roughness: 0.95 });
    const keep = new THREE.Mesh(rbox(0.22, 0.22, 0.18, 0.02), stone); keep.position.y = 0.12; g.add(keep);
    for (const sx of [-0.11, 0.11]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 10), stone); turret.position.set(sx, 0.16, 0); g.add(turret);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 10), mat(0xc1121f, { roughness: 0.6 })); roof.position.set(sx, 0.35, 0); g.add(roof);
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), mat(0x1a1410)); win.position.set(sx, 0.18, 0.058); g.add(win);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.02), mat(0x2b2118)); door.position.set(0, 0.07, 0.095); g.add(door);
  } else if (shape === "wood") {
    const r = seededRand(prod.id.length * 17 + 3);
    const woodMat = mat(prod.color, { roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.3, 7), woodMat); trunk.position.y = 0.16; trunk.rotation.z = 0.3; g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.13 + r() * 0.12, 6), woodMat);
      branch.position.set((r() - 0.5) * 0.14, 0.16 + r() * 0.14, (r() - 0.5) * 0.08);
      branch.rotation.z = (r() - 0.5) * 1.7; branch.rotation.x = (r() - 0.5) * 1.1;
      g.add(branch);
    }
  } else { // box with rounded body + clean front label
    const box = new THREE.Mesh(rbox(0.22, 0.28, 0.16, 0.022), mat(prod.color, { roughness: 0.7 })); box.position.y = 0.14;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.25),
      new THREE.MeshStandardMaterial({ map: productLabel(prod), roughness: 0.75 })); label.position.set(0, 0.14, 0.082);
    g.add(box, label);
  }
  return g;
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
    ctx.fillText(it.kind === "fish" ? "LIVE FISH" : it.kind === "coral" ? "LIVE CORAL" : "SUPPLIES", 128, 74);
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

// ---- Animated character model (Quaternius, CC0) ----
let CHAR_GLTF = null;
export function loadCharacterModel(url = "assets/models/character.glb") {
  return new Promise((res) => {
    new GLTFLoader().load(url, (g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      CHAR_GLTF = { scene: g.scene, animations: g.animations };
      res();
    }, undefined, () => res()); // tolerate failure -> procedural fallback
  });
}

// optional checkout-counter model; falls back to the procedural counter if absent
export function loadCounterModel(url = "assets/models/counter.glb") {
  return new Promise((res) => {
    new GLTFLoader().load(url, (g) => { COUNTER_GLTF = g.scene; res(); }, undefined, () => res());
  });
}

function makeBasket() {
  const basket = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.2),
    mat(Math.random() < 0.5 ? 0xc1121f : 0x2a6f97));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.03), mat(0x343a40));
  handle.position.y = 0.13;
  basket.add(tub, handle);
  basket.visible = false;
  return basket;
}

// Real rigged model with walk/idle animation (used for shoppers).
function buildModelCustomer() {
  const inner = cloneSkeleton(CHAR_GLTF.scene);
  inner.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(inner);
  let h = box.max.y - box.min.y;
  if (!(h > 0.3 && h < 5)) h = 1.32; // skinned-mesh box can misreport; fall back
  const s = 1.72 / h;
  inner.scale.setScalar(s);
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  inner.position.y = -box.min.y; // feet on the floor
  // model's native forward is +z, matching the game's facing convention
  // (group rotation.y = atan2(dx,dz) points local +z along the travel dir)

  // give each shopper a unique look: clone the shared materials, then recolor
  // by material name (Skin / Hair / Shirt / Pants / Shoes ...).
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const look = {
    skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT),
    shirt2: pick(SHIRT), pants: pick(PANTS), shoes: pick([0x2b2d42, 0x1a1a1a, 0x5a3e2b, 0x3d2b1f]),
  };
  const matClones = new Map();
  inner.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const swap = (m) => {
      let cm = matClones.get(m);
      if (!cm) {
        cm = m.clone();
        const n = (m.name || "").toLowerCase();
        if (n.includes("skin")) cm.color.setHex(look.skin);
        else if (n === "hair2") cm.color.setHex(look.hair);
        else if (n.includes("hair")) cm.color.setHex(look.hair);
        else if (n === "shirt2") cm.color.setHex(look.shirt2);
        else if (n.includes("shirt")) cm.color.setHex(look.shirt);
        else if (n.includes("pant")) cm.color.setHex(look.pants);
        else if (n.includes("shoe") || n.includes("sock")) cm.color.setHex(look.shoes);
        matClones.set(m, cm);
      }
      return cm;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  const g = new THREE.Group();
  g.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  const find = (kw) => CHAR_GLTF.animations.find((a) => a.name.toLowerCase().includes(kw));
  const walkClip = find("walk"), idleClip = find("idle") || find("standing");
  const actions = {};
  if (walkClip) actions.walk = mixer.clipAction(walkClip);
  if (idleClip) { actions.idle = mixer.clipAction(idleClip); actions.idle.play(); }

  const basket = makeBasket();
  basket.position.set(0.34, 0.74, 0.12);
  g.add(basket);
  g.scale.setScalar(0.94 + Math.random() * 0.12);
  g.userData = { basket, limbs: null, mixer, actions, model: true, anim: "idle" };
  return g;
}

export function createCustomerMesh(opts = {}) {
  // shoppers use the animated model; staff stay procedural (clearly aproned)
  if (opts.uniform == null && CHAR_GLTF) return buildModelCustomer();

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
      const mesh = it.kind === "fish" ? buildFishBag(it)
        : it.kind === "coral" ? (() => { const m = buildFragMesh(it); m.scale.setScalar(1.6); return m; })()
        : (() => { const m = productMesh(it); m.scale.setScalar(1.15); return m; })();
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

/* ---------------- Cylindrical feature aquarium (centerpiece) ---------------- */

export class FeatureTank {
  constructor(scene, colliders, x, z) {
    const R = 0.72, H = 1.95, baseH = 0.5;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    // wooden round base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.14, R + 0.2, baseH, 28), mat(0x7a4a24, { roughness: 0.7 }));
    base.position.y = baseH / 2; base.castShadow = true;
    const baseTrim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 0.06, 28), mat(0x5a3418));
    baseTrim.position.y = baseH;
    const gravel = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.1, 28), mat(0xc9a86b, { roughness: 1 }));
    gravel.position.y = baseH + 0.05;

    // water column
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x49b4e6, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.04, R - 0.04, H - 0.12, 30), this.waterMat);
    water.position.y = baseH + (H - 0.12) / 2 + 0.08;
    // backlight glow disc near the base (HDR -> blooms softly)
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.06, R - 0.06, 0.04, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fd0ff).multiplyScalar(1.15), transparent: true, opacity: 0.6 }));
    glow.position.y = baseH + 0.12;

    // glass cylinder (open-ended shell) + rims
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xeaffff, transparent: true, opacity: 0.15, roughness: 0.04, metalness: 0, envMapIntensity: 1.6 });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 40, 1, true), glassMat);
    glass.position.y = baseH + H / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.12, 40), mat(0x2b2d42, { roughness: 0.5 }));
    rim.position.y = baseH + H;
    const topGlow = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.04, R - 0.04, 0.03, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2fbff).multiplyScalar(1.5) }));
    topGlow.position.y = baseH + H - 0.05;

    this.group.add(base, baseTrim, gravel, glow, water, glass, rim, topGlow);
    this.addRockColumn(baseH, H);
    scene.add(this.group);
    colliders.push({ minX: x - R - 0.2, maxX: x + R + 0.2, minZ: z - R - 0.2, maxZ: z + R + 0.2 });

    // fish circling the rock column
    this.fish = [];
    const r = seededRand(771);
    const pool = ["clownfish", "bluetang", "angelfish", "goldfish", "tetra", "discus", "rainbow", "gourami"];
    for (let i = 0; i < 9; i++) {
      const sp = item(pool[Math.floor(r() * pool.length)]);
      const { group, tail } = buildFishMesh(sp, 0.9);
      this.group.add(group);
      this.fish.push({
        group, tail,
        radius: 0.28 + r() * 0.28,
        y: baseH + 0.3 + r() * (H - 0.7),
        speed: (0.3 + r() * 0.35) * (r() < 0.5 ? 1 : -1),
        ang: r() * Math.PI * 2, phase: r() * 6,
      });
    }
    this.time = 0;
  }

  addRockColumn(baseH, H) {
    const r = seededRand(42);
    const rockA = mat(0x6b5642, { roughness: 0.95 });
    const rockB = mat(0x8a7559, { roughness: 0.95 });
    let y = baseH + 0.12;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const rr = 0.3 * (1 - i / n * 0.62) + 0.05;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), i % 2 ? rockA : rockB);
      rock.position.set((r() - 0.5) * 0.14, y + rr * 0.5, (r() - 0.5) * 0.14);
      rock.rotation.set(r() * 3, r() * 3, r() * 3);
      rock.scale.set(1 + r() * 0.3, 0.8 + r() * 0.3, 1 + r() * 0.3);
      this.group.add(rock);
      y += rr * 0.95;
    }
    for (let i = 0; i < 3; i++) { // driftwood ledges
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.045, 0.3 + r() * 0.25, 6), mat(0x5a4632, { roughness: 1 }));
      branch.position.set((r() - 0.5) * 0.32, baseH + 0.45 + r() * (H - 0.9), (r() - 0.5) * 0.32);
      branch.rotation.z = (r() - 0.5) * 1.6; branch.rotation.y = r() * 3;
      this.group.add(branch);
    }
  }

  update(dt) {
    this.time += dt;
    for (const f of this.fish) {
      f.ang += f.speed * dt;
      const x = Math.cos(f.ang) * f.radius, z = Math.sin(f.ang) * f.radius;
      f.group.position.set(x, f.y + Math.sin(this.time + f.phase) * 0.05, z);
      const vx = -Math.sin(f.ang) * f.speed, vz = Math.cos(f.ang) * f.speed;
      f.group.rotation.y = Math.atan2(-vz, vx);
      if (f.tail) f.tail.rotation.y = Math.sin(this.time * 8 + f.phase) * 0.5;
    }
  }
}

/* ---------------- Coral frag rack (reefing rack of frag tanks) ---------------- */

// a single coral frag on a plug, by growth form
export function buildFragMesh(coral) {
  const g = new THREE.Group();
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.04, 8), mat(0x9a8c7a, { roughness: 1 }));
  plug.position.y = 0.02; g.add(plug);
  const m = coralMat(coral.color, 1.2);
  const r = seededRand(coral.id.length * 31 + (coral.color % 97));
  if (coral.form === "polyps") {
    for (let i = 0; i < 8; i++) {
      const a = r() * 6.28, rr = r() * 0.04;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.016 + r() * 0.012, 8, 6), m);
      p.position.set(Math.cos(a) * rr, 0.05 + r() * 0.02, Math.sin(a) * rr); p.scale.y = 0.6; g.add(p);
    }
  } else if (coral.form === "mush") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, 6.28, 0, Math.PI * 0.5), m);
    cap.scale.set(1.25, 0.4, 1.25); cap.position.y = 0.06; g.add(cap);
  } else if (coral.form === "brain") {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, 6.28, 0, Math.PI * 0.55), m);
    dome.scale.set(1.1, 0.55, 1.1); dome.position.y = 0.05; g.add(dome);
  } else if (coral.form === "plate") {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.04, 0.025, 12), m);
    plate.position.y = 0.06; plate.rotation.z = 0.15; g.add(plate);
  } else { // branch
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28;
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08 + r() * 0.06, 5), m);
      b.position.set(Math.cos(a) * 0.02, 0.08, Math.sin(a) * 0.02);
      b.rotation.z = (r() - 0.5) * 0.9; b.rotation.x = (r() - 0.5) * 0.9; g.add(b);
    }
  }
  return g;
}

// small printed price tag for a frag
const fragTagCache = new Map();
function fragTagTexture(price, color) {
  const key = price + ":" + color;
  if (fragTagCache.has(key)) return fragTagCache.get(key);
  const tex = canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssOf(color); roundRectPath(ctx, 2, 2, w - 4, h - 4, 8); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.font = `bold ${Math.round(h * 0.6)}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("$" + price, w / 2, h * 0.55);
  }, 64, 36);
  fragTagCache.set(key, tex);
  return tex;
}

export class FragRack {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = FRAGRACK_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotY;
    const W = 2.0, D = 0.7, postH = 2.15;
    const metal = mat(0x1a1a1f, { roughness: 0.45, metalness: 0.6 });

    for (const sx of [-W / 2, W / 2]) for (const sz of [-D / 2, D / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, postH, 8), metal);
      post.position.set(sx, postH / 2, sz); post.castShadow = true; this.group.add(post);
    }
    // side plumbing
    for (const sx of [-W / 2 - 0.07, W / 2 + 0.07]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, postH * 0.85, 8), mat(0x2b2d42, { roughness: 0.4, metalness: 0.5 }));
      pipe.position.set(sx, postH * 0.5, -D / 2 + 0.05); this.group.add(pipe);
    }

    this.tierY = [0.58, 1.18, 1.78];
    this.fragMeshes = [];
    for (const ty of this.tierY) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, D), metal);
      rail.position.y = ty - 0.02; this.group.add(rail);
      const tankH = 0.17;
      const water = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, tankH - 0.05, D - 0.16),
        new THREE.MeshStandardMaterial({ color: 0x2a8fd0, transparent: true, opacity: 0.42, roughness: 0.1 }));
      water.position.y = ty + (tankH - 0.05) / 2; this.group.add(water);
      const glass = new THREE.Mesh(rbox(W - 0.1, tankH, D - 0.1, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xeaffff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0, envMapIntensity: 1.5 }));
      glass.position.y = ty + tankH / 2; this.group.add(glass);
      const grid = new THREE.Mesh(new THREE.BoxGeometry(W - 0.18, 0.02, D - 0.18), mat(0x33445a, { roughness: 0.85 }));
      grid.position.y = ty + 0.012; this.group.add(grid);
      // actinic LED bar above the tier (purple HDR -> blooms)
      const led = new THREE.Mesh(new THREE.BoxGeometry(W - 0.24, 0.045, 0.09),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a2be2).multiplyScalar(1.25) }));
      led.position.set(0, ty + 0.5, -D / 2 + 0.12); this.group.add(led);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(W - 0.18, 0.06, 0.13), metal);
      housing.position.set(0, ty + 0.54, -D / 2 + 0.12); this.group.add(housing);
      const wash = new THREE.PointLight(0x9a4bff, 0.4, 1.1, 2); wash.position.set(0, ty + 0.32, 0.05); this.group.add(wash);
    }
    // sump / equipment cabinet
    const sump = new THREE.Mesh(rbox(W, 0.5, D, 0.03), mat(0x17171c, { roughness: 0.5, metalness: 0.4 }));
    sump.position.y = 0.25; this.group.add(sump);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39d3ff).multiplyScalar(1.3) }));
    screen.position.set(W / 2 - 0.35, 0.32, D / 2 + 0.002); this.group.add(screen);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10), metal);
    pump.rotation.z = Math.PI / 2; pump.position.set(-W / 2 + 0.28, 0.18, D / 2 - 0.06); this.group.add(pump);

    this.hit = new THREE.Mesh(new THREE.BoxGeometry(W, postH, D), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = postH / 2;
    this.hit.userData.interact = { type: "fragrack", unit: this };
    this.group.add(this.hit);

    scene.add(this.group);
    colliders.push({ minX: slot.x - W / 2, maxX: slot.x + W / 2, minZ: slot.z - D / 2, maxZ: slot.z + D / 2 });
  }

  // frags: flat list of coral ids (mixed), laid out 6 per tier on the grid
  // frags: array of { id, growth, rare } (legacy plain ids also tolerated)
  syncFrags(frags) {
    for (const m of this.fragMeshes) this.group.remove(m);
    this.fragMeshes = [];
    this.fragEntries = [];
    const perTier = 6, cols = 3;
    const r = seededRand(this.slotIndex + 5);
    frags.forEach((f, i) => {
      const cid = typeof f === "string" ? f : f.id;
      const tier = Math.floor(i / perTier);
      if (tier > 2 || !item(cid)) return;
      const idx = i % perTier, col = idx % cols, row = Math.floor(idx / cols);
      const coral = item(cid);
      const fx = -0.6 + col * 0.6 + (r() - 0.5) * 0.06, fz = -0.15 + row * 0.3;
      const frag = buildFragMesh(coral);
      frag.position.set(fx, this.tierY[tier] + 0.03, fz);
      frag.rotation.y = r() * 6.28;
      this.group.add(frag);
      this.fragMeshes.push(frag);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.062),
        new THREE.MeshBasicMaterial({ map: fragTagTexture(coral.market, coral.color), transparent: true }));
      tag.position.set(fx, this.tierY[tier] + 0.05, fz + 0.16);
      tag.rotation.x = -0.9;
      this.group.add(tag);
      this.fragMeshes.push(tag);
      this.fragEntries.push({ frag: f, mesh: frag, tag, tagVal: -1 });
    });
    this.refreshGrowth();
  }

  // scale frag colonies by maturity + keep the price tag value current
  refreshGrowth() {
    if (!this.fragEntries) return;
    for (const e of this.fragEntries) {
      const g = typeof e.frag === "string" ? 1 : (e.frag.growth ?? 1);
      const rare = typeof e.frag === "string" ? false : !!e.frag.rare;
      e.mesh.scale.setScalar((1.0 + g * 1.6) * (rare ? 1.15 : 1));
      const it = item(typeof e.frag === "string" ? e.frag : e.frag.id);
      const val = coralValue(it, g, rare);
      if (e.tagVal !== val) {
        e.tagVal = val;
        e.tag.material.map = fragTagTexture(val, rare ? 0xffd400 : it.color);
        e.tag.material.needsUpdate = true;
      }
    }
  }
}
