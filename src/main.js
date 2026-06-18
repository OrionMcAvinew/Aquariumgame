// Boot, game state, save/load, and the main loop.
import * as THREE from "three";
import {
  CATALOG, item, DAY_LEN, CARE_DECAY_PER_DAY, xpForLevel, MAX_LEVEL,
  PALLET, REGISTER_ZONE, SHELF_ROWS, TANK_FISH_CAP, ROW_CAP, ACHIEVEMENTS, STAFF,
  FRAG_CAP, CORAL_GROWTH_RATE, CORAL_RARE_CHANCE, rollFishQuality,
} from "./data.js";
import { buildRoom, TankUnit, ShelfUnit, createBoxMesh, loadFishAssets, loadCharacterModel, loadCounterModel, Checkout, createCustomerMesh, FeatureTank, FragRack } from "./world.js";
import { RoomEnvironment } from "../lib/jsm/RoomEnvironment.js";
import { EffectComposer } from "../lib/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../lib/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../lib/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../lib/jsm/postprocessing/OutputPass.js";
import { Player } from "./player.js";
import { CustomerManager } from "./customers.js";
import { UI } from "./ui.js";
import { Sound } from "./sound.js";

const SAVE_KEY = "finfortune3d-save-v1";

const game = {
  scene: null, camera: null, renderer: null,
  colliders: [], interactables: [],
  tankUnits: [], shelfUnits: [], fragRackUnits: [],
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
    tanksOwned: 2, shelvesOwned: 1, fragRacksOwned: 1,
    tanks: [
      { fish: ["guppy", "guppy", "guppy", "guppy"].map((id) => ({ id, q: 2, rare: false })), care: 100 },
      { fish: [], care: 100 },
    ],
    shelves: [{ rows: emptyRows() }],
    fragRacks: [{ frags: [
      { id: "zoa", growth: 0.8, rare: false }, { id: "mushroom", growth: 0.4, rare: false },
      { id: "duncan", growth: 0.6, rare: false }, { id: "acan", growth: 0.2, rare: false },
      { id: "gsp", growth: 0.5, rare: false }, { id: "torch", growth: 0.3, rare: false },
    ] }],
    prices,
    orders: [],   // { itemId, count, eta }
    boxes: [],    // { itemId, count, x, z } (+ mesh at runtime)
    stats: freshStats(),
    lifetime: { sold: 0, served: 0, revenue: 0, goals: 0 },
    achievements: [],
    staff: { cashier: false, aquarist: false, stocker: false },
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
    lastTime: Date.now(), // for offline progression
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
    // fish are individuals now; migrate legacy plain-id saves
    s.tanks = (d.tanks || s.tanks).map((t) => ({
      care: t.care ?? 100,
      fish: (t.fish || []).map((f) => typeof f === "string"
        ? { id: f, q: 2, rare: false } : { id: f.id, q: f.q ?? 2, rare: !!f.rare }),
    }));
    s.boxes = (d.boxes || []).map((b) => ({ itemId: b.itemId, count: b.count, x: b.x, z: b.z }));
    s.goal = goalFor(s.level, s.day); // keep the target in step with progress
    s.lifetime = { sold: 0, served: 0, revenue: 0, goals: 0, ...d.lifetime };
    s.achievements = d.achievements || [];
    s.staff = { cashier: false, aquarist: false, stocker: false, ...d.staff };
    s.fragRacksOwned = d.fragRacksOwned ?? 1;
    s.fragRacks = (d.fragRacks || [{ frags: [] }]).map((rk) => ({
      frags: (rk.frags || []).map((f) =>
        typeof f === "string" ? { id: f, growth: 1, rare: false }
          : { id: f.id, growth: f.growth ?? 1, rare: !!f.rare }),
    }));
    // offline progression: grow coral by the time the game was closed (cap 8h)
    const elapsed = d.lastTime ? Math.min((Date.now() - d.lastTime) / 1000, 8 * 3600) : 0;
    if (elapsed > 5) {
      let grew = false;
      for (const rk of s.fragRacks) for (const f of rk.frags) {
        const ng = Math.min(1, f.growth + elapsed * CORAL_GROWTH_RATE);
        if (ng > f.growth + 0.001) { f.growth = ng; grew = true; }
      }
      if (grew) s._offlineMin = Math.round(elapsed / 60);
    }
    return s;
  } catch {
    return null;
  }
}

