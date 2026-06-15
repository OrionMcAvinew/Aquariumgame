// Customer NPCs: spawn, browse for wanted items, take stock, queue, pay, leave.
import {
  item, CATALOG, MAX_CUSTOMERS, QUEUE_PATIENCE, CARE_SELL_MIN,
  TANK_SLOTS, SHELF_SLOTS, FRAGRACK_SLOTS, tankBrowseSpot, shelfBrowseSpot, fragBrowseSpot,
  QUEUE_SPOTS, DOOR_IN, SPAWN, AISLE_X, ROW_CAP, TANK_FISH_CAP,
} from "./data.js";
import { createCustomerMesh } from "./world.js";

const WALK_SPEED = 1.7;

let nextId = 1;

class Customer {
  constructor(game, wants) {
    this.game = game;
    this.id = nextId++;
    this.wants = wants;          // [itemId, ...] still to look for
    this.cart = [];              // [{ id, label, price, scanned }]
    this.mesh = createCustomerMesh();
    this.mesh.position.set(SPAWN.x + (Math.random() - 0.5) * 1.5, 0, SPAWN.z);
    this.limbs = this.mesh.userData.limbs;
    this.mixer = this.mesh.userData.mixer || null; // animated model?
    this.actions = this.mesh.userData.actions || null;
    this._anim = "idle";
    game.scene.add(this.mesh);
    this.state = "walk";
    this.path = [{ x: DOOR_IN.x, z: DOOR_IN.z }];
    this.onArrive = () => this.nextWant();
    this.browseTimer = 0;
    this.pendingTake = null;
    this.queueIndex = -1;
    this.patience = QUEUE_PATIENCE;
    this.walkPhase = Math.random() * 6;
  }

  /* ---- routing: walk via the central aisle so we don't cut through furniture ---- */
  routeTo(x, z) {
    const p = this.mesh.position;
    const path = [];
    if (Math.abs(p.x - AISLE_X) > 0.3) path.push({ x: AISLE_X, z: p.z });
    path.push({ x: AISLE_X, z });
    path.push({ x, z });
    this.path = path;
    this.state = "walk";
  }

  // Direct walk (no aisle detour) — used for shuffling forward in the queue,
  // which is a straight column at x = 3.3.
  routeStraight(x, z) {
    this.path = [{ x, z }];
    this.state = "walk";
  }

  nextWant() {
    const g = this.game;
    while (this.wants.length > 0) {
      const id = this.wants.shift();
      const it = item(id);
      let spot = null;
      if (it.kind === "fish") {
        const ti = g.state.tanks.findIndex(
          (t) => t.care >= CARE_SELL_MIN && t.fish.includes(id)
        );
        if (ti !== -1) {
          spot = tankBrowseSpot(TANK_SLOTS[ti]);
          this.pendingTake = { kind: "fish", id, tankIdx: ti };
        }
      } else if (it.kind === "coral") {
        const ri = g.state.fragRacks.findIndex((rk) => rk.frags.includes(id));
        if (ri !== -1) {
          spot = fragBrowseSpot(FRAGRACK_SLOTS[ri]);
          this.pendingTake = { kind: "coral", id, rackIdx: ri };
        }
      } else {
        const si = g.state.shelves.findIndex(
          (s) => s.rows.some((r) => r.product === id && r.count > 0)
        );
        if (si !== -1) {
          spot = shelfBrowseSpot(SHELF_SLOTS[si]);
          this.pendingTake = { kind: "product", id, shelfIdx: si };
        }
      }
      if (spot) {
        this.routeTo(spot.x, spot.z);
        this.onArrive = () => {
          this.state = "browse";
          this.browseTimer = 1.2 + Math.random() * 1.6;
        };
        return;
      }
      // not in stock — they wanted it, we missed the sale
      g.state.stats.missed++;
    }
    // done shopping
    if (this.cart.length > 0) this.joinQueue();
    else this.leave();
  }

