// ===== 地形：海域、島嶼、港口、城堡（模擬與畫面共用）=====
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

// ---------- 海域（-z 為北）----------
export const SEAS = [
  { id: 0, name: '潮聲海', x: 0, z: 0, r: 1500, biome: 'temperate', pirates: ['raider', 'sloop', 'raider'], tint: [0x032a40, 0x0b4f66, 0x2fb3b0] },
  { id: 1, name: '北冰海', x: 0, z: -3400, r: 1400, biome: 'ice', pirates: ['frost', 'frost', 'sloop'], tint: [0x0a2a3e, 0x2a5d74, 0x7cc6d6] },
  { id: 2, name: '東珊瑚海', x: 3400, z: 0, r: 1400, biome: 'coral', pirates: ['sloop', 'raider', 'mist'], tint: [0x02364a, 0x0a6d82, 0x3fe0cf] },
  { id: 3, name: '南火山海', x: 0, z: 3400, r: 1400, biome: 'volcano', pirates: ['red', 'red', 'raider'], tint: [0x101c24, 0x24343a, 0x4f8f86] },
  { id: 4, name: '西霧海', x: -3400, z: 0, r: 1400, biome: 'mist', pirates: ['mist', 'mist', 'sloop'], tint: [0x0b2230, 0x26414c, 0x5f9a9c] },
];
export const WORLD_R = 5000;
export function seaAt(x, z) {
  let best = null, bd = 1e9;
  for (const S of SEAS) { const d = Math.hypot(x - S.x, z - S.z) / S.r; if (d < bd) { bd = d; best = S; } }
  return bd < 1.2 ? best : null;     // null = 公海
}

// ---------- 島嶼 ----------
export const ISLANDS = [
  { id: 0, name: '潮聲港', x: 0, z: -260, r: 95, h: 14, seed: 11, port: true, sea: 0 },
  { id: 1, name: '椰影島', x: 420, z: 140, r: 85, h: 16, seed: 23, sea: 0 },
  { id: 2, name: '鯨骨礁', x: -470, z: 260, r: 70, h: 10, seed: 37, sea: 0, castle: 0 },
  { id: 3, name: '落日島', x: 120, z: 700, r: 120, h: 26, seed: 41, sea: 0 },
  { id: 4, name: '雙峰島', x: -820, z: -180, r: 130, h: 42, seed: 53, sea: 0 },
  { id: 5, name: '翡翠環礁', x: 880, z: -320, r: 90, h: 8, seed: 67, sea: 0 },
  { id: 6, name: '迷霧岬', x: -360, z: 980, r: 105, h: 30, seed: 71, sea: 0 },
  { id: 7, name: '老鷹岩', x: 760, z: 820, r: 75, h: 34, seed: 83, sea: 0 },
  { id: 8, name: '月牙島', x: -980, z: 640, r: 95, h: 18, seed: 97, sea: 0 },
  { id: 9, name: '珊瑚灣', x: 300, z: -760, r: 100, h: 15, seed: 101, sea: 0 },
];
const NAMES = {
  1: { port: '北境港', castle: '霜狼島', isl: ['白熊島', '冰牙礁', '極光島', '雪峰島', '碎冰灣', '寒鴉岩', '霜鈴島'] },
  2: { port: '珊瑚港', castle: '鋼盾島', isl: ['珍珠島', '海龜礁', '藍潟湖', '椰林環礁', '魟魚灣', '七彩礁', '貝殼島'] },
  3: { port: '赤灣港', castle: '焰心島', isl: ['赤岩島', '熔岩島', '黑沙灘', '火鳥礁', '硫磺島', '灰燼灣', '煙柱岩'] },
  4: { port: '霧燈港', castle: '古堡島', isl: ['迷魂礁', '鬼火島', '沉鐘灣', '霧角島', '幽燈岩', '灰帆島', '無聲礁'] },
};
// 程式生成四片新海域的島群（固定種子，每台電腦一樣）
for (const S of SEAS.slice(1)) {
  const r = rng(S.id * 7919 + 13), placed = [];
  const ok = (x, z, rad) => placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + rad + 140) && Math.hypot(x - S.x, z - S.z) < S.r - rad - 60;
  const add = (o) => { o.id = ISLANDS.length; o.sea = S.id; o.seed = 200 + o.id * 13; ISLANDS.push(o); placed.push(o); return o; };
  // 港口：朝向世界中心那一側
  const toC = Math.atan2(-S.z, -S.x);
  add({ name: NAMES[S.id].port, x: S.x + Math.cos(toC) * S.r * 0.55, z: S.z + Math.sin(toC) * S.r * 0.55, r: 95, h: 14, port: true });
  // 城堡島：遠側
  add({ name: NAMES[S.id].castle, x: S.x - Math.cos(toC) * S.r * 0.45, z: S.z - Math.sin(toC) * S.r * 0.45, r: 82, h: 11, castle: S.id });
  for (const nm of NAMES[S.id].isl) {
    for (let k = 0; k < 60; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S.r * 0.85, rad = 65 + r() * 70;
      const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
      if (!ok(x, z, rad)) continue;
      const h = S.biome === 'volcano' ? 30 + r() * 34 : S.biome === 'ice' ? 16 + r() * 30 : S.biome === 'coral' ? 6 + r() * 10 : 14 + r() * 26;
      add({ name: nm, x, z, r: rad, h, volcano: S.biome === 'volcano' && r() < 0.6 });
      break;
    }
  }
  if (S.biome === 'ice') for (let i = 0; i < 18; i++) for (let k = 0; k < 30; k++) {   // 冰山
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S.r * 0.9, rad = 16 + r() * 18, x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
    if (!ok(x, z, rad)) continue; add({ name: '', x, z, r: rad, h: 7 + r() * 9, berg: true }); break;
  }
  if (S.biome === 'coral') for (let i = 0; i < 10; i++) for (let k = 0; k < 30; k++) {   // 小沙洲
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S.r * 0.9, rad = 22 + r() * 20, x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
    if (!ok(x, z, rad)) continue; add({ name: '', x, z, r: rad, h: 2.5 + r() * 2, cay: true }); break;
  }
}
for (const I of ISLANDS) { I.biome = SEAS[I.sea].biome; if (I.port) { I.h = 14; I.r = 95; } }

