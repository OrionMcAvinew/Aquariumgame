// Boot, game state, save/load, and the main loop.
import * as THREE from "three";
import {
  CATALOG, item, DAY_LEN, CARE_DECAY_PER_DAY, xpForLevel, MAX_LEVEL,
  PALLET, REGISTER_ZONE, SHELF_ROWS,
} from "./data.js";
import { buildRoom, TankUnit, ShelfUnit, createBoxMesh, loadFishAssets, Checkout } from "./world.js";
import { Player } from "./player.js";
import { CustomerManager } from "./customers.js";
import { UI } from "./ui.js";
import { Sound } from "./sound.js";

const SAVE_KEY = "finfortune3d-save-v1";

const game = {
  scene: null, camera: null, renderer: null,
  colliders: [], interactables: [],
  tankUnits: [], shelfUnits: [],
  state: null, paused: false,
  layout: { REGISTER_ZONE },
};

/* ---------------- State ---------------- */

// Daily revenue target — meeting it pays a bonus at day's end.
const goalFor = (level, day) => Math.round(120 + level * 55 + (day - 1) * 35);

function defaultState() {
  const prices = {};
  for (const c of CATALOG) prices[c.id] = c.market;
  return {
    cash: 300, day: 1, time: 0, level: 1, xp: 0, goal: goalFor(1, 1),
    tanksOwned: 2, shelvesOwned: 1,
    tanks: [
      { fish: ["guppy", "guppy", "guppy", "guppy"], care: 100 },
      { fish: [], care: 100 },
    ],
    shelves: [{ rows: emptyRows() }],
    prices,
    orders: [],   // { itemId, count, eta }
    boxes: [],    // { itemId, count, x, z } (+ mesh at runtime)
    stats: freshStats(),
  };
}

const emptyRows = () =>
  Array.from({ length: SHELF_ROWS }, () => ({ product: null, count: 0 }));
const freshStats = () =>
  ({ revenue: 0, spent: 0, served: 0, sold: 0, lost: 0, missed: 0, priceSkips: 0 });

function serialize() {
  const s = game.state;
  return JSON.stringify({
    ...s,
    boxes: s.boxes.map((b) => ({ itemId: b.itemId, count: b.count, x: b.mesh.position.x, z: b.mesh.position.z })),
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const s = defaultState();
    const defaultPrices = s.prices;
    Object.assign(s, d);
    // saves from older catalogs may be missing prices for new items
    s.prices = { ...defaultPrices, ...d.prices };
    s.stats = { ...freshStats(), ...d.stats };
    s.boxes = (d.boxes || []).map((b) => ({ itemId: b.itemId, count: b.count, x: b.x, z: b.z }));
    s.goal = goalFor(s.level, s.day); // keep the target in step with progress
    return s;
  } catch {
    return null;
  }
}

game.save = () => {
  try { localStorage.setItem(SAVE_KEY, serialize()); } catch { /* no storage */ }
};

game.resetGame = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};

game.addXP = (n) => {
  const s = game.state;
  s.xp += Math.round(n);
  while (s.level < MAX_LEVEL && s.xp >= xpForLevel(s.level + 1)) {
    s.level++;
    game.sound.levelup();
    const unlocks = CATALOG.filter((c) => c.level === s.level).map((c) => c.name);
    game.ui.toast(`🎉 Level ${s.level}!${unlocks.length ? " Unlocked: " + unlocks.join(", ") : ""}`, "good");
  }
};

/* ---------------- World objects ---------------- */

game.addTankUnit = (initial = false) => {
  const idx = game.tankUnits.length;
  const unit = new TankUnit(game.scene, game.colliders, idx);
  game.tankUnits.push(unit);
  game.interactables.push(unit.glass);
  if (!initial) game.state.tanksOwned = game.tankUnits.length;
  if (!game.state.tanks[idx]) game.state.tanks[idx] = { fish: [], care: 100 };
  unit.syncFish(game.state.tanks[idx].fish);
  unit.setCare(game.state.tanks[idx].care);
};

game.addShelfUnit = (initial = false) => {
  const idx = game.shelfUnits.length;
  const unit = new ShelfUnit(game.scene, game.colliders, idx);
  game.shelfUnits.push(unit);
  game.interactables.push(unit.hit);
  if (!initial) game.state.shelvesOwned = game.shelfUnits.length;
  if (!game.state.shelves[idx]) game.state.shelves[idx] = { rows: emptyRows() };
  unit.syncStock(game.state.shelves[idx].rows);
};

game.spawnBox = (itemId, count, pos, existingMesh = null) => {
  const mesh = existingMesh || createBoxMesh(itemId);
  mesh.position.copy(pos);
  const box = { itemId, count, mesh };
  mesh.userData.interact = { type: "box", box };
  game.scene.add(mesh);
  game.interactables.push(mesh);
  game.state.boxes.push(box);
  return box;
};

function palletDropPos() {
  const n = game.state.boxes.length;
  return new THREE.Vector3(
    PALLET.x - 0.6 + (n % 3) * 0.62,
    0.21 + Math.floor(n / 6) * 0.44,
    PALLET.z - 0.3 + (Math.floor(n / 3) % 2) * 0.66
  );
}

/* ---------------- Day cycle ---------------- */

function endDay() {
  const s = game.state;
  const rent = 20 + 8 * (s.tanksOwned + s.shelvesOwned);
  const stats = { ...s.stats };
  const goal = s.goal;
  const goalMet = stats.revenue >= goal;
  const bonus = goalMet ? Math.round(goal * 0.2) + 25 : 0;
  s.cash -= rent;
  if (bonus) s.cash += bonus;
  s.day++;
  s.time = 0;
  s.stats = freshStats();
  s.goal = goalFor(s.level, s.day);
  game.customers.clearAll();
  game.checkout?.clear();
  game.ui.showSummary(s.day - 1, stats, rent, goal, goalMet, bonus);
  if (goalMet) game.ui.toast(`🎯 Daily goal hit! Bonus +$${bonus}`, "good");
  if (s.cash < 0) game.ui.toast("⚠️ You're in the red — sell hard tomorrow!", "bad");
  game.save();
}