  takeItem() {
    const g = this.game;
    const t = this.pendingTake;
    this.pendingTake = null;
    if (!t) return this.nextWant();
    const price = g.state.prices[t.id];

    if (t.kind === "fish") {
      const tank = g.state.tanks[t.tankIdx];
      const i = tank.fish.indexOf(t.id);
      if (i !== -1 && tank.care >= CARE_SELL_MIN) {
        tank.fish.splice(i, 1);
        g.tankUnits[t.tankIdx].syncFish(tank.fish);
        this.cart.push({ id: t.id, label: item(t.id).name, price, scanned: false });
      }
    } else if (t.kind === "coral") {
      const rk = g.state.fragRacks[t.rackIdx];
      const i = rk.frags.indexOf(t.id);
      if (i !== -1) {
        rk.frags.splice(i, 1);
        g.fragRackUnits[t.rackIdx].syncFrags(rk.frags);
        this.cart.push({ id: t.id, label: item(t.id).name, price, scanned: false });
      }
    } else {
      const shelf = g.state.shelves[t.shelfIdx];
      const row = shelf.rows.find((r) => r.product === t.id && r.count > 0);
      if (row) {
        row.count--;
        if (row.count === 0) row.product = null;
        g.shelfUnits[t.shelfIdx].syncStock(shelf.rows);
        this.cart.push({ id: t.id, label: item(t.id).name, price, scanned: false });
      }
    }
    if (this.cart.length > 0 && this.mesh.userData.basket) {
      this.mesh.userData.basket.visible = true;
    }
    this.nextWant();
  }

  joinQueue() {
    const mgr = this.game.customers;
    mgr.queue.push(this);
    this.queueIndex = mgr.queue.length - 1;
    this.patience = QUEUE_PATIENCE;
    const spot = QUEUE_SPOTS[Math.min(this.queueIndex, QUEUE_SPOTS.length - 1)];
    this.routeTo(spot.x, spot.z);
    this.onArrive = () => { this.state = "queue"; };
  }

  leave() {
    const mgr = this.game.customers;
    const qi = mgr.queue.indexOf(this);
    if (qi !== -1) { mgr.queue.splice(qi, 1); mgr.reflowQueue(); }
    this.routeTo(DOOR_IN.x, DOOR_IN.z);
    this.onArrive = () => {
      this.path = [{ x: SPAWN.x, z: SPAWN.z }];
      this.state = "walk";
      this.onArrive = () => { this.state = "gone"; };
    };
  }

  // queue gave up: put unscanned items back where they fit
  abandon() {
    const g = this.game;
    for (const c of this.cart) {
      const it = item(c.id);
      if (it.kind === "fish") {
        const ti = g.state.tanks.findIndex((t) => t.fish.length < TANK_FISH_CAP);
        if (ti !== -1) { g.state.tanks[ti].fish.push(c.id); g.tankUnits[ti].syncFish(g.state.tanks[ti].fish); }
      } else if (it.kind === "coral") {
        const ri = g.state.fragRacks.findIndex((rk) => rk.frags.length < 18);
        if (ri !== -1) { g.state.fragRacks[ri].frags.push(c.id); g.fragRackUnits[ri].syncFrags(g.state.fragRacks[ri].frags); }
      } else {
        outer: for (const [si, s] of g.state.shelves.entries()) {
          for (const r of s.rows) {
            if ((r.product === c.id && r.count < ROW_CAP) || (!r.product && r.count === 0)) {
              r.product = c.id; r.count++;
              g.shelfUnits[si].syncStock(s.rows);
              break outer;
            }
          }
        }
      }
    }
    this.cart = [];
    g.state.stats.lost++;
    g.ui.toast("😠 A customer gave up waiting in line!", "bad");
    this.leave();
  }

  // crossfade the model's animation clips
  setAction(name) {
    if (!this.actions || this._anim === name) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.actions[this._anim];
    next.reset().fadeIn(0.2).play();
    if (prev) prev.fadeOut(0.2);
    this._anim = name;
  }

  animateLimbs(swing, dt) {
    const L = this.limbs;
    if (!L) return;
    const ease = (cur, to) => cur + (to - cur) * Math.min(1, dt * 10);
    L.legL.rotation.x = ease(L.legL.rotation.x, swing);
    L.legR.rotation.x = ease(L.legR.rotation.x, -swing);
    L.armL.rotation.x = ease(L.armL.rotation.x, -swing);
    L.armR.rotation.x = ease(L.armR.rotation.x, swing);
  }

  update(dt) {
    const p = this.mesh.position;
    if (this.mixer) this.mixer.update(dt);

    if (this.state === "walk") {
      const wp = this.path[0];
      if (!wp) { this.onArrive?.(); return; }
      const dx = wp.x - p.x, dz = wp.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        this.path.shift();
        if (this.path.length === 0) this.onArrive?.();
      } else {
        p.x += (dx / d) * WALK_SPEED * dt;
        p.z += (dz / d) * WALK_SPEED * dt;
        this.mesh.rotation.y = Math.atan2(dx, dz);
        if (this.mixer) {
          this.setAction("walk"); // model has its own gait + foot motion
        } else {
          this.walkPhase += dt * 9;
          p.y = Math.abs(Math.sin(this.walkPhase)) * 0.045;
          this.animateLimbs(Math.sin(this.walkPhase) * 0.6, dt);
        }
      }
    } else {
      if (this.mixer) this.setAction("idle");
      else { p.y *= 0.8; this.animateLimbs(0, dt); } // ease limbs back to rest when standing
    }

