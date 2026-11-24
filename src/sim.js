// ===== 權威模擬（單人＝自己、連線＝房主執行）=====
import * as THREE from 'three';
import { waveHeight, sea } from './waves.js';
import { ISLANDS, terrainH, groundH, SHIP_SPAWN, MERCHANTS, WORLD_R, pickDigSpot, rng, SEAS, seaAt, CASTLES, nearestPort } from './geo.js';
import { DECK, HOLD, MAST, CANNONS, holdW, hullHit, sailHit, HOLD_Z, DECK_Z, deckW } from './shipdef.js';

export const TIER = {
  1: { name: '木製寶箱', gold: 120 }, 2: { name: '白銀寶箱', gold: 350 }, 3: { name: '黃金寶箱', gold: 900 },
  4: { name: '城堡金庫箱', gold: 1600 }, 5: { name: '海警軍餉箱', gold: 1200 }, 6: { name: '霸主寶藏', gold: 2600 },
};
export const AMMO = { n: '砲彈', c: '鏈彈', f: '火焰彈', x: '爆裂彈' };
export const AMMO_KEYS = ['n', 'c', 'f', 'x'];
export const BALL_V = 84, GRAV = 12, DRAG = 0.00042;
// 強化（全體船員共用）
export const UPS = {
  sword: { name: '劍', group: '武器', max: 5, base: 180, desc: '近戰傷害 +50%／級' },
  gun: { name: '火槍', group: '武器', max: 5, base: 260, desc: 'Lv1 買下火槍（按 7），之後傷害更高、裝填更快' },
  crew: { name: '船員體力', group: '武器', max: 5, base: 200, desc: '最大體力 +20／級' },
  hull: { name: '船殼', group: '船隻', max: 5, base: 300, desc: '破洞進水 −12%／級' },
  armor: { name: '裝甲', group: '船隻', max: 5, base: 380, desc: '被砲彈命中時不破洞機率 +10%／級' },
  sail: { name: '船帆', group: '船隻', max: 5, base: 280, desc: '航速 +6%／級' },
  guns: { name: '加裝大砲', group: '大砲', max: 2, costs: [900, 2000], desc: '每級多 2 門砲（4 → 6 → 8 門）' },
  barrel: { name: '砲管', group: '大砲', max: 5, base: 340, desc: '砲彈速度與射程 +5%／級' },
  powder: { name: '火藥', group: '大砲', max: 5, base: 420, desc: '命中多打一個洞的機率 +15%／級、打城堡 +20%／級' },
};
export const upCost = (k, lv) => UPS[k].costs ? UPS[k].costs[lv] : Math.round(UPS[k].base * Math.pow(lv + 1, 1.45) / 10) * 10;
export const swordDmg = W => 1 + 0.5 * W.up.sword;
export const gunDmg = W => 1.6 + 0.8 * W.up.gun;
export const gunReload = W => Math.max(0.7, 1.9 - 0.25 * W.up.gun);
export const maxHP = W => 100 + 20 * W.up.crew;

// 船種：team 0 我們、1 潮聲港海巡隊、2 海盜、3 國際海警
export const KINDS = {
  player: { team: 0, scale: 1, nc: 4, name: '我們的船', spd: 1 },
  ally: { team: 1, scale: 1, nc: 4, name: '海巡隊戰船', spd: 1.02, acc: 0.05, ammo: { c: 0.15, f: 0.15 } },
  sloop: { team: 2, scale: 0.85, nc: 4, name: '海蛇快艇', spd: 1.15, acc: 0.07, ammo: { c: 0.1, f: 0.1 }, loot: () => [R() < 0.6 ? 1 : 2] },
  raider: { team: 2, scale: 1, nc: 4, name: '黑鯊海盜船', spd: 0.97, acc: 0.06, ammo: { c: 0.2, f: 0.15 }, loot: () => R() < 0.5 ? [2] : [2, 3] },
  red: { team: 2, scale: 1.05, nc: 4, name: '赤焰海盜船', spd: 1, acc: 0.06, ammo: { f: 0.55, x: 0.05 }, loot: () => [2, 3] },
  frost: { team: 2, scale: 1.05, nc: 6, name: '霜狼海盜船', spd: 0.95, acc: 0.055, ammo: { c: 0.45 }, loot: () => [3, 2] },
  mist: { team: 2, scale: 1, nc: 4, name: '幽霧海盜船', spd: 1.1, acc: 0.05, ammo: { c: 0.15, f: 0.15 }, loot: () => [3, R() < 0.5 ? 2 : 3] },
  flag: { team: 2, scale: 1.32, nc: 6, name: '黑鯊旗艦', spd: 0.92, acc: 0.035, ammo: { c: 0.15, f: 0.15, x: 0.25 }, volley: 2, loot: () => [4, 3, 3] },
  warlord: { team: 2, scale: 1.55, nc: 8, name: '海盜霸主', spd: 0.9, acc: 0.03, ammo: { c: 0.15, f: 0.2, x: 0.3 }, volley: 2, loot: () => [6, 4, 3, 3] },
  cutter: { team: 3, scale: 0.9, nc: 4, name: '國際海警巡邏艇', spd: 1.18, acc: 0.035, ammo: { c: 0.3 }, loot: () => [5] },
  frigate: { team: 3, scale: 1.15, nc: 6, name: '國際海警巡防艦', spd: 1.0, acc: 0.03, ammo: { c: 0.2, x: 0.1 }, loot: () => [5, 3] },
  cruiser: { team: 3, scale: 1.5, nc: 8, name: '國際海警主力艦', spd: 0.9, acc: 0.025, ammo: { c: 0.15, x: 0.3 }, volley: 2, loot: () => [6, 5, 5] },
};
const R = Math.random;
const HOST = { '0,2': 1, '0,3': 1, '1,2': 1, '2,3': 1 };
export const hostile = (a, b) => a !== b && !!HOST[Math.min(a, b) + ',' + Math.max(a, b)];

