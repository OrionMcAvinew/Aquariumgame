// Builds the 3D store: room, furniture units (tanks/shelves), delivery boxes.
import * as THREE from "three";
import {
  STORE, TANK_SLOTS, SHELF_SLOTS, COUNTER, PALLET,
  SHELF_ROWS, ROW_CAP, item,
} from "./data.js";

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

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

export function buildRoom(scene, colliders) {
  const { halfW, halfD, wallH, doorHalf } = STORE;

  // Floor: warm tile with subtle variation
  const floorTex = canvasTexture((ctx) => {
    ctx.fillStyle = "#ddd6c8"; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#d2cabb"; ctx.fillRect(0, 0, 64, 64); ctx.fillRect(64, 64, 64, 64);
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(120,110,90,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
    ctx.strokeStyle = "#b9b09c"; ctx.lineWidth = 2;
    for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64]]) ctx.strokeRect(x, y, 64, 64);
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

  // Walls
  const wallMat = mat(0xf4ecdc);
  const wainscotMat = mat(0x35698c);
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
  // wainscot stripe on solid walls
  wall(halfW * 2, 0, -halfD + 0.14, 0, wainscotMat, 0.85, 0.425, 0.04);
  wall(halfD * 2, -halfW + 0.14, 0, Math.PI / 2, wainscotMat, 0.85, 0.425, 0.04);
  wall(halfD * 2, halfW - 0.14, 0, Math.PI / 2, wainscotMat, 0.85, 0.425, 0.04);

  // South storefront: knee wall + big glass windows flanking the door
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0xbfe6f5, transparent: true, opacity: 0.22, shininess: 90,
  });
  const segW = halfW - doorHalf;
  for (const side of [-1, 1]) {
    const cx = side * (doorHalf + segW / 2);
    wall(segW, cx, halfD, 0, wallMat, 0.8, 0.4);                       // knee wall
    wall(segW, cx, halfD, 0, wallMat, 0.5, wallH - 0.25);              // header band
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
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.16, wallH - 2.3, 0.25), wallMat);
  header.position.set(0, 2.3 + (wallH - 2.3) / 2, halfD);
  scene.add(header);

  // Ceiling + light fixtures + trim
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

  // Posters
  const posters = [
    { tex: makePoster("NEW!", "Exotic species weekly", "#0b3954", "#ffd166"), x: -4, z: -halfD + 0.14, ry: 0 },
    { tex: makePoster("CARE", "Happy fish sell best", "#87431d", "#ffe8d6"), x: 4.5, z: -halfD + 0.14, ry: 0 },
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
  const cardReader = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), mat(0x495057));
  cardReader.position.set(0.2, COUNTER.h + 0.12, 0.25);
  cardReader.rotation.x = -0.4;
  const bagStand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.25), mat(0xd5bdaf));
  bagStand.position.set(COUNTER.w / 2 - 0.35, COUNTER.h + 0.24, 0);
  counterGroup.add(top, body, register, screen, cardReader, bagStand);
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

/* ---------------- Fish model ---------------- */

function buildFishMesh(species) {
  const g = new THREE.Group();
  const s = species.size;
  const bodyMat = mat(species.color);
  const finMat = mat(species.fin);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 10, 8), bodyMat);
  body.scale.set(1.6, 0.85, 0.5);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.11 * s, 6), finMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.17 * s;

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.07 * s, 4), finMat);
  dorsal.position.set(-0.01 * s, 0.085 * s, 0);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.013 * s, 6, 4);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(0.09 * s, 0.02 * s, 0.038 * s);
  const eyeR = eyeL.clone();
  eyeR.position.z = -0.038 * s;

  g.add(body, tail, dorsal, eyeL, eyeR);
  return { group: g, tail };
}

/* ---------------- Fish tank unit ---------------- */

