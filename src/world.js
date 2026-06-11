// Builds the 3D store: room, furniture units (tanks/shelves), delivery boxes.
import * as THREE from "three";
import {
  STORE, TANK_SLOTS, SHELF_SLOTS, COUNTER, PALLET,
  SHELF_ROWS, ROW_CAP, item,
} from "./data.js";

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

function canvasTexture(draw, w = 128, h = 128) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- Room ---------------- */

export function buildRoom(scene, colliders) {
  const { halfW, halfD, wallH, doorHalf } = STORE;

  // Floor: light tile checker
  const floorTex = canvasTexture((ctx) => {
    ctx.fillStyle = "#d8d3c8"; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#cfc9bc"; ctx.fillRect(0, 0, 64, 64); ctx.fillRect(64, 64, 64, 64);
    ctx.strokeStyle = "#bdb6a7"; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 64, 64); ctx.strokeRect(64, 64, 64, 64);
    ctx.strokeRect(64, 0, 64, 64); ctx.strokeRect(0, 64, 64, 64);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(halfW, halfD);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfD * 2),
    new THREE.MeshLambertMaterial({ map: floorTex })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Sidewalk outside the door
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), mat(0x9a9a98));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(0, -0.01, halfD + 3);
  scene.add(walk);

  // Walls
  const wallMat = mat(0xf2ead9);
  const wall = (w, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.25), wallMat);
    m.position.set(x, wallH / 2, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
  };
  wall(halfW * 2, 0, -halfD, 0);                                 // north
  wall(halfD * 2, -halfW, 0, Math.PI / 2);                       // west
  wall(halfD * 2, halfW, 0, Math.PI / 2);                        // east
  const seg = halfW - doorHalf;                                  // south, with door gap
  wall(seg, -(doorHalf + seg / 2), halfD, 0);
  wall(seg, doorHalf + seg / 2, halfD, 0);
  // Header above the door
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2, wallH - 2.3, 0.25), wallMat);
  header.position.set(0, 2.3 + (wallH - 2.3) / 2, halfD);
  scene.add(header);

  // Baseboard stripe
  const stripeMat = mat(0x2a9d8f);
  for (const [w, x, z, r] of [
    [halfW * 2, 0, -halfD + 0.14, 0],
    [halfD * 2, -halfW + 0.14, 0, Math.PI / 2],
    [halfD * 2, halfW - 0.14, 0, Math.PI / 2],
  ]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, 0.05), stripeMat);
    s.position.set(x, 0.6, z); s.rotation.y = r;
    scene.add(s);
  }

  // Ceiling + light fixtures
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfD * 2),
    new THREE.MeshBasicMaterial({ color: 0xdce3df })
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

  // Welcome mat + sign
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

  // Wall colliders (door stays open but blocked so the player remains inside)
  colliders.push(
    { minX: -halfW - 1, maxX: halfW + 1, minZ: -halfD - 1, maxZ: -halfD + 0.2 },
    { minX: -halfW - 1, maxX: -halfW + 0.2, minZ: -halfD, maxZ: halfD },
    { minX: halfW - 0.2, maxX: halfW + 1, minZ: -halfD, maxZ: halfD },
    { minX: -halfW, maxX: halfW, minZ: halfD - 0.2, maxZ: halfD + 1 },
  );

  // Checkout counter + register
  const counterGroup = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(COUNTER.w, 0.08, COUNTER.d), mat(0x8a5a3b));
  top.position.y = COUNTER.h;
  const body = new THREE.Mesh(new THREE.BoxGeometry(COUNTER.w - 0.1, COUNTER.h, COUNTER.d - 0.15), mat(0x356a8c));
  body.position.y = COUNTER.h / 2;
  const register = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.36), mat(0x2b2d42));
  register.position.set(-COUNTER.w / 2 + 0.45, COUNTER.h + 0.19, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x9ef0ff }));
  screen.position.set(-COUNTER.w / 2 + 0.45, COUNTER.h + 0.22, 0.19);
  counterGroup.add(top, body, register, screen);
  counterGroup.position.set(COUNTER.x, 0, COUNTER.z);
  counterGroup.traverse((m) => { m.castShadow = true; });
  scene.add(counterGroup);
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

/* ---------------- Fish tank unit ---------------- */