game.save = () => {
  if (game._resetting) return; // don't re-save while resetting
  try { localStorage.setItem(SAVE_KEY, serialize()); } catch { /* no storage */ }
};

game.resetGame = () => {
  // stop autosave + the beforeunload save, otherwise the reload re-writes the
  // current state right after we clear it (which is why reset "did nothing").
  game._resetting = true;
  clearInterval(game._saveTimer);
  try { localStorage.removeItem(SAVE_KEY); } catch { /* no storage */ }
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
  game.checkAchievements();
};

game.checkAchievements = () => {
  const s = game.state;
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.test(s)) {
      s.achievements.push(a.id);
      game.sound.levelup();
      game.ui.toast(`🏆 Achievement unlocked: ${a.name}`, "good");
    }
  }
};

/* ---------------- Staff ---------------- */

const STAFF_SPOT = {
  cashier:  { x: 4.35, z: 6.25, rotY: 0 },
  aquarist: { x: -7.4, z: 2.6, rotY: -Math.PI / 2 },
  stocker:  { x: -4.6, z: 5.3, rotY: Math.PI },
};
game.staffMeshes = {};

game.hireStaff = (id) => {
  const def = STAFF.find((s) => s.id === id);
  if (!def || game.state.staff[id] || game.state.cash < def.hire) return;
  game.state.cash -= def.hire;
  game.state.stats.spent += def.hire;
  game.state.staff[id] = true;
  game.spawnStaffMesh(id, def);
  game.ui.toast(`${def.emoji} Hired a ${def.name}! Wage $${def.wage}/day.`, "good");
  game.save();
};

game.fireStaff = (id) => {
  if (!game.state.staff[id]) return;
  game.state.staff[id] = false;
  if (game.staffMeshes[id]) { game.scene.remove(game.staffMeshes[id]); delete game.staffMeshes[id]; }
  game.save();
};

game.spawnStaffMesh = (id, def) => {
  if (game.staffMeshes[id]) return;
  const spot = STAFF_SPOT[id];
  const m = createCustomerMesh({ uniform: def.uniform });
  m.position.set(spot.x, 0, spot.z);
  m.rotation.y = spot.rotY;
  m.userData.bob = Math.random() * 6;
  game.scene.add(m);
  game.staffMeshes[id] = m;
};

// Coral farming: frags grow over time and gain value; maturing ones can
// mutate into rare morphs.
game.updateCoral = (dt) => {
  for (const [i, rk] of game.state.fragRacks.entries()) {
    let changed = false;
    for (const f of rk.frags) {
      if (f.growth < 1) {
        const prev = f.growth;
        f.growth = Math.min(1, f.growth + CORAL_GROWTH_RATE * dt);
        changed = true;
        if (prev < 1 && f.growth >= 1 && !f.rare && Math.random() < CORAL_RARE_CHANCE) {
          f.rare = true;
          game.ui.toast(`🌟 A ${item(f.id).name} grew into a rare morph!`, "good");
        }
      }
    }
    if (changed) game.fragRackUnits[i]?.refreshGrowth();
  }
};

// Harvest: cut a frag off a mature colony (yields a new frag to grow/sell).
game.fragCoral = (rackIdx) => {
  const rk = game.state.fragRacks[rackIdx];
  if (!rk || rk.frags.length >= FRAG_CAP) { game.ui.toast("Rack is full — sell some frags first.", "bad"); return; }
  let best = null;
  for (const f of rk.frags) if (f.growth >= 0.95 && (!best || f.growth > best.growth)) best = f;
  if (!best) return;
  rk.frags.push({ id: best.id, growth: 0, rare: false });
  best.growth = 0.45; // colony cut back; it regrows
  game.fragRackUnits[rackIdx].syncFrags(rk.frags);
  game.sound.splash();
  game.ui.toast(`🪸 Fragged a ${item(best.id).name} colony!`, "good");
  game.save();
};

