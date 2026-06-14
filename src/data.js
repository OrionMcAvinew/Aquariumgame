// Catalog, balance constants, and store layout data.

export const DAY_LEN = 300;           // real seconds per in-game day (9:00 -> 21:00)
export const MAX_CUSTOMERS = 6;
export const QUEUE_PATIENCE = 75;     // seconds a customer waits in queue
export const TANK_FISH_CAP = 8;
export const SHELF_ROWS = 3;
export const ROW_CAP = 8;
export const CARE_DECAY_PER_DAY = 45; // tank care lost per day
export const CARE_SELL_MIN = 45;      // customers won't buy from tanks below this
export const DELIVERY_TIME = 18;      // seconds for an order to arrive

// Fish render fields:
//   color/fin  base + accent colors
//   size       overall scale
//   bodyH      body height as fraction of texture (silhouette tallness)
//   pattern    'solid'|'spots'|'vstripe'|'bands'|'hstripe'|'zebra'|'marble'|
//              'patches'|'rainbow'|'scale'|'gradient'
//   pattern2   secondary pattern color
//   tail       'fan'|'fork'|'sword'|'round'|'spiky'|'seahorse'
export const FISH = [
  { id: "guppy",     name: "Guppy",        kind: "fish", boxSize: 4, boxCost: 8,   market: 6,   level: 1, color: 0xff8c42, fin: 0xffd166, size: 0.8,  bodyH: 0.40, pattern: "spots",   pattern2: 0xffe08a, school: true, shape: "normal", tail: "fan" },
  { id: "goldfish",  name: "Goldfish",     kind: "fish", boxSize: 4, boxCost: 12,  market: 9,   level: 1, color: 0xffb703, fin: 0xff8800, size: 1.0,  bodyH: 0.46, pattern: "solid",   pattern2: 0xffd166, shape: "round", tail: "fan" },
  { id: "danio",     name: "Zebra Danio",  kind: "fish", boxSize: 4, boxCost: 10,  market: 8,   level: 1, color: 0xd7dde2, fin: 0x355070, size: 0.8,  bodyH: 0.34, pattern: "zebra",   pattern2: 0x1d3557, school: true, shape: "long", tail: "fork" },
  { id: "platy",     name: "Platy",        kind: "fish", boxSize: 4, boxCost: 9,   market: 7,   level: 1, color: 0xff5a36, fin: 0xffa62b, size: 0.78, bodyH: 0.42, pattern: "solid",   pattern2: 0xffa62b, school: true, shape: "normal", tail: "fan" },
  { id: "molly",     name: "Black Molly",  kind: "fish", boxSize: 4, boxCost: 14,  market: 10,  level: 2, color: 0x2b2d42, fin: 0x5c677d, size: 0.9,  bodyH: 0.42, pattern: "solid",   pattern2: 0x5c677d, shape: "normal", tail: "fan" },
  { id: "tetra",     name: "Neon Tetra",   kind: "fish", boxSize: 4, boxCost: 16,  market: 12,  level: 2, color: 0xd9eef5, fin: 0xf72585, size: 0.7,  bodyH: 0.36, pattern: "hstripe", pattern2: 0x00b4d8, school: true, shape: "tetra", tail: "fork" },
  { id: "cory",      name: "Corydoras",    kind: "fish", boxSize: 4, boxCost: 15,  market: 11,  level: 2, color: 0xc2a37a, fin: 0x6f4518, size: 0.8,  bodyH: 0.38, pattern: "spots",   pattern2: 0x3a2410, shape: "long", tail: "fan" },
  { id: "rasbora",   name: "Rasbora",      kind: "fish", boxSize: 4, boxCost: 17,  market: 13,  level: 2, color: 0xd98c5f, fin: 0x432818, size: 0.72, bodyH: 0.36, pattern: "hstripe", pattern2: 0x2b2d42, school: true, shape: "tetra", tail: "fork" },
  { id: "swordtail", name: "Swordtail",    kind: "fish", boxSize: 4, boxCost: 20,  market: 15,  level: 3, color: 0xef233c, fin: 0xff758f, size: 0.9,  bodyH: 0.40, pattern: "solid",   pattern2: 0xff758f, shape: "normal", tail: "sword" },
  { id: "betta",     name: "Betta",        kind: "fish", boxSize: 2, boxCost: 28,  market: 20,  level: 3, color: 0xb5179e, fin: 0x7209b7, size: 0.95, bodyH: 0.50, pattern: "gradient",pattern2: 0x3a0ca3, shape: "betta", tail: "fan" },
  { id: "rainbow",   name: "Rainbowfish",  kind: "fish", boxSize: 4, boxCost: 26,  market: 19,  level: 4, color: 0x4cc9f0, fin: 0xf72585, size: 0.85, bodyH: 0.42, pattern: "rainbow", pattern2: 0x06d6a0, shape: "tetra", tail: "fork" },
  { id: "gourami",   name: "Gourami",      kind: "fish", boxSize: 4, boxCost: 30,  market: 22,  level: 4, color: 0x99d98c, fin: 0x52b788, size: 1.1,  bodyH: 0.50, pattern: "spots",   pattern2: 0x2d6a4f, shape: "tall", tail: "fan" },
  { id: "pleco",     name: "Plecostomus",  kind: "fish", boxSize: 2, boxCost: 34,  market: 25,  level: 4, color: 0x6b4f3a, fin: 0x3a2a1d, size: 1.25, bodyH: 0.34, pattern: "spots",   pattern2: 0x2a1d12, shape: "long", tail: "fan" },
  { id: "angelfish", name: "Angelfish",    kind: "fish", boxSize: 4, boxCost: 36,  market: 26,  level: 5, color: 0xe9ecef, fin: 0x495057, size: 1.15, bodyH: 0.62, pattern: "vstripe", pattern2: 0x212529, shape: "tall", tail: "round" },
  { id: "clownfish", name: "Clownfish",    kind: "fish", boxSize: 4, boxCost: 48,  market: 34,  level: 5, color: 0xf3722c, fin: 0xffffff, size: 1.0,  bodyH: 0.46, pattern: "bands",   pattern2: 0xffffff, shape: "normal", tail: "round" },
  { id: "parrot",    name: "Parrot Cichlid",kind: "fish",boxSize: 2, boxCost: 52,  market: 38,  level: 5, color: 0xff4d4d, fin: 0xff8fa3, size: 1.2,  bodyH: 0.58, pattern: "solid",   pattern2: 0xff8fa3, shape: "round", tail: "fan" },
  { id: "ram",       name: "Ram Cichlid",  kind: "fish", boxSize: 4, boxCost: 44,  market: 32,  level: 6, color: 0x3a86ff, fin: 0xffbe0b, size: 0.85, bodyH: 0.48, pattern: "vstripe", pattern2: 0x023047, shape: "normal", tail: "fan" },
  { id: "discus",    name: "Discus",       kind: "fish", boxSize: 4, boxCost: 60,  market: 44,  level: 6, color: 0x118ab2, fin: 0x06d6a0, size: 1.3,  bodyH: 0.66, pattern: "hstripe", pattern2: 0xffd166, shape: "tall", tail: "round" },
  { id: "bluetang",  name: "Blue Tang",    kind: "fish", boxSize: 2, boxCost: 75,  market: 55,  level: 6, color: 0x1976d2, fin: 0xffd000, size: 1.1,  bodyH: 0.54, pattern: "solid",   pattern2: 0x0d47a1, shape: "tall", tail: "round" },
  { id: "oscar",     name: "Oscar",        kind: "fish", boxSize: 2, boxCost: 80,  market: 58,  level: 7, color: 0x432818, fin: 0xe85d04, size: 1.35, bodyH: 0.52, pattern: "marble",  pattern2: 0xe85d04, shape: "round", tail: "fan" },
  { id: "lionfish",  name: "Lionfish",     kind: "fish", boxSize: 2, boxCost: 100, market: 72,  level: 7, color: 0x9b2226, fin: 0xffe5d9, size: 1.3,  bodyH: 0.50, pattern: "vstripe", pattern2: 0xffe5d9, shape: "lionfish", tail: "spiky" },
  { id: "mandarin",  name: "Mandarin Fish",kind: "fish", boxSize: 2, boxCost: 110, market: 80,  level: 7, color: 0x0a9396, fin: 0xee9b00, size: 0.95, bodyH: 0.46, pattern: "marble",  pattern2: 0xee9b00, shape: "normal", tail: "fan" },
  { id: "koi",       name: "Koi",          kind: "fish", boxSize: 2, boxCost: 120, market: 88,  level: 8, color: 0xf8f9fa, fin: 0xe85d04, size: 1.25, bodyH: 0.44, pattern: "patches", pattern2: 0xe85d04, shape: "long", tail: "fan" },
  { id: "seahorse",  name: "Seahorse",     kind: "fish", boxSize: 2, boxCost: 140, market: 100, level: 8, color: 0xffd166, fin: 0xfca311, size: 1.05, bodyH: 0.40, pattern: "spots",   pattern2: 0xfca311, shape: "normal", tail: "seahorse" },
  { id: "arowana",   name: "Arowana",      kind: "fish", boxSize: 1, boxCost: 260, market: 190, level: 9, color: 0xc7ccd1, fin: 0x9aa3ab, size: 1.5,  bodyH: 0.36, pattern: "scale",   pattern2: 0x8d99ae, shape: "long", tail: "fan" },
];

