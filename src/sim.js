// ===== 權威模擬（單人＝自己、連線＝房主執行）=====
import * as THREE from 'three';
import { waveHeight, sea } from './waves.js';
import { ISLANDS, terrainH, groundH, SHIP_SPAWN, MERCHANT, WORLD_R, pickDigSpot, rng } from './geo.js';
import { DECK, HOLD, CANNONS, hullW, holdW, hullHit, HOLD_Z } from './shipdef.js';

export const TIER = { 1: { name: '木製寶箱', gold: 120 }, 2: { name: '白銀寶箱', gold: 350 }, 3: { name: '黃金寶箱', gold: 900 } };
export const BALL_V = 72, GRAV = 13;
const R = Math.random;

function newShip(id, x, z, heading, enemy = false) {
  return {
    id, enemy, x, z, heading, speed: 0, rudder: 0, sail: enemy ? 1 : 0, sailAng: 0, anchor: enemy ? 0 : 1, anchorDir: 0,
    water: 0, holes: [], cannons: CANNONS.map(() => ({ yaw: 0, pitch: 0.08, loaded: enemy ? 1 : 1 })),
    balls: 30, planks: 18, sink: 0, bump: 0, fireCD: [0, 0], repairCD: 8, hseq: 0,
  };
}

export function newWorld(seed = (R() * 1e9) | 0) {
  const W = {
    t: 0, gold: 0, seed, seq: 1,
    wind: { a: 0.6, s: 0.85 }, amp: 0.8, day: 0.32,               // day: 0~1（0.25 日出、0.75 日落）
    storm: { x: 600, z: 500, r: 320, vx: -6, vz: -3, on: 0 },
    ship: newShip(0, SHIP_SPAWN.x, SHIP_SPAWN.z, SHIP_SPAWN.heading),
    enemies: [], treasures: [], quests: [], crabs: [], balls: [],
    spawnT: 100, bottleT: 40, events: [],
  };
  const r = rng(seed);
  for (let i = 0; i < 2; i++) addQuest(W, r);
  return W;
}

function addQuest(W, r = R) {
  if (W.quests.length >= 3) return null;
  const cand = ISLANDS.filter(I => !I.port && !W.treasures.some(t => t.st === 'buried' && t.isl === I.id));
  const I = cand[Math.floor(r() * cand.length)] || ISLANDS[1];
  const p = pickDigSpot(I, r), roll = r();
  const t = { id: W.seq++, tier: roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3, st: 'buried', isl: I.id, x: p.x, y: terrainH(p.x, p.z), z: p.z, carrier: null };
  W.treasures.push(t); W.quests.push(t.id); return t;
}

// ---------- 船的姿態（所有電腦都用同樣的公式，畫面與命中判定一致）----------
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function shipPose(s, t = sea.t, out = {}) {
  const sh = Math.sin(s.heading), ch = Math.cos(s.heading);
  const at = (lx, lz) => waveHeight(s.x + sh * lz + ch * lx, s.z + ch * lz - sh * lx, t);
  const hb = at(0, 9), hs = at(0, -9), hp = at(-3, 0), hr = at(3, 0);
  const sinkY = s.sink > 0 ? -s.sink * 1.4 : 0;
  out.y = (hb + hs + hp + hr) / 4 - 0.35 - s.water * 1.1 + sinkY;
  out.pitch = Math.atan2(hb - hs, 18) * 0.85 + (s.sink > 0 ? Math.min(0.5, s.sink * 0.06) : 0);
  out.roll = Math.atan2(hp - hr, 6) * 0.75 - s.rudder * Math.min(1, Math.abs(s.speed) / 8) * 0.06 + (s.sink > 0 ? s.sink * 0.03 : 0);
  _e.set(-out.pitch, s.heading, out.roll, 'YXZ'); _q.setFromEuler(_e);
  out.quat = (out.quat || new THREE.Quaternion()).copy(_q);
  out.mat = (out.mat || new THREE.Matrix4()).compose(_v.set(s.x, out.y, s.z), _q, _s);
  out.inv = (out.inv || new THREE.Matrix4()).copy(out.mat).invert();
  return out;
}
const _pose = {}, _p = new THREE.Vector3();
export function cannonMuzzle(s, i, pose) {
  const c = CANNONS[i], cs = s.cannons[i];
  const th = (c.side > 0 ? Math.PI / 2 : -Math.PI / 2) + cs.yaw;
  const dir = new THREE.Vector3(Math.sin(th) * Math.cos(cs.pitch), Math.sin(cs.pitch), Math.cos(th) * Math.cos(cs.pitch));
  const p = new THREE.Vector3(c.x, DECK + 0.62, c.z).addScaledVector(dir, 1.35).applyMatrix4(pose.mat);
  dir.applyQuaternion(pose.quat);
  return { p, dir };
}
export function shipVel(s) { return [Math.sin(s.heading) * s.speed, Math.cos(s.heading) * s.speed]; }

