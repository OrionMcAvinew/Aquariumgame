"use strict";

/* =========================================================
   Fin & Fortune — Aquarium Store Sim
   Vanilla JS. State ticks once per second; fish swim on rAF.
   ========================================================= */

const SAVE_KEY = "finfortune-save-v1";
const TICKS_PER_DAY = 60;
const TANK_CAPACITY = 6;
const MAX_TANKS = 8;
const CUSTOMER_PATIENCE = 18; // ticks
const MAX_CUSTOMERS = 5;

const SPECIES = [
  { id: "guppy",     name: "Guppy",       emoji: "🐟", cost: 3,   price: 8,   repReq: 0 },
  { id: "goldfish",  name: "Goldfish",    emoji: "🐠", cost: 5,   price: 13,  repReq: 0 },
  { id: "tetra",     name: "Neon Tetra",  emoji: "🐟", cost: 4,   price: 11,  repReq: 5 },
  { id: "betta",     name: "Betta",       emoji: "🐠", cost: 8,   price: 21,  repReq: 12 },
  { id: "angelfish", name: "Angelfish",   emoji: "🐡", cost: 12,  price: 30,  repReq: 20 },
  { id: "clownfish", name: "Clownfish",   emoji: "🐠", cost: 16,  price: 40,  repReq: 30 },
  { id: "puffer",    name: "Pufferfish",  emoji: "🐡", cost: 22,  price: 55,  repReq: 45 },
  { id: "seahorse",  name: "Seahorse",    emoji: "🦄", cost: 32,  price: 80,  repReq: 65 },
  { id: "shark",     name: "Baby Shark",  emoji: "🦈", cost: 100, price: 260, repReq: 90 },
];

const CUSTOMER_FACES = ["🧑", "👩", "👨", "👵", "👴", "🧒", "👧", "👦", "🧔", "👱"];

const TANK_UPGRADES = {
  filter: { label: "Filter",     emoji: "🌀", cost: 80,  desc: "Halves how fast the tank gets dirty" },
  feeder: { label: "Auto-feeder",emoji: "⏲️", cost: 120, desc: "Feeds the tank automatically" },
  deco:   { label: "Decoration", emoji: "🪸", cost: 60,  desc: "Fish from this tank sell for 20% more" },
};

let state = null;
let placingSpecies = null; // species id while choosing a tank
let fishIdCounter = 0;
let customerIdCounter = 0;
let knownRep = 0; // for unlock toasts

/* ---------------- State ---------------- */

function newTank() {
  return { fish: [], clean: 100, food: 100, filter: false, feeder: false, deco: false };
}

function newGame() {
  return {
    cash: 60,
    rep: 0,
    day: 1,
    tick: 0,
    tanks: [newTank(), newTank()],
    customers: [],
  };
}

function newFish(speciesId) {
  return {
    id: ++fishIdCounter,
    species: speciesId,
    health: 100,
    // swim state (not saved)
    x: Math.random(), y: Math.random() * 0.7 + 0.1,
    vx: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.08),
    vy: 0,
  };
}

function speciesById(id) {
  return SPECIES.find((s) => s.id === id);
}

function tankCost() {
  return Math.round(150 * Math.pow(1.6, state.tanks.length - 2));
}

/* ---------------- Save / Load ---------------- */

function save() {
  const data = {
    cash: state.cash, rep: state.rep, day: state.day, tick: state.tick,
    tanks: state.tanks.map((t) => ({
      clean: t.clean, food: t.food, filter: t.filter, feeder: t.feeder, deco: t.deco,
      fish: t.fish.map((f) => ({ species: f.species, health: f.health })),
    })),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const s = newGame();
    s.cash = data.cash; s.rep = data.rep; s.day = data.day; s.tick = data.tick || 0;
    s.tanks = data.tanks.map((t) => {
      const tank = newTank();
      Object.assign(tank, { clean: t.clean, food: t.food, filter: t.filter, feeder: t.feeder, deco: t.deco });
      tank.fish = t.fish.map((f) => Object.assign(newFish(f.species), { health: f.health }));
      return tank;
    });
    return s;
  } catch (e) {
    return null;
  }
}