/** 砲彈每一步的物理（空氣阻力＋重力）——房主、客戶端、彈道預覽都用它 */
export function ballStep(p, v, dt) {
  const sp = Math.hypot(v[0], v[1], v[2]), k = 1 - DRAG * sp * dt;
  v[0] *= k; v[1] = v[1] * k - GRAV * dt; v[2] *= k;
  p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
}
export function solvePitch(dist, dh, v0 = BALL_V) {
  let lo = -0.12, hi = 0.6;
  const reach = (pitch) => {
    const p = [0, 0, 0], v = [Math.cos(pitch) * v0, Math.sin(pitch) * v0, 0];
    for (let i = 0; i < 400; i++) { ballStep(p, v, 0.03); if (p[1] < dh && v[1] < 0) return p[0]; }
    return p[0];
  };
  if (reach(hi) < dist) return hi;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (reach(m) < dist) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function newShip(id, x, z, heading, kind = 'player') {
  const K = KINDS[kind];
  return {
    id, kind, team: K.team, scale: K.scale, nc: K.nc, x, z, heading, speed: 0, rudder: 0, sail: kind === 'player' ? 0 : 1, sailAng: 0,
    anchor: kind === 'player' ? 1 : 0, anchorDir: 0, water: 0, holes: [], fires: [], sailHP: 1,
    cannons: CANNONS.map(() => ({ yaw: 0, pitch: 0.08, loaded: 'n' })),
    sup: { n: 30, c: 6, f: 6, x: 2, p: 18 }, sink: 0, bump: 0, fireCD: [2 + R() * 3, 3 + R() * 3], repairCD: 8, hseq: 0, fseq: 0, age: 0, leave: 0, angry: 0,
  };
}

// ---------- 城堡 ----------
function newFort(C) { return { hp: C.towersPos.map(() => 6 + C.tier * 2), cd: C.towersPos.map(() => 3 + R() * 4), down: 0, open: 0, respawn: 0 }; }
function spawnGuards(W, ci) {
  const C = CASTLES[ci];
  W.guards = W.guards.filter(g => g.f !== ci);
  for (const p of C.posts) { const hp = (p.kind === 's' ? 4 : 3) + 2 * C.tier; W.guards.push({ id: W.seq++, f: ci, x: p.x, z: p.z, hx: p.x, hz: p.z, h: 0, hp, max: hp, k: p.kind, cd: 1 + R() * 2, mv: 0 }); }
}

export function newWorld(seed = (R() * 1e9) | 0) {
  const W = {
    t: 0, gold: 0, seed, seq: 1,
    wind: { a: 0.6, s: 0.85 }, amp: 0.8, day: 0.32,
    storm: { x: 650, z: 520, r: 340, vx: -6, vz: -3, on: 0 },
    ship: newShip(0, SHIP_SPAWN.x, SHIP_SPAWN.z, SHIP_SPAWN.heading, 'player'),
    npcs: [], treasures: [], quests: [], crabs: [], guards: [], balls: [],
    forts: CASTLES.map(newFort), up: Object.fromEntries(Object.keys(UPS).map(k => [k, 0])), bounty: null, fleet: null, wanted: 0,
    spawnT: 100, navyT: 150, fleetT: 330, bottleT: 40, events: [], sunk: 0,
  };
  CASTLES.forEach((C, i) => spawnGuards(W, i));
  const r = rng(seed);
  for (let i = 0; i < 2; i++) addQuest(W, r);
  return W;
}
export const allShips = W => [W.ship, ...W.npcs];

function addQuest(W, r = R) {
  if (W.quests.length >= 3) return null;
  const here = seaAt(W.ship.x, W.ship.z);
  let cand = ISLANDS.filter(I => I.name && !I.port && I.castle === undefined && !I.berg && !I.cay && !W.treasures.some(t => t.st === 'buried' && t.isl === I.id));
  if (r() < 0.6) { const near = cand.filter(I => I.sea === (here ? here.id : 0)); if (near.length) cand = near; }
  const I = cand[Math.floor(r() * cand.length)] || ISLANDS[1];
  const p = pickDigSpot(I, r), roll = r(), far = I.sea > 0 ? 1 : 0;
  const t = { id: W.seq++, tier: roll < 0.5 - far * 0.2 ? 1 : roll < 0.85 - far * 0.1 ? 2 : 3, st: 'buried', isl: I.id, x: p.x, y: terrainH(p.x, p.z), z: p.z, carrier: null };
  W.treasures.push(t); W.quests.push(t.id); return t;
}

// ---------- 船的姿態（所有電腦都用同樣公式）----------
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function waterlineLocal(s) { return 0.72 + s.water * 1.0; }
export function shipPose(s, t = sea.t, out = {}) {
  const sc = s.scale || 1, sh = Math.sin(s.heading), ch = Math.cos(s.heading);
  const at = (lx, lz) => waveHeight(s.x + (sh * lz + ch * lx) * sc, s.z + (ch * lz - sh * lx) * sc, t);
  const hb = at(0, 9), hs = at(0, -9), hp = at(-3, 0), hr = at(3, 0);
  let list = 0; for (const h of s.holes) list += h.x > 0 ? 1 : -1;
  const sk = s.sink;
  out.y = (hb + hs + hp + hr) / 4 - 0.72 * sc - s.water * 1.0 * sc + (sk > 0 ? -sk * sk * 0.12 - sk * 0.4 : 0);
  out.pitch = Math.atan2(hb - hs, 18 * sc) * 0.85 + (sk > 0 ? Math.min(0.75, sk * 0.07) * (s.id % 2 ? 1 : -1) : 0);
  out.roll = Math.atan2(hp - hr, 6 * sc) * 0.75 - s.rudder * Math.min(1, Math.abs(s.speed) / 8) * 0.06 - list * s.water * 0.05 + (sk > 0 ? sk * 0.045 * (s.id % 3 ? 1 : -1) : 0);
  out.hb = hb;
  _e.set(-out.pitch, s.heading, out.roll, 'YXZ'); _q.setFromEuler(_e);
  out.quat = (out.quat || new THREE.Quaternion()).copy(_q);
  out.mat = (out.mat || new THREE.Matrix4()).compose(_v.set(s.x, out.y, s.z), _q, _s.set(sc, sc, sc));
  out.inv = (out.inv || new THREE.Matrix4()).copy(out.mat).invert();
  return out;
}
export function cannonMuzzle(s, i, pose) {
  const c = CANNONS[i], cs = s.cannons[i];
  const th = (c.side > 0 ? Math.PI / 2 : -Math.PI / 2) + cs.yaw;
  const dir = new THREE.Vector3(Math.sin(th) * Math.cos(cs.pitch), Math.sin(cs.pitch), Math.cos(th) * Math.cos(cs.pitch));
  const p = new THREE.Vector3(c.x, DECK + 0.62, c.z).addScaledVector(dir, 1.35).applyMatrix4(pose.mat);
  dir.applyQuaternion(pose.quat);
  return { p, dir };
}
export function shipVel(s) { return [Math.sin(s.heading) * s.speed, Math.cos(s.heading) * s.speed]; }
export function muzzleV(W, s) { return BALL_V * (s.kind === 'player' ? 1 + 0.05 * W.up.barrel : s.team === 3 ? 1.06 : s.scale > 1.2 ? 1.05 : 1); }

// ---------- 物理 ----------
export function sailPower(s, wind) {
  const face = s.heading + s.sailAng * 0.9, c = Math.cos(wind.a - face);
  return Math.max(0.18, (c + 1) / 2) ** 1.3;
}
function stepShip(W, s, dt) {
  s.age += dt;
  if (s.sink > 0) { s.sink += dt; s.speed *= Math.exp(-dt * 0.8); s.x += Math.sin(s.heading) * s.speed * dt; s.z += Math.cos(s.heading) * s.speed * dt; return; }
  if (s.anchorDir > 0) { s.anchor = Math.min(1, s.anchor + dt * 0.9); if (s.anchor >= 1) s.anchorDir = 0; }
  else if (s.anchorDir < 0) { s.anchor = Math.max(0, s.anchor - dt * 0.22); if (s.anchor <= 0) s.anchorDir = 0; }
  const pw = sailPower(s, W.wind) * (0.25 + 0.75 * s.sailHP); s._power = pw;
  const kindF = s.kind === 'player' ? 1 + 0.06 * W.up.sail : KINDS[s.kind].spd;
  let target = s.sail * pw * 12.5 * W.wind.s * (1 + W.storm.on * 0.25) * (1 - s.water * 0.55) * kindF;
  if (s.anchor > 0.35) target = 0;
  s.speed += (target - s.speed) * dt * (s.anchor > 0.35 ? 1.4 : 0.22);
  const turn = s.rudder * 0.3 * (0.22 + Math.min(1, Math.abs(s.speed) / 6)) * (s.anchor > 0.35 ? 0.4 : 1) / Math.sqrt(s.scale);
  s.heading += turn * dt;
  let nx = s.x + Math.sin(s.heading) * s.speed * dt, nz = s.z + Math.cos(s.heading) * s.speed * dt;
  s.bump = Math.max(0, s.bump - dt);
  const sh = Math.sin(s.heading), ch = Math.cos(s.heading), sc = s.scale;
  for (const [lx, lz] of [[0, 12], [2.8, 6], [-2.8, 6], [3, -4], [-3, -4], [0, -10]]) {
    const wx = nx + (sh * lz + ch * lx) * sc, wz = nz + (ch * lz - sh * lx) * sc;
    if (terrainH(wx, wz) > -1.6 * sc) {
      if (s.bump <= 0 && Math.abs(s.speed) > 2.2) { addHole(W, s, lx, 0.6, lz); W.events.push({ e: 'bump', s: s.id, x: wx, z: wz }); s.bump = 1.5; }
      s.speed = -Math.sign(lz || 1) * Math.min(1.2, Math.abs(s.speed) * 0.3) * Math.sign(s.speed || 1);
      nx = s.x; nz = s.z; break;
    }
  }
  const d = Math.hypot(nx, nz); if (d > WORLD_R) { nx *= WORLD_R / d; nz *= WORLD_R / d; s.speed *= 0.9; }
  s.x = nx; s.z = nz;
  const wl = waterlineLocal(s), base = s.kind === 'player' ? 0.0095 * (1 - 0.12 * W.up.hull) : 0.017 / (s.scale * s.scale);
  let inflow = 0; for (const h of s.holes) inflow += h.y < wl + 0.25 ? 1 : 0.18 + W.storm.on * 0.3;
  s.water = Math.max(0, s.water + inflow * base * dt);
  for (const f of s.fires) {
    f.i = Math.min(1, f.i + dt * 0.035); f.age = (f.age || 0) + dt;
    if (s.kind !== 'player' && f.age > 6) f.i -= dt * 0.07;
    if (W.storm.on > 0.5) f.i -= dt * 0.04 * W.storm.on;
    if (f.i > 0.8 && R() < dt * 0.06 && s.fires.length < 7) startFire(W, s, f.x + (R() - .5) * 4, f.z + (R() - .5) * 4, 0.25);
    s.water += f.i * 0.0007 * dt;
    if (Math.hypot(f.x - MAST.x, f.z - MAST.z) < 2.5) s.sailHP = Math.max(0, s.sailHP - dt * 0.012 * f.i);
    if (f.i > 0.7 && R() < dt * 0.012) addHole(W, s, f.x > 0 ? 1 : -1, 1.8, f.z);
  }
  s.fires = s.fires.filter(f => f.i > 0);
  if (s.water >= 1) { s.water = 1; s.sink = 0.01; W.events.push({ e: 'sinking', s: s.id, x: s.x, z: s.z, k: s.kind }); }
}
function addHole(W, s, lx, ly, lz) {
  if (s.holes.length >= 14) { s.water = Math.min(1, s.water + 0.035); return; }
  const z = Math.max(HOLD_Z[0] + 0.6, Math.min(HOLD_Z[1] - 0.8, lz));
  const side = lx >= 0 ? 1 : -1, x = side * (holdW(z) + 0.02);
  const y = Math.max(HOLD + 0.35, Math.min(DECK - 0.4, ly + (R() - 0.5) * 0.3));
  s.holes.push({ id: ++s.hseq, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
}
function startFire(W, s, lx, lz, i = 0.35) {
  lz = Math.max(DECK_Z[0] + 1, Math.min(DECK_Z[1] - 1.5, lz)); const w = deckW(lz) - 0.6; lx = Math.max(-w, Math.min(w, lx));
  const near = s.fires.find(f => Math.hypot(f.x - lx, f.z - lz) < 1.6);
  if (near) { near.i = Math.min(1, near.i + i); return; }
  if (s.fires.length >= 7) return;
  s.fires.push({ id: ++s.fseq, x: +lx.toFixed(2), z: +lz.toFixed(2), i });
}

// ---------- NPC 船 AI ----------
function wantsToFight(W, s, o) {
  if (!hostile(s.team, o.team)) return false;
  if (s.team === 3 && o.team === 0) return W.wanted >= 0.5 || s.angry;   // 海警：有通緝或被打才追我們
  return true;
}
function pickTarget(W, s) {
  let best = null, bd = s.team === 2 ? 700 : 900;
  for (const o of allShips(W)) { if (o === s || o.sink > 0 || !wantsToFight(W, s, o)) continue; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < bd) { bd = d; best = o; } }
  return best;
}
function stepNPC(W, e, dt) {
  if (e.sink > 0) return;
  const T = e.leave ? null : pickTarget(W, e), K = KINDS[e.kind];
  let want;
  if (!T) {
    if (e.team === 1) want = Math.atan2(ISLANDS[0].x - e.x, ISLANDS[0].z - e.z);
    else {   // 巡航到隨機航點
      if (!e.wp || Math.hypot(e.wp[0] - e.x, e.wp[1] - e.z) < 60) { const S = seaAt(e.x, e.z) || SEAS[0]; const a = R() * 6.28, d = R() * S.r * 0.8; e.wp = [S.x + Math.cos(a) * d, S.z + Math.sin(a) * d]; }
      want = Math.atan2(e.wp[0] - e.x, e.wp[1] - e.z);
    }
    e._td = 1e9;
  } else {
    const dx = T.x - e.x, dz = T.z - e.z, d = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz);
    e._td = d;
    if (d > 170) want = bearing + (e.id % 2 ? 0.3 : -0.3);
    else {
      const ready = e.fireCD[0] < e.fireCD[1] ? 0 : 1, side = ready ? -1 : 1;
      want = bearing - side * Math.PI / 2;
      if (d < 70) want += side * 0.45; else if (d > 140) want -= side * 0.35;
    }
  }
  let vx = Math.sin(want), vz = Math.cos(want);
  for (const o of allShips(W)) { if (o === e) continue; const ox = e.x - o.x, oz = e.z - o.z, d = Math.hypot(ox, oz); if (d < 45 * e.scale && d > 0.1) { const k = (45 * e.scale - d) / 45 * 1.8; vx += ox / d * k; vz += oz / d * k; } }
  want = Math.atan2(vx, vz);
  for (const look of [35, 70]) {
    const lx = e.x + Math.sin(e.heading) * look * e.scale, lz = e.z + Math.cos(e.heading) * look * e.scale;
    if (terrainH(lx, lz) > -4) { const l = terrainH(e.x + Math.sin(e.heading - 0.7) * look, e.z + Math.cos(e.heading - 0.7) * look); want = e.heading + (l > -4 ? 1.2 : -1.2); break; }
  }
  e.rudder += (Math.max(-1, Math.min(1, angDiff(want, e.heading) * 2.2)) - e.rudder) * dt * 2;
  e.sail = T && e._td < 160 ? 0.75 : T ? 1 : 0.6; e.anchor = 0;
  e.repairCD -= dt; if (e.repairCD <= 0 && e.holes.length) { e.holes.shift(); e.repairCD = e.scale > 1.2 ? 6 : 9; }
  e.water = Math.max(0, e.water - dt * 0.003); e.sailHP = Math.min(1, e.sailHP + dt * 0.006);
  for (let sIdx = 0; sIdx < 2; sIdx++) {
    e.fireCD[sIdx] -= dt; if (!T || e.fireCD[sIdx] > 0) continue;
    const d = e._td; if (d > 260) continue;
    const side = sIdx ? -1 : 1, broad = e.heading + side * Math.PI / 2, bearing = Math.atan2(T.x - e.x, T.z - e.z);
    if (Math.abs(angDiff(bearing, broad)) > 0.55) continue;
    const v0 = muzzleV(W, e), flight = d / (v0 * 0.85); const [tvx, tvz] = shipVel(T);
    const tx = T.x + tvx * flight, tz = T.z + tvz * flight, td = Math.hypot(tx - e.x, tz - e.z);
    const yaw = Math.max(-0.6, Math.min(0.6, angDiff(Math.atan2(tx - e.x, tz - e.z), broad)));
    const pitch = solvePitch(td, -2, v0) + (R() - 0.45) * (K.acc || 0.06);
    let ammo = 'n', rr = R();
    for (const [a, p] of Object.entries(K.ammo || {})) { if (a === 'c' && T.sailHP < 0.4) continue; if (rr < p) { ammo = a; break; } rr -= p; }
    const list = CANNONS.map((c, i) => i).filter(i => i < e.nc && CANNONS[i].side === side);
    const volleys = K.volley || 1;
    for (let v = 0; v < volleys; v++) list.forEach((i, k) => { e.cannons[i].yaw = yaw + (R() - 0.5) * 0.05; e.cannons[i].pitch = pitch; W.later.push({ t: W.t + (v * list.length + k) * 0.36 + R() * 0.15, f: () => fire(W, e, i, ammo) }); });
    e.fireCD[sIdx] = (e.scale > 1.2 ? 6 : 7) + R() * 2.5;
  }
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function fire(W, s, i, ammo = 'n') {
  if (s.sink > 0 || i >= s.nc) return;
  const pose = shipPose(s, W.t, {}); const { p, dir } = cannonMuzzle(s, i, pose); const [vx, vz] = shipVel(s), v0 = muzzleV(W, s);
  addBall(W, s.id, s.team, [p.x, p.y, p.z], [dir.x * v0 + vx, dir.y * v0, dir.z * v0 + vz], ammo, i);
}
function addBall(W, o, team, p, v, a, i = -1) {
  const b = { id: W.seq++, o, team, p, v, a, life: 12, sk: 0, sails: [] };
  W.balls.push(b); W.events.push({ e: 'fire', id: b.id, o, i, a, p: p.map(n => +n.toFixed(2)), v: v.map(n => +n.toFixed(2)) });
}
function addWanted(W, n, why) {
  const before = Math.floor(W.wanted); W.wanted = Math.min(5, W.wanted + n);
  if (Math.floor(W.wanted) > before) W.events.push({ e: 'msg', t: `🚨 通緝等級上升：${'★'.repeat(Math.floor(W.wanted))}（${why}）國際海警會派更強的船來抓你們！`, warn: 1 });
}

// ---------- 砲彈 ----------
const _lp = new THREE.Vector3();
function hurtPlayers(W, players, s, lx, ly, lz, r, n) {
  if (s.id !== 0) return;
  for (const pl of players) if (pl.onShip && pl.lp && !pl.dead) { const d = Math.hypot(pl.lp[0] - lx, pl.lp[1] - ly, pl.lp[2] - lz); if (d < r) W.events.push({ e: 'dmg', pid: pl.id, n: Math.round(n * (1 - d / r * 0.5)) }); }
}
function stepBalls(W, dt, players) {
  const ships = allShips(W).filter(s => s.sink < 3);
  const poses = new Map();
  const pz = 1 + 0.15 * W.up.powder;
  for (const b of W.balls) {
    ballStep(b.p, b.v, dt); b.life -= dt;
    for (const s of ships) {
      if (s.id === b.o || !hostile(b.team, s.team)) continue;
      if (Math.abs(b.p[0] - s.x) > 30 * s.scale || Math.abs(b.p[2] - s.z) > 30 * s.scale) continue;
      if (!poses.has(s.id)) poses.set(s.id, shipPose(s, W.t, {}));
      _lp.set(b.p[0], b.p[1], b.p[2]).applyMatrix4(poses.get(s.id).inv);
      if (!b.sails.includes(s.id) && sailHit(_lp.x, _lp.y, _lp.z, s.sailAng)) {
        b.sails.push(s.id); s.sailHP = Math.max(0, s.sailHP - (b.a === 'c' ? 0.3 : 0.07));
        W.events.push({ e: 'sailhit', s: s.id, x: +b.p[0].toFixed(1), y: +b.p[1].toFixed(1), z: +b.p[2].toFixed(1), a: b.a });
        if (b.a === 'c') { b.dead = 1; break; }
      }
      if (hullHit(_lp.x, _lp.y, _lp.z)) {
        b.dead = 1; const deckHit = _lp.y > DECK - 0.1, mine = b.o === 0;
        const deflect = s.id === 0 && R() < 0.1 * W.up.armor;
        const hole = (ly = _lp.y, dz = 0) => { if (!deflect) addHole(W, s, _lp.x, ly, _lp.z + dz); };
        const extra = () => { if (mine && R() < pz - 1) hole(_lp.y - 0.5, (R() - .5) * 3); };
        if (b.a === 'n') { if (!deckHit) { hole(); extra(); } hurtPlayers(W, players, s, _lp.x, _lp.y, _lp.z, deckHit ? 3 : 2.4, 38); if (deckHit && R() < 0.12) startFire(W, s, _lp.x, _lp.z, 0.2); }
        else if (b.a === 'c') { s.sailHP = Math.max(0, s.sailHP - 0.18); if (R() < 0.3 && !deckHit) hole(); hurtPlayers(W, players, s, _lp.x, _lp.y, _lp.z, 2.5, 25); }
        else if (b.a === 'f') { if (!deckHit && R() < 0.5) hole(); startFire(W, s, _lp.x, _lp.z, 0.45); extra(); hurtPlayers(W, players, s, _lp.x, _lp.y, _lp.z, 2.4, 22); }
        else if (b.a === 'x') { hole(); hole(_lp.y - 0.6, (R() - .5) * 3); extra(); if (R() < 0.4) startFire(W, s, _lp.x, _lp.z, 0.4); s.sailHP = Math.max(0, s.sailHP - 0.08); hurtPlayers(W, players, s, _lp.x, _lp.y, _lp.z, 4.2, 60); }
        if (mine && s.team === 3) { s.angry = 1; addWanted(W, 0.15, '攻擊國際海警'); }
        if (b.team === 3 && s.team === 2) s.angry = 1;
        W.events.push({ e: 'hit', id: b.id, x: +b.p[0].toFixed(1), y: +b.p[1].toFixed(1), z: +b.p[2].toFixed(1), s: s.id, a: b.a, d: deckHit ? 1 : 0, by: b.o, df: deflect ? 1 : 0 });
        break;
      }
    }
    if (b.dead) continue;
    // 城堡砲塔
    for (let ci = 0; ci < CASTLES.length && !b.dead; ci++) {
      const C = CASTLES[ci], F = W.forts[ci];
      if (F.down || !hostile(b.team, C.team) || Math.abs(b.p[0] - C.x) > 50 || Math.abs(b.p[2] - C.z) > 50) continue;
      C.towersPos.forEach((T, i) => {
        if (b.dead || F.hp[i] <= 0) return;
        if (Math.hypot(b.p[0] - T.x, b.p[2] - T.z) < 4.6 && b.p[1] > T.y - 1 && b.p[1] < T.y + 12) {
          b.dead = 1; F.hp[i] -= (b.a === 'x' ? 3 : b.a === 'f' ? 1.5 : 1) * (b.o === 0 ? 1 + 0.2 * W.up.powder : 1);
          W.events.push({ e: 'thit', id: b.id, x: b.p[0], y: b.p[1], z: b.p[2], a: b.a });
          if (b.o === 0 && C.team === 3) addWanted(W, 0.1, '砲轟海警基地');
          if (F.hp[i] <= 0) {
            F.hp[i] = 0; const left = F.hp.filter(h => h > 0).length;
            W.events.push({ e: 'tdown', i, c: ci, x: T.x, y: T.y + 8, z: T.z }, { e: 'msg', t: `💥 ${C.name}的砲塔被摧毀！（剩 ${left} 座）` });
            if (C.team === 3 && b.o === 0) addWanted(W, 0.5, '摧毀海警砲塔');
          }
        }
      });
    }
    if (b.dead) continue;
    if (b.p[1] < groundH(b.p[0], b.p[2]) + 0.1) { b.dead = 1; W.events.push({ e: 'boom', id: b.id, x: b.p[0], y: b.p[1], z: b.p[2], a: b.a }); hitGuardsArea(W, b.p[0], b.p[2], b.a === 'x' ? 6 : 3.5, b.a === 'x' ? 6 : 3); continue; }
    const wh = waveHeight(b.p[0], b.p[2], W.t);
    if (b.p[1] < wh) {
      const hs = Math.hypot(b.v[0], b.v[2]);
      if (b.a !== 'x' && b.sk < 2 && Math.abs(b.v[1]) < hs * 0.2 && hs > 38) {
        b.sk++; b.v[1] = Math.abs(b.v[1]) * 0.45 + 2; b.v[0] *= 0.62; b.v[2] *= 0.62; b.p[1] = wh + 0.05;
        W.events.push({ e: 'skip', id: b.id, p: b.p.map(n => +n.toFixed(2)), v: b.v.map(n => +n.toFixed(2)) });
      } else { b.dead = 1; W.events.push({ e: 'splash', id: b.id, x: +b.p[0].toFixed(1), z: +b.p[2].toFixed(1), a: b.a }); }
      continue;
    }
    if (b.life < 0) { b.dead = 1; W.events.push({ e: 'splash', id: b.id, x: +b.p[0].toFixed(1), z: +b.p[2].toFixed(1), a: b.a }); }
  }
  W.balls = W.balls.filter(b => !b.dead);
}
function hitGuardsArea(W, x, z, r, dmg) { for (const g of W.guards) if (Math.hypot(g.x - x, g.z - z) < r) damageGuard(W, g, dmg); }
function damageGuard(W, g, n) {
  g.hp -= n; g.cd = Math.max(g.cd, 0.4); W.events.push({ e: 'ghit', id: g.id, x: g.x, z: g.z });
  if (g.hp <= 0 && !g.dead) {
    g.dead = 1; const C = CASTLES[g.f]; W.gold += 10 * C.tier;
    W.events.push({ e: 'gdown', id: g.id, x: g.x, z: g.z, g: 10 * C.tier });
    if (C.team === 3) addWanted(W, 0.08, '擊倒海警守軍');
  }
}

// ---------- 船與船相撞 ----------
function shipSeg(s) { const sc = s.scale, sh = Math.sin(s.heading), ch = Math.cos(s.heading); return [[s.x + sh * 11 * sc, s.z + ch * 11 * sc], [s.x - sh * 10 * sc, s.z - ch * 10 * sc]]; }
function segDist(a, b) {
  let best = { d: 1e9 };
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const p = [a[0][0] + (a[1][0] - a[0][0]) * i / 6, a[0][1] + (a[1][1] - a[0][1]) * i / 6], q = [b[0][0] + (b[1][0] - b[0][0]) * j / 6, b[0][1] + (b[1][1] - b[0][1]) * j / 6];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best.d) best = { d, p, q };
  }
  return best;
}
function collideShips(W) {
  const L = allShips(W).filter(s => s.sink <= 0);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const A = L[i], B = L[j]; if (Math.hypot(A.x - B.x, A.z - B.z) > 32 * Math.max(A.scale, B.scale)) continue;
    const r = segDist(shipSeg(A), shipSeg(B)), rad = 3.1 * A.scale + 3.1 * B.scale;
    if (r.d >= rad) continue;
    const nx = (r.p[0] - r.q[0]) / (r.d || 1), nz = (r.p[1] - r.q[1]) / (r.d || 1), push = (rad - r.d) * 0.5;
    A.x += nx * push; A.z += nz * push; B.x -= nx * push; B.z -= nz * push;
    const [ax, az] = shipVel(A), [bx, bz] = shipVel(B), rel = Math.abs((ax - bx) * nx + (az - bz) * nz);
    if (rel > 3 && (A.bump <= 0 || B.bump <= 0)) {
      for (const [S, px, pz] of [[A, r.p[0], r.p[1]], [B, r.q[0], r.q[1]]]) {
        const sh = Math.sin(S.heading), ch = Math.cos(S.heading), dx = (px - S.x) / S.scale, dz = (pz - S.z) / S.scale;
        addHole(W, S, dx * ch - dz * sh, 0.9, dx * sh + dz * ch); S.bump = 1.5;
      }
      W.events.push({ e: 'ram', x: (r.p[0] + r.q[0]) / 2, z: (r.p[1] + r.q[1]) / 2, s: [A.id, B.id] });
    }
    A.speed *= 0.7; B.speed *= 0.7;
  }
}