// ---------- 物理 ----------
export function sailPower(s, wind) {
  const face = s.heading + s.sailAng * 0.9;                // 帆面朝向
  const c = Math.cos(wind.a - face);                        // 風往 wind.a 方向吹
  return Math.max(0.18, (c + 1) / 2) ** 1.3;
}
function stepShip(W, s, dt) {
  if (s.sink > 0) { s.sink += dt; s.speed *= Math.exp(-dt); return; }
  // 錨
  if (s.anchorDir > 0) { s.anchor = Math.min(1, s.anchor + dt * 0.9); if (s.anchor >= 1) s.anchorDir = 0; }
  else if (s.anchorDir < 0) { s.anchor = Math.max(0, s.anchor - dt * 0.22); if (s.anchor <= 0) s.anchorDir = 0; }
  const pw = sailPower(s, W.wind); s._power = pw;
  const stormBoost = 1 + W.storm.on * 0.25;
  let target = s.sail * pw * 12.5 * W.wind.s * stormBoost * (1 - s.water * 0.55);
  if (s.anchor > 0.35) target = 0;
  s.speed += (target - s.speed) * dt * (s.anchor > 0.35 ? 1.4 : 0.22);
  const turn = s.rudder * 0.3 * (0.22 + Math.min(1, Math.abs(s.speed) / 6)) * (s.anchor > 0.35 ? 0.4 : 1);
  s.heading += turn * dt;
  let nx = s.x + Math.sin(s.heading) * s.speed * dt, nz = s.z + Math.cos(s.heading) * s.speed * dt;
  // 撞到島
  s.bump = Math.max(0, s.bump - dt);
  const sh = Math.sin(s.heading), ch = Math.cos(s.heading);
  const probe = [[0, 12], [2.8, 6], [-2.8, 6], [3, -4], [-3, -4], [0, -10]];
  for (const [lx, lz] of probe) {
    const wx = nx + sh * lz + ch * lx, wz = nz + ch * lz - sh * lx;
    if (terrainH(wx, wz) > -1.6) {
      if (s.bump <= 0 && Math.abs(s.speed) > 2.2) { addHole(W, s, lx, lz); W.events.push({ e: 'bump', s: s.id, x: wx, z: wz }); s.bump = 1.5; }
      s.speed = -Math.sign(lz || 1) * Math.min(1.2, Math.abs(s.speed) * 0.3) * Math.sign(s.speed || 1);
      nx = s.x; nz = s.z; break;
    }
  }
  const d = Math.hypot(nx, nz); if (d > WORLD_R) { nx *= WORLD_R / d; nz *= WORLD_R / d; s.speed *= 0.9; }
  s.x = nx; s.z = nz;
  // 進水
  s.water = Math.max(0, s.water + s.holes.length * (s.enemy ? 0.021 : 0.0105) * dt);
  if (s.water >= 1) { s.water = 1; s.sink = 0.01; W.events.push({ e: 'sinking', s: s.id }); }
}
function addHole(W, s, lx, lz) {
  if (s.holes.length >= 12) { s.water = Math.min(1, s.water + 0.04); return; }
  const z = Math.max(HOLD_Z[0] + 0.6, Math.min(HOLD_Z[1] - 0.8, lz));
  const side = lx >= 0 ? 1 : -1, x = side * (holdW(z) + 0.02);
  s.holes.push({ id: ++s.hseq, x: +x.toFixed(2), y: +(HOLD + 0.45 + R() * 1.1).toFixed(2), z: +z.toFixed(2) });
}