/* ---------------- Game logic (1s tick) ---------------- */

function gameTick() {
  state.tick++;

  // Day rollover & rent
  if (state.tick >= TICKS_PER_DAY) {
    state.tick = 0;
    state.day++;
    const rent = 5 + state.tanks.length * 5;
    state.cash -= rent;
    toast(`📅 Day ${state.day} — paid $${rent} rent.`, state.cash < 0 ? "bad" : "");
    if (state.cash < 0) {
      toast("⚠️ You're in debt! Sell some fish fast.", "bad");
    }
  }

  // Tanks
  for (const tank of state.tanks) {
    const load = tank.fish.length;
    if (load > 0) {
      tank.clean = Math.max(0, tank.clean - load * 0.7 * (tank.filter ? 0.5 : 1));
      tank.food = Math.max(0, tank.food - load * 1.1);
    }
    if (tank.feeder && tank.food < 30 && tank.fish.length > 0) {
      tank.food = 100;
    }
    // Fish health
    for (let i = tank.fish.length - 1; i >= 0; i--) {
      const fish = tank.fish[i];
      let delta = 2; // recovers in good conditions
      if (tank.clean < 40) delta -= 4;
      if (tank.food < 20) delta -= 5;
      fish.health = Math.min(100, Math.max(0, fish.health + delta));
      if (fish.health <= 0) {
        tank.fish.splice(i, 1);
        state.rep = Math.max(0, state.rep - 2);
        toast(`💀 A ${speciesById(fish.species).name} died! Reputation -2.`, "bad");
        rebuildTanks();
      }
    }
  }

  // Customers: patience + spawning
  for (let i = state.customers.length - 1; i >= 0; i--) {
    const c = state.customers[i];
    c.patience--;
    if (c.patience <= 0) {
      state.customers.splice(i, 1);
      state.rep = Math.max(0, state.rep - 1);
      toast(`😞 A customer left without their ${speciesById(c.species).name}. Reputation -1.`, "bad");
      renderCustomers();
    }
  }
  const spawnChance = Math.min(0.35, 0.08 + state.rep * 0.002);
  if (state.customers.length < MAX_CUSTOMERS && Math.random() < spawnChance) {
    spawnCustomer();
  }

  checkUnlocks();
  renderHUD();
  updateTankMeters();
  updateCustomerPatience();
  refreshShopAffordability();
}

function spawnCustomer() {
  const unlocked = SPECIES.filter((s) => s.repReq <= state.rep);
  const stocked = unlocked.filter((s) =>
    state.tanks.some((t) => t.fish.some((f) => f.species === s.id))
  );
  // Prefer species you actually have, so most customers are servable
  const pool = stocked.length > 0 && Math.random() < 0.7 ? stocked : unlocked;
  const species = pool[Math.floor(Math.random() * pool.length)];
  const offer = Math.round(species.price * (0.9 + Math.random() * 0.25));
  state.customers.push({
    id: ++customerIdCounter,
    face: CUSTOMER_FACES[Math.floor(Math.random() * CUSTOMER_FACES.length)],
    species: species.id,
    offer,
    patience: CUSTOMER_PATIENCE,
  });
  renderCustomers();
}

function serveCustomer(customerId) {
  const idx = state.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return;
  const customer = state.customers[idx];

  // Find the healthiest fish of the wanted species across all tanks
  let best = null;
  for (const tank of state.tanks) {
    for (const fish of tank.fish) {
      if (fish.species === customer.species && (!best || fish.health > best.fish.health)) {
        best = { tank, fish };
      }
    }
  }
  if (!best) {
    toast(`You don't have a ${speciesById(customer.species).name} in stock!`, "bad");
    return;
  }
  if (best.fish.health < 35) {
    toast(`Your ${speciesById(customer.species).name} looks too sick to sell. Nurse it back first!`, "bad");
    return;
  }

  const price = Math.round(customer.offer * (best.tank.deco ? 1.2 : 1));
  best.tank.fish.splice(best.tank.fish.indexOf(best.fish), 1);
  state.customers.splice(idx, 1);
  state.cash += price;
  state.rep = Math.min(100, state.rep + 1);
  toast(`💰 Sold a ${speciesById(customer.species).name} for $${price}! Reputation +1.`, "good");
  renderCustomers();
  rebuildTanks();
  renderHUD();
  save();
}

