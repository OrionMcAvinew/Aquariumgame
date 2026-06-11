# Fin & Fortune 3D 🐠

A first-person 3D aquarium store simulator for the browser — think Supermarket Simulator, but you're running a fish shop. Built with Three.js and vanilla JavaScript, playable on desktop **and** mobile (touch controls).

## How to run

No build step. Serve the folder and open it in a browser:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Opening `index.html` directly won't work because the game uses ES modules — any static server is fine.)

## How to play

You walk the shop floor in first person and do everything yourself:

1. **📱 Order stock** — open the Tablet and buy boxes of fish and supplies wholesale. Deliveries land on the pallet by the front door.
2. **📦 Stock the store** — pick up a box, carry it to a fish tank (live fish) or a shelf (supplies), and stock it.
3. **🧽 Keep tanks healthy** — water gets murkier over time, and customers won't buy fish from a dirty tank. Look at a tank with empty hands to feed & clean it.
4. **💳 Work the register** — customers walk in, browse, grab what they want, and queue at the counter. Stand behind it, scan every item, and take payment before their patience runs out.
5. **🏷️ Set your prices** — every product has a market price. Mark up too greedily and customers walk straight back out.
6. **📈 Level up** — every $1 of revenue is 1 XP. Levels unlock rarer fish (12 species, from guppies up to lionfish and seahorses), new products (10 supply lines including coral), and bring in more customers. Expand with extra tanks and shelves from the Tablet.
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

- [Three.js](https://threejs.org) (vendored in `lib/`, MIT licensed) for rendering — low-poly store built from primitives, no model files or textures to download.
- Vanilla JS ES modules, no framework, no build step.
- DOM-based UI layer (HUD, tablet, checkout) over the WebGL canvas.

## Classic version

The original 2D management version of the game lives in [`classic/`](classic/) — open `classic/index.html` to play it.