// ---------- 敵船 AI ----------
function stepEnemy(W, e, dt) {
  const P = W.ship;
  if (e.sink > 0) return;
  const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz);
  let want;
  if (P.sink > 0 || d > 700) want = bearing + Math.PI;                    // 目標沉了或太遠：離開
  else if (d > 150) want = bearing + (e.id % 2 ? 0.35 : -0.35);
  else {                                                                 // 進入砲戰：與目標平行
    const a1 = bearing + Math.PI / 2, a2 = bearing - Math.PI / 2;
    want = Math.abs(angDiff(a1, e.heading)) < Math.abs(angDiff(a2, e.heading)) ? a1 : a2;
    if (d < 55) want += (angDiff(a1, want) === 0 ? -0.5 : 0.5);
  }
  // 避開陸地
  const sh = Math.sin(e.heading), ch = Math.cos(e.heading);
  for (const look of [30, 60]) {
    if (terrainH(e.x + sh * look, e.z + ch * look) > -4) { const l = terrainH(e.x + Math.sin(e.heading - 0.6) * look, e.z + Math.cos(e.heading - 0.6) * look); want = e.heading + (l > -4 ? 1.2 : -1.2); break; }
  }
  e.rudder += (Math.max(-1, Math.min(1, angDiff(want, e.heading) * 2.2)) - e.rudder) * dt * 2;
  e.sail = d < 150 ? 0.7 : 1; e.anchor = 0;
  // 開砲
  e.repairCD -= dt; if (e.repairCD <= 0 && e.holes.length) { e.holes.shift(); e.repairCD = 9; }
  e.water = Math.max(0, e.water - dt * 0.004);
  for (let sIdx = 0; sIdx < 2; sIdx++) {
    e.fireCD[sIdx] -= dt; if (e.fireCD[sIdx] > 0 || d > 240 || P.sink > 0) continue;
    const side = sIdx ? -1 : 1, broad = e.heading + side * Math.PI / 2;
    const off = angDiff(bearing, broad); if (Math.abs(off) > 0.5) continue;
    const flight = d / BALL_V; const [vx, vz] = shipVel(P);
    const tx = P.x + vx * flight * 1.05, tz = P.z + vz * flight * 1.05, td = Math.hypot(tx - e.x, tz - e.z);
    const aimB = Math.atan2(tx - e.x, tz - e.z);
    const yaw = Math.max(-0.6, Math.min(0.6, angDiff(aimB, broad)));
    const pitch = 0.5 * Math.asin(Math.min(1, GRAV * td / (BALL_V * BALL_V))) + 0.02 + (R() - 0.5) * 0.05;
    const list = CANNONS.map((c, i) => i).filter(i => CANNONS[i].side === side);
    list.forEach((i, k) => { e.cannons[i].yaw = yaw + (R() - 0.5) * 0.06; e.cannons[i].pitch = pitch; setTimeout(() => fire(W, e, i), k * 350); });
    e.fireCD[sIdx] = 5.5 + R() * 2;
  }
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function fire(W, s, i) {
  if (s.sink > 0) return;
  const pose = shipPose(s, W.t, {}); const { p, dir } = cannonMuzzle(s, i, pose); const [vx, vz] = shipVel(s);
  const b = { id: W.seq++, o: s.id, p: [p.x, p.y, p.z], v: [dir.x * BALL_V + vx, dir.y * BALL_V, dir.z * BALL_V + vz], life: 9 };
  W.balls.push(b); W.events.push({ e: 'fire', id: b.id, o: s.id, i, p: b.p.map(n => +n.toFixed(2)), v: b.v.map(n => +n.toFixed(2)) });
}