// shape: how it renders on shelves — "box" | "cyl" | "bag" | "bottle" | "tube" | "bar" | "wood"
export const PRODUCTS = [
  { id: "food",    name: "Fish Food",     kind: "product", boxSize: 6, boxCost: 12,  market: 5,  level: 1, color: 0x90be6d, shape: "cyl" },
  { id: "net",     name: "Fish Net",      kind: "product", boxSize: 6, boxCost: 18,  market: 7,  level: 2, color: 0x577590, shape: "box" },
  { id: "gravel",  name: "Gravel Bag",    kind: "product", boxSize: 6, boxCost: 16,  market: 6,  level: 2, color: 0x9c6644, shape: "bag" },
  { id: "plant",   name: "Water Plant",   kind: "product", boxSize: 6, boxCost: 30,  market: 11, level: 3, color: 0x52b788, shape: "cyl" },
  { id: "decor",   name: "Coral Decor",   kind: "product", boxSize: 6, boxCost: 36,  market: 14, level: 3, color: 0xf94144, shape: "box" },
  { id: "thermo",  name: "Thermometer",   kind: "product", boxSize: 6, boxCost: 20,  market: 8,  level: 3, color: 0xe63946, shape: "tube" },
  { id: "heater",  name: "Tank Heater",   kind: "product", boxSize: 6, boxCost: 44,  market: 16, level: 4, color: 0xadb5bd, shape: "tube" },
  { id: "pump",    name: "Air Pump",      kind: "product", boxSize: 6, boxCost: 52,  market: 19, level: 4, color: 0x48cae4, shape: "box" },
  { id: "cond",    name: "Water Cond.",   kind: "product", boxSize: 6, boxCost: 28,  market: 11, level: 4, color: 0x6a4c93, shape: "bottle" },
  { id: "light",   name: "LED Light",     kind: "product", boxSize: 6, boxCost: 70,  market: 26, level: 5, color: 0xffd166, shape: "bar" },
  { id: "testkit", name: "Test Kit",      kind: "product", boxSize: 6, boxCost: 40,  market: 16, level: 5, color: 0x06d6a0, shape: "box" },
  { id: "filter",  name: "Water Filter",  kind: "product", boxSize: 6, boxCost: 60,  market: 22, level: 5, color: 0x277da1, shape: "box" },
  { id: "coral",   name: "Red Sea Coral", kind: "product", boxSize: 4, boxCost: 80,  market: 30, level: 6, color: 0xe5383b, shape: "bag" },
  { id: "wood",    name: "Driftwood",     kind: "product", boxSize: 4, boxCost: 50,  market: 20, level: 6, color: 0x6f4518, shape: "wood" },
  { id: "castle",  name: "Castle Ornament",kind: "product",boxSize: 4, boxCost: 40,  market: 15, level: 3, color: 0x9aa5b1, shape: "castle" },
  { id: "airstone",name: "Air Stone",     kind: "product", boxSize: 6, boxCost: 16,  market: 6,  level: 4, color: 0xa8dadc, shape: "cyl" },
  { id: "vacuum",  name: "Gravel Vacuum", kind: "product", boxSize: 6, boxCost: 34,  market: 13, level: 4, color: 0x6c757d, shape: "tube" },
  { id: "medicine",name: "Fish Medicine", kind: "product", boxSize: 6, boxCost: 26,  market: 10, level: 5, color: 0xe76f51, shape: "bottle" },
  { id: "shipwreck",name: "Shipwreck Decor",kind:"product",boxSize: 4, boxCost: 70,  market: 27, level: 6, color: 0x5b4636, shape: "wood" },
  { id: "kit",     name: "Starter Kit",   kind: "product", boxSize: 4, boxCost: 110, market: 40, level: 7, color: 0xffb703, shape: "box" },
  { id: "bg",      name: "Tank Backdrop", kind: "product", boxSize: 6, boxCost: 24,  market: 9,  level: 8, color: 0x118ab2, shape: "bar" },
];