// Move one delivered box's contents onto a matching tank/shelf with room.
game.autoStock = () => {
  const s = game.state;
  if (s.boxes.length === 0) return;
  const box = s.boxes[0];
  const it = item(box.itemId);
  if (it.kind === "fish") {
    const ti = s.tanks.findIndex((t) => t.fish.length < TANK_FISH_CAP);
    if (ti === -1) return;
    const n = Math.min(box.count, TANK_FISH_CAP - s.tanks[ti].fish.length);
    for (let i = 0; i < n; i++) { const { q, rare } = rollFishQuality(); s.tanks[ti].fish.push({ id: box.itemId, q, rare }); }
    box.count -= n;
    game.tankUnits[ti].syncFish(s.tanks[ti].fish);
  } else if (it.kind === "coral") {
    const ri = s.fragRacks.findIndex((rk) => rk.frags.length < FRAG_CAP);
    if (ri === -1) return;
    const n = Math.min(box.count, FRAG_CAP - s.fragRacks[ri].frags.length);
    for (let i = 0; i < n; i++) s.fragRacks[ri].frags.push({ id: box.itemId, growth: 0, rare: false });
    box.count -= n;
    game.fragRackUnits[ri].syncFrags(s.fragRacks[ri].frags);
  } else {
    let moved = 0;
    for (const [si, shelf] of s.shelves.entries()) {
      for (const row of shelf.rows) {
        if (box.count <= 0) break;
        if (row.product === box.itemId || (!row.product && row.count === 0)) {
          row.product = box.itemId;
          const n = Math.min(box.count, ROW_CAP - row.count);
          row.count += n; box.count -= n; moved += n;
        }
      }
      if (moved) game.shelfUnits[si].syncStock(shelf.rows);
      if (box.count <= 0) break;
    }
    if (moved === 0) return;
  }
  if (box.count <= 0) {
    s.boxes.splice(0, 1);
    game.scene.remove(box.mesh);
    const i = game.interactables.indexOf(box.mesh);
    if (i >= 0) game.interactables.splice(i, 1);
  }
};

const staffTimers = { cashier: 0, aquarist: 0, stocker: 0 };
function updateStaff(dt) {
  const s = game.state;
  for (const id in game.staffMeshes) {
    const m = game.staffMeshes[id];
    m.userData.bob += dt * 2;
    m.position.y = Math.abs(Math.sin(m.userData.bob)) * 0.02;
  }
  if (s.staff.cashier && game.checkout.customer) {
    staffTimers.cashier -= dt;
    if (staffTimers.cashier <= 0) {
      staffTimers.cashier = 0.7;
      const next = game.checkout.items.find((i) => !i.scanned);
      if (next) { game.checkout.scan(next); game.ui.updateCheckout(); }
      else game.checkout.charge();
    }
  }
  if (s.staff.aquarist) {
    staffTimers.aquarist -= dt;
    if (staffTimers.aquarist <= 0) {
      staffTimers.aquarist = 3.5;
      let lo = -1, loCare = 90;
      s.tanks.forEach((t, i) => { if (t.care < loCare) { loCare = t.care; lo = i; } });
      if (lo !== -1) { s.tanks[lo].care = 100; game.tankUnits[lo].setCare(100); }
    }
  }
  if (s.staff.stocker) {
    staffTimers.stocker -= dt;
    if (staffTimers.stocker <= 0) { staffTimers.stocker = 2.5; game.autoStock(); }
  }
}

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