/** 單一島嶼在世界座標 (x,z) 的高度 */
function islandH(I, x, z) {
  const dx = x - I.x, dz = z - I.z, d = Math.hypot(dx, dz);
  if (d > I.r * 1.35) return SEABED;
  const ang = Math.atan2(dz, dx);
  const coast = I.r * (0.78 + 0.32 * fbm(Math.cos(ang) * 1.6 + I.seed, Math.sin(ang) * 1.6, I.seed, 3));
  const t = d / coast;
  let base;
  if (t < 1) {
    const sh = I.berg ? Math.pow(1 - t, 0.5) : Math.pow(1 - t, 1.6);
    base = 1.6 + (I.h - 1.6) * sh * (0.55 + 0.9 * fbm(x * 0.012, z * 0.012, I.seed + 5, 4));
    if (I.volcano) { base = 1.6 + (I.h - 1.6) * Math.pow(1 - t, 1.1); if (t < 0.16) base -= (0.16 - t) * I.h * 2.2; }   // 火山口
  } else base = 1.6 - (t - 1) * (I.berg ? 60 : 30);
  if (!I.berg && t < 1.08 && t > 0.82) base = Math.min(base, 1.6 + (1 - t) * 6);
  if (I.port) { const lx = x - I.x, lz = z - I.z; if (lz > 10 && lz < 75 && Math.abs(lx) < 45) base = Math.max(Math.min(base, 3.2), lz < 70 ? 2.6 : base); }
  if (I.castle !== undefined && d < 48) base = Math.max(Math.min(base, 4.2), 3.4);   // 城堡地基整平
  return Math.max(SEABED, base);
}
// 格狀索引：每格列出可能影響它的島
const CELL = 400, grid = new Map();
for (const I of ISLANDS) {
  const R = I.r * 1.4;
  for (let gx = Math.floor((I.x - R) / CELL); gx <= Math.floor((I.x + R) / CELL); gx++)
    for (let gz = Math.floor((I.z - R) / CELL); gz <= Math.floor((I.z + R) / CELL); gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(I); }
}
export function terrainH(x, z) {
  const L = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!L) return SEABED;
  let h = SEABED;
  for (const I of L) if (Math.abs(x - I.x) < I.r * 1.4 && Math.abs(z - I.z) < I.r * 1.4) h = Math.max(h, islandH(I, x, z));
  return h;
}
export function nearestIsland(x, z) { let b = null, bd = 1e9; for (const I of ISLANDS) { if (!I.name) continue; const d = Math.hypot(x - I.x, z - I.z) - I.r; if (d < bd) { bd = d; b = I; } } return { I: b, d: bd }; }