// Coral frags — sold from frag racks (kind: "coral").
export const CORAL = [
  { id: "zoa",     name: "Zoanthids",   kind: "coral", boxSize: 4, boxCost: 24,  market: 18,  level: 1, color: 0x39ff14, form: "polyps" },
  { id: "mushroom",name: "Mushrooms",   kind: "coral", boxSize: 4, boxCost: 28,  market: 21,  level: 1, color: 0xff206e, form: "mush" },
  { id: "duncan",  name: "Duncan",      kind: "coral", boxSize: 4, boxCost: 34,  market: 26,  level: 2, color: 0xffd400, form: "polyps" },
  { id: "acan",    name: "Acan",        kind: "coral", boxSize: 4, boxCost: 40,  market: 30,  level: 2, color: 0xff5d00, form: "brain" },
  { id: "hammer",  name: "Hammer Coral",kind: "coral", boxSize: 4, boxCost: 48,  market: 36,  level: 3, color: 0x00e5ff, form: "branch" },
  { id: "torch",   name: "Torch Coral", kind: "coral", boxSize: 4, boxCost: 60,  market: 45,  level: 3, color: 0x7c1fff, form: "branch" },
  { id: "monti",   name: "Montipora",   kind: "coral", boxSize: 4, boxCost: 55,  market: 42,  level: 4, color: 0xff3860, form: "plate" },
  { id: "favia",   name: "Favia",       kind: "coral", boxSize: 4, boxCost: 50,  market: 38,  level: 4, color: 0x7cff00, form: "brain" },
  { id: "acro",    name: "Acropora",    kind: "coral", boxSize: 2, boxCost: 80,  market: 60,  level: 5, color: 0x00ffd0, form: "branch" },
  { id: "goni",    name: "Goniopora",   kind: "coral", boxSize: 2, boxCost: 90,  market: 68,  level: 5, color: 0xff00a0, form: "polyps" },
  { id: "chalice", name: "Chalice",     kind: "coral", boxSize: 2, boxCost: 110, market: 82,  level: 6, color: 0xffa62b, form: "plate" },
  { id: "scoly",   name: "Scolymia",    kind: "coral", boxSize: 1, boxCost: 160, market: 120, level: 7, color: 0xff1f6b, form: "brain" },
];