    if (this.state === "browse") {
      this.browseTimer -= dt;
      if (this.browseTimer <= 0) this.takeItem();
    }

    if (this.state === "queue" || this.state === "atCounter") {
      if (this.state === "queue" && this.queueIndex === 0) {
        this.state = "atCounter";
        this.mesh.rotation.y = Math.PI; // face the counter/player
      }
      this.patience -= dt;
      if (this.patience <= 0) this.abandon();
    }
  }
}

export class CustomerManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.queue = [];
    this.spawnTimer = 4; // first customer arrives quickly
  }

  spawnInterval() {
    const lvl = this.game.state.level;
    const base = 8 + Math.random() * 9;
    return base / Math.min(2.4, 0.85 + lvl * 0.18);
  }

  pickWants() {
    const g = this.game;
    const unlocked = CATALOG.filter((c) => c.level <= g.state.level);
    const stocked = unlocked.filter((c) =>
      c.kind === "fish"
        ? g.state.tanks.some((t) => t.fish.includes(c.id) && t.care >= CARE_SELL_MIN)
        : c.kind === "coral"
          ? g.state.fragRacks.some((rk) => rk.frags.includes(c.id))
          : g.state.shelves.some((s) => s.rows.some((r) => r.product === c.id && r.count > 0))
    );
    const n = 1 + Math.floor(Math.random() * Math.random() * 3);
    const wants = [];
    for (let i = 0; i < n; i++) {
      const pool = stocked.length && Math.random() < 0.72 ? stocked : unlocked;
      const it = pool[(Math.random() * pool.length) | 0];
      // price sensitivity: overpriced goods get skipped at the door
      const ratio = g.state.prices[it.id] / it.market;
      if (ratio > 2.2) { g.state.stats.priceSkips++; continue; }
      if (ratio > 1.6 && Math.random() < 0.6) { g.state.stats.priceSkips++; continue; }
      wants.push(it.id);
    }
    return wants;
  }

  update(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.list.length < MAX_CUSTOMERS) {
      this.spawnTimer = this.spawnInterval();
      const wants = this.pickWants();
      if (wants.length > 0 || Math.random() < 0.25) {
        this.list.push(new Customer(this.game, wants));
      }
    }

    for (const c of this.list) c.update(dt);

    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].state === "gone") {
        this.game.scene.remove(this.list[i].mesh);
        this.list.splice(i, 1);
      }
    }
  }

  reflowQueue() {
    this.queue.forEach((c, i) => {
      c.queueIndex = i;
      const spot = QUEUE_SPOTS[Math.min(i, QUEUE_SPOTS.length - 1)];
      // step straight forward in the column — no detour through the aisle
      if (c.state === "queue" || c.state === "atCounter" || c.state === "walk") {
        c.routeStraight(spot.x, spot.z);
        c.onArrive = () => { c.state = "queue"; };
      }
    });
  }

  atCounter() {
    const c = this.queue[0];
    return c && c.state === "atCounter" ? c : null;
  }

  // checkout actions, driven by the UI
  scanNext(customer) {
    const next = customer.cart.find((i) => !i.scanned);
    if (next) {
      next.scanned = true;
      this.game.sound.scan();
    }
    return customer.cart.every((i) => i.scanned);
  }

  takePayment(customer) {
    const g = this.game;
    if (!customer.cart.every((i) => i.scanned)) return;
    const total = customer.cart.reduce((s, i) => s + i.price, 0);
    g.state.cash += total;
    g.state.stats.revenue += total;
    g.state.stats.sold += customer.cart.length;
    g.state.stats.served++;
    g.state.lifetime.revenue += total;
    g.state.lifetime.sold += customer.cart.length;
    g.state.lifetime.served++;
    g.addXP(total); // also runs achievement checks
    g.sound.chaching();
    g.ui.toast(`💰 Sale: $${total}`, "good");
    customer.cart = [];
    this.queue.shift();
    this.reflowQueue();
    customer.leave();
    g.save();
  }

  clearAll() {
    for (const c of this.list) this.game.scene.remove(c.mesh);
    this.list = [];
    this.queue = [];
    this.spawnTimer = 5;
  }
}