function checkUnlocks() {
  for (const s of SPECIES) {
    if (s.repReq > knownRep && s.repReq <= state.rep) {
      toast(`🎉 New species unlocked: ${s.emoji} ${s.name}!`, "good");
      renderShop();
    }
  }
  knownRep = Math.max(knownRep, state.rep);
}

/* ---------------- Player actions ---------------- */

function startBuying(speciesId) {
  const species = speciesById(speciesId);
  if (state.cash < species.cost) return;
  if (!state.tanks.some((t) => t.fish.length < TANK_CAPACITY)) {
    toast("All tanks are full! Buy another tank or sell some fish.", "bad");
    return;
  }
  placingSpecies = speciesId;
  document.getElementById("placing-hint").classList.remove("hidden");
  rebuildTanks();
}

function cancelBuying() {
  placingSpecies = null;
  document.getElementById("placing-hint").classList.add("hidden");
  rebuildTanks();
}

function placeFish(tankIndex) {
  const species = speciesById(placingSpecies);
  const tank = state.tanks[tankIndex];
  if (!species || !tank || tank.fish.length >= TANK_CAPACITY || state.cash < species.cost) return;
  state.cash -= species.cost;
  tank.fish.push(newFish(species.id));
  toast(`${species.emoji} Added a ${species.name} to Tank ${tankIndex + 1}.`);
  cancelBuying();
  renderHUD();
  save();
}

function feedTank(i) {
  const tank = state.tanks[i];
  if (state.cash < 2 || tank.fish.length === 0) return;
  state.cash -= 2;
  tank.food = 100;
  renderHUD();
  updateTankMeters();
}

function cleanTank(i) {
  state.tanks[i].clean = 100;
  updateTankMeters();
}

function buyTankUpgrade(i, key) {
  const tank = state.tanks[i];
  const upgrade = TANK_UPGRADES[key];
  if (tank[key] || state.cash < upgrade.cost) return;
  state.cash -= upgrade.cost;
  tank[key] = true;
  toast(`${upgrade.emoji} ${upgrade.label} installed on Tank ${i + 1}.`, "good");
  rebuildTanks();
  renderHUD();
  save();
}

function buyTank() {
  if (state.tanks.length >= MAX_TANKS || state.cash < tankCost()) return;
  state.cash -= tankCost();
  state.tanks.push(newTank());
  toast(`🛒 New tank installed! You now have ${state.tanks.length}.`, "good");
  rebuildTanks();
  renderStoreUpgrades();
  renderHUD();
  save();
}

/* ---------------- Rendering ---------------- */

const el = (id) => document.getElementById(id);

function renderHUD() {
  el("hud-cash").textContent = `$${state.cash}`;
  el("hud-cash").parentElement.style.color = state.cash < 0 ? "var(--bad)" : "";
  el("hud-rep").textContent = state.rep;
  el("hud-day").textContent = state.day;
  el("day-progress-fill").style.width = `${(state.tick / TICKS_PER_DAY) * 100}%`;
}

function meterClass(v) {
  return v > 55 ? "good" : v > 25 ? "warn" : "bad";
}