// ---------- 城堡與守軍 ----------
function stepForts(W, dt, players) {
  CASTLES.forEach((C, ci) => {
    const F = W.forts[ci];
    if (F.open) { F.respawn -= dt; if (F.respawn <= 0) { W.forts[ci] = newFort(C); spawnGuards(W, ci); W.events.push({ e: 'msg', t: `⚠ ${C.name}重新架起了砲塔、補滿了守軍！` }); } return; }
    if (!F.down) for (let i = 0; i < C.towersPos.length; i++) {
      if (F.hp[i] <= 0) continue; F.cd[i] -= dt; if (F.cd[i] > 0) continue;
      const T = C.towersPos[i]; let tg = null, bd = 330;
      for (const s of allShips(W)) {
        if (s.sink > 0 || !hostile(C.team, s.team)) continue;
        if (C.team === 3 && s.team === 0 && W.wanted < 0.5 && Math.hypot(s.x - C.x, s.z - C.z) > 220) continue;
        const d = Math.hypot(s.x - T.x, s.z - T.z); if (d < bd) { bd = d; tg = s; }
      }
      if (!tg) { F.cd[i] = 2; continue; }
      if (C.team === 3 && tg.team === 0 && W.wanted < 1) addWanted(W, 1, '闖進海警基地');
      const v0 = BALL_V * 1.05, [vx, vz] = shipVel(tg), fl = bd / (v0 * 0.85), tx = tg.x + vx * fl, tz = tg.z + vz * fl, td = Math.hypot(tx - T.x, tz - T.z);
      const my = T.y + 10, pitch = solvePitch(td, -my, v0) + (R() - 0.5) * 0.03, a = Math.atan2(tx - T.x, tz - T.z);
      const rr = R(), ammo = rr < 0.12 + C.tier * 0.06 ? 'x' : rr < 0.4 ? (C.faction === 'frost' ? 'c' : 'f') : 'n';
      addBall(W, 'T' + ci + '_' + i, C.team, [T.x + Math.sin(a) * 4, my, T.z + Math.cos(a) * 4], [Math.sin(a) * Math.cos(pitch) * v0, Math.sin(pitch) * v0, Math.cos(a) * Math.cos(pitch) * v0], ammo);
      F.cd[i] = 6 - C.tier * 0.6 + R() * 3;
    }
    if (!F.down && F.hp.every(h => h <= 0)) {
      F.down = 1; W.gold += 150 * C.tier;
      const left = W.guards.filter(g => g.f === ci).length;
      W.events.push({ e: 'msg', t: `🏴 ${C.name}的砲塔全毀！+${150 * C.tier} 金。${left ? `還有 ${left} 名守軍，上岸打倒他們就能打開金庫！` : ''}`, warn: 1 }, { e: 'coin' });
    }
    if (F.down && !F.open && !W.guards.some(g => g.f === ci)) {
      F.open = 1; F.respawn = 900;
      const I = ISLANDS[C.isl], loot = C.team === 3 ? [5, 6, 5] : C.tier >= 2 ? [4, 3, 4] : [3, 4, 3];
      loot.forEach((tier, k) => { const x = I.x + (k - 1) * 2.4, z = I.z + 1; W.treasures.push({ id: W.seq++, tier, st: 'ground', x, y: terrainH(x, z), z, carrier: null }); });
      W.events.push({ e: 'msg', t: `🗝 ${C.name}攻陷！金庫打開了，寶箱就在城堡中央，扛回船上！`, warn: 1 }, { e: 'coin' }, { e: 'fortdown', c: ci });
    }
  });
  // 守軍
  for (const g of W.guards) {
    if (g.dead) continue;
    const C = CASTLES[g.f]; g.cd -= dt; g.mv = 0;
    let tgt = null, td = 42;
    for (const pl of players) if (!pl.onShip && !pl.dead && pl.wp) { const d = Math.hypot(pl.wp[0] - g.x, pl.wp[2] - g.z); if (d < td && Math.hypot(pl.wp[0] - g.hx, pl.wp[2] - g.hz) < 80 && Math.abs(pl.wp[1] - terrainH(g.x, g.z)) < 6) { td = d; tgt = pl; } }
    if (!tgt && Math.hypot(W.ship.x - C.x, W.ship.z - C.z) > 400) { g.x += (g.hx - g.x) * Math.min(1, dt); g.z += (g.hz - g.z) * Math.min(1, dt); continue; }
    const move = (tx, tz, sp) => { const a = Math.atan2(tx - g.x, tz - g.z), nx = g.x + Math.sin(a) * sp * dt, nz = g.z + Math.cos(a) * sp * dt; if (terrainH(nx, nz) > 1) { g.x = nx; g.z = nz; g.mv = 1; } g.h = a; };
    if (!tgt) { if (Math.hypot(g.hx - g.x, g.hz - g.z) > 1) move(g.hx, g.hz, 2.2); continue; }
    g.h = Math.atan2(tgt.wp[0] - g.x, tgt.wp[2] - g.z);
    if (g.k === 's') {
      if (td > 1.6) move(tgt.wp[0], tgt.wp[2], 3.7);
      else if (g.cd <= 0) { g.cd = 1.1; W.events.push({ e: 'dmg', pid: tgt.id, n: 8 + 3 * C.tier, src: 'guard' }, { e: 'gswing', id: g.id }); }
    } else {
      if (td > 24) move(tgt.wp[0], tgt.wp[2], 3.2); else if (td < 7) move(g.x * 2 - tgt.wp[0], g.z * 2 - tgt.wp[2], 2.8);
      if (g.cd <= 0 && td < 34) {
        g.cd = 2.8 + R(); const hit = R() < (C.team === 3 ? 0.6 : 0.5) - td * 0.006;
        const gy = terrainH(g.x, g.z);
        W.events.push({ e: 'shot', x: g.x + Math.sin(g.h) * 0.6, y: gy + 1.4, z: g.z + Math.cos(g.h) * 0.6, tx: tgt.wp[0] + (hit ? 0 : (R() - .5) * 3), ty: tgt.wp[1] + 1.2 + (hit ? 0 : R() * 1.5), tz: tgt.wp[2] + (hit ? 0 : (R() - .5) * 3) });
        if (hit) W.events.push({ e: 'dmg', pid: tgt.id, n: 12 + 3 * C.tier, src: 'gun' });
      }
    }
  }
  W.guards = W.guards.filter(g => !g.dead);
}

