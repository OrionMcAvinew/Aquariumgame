// DOM UI: HUD, interaction prompt, toasts, tablet (orders/prices/store),
// checkout panel, day summary, intro.
import {
  CATALOG, item, xpForLevel, MAX_LEVEL, DAY_LEN, QUEUE_PATIENCE,
  tankPrice, shelfPrice, MAX_TANK_SLOTS, MAX_SHELF_SLOTS, DELIVERY_TIME,
  ACHIEVEMENTS, STAFF, fragRackPrice, MAX_FRAGRACK_SLOTS,
} from "./data.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.orderCart = {}; // itemId -> box qty
    this.checkoutCustomerId = null;

    $("btn-tablet").addEventListener("click", () => this.toggleTablet());
    $("btn-close-tablet").addEventListener("click", () => this.toggleTablet(false));
    $("btn-start-day").addEventListener("click", () => {
      $("summary-modal").classList.add("hidden");
      this.game.paused = false;
      this.game.save();
    });
    $("btn-close-intro").addEventListener("click", () => {
      $("intro-modal").classList.add("hidden");
    });
    for (const tab of document.querySelectorAll(".tab-btn")) {
      tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
    }
    const audioBtn = $("btn-audio");
    audioBtn.textContent = this.game.sound.ambientOn ? "🔊" : "🔇";
    audioBtn.addEventListener("click", () => {
      audioBtn.textContent = this.game.sound.toggleAmbient() ? "🔊" : "🔇";
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.toggleTablet(false);
      const co = this.game.checkout;
      if (co && co.customer && this.game.player.inRegisterZone()) {
        if (e.code === "Space") { e.preventDefault(); co.scan(co.items.find((i) => !i.scanned)); this.updateCheckout(); }
        if (e.key === "Enter") { co.charge(); }
      }
    });
  }

  /* ---------------- HUD ---------------- */

  updateHUD() {
    const s = this.game.state;
    $("hud-cash").textContent = `$${Math.round(s.cash)}`;
    $("hud-cash").classList.toggle("debt", s.cash < 0);
    $("hud-day").textContent = s.day;

    const hour = 9 + (s.time / DAY_LEN) * 12;
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    $("hud-clock").textContent = `${h}:${String(m).padStart(2, "0")}`;

    $("hud-level").textContent = s.level;
    const cur = xpForLevel(s.level), next = xpForLevel(s.level + 1);
    const pct = s.level >= MAX_LEVEL ? 100 : ((s.xp - cur) / (next - cur)) * 100;
    $("xp-fill").style.width = `${Math.min(100, pct)}%`;

    const rev = s.stats.revenue;
    $("hud-rev").textContent = rev;
    $("hud-goal").textContent = s.goal;
    const gpct = Math.min(100, (rev / s.goal) * 100);
    $("goal-fill").style.width = `${gpct}%`;
    $("hud-goal-pill").classList.toggle("met", rev >= s.goal);
  }

  setPrompt(target) {
    const el = $("prompt");
    const btn = $("btn-interact");
    if (target && target.label) {
      const actionable = target.type !== "none";
      el.textContent = actionable && !this.game.player.isTouch
        ? `[E] ${target.label}` : target.label;
      el.classList.remove("hidden");
      btn.classList.toggle("hidden", !actionable);
    } else {
      el.classList.add("hidden");
      btn.classList.add("hidden");
    }
  }

  toast(msg, kind = "") {
    const box = $("toasts");
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), 3800);
  }

  anyModalOpen() {
    return ["tablet", "summary-modal", "intro-modal"].some(
      (id) => !$(id).classList.contains("hidden")
    );
  }

  /* ---------------- Tablet ---------------- */

  toggleTablet(force) {
    const t = $("tablet");
    const open = force !== undefined ? force : t.classList.contains("hidden");
    t.classList.toggle("hidden", !open);
    if (open) {
      document.exitPointerLock?.();
      this.showTab("order");
    }
  }

  showTab(name) {
    for (const b of document.querySelectorAll(".tab-btn"))
      b.classList.toggle("active", b.dataset.tab === name);
    const body = $("tablet-body");
    body.innerHTML = "";
    if (name === "order") this.renderOrderTab(body);
    else if (name === "prices") this.renderPricesTab(body);
    else if (name === "store") this.renderStoreTab(body);
    else if (name === "trophies") this.renderTrophiesTab(body);
    else this.renderHelpTab(body);
  }

  renderTrophiesTab(body) {
    const s = this.game.state;
    const got = s.achievements.length, total = ACHIEVEMENTS.length;
    const note = document.createElement("p");
    note.className = "tab-note";
    note.textContent = `Unlocked ${got} of ${total} achievements.`;
    body.appendChild(note);
    for (const a of ACHIEVEMENTS) {
      const unlocked = s.achievements.includes(a.id);
      const row = document.createElement("div");
      row.className = "order-row" + (unlocked ? "" : " locked");
      row.innerHTML = `
        <span class="swatch" style="background:${unlocked ? "#ffd166" : "#33445a"};display:flex;align-items:center;justify-content:center">${unlocked ? "🏆" : "🔒"}</span>
        <div class="order-info"><b>${a.name}</b><small>${a.desc}</small></div>`;
      body.appendChild(row);
    }
  }

  renderOrderTab(body) {
    const s = this.game.state;
    const list = document.createElement("div");
    list.className = "order-list";
    let lastKind = null;
    for (const it of CATALOG) {
      if (it.kind !== lastKind) {
        lastKind = it.kind;
        const head = document.createElement("div");
        head.className = "order-section";
        head.textContent = it.kind === "fish" ? "🐟 Live Fish" : it.kind === "coral" ? "🪸 Coral Frags" : "🧰 Supplies";
        list.appendChild(head);
      }
      const row = document.createElement("div");
      row.className = "order-row" + (it.level > s.level ? " locked" : "");
      const qty = this.orderCart[it.id] || 0;
      row.innerHTML = `
        <span class="swatch" style="background:#${it.color.toString(16).padStart(6, "0")}"></span>
        <div class="order-info">
          <b>${it.name}</b>
          <small>${it.level > s.level ? `🔒 Level ${it.level}` :
            `box of ${it.boxSize} · $${it.boxCost} · sells ~$${it.market}/ea`}</small>
        </div>
        ${it.level <= s.level ? `
          <div class="qty-ctl">
            <button class="qbtn" data-d="-1">−</button>
            <span class="qty">${qty}</span>
            <button class="qbtn" data-d="1">+</button>
          </div>` : ""}
      `;
      for (const b of row.querySelectorAll(".qbtn")) {
        b.addEventListener("click", () => {
          this.orderCart[it.id] = Math.max(0, (this.orderCart[it.id] || 0) + +b.dataset.d);
          this.showTab("order");
        });
      }
      list.appendChild(row);
    }
    body.appendChild(list);

    const total = Object.entries(this.orderCart)
      .reduce((sum, [id, q]) => sum + item(id).boxCost * q, 0);
    const foot = document.createElement("div");
    foot.className = "order-foot";
    foot.innerHTML = `<span>Total: <b>$${total}</b></span>`;
    const btn = document.createElement("button");
    btn.className = "ui-btn primary";
    btn.textContent = total > 0 ? `Place order ($${total})` : "Cart is empty";
    btn.disabled = total === 0 || total > s.cash;
    if (total > s.cash && total > 0) btn.textContent = `Not enough cash ($${total})`;
    btn.addEventListener("click", () => {
      s.cash -= total;
      s.stats.spent += total;
      for (const [id, q] of Object.entries(this.orderCart)) {
        for (let i = 0; i < q; i++) {
          s.orders.push({ itemId: id, count: item(id).boxSize, eta: DELIVERY_TIME + i * 1.5 });
        }
      }
      this.orderCart = {};
      this.toast(`🚚 Order placed — arriving in ~${DELIVERY_TIME}s`);
      this.toggleTablet(false);
      this.game.save();
    });
    foot.appendChild(btn);
    body.appendChild(foot);
  }

  renderPricesTab(body) {
    const s = this.game.state;
    const note = document.createElement("p");
    note.className = "tab-note";
    note.textContent = "Set your retail prices. Push too far above market and customers walk away.";
    body.appendChild(note);
    for (const it of CATALOG) {
      if (it.level > s.level) continue;
      const row = document.createElement("div");
      row.className = "order-row";
      const price = s.prices[it.id];
      const ratio = price / it.market;
      const mood = ratio > 2.2 ? "🚫" : ratio > 1.6 ? "😒" : ratio < 0.9 ? "🤑" : "🙂";
      row.innerHTML = `
        <span class="swatch" style="background:#${it.color.toString(16).padStart(6, "0")}"></span>
        <div class="order-info"><b>${it.name}</b><small>market $${it.market} ${mood}</small></div>
        <div class="qty-ctl">
          <button class="qbtn" data-d="-1">−</button>
          <span class="qty">$${price}</span>
          <button class="qbtn" data-d="1">+</button>
        </div>
      `;
      for (const b of row.querySelectorAll(".qbtn")) {
        b.addEventListener("click", () => {
          s.prices[it.id] = Math.max(1, s.prices[it.id] + +b.dataset.d);
          this.showTab("prices");
          this.game.save();
        });
      }
      body.appendChild(row);
    }
  }

  renderStoreTab(body) {
    const g = this.game, s = g.state;
    const make = (label, desc, cost, can, fn) => {
      const row = document.createElement("div");
      row.className = "order-row";
      row.innerHTML = `<div class="order-info"><b>${label}</b><small>${desc}</small></div>`;
      const btn = document.createElement("button");
      btn.className = "ui-btn primary";
      btn.textContent = cost === null ? "Maxed out" : `Buy $${cost}`;
      btn.disabled = cost === null || !can;
      btn.addEventListener("click", fn);
      row.appendChild(btn);
      body.appendChild(row);
    };
    const tCost = s.tanksOwned < MAX_TANK_SLOTS ? tankPrice(s.tanksOwned) : null;
    make(`🐟 Fish tank (${s.tanksOwned}/${MAX_TANK_SLOTS})`, "Holds up to 8 fish",
      tCost, tCost !== null && s.cash >= tCost, () => {
        s.cash -= tCost; s.stats.spent += tCost;
        g.addTankUnit();
        this.toast("🛁 New tank installed!", "good");
        g.checkAchievements();
        this.showTab("store");
        g.save();
      });
    const shCost = s.shelvesOwned < MAX_SHELF_SLOTS ? shelfPrice(s.shelvesOwned) : null;
    make(`🗄️ Shelf unit (${s.shelvesOwned}/${MAX_SHELF_SLOTS})`, "3 rows × 8 products",
      shCost, shCost !== null && s.cash >= shCost, () => {
        s.cash -= shCost; s.stats.spent += shCost;
        g.addShelfUnit();
        this.toast("🗄️ New shelf installed!", "good");
        g.checkAchievements();
        this.showTab("store");
        g.save();
      });
    const frCost = s.fragRacksOwned < MAX_FRAGRACK_SLOTS ? fragRackPrice(s.fragRacksOwned) : null;
    make(`🪸 Coral frag rack (${s.fragRacksOwned}/${MAX_FRAGRACK_SLOTS})`, "3-tier reef rack · holds 18 frags",
      frCost, frCost !== null && s.cash >= frCost, () => {
        s.cash -= frCost; s.stats.spent += frCost;
        g.addFragRackUnit();
        this.toast("🪸 New frag rack installed!", "good");
        this.showTab("store");
        g.save();
      });

    // ---- Staff ----
    const staffHead = document.createElement("div");
    staffHead.className = "order-section";
    staffHead.textContent = "👥 Staff (daily wage)";
    body.appendChild(staffHead);
    for (const def of STAFF) {
      const hired = s.staff[def.id];
      const row = document.createElement("div");
      row.className = "order-row";
      row.innerHTML = `<div class="order-info"><b>${def.emoji} ${def.name}</b><small>${def.desc} · hire $${def.hire}, $${def.wage}/day</small></div>`;
      const btn = document.createElement("button");
      if (hired) {
        btn.className = "ui-btn danger";
        btn.textContent = "Fire";
        btn.addEventListener("click", () => { g.fireStaff(def.id); this.showTab("store"); });
      } else {
        btn.className = "ui-btn primary";
        btn.textContent = `Hire $${def.hire}`;
        btn.disabled = s.cash < def.hire;
        btn.addEventListener("click", () => { g.hireStaff(def.id); this.showTab("store"); });
      }
      row.appendChild(btn);
      body.appendChild(row);
    }

    const saveRow = document.createElement("div");
    saveRow.className = "order-row";
    saveRow.innerHTML = `<div class="order-info"><b>💾 Save game</b><small>Autosaves to this browser; tap to save right now</small></div>`;
    const saveBtn = document.createElement("button");
    saveBtn.className = "ui-btn primary";
    saveBtn.textContent = "Save now";
    saveBtn.addEventListener("click", () => {
      g.save();
      saveBtn.textContent = "Saved ✓";
      this.toast("💾 Game saved", "good");
      setTimeout(() => { saveBtn.textContent = "Save now"; }, 1500);
    });
    saveRow.appendChild(saveBtn);
    body.appendChild(saveRow);

    const danger = document.createElement("button");
    danger.className = "ui-btn danger";
    danger.textContent = "Reset save & start over";
    danger.addEventListener("click", () => {
      if (confirm("Wipe your store and start from day 1?")) g.resetGame();
    });
    body.appendChild(danger);
  }

  renderHelpTab(body) {
    body.innerHTML = `
      <div class="help-text">
        <p><b>Goal:</b> grow your aquarium shop. Order stock, fill your tanks and shelves, and ring up customers at the register.</p>
        <p><b>📦 Stock:</b> order boxes here in the tablet. They arrive on the pallet by the door. Carry a box to a tank (fish) or shelf (supplies) and stock it.</p>
        <p><b>🧽 Care:</b> tanks get dirty over time — customers won't buy fish from murky water. Look at a tank with empty hands to feed &amp; clean it.</p>
        <p><b>💳 Checkout:</b> when a shopper reaches the counter their items appear on it. Stand behind the register, look at each item and press E (or tap USE) to scan it onto the belt, then look at the register and charge. Don't make the line wait too long!</p>
        <p><b>💾 Saving:</b> the game autosaves continuously to this browser. You can also tap <b>Save now</b> in the Store tab.</p>
        <p><b>📈 Levels:</b> every $1 of sales is 1 XP. Leveling up unlocks new species, products, and more customers.</p>
        <p><b>🎯 Daily goal:</b> hit the day's revenue target (shown in the HUD) to earn a cash bonus at closing time.</p>
        <p><b>👥 Staff:</b> in the Store tab you can hire a Cashier (auto-rings up the queue), an Aquarist (auto-cleans tanks), and a Stocker (auto-unpacks deliveries) for a daily wage.</p>
        <p><b>🏆 Achievements:</b> check the trophy tab to track milestones as you grow the shop.</p>
        <p><b>🔊 Sound:</b> toggle the ambient aquarium audio with the speaker button in the HUD.</p>
        <p class="controls-note"><b>Controls:</b> WASD move · mouse look (click to capture) · E interact · TAB tablet · SHIFT run.<br>
        On touch: left side = move stick, right side = look, buttons for the rest.</p>
      </div>
    `;
  }

  /* ---------------- Checkout panel ---------------- */

  updateCheckout() {
    const g = this.game;
    const co = g.checkout;
    const customer = co && co.customer;
    const show = customer && g.player.inRegisterZone();
    const panel = $("checkout");
    panel.classList.toggle("hidden", !show);
    if (!show) { this.checkoutCustomerId = null; return; }
    // re-render when the customer or the scanned set changes
    const sig = customer.id + ":" + co.scannedCount();
    if (sig !== this.checkoutCustomerId) {
      this.checkoutCustomerId = sig;
      this.renderCheckout();
    }
    const fill = panel.querySelector(".patience-fill");
    if (fill) fill.style.width = `${(customer.patience / QUEUE_PATIENCE) * 100}%`;
  }

  renderCheckout() {
    const g = this.game;
    const co = g.checkout;
    if (!co.customer) return;
    const body = $("checkout-body");
    body.innerHTML = "";
    for (const it of co.items) {
      const row = document.createElement("div");
      row.className = "scan-row" + (it.scanned ? " scanned" : "");
      row.innerHTML = `<span>${it.label}</span><span>$${it.price}</span>`;
      body.appendChild(row);
    }
    const hint = document.createElement("div");
    hint.className = "checkout-hint";
    hint.textContent = g.player.isTouch
      ? "Look at each item and tap USE to scan"
      : "Look at each item and press E to scan";
    body.appendChild(hint);

    const bar = document.createElement("div");
    bar.className = "patience-track";
    bar.innerHTML = `<div class="patience-fill" style="width:${(co.customer.patience / QUEUE_PATIENCE) * 100}%"></div>`;
    body.appendChild(bar);

    const actions = document.createElement("div");
    actions.className = "checkout-actions";
    if (!co.allScanned()) {
      const scan = document.createElement("button");
      scan.className = "ui-btn primary";
      scan.textContent = `Scan next (${co.scannedCount()}/${co.items.length})`;
      scan.addEventListener("click", () => { co.scan(co.items.find((i) => !i.scanned)); this.updateCheckout(); });
      actions.appendChild(scan);
    } else {
      const pay = document.createElement("button");
      pay.className = "ui-btn pay";
      pay.textContent = `Take payment · $${co.total()}`;
      pay.addEventListener("click", () => co.charge());
      actions.appendChild(pay);
    }
    body.appendChild(actions);
  }

  /* ---------------- Day summary ---------------- */

  showSummary(day, stats, rent, goal = 0, goalMet = false, bonus = 0, wages = 0) {
    this.game.paused = true;
    document.exitPointerLock?.();
    const net = stats.revenue - stats.spent - rent - wages + bonus;
    $("summary-title").textContent = `Day ${day} complete!`;
    $("summary-body").innerHTML = `
      <div class="sum-row"><span>Revenue</span><b class="pos">+$${stats.revenue}</b></div>
      <div class="sum-row"><span>Daily goal ($${goal})</span><b class="${goalMet ? "pos" : "neg"}">${goalMet ? `met +$${bonus}` : "missed"}</b></div>
      <div class="sum-row"><span>Stock & upgrades</span><b class="neg">−$${stats.spent}</b></div>
      ${wages ? `<div class="sum-row"><span>Staff wages</span><b class="neg">−$${wages}</b></div>` : ""}
      <div class="sum-row"><span>Rent</span><b class="neg">−$${rent}</b></div>
      <div class="sum-row total"><span>Net</span><b class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : "−"}$${Math.abs(net)}</b></div>
      <hr>
      <div class="sum-row"><span>Customers served</span><b>${stats.served}</b></div>
      <div class="sum-row"><span>Items sold</span><b>${stats.sold}</b></div>
      <div class="sum-row"><span>Walked out of line</span><b>${stats.lost}</b></div>
      <div class="sum-row"><span>Wanted items you didn't stock</span><b>${stats.missed}</b></div>
      <div class="sum-row"><span>Scared off by prices</span><b>${stats.priceSkips}</b></div>
    `;
    $("summary-modal").classList.remove("hidden");
  }

  showIntro() {
    $("intro-modal").classList.remove("hidden");
  }
}