export const CATALOG = [...FISH, ...PRODUCTS, ...CORAL];
const byId = new Map(CATALOG.map((c) => [c.id, c]));

export const FRAG_CAP = 18;                 // frags per rack (3 tiers x 6)
export const fragRackPrice = (owned) => Math.round(220 * Math.pow(1.5, owned));
export const MAX_FRAGRACK_SLOTS = 3;
export const FRAGRACK_SLOTS = [
  { x: -1.7, z: -5.0, rotY: 0 },
  { x: 1.7,  z: -5.0, rotY: 0 },
  { x: -5.2, z: -5.0, rotY: 0 },
];
export const fragBrowseSpot = (s) => ({ x: s.x, z: s.z + 1.3 });

// Achievements — test(state) checks lifetime counters + current state.
export const ACHIEVEMENTS = [
  { id: "first_sale", name: "First Sale",       desc: "Sell your first item",        test: (s) => s.lifetime.sold >= 1 },
  { id: "sold_50",    name: "Fishmonger",       desc: "Sell 50 items",               test: (s) => s.lifetime.sold >= 50 },
  { id: "sold_250",   name: "Aquatic Empire",   desc: "Sell 250 items",              test: (s) => s.lifetime.sold >= 250 },
  { id: "served_100", name: "People Person",    desc: "Serve 100 customers",         test: (s) => s.lifetime.served >= 100 },
  { id: "cash_2000",  name: "In the Money",     desc: "Hold $2,000 at once",         test: (s) => s.cash >= 2000 },
  { id: "cash_10000", name: "Tycoon",           desc: "Hold $10,000 at once",        test: (s) => s.cash >= 10000 },
  { id: "level_5",    name: "Established",      desc: "Reach level 5",               test: (s) => s.level >= 5 },
  { id: "level_9",    name: "Master Aquarist",  desc: "Reach the top level",         test: (s) => s.level >= 9 },
  { id: "tanks_8",    name: "Full House",       desc: "Own all 8 tanks",             test: (s) => s.tanksOwned >= 8 },
  { id: "shelves_8",  name: "Fully Stocked",    desc: "Own all 8 shelves",           test: (s) => s.shelvesOwned >= 8 },
  { id: "day_7",      name: "Open for Business",desc: "Reach day 7",                 test: (s) => s.day >= 7 },
  { id: "goal_5",     name: "Overachiever",     desc: "Hit the daily goal 5 times",  test: (s) => s.lifetime.goals >= 5 },
];