// ---------- 生成：海盜、海警、艦隊 ----------
function spawnAt(W, dist, kind, near = null) {
  const P = near || W.ship;
  for (let k = 0; k < 14; k++) {
    const a = R() * Math.PI * 2, x = P.x + Math.cos(a) * dist, z = P.z + Math.sin(a) * dist;
    if (terrainH(x, z) < -15 && Math.hypot(x, z) < WORLD_R - 50) { const e = newShip(100 + W.seq++, x, z, Math.atan2(W.ship.x - x, W.ship.z - z), kind); W.npcs.push(e); return e; }
  }
  return null;
}
function spawnFleet(W) {
  const P = W.ship, f = spawnAt(W, 480, 'flag'); if (!f) return;
  const ids = [f.id], h = f.heading;
  for (const ox of [-40, 40]) { const e = newShip(100 + W.seq++, f.x + Math.cos(h) * ox - Math.sin(h) * 30, f.z - Math.sin(h) * ox - Math.cos(h) * 30, h, 'raider'); W.npcs.push(e); ids.push(e.id); }
  const pa = Math.atan2(ISLANDS[0].x - P.x, ISLANDS[0].z - P.z);
  for (const off of [-0.5, 0.5]) for (let tries = 0; tries < 6; tries++) {
    const x = P.x + Math.sin(pa + off + tries * 0.4) * 150, z = P.z + Math.cos(pa + off + tries * 0.4) * 150;
    if (terrainH(x, z) < -12) { W.npcs.push(newShip(100 + W.seq++, x, z, h, 'ally')); break; }
  }
  W.fleet = { ids };
  W.events.push({ e: 'msg', t: '⚠⚠ 黑鯊艦隊來襲！旗艦與兩艘護衛艦正逼近，潮聲港海巡隊派兩艘戰船來支援！', warn: 1 }, { e: 'fleet' });
}
function spawnTick(W, dt) {
  const P = W.ship; if (P.sink > 0) return;
  const S = seaAt(P.x, P.z), portD = nearestPort(P.x, P.z).d;
  // 海盜
  W.spawnT -= dt;
  const pirates = W.npcs.filter(e => e.team === 2 && !(W.fleet && W.fleet.ids.includes(e.id))).length;
  const cap = 1 + (S && S.id > 0 ? 1 : 0) + (W.gold > 2500 ? 1 : 0) + (!S ? 1 : 0);
  if (W.spawnT <= 0 && pirates < cap && portD > 260) {
    const list = S ? S.pirates : ['raider', 'red', 'frost', 'mist', 'sloop'];
    let kind = list[Math.floor(R() * list.length)];
    if ((S ? S.id > 0 : true) && !W.npcs.some(e => e.kind === 'warlord') && R() < 0.1) kind = 'warlord';
    const e = spawnAt(W, 440, kind);
    if (e) W.events.push({ e: 'msg', t: kind === 'warlord' ? '☠ 瞭望：海平線上出現一艘巨大的黑船——海盜霸主！' : `⚠ 瞭望：遠方出現${KINDS[kind].name}！`, warn: 1 });
    W.spawnT = 140 + R() * 100;
  }
  // 國際海警
  W.navyT -= dt;
  const navy = W.npcs.filter(e => e.team === 3).length, wl = Math.floor(W.wanted);
  if (W.navyT <= 0 && navy < 1 + Math.ceil(wl / 2) && (portD > 300 || wl >= 2)) {
    const kind = wl >= 4 ? 'cruiser' : wl >= 2 ? (R() < 0.6 ? 'frigate' : 'cutter') : R() < 0.75 ? 'cutter' : 'frigate';
    const e = spawnAt(W, 470, kind);
    if (e) {
      if (wl >= 4) for (let i = 0; i < 2; i++) { const f = newShip(100 + W.seq++, e.x + (i ? 40 : -40), e.z + 30, e.heading, 'frigate'); W.npcs.push(f); }
      W.events.push({ e: 'msg', t: W.wanted >= 0.5 ? `🚨 ${KINDS[kind].name}${wl >= 4 ? '率領艦隊' : ''}來追捕你們了！` : `⚓ 遠方有一艘${KINDS[kind].name}在巡邏（會攻擊海盜；打它會被通緝，但能搶到軍餉箱）`, warn: W.wanted >= 0.5 ? 1 : 0 });
    }
    W.navyT = Math.max(60, 220 - W.wanted * 30) + R() * 60;
  }
  // 艦隊
  if (portD > 260 && !W.fleet) { W.fleetT -= dt; if (W.fleetT <= 0) { spawnFleet(W); W.fleetT = 999; } }
}