// ---------- 砲彈 ----------
const _lp = new THREE.Vector3();
function stepBalls(W, dt, players) {
  const ships = [W.ship, ...W.enemies].filter(s => s.sink <= 0 || s.sink < 3);
  const poses = new Map(ships.map(s => [s.id, shipPose(s, W.t, {})]));
  for (const b of W.balls) {
    b.v[1] -= GRAV * dt; b.p[0] += b.v[0] * dt; b.p[1] += b.v[1] * dt; b.p[2] += b.v[2] * dt; b.life -= dt;
    for (const s of ships) {
      if (s.id === b.o) continue;
      _lp.set(b.p[0], b.p[1], b.p[2]).applyMatrix4(poses.get(s.id).inv);
      if (hullHit(_lp.x, _lp.y, _lp.z)) {
        b.dead = 1; addHole(W, s, _lp.x, _lp.z);
        W.events.push({ e: 'hit', id: b.id, x: +b.p[0].toFixed(1), y: +b.p[1].toFixed(1), z: +b.p[2].toFixed(1), s: s.id });
        if (s.id === 0) for (const pl of players) if (pl.onShip && pl.lp && Math.hypot(pl.lp[0] - _lp.x, pl.lp[1] - _lp.y, pl.lp[2] - _lp.z) < 3.2) W.events.push({ e: 'dmg', pid: pl.id, n: 40 });
        break;
      }
    }
    if (b.dead) continue;
    if (b.p[1] < groundH(b.p[0], b.p[2]) + 0.1) { b.dead = 1; W.events.push({ e: 'boom', id: b.id, x: b.p[0], y: b.p[1], z: b.p[2] }); continue; }
    if (b.p[1] < waveHeight(b.p[0], b.p[2], W.t) || b.life < 0) { b.dead = 1; W.events.push({ e: 'splash', id: b.id, x: +b.p[0].toFixed(1), z: +b.p[2].toFixed(1) }); }
  }
  W.balls = W.balls.filter(b => !b.dead);
}