// Hireable staff — one-time hire cost + a daily wage deducted at closing.
export const STAFF = [
  { id: "cashier",  name: "Cashier",  emoji: "🧑‍💼", uniform: 0x2a9d8f, hire: 400, wage: 80, desc: "Scans and rings up the queue for you" },
  { id: "aquarist", name: "Aquarist", emoji: "🧑‍🔧", uniform: 0x457b9d, hire: 300, wage: 55, desc: "Keeps every tank fed and clean" },
  { id: "stocker",  name: "Stocker",  emoji: "🧑‍🏭", uniform: 0xf4a261, hire: 300, wage: 60, desc: "Unpacks delivered boxes onto tanks & shelves" },
];
export const item = (id) => byId.get(id);

// Cumulative XP needed to reach a level (1 XP per $1 of sales).
export const xpForLevel = (n) => 50 * n * (n - 1);
export const MAX_LEVEL = 9;

export const tankPrice = (owned) => Math.round(120 * Math.pow(1.5, owned - 2));
export const shelfPrice = (owned) => Math.round(80 * Math.pow(1.5, owned - 1));
export const MAX_TANK_SLOTS = 8;
export const MAX_SHELF_SLOTS = 8;

// ---- Store layout (meters; x: -10..10 west->east, z: -7..7 north->south) ----
// Door is centered on the south wall (z = +7).

export const STORE = { halfW: 10, halfD: 7, wallH: 3.4, doorHalf: 1.3 };

// rotY faces the unit's front toward the aisle.
export const TANK_SLOTS = [
  { x: -9.0, z: -5.4, rotY: Math.PI / 2 },
  { x: -9.0, z: -3.2, rotY: Math.PI / 2 },
  { x: -9.0, z: -1.0, rotY: Math.PI / 2 },
  { x: -9.0, z: 1.2,  rotY: Math.PI / 2 },
  { x: -9.0, z: 3.4,  rotY: Math.PI / 2 },
  { x: -9.0, z: 5.6,  rotY: Math.PI / 2 },
  { x: -6.2, z: -6.3, rotY: 0 },
  { x: -3.8, z: -6.3, rotY: 0 },
];

export const SHELF_SLOTS = [
  { x: 9.1, z: -5.4, rotY: -Math.PI / 2 },
  { x: 9.1, z: -3.2, rotY: -Math.PI / 2 },
  { x: 9.1, z: -1.0, rotY: -Math.PI / 2 },
  { x: 9.1, z: 1.2,  rotY: -Math.PI / 2 },
  { x: 3.6, z: -6.4, rotY: 0 },
  { x: 6.2, z: -6.4, rotY: 0 },
  // back-to-back center gondolas
  { x: -5.0, z: 3.1, rotY: 0 },
  { x: -5.0, z: 2.4, rotY: Math.PI },
];

// Browse spots (where a customer stands to look at a unit).
export const tankBrowseSpot = (s) =>
  s.rotY === 0 ? { x: s.x, z: s.z + 1.3 } : { x: s.x + 1.4, z: s.z };
export const shelfBrowseSpot = (s) => {
  if (s.rotY === 0) return { x: s.x, z: s.z + 1.3 };
  if (s.rotY === Math.PI) return { x: s.x, z: s.z - 1.3 };
  return { x: s.x - 1.4, z: s.z };
};

export const COUNTER = { x: 3.3, z: 5.0, w: 2.6, d: 0.9, h: 1.02 };
export const REGISTER_ZONE = { x: 3.3, z: 6.1, r: 1.5 };  // player stands here to serve
export const QUEUE_SPOTS = [
  { x: 3.3, z: 3.9 }, { x: 3.3, z: 2.9 }, { x: 3.3, z: 1.9 },
  { x: 3.3, z: 0.9 }, { x: 3.3, z: -0.1 }, { x: 3.3, z: -1.1 },
];

export const PALLET = { x: -4.6, z: 6.1 };
export const DOOR_IN = { x: 0, z: 6.3 };    // first waypoint inside
export const SPAWN = { x: 0, z: 9.5 };      // outside, where customers appear
export const AISLE_X = 0;                   // central aisle customers walk along