// ---------- 主迴圈 ----------
let seaNow = null;
export function step(W, dt, players) {
  W.t += dt; sea.t = W.t;
  W.later = W.later || [];
  for (const L of W.later) if (L.t <= W.t) { L.f(); L.done = 1; }
  W.later = W.later.filter(L => !L.done);
  W.day = (W.day + dt / 1200) % 1;
  W.wind.a += Math.sin(W.t * 0.011) * dt * 0.006; W.wind.s = 0.75 + 0.2 * Math.sin(W.t * 0.017 + 1);
  const st = W.storm; st.x += st.vx * dt; st.z += st.vz * dt;
  if (Math.hypot(st.x - W.ship.x, st.z - W.ship.z) > 2600) { const a = R() * Math.PI * 2; st.x = W.ship.x + Math.cos(a) * 1500; st.z = W.ship.z + Math.sin(a) * 1500; const b = a + Math.PI + (R() - 0.5); st.vx = Math.cos(b) * 7; st.vz = Math.sin(b) * 7; }
  const sd = Math.hypot(W.ship.x - st.x, W.ship.z - st.z);
  const S = seaAt(W.ship.x, W.ship.z);
  st.on = Math.max(0, Math.min(1, (st.r * 1.25 - sd) / (st.r * 0.5)));
  W.amp = 0.75 + st.on * 1.35 + (S && S.biome === 'ice' ? 0.25 : !S ? 0.35 : 0); sea.amp = W.amp;
  if (S !== seaNow) { seaNow = S; W.events.push({ e: 'sea', n: S ? S.name : '公海' }); }

  stepShip(W, W.ship, dt);
  for (const e of W.npcs) { stepNPC(W, e, dt); stepShip(W, e, dt); }
  collideShips(W);
  stepBalls(W, dt, players);
  stepForts(W, dt, players);
  for (const pl of players) if (pl.onShip && pl.lp && !pl.dead && pl.lp[1] > DECK - 0.5) for (const f of W.ship.fires) if (Math.hypot(pl.lp[0] - f.x, pl.lp[2] - f.z) < 1.3 * (0.6 + f.i)) { pl._burn = (pl._burn || 0) + dt; if (pl._burn > 0.6) { pl._burn = 0; W.events.push({ e: 'dmg', pid: pl.id, n: 7, src: 'fire' }); } }

  // NPC 沉沒與戰利品
  for (const e of W.npcs) if (e.sink > 0 && !e.counted) {
    e.counted = 1; const K = KINDS[e.kind];
    if (e.team === 2) {
      W.sunk++; W.events.push({ e: 'msg', t: `${K.name}沉沒了！海面浮起了戰利品。` });
      if (W.bounty) { W.bounty.done++; if (W.bounty.done >= W.bounty.need) { W.gold += W.bounty.reward; W.events.push({ e: 'msg', t: `🎖 懸賞完成！獲得 ${W.bounty.reward} 金` }, { e: 'coin' }); W.bounty = null; } }
    } else if (e.team === 3) { W.events.push({ e: 'msg', t: `${K.name}沉沒了！軍餉箱漂在海上，快去撈！` }); if (e.angry) addWanted(W, 1, '擊沉國際海警'); }
    else W.events.push({ e: 'msg', t: '海巡隊戰船被擊沉了⋯⋯', warn: 1 });
  }
  for (const e of W.npcs) if (e.sink > 12 && !e.gone) {
    e.gone = 1; const K = KINDS[e.kind];
    if (K.loot) K.loot().forEach(tier => W.treasures.push({ id: W.seq++, tier, st: 'float', x: e.x + (R() - .5) * 14, y: 0, z: e.z + (R() - .5) * 14, carrier: null }));
  }
  // 太遠的 NPC 離場
  for (const e of W.npcs) if (!e.gone && e.sink <= 0 && Math.hypot(e.x - W.ship.x, e.z - W.ship.z) > (e.leave ? 600 : 1500) && !(W.fleet && W.fleet.ids.includes(e.id))) e.gone = 1;
  W.npcs = W.npcs.filter(e => !e.gone);
  if (W.fleet && !W.fleet.ids.some(id => W.npcs.some(e => e.id === id && e.sink <= 0))) {
    W.fleet = null; W.gold += 800; W.fleetT = 600 + R() * 300;
    W.events.push({ e: 'msg', t: '🏆 黑鯊艦隊全軍覆沒！潮聲港頒發 800 金戰功獎勵！' }, { e: 'coin' });
    for (const e of W.npcs) if (e.team === 1) e.leave = 1;
  }
  // 通緝慢慢消退（附近沒有海警時）
  if (W.wanted > 0 && !W.npcs.some(e => e.team === 3 && e.sink <= 0 && Math.hypot(e.x - W.ship.x, e.z - W.ship.z) < 700)) W.wanted = Math.max(0, W.wanted - dt * 0.006);
  const P = W.ship;
  if (P.sink > 10) {
    for (const t of W.treasures) if (t.st === 'ship') { t.st = 'float'; t.x = P.x + (R() - .5) * 8; t.z = P.z + (R() - .5) * 8; }
    const sup = P.sup;
    W.ship = newShip(0, SHIP_SPAWN.x, SHIP_SPAWN.z, SHIP_SPAWN.heading, 'player'); W.ship.nc = 4 + 2 * W.up.guns; W.ship.sup = { n: Math.max(20, sup.n), c: 4, f: 4, x: 0, p: 15 };
    W.wanted = Math.max(0, W.wanted - 1);
    W.events.push({ e: 'shipReset' }, { e: 'msg', t: '你們的船沉了⋯⋯潮聲港造船廠給了你們一艘新船（強化都還在）。貨物漂在沉船處。' });
  }
  spawnTick(W, dt);
  W.bottleT -= dt;
  if (W.bottleT <= 0) {
    W.bottleT = 75 + R() * 60;
    if (W.treasures.filter(t => t.st === 'bottle').length < 2) {
      const a = R() * Math.PI * 2, x = P.x + Math.cos(a) * 60 + Math.sin(P.heading) * 80, z = P.z + Math.sin(a) * 60 + Math.cos(P.heading) * 80;
      if (terrainH(x, z) < -3) W.treasures.push({ id: W.seq++, tier: 0, st: 'bottle', x, y: 0, z, carrier: null });
    }
  }
  for (const t of W.treasures) if (t.st === 'float' || t.st === 'bottle') { t.x += Math.sin(W.wind.a) * dt * 0.3; t.z += Math.cos(W.wind.a) * dt * 0.3; }
  W.treasures = W.treasures.filter(t => t.st !== 'sold' && t.st !== 'gone');
  for (const c of W.crabs) {
    c.atk = Math.max(0, c.atk - dt);
    let tgt = null, td = 28;
    for (const pl of players) if (!pl.onShip && !pl.dead && pl.wp) { const d = Math.hypot(pl.wp[0] - c.x, pl.wp[2] - c.z); if (d < td && Math.abs(pl.wp[1] - terrainH(c.x, c.z)) < 4) { td = d; tgt = pl; } }
    c.mv = 0;
    if (tgt) {
      const a = Math.atan2(tgt.wp[0] - c.x, tgt.wp[2] - c.z); c.h = a;
      if (td > 1.4) { const nx = c.x + Math.sin(a) * 3.4 * dt, nz = c.z + Math.cos(a) * 3.4 * dt; if (terrainH(nx, nz) > 0.6) { c.x = nx; c.z = nz; c.mv = 1; } }
      else if (c.atk <= 0) { c.atk = 1.3; W.events.push({ e: 'dmg', pid: tgt.id, n: 11, src: 'crab' }); }
    }
  }
}