game.addFragRackUnit = (initial = false) => {
  const idx = game.fragRackUnits.length;
  const unit = new FragRack(game.scene, game.colliders, idx);
  game.fragRackUnits.push(unit);
  game.interactables.push(unit.hit);
  if (!initial) game.state.fragRacksOwned = game.fragRackUnits.length;
  if (!game.state.fragRacks[idx]) game.state.fragRacks[idx] = { frags: [] };
  unit.syncFrags(game.state.fragRacks[idx].frags);
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
  const wages = STAFF.reduce((sum, st) => sum + (s.staff[st.id] ? st.wage : 0), 0);
  const stats = { ...s.stats };
  const goal = s.goal;
  const goalMet = stats.revenue >= goal;
  const bonus = goalMet ? Math.round(goal * 0.2) + 25 : 0;
  s.cash -= rent + wages;
  if (bonus) s.cash += bonus;
  if (goalMet) s.lifetime.goals++;
  s.day++;
  s.time = 0;
  s.stats = freshStats();
  s.goal = goalFor(s.level, s.day);
  game.customers.clearAll();
  game.checkout?.clear();
  game.ui.showSummary(s.day - 1, stats, rent, goal, goalMet, bonus, wages);
  if (goalMet) game.ui.toast(`🎯 Daily goal hit! Bonus +$${bonus}`, "good");
  if (s.cash < 0) game.ui.toast("⚠️ You're in the red — sell hard tomorrow!", "bad");
  game.checkAchievements();
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
  game.renderer.toneMappingExposure = 1.1;
  game.scene.fog = new THREE.Fog(0x9ed4e8, 28, 60);
  const isTouch = matchMedia("(pointer: coarse)").matches;
  game.renderer.shadowMap.enabled = !isTouch;
  game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Image-based lighting: a soft room environment gives subtle reflections to
  // the PBR surfaces (glass, water, metal trim) so nothing looks flat.
  const pmrem = new THREE.PMREMGenerator(game.renderer);
  game.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // HDR bloom so emissive surfaces (tank backlights, neon coral, light strips,
  // the register screen) actually glow. Desktop only — too costly on phones.
  if (!isTouch) {
    const composer = new EffectComposer(game.renderer);
    composer.addPass(new RenderPass(game.scene, game.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    game.composer = composer;
    game.bloom = bloom;
  }

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
  game.featureTank = new FeatureTank(game.scene, game.colliders, 6.4, 3.0);

  game.sound = new Sound();
  game.ui = new UI(game);
  game.player = new Player(game);
  game.customers = new CustomerManager(game);
  game.checkout = new Checkout(game);

  for (let i = 0; i < game.state.tanksOwned; i++) game.addTankUnit(true);
  for (let i = 0; i < game.state.shelvesOwned; i++) game.addShelfUnit(true);
  for (let i = 0; i < game.state.fragRacksOwned; i++) game.addFragRackUnit(true);

  // restore hired staff figures
  for (const def of STAFF) if (game.state.staff[def.id]) game.spawnStaffMesh(def.id, def);

  // restore boxes lying around
  const savedBoxes = game.state.boxes;
  game.state.boxes = [];
  for (const b of savedBoxes) {
    game.spawnBox(b.itemId, b.count, new THREE.Vector3(b.x, 0.21, b.z));
  }

  if (isNew) game.ui.showIntro();
  if (game.state._offlineMin) {
    setTimeout(() => game.ui.toast(`🪸 While you were away (~${game.state._offlineMin} min), your coral grew!`, "good"), 800);
    game.state._offlineMin = 0;
  }

  addEventListener("resize", () => {
    game.camera.aspect = innerWidth / innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(innerWidth, innerHeight);
    game.composer?.setSize(innerWidth, innerHeight);
  });
  game._saveTimer = setInterval(game.save, 10000);
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
    updateStaff(dt);
    game.featureTank.update(dt);
    game.updateCoral(dt);
    for (const t of game.tankUnits) t.update(dt);
  }

  game.player.update(dt);
  game.ui.updateHUD();
  game.ui.updateCheckout();
  if (game.composer) game.composer.render();
  else game.renderer.render(game.scene, game.camera);
}

// Load the fish sprite pack first; init() falls back to procedural art if
// any asset fails to load, so we run it regardless of the outcome.
Promise.all([loadFishAssets(), loadCharacterModel(), loadCounterModel()]).then(init, init);