/* ---------------- Boot ---------------- */

function init() {
  game.state = loadState() || defaultState();
  const isNew = !localStorage.getItem(SAVE_KEY);

  game.scene = new THREE.Scene();
  game.scene.background = new THREE.Color(0x9ed4e8);
  game.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 100);

  game.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById("game") });
  game.renderer.setSize(innerWidth, innerHeight);
  game.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  game.renderer.toneMappingExposure = 1.15;
  game.scene.fog = new THREE.Fog(0x9ed4e8, 28, 60);
  const isTouch = matchMedia("(pointer: coarse)").matches;
  game.renderer.shadowMap.enabled = !isTouch;

  // Lights
  game.hemi = new THREE.HemisphereLight(0xfff6e8, 0x9aa5a0, 1.25);
  game.scene.add(game.hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
  game.sun = sun;
  sun.position.set(6, 10, 4);
  if (!isTouch) {
    sun.castShadow = true;
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.mapSize.set(1024, 1024);
  }
  game.scene.add(sun);

  // Aquarium accent lighting: cool blue glow washing the tank wall, and warm
  // pools over the checkout / supplies side for a reef-shop ambiance.
  for (const z of [-4.5, -0.5, 3.5]) {
    const aqua = new THREE.PointLight(0x4fd0ff, 0.55, 7, 1.6);
    aqua.position.set(-7.6, 1.7, z);
    game.scene.add(aqua);
  }
  const warm = new THREE.PointLight(0xffd9a0, 0.5, 9, 1.5);
  warm.position.set(4, 2.6, 4);
  game.scene.add(warm);
  const supply = new THREE.PointLight(0xfff0d8, 0.4, 9, 1.5);
  supply.position.set(7.5, 2.6, -2);
  game.scene.add(supply);

  buildRoom(game.scene, game.colliders);

  game.sound = new Sound();
  game.ui = new UI(game);
  game.player = new Player(game);
  game.customers = new CustomerManager(game);
  game.checkout = new Checkout(game);

  for (let i = 0; i < game.state.tanksOwned; i++) game.addTankUnit(true);
  for (let i = 0; i < game.state.shelvesOwned; i++) game.addShelfUnit(true);

  // restore boxes lying around
  const savedBoxes = game.state.boxes;
  game.state.boxes = [];
  for (const b of savedBoxes) {
    game.spawnBox(b.itemId, b.count, new THREE.Vector3(b.x, 0.21, b.z));
  }

  if (isNew) game.ui.showIntro();

  addEventListener("resize", () => {
    game.camera.aspect = innerWidth / innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(innerWidth, innerHeight);
  });
  setInterval(game.save, 10000);
  addEventListener("beforeunload", game.save);

  window.game = game; // console access for debugging
  requestAnimationFrame(loop);
}

/* ---------------- Main loop ---------------- */

let last = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const s = game.state;

  if (!game.paused) {
    s.time += dt;
    if (s.time >= DAY_LEN) endDay();

    // time-of-day lighting: midday is bright/cool, late afternoon warms to a
    // dim orange dusk so the lit tanks glow.
    const dayT = s.time / DAY_LEN;
    const warm = Math.max(0, (dayT - 0.5) / 0.5);          // 0 until midday -> 1 at close
    const dusk = Math.max(0, (dayT - 0.85) / 0.15);        // final darkening
    const sky = new THREE.Color(0x9ed4e8).lerp(new THREE.Color(0xf4a05a), warm * 0.85);
    sky.lerp(new THREE.Color(0x223a52), dusk * 0.6);
    game.scene.background.copy(sky);
    game.scene.fog.color.copy(sky);
    game.sun.intensity = 1.3 - warm * 0.55;
    game.sun.color.setHex(0xfff2d8).lerp(new THREE.Color(0xff9d5c), warm);
    game.hemi.intensity = 1.25 - warm * 0.4 - dusk * 0.15;

    // deliveries
    for (let i = s.orders.length - 1; i >= 0; i--) {
      const o = s.orders[i];
      o.eta -= dt;
      if (o.eta <= 0) {
        s.orders.splice(i, 1);
        game.spawnBox(o.itemId, o.count, palletDropPos());
        game.ui.toast(`📦 ${item(o.itemId).name} delivered!`);
        game.sound.pickup();
      }
    }

    // tank care decay
    const decay = (CARE_DECAY_PER_DAY / DAY_LEN) * dt;
    s.tanks.forEach((t, i) => {
      if (t.care > 0) {
        t.care = Math.max(0, t.care - decay * (1 + t.fish.length * 0.08));
        game.tankUnits[i]?.setCare(t.care);
      }
    });

    game.customers.update(dt);
    // physical checkout: spawn the at-counter customer's items on the counter
    const atc = game.customers.atCounter();
    if (atc) { if (game.checkout.customer !== atc) game.checkout.present(atc); }
    else if (game.checkout.customer) game.checkout.clear();
    game.checkout.update(dt);
    for (const t of game.tankUnits) t.update(dt);
  }

  game.player.update(dt);
  game.ui.updateHUD();
  game.ui.updateCheckout();
  game.renderer.render(game.scene, game.camera);
}

// Load the fish sprite pack first; init() falls back to procedural art if
// any asset fails to load, so we run it regardless of the outcome.
loadFishAssets().then(init, init);