// ---------- 玩家動作（房主收到後執行）----------
export function act(W, pid, m, players) {
  const S = W.ship, pl = players.find(p => p.id === pid);
  const ev = (o) => W.events.push(o);
  const nearPort = () => nearestPort(S.x, S.z).d < 260;
  switch (m.a) {
    case 'helm': S.rudder = Math.max(-1, Math.min(1, +m.v || 0)); break;
    case 'sail': S.sail = Math.max(0, Math.min(1, +m.down)); S.sailAng = Math.max(-1, Math.min(1, +m.ang)); break;
    case 'anchor': if (S.sink > 0) break; S.anchorDir = S.anchor > 0.5 ? -1 : 1; ev({ e: 'msg', t: S.anchorDir > 0 ? '⚓ 下錨！' : '⚓ 起錨中⋯⋯（約 5 秒）' }); break;
    case 'aim': { const c = S.cannons[m.i]; if (c) { c.yaw = Math.max(-0.7, Math.min(0.7, +m.yaw)); c.pitch = Math.max(-0.12, Math.min(0.5, +m.pitch)); } break; }
    case 'fire': { const c = S.cannons[m.i]; if (c && c.loaded && m.i < S.nc) { const a = c.loaded; c.loaded = 0; fire(W, S, m.i, a); } break; }
    case 'load': { const c = S.cannons[m.i]; if (c && !c.loaded && AMMO[m.k]) { c.loaded = m.k; ev({ e: 'loaded', i: m.i }); } break; }
    case 'take': { const k = m.k in S.sup ? m.k : 'n'; const n = Math.min(S.sup[k], m.n || 5); if (n > 0) { S.sup[k] -= n; ev({ e: 'give', pid, k, n }); } else ev({ e: 'msg', pid, t: `${k === 'p' ? '木板' : AMMO[k]}箱空了，回港口補給！` }); break; }
    case 'repair': { const i = S.holes.findIndex(h => h.id === m.h); if (i >= 0) { S.holes.splice(i, 1); ev({ e: 'repaired', pid }); } else ev({ e: 'give', pid, k: 'p', n: 1 }); break; }
    case 'mend': { if (S.sailHP >= 0.99) { ev({ e: 'give', pid, k: 'p', n: 1 }); break; } S.sailHP = Math.min(1, S.sailHP + 0.3); ev({ e: 'msg', pid, t: `🪡 修好一部分船帆（${Math.round(S.sailHP * 100)}%）` }); break; }
    case 'dump': S.water = Math.max(0, S.water - 0.045); break;
    case 'douse': { const f = S.fires.find(f => f.id === m.f); if (f) { f.i -= 0.55; ev({ e: 'doused', x: m.x, y: m.y, z: m.z }); } S.fires = S.fires.filter(f => f.i > 0); break; }
    case 'dig': {
      const t = W.treasures.find(t => t.id === m.tid && t.st === 'buried'); if (!t) break;
      t.st = 'ground'; t.y = terrainH(t.x, t.z); W.quests = W.quests.filter(q => q !== t.id);
      ev({ e: 'dug', tid: t.id, pid, x: t.x, z: t.z });
      const nc = t.tier + (R() < 0.5 ? 1 : 0);
      for (let i = 0; i < nc; i++) { const a = R() * 6.28, x = t.x + Math.cos(a) * 14, z = t.z + Math.sin(a) * 14; if (terrainH(x, z) > 1) W.crabs.push({ id: W.seq++, x, z, h: 0, hp: 3, atk: 1, mv: 0 }); }
      if (nc) ev({ e: 'msg', t: '🦀 沙地底下鑽出了礁石蟹！拿起劍（1）或火槍（7）保護寶藏！', warn: 1 });
      break;
    }
    case 'pick': {
      const t = W.treasures.find(t => t.id === m.tid); if (!t || t.carrier != null || !['ground', 'ship', 'float', 'bottle'].includes(t.st)) break;
      if (t.st === 'bottle') { t.st = 'gone'; const q = addQuest(W); ev({ e: 'msg', t: q ? `📜 漂流瓶裡有一張藏寶圖：${ISLANDS[q.isl].name}！` : '📜 漂流瓶裡的地圖已經泡爛了（任務已滿 3 個）。' }); break; }
      t.st = 'carry'; t.carrier = pid; break;
    }
    case 'drop': {
      const t = W.treasures.find(t => t.id === m.tid && t.carrier === pid); if (!t) break;
      t.carrier = null;
      if (m.onShip && S.sink <= 0) { t.st = 'ship'; t.lx = m.p[0]; t.ly = m.p[1]; t.lz = m.p[2]; }
      else { t.x = m.p[0]; t.z = m.p[2]; const g = groundH(t.x, t.z); if (g > waveHeight(t.x, t.z, W.t) - 0.3) { t.st = 'ground'; t.y = g; } else t.st = 'float'; }
      break;
    }
    case 'sell': {
      const t = W.treasures.find(t => t.id === m.tid && t.carrier === pid); if (!t || !pl || !pl.wp) break;
      if (!MERCHANTS.some(M => Math.hypot(pl.wp[0] - M.x, pl.wp[2] - M.z) < 7)) break;
      t.st = 'sold'; const g = TIER[t.tier].gold; W.gold += g; ev({ e: 'sold', pid, g, tier: t.tier }); break;
    }
    case 'quest': { const q = addQuest(W); ev({ e: 'msg', t: q ? `📜 收到藏寶圖：${ISLANDS[q.isl].name}（${SEAS[ISLANDS[q.isl].sea].name}，按 6 拿出來看）` : '任務已滿 3 個，先去把寶藏挖出來吧！' }); break; }
    case 'bounty': { if (W.bounty) break; const need = 2 + (W.sunk > 4 ? 1 : 0); W.bounty = { need, done: 0, reward: need * 350 }; ev({ e: 'msg', t: `🎯 接下懸賞：擊沉 ${need} 艘海盜船，賞金 ${W.bounty.reward} 金` }); break; }
    case 'pardon': { const c = Math.round(W.wanted) * 300; if (W.wanted < 0.5) break; if (W.gold < c) { ev({ e: 'msg', pid, t: `金幣不夠（撤銷通緝要 ${c} 金）` }); break; } W.gold -= c; W.wanted = 0; for (const e of W.npcs) if (e.team === 3) e.angry = 0; ev({ e: 'msg', t: '📄 付了罰金，國際海警撤銷了通緝。' }); break; }
    case 'restock': {
      if (W.gold < 60) { ev({ e: 'msg', pid, t: '金幣不夠（補給需要 60 金）' }); break; }
      if (!nearPort()) { ev({ e: 'msg', pid, t: '船要停在港口附近才能補給' }); break; }
      W.gold -= 60; Object.assign(S.sup, { n: 30, p: 18, c: Math.max(S.sup.c, 6), f: Math.max(S.sup.f, 6) }); ev({ e: 'msg', t: '🛒 補給完成：砲彈 30、木板 18、鏈彈 6、火焰彈 6 已送上船' }); break;
    }
    case 'buyx': {
      if (W.gold < 150) { ev({ e: 'msg', pid, t: '金幣不夠（爆裂彈 4 發要 150 金）' }); break; }
      if (!nearPort()) { ev({ e: 'msg', pid, t: '船要停在港口附近才能送貨上船' }); break; }
      W.gold -= 150; S.sup.x += 4; ev({ e: 'msg', t: `💣 買了 4 發爆裂彈（船上共 ${S.sup.x} 發）` }); break;
    }
    case 'upgrade': {
      const k = m.k; if (!UPS[k] || W.up[k] >= UPS[k].max) break; const cost = upCost(k, W.up[k]);
      if (W.gold < cost) { ev({ e: 'msg', pid, t: `金幣不夠（需要 ${cost} 金）` }); break; }
      W.gold -= cost; W.up[k]++; if (k === 'guns') S.nc = 4 + 2 * W.up.guns;
      ev({ e: 'msg', t: k === 'gun' && W.up.gun === 1 ? '🔫 買下了火槍！按 7 拿出來，左鍵射擊' : `🔧 強化完成：${UPS[k].name} Lv.${W.up[k]}${k === 'guns' ? `（現在有 ${S.nc} 門砲）` : ''}` }); ev({ e: 'coin' }); break;
    }
    case 'melee': case 'shoot': case 'hitcrab': {
      if (m.a === 'shoot' && Array.isArray(m.p) && Array.isArray(m.q) && W.up.gun) ev({ e: 'pshot', pid, p: m.p, q: m.q });
      const kind = m.k || 'c', dmg = m.a === 'shoot' ? (W.up.gun ? gunDmg(W) : 0) : swordDmg(W); if (!dmg || kind === 'x') break;
      if (kind === 'g') { const g = W.guards.find(g => g.id === m.id); if (g && pl && pl.wp && Math.hypot(g.x - pl.wp[0], g.z - pl.wp[2]) < (m.a === 'shoot' ? 70 : 4)) damageGuard(W, g, dmg); break; }
      const c = W.crabs.find(c => c.id === m.id); if (!c) break;
      c.hp -= dmg; c.atk = Math.max(c.atk, 0.6); ev({ e: 'crabhit', id: c.id, x: c.x, z: c.z });
      if (c.hp <= 0) W.crabs = W.crabs.filter(k => k !== c);
      break;
    }
  }
}