export class TankUnit {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = TANK_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotY;

    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 0.75), mat(0x3d405b));
    stand.position.y = 0.425;
    stand.castShadow = true;

    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa6dd, transparent: true, opacity: 0.55 });
    this.water = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.72, 0.6), this.waterMat);
    this.water.position.y = 0.85 + 0.04 + 0.36;

    const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfeffd, transparent: true, opacity: 0.18 });
    this.glass = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.86, 0.68), glassMat);
    this.glass.position.y = 0.85 + 0.43;
    this.glass.userData.interact = { type: "tank", unit: this };

    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.72), mat(0x2b2d42));
    rim.position.y = 0.85 + 0.86;
    const gravel = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.07, 0.6), mat(0xc9a86b));
    gravel.position.y = 0.85 + 0.075;

    this.group.add(stand, this.water, this.glass, rim, gravel);
    scene.add(this.group);

    const cx = slot.x, cz = slot.z;
    const hw = slot.rotY === 0 ? 0.95 : 0.38, hd = slot.rotY === 0 ? 0.38 : 0.95;
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });

    this.fishMeshes = []; // { mesh, target, speed }
  }

  syncFish(fishList) {
    while (this.fishMeshes.length > fishList.length) {
      const f = this.fishMeshes.pop();
      this.group.remove(f.mesh);
    }
    while (this.fishMeshes.length < fishList.length) {
      const species = item(fishList[this.fishMeshes.length]);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), mat(species.color));
      body.scale.set(1.6, 0.85, 0.55);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 4), mat(species.color));
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.16;
      g.add(body, tail);
      g.position.copy(this.randomSwimPoint());
      this.fishMeshes.push({ mesh: g, target: this.randomSwimPoint(), speed: 0.18 + Math.random() * 0.2 });
      this.group.add(g);
    }
  }

  randomSwimPoint() {
    return new THREE.Vector3(
      (Math.random() - 0.5) * 1.4,
      1.05 + Math.random() * 0.45,
      (Math.random() - 0.5) * 0.4
    );
  }

  setCare(care) {
    const t = Math.max(0, Math.min(1, care / 100));
    // clean blue -> murky green
    this.waterMat.color.setHex(0x3aa6dd).lerp(new THREE.Color(0x5a7f3d), 1 - t);
    this.waterMat.opacity = 0.5 + (1 - t) * 0.3;
  }

  update(dt) {
    for (const f of this.fishMeshes) {
      const d = f.target.clone().sub(f.mesh.position);
      if (d.length() < 0.08) { f.target = this.randomSwimPoint(); continue; }
      d.normalize();
      f.mesh.position.addScaledVector(d, f.speed * dt);
      const yaw = Math.atan2(-d.z, d.x);
      f.mesh.rotation.y += (yaw - f.mesh.rotation.y) * Math.min(1, dt * 4);
    }
  }
}

/* ---------------- Shelf unit ---------------- */

export class ShelfUnit {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = SHELF_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotY;

    const frameMat = mat(0x6c757d);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 0.06), frameMat);
    back.position.set(0, 1.0, -0.22);
    back.castShadow = true;
    this.group.add(back);
    for (let i = 0; i < SHELF_ROWS + 1; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.5), frameMat);
      board.position.y = 0.25 + i * 0.58;
      this.group.add(board);
    }
    // Invisible interaction volume covering the shelf
    this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 2.1, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hit.position.y = 1.05;
    this.hit.userData.interact = { type: "shelf", unit: this };
    this.group.add(this.hit);

    scene.add(this.group);

    const cx = slot.x, cz = slot.z;
    const hw = slot.rotY === 0 ? 0.98 : 0.3, hd = slot.rotY === 0 ? 0.3 : 0.98;
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });

    this.stockMeshes = [];
  }

  // rows: [{ product, count }]
  syncStock(rows) {
    for (const m of this.stockMeshes) this.group.remove(m);
    this.stockMeshes = [];
    rows.forEach((row, r) => {
      if (!row.product || row.count <= 0) return;
      const prod = item(row.product);
      const geo = new THREE.BoxGeometry(0.17, 0.24, 0.17);
      const m = mat(prod.color);
      for (let i = 0; i < Math.min(row.count, ROW_CAP); i++) {
        const box = new THREE.Mesh(geo, m);
        box.position.set(-0.78 + i * 0.215, 0.25 + r * 0.58 + 0.145, 0.05);
        this.group.add(box);
        this.stockMeshes.push(box);
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

export function createCustomerMesh() {
  const g = new THREE.Group();
  const shirt = SHIRT[(Math.random() * SHIRT.length) | 0];
  const skin = SKIN[(Math.random() * SKIN.length) | 0];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.62, 4, 8), mat(shirt));
  body.position.y = 0.85;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), mat(skin));
  head.position.y = 1.5;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 8), mat(0x33415c));
  legs.position.y = 0.25;
  g.add(body, head, legs);
  return g;
}
