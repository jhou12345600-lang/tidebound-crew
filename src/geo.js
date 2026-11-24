// ===== 地形：島嶼定義、地形高度、碼頭平台（模擬與畫面共用）=====
// 2D value-noise（固定種子，每台電腦算出來都一樣）
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, oct = 4) { let f = 0, a = 0.5, fr = 1; for (let i = 0; i < oct; i++) { f += a * vnoise(x * fr, y * fr, s + i * 17); fr *= 2.03; a *= 0.5; } return f; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export const SEABED = -26;
// 島嶼：x, z, 半徑 r, 最高 h, 種子
export const ISLANDS = [
  { id: 0, name: '潮聲港', x: 0, z: -260, r: 95, h: 14, seed: 11, port: true },
  { id: 1, name: '椰影島', x: 420, z: 140, r: 85, h: 16, seed: 23 },
  { id: 2, name: '鯨骨礁', x: -470, z: 260, r: 70, h: 10, seed: 37 },
  { id: 3, name: '落日島', x: 120, z: 700, r: 120, h: 26, seed: 41 },
  { id: 4, name: '雙峰島', x: -820, z: -180, r: 130, h: 42, seed: 53 },
  { id: 5, name: '翡翠環礁', x: 880, z: -320, r: 90, h: 8, seed: 67 },
  { id: 6, name: '迷霧岬', x: -360, z: 980, r: 105, h: 30, seed: 71 },
  { id: 7, name: '老鷹岩', x: 760, z: 820, r: 75, h: 34, seed: 83 },
  { id: 8, name: '月牙島', x: -980, z: 640, r: 95, h: 18, seed: 97 },
  { id: 9, name: '珊瑚灣', x: 300, z: -760, r: 100, h: 15, seed: 101 },
];
export const WORLD_R = 1500;

/** 單一島嶼在世界座標 (x,z) 的高度 */
function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z, d = Math.hypot(dx, dz);
  if (d > I.r * 1.35) return SEABED;
  const ang = Math.atan2(dz, dx);
  const coast = I.r * (0.78 + 0.32 * fbm(Math.cos(ang) * 1.6 + I.seed, Math.sin(ang) * 1.6, I.seed, 3));
  const t = d / coast;                                   // 0 中心、1 海岸線
  let base;
  if (t < 1) base = 1.6 + (I.h - 1.6) * Math.pow(1 - t, 1.6) * (0.55 + 0.9 * fbm(x * 0.012, z * 0.012, I.seed + 5, 4));
  else base = 1.6 - (t - 1) * 30;                          // 海岸外迅速變深
  if (t < 1.08 && t > 0.82) base = Math.min(base, 1.6 + (1 - t) * 6); // 沙灘平緩
  if (I.port) {                                          // 港口：北岸整地
    const lx = x - I.x, lz = z - I.z;
    if (lz > 10 && lz < 75 && Math.abs(lx) < 45) base = Math.max(Math.min(base, 3.2), lz < 70 ? 2.6 : base);
  }
  return Math.max(SEABED, base);
}
export function terrainH(x, z) {
  let h = SEABED;
  for (const I of ISLANDS) { if (Math.abs(x - I.x) < I.r * 1.4 && Math.abs(z - I.z) < I.r * 1.4) h = Math.max(h, islandH(I, x, z)); }
  return h;
}
export function nearestIsland(x, z) { let b = null, bd = 1e9; for (const I of ISLANDS) { const d = Math.hypot(x - I.x, z - I.z) - I.r; if (d < bd) { bd = d; b = I; } } return { I: b, d: bd }; }

// 港口碼頭（世界座標的矩形平台）：從南岸（+z）往外海延伸
const P = ISLANDS[0];
export const PIERS = [
  { x0: P.x - 4, x1: P.x + 4, z0: P.z + 60, z1: P.z + 150, y: 2.6 },   // 主棧橋
  { x0: P.x - 22, x1: P.x + 4, z0: P.z + 140, z1: P.z + 150, y: 2.6 }, // T 字頭
];
export const MERCHANT = { x: P.x + 10, z: P.z + 55, y: 2.6 };          // 收購商站在岸邊
export const SHIP_SPAWN = { x: P.x + 8.6, z: P.z + 112, heading: 0 };   // 船靠在棧橋東側，船頭朝外海(+z，南)
/** 可走的地面高度（地形或碼頭） */
export function groundH(x, z) {
  let h = terrainH(x, z);
  for (const p of PIERS) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) h = Math.max(h, p.y);
  return h;
}

/** 在某座島上找一個適合埋寶的陸地點 */
export function pickDigSpot(I, r) {
  for (let i = 0; i < 200; i++) {
    const a = r() * Math.PI * 2, d = r() * I.r * 0.7;
    const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, h = terrainH(x, z);
    if (h > 2.4 && h < I.h * 0.75) return { x, z };
  }
  return { x: I.x, z: I.z };
}