// ---------- 打包 / 解包（網路傳輸）----------
const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
function packShip(s) {
  return { id: s.id, k: s.kind, x: r2(s.x), z: r2(s.z), h: r3(s.heading), sp: r2(s.speed), ru: r2(s.rudder), sl: r2(s.sail), sa: r2(s.sailAng), an: r2(s.anchor), ad: s.anchorDir, w: r3(s.water), ho: s.holes, fi: s.fires.map(f => [f.id, f.x, f.z, r2(f.i)]), sh: r2(s.sailHP), c: s.cannons.map(c => [r2(c.yaw), r2(c.pitch), c.loaded]), nc: s.nc, su: s.kind === 'player' ? s.sup : 0, sk: r2(s.sink), pw: r2(s._power || 0), ag: s.angry };
}
function unpackShip(o, prev) {
  const s = prev || newShip(o.id, o.x, o.z, o.h, o.k);
  s._tx = o.x; s._tz = o.z; s._th = o.h; s._tt = performance.now();
  if (!prev || Math.hypot(prev.x - o.x, prev.z - o.z) > 30) { s.x = o.x; s.z = o.z; s.heading = o.h; }
  Object.assign(s, { id: o.id, kind: o.k, team: KINDS[o.k].team, scale: KINDS[o.k].scale, nc: o.nc, speed: o.sp, rudder: o.ru, sail: o.sl, sailAng: o.sa, anchor: o.an, anchorDir: o.ad, water: o.w, holes: o.ho, fires: o.fi.map(a => ({ id: a[0], x: a[1], z: a[2], i: a[3] })), sailHP: o.sh, cannons: o.c.map(c => ({ yaw: c[0], pitch: c[1], loaded: c[2] })), sink: o.sk, _power: o.pw, angry: o.ag });
  if (o.su) s.sup = o.su;
  return s;
}
export function smoothShips(W, dt) {
  const now = performance.now();
  for (const s of allShips(W)) {
    if (s._tx === undefined) continue;
    const age = Math.min(0.5, (now - s._tt) / 1000);
    const tx = s._tx + Math.sin(s._th) * s.speed * age, tz = s._tz + Math.cos(s._th) * s.speed * age;
    s.x += Math.sin(s.heading) * s.speed * dt; s.z += Math.cos(s.heading) * s.speed * dt;
    const k = Math.min(1, dt * 4); s.x += (tx - s.x) * k; s.z += (tz - s.z) * k;
    s.heading += angDiff(s._th, s.heading) * k;
  }
}
export function pack(W) {
  return {
    t: r2(W.t), g: W.gold, wd: [r3(W.wind.a), r2(W.wind.s)], am: r2(W.amp), dy: r3(W.day), so: r2(W.storm.on), sx: r1(W.storm.x), sz: r1(W.storm.z), sr: W.storm.r,
    s: packShip(W.ship), np: W.npcs.map(packShip), q: W.quests, up: W.up, bo: W.bounty, fl: W.fleet ? W.fleet.ids : 0, wa: r2(W.wanted),
    fo: W.forts.map(F => [F.hp.map(r1), F.down, F.open]),
    gu: W.guards.map(g => [g.id, g.f, r2(g.x), r2(g.z), r2(g.h), r1(g.hp), g.max, g.k, g.mv]),
    tr: W.treasures.map(t => [t.id, t.tier, t.st, r2(t.x), r2(t.y), r2(t.z), t.carrier, t.isl ?? -1, r2(t.lx || 0), r2(t.ly || 0), r2(t.lz || 0)]),
    cr: W.crabs.map(c => [c.id, r2(c.x), r2(c.z), r2(c.h), c.hp, c.mv]),
  };
}
export function unpack(W, o) {
  W.gold = o.g; W.wind.a = o.wd[0]; W.wind.s = o.wd[1]; W.amp = o.am; W.day = o.dy; W.storm.on = o.so; W.storm.x = o.sx; W.storm.z = o.sz; W.storm.r = o.sr;
  W.ship = unpackShip(o.s, W.ship && W.ship.id === o.s.id ? W.ship : null);
  W.npcs = o.np.map(e => unpackShip(e, W.npcs.find(x => x.id === e.id)));
  W.quests = o.q; W.up = o.up; W.bounty = o.bo; W.fleet = o.fl ? { ids: o.fl } : null; W.wanted = o.wa;
  W.forts = o.fo.map((a, i) => ({ ...(W.forts[i] || {}), hp: a[0], down: a[1], open: a[2] }));
  W.guards = o.gu.map(a => ({ id: a[0], f: a[1], x: a[2], z: a[3], h: a[4], hp: a[5], max: a[6], k: a[7], mv: a[8] }));
  W.treasures = o.tr.map(a => ({ id: a[0], tier: a[1], st: a[2], x: a[3], y: a[4], z: a[5], carrier: a[6], isl: a[7] < 0 ? undefined : a[7], lx: a[8], ly: a[9], lz: a[10] }));
  W.crabs = o.cr.map(a => ({ id: a[0], x: a[1], z: a[2], h: a[3], hp: a[4], mv: a[5] }));
}