const CORAL_COLORS = [0xff6b6b, 0xf3722c, 0xf9c74f, 0xc77dff, 0x4ecdc4];

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
    const kick = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.77), mat(0x2b2d42));
    kick.position.y = 0.05;

    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa6dd, transparent: true, opacity: 0.5 });
    this.water = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.72, 0.6), this.waterMat);
    this.water.position.y = 0.85 + 0.04 + 0.36;

    const glassMat = new THREE.MeshPhongMaterial({
      color: 0xd6f3ff, transparent: true, opacity: 0.15, shininess: 120,
    });
    this.glass = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.86, 0.68), glassMat);
    this.glass.position.y = 0.85 + 0.43;
    this.glass.userData.interact = { type: "tank", unit: this };

    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.72), mat(0x2b2d42));
    rim.position.y = 0.85 + 0.86;
    // light strip glowing under the rim
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.03, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xf4fcff }));
    strip.position.y = 0.85 + 0.825;
    const gravel = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.07, 0.6), mat(0xc9a86b));
    gravel.position.y = 0.85 + 0.075;

    this.group.add(stand, kick, this.water, this.glass, rim, strip, gravel);
    this.addDecorations();
    this.addBubbles();
    scene.add(this.group);

    const cx = slot.x, cz = slot.z;
    const hw = slot.rotY === 0 ? 0.95 : 0.38, hd = slot.rotY === 0 ? 0.38 : 0.95;
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });

    this.fishMeshes = []; // { mesh, tail, target, speed, phase }
    this.time = Math.random() * 10;
  }

  addDecorations() {
    const r = seededRand(this.slotIndex + 7);
    const floorY = 0.85 + 0.11;
    // coral clusters
    const nCoral = 1 + Math.floor(r() * 2);
    for (let c = 0; c < nCoral; c++) {
      const cluster = new THREE.Group();
      const color = CORAL_COLORS[Math.floor(r() * CORAL_COLORS.length)];
      const branches = 3 + Math.floor(r() * 3);
      for (let b = 0; b < branches; b++) {
        const branch = new THREE.Mesh(
          new THREE.ConeGeometry(0.018 + r() * 0.015, 0.1 + r() * 0.12, 5), mat(color));
        branch.position.set((r() - 0.5) * 0.12, 0.06 + r() * 0.05, (r() - 0.5) * 0.1);
        branch.rotation.z = (r() - 0.5) * 0.9;
        branch.rotation.x = (r() - 0.5) * 0.5;
        cluster.add(branch);
      }
      cluster.position.set(-0.65 + r() * 1.3, floorY, (r() - 0.5) * 0.36);
      this.group.add(cluster);
    }
    // seaweed strands
    const nWeed = 2 + Math.floor(r() * 2);
    for (let w = 0; w < nWeed; w++) {
      const x = -0.7 + r() * 1.4, z = (r() - 0.5) * 0.38;
      const h = 0.25 + r() * 0.3;
      const weed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 5), mat(0x52b788));
      weed.position.set(x, floorY + h / 2, z);
      weed.rotation.z = (r() - 0.5) * 0.3;
      this.group.add(weed);
    }
    // pebbles
    for (let p = 0; p < 4; p++) {
      const peb = new THREE.Mesh(new THREE.SphereGeometry(0.025 + r() * 0.025, 6, 5),
        mat(p % 2 ? 0x8d99ae : 0xadb5bd));
      peb.position.set(-0.7 + r() * 1.4, floorY, (r() - 0.5) * 0.4);
      peb.scale.y = 0.6;
      this.group.add(peb);
    }
  }

  addBubbles() {
    this.bubbles = [];
    const bubMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.55 });
    const r = seededRand(this.slotIndex + 31);
    const bx = -0.6 + r() * 1.2, bz = (r() - 0.5) * 0.3;
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + r() * 0.012, 5, 4), bubMat);
      b.position.set(bx, 0.97 + r() * 0.6, bz);
      b.userData.speed = 0.12 + r() * 0.1;
      b.userData.wob = r() * 6;
      this.group.add(b);
      this.bubbles.push(b);
    }
  }

  syncFish(fishList) {
    while (this.fishMeshes.length > fishList.length) {
      const f = this.fishMeshes.pop();
      this.group.remove(f.mesh);
    }
    while (this.fishMeshes.length < fishList.length) {
      const species = item(fishList[this.fishMeshes.length]);
      const { group, tail } = buildFishMesh(species);
      group.position.copy(this.randomSwimPoint());
      this.fishMeshes.push({
        mesh: group, tail,
        target: this.randomSwimPoint(),
        speed: 0.16 + Math.random() * 0.18,
        phase: Math.random() * 6,
      });
      this.group.add(group);
    }
  }

  randomSwimPoint() {
    return new THREE.Vector3(
      (Math.random() - 0.5) * 1.35,
      1.08 + Math.random() * 0.42,
      (Math.random() - 0.5) * 0.36
    );
  }

  setCare(care) {
    const t = Math.max(0, Math.min(1, care / 100));
    // clean blue -> murky green
    this.waterMat.color.setHex(0x3aa6dd).lerp(new THREE.Color(0x5a7f3d), 1 - t);
    this.waterMat.opacity = 0.45 + (1 - t) * 0.35;
  }

  update(dt) {
    this.time += dt;
    for (const f of this.fishMeshes) {
      const d = f.target.clone().sub(f.mesh.position);
      if (d.length() < 0.08) { f.target = this.randomSwimPoint(); continue; }
      d.normalize();
      f.mesh.position.addScaledVector(d, f.speed * dt);
      const yaw = Math.atan2(-d.z, d.x);
      f.mesh.rotation.y += (yaw - f.mesh.rotation.y) * Math.min(1, dt * 4);
      f.tail.rotation.y = Math.sin(this.time * 9 + f.phase) * 0.5;
    }
    for (const b of this.bubbles) {
      b.position.y += b.userData.speed * dt;
      b.position.x += Math.sin(this.time * 3 + b.userData.wob) * 0.01 * dt * 60;
      if (b.position.y > 1.55) b.position.y = 0.97;
    }
  }
}