function rebuildTanks() {
  const grid = el("tanks-grid");
  grid.innerHTML = "";
  state.tanks.forEach((tank, i) => {
    const card = document.createElement("div");
    card.className = "tank-card";
    card.dataset.tank = i;

    if (placingSpecies !== null) {
      if (tank.fish.length < TANK_CAPACITY) {
        card.classList.add("placeable");
        card.addEventListener("click", () => placeFish(i));
      } else {
        card.classList.add("tank-full-placing");
      }
    }

    const badges =
      (tank.filter ? TANK_UPGRADES.filter.emoji : "") +
      (tank.feeder ? TANK_UPGRADES.feeder.emoji : "") +
      (tank.deco ? TANK_UPGRADES.deco.emoji : "");

    card.innerHTML = `
      <div class="tank-head">
        <span>Tank ${i + 1} · ${tank.fish.length}/${TANK_CAPACITY} fish</span>
        <span class="tank-badges">${badges}</span>
      </div>
      <div class="tank-water">
        ${tank.deco ? '<span style="position:absolute;bottom:8px;left:12px;font-size:1.3rem;">🪸</span><span style="position:absolute;bottom:8px;right:16px;font-size:1.1rem;">🌿</span>' : ""}
        <div class="gravel"></div>
        ${tank.fish.length === 0 ? '<div class="tank-empty-label">Empty tank</div>' : ""}
      </div>
      <div class="tank-meters">
        <div class="meter"><span class="meter-label">Clean</span>
          <div class="meter-track"><div class="meter-fill clean-fill"></div></div></div>
        <div class="meter"><span class="meter-label">Food</span>
          <div class="meter-track"><div class="meter-fill food-fill"></div></div></div>
      </div>
      <div class="tank-actions"></div>
    `;

    // Bubbles
    const water = card.querySelector(".tank-water");
    for (let b = 0; b < 3; b++) {
      const bubble = document.createElement("span");
      bubble.className = "bubble";
      bubble.style.left = `${10 + Math.random() * 80}%`;
      bubble.style.animationDuration = `${2.5 + Math.random() * 3}s`;
      bubble.style.animationDelay = `${Math.random() * 3}s`;
      water.appendChild(bubble);
    }

    // Fish sprites
    for (const fish of tank.fish) {
      const sprite = document.createElement("span");
      sprite.className = "fish-sprite";
      sprite.dataset.fishId = fish.id;
      sprite.textContent = speciesById(fish.species).emoji;
      water.appendChild(sprite);
      fish._el = sprite;
    }

    // Actions
    const actions = card.querySelector(".tank-actions");
    const feedBtn = document.createElement("button");
    feedBtn.className = "btn btn-small btn-primary";
    feedBtn.textContent = "🍽️ Feed $2";
    feedBtn.addEventListener("click", (e) => { e.stopPropagation(); feedTank(i); });
    actions.appendChild(feedBtn);

    const cleanBtn = document.createElement("button");
    cleanBtn.className = "btn btn-small";
    cleanBtn.textContent = "🧽 Clean";
    cleanBtn.addEventListener("click", (e) => { e.stopPropagation(); cleanTank(i); });
    actions.appendChild(cleanBtn);

    for (const [key, upgrade] of Object.entries(TANK_UPGRADES)) {
      if (tank[key]) continue;
      const btn = document.createElement("button");
      btn.className = "btn btn-small";
      btn.title = upgrade.desc;
      btn.textContent = `${upgrade.emoji} ${upgrade.label} $${upgrade.cost}`;
      btn.addEventListener("click", (e) => { e.stopPropagation(); buyTankUpgrade(i, key); });
      actions.appendChild(btn);
    }

    grid.appendChild(card);
  });
  updateTankMeters();
}

function updateTankMeters() {
  document.querySelectorAll(".tank-card").forEach((card) => {
    const tank = state.tanks[+card.dataset.tank];
    if (!tank) return;
    const cleanFill = card.querySelector(".clean-fill");
    const foodFill = card.querySelector(".food-fill");
    cleanFill.style.width = `${tank.clean}%`;
    cleanFill.className = `meter-fill clean-fill ${meterClass(tank.clean)}`;
    foodFill.style.width = `${tank.food}%`;
    foodFill.className = `meter-fill food-fill ${meterClass(tank.food)}`;

    const water = card.querySelector(".tank-water");
    water.classList.toggle("dirty-1", tank.clean < 55 && tank.clean >= 25);
    water.classList.toggle("dirty-2", tank.clean < 25);

    for (const fish of tank.fish) {
      if (!fish._el) continue;
      const sick = fish.health < 50;
      fish._el.classList.toggle("sick", sick);
      fish._el.title = `${speciesById(fish.species).name} — health ${Math.round(fish.health)}%`;
      let mark = fish._el.querySelector(".sick-mark");
      if (sick && !mark) {
        mark = document.createElement("span");
        mark.className = "sick-mark";
        mark.textContent = "🤢";
        fish._el.appendChild(mark);
      } else if (!sick && mark) {
        mark.remove();
      }
    }
  });
}