// ---------- 主迴圈 ----------
export function step(W, dt, players) {
  W.t += dt; sea.t = W.t;
  // 時間、天氣
  W.day = (W.day + dt / 1200) % 1;
  W.wind.a += Math.sin(W.t * 0.011) * dt * 0.006; W.wind.s = 0.75 + 0.2 * Math.sin(W.t * 0.017 + 1);
  const st = W.storm; st.x += st.vx * dt; st.z += st.vz * dt;
  if (Math.hypot(st.x, st.z) > WORLD_R + 300) { const a = R() * Math.PI * 2; st.x = Math.cos(a) * WORLD_R; st.z = Math.sin(a) * WORLD_R; const b = a + Math.PI + (R() - 0.5); st.vx = Math.cos(b) * 7; st.vz = Math.sin(b) * 7; }
  const sd = Math.hypot(W.ship.x - st.x, W.ship.z - st.z);
  st.on = Math.max(0, Math.min(1, (st.r * 1.25 - sd) / (st.r * 0.5)));
  W.amp = 0.72 + st.on * 1.25; sea.amp = W.amp;

  stepShip(W, W.ship, dt);
  for (const e of W.enemies) { stepEnemy(W, e, dt); stepShip(W, e, dt); }
  stepBalls(W, dt, players);

  // 沉船處理
  for (const e of W.enemies) if (e.sink > 10 && !e.gone) {
    e.gone = 1;
    const n = 1 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) W.treasures.push({ id: W.seq++, tier: R() < 0.55 ? 2 : 3, st: 'float', x: e.x + (R() - .5) * 10, y: 0, z: e.z + (R() - .5) * 10, carrier: null });
    W.events.push({ e: 'msg', t: '黑鯊海盜船沉沒了！海面浮起了戰利品。' });
  }
  W.enemies = W.enemies.filter(e => !e.gone);
  const P = W.ship;
  if (P.sink > 0 && P.sink > 9) {
    for (const t of W.treasures) if (t.st === 'ship') { t.st = 'float'; t.x = P.x + (R() - .5) * 8; t.z = P.z + (R() - .5) * 8; }
    W.ship = newShip(0, SHIP_SPAWN.x, SHIP_SPAWN.z, SHIP_SPAWN.heading);
    W.events.push({ e: 'shipReset' }, { e: 'msg', t: '你們的船沉了⋯⋯潮聲港造船廠給了你們一艘新船。貨物漂在沉船處。' });
  }
  // 敵船出現
  W.spawnT -= dt;
  const portD = Math.hypot(P.x - ISLANDS[0].x, P.z - ISLANDS[0].z);
  const maxE = W.gold > 2500 ? 2 : 1;
  if (W.spawnT <= 0 && W.enemies.length < maxE && portD > 260 && P.sink <= 0) {
    for (let k = 0; k < 10; k++) {
      const a = R() * Math.PI * 2, x = P.x + Math.cos(a) * 420, z = P.z + Math.sin(a) * 420;
      if (terrainH(x, z) < -15 && Math.hypot(x, z) < WORLD_R) { const e = newShip(100 + W.seq++, x, z, Math.atan2(P.x - x, P.z - z), true); W.enemies.push(e); W.events.push({ e: 'msg', t: '⚠ 瞭望：遠方出現黑帆——黑鯊海盜團來了！', warn: 1 }); break; }
    }
    W.spawnT = 170 + R() * 120;
  }
  // 漂流瓶
  W.bottleT -= dt;
  if (W.bottleT <= 0) {
    W.bottleT = 75 + R() * 60;
    if (W.treasures.filter(t => t.st === 'bottle').length < 2) {
      const a = R() * Math.PI * 2, x = P.x + Math.cos(a) * 60 + Math.sin(P.heading) * 80, z = P.z + Math.sin(a) * 60 + Math.cos(P.heading) * 80;
      if (terrainH(x, z) < -3) W.treasures.push({ id: W.seq++, tier: 0, st: 'bottle', x, y: 0, z, carrier: null });
    }
  }
  // 漂浮物隨浪漂
  for (const t of W.treasures) if (t.st === 'float' || t.st === 'bottle') { t.x += Math.cos(W.wind.a) * dt * 0.3; t.z += Math.sin(W.wind.a) * dt * 0.3; }
  W.treasures = W.treasures.filter(t => t.st !== 'sold' && t.st !== 'gone');
  // 礁石蟹
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
  switch (m.a) {
    case 'helm': S.rudder = Math.max(-1, Math.min(1, +m.v || 0)); break;
    case 'sail': S.sail = Math.max(0, Math.min(1, +m.down)); S.sailAng = Math.max(-1, Math.min(1, +m.ang)); break;
    case 'anchor': if (S.sink > 0) break; S.anchorDir = S.anchor > 0.5 ? -1 : 1; ev({ e: 'msg', t: S.anchorDir > 0 ? '⚓ 下錨！' : '⚓ 起錨中⋯⋯（約 5 秒）' }); break;
    case 'aim': { const c = S.cannons[m.i]; if (c) { c.yaw = Math.max(-0.7, Math.min(0.7, +m.yaw)); c.pitch = Math.max(-0.12, Math.min(0.5, +m.pitch)); } break; }
    case 'fire': { const c = S.cannons[m.i]; if (c && c.loaded) { c.loaded = 0; fire(W, S, m.i); } break; }
    case 'load': { const c = S.cannons[m.i]; if (c && !c.loaded) { c.loaded = 1; ev({ e: 'loaded', i: m.i }); } break; }
    case 'take': { const k = m.k === 'planks' ? 'planks' : 'balls'; const n = Math.min(S[k], m.n || 5); if (n > 0) { S[k] -= n; ev({ e: 'give', pid, k, n }); } else ev({ e: 'msg', pid, t: k === 'balls' ? '砲彈箱空了，回港口補給！' : '木板箱空了，回港口補給！' }); break; }
    case 'repair': { const i = S.holes.findIndex(h => h.id === m.h); if (i >= 0) { S.holes.splice(i, 1); ev({ e: 'repaired', pid }); } else ev({ e: 'give', pid, k: 'planks', n: 1 }); break; }
    case 'dump': S.water = Math.max(0, S.water - 0.045); break;
    case 'dig': {
      const t = W.treasures.find(t => t.id === m.tid && t.st === 'buried'); if (!t) break;
      t.st = 'ground'; t.y = terrainH(t.x, t.z); W.quests = W.quests.filter(q => q !== t.id);
      ev({ e: 'dug', tid: t.id, pid, x: t.x, z: t.z });
      const nc = t.tier + (R() < 0.5 ? 1 : 0);
      for (let i = 0; i < nc; i++) { const a = R() * 6.28, x = t.x + Math.cos(a) * 14, z = t.z + Math.sin(a) * 14; if (terrainH(x, z) > 1) W.crabs.push({ id: W.seq++, x, z, h: 0, hp: 3, atk: 1, mv: 0 }); }
      if (nc) ev({ e: 'msg', t: '🦀 沙地底下鑽出了礁石蟹！拿起劍（1）保護寶藏！', warn: 1 });
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
      if (Math.hypot(pl.wp[0] - MERCHANT.x, pl.wp[2] - MERCHANT.z) > 7) break;
      t.st = 'sold'; const g = TIER[t.tier].gold; W.gold += g; ev({ e: 'sold', pid, g, tier: t.tier }); break;
    }
    case 'quest': { const q = addQuest(W); ev({ e: 'msg', t: q ? `📜 收到藏寶圖：${ISLANDS[q.isl].name}（按 M 看地圖）` : '任務已滿 3 個，先去把寶藏挖出來吧！' }); break; }
    case 'restock': {
      if (W.gold < 60) { ev({ e: 'msg', pid, t: '金幣不夠（補給需要 60 金）' }); break; }
      if (Math.hypot(S.x - ISLANDS[0].x, S.z - ISLANDS[0].z) > 230) { ev({ e: 'msg', pid, t: '船要停在潮聲港附近才能補給' }); break; }
      W.gold -= 60; S.balls = 30; S.planks = 18; ev({ e: 'msg', t: '🛒 補給完成：砲彈 30、木板 18 已送上船' }); break;
    }
    case 'hitcrab': {
      const c = W.crabs.find(c => c.id === m.id); if (!c) break;
      c.hp--; c.atk = Math.max(c.atk, 0.6); ev({ e: 'crabhit', id: c.id, x: c.x, z: c.z });
      if (c.hp <= 0) { W.crabs = W.crabs.filter(k => k !== c); }
      break;
    }
  }
}

