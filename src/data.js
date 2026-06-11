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

export const FISH = [
  { id: "guppy",     name: "Guppy",        kind: "fish", boxSize: 4, boxCost: 8,   market: 6,  level: 1, color: 0xff8c42 },
  { id: "goldfish",  name: "Goldfish",     kind: "fish", boxSize: 4, boxCost: 12,  market: 9,  level: 1, color: 0xffb703 },
  { id: "tetra",     name: "Neon Tetra",   kind: "fish", boxSize: 4, boxCost: 16,  market: 12, level: 2, color: 0x4cc9f0 },
  { id: "betta",     name: "Betta",        kind: "fish", boxSize: 4, boxCost: 24,  market: 18, level: 3, color: 0xb5179e },
  { id: "angelfish", name: "Angelfish",    kind: "fish", boxSize: 4, boxCost: 36,  market: 26, level: 4, color: 0xced4da },
  { id: "clownfish", name: "Clownfish",    kind: "fish", boxSize: 4, boxCost: 48,  market: 34, level: 5, color: 0xf3722c },
];

export const PRODUCTS = [
  { id: "food",   name: "Fish Food",    kind: "product", boxSize: 6, boxCost: 12, market: 5,  level: 1, color: 0x90be6d },
  { id: "net",    name: "Fish Net",     kind: "product", boxSize: 6, boxCost: 18, market: 7,  level: 2, color: 0x577590 },
  { id: "decor",  name: "Coral Decor",  kind: "product", boxSize: 6, boxCost: 36, market: 14, level: 3, color: 0xf94144 },
  { id: "filter", name: "Water Filter", kind: "product", boxSize: 6, boxCost: 60, market: 22, level: 5, color: 0x277da1 },
];

export const CATALOG = [...FISH, ...PRODUCTS];
const byId = new Map(CATALOG.map((c) => [c.id, c]));
export const item = (id) => byId.get(id);

// Cumulative XP needed to reach a level (1 XP per $1 of sales).
export const xpForLevel = (n) => 50 * n * (n - 1);
export const MAX_LEVEL = 9;

export const tankPrice = (owned) => Math.round(120 * Math.pow(1.5, owned - 2));
export const shelfPrice = (owned) => Math.round(80 * Math.pow(1.5, owned - 1));
export const MAX_TANK_SLOTS = 8;
export const MAX_SHELF_SLOTS = 6;

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
];

// Browse spots (where a customer stands to look at a unit).
export const tankBrowseSpot = (s) =>
  s.rotY === 0 ? { x: s.x, z: s.z + 1.3 } : { x: s.x + 1.4, z: s.z };
export const shelfBrowseSpot = (s) =>
  s.rotY === 0 ? { x: s.x, z: s.z + 1.3 } : { x: s.x - 1.4, z: s.z };

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
