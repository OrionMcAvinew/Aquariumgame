// Simple offline-first service worker for Fin & Fortune.
// Bump CACHE when shipping new assets so clients refresh.
const CACHE = "finfortune-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./lib/three.module.min.js",
  "./lib/jsm/RoundedBoxGeometry.js",
  "./lib/jsm/RoomEnvironment.js",
  "./lib/jsm/postprocessing/EffectComposer.js",
  "./lib/jsm/postprocessing/Pass.js",
  "./lib/jsm/postprocessing/RenderPass.js",
  "./lib/jsm/postprocessing/ShaderPass.js",
  "./lib/jsm/postprocessing/MaskPass.js",
  "./lib/jsm/postprocessing/UnrealBloomPass.js",
  "./lib/jsm/postprocessing/OutputPass.js",
  "./lib/jsm/shaders/CopyShader.js",
  "./lib/jsm/shaders/LuminosityHighPassShader.js",
  "./lib/jsm/shaders/OutputShader.js",
  "./src/main.js",
  "./src/data.js",
  "./src/world.js",
  "./src/player.js",
  "./src/customers.js",
  "./src/ui.js",
  "./src/sound.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/fish/fish_blue.png",
  "./assets/fish/fish_brown.png",
  "./assets/fish/fish_green.png",
  "./assets/fish/fish_grey.png",
  "./assets/fish/fish_grey_long_a.png",
  "./assets/fish/fish_grey_long_b.png",
  "./assets/fish/fish_orange.png",
  "./assets/fish/fish_pink.png",
  "./assets/fish/fish_red.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first, falling back to network (and caching new GETs).
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