// ---------- 打包 / 解包（網路傳輸）----------
const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
function packShip(s) {
  return { id: s.id, e: s.enemy ? 1 : 0, x: r2(s.x), z: r2(s.z), h: r3(s.heading), sp: r2(s.speed), ru: r2(s.rudder), sl: r2(s.sail), sa: r2(s.sailAng), an: r2(s.anchor), ad: s.anchorDir, w: r3(s.water), ho: s.holes, c: s.cannons.map(c => [r2(c.yaw), r2(c.pitch), c.loaded]), b: s.balls, pk: s.planks, sk: r2(s.sink), pw: r2(s._power || 0) };
}
function unpackShip(o, prev) {
  const s = prev || newShip(o.id, o.x, o.z, o.h, !!o.e);
  s._tx = o.x; s._tz = o.z; s._th = o.h; s._tt = performance.now();     // 客戶端平滑用的目標
  if (!prev || Math.hypot(prev.x - o.x, prev.z - o.z) > 30) { s.x = o.x; s.z = o.z; s.heading = o.h; }
  Object.assign(s, { id: o.id, enemy: !!o.e, speed: o.sp, rudder: o.ru, sail: o.sl, sailAng: o.sa, anchor: o.an, anchorDir: o.ad, water: o.w, holes: o.ho, cannons: o.c.map(c => ({ yaw: c[0], pitch: c[1], loaded: c[2] })), balls: o.b, planks: o.pk, sink: o.sk, _power: o.pw });
  return s;
}
/** 客戶端：每幀把船平滑地推向房主給的位置（含航行外插） */
export function smoothShips(W, dt) {
  const now = performance.now();
  for (const s of [W.ship, ...W.enemies]) {
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
    s: packShip(W.ship), en: W.enemies.map(packShip), q: W.quests,
    tr: W.treasures.map(t => [t.id, t.tier, t.st, r2(t.x), r2(t.y), r2(t.z), t.carrier, t.isl ?? -1, r2(t.lx || 0), r2(t.ly || 0), r2(t.lz || 0)]),
    cr: W.crabs.map(c => [c.id, r2(c.x), r2(c.z), r2(c.h), c.hp, c.mv]),
  };
}
export function unpack(W, o) {
  W.gold = o.g; W.wind.a = o.wd[0]; W.wind.s = o.wd[1]; W.amp = o.am; W.day = o.dy; W.storm.on = o.so; W.storm.x = o.sx; W.storm.z = o.sz; W.storm.r = o.sr;
  W.ship = unpackShip(o.s, W.ship && W.ship.id === o.s.id ? W.ship : null);
  W.enemies = o.en.map(e => unpackShip(e, W.enemies.find(x => x.id === e.id)));
  W.quests = o.q;
  W.treasures = o.tr.map(a => ({ id: a[0], tier: a[1], st: a[2], x: a[3], y: a[4], z: a[5], carrier: a[6], isl: a[7] < 0 ? undefined : a[7], lx: a[8], ly: a[9], lz: a[10] }));
  W.crabs = o.cr.map(a => ({ id: a[0], x: a[1], z: a[2], h: a[3], hp: a[4], mv: a[5] }));
}