/* ---------------- Shelf unit ---------------- */

function productGeometry(prod) {
  if (prod.shape === "cyl") return new THREE.CylinderGeometry(0.075, 0.075, 0.24, 10);
  if (prod.shape === "bag") {
    const g = new THREE.SphereGeometry(0.1, 8, 6);
    g.scale(1, 1.25, 0.7);
    return g;
  }
  return new THREE.BoxGeometry(0.17, 0.24, 0.17);
}

export class ShelfUnit {
  constructor(scene, colliders, slotIndex) {
    this.slotIndex = slotIndex;
    const slot = SHELF_SLOTS[slotIndex];
    this.group = new THREE.Group();
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotY;

    const frameMat = mat(0x6c757d);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 0.06), mat(0x5a626a));
    back.position.set(0, 1.0, -0.22);
    back.castShadow = true;
    this.group.add(back);
    for (const sx of [-0.94, 0.94]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.0, 0.5), frameMat);
      side.position.set(sx, 1.0, 0);
      this.group.add(side);
    }
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
    const r = seededRand(this.slotIndex + 51);
    rows.forEach((row, ri) => {
      if (!row.product || row.count <= 0) return;
      const prod = item(row.product);
      const geo = productGeometry(prod);
      const m = mat(prod.color);
      for (let i = 0; i < Math.min(row.count, ROW_CAP); i++) {
        const piece = new THREE.Mesh(geo, m);
        piece.position.set(-0.78 + i * 0.215, 0.25 + ri * 0.58 + 0.15, 0.05);
        piece.rotation.y = (r() - 0.5) * 0.5;
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

export function createCustomerMesh() {
  const g = new THREE.Group();
  const shirt = SHIRT[(Math.random() * SHIRT.length) | 0];
  const skin = SKIN[(Math.random() * SKIN.length) | 0];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.62, 4, 8), mat(shirt));
  body.position.y = 0.85;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), mat(skin));
  head.position.y = 1.5;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, 1.2),
    mat(HAIR[(Math.random() * HAIR.length) | 0]));
  hair.position.y = 1.52;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 8), mat(0x33415c));
  legs.position.y = 0.25;
  g.add(body, head, hair, legs);
  return g;
}