function renderCustomers() {
  const queue = el("customer-queue");
  queue.innerHTML = "";
  if (state.customers.length === 0) {
    queue.innerHTML = '<div class="customer-empty">The shop is quiet… for now.</div>';
    return;
  }
  for (const c of state.customers) {
    const species = speciesById(c.species);
    const inStock = state.tanks.some((t) => t.fish.some((f) => f.species === c.species));
    const card = document.createElement("div");
    card.className = "customer-card" + (inStock ? "" : " unavailable");
    card.dataset.customerId = c.id;
    card.title = inStock ? "Click to sell!" : `You have no ${species.name} in stock`;
    card.innerHTML = `
      <div class="customer-face">${c.face}</div>
      <div class="customer-wants">wants ${species.emoji} ${species.name}</div>
      <div class="customer-offer">$${c.offer}</div>
      <div class="patience-bar"><div class="patience-fill" style="width:${(c.patience / CUSTOMER_PATIENCE) * 100}%"></div></div>
    `;
    card.addEventListener("click", () => serveCustomer(c.id));
    queue.appendChild(card);
  }
}

function updateCustomerPatience() {
  document.querySelectorAll(".customer-card").forEach((card) => {
    const c = state.customers.find((x) => x.id === +card.dataset.customerId);
    if (!c) return;
    const fill = card.querySelector(".patience-fill");
    const pct = (c.patience / CUSTOMER_PATIENCE) * 100;
    fill.style.width = `${pct}%`;
    fill.classList.toggle("low", pct < 35);
    const species = speciesById(c.species);
    const inStock = state.tanks.some((t) => t.fish.some((f) => f.species === c.species));
    card.classList.toggle("unavailable", !inStock);
    card.title = inStock ? "Click to sell!" : `You have no ${species.name} in stock`;
  });
}

function renderShop() {
  const list = el("shop-list");
  list.innerHTML = "";
  for (const s of SPECIES) {
    const unlocked = s.repReq <= state.rep;
    const item = document.createElement("div");
    item.className = "shop-item" + (unlocked ? "" : " locked");
    item.innerHTML = `
      <span class="shop-emoji">${unlocked ? s.emoji : "🔒"}</span>
      <div class="shop-info">
        <div class="shop-name">${s.name}</div>
        ${unlocked
          ? `<div class="shop-prices">Buy $${s.cost} · <span class="sell">sells ~$${s.price}</span></div>`
          : `<div class="lock-req">Unlocks at ⭐ ${s.repReq}</div>`}
      </div>
    `;
    if (unlocked) {
      const btn = document.createElement("button");
      btn.className = "btn btn-small btn-primary";
      btn.dataset.species = s.id;
      btn.textContent = "Buy";
      btn.addEventListener("click", () => startBuying(s.id));
      item.appendChild(btn);
    }
    list.appendChild(item);
  }
  refreshShopAffordability();
}

function refreshShopAffordability() {
  document.querySelectorAll("#shop-list button[data-species]").forEach((btn) => {
    btn.disabled = state.cash < speciesById(btn.dataset.species).cost;
  });
  const tankBtn = document.querySelector("#store-upgrades button");
  if (tankBtn && state.tanks.length < MAX_TANKS) {
    tankBtn.disabled = state.cash < tankCost();
  }
}

