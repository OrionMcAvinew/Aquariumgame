// First-person controls: keyboard/mouse on desktop, twin-zone touch on mobile.
// Also owns the interaction raycast and the carried-box logic.
import * as THREE from "three";
import { item, TANK_FISH_CAP, ROW_CAP, FRAG_CAP } from "./data.js";

const EYE = 1.65;
const RADIUS = 0.34;
const WALK = 4.2;
const SPRINT = 6.4;
const REACH = 2.8;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.yaw = 0;                // face into the store from the door (-Z)
    this.pitch = 0;
    this.pos = new THREE.Vector3(0, EYE, 5.2);
    this.keys = new Set();
    this.carry = null;           // { itemId, count, mesh }
    this.target = null;          // { type, unit?/box?, label, act }
    this.raycaster = new THREE.Raycaster();
    this.touch = { moveId: null, lookId: null, mx: 0, mz: 0, lastX: 0, lastY: 0 };
    this.isTouch = matchMedia("(pointer: coarse)").matches;

    this.bindDesktop();
    if (this.isTouch) this.bindTouch();
  }

  /* ---------- input: desktop ---------- */

  bindDesktop() {
    const canvas = this.game.renderer.domElement;
    canvas.addEventListener("click", () => {
      if (!this.isTouch && !this.game.ui.anyModalOpen()) canvas.requestPointerLock();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
    });
    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === "e") this.interact();
      if (k === "tab") { e.preventDefault(); this.game.ui.toggleTablet(); }
    });
    document.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  /* ---------- input: touch ---------- */

  bindTouch() {
    document.body.classList.add("touch");
    const area = document.getElementById("touch-area");
    const stick = document.getElementById("joystick");
    const knob = document.getElementById("joystick-knob");
    const t = this.touch;

    area.addEventListener("pointerdown", (e) => {
      if (e.clientX < innerWidth * 0.45 && t.moveId === null) {
        t.moveId = e.pointerId;
        stick.style.left = e.clientX + "px";
        stick.style.top = e.clientY + "px";
        stick.classList.add("active");
        t.originX = e.clientX; t.originY = e.clientY;
      } else if (t.lookId === null) {
        t.lookId = e.pointerId;
        t.lastX = e.clientX; t.lastY = e.clientY;
      }
      area.setPointerCapture(e.pointerId);
    });
    area.addEventListener("pointermove", (e) => {
      if (e.pointerId === t.moveId) {
        const dx = e.clientX - t.originX, dy = e.clientY - t.originY;
        const len = Math.hypot(dx, dy), max = 52;
        const cl = Math.min(len, max);
        const nx = len ? dx / len : 0, ny = len ? dy / len : 0;
        knob.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
        t.mx = nx * (cl / max); t.mz = ny * (cl / max);
      } else if (e.pointerId === t.lookId) {
        this.yaw -= (e.clientX - t.lastX) * 0.005;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - (e.clientY - t.lastY) * 0.005));
        t.lastX = e.clientX; t.lastY = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === t.moveId) {
        t.moveId = null; t.mx = 0; t.mz = 0;
        knob.style.transform = "";
        stick.classList.remove("active");
      }
      if (e.pointerId === t.lookId) t.lookId = null;
    };
    area.addEventListener("pointerup", end);
    area.addEventListener("pointercancel", end);

    document.getElementById("btn-interact").addEventListener("click", () => this.interact());
  }

  /* ---------- per-frame ---------- */

  update(dt) {
    if (!this.game.ui.anyModalOpen()) {
      // movement input
      let mx = 0, mz = 0;
      if (this.keys.has("w") || this.keys.has("arrowup")) mz -= 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) mz += 1;
      if (this.keys.has("a") || this.keys.has("arrowleft")) mx -= 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) mx += 1;
      let speed = 0;
      if (mx || mz) {
        const len = Math.hypot(mx, mz);
        mx /= len; mz /= len;
        speed = this.keys.has("shift") ? SPRINT : WALK;
      } else if (Math.hypot(this.touch.mx, this.touch.mz) > 0.12) {
        // analog stick: speed scales with deflection, full push runs
        const len = Math.hypot(this.touch.mx, this.touch.mz);
        const mag = Math.min(1, len);
        mx = this.touch.mx / len; mz = this.touch.mz / len;
        speed = (WALK + (SPRINT - WALK) * Math.max(0, mag - 0.8) * 5) * mag;
      }
      if (speed > 0) {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        // rotate input from view space into world space (view dir is (-sin, -cos))
        this.pos.x += (mx * cos + mz * sin) * speed * dt;
        this.pos.z += (mz * cos - mx * sin) * speed * dt;
        this.resolveCollisions();
        this.bobPhase = (this.bobPhase || 0) + dt * speed * 2.2;
        this.bob = Math.sin(this.bobPhase) * 0.028;
      } else {
        this.bob = (this.bob || 0) * Math.max(0, 1 - dt * 8);
      }
    }

    this.camera.position.copy(this.pos);
    this.camera.position.y += this.bob || 0;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");

    if (this.carry) {
      const f = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
      this.carry.mesh.position.copy(this.pos).addScaledVector(f, 0.85);
      this.carry.mesh.position.y = this.pos.y - 0.55;
      this.carry.mesh.rotation.y = this.yaw;
    }

    this.findTarget();
  }

  resolveCollisions() {
    for (const c of this.game.colliders) {
      const minX = c.minX - RADIUS, maxX = c.maxX + RADIUS;
      const minZ = c.minZ - RADIUS, maxZ = c.maxZ + RADIUS;
      const p = this.pos;
      if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
        const dxl = p.x - minX, dxr = maxX - p.x;
        const dzl = p.z - minZ, dzr = maxZ - p.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) p.x = minX;
        else if (m === dxr) p.x = maxX;
        else if (m === dzl) p.z = minZ;
        else p.z = maxZ;
      }
    }
  }

  /* ---------- interaction targeting ---------- */

  findTarget() {
    const g = this.game;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = REACH;
    const hits = this.raycaster.intersectObjects(g.interactables, true);

    let found = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.interact) o = o.parent;
      if (!o) continue;
      const info = o.userData.interact;

      if (info.type === "box" && !this.carry) {
        const it = item(info.box.itemId);
        found = { type: "box", box: info.box, label: `Pick up ${it.name} ×${info.box.count}` };
      } else if (info.type === "tank") {
        const ownedIdx = g.tankUnits.indexOf(info.unit);
        if (ownedIdx === -1) continue;
        const tank = g.state.tanks[ownedIdx];
        if (this.carry && item(this.carry.itemId).kind === "fish") {
          const space = TANK_FISH_CAP - tank.fish.length;
          found = space > 0
            ? { type: "stock-tank", unit: info.unit, tankIdx: ownedIdx, label: `Stock ${item(this.carry.itemId).name} ×${Math.min(space, this.carry.count)}` }
            : { type: "none", label: "Tank is full" };
        } else if (!this.carry && tank.care < 99.5) {
          found = { type: "care", tankIdx: ownedIdx, unit: info.unit, label: `Feed & clean tank (${Math.round(tank.care)}%)` };
        } else if (!this.carry) {
          found = { type: "none", label: `Tank healthy · ${tank.fish.length}/${TANK_FISH_CAP} fish` };
        }
      } else if (info.type === "shelf") {
        const ownedIdx = g.shelfUnits.indexOf(info.unit);
        if (ownedIdx === -1) continue;
        if (this.carry && item(this.carry.itemId).kind === "product") {
          found = { type: "stock-shelf", unit: info.unit, shelfIdx: ownedIdx, label: `Stock ${item(this.carry.itemId).name}` };
        }
      } else if (info.type === "fragrack") {
        const ownedIdx = g.fragRackUnits.indexOf(info.unit);
        if (ownedIdx === -1) continue;
        const rk = g.state.fragRacks[ownedIdx];
        if (this.carry && item(this.carry.itemId).kind === "coral") {
          found = rk.frags.length < FRAG_CAP
            ? { type: "stock-frag", unit: info.unit, rackIdx: ownedIdx, label: `Place ${item(this.carry.itemId).name} ×${Math.min(FRAG_CAP - rk.frags.length, this.carry.count)}` }
            : { type: "none", label: "Frag rack is full" };
        } else if (!this.carry) {
          found = { type: "none", label: `Frag rack · ${rk.frags.length}/${FRAG_CAP} frags` };
        }
      } else if (info.type === "scanItem") {
        if (!info.entry.scanned) {
          const it = item(info.entry.id);
          found = { type: "scanItem", checkout: info.checkout, entry: info.entry, label: `Scan ${it.name} — $${info.entry.price}` };
        }
      } else if (info.type === "register") {
        const co = info.checkout;
        if (co.customer) {
          found = co.allScanned()
            ? { type: "charge", checkout: co, label: `Charge $${co.total()} — take payment` }
            : { type: "none", label: `Scan all items first (${co.scannedCount()}/${co.items.length})` };
        }
      }
      if (found) break;
    }

    if (!found && this.carry) {
      found = { type: "drop", label: "Put down box" };
    }
    this.target = found;
    this.game.ui.setPrompt(found);
  }

  /* ---------- interaction actions ---------- */

  interact() {
    const t = this.target;
    const g = this.game;
    if (!t) return;

    if (t.type === "box") {
      const b = t.box;
      g.state.boxes.splice(g.state.boxes.indexOf(b), 1);
      g.scene.remove(b.mesh);
      g.interactables.splice(g.interactables.indexOf(b.mesh), 1);
      this.carry = { itemId: b.itemId, count: b.count, mesh: b.mesh };
      g.scene.add(b.mesh);
      g.sound.pickup();
    } else if (t.type === "stock-tank") {
      const tank = g.state.tanks[t.tankIdx];
      const n = Math.min(this.carry.count, TANK_FISH_CAP - tank.fish.length);
      for (let i = 0; i < n; i++) tank.fish.push(this.carry.itemId);
      this.carry.count -= n;
      t.unit.syncFish(tank.fish);
      g.sound.splash();
      g.ui.toast(`🐟 ${n} ${item(this.carry.itemId).name} added to the tank`);
      if (this.carry.count <= 0) this.discardCarried();
      g.save();
    } else if (t.type === "stock-shelf") {
      const shelf = g.state.shelves[t.shelfIdx];
      let moved = 0;
      for (const row of shelf.rows) {
        if (this.carry.count <= 0) break;
        if (row.product === this.carry.itemId || (!row.product && row.count === 0)) {
          row.product = this.carry.itemId;
          const n = Math.min(this.carry.count, ROW_CAP - row.count);
          row.count += n; this.carry.count -= n; moved += n;
        }
      }
      if (moved === 0) { g.ui.toast("This shelf has no room for that.", "bad"); return; }
      t.unit.syncStock(shelf.rows);
      g.sound.pickup();
      g.ui.toast(`📦 Stocked ${moved} ${item(this.carry.itemId).name}`);
      if (this.carry.count <= 0) this.discardCarried();
      g.save();
    } else if (t.type === "care") {
      g.state.tanks[t.tankIdx].care = 100;
      t.unit.setCare(100);
      g.sound.splash();
      g.ui.toast("✨ Tank fed and cleaned");
      g.save();
    } else if (t.type === "stock-frag") {
      const rk = g.state.fragRacks[t.rackIdx];
      const n = Math.min(this.carry.count, FRAG_CAP - rk.frags.length);
      for (let i = 0; i < n; i++) rk.frags.push(this.carry.itemId);
      this.carry.count -= n;
      t.unit.syncFrags(rk.frags);
      g.sound.splash();
      g.ui.toast(`🪸 ${n} ${item(this.carry.itemId).name} placed in the frag rack`);
      if (this.carry.count <= 0) this.discardCarried();
      g.save();
    } else if (t.type === "scanItem") {
      t.checkout.scan(t.entry);
      g.ui.updateCheckout();
    } else if (t.type === "charge") {
      t.checkout.charge();
    } else if (t.type === "drop") {
      const f = new THREE.Vector3(Math.sin(this.yaw) * -1, 0, Math.cos(this.yaw) * -1);
      const pos = this.pos.clone().addScaledVector(f, 0.9);
      pos.y = 0.21;
      g.spawnBox(this.carry.itemId, this.carry.count, pos, this.carry.mesh);
      this.carry = null;
    }
  }

  discardCarried() {
    this.game.scene.remove(this.carry.mesh);
    this.carry = null;
  }

  inRegisterZone() {
    const { REGISTER_ZONE } = this.game.layout;
    const dx = this.pos.x - REGISTER_ZONE.x, dz = this.pos.z - REGISTER_ZONE.z;
    return dx * dx + dz * dz < REGISTER_ZONE.r * REGISTER_ZONE.r;
  }
}
