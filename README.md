# Fin & Fortune 🐠

A browser-based aquarium store simulator. Run your own fish shop: stock your tanks, keep your fish happy and healthy, and serve customers before their patience runs out.

## How to run

No build step or dependencies — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How to play

- **Buy fish** from the Wholesale Market, then click a glowing tank to place them.
- **Keep tanks healthy** — feed your fish ($2 per tank) and clean the water (free). Hungry fish in dirty tanks get sick and can die.
- **Serve customers** — shoppers appear at the top wanting a specific species. Click them to make the sale before they walk out.
- **Build reputation (⭐)** — every sale earns rep, which unlocks rarer and more valuable species (all the way up to the Baby Shark 🦈). Missed customers and dead fish cost you rep.
- **Upgrade your store:**
  - 🌀 **Filter** — tank gets dirty half as fast
  - ⏲️ **Auto-feeder** — feeds the tank automatically
  - 🪸 **Decoration** — fish from that tank sell for 20% more
  - 🛁 **Extra tanks** — up to 8, each pricier than the last
- **Watch your cash** — rent is due every in-game day, and it grows with each tank you own.

Progress saves automatically in your browser (localStorage). Use the **Reset** button to start fresh.

## Tech

Vanilla HTML, CSS, and JavaScript — no frameworks. Game state ticks once per second; fish swim on `requestAnimationFrame`.