function renderStoreUpgrades() {
  const wrap = el("store-upgrades");
  wrap.innerHTML = "";
  const item = document.createElement("div");
  item.className = "upgrade-item";
  if (state.tanks.length >= MAX_TANKS) {
    item.innerHTML = `<span>🛁 Extra tank</span><span style="color:var(--text-dim)">Max reached</span>`;
  } else {
    item.innerHTML = `<span>🛁 Extra tank (${state.tanks.length}/${MAX_TANKS})</span>`;
    const btn = document.createElement("button");
    btn.className = "btn btn-small btn-primary";
    btn.textContent = `$${tankCost()}`;
    btn.addEventListener("click", buyTank);
    item.appendChild(btn);
  }
  wrap.appendChild(item);
  refreshShopAffordability();
}

/* ---------------- Toasts ---------------- */

function toast(message, kind = "") {
  const container = el("toast-container");
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  container.appendChild(node);
  while (container.children.length > 4) container.firstChild.remove();
  setTimeout(() => {
    node.style.transition = "opacity 0.4s";
    node.style.opacity = "0";
    setTimeout(() => node.remove(), 400);
  }, 3500);
}

/* ---------------- Fish swimming (rAF) ---------------- */

let lastFrame = performance.now();

function swimFrame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  for (const tank of state.tanks) {
    for (const fish of tank.fish) {
      const sprite = fish._el;
      if (!sprite || !sprite.parentElement) continue;
      const slowdown = fish.health < 50 ? 0.4 : 1;

      fish.x += fish.vx * dt * slowdown;
      fish.y += fish.vy * dt * slowdown;
      if (fish.x < 0.02) { fish.x = 0.02; fish.vx = Math.abs(fish.vx); }
      if (fish.x > 0.98) { fish.x = 0.98; fish.vx = -Math.abs(fish.vx); }
      if (fish.y < 0.05) { fish.y = 0.05; fish.vy = Math.abs(fish.vy) * 0.5; }
      if (fish.y > 0.82) { fish.y = 0.82; fish.vy = -Math.abs(fish.vy) * 0.5; }
      if (Math.random() < 0.008) fish.vy = (Math.random() - 0.5) * 0.06;
      if (Math.random() < 0.003) fish.vx = -fish.vx;

      const water = sprite.parentElement;
      const w = water.clientWidth - 28;
      const h = water.clientHeight - 28;
      // Fish emoji face left; flip when swimming right
      const flip = fish.vx > 0 ? -1 : 1;
      sprite.style.transform = `translate(${fish.x * w}px, ${fish.y * h}px) scaleX(${flip})`;
    }
  }
  requestAnimationFrame(swimFrame);
}

/* ---------------- Init ---------------- */

function init() {
  state = load() || newGame();
  knownRep = state.rep;

  rebuildTanks();
  renderShop();
  renderStoreUpgrades();
  renderCustomers();
  renderHUD();

  el("btn-help").addEventListener("click", () => el("help-modal").classList.remove("hidden"));
  el("btn-close-help").addEventListener("click", () => el("help-modal").classList.add("hidden"));
  el("help-modal").addEventListener("click", (e) => {
    if (e.target === el("help-modal")) el("help-modal").classList.add("hidden");
  });
  el("btn-reset").addEventListener("click", () => {
    if (confirm("Start over? Your current store will be lost.")) {
      localStorage.removeItem(SAVE_KEY);
      state = newGame();
      knownRep = 0;
      placingSpecies = null;
      el("placing-hint").classList.add("hidden");
      rebuildTanks();
      renderShop();
      renderStoreUpgrades();
      renderCustomers();
      renderHUD();
      toast("🆕 Fresh start! Good luck.", "good");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && placingSpecies !== null) cancelBuying();
  });

  // First visit: show help
  if (!localStorage.getItem(SAVE_KEY)) {
    el("help-modal").classList.remove("hidden");
  }

  setInterval(gameTick, 1000);
  setInterval(save, 5000);
  window.addEventListener("beforeunload", save);
  requestAnimationFrame(swimFrame);
}

init();
