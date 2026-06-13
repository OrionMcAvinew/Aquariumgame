# Fin & Fortune 3D 🐠

A first-person 3D aquarium store simulator for the browser — think Supermarket Simulator, but you're running a fish shop. Built with Three.js and vanilla JavaScript, playable on desktop **and** mobile (touch controls).

## How to run

No build step. Serve the folder and open it in a browser:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Opening `index.html` directly won't work because the game uses ES modules — any static server is fine.)

## Install it on your phone (PWA)

Fin & Fortune is a Progressive Web App, so you can add it to your home screen and it runs fullscreen like a native app (and works offline after the first load).

1. **Host it over HTTPS.** The easiest free option is **GitHub Pages**: in the repo, go to *Settings → Pages → Build and deployment*, set *Source = Deploy from a branch*, pick `main` / root, and save. After a minute your game is live at `https://<your-user>.github.io/Aquariumgame/`. (Any static HTTPS host works — Netlify, Vercel, Cloudflare Pages, etc.)
2. **Open that URL on your phone.**
   - **iPhone/iPad (Safari):** tap the Share button → *Add to Home Screen*.
   - **Android (Chrome):** tap the ⋮ menu → *Install app* / *Add to Home screen*.
3. Launch it from the new home-screen icon — it opens fullscreen with the touch controls.

## Saving

The game **autosaves continuously** to your browser (localStorage) — every few seconds, on every sale/stock action, and when you close the tab. You can also hit **Save now** in the Tablet's *Store* tab for an explicit save. Because the save lives in the browser, it persists per-device; clearing site data or using a different browser starts fresh. *Reset save & start over* (also in the Store tab) wipes it.

## How to play

You walk the shop floor in first person and do everything yourself:

1. **📱 Order stock** — open the Tablet and buy boxes of fish and supplies wholesale. Deliveries land on the pallet by the front door.
2. **📦 Stock the store** — pick up a box, carry it to a fish tank (live fish) or a shelf (supplies), and stock it.
3. **🧽 Keep tanks healthy** — water gets murkier over time, and customers won't buy fish from a dirty tank. Look at a tank with empty hands to feed & clean it.
4. **💳 Work the register** — customers walk in, browse, grab what they want, and queue at the counter. Stand behind it, scan every item, and take payment before their patience runs out.
5. **🏷️ Set your prices** — every product has a market price. Mark up too greedily and customers walk straight back out.
6. **📈 Level up** — every $1 of revenue is 1 XP. Levels unlock rarer fish (19 species, from guppies up to koi, lionfish, seahorses and a premium arowana), new products (16 supply lines including heaters, LED lights, test kits, conditioner and coral), and bring in more customers. Expand with extra tanks and shelves from the Tablet.
7. **🌙 Survive the rent** — each day ends with a profit/loss summary, and rent scales with how much store you own.

Progress autosaves to your browser (localStorage).

## Controls

| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows (Shift = run) | left-thumb joystick |
| Look | mouse (click canvas to capture) | drag right side of screen |
| Interact | E | USE button |
| Tablet | Tab | 📱 button |
| Scan / charge at register | Space / Enter | on-screen buttons |

## Tech

- [Three.js](https://threejs.org) (vendored in `lib/`, MIT licensed) for rendering — low-poly store built from primitives.
- Vanilla JS ES modules, no framework, no build step.
- DOM-based UI layer (HUD, tablet, checkout) over the WebGL canvas.

## Credits

- Fish & decoration sprites: **Fish Pack by [Kenney](https://kenney.nl/assets/fish-pack)** — licensed CC0 1.0 (public domain). Several species reuse these base shapes recolored at runtime. See [`assets/CREDITS.md`](assets/CREDITS.md). If a sprite ever fails to load, the game falls back to its built-in hand-painted fish.

## Classic version

The original 2D management version of the game lives in [`classic/`](classic/) — open `classic/index.html` to play it.