// ---------- 港口（每片海一個）----------
export const PORTS = ISLANDS.filter(I => I.port).map(P => ({
  isl: P.id, name: P.name, sea: P.sea,
  piers: [{ x0: P.x - 4, x1: P.x + 4, z0: P.z + 60, z1: P.z + 150, y: 2.6 }, { x0: P.x - 22, x1: P.x + 4, z0: P.z + 140, z1: P.z + 150, y: 2.6 }],
  merchant: { x: P.x + 10, z: P.z + 55, y: 2.6 },
}));
export const PIERS = PORTS.flatMap(p => p.piers);
export const MERCHANT = PORTS[0].merchant;
export const MERCHANTS = PORTS.map(p => ({ ...p.merchant, name: p.name, sea: p.sea }));
const P0 = ISLANDS[0];
export const SHIP_SPAWN = { x: P0.x + 8.6, z: P0.z + 112, heading: 0 };
export function nearestPort(x, z) { let b = null, bd = 1e9; for (const p of PORTS) { const I = ISLANDS[p.isl], d = Math.hypot(x - I.x, z - I.z); if (d < bd) { bd = d; b = p; } } return { p: b, d: bd }; }
export function groundH(x, z) {
  let h = terrainH(x, z);
  for (const p of PIERS) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) h = Math.max(h, p.y);
  return h;
}

// ---------- 城堡（每片海一座）----------
export const CASTLES = [
  { sea: 0, name: '黑鯊要塞', faction: 'shark', team: 2, tier: 1, towers: 4 },
  { sea: 1, name: '霜狼堡', faction: 'frost', team: 2, tier: 2, towers: 4 },
  { sea: 2, name: '國際海警東方基地', faction: 'navy', team: 3, tier: 3, towers: 6 },
  { sea: 3, name: '赤焰城', faction: 'red', team: 2, tier: 2, towers: 5 },
  { sea: 4, name: '幽霧古堡', faction: 'mist', team: 2, tier: 2, towers: 5 },
].map((C, i) => {
  const I = ISLANDS.find(J => J.castle === C.sea);
  const towers = [];
  for (let k = 0; k < C.towers; k++) { const a = k / C.towers * Math.PI * 2 + 0.4, x = I.x + Math.cos(a) * 32, z = I.z + Math.sin(a) * 32; towers.push({ x, z, y: terrainH(x, z) }); }
  const posts = [];
  const ng = 4 + C.tier * 2;
  for (let k = 0; k < ng; k++) { const a = k / ng * Math.PI * 2 + 0.2, d = k % 2 ? 14 : 24, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d; posts.push({ x, z, kind: k % 3 === 2 || (C.faction === 'navy' && k % 2) ? 'm' : 's' }); }
  return { ...C, id: i, isl: I.id, x: I.x, z: I.z, towersPos: towers, posts };
});

/** 在某座島上找一個適合埋寶的陸地點 */
export function pickDigSpot(I, r) {
  for (let i = 0; i < 200; i++) {
    const a = r() * Math.PI * 2, d = r() * I.r * 0.7;
    const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, h = terrainH(x, z);
    if (h > 2.4 && h < I.h * 0.75) return { x, z };
  }
  return { x: I.x, z: I.z };
}
