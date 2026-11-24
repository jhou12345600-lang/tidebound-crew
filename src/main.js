// ===== 怒海同舟 3D：主程式 =====
import * as THREE from 'three';
import { createWorld } from './world.js';
import { buildShip, buildChest, buildPerson } from './shipmesh.js';
import { newWorld, step, act, pack, unpack, smoothShips, shipPose, cannonMuzzle, shipVel, TIER, ballStep, muzzleV, allShips, AMMO, AMMO_KEYS, KINDS, waterlineLocal, maxHP, gunReload } from './sim.js';
import { createFX } from './fx.js';
import { sea, waveHeight } from './waves.js';
import { ISLANDS, terrainH, groundH, MERCHANT, MERCHANTS, WORLD_R, nearestIsland, CASTLES, seaAt } from './geo.js';
import { DECK, HOLD, STATIONS, CANNONS, CRATES, LADDERS, MAST, shipFloor, shipClamp, holdW, deckW } from './shipdef.js';
import { MqttNet, LocalNet } from './net.js';
import { initAudio, ambient, sfx } from './audio.js';
import { Accounts, keyOf } from './account.js';
import { initUI, renderFriends, setKeyOf, ui, toast, chatLine, drawMap, drawTreasureMap, openShop, closeAll, anyOverlay, updateHotbar } from './ui.js';

const $ = id => document.getElementById(id);
const world = createWorld($('cv'));
const { scene, camera, renderer } = world;
const FX = createFX(scene, camera, renderer);

// ---------- 遊戲狀態 ----------
let W = newWorld(), isHost = true, net = null, room = null, started = false;
const myId = Math.random().toString(36).slice(2, 8);
const COLORS = [0xc4422b, 0x16707a, 0xe0a92d, 0x5a6fd6, 0x6c9a3c, 0x9a4fb0];
const me = {
  name: '船員', color: COLORS[0], onShip: true, lp: new THREE.Vector3(0, DECK, -6), wp: new THREE.Vector3(), v: new THREE.Vector3(),
  yaw: 0, pitch: 0, hp: 100, item: 0, inv: { n: 0, c: 0, f: 0, x: 0, p: 0 }, ammo: 'n', bucket: 0, carry: null, station: null, dead: 0, grounded: true, swim: false,
  useCD: 0, digProg: 0, digTid: null, repair: null, mapIdx: 0, zoom: false,
};
const remotes = new Map();   // id → {id,name,color,s,p:[],yaw,it,ca,d,mesh,last,tp}
const keys = {};
let mouseDown = false, locked = false;

// ---------- 場景物件 ----------
const myShip = buildShip('player'); scene.add(myShip.root);
const npcMeshes = new Map();
const camRig = new THREE.Object3D(); camRig.add(camera); myShip.root.add(camRig);
const treasureMeshes = new Map(), crabMeshes = new Map(), ballVis = new Map();
const ballGeo = new THREE.SphereGeometry(0.22, 10, 8), ballMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.6, roughness: 0.4 });
const ballMats = { n: ballMat, c: ballMat, f: new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 2 }), x: new THREE.MeshStandardMaterial({ color: 0x151515, emissive: 0x401000, roughness: 0.6 }) };
function ballMesh(a) {
  if (a !== 'c') { const m = new THREE.Mesh(ballGeo, ballMats[a] || ballMat); if (a === 'x') m.scale.setScalar(1.3); return m; }
  const g = new THREE.Group(); const b1 = new THREE.Mesh(ballGeo, ballMat), b2 = new THREE.Mesh(ballGeo, ballMat); b1.position.x = -0.8; b2.position.x = 0.8; g.add(b1, b2);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.05), ballMat)); return g;
}
const bottleMesh = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x5fae8a, transparent: true, opacity: 0.8, roughness: 0.1 })); b.rotation.z = 1.2; g.add(b); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a44 })); c.position.set(-0.27, 0.1, 0); c.rotation.z = 1.2; g.add(c); const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xf3ead2 })); paper.rotation.z = 1.2; g.add(paper); return g; };
const crabMesh = () => {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xa8553a, roughness: 0.9, flatShading: true }), sh = new THREE.MeshStandardMaterial({ color: 0x6d6a62, roughness: 1, flatShading: true });
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), sh); body.scale.set(1.3, 0.55, 1); body.position.y = 0.7; g.add(body);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.9, 5), m); leg.position.set(s * 0.95, 0.4, -0.35 + i * 0.35); leg.rotation.z = s * 0.9; g.add(leg); }
    const claw = new THREE.Group(); claw.position.set(s * 0.6, 0.75, 0.75); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.55), m); c1.position.z = 0.25; claw.add(c1); const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), m); c2.position.set(s * 0.12, 0.14, 0.3); claw.add(c2); g.add(claw);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd34a })); eye.position.set(s * 0.22, 1.05, 0.55); g.add(eye);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
};

// 手上道具（第一人稱）
const ITEMS = [
  { k: 'sword', n: '劍' }, { k: 'shovel', n: '鏟子' }, { k: 'plank', n: '木板' }, { k: 'bucket', n: '水桶' }, { k: 'map', n: '藏寶圖' }, { k: 'glass', n: '望遠鏡' },
];
const held = new THREE.Group(); held.scale.setScalar(0.55); camera.add(held);
const heldItems = (() => {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.9 }), steel = new THREE.MeshStandardMaterial({ color: 0xd5dbe2, metalness: 0.25, roughness: 0.35 }), brass = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.3, roughness: 0.4 });
  const mk = () => new THREE.Group();
  const sword = mk(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.012), steel); blade.position.y = 0.42; sword.add(blade); const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.05), brass); guard.position.y = 0.07; sword.add(guard); const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), wood); sword.add(grip); sword.rotation.set(-0.5, 0, -0.2);
  const shovel = mk(); const sh1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 6), wood); sh1.position.y = 0.2; shovel.add(sh1); const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.02), steel); head.position.y = 0.66; shovel.add(head); shovel.rotation.set(-0.9, 0.2, -0.1);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.7), wood); plank.rotation.set(0.2, 0.3, 0);
  const bucket = mk(); const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.24, 12, 1, true), wood); bk.material = wood.clone(); bk.material.side = THREE.DoubleSide; bucket.add(bk); const bw = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a7a8a, roughness: 0.1 })); bw.position.y = 0.08; bucket.add(bw); bucket.userData.w = bw; bucket.position.y = -0.05;
  const map = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), new THREE.MeshStandardMaterial({ color: 0xe8d6a0, side: THREE.DoubleSide })); map.position.set(-0.25, 0.05, 0.05); map.rotation.set(-0.6, 0.3, 0);
  const glass = mk(); const g1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.4, 10).rotateX(Math.PI / 2), brass); glass.add(g1); glass.rotation.set(0.1, 0.2, 0);
  const gun = mk(); const gb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.62, 8).rotateX(Math.PI / 2).translate(0, 0.05, -0.2), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.4 })); gun.add(gb);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.34).translate(0, -0.02, 0.18), wood); stock.rotation.x = 0.25; gun.add(stock);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), brass); lock.position.set(0.03, 0.08, 0.02); gun.add(lock); gun.rotation.set(0.05, 0.08, 0);
  const chest = buildChest(1); chest.scale.setScalar(0.7); chest.position.set(-0.32, -0.15, -0.35);
  return [sword, shovel, plank, bucket, map, glass, gun, chest].map(o => { held.add(o); o.visible = false; return o; });
})();
let swingT = 0;

// 砲彈軌跡預覽
const trajGeo = new THREE.BufferGeometry(); trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
const traj = new THREE.Line(trajGeo, new THREE.LineDashedMaterial({ color: 0xfff2c0, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.8, depthTest: false })); traj.visible = false; traj.frustumCulled = false; scene.add(traj);

// 特效改由 fx.js 處理
let shake = 0;

// ---------- 網路 ----------
const send = (k, m) => net && net.pub(k, m);
function doAct(m) {
  if (isHost) { act(W, myId, m, simPlayers()); flushEvents(); }
  else send('ac', m);
}
function simPlayers() {
  const l = [{ id: myId, onShip: me.onShip, lp: me.lp.toArray(), wp: me.wp.toArray(), dead: me.dead > 0 }];
  for (const r of remotes.values()) l.push({ id: r.id, onShip: !!r.s, lp: r.s ? r.p : null, wp: r.s ? null : r.p, dead: !!r.d });
  return l;
}
function flushEvents() {
  if (!W.events.length) return;
  const evs = W.events; W.events = [];
  if (net) send('ev', { l: evs });
  for (const e of evs) handleEvent(e);
}
function onNet(k, m) {
  if (k === 'st' && !isHost) {
    // 自己正在操作的站位：保留本地數值，避免被舊狀態拉回
    const S0 = W.ship, keep = me.station === 'helm' ? { rudder: S0.rudder } : me.station === 'sail' ? { sail: S0.sail, sailAng: S0.sailAng } : null;
    const ci = me.station && me.station.cannon !== undefined ? me.station.cannon : -1, aim = ci >= 0 ? { ...S0.cannons[ci] } : null;
    unpack(W, m);
    if (keep && W.ship.id === S0.id) Object.assign(W.ship, keep);
    if (aim && W.ship.cannons[ci]) { W.ship.cannons[ci].yaw = aim.yaw; W.ship.cannons[ci].pitch = aim.pitch; } if (!started) beginPlay(); if (Math.abs(sea.t - m.t) > 1.5) sea.t = m.t; else sea.t += (m.t - sea.t) * 0.1; W.t = sea.t; return; }
  if (k === 'ev' && !isHost) { for (const e of m.l) handleEvent(e); return; }
  if (k === 'ac' && isHost) { act(W, m._f, m, simPlayers()); flushEvents(); return; }
  if (k === 'p') {
    let r = remotes.get(m.id);
    if (!r) { r = { id: m.id }; remotes.set(m.id, r); toast(`${m.n} 上船了！`); sfx.chime(); }
    const changed = r.s !== m.s; Object.assign(r, m, { last: performance.now() });
    if (!r.mesh || r.mesh.userData.col !== m.c) { if (r.mesh) r.mesh.parent?.remove(r.mesh); r.mesh = buildPerson(m.c); r.mesh.userData.col = m.c; addTag(r.mesh, m.n); r.cur = null; }
    if (changed || !r.cur) { r.cur = m.p.slice(); (m.s ? myShip.root : scene).add(r.mesh); }
    return;
  }
  if (k === 'ch') { chatLine(m.n, m.t); return; }
  if (k === 'bye') { const r = remotes.get(m.id); if (r) { r.mesh?.parent?.remove(r.mesh); remotes.delete(m.id); toast(`${r.n || '船員'} 下線了`); } if (m.host && !isHost) { ui.msg('房主離開了', '這艘船的房主已經離線，連線結束。重新整理頁面可以再建立或加入房間。'); } return; }
}
function addTag(mesh, name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '700 30px "Noto Sans TC",sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(10,25,35,.6)'; const w = g.measureText(name).width + 24; g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 10); g.fill(); g.fillStyle = '#fff'; g.fillText(name, 128, 43);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(1.6, 0.4, 1); s.position.y = 2.35; s.renderOrder = 5; mesh.add(s);
}

// ---------- 事件 ----------
const myPos = () => camera.getWorldPosition(new THREE.Vector3());
const shipById = id => allShips(W).find(s => s.id === id);
function meshById(id) { return id === 0 ? myShip : npcMeshes.get(id); }
function shakeAt(x, y, z, k) { const d = myPos().distanceTo(new THREE.Vector3(x, y, z)); shake = Math.max(shake, k * Math.max(0, 1 - d / 120)); }
function handleEvent(e) {
  const cp = myPos();
  const dist = (x, z) => Math.hypot(x - cp.x, z - cp.z);
  switch (e.e) {
    case 'fire': {
      const m = ballMesh(e.a); m.position.fromArray(e.p); scene.add(m);
      ballVis.set(e.id, { m, p: e.p.slice(), v: e.v.slice(), a: e.a, life: 12, tr: 0, wh: 0 });
      const dir = new THREE.Vector3().fromArray(e.v).normalize();
      const big = typeof e.o === 'string' ? 1.4 : (shipById(e.o)?.kind === 'flag' ? 1.3 : 1);
      FX.muzzle(new THREE.Vector3().fromArray(e.p), dir, big); sfx.cannon(dist(e.p[0], e.p[2]));
      const sm = typeof e.o === 'number' ? meshById(e.o) : null; if (sm && e.i >= 0) sm.recoil(e.i);
      if (e.o === 0 && me.onShip) shake = Math.max(shake, 0.35); else shakeAt(e.p[0], e.p[1], e.p[2], 0.3);
      break;
    }
    case 'hit': {
      killBall(e.id); FX.explosion(e.x, e.y, e.z, e.a); sfx.boom(dist(e.x, e.z), e.a === 'x' ? 1.4 : 0.8); shakeAt(e.x, e.y, e.z, e.a === 'x' ? 1.4 : 0.9);
      if (e.s === 0) { if (me.onShip) { shake = Math.max(shake, e.a === 'x' ? 1.3 : 0.8); toast(e.a === 'c' ? '⛓ 鏈彈打爛了船帆！拿木板到桅杆修帆' : e.a === 'f' ? '🔥 甲板起火了！拿水桶（4）去滅火' : e.d ? '💥 甲板被轟中！' : '💥 船身被打穿了！快下船艙補洞！', 1); } }
      else if (e.by === 0) toast(e.a === 'x' ? '💥 爆裂彈命中！' : e.a === 'f' ? '🔥 敵船起火了！' : e.a === 'c' ? '⛓ 鏈彈撕裂了敵帆！' : '🎯 命中！');
      break;
    }
    case 'sailhit': { FX.tear(e.x, e.y, e.z); if (dist(e.x, e.z) < 60) sfx.rip(); break; }
    case 'splash': { killBall(e.id); FX.splash(e.x, e.z, e.a); sfx.splash(dist(e.x, e.z)); if (e.a === 'x') sfx.boom(dist(e.x, e.z), 0.9); break; }
    case 'skip': { const b = ballVis.get(e.id); if (b) { b.p = e.p.slice(); b.v = e.v.slice(); } FX.skip(e.p[0], e.p[2]); sfx.splash(dist(e.p[0], e.p[2]) + 40); break; }
    case 'boom': { killBall(e.id); FX.dirt(e.x, e.y, e.z, e.a === 'x' ? 2 : 1); sfx.boom(dist(e.x, e.z), 0.6); break; }
    case 'thit': { killBall(e.id); FX.dirt(e.x, e.y, e.z, 1.2); FX.explosion(e.x, e.y, e.z, e.a, 0.6); sfx.boom(dist(e.x, e.z), 0.8); break; }
    case 'tdown': { FX.explosion(e.x, e.y, e.z, 'x', 2.2); FX.dirt(e.x, e.y - 6, e.z, 3); sfx.crumble(dist(e.x, e.z)); shakeAt(e.x, e.y, e.z, 1.5); ruinSmoke.push({ x: e.x, y: e.y - 6, z: e.z, t: 120 }); break; }
    case 'fortdown': sfx.coin(); break;
    case 'dmg': if (e.pid === myId && me.dead <= 0) { me.hp -= e.n; sfx.hurt(); $('hurt').style.opacity = 1; setTimeout(() => $('hurt').style.opacity = 0, 250); if (e.src === 'fire') toast('🔥 好燙！離開火堆', 1); if (me.hp <= 0) die(); } break;
    case 'give': if (e.pid === myId) { const k = e.k; me.inv[k] = Math.min(5, (me.inv[k] || 0) + e.n); sfx.thunk(); toast(`拿了${k === 'p' ? '木板' : AMMO[k]}（身上 ${me.inv[k]}）`); if (k !== 'p') me.ammo = k; } break;
    case 'loaded': sfx.thunk(); break;
    case 'repaired': if (e.pid === myId) { sfx.thunk(); toast('🔨 補好一個破洞'); } break;
    case 'doused': FX.steam(e.x, e.y, e.z); sfx.hiss(); break;
    case 'dug': FX.dirt(e.x, terrainH(e.x, e.z) + 0.3, e.z, 0.6); sfx.dig(); if (e.pid === myId) { toast('✨ 挖到寶箱了！按 E 扛起來，搬回船上'); me.digProg = 0; } break;
    case 'sold': { sfx.coin(); const who = e.pid === myId ? '你' : (remotes.get(e.pid)?.n || '船員'); toast(`💰 ${who}賣出${TIER[e.tier].name}，獲得 ${e.g} 金`); if (e.pid === myId) { me.carry = null; } break; }
    case 'coin': sfx.coin(); break;
    case 'msg': if (!e.pid || e.pid === myId) toast(e.t, e.warn); break;
    case 'fleet': sfx.thunder(); break;
    case 'sinking': {
      if (e.s === 0) toast('🌊 船在下沉！大家跳船！', 1);
      FX.explosion(e.x, 3, e.z, 'x', 1.6); sfx.boom(dist(e.x, e.z), 1.2); FX.wreck(e.x, e.z, e.k === 'flag' ? 60 : 35); break;
    }
    case 'shipReset': me.onShip = true; me.lp.set(0, DECK, -6); me.v.set(0, 0, 0); me.station = null; me.carry = null; reparentCam(); break;
    case 'bump': sfx.hit(dist(e.x, e.z)); FX.explosion(e.x, 1, e.z, 'n', 0.5); if (e.s === 0 && me.onShip) { shake = 0.6; toast('💥 撞到礁石了！船身破洞！', 1); } break;
    case 'ram': sfx.hit(dist(e.x, e.z)); sfx.crumble(dist(e.x, e.z) + 80); FX.explosion(e.x, 2, e.z, 'n', 0.8); if (e.s.includes(0) && me.onShip) { shake = 1; toast('💥 兩艘船撞在一起了！', 1); } break;
    case 'crabhit': FX.dirt(e.x, terrainH(e.x, e.z) + 0.8, e.z, 0.3); break;
    case 'shot': { const a = new THREE.Vector3(e.x, e.y, e.z), b = new THREE.Vector3(e.tx, e.ty, e.tz); FX.gunshot(a, b, false); sfx.gunshot(dist(e.x, e.z)); break; }
    case 'pshot': if (e.pid !== myId) { FX.gunshot(new THREE.Vector3().fromArray(e.p), new THREE.Vector3().fromArray(e.q), false); sfx.gunshot(dist(e.p[0], e.p[2])); } break;
    case 'gswing': sfx.swing(); break;
    case 'ghit': FX.blood(e.x, terrainH(e.x, e.z) + 1.1, e.z); break;
    case 'gdown': { FX.blood(e.x, terrainH(e.x, e.z) + 0.8, e.z, 2); FX.dirt(e.x, terrainH(e.x, e.z) + 0.3, e.z, 0.4); if (dist(e.x, e.z) < 80) toast(`⚔ 擊倒守軍！+${e.g} 金`); break; }
    case 'sea': showSea(e.n); break;
  }
}
const ruinSmoke = [];
function showSea(n) { const el = $('seaName'); el.textContent = n; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); sfx.chime(); }
// 守軍模型
const guardMeshes = new Map();
const GUARD_COL = { shark: [0x2b2b2b, 0x7a1717], frost: [0x9fc4d8, 0x3d5566], navy: [0x1f4f8c, 0xe8ecef], red: [0x8c1f14, 0x2a1410], mist: [0x5f6b66, 0x2b3230] };
function guardMesh(g) {
  const C = CASTLES[g.f], [c1, c2] = GUARD_COL[C.faction] || GUARD_COL.shark;
  const m = buildPerson(c1, c2);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd5dbe2, metalness: 0.3, roughness: 0.4 }), wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22 });
  const arm = m.userData.arms[1];
  if (g.k === 's') { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.02), steel); bl.position.set(0, -0.95, 0.3); bl.rotation.x = 1.2; arm.add(bl); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: c2 })); sh.position.set(-0.45, 1.15, 0.15); m.add(sh); }
  else { const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2c })); gun.position.set(0.15, 1.25, 0.45); m.add(gun); const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.4), wood); st.position.set(0.15, 1.2, -0.1); m.add(st); }
  // 血條
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), new THREE.MeshBasicMaterial({ color: 0xd03a2a, depthTest: false, transparent: true })); bar.position.y = 2.3; bar.renderOrder = 6; m.add(bar); m.userData.bar = bar;
  return m;
}
function killBall(id) { const b = ballVis.get(id); if (b) { scene.remove(b.m); ballVis.delete(id); } }

// ---------- 玩家 ----------
function reparentCam() { (me.onShip ? myShip.root : scene).add(camRig); }
let shipPoseCur = shipPose(W.ship, 0, {});
function localToWorld(v) { return v.clone().applyMatrix4(shipPoseCur.mat); }
function worldToLocal(v) { return v.clone().applyMatrix4(shipPoseCur.inv); }
function goOverboard() {
  const wp = localToWorld(me.lp);
  const lv = me.v.clone().applyQuaternion(shipPoseCur.quat); const [vx, vz] = shipVel(W.ship);
  me.onShip = false; me.wp.copy(wp); me.v.set(lv.x + vx, lv.y, lv.z + vz); me.station = null; reparentCam();
}
function boardShip(L) {
  me.onShip = true; me.lp.set(L.x - L.side * 0.9, DECK, L.z); me.v.set(0, 0, 0); me.yaw = L.side > 0 ? -Math.PI / 2 : Math.PI / 2; reparentCam(); sfx.thunk();
}
function die() { me.dead = 6; me.hp = 0; me.station = null; if (me.carry) { dropCarry(); } $('dead').classList.remove('hidden'); }
function respawn() {
  me.dead = 0; me.hp = maxHP(W); $('dead').classList.add('hidden');
  if (W.ship.sink <= 0) { me.onShip = true; me.lp.set(0, DECK, -6); }
  else { me.onShip = false; me.wp.set(MERCHANT.x, MERCHANT.y, MERCHANT.z + 6); }
  me.v.set(0, 0, 0); reparentCam();
}
function dropCarry() {
  const t = W.treasures.find(t => t.id === me.carry); if (!t) { me.carry = null; return; }
  const fwd = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  if (me.onShip) {
    const p = me.lp.clone().addScaledVector(fwd, 1.0); const f = shipFloor(p.x, p.y + 0.3, p.z); if (f === null) { p.copy(me.lp); }
    p.y = shipFloor(p.x, p.y + 0.3, p.z) ?? me.lp.y;
    doAct({ a: 'drop', tid: me.carry, onShip: 1, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
  } else { const p = me.wp.clone().addScaledVector(fwd, 1.0); doAct({ a: 'drop', tid: me.carry, onShip: 0, p: [p.x, p.y, p.z] }); }
  me.carry = null; me.dropT = performance.now(); sfx.thunk();
}

/** 找出目前可以互動的東西 */
function findTarget() {
  if (me.dead > 0) return null;
  const eye = myPos(), dir = camera.getWorldDirection(new THREE.Vector3());
  let best = null, bs = -1;
  const consider = (wpos, range, o) => {
    const d = wpos.clone().sub(eye), dl = d.length(); if (dl > range) return;
    const dot = d.normalize().dot(dir); const score = dot - dl / range * 0.3;
    if (dot > 0.55 && score > bs) { bs = score; best = o; }
  };
  const L = (x, y, z) => localToWorld(new THREE.Vector3(x, y, z));
  if (me.onShip) {
    consider(L(0, DECK + 1.2, -8.8), 2.6, { k: 'helm', t: '掌舵' });
    consider(L(0, DECK + 1.2, -1), 2.4, { k: 'sail', t: '調整船帆' });
    consider(L(0, DECK + 0.7, STATIONS.anchor.z + 0.9), 2.6, { k: 'anchor', t: W.ship.anchor > 0.5 ? '起錨' : '下錨' });
    CANNONS.forEach((c, i) => consider(L(c.x, DECK + 0.6, c.z), 2.4, { k: 'cannon', i, t: '操作大砲' }));
    for (const k in CRATES) { const c = CRATES[k]; consider(L(c.x, c.y + 0.6, c.z), 2.4, { k: 'crate', c: k, t: `拿${c.label}（船上剩 ${W.ship.sup[k]}）` }); }
    if (me.item === 2 && !me.carry) {
      for (const h of W.ship.holes) consider(L(h.x, h.y, h.z), 2.6, { k: 'hole', h, t: me.inv.p ? '按住左鍵補洞' : '身上沒有木板（去木板箱拿）', lmb: 1 });
      if (W.ship.sailHP < 0.99) consider(L(MAST.x, DECK + 1.4, MAST.z), 2.6, { k: 'mast', t: me.inv.p ? `按住左鍵修補船帆（${Math.round(W.ship.sailHP * 100)}%）` : '身上沒有木板（去木板箱拿）', lmb: 1 });
    }
    if (me.item === 3 && me.bucket && !me.carry) for (const f of W.ship.fires) consider(L(f.x, DECK + 0.4, f.z), 3.6, { k: 'fire', f, t: '左鍵潑水滅火', lmb: 1 });
  }
  for (const t of W.treasures) {
    if (me.carry) break;
    if (t.st === 'ship') consider(L(t.lx, t.ly + 0.4, t.lz), 2.5, { k: 'pick', tid: t.id, t: `扛起${TIER[t.tier].name}` });
    else if (t.st === 'ground') consider(new THREE.Vector3(t.x, t.y + 0.4, t.z), 2.6, { k: 'pick', tid: t.id, t: `扛起${TIER[t.tier].name}` });
    else if (t.st === 'float' || t.st === 'bottle') consider(new THREE.Vector3(t.x, waveHeight(t.x, t.z), t.z), 3.2, { k: 'pick', tid: t.id, t: t.st === 'bottle' ? '撿起漂流瓶' : `撈起${TIER[t.tier].name}` });
  }
  if (!me.onShip) {
    for (const Ld of LADDERS) consider(L(Ld.x, DECK - 1.2, Ld.z), 3.2, { k: 'ladder', L: Ld, t: '爬上船' });
    for (const M of MERCHANTS) consider(new THREE.Vector3(M.x + 2.5, M.y + 1.5, M.z + 0.2), 4.5, { k: 'shop', t: me.carry ? '賣出寶箱' : `和${M.name}的收購商說話（賣寶、強化、補給）` });
  }
  return best;
}
function interact(tg) {
  if (!tg) return;
  switch (tg.k) {
    case 'helm': me.station = 'helm'; me.lp.set(STATIONS.helm.x, DECK, STATIONS.helm.z); me.yaw = Math.PI; break;
    case 'sail': me.station = 'sail'; me.lp.set(STATIONS.sail.x, DECK, STATIONS.sail.z); me.yaw = Math.PI; break;
    case 'anchor': doAct({ a: 'anchor' }); sfx.creak(); break;
    case 'cannon': me.station = { cannon: tg.i }; break;
    case 'crate': { const k = tg.c, need = 5 - (me.inv[k] || 0); if (need <= 0) toast('身上已經滿了（每種最多 5 個）'); else doAct({ a: 'take', k, n: need }); break; }
    case 'pick': { const bottle = W.treasures.find(t => t.id === tg.tid && t.st === 'bottle'); if (!bottle) { me.carry = tg.tid; me.carryT = performance.now(); } doAct({ a: 'pick', tid: tg.tid }); sfx.thunk(); break; }
    case 'ladder': boardShip(tg.L); break;
    case 'shop': if (me.carry) { doAct({ a: 'sell', tid: me.carry }); } else openShopMenu(); break;
  }
}
function openShopMenu() {
  if (document.pointerLockElement) document.exitPointerLock();
  const cp = myPos(); let M = MERCHANTS[0], bd = 1e9; for (const m of MERCHANTS) { const d = Math.hypot(m.x - cp.x, m.z - cp.z); if (d < bd) { bd = d; M = m; } }
  openShop(W, {
    quest: () => doAct({ a: 'quest' }),
    restock: () => doAct({ a: 'restock' }),
    buyx: () => doAct({ a: 'buyx' }),
    bounty: () => doAct({ a: 'bounty' }),
    pardon: () => doAct({ a: 'pardon' }),
    upgrade: k => doAct({ a: 'upgrade', k }),
  }, M.name);
}

// ---------- 輸入 ----------
addEventListener('keydown', e => {
  if (!started) return;
  if (document.activeElement === $('chatIn')) {
    if (e.key === 'Enter') { const t = $('chatIn').value.trim(); if (t) { chatLine(me.name, t); send('ch', { n: me.name, t }); } $('chatIn').value = ''; $('chatIn').classList.add('hidden'); $('chatIn').blur(); $('cv').requestPointerLock?.(); }
    if (e.key === 'Escape') { $('chatIn').classList.add('hidden'); $('chatIn').blur(); }
    return;
  }
  keys[e.code] = true;
  if (e.code === 'Enter' && net) { e.preventDefault(); $('chatIn').classList.remove('hidden'); $('chatIn').focus(); document.exitPointerLock?.(); return; }
  if (e.code === 'KeyF') { const o = $('frOv'); o.classList.toggle('hidden'); if (!o.classList.contains('hidden')) { document.exitPointerLock?.(); renderFriends($('friendList2'), acc, ui_h, true); } }
  if (e.code === 'KeyH') { $('helpOv').classList.toggle('hidden'); if (!$('helpOv').classList.contains('hidden')) document.exitPointerLock?.(); }
  if (e.code === 'KeyM') { const o = $('mapOv'); o.classList.toggle('hidden'); if (!o.classList.contains('hidden')) drawMap(W, me, myPos(), remotes); }
  if (e.code === 'Escape') closeAll();
  if (anyOverlay()) return;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < 7 && !me.carry) { me.item = n; sfx.thunk(); if (n === 6 && !W.up.gun) toast('還沒有火槍：到任何港口找收購商「強化」買一把'); } }
  if (e.code === 'KeyE') {
    if (me.station) { me.station = null; return; }
    interact(findTarget());
  }
  if (e.code === 'KeyG' && me.carry) dropCarry();
  if (e.code === 'KeyR' && me.station && me.station.cannon !== undefined) {
    const cs = W.ship.cannons[me.station.cannon];
    if (!me.inv[me.ammo]) { const alt = AMMO_KEYS.find(k => me.inv[k] > 0); if (alt) me.ammo = alt; }
    if (cs.loaded) toast('已經裝好了，左鍵開砲'); else if (!me.inv[me.ammo]) toast('身上沒有彈藥！去下層船艙的彈藥箱拿', 1); else { me.inv[me.ammo]--; cs.loaded = me.ammo; doAct({ a: 'load', i: me.station.cannon, k: me.ammo }); }
  }
  if (e.code === 'KeyT' && me.station && me.station.cannon !== undefined) cycleAmmo();
  if (e.code === 'KeyQ' && me.item === 4) { me.mapIdx++; sfx.thunk(); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => {
  if (!started || anyOverlay()) return;
  if (!locked) { $('cv').requestPointerLock?.(); initAudio(); return; }
  if (e.button === 0) mouseDown = true; if (e.button === 2) me.zoom = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) me.zoom = false; });
addEventListener('contextmenu', e => e.preventDefault());
function cycleAmmo() { const have = AMMO_KEYS.filter(k => me.inv[k] > 0); if (!have.length) { toast('身上沒有彈藥'); return; } const i = have.indexOf(me.ammo); me.ammo = have[(i + 1) % have.length]; sfx.thunk(); }
addEventListener('wheel', e => { if (!started || !locked || me.carry) return; if (me.station && me.station.cannon !== undefined) { cycleAmmo(); return; } if (me.station) return; me.item = (me.item + (e.deltaY > 0 ? 1 : 6)) % 7; });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === $('cv'); $('pause').classList.toggle('hidden', locked || !started || anyOverlay()); });
addEventListener('mousemove', e => {
  if (!locked) return;
  const s = me.zoom && me.item === 5 ? 0.0006 : 0.0022;
  if (me.station && me.station.cannon !== undefined) {
    const cs = W.ship.cannons[me.station.cannon], side = CANNONS[me.station.cannon].side;
    cs.yaw = Math.max(-0.7, Math.min(0.7, cs.yaw - e.movementX * 0.0016 * 1));
    cs.pitch = Math.max(-0.12, Math.min(0.5, cs.pitch - e.movementY * 0.0014));
    return;
  }
  me.yaw -= e.movementX * s; me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * s));
});

// ---------- 每幀：玩家 ----------
let netT = 0, aimT = 0, stationSend = 0;
function updatePlayer(dt) {
  me.useCD = Math.max(0, me.useCD - dt);
  if (me.dead > 0) { me.dead -= dt; $('deadT').textContent = Math.ceil(me.dead); if (me.dead <= 0) respawn(); }
  const MX = maxHP(W); if (me.hp > 0 && me.hp < MX) me.hp = Math.min(MX, me.hp + dt * 2.5); me.gunOwned = W.up.gun > 0;
  const S = W.ship;
  if (me.onShip && S.sink > 1.2) { goOverboard(); toast('你掉進海裡了！游到岸邊或等新船', 1); }
  const typing = document.activeElement === $('chatIn');
  const k = c => !typing && !anyOverlay() && keys[c];
  let mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), mz = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);

  // ----- 站位操作 -----
  stationSend -= dt;
  if (me.station === 'helm') {
    S.rudder = Math.max(-1, Math.min(1, S.rudder + mx * dt * 0.9));
    if (stationSend <= 0) { doAct({ a: 'helm', v: +S.rudder.toFixed(3) }); stationSend = 0.12; }
    mx = mz = 0;
    $('station').innerHTML = `掌舵中：A/D 轉舵（${S.rudder > 0.05 ? '右' : S.rudder < -0.05 ? '左' : '正'} ${Math.round(Math.abs(S.rudder) * 100)}%）　E 離開`;
  } else if (me.station === 'sail') {
    S.sail = Math.max(0, Math.min(1, S.sail + mz * dt * 0.45)); S.sailAng = Math.max(-1, Math.min(1, S.sailAng - mx * dt * 0.6));
    if (stationSend <= 0) { doAct({ a: 'sail', down: +S.sail.toFixed(3), ang: +S.sailAng.toFixed(3) }); stationSend = 0.12; }
    mx = mz = 0;
    $('station').innerHTML = `調帆中：W/S 放下／收起帆（${Math.round(S.sail * 100)}%）　A/D 轉帆（吃風 ${Math.round((S._power || 0) * 100)}%）　E 離開`;
  } else if (me.station && me.station.cannon !== undefined) {
    const i = me.station.cannon, c = CANNONS[i], cs = S.cannons[i];
    const th = (c.side > 0 ? Math.PI / 2 : -Math.PI / 2) + cs.yaw;
    me.lp.set(c.x - Math.sin(th) * 1.3, DECK, c.z - Math.cos(th) * 1.3);
    me.yaw = th + Math.PI; me.pitch = cs.pitch * 0.8 - 0.05;
    aimT -= dt; if (aimT <= 0) { doAct({ a: 'aim', i, yaw: +cs.yaw.toFixed(3), pitch: +cs.pitch.toFixed(3) }); aimT = 0.1; }
    if (mouseDown && cs.loaded && me.useCD <= 0) { cs.loaded = 0; me.useCD = 0.6; doAct({ a: 'fire', i }); }
    mx = mz = 0;
    const inv = AMMO_KEYS.map(k => `${k === me.ammo ? '<b style="color:#f2c14e">▶' : '<span style="opacity:.75">'}${AMMO[k]} ${me.inv[k]}${k === me.ammo ? '</b>' : '</span>'}`).join('　');
    $('station').innerHTML = `大砲：滑鼠瞄準　左鍵開砲　R 裝填　T／滾輪 換彈種　E 離開<br>${cs.loaded ? `<span style="color:#9be08f">已裝填：${AMMO[cs.loaded]}</span>` : '<span style="color:#ff9a7a">未裝填</span>'}　｜　身上：${inv}`;
  } else $('station').innerHTML = me.carry ? '扛著寶箱：G 放下（扛到收購商按 E 賣出）' : '';

  // ----- 移動 -----
  const run = k('ShiftLeft') ? 1.6 : 1, carryF = me.carry ? 0.7 : 1;
  const sp = (me.swim ? 3.0 : 4.4) * run * carryF;
  const fx_ = -Math.sin(me.yaw), fz_ = -Math.cos(me.yaw);
  const wantX = (fx_ * mz + -fz_ * mx) * sp, wantZ = (fz_ * mz + fx_ * mx) * sp;
  if (me.dead > 0) { me.v.set(0, 0, 0); }
  else if (me.fly) { /* 除錯用的空中視角 */ }
  else if (me.onShip) {
    const p = me.lp;
    const inWater = S.water > 0 && p.y < HOLD + S.water * 2 - 0.4;
    const f = inWater ? 0.6 : 1;
    me.v.x += (wantX * f - me.v.x) * Math.min(1, dt * 12); me.v.z += (wantZ * f - me.v.z) * Math.min(1, dt * 12);
    if (k('Space') && me.grounded) { me.v.y = 6.2; me.grounded = false; }
    me.v.y -= 20 * dt;
    p.addScaledVector(me.v, dt);
    const fl = shipFloor(p.x, p.y, p.z);
    if (fl !== null && p.y <= fl) { p.y = fl; me.v.y = 0; me.grounded = true; } else me.grounded = false;
    const r = shipClamp(p);
    if (r === 'over' || p.y < -4) { goOverboard(); }
  } else {
    const p = me.wp;
    const g = groundH(p.x, p.z), wh = waveHeight(p.x, p.z);
    me.swim = g < wh - 1.3 && p.y < wh - 0.6;
    if (me.swim) {
      me.v.x += (wantX - me.v.x) * Math.min(1, dt * 4); me.v.z += (wantZ - me.v.z) * Math.min(1, dt * 4);
      const ty = wh - 1.45 + (k('Space') ? 0.4 : 0);
      me.v.y += (ty - p.y) * dt * 8 - me.v.y * dt * 3;
      p.addScaledVector(me.v, dt);
    } else {
      me.v.x += (wantX - me.v.x) * Math.min(1, dt * 12); me.v.z += (wantZ - me.v.z) * Math.min(1, dt * 12);
      if (k('Space') && me.grounded) { me.v.y = 6.2; me.grounded = false; }
      me.v.y -= 20 * dt;
      const nx = p.x + me.v.x * dt, nz = p.z + me.v.z * dt;
      const ng = groundH(nx, nz);
      if (ng - p.y > 1.2 && ng > wh - 1.3) { me.v.x = me.v.z = 0; } else { p.x = nx; p.z = nz; }
      p.y += me.v.y * dt;
      const gg = groundH(p.x, p.z);
      if (p.y <= gg) { p.y = gg; me.v.y = 0; me.grounded = true; } else me.grounded = p.y - gg < 0.05;
    }
    const d = Math.hypot(p.x, p.z); if (d > WORLD_R + 40) { p.x *= (WORLD_R + 40) / d; p.z *= (WORLD_R + 40) / d; }
  }

  // ----- 使用手上的東西（左鍵）-----
  const tg = findTarget();
  if (me.dead <= 0 && !me.station && !me.carry && mouseDown && locked && me.useCD <= 0 && !anyOverlay()) useItem(tg, dt);
  else if (!mouseDown) { me.repair = null; $('prog').classList.add('hidden'); }
  // 提示
  let pr = '';
  if (tg && !me.station) pr = tg.lmb ? tg.t : `<b>E</b>${tg.t}`;
  else if (!me.station && !me.carry && me.item === 1 && !me.onShip) { const qt = nearQuest(); if (qt) pr = '<b>左鍵</b>就在這附近！挖下去'; }
  else if (!me.station && !me.carry && me.item === 3 && me.onShip) pr = me.bucket ? (me.lp.y > DECK - 0.4 ? '<b>左鍵</b>把水倒進海裡（對著火可以滅火）' : '水桶滿了，上甲板倒掉') : (S.water > 0.03 && me.lp.y < DECK - 1 ? '<b>左鍵</b>舀船艙積水' : me.lp.y > DECK - 0.4 && nearRail() ? '<b>左鍵</b>從船邊打一桶海水（滅火用）' : '');
  $('prompt').innerHTML = pr;

  // ----- 攝影機 -----
  const eyeH = me.swim ? 1.55 : 1.62;
  if (me.onShip) camRig.position.set(me.lp.x, me.lp.y + eyeH, me.lp.z);
  else camRig.position.set(me.wp.x, me.wp.y + eyeH, me.wp.z);
  if (me.dead > 0) camRig.position.y -= 1.1;
  if (me.station && me.station.cannon !== undefined) camRig.position.y += 0.3;
  camRig.rotation.set(0, me.yaw, 0); camera.rotation.set(me.pitch, 0, (shake > 0 ? (Math.random() - .5) * shake * 0.05 : 0));
  if (shake > 0) { camera.position.set((Math.random() - .5) * shake * 0.1, (Math.random() - .5) * shake * 0.1, 0); shake = Math.max(0, shake - dt * 1.5); } else camera.position.set(0, 0, 0);
  const fov = me.zoom && me.item === 5 ? 16 : 72; if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
  if (!me.onShip) { const cpos = myPos(); $('under').style.opacity = cpos.y < waveHeight(cpos.x, cpos.z) - 0.05 ? 1 : 0; } else $('under').style.opacity = 0;

  // ----- 手上的道具 -----
  heldItems.forEach((o, i) => o.visible = !me.station && me.dead <= 0 && (me.carry ? i === 7 : i === me.item));
  heldItems[3].userData.w.visible = !!me.bucket;
  swingT = Math.max(0, swingT - dt * 3);
  const bob = Math.sin(performance.now() / 160) * Math.min(1, Math.hypot(me.v.x, me.v.z) / 4) * 0.015;
  held.position.set(0.24, -0.24 + bob, -0.45);
  held.rotation.set(-Math.sin(swingT * Math.PI) * 1.1, 0, 0);
  if (me.carry) held.position.set(0.1, -0.5, -0.62);
  // 藏寶圖疊層
  const showT = me.item === 4 && !me.carry && !me.station && me.dead <= 0 && started && !anyOverlay(true);
  $('tmap').classList.toggle('hidden', !showT);
  if (showT) drawTreasureMap(W, me);

  // ----- 傳送自己的姿態 -----
  netT -= dt;
  if (net && netT <= 0) {
    netT = 0.1;
    const p = me.onShip ? me.lp : me.wp;
    send('p', { id: myId, n: me.name, c: me.color, s: me.onShip ? 1 : 0, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], y: +me.yaw.toFixed(2), it: me.item, ca: me.carry, d: me.dead > 0 ? 1 : 0, host: isHost ? 1 : 0 });
  }
}
function nearRail() { return Math.abs(me.lp.x) > deckW(me.lp.z) - 0.9; }
function nearQuest() {
  for (const id of W.quests) { const t = W.treasures.find(t => t.id === id); if (t && t.st === 'buried' && Math.hypot(t.x - me.wp.x, t.z - me.wp.z) < 3.4) return t; }
  return null;
}
function useItem(tg, dt) {
  const S = W.ship;
  switch (me.item) {
    case 0: { // 劍
      me.useCD = 0.45; swingT = 1; sfx.swing();
      const eye = myPos(), dir = camera.getWorldDirection(new THREE.Vector3());
      let done = false;
      for (const g of W.guards) { const v = new THREE.Vector3(g.x, terrainH(g.x, g.z) + 1.1, g.z).sub(eye); if (v.length() < 3.4 && v.normalize().dot(dir) > 0.45) { doAct({ a: 'melee', k: 'g', id: g.id }); sfx.hit(0); done = true; break; } }
      if (!done) for (const c of W.crabs) { const v = new THREE.Vector3(c.x, terrainH(c.x, c.z) + 0.7, c.z).sub(eye); if (v.length() < 3.2 && v.normalize().dot(dir) > 0.45) { doAct({ a: 'melee', k: 'c', id: c.id }); sfx.hit(0); break; } }
      break;
    }
    case 1: { // 鏟子
      me.useCD = 0.55; swingT = 1;
      if (me.onShip) { toast('在船上不能挖！'); break; }
      const g = groundH(me.wp.x, me.wp.z); if (g < waveHeight(me.wp.x, me.wp.z) - 0.6) break;
      sfx.dig(); FX.dirt(me.wp.x - Math.sin(me.yaw) * 1.2, g + 0.2, me.wp.z - Math.cos(me.yaw) * 1.2, 0.15);
      const t = nearQuest();
      if (t) { if (me.digTid !== t.id) { me.digTid = t.id; me.digProg = 0; } me.digProg++; toast(`挖呀挖⋯⋯（${me.digProg}/4）`); if (me.digProg >= 4) { doAct({ a: 'dig', tid: t.id }); me.digProg = 0; } }
      else if (Math.random() < 0.3) toast('這裡只有沙子。對照藏寶圖（5）上的 X 位置再挖！');
      break;
    }
    case 2: { // 木板：補洞、修帆
      if (!tg || (tg.k !== 'hole' && tg.k !== 'mast') || !me.inv.p) break;
      const id = tg.k === 'hole' ? tg.h.id : 'mast', need = tg.k === 'hole' ? 1.3 : 2;
      if (!me.repair || me.repair.id !== id) me.repair = { id, t: 0 };
      me.repair.t += dt; $('prog').classList.remove('hidden'); $('prog').firstElementChild.style.width = Math.min(100, me.repair.t / need * 100) + '%';
      if (me.repair.t > 0.2 && Math.random() < dt * 4) sfx.thunk();
      if (me.repair.t >= need) { me.inv.p--; doAct(tg.k === 'hole' ? { a: 'repair', h: tg.h.id } : { a: 'mend' }); me.repair = null; me.useCD = 0.4; $('prog').classList.add('hidden'); swingT = 1; }
      break;
    }
    case 3: { // 水桶
      me.useCD = 0.5; swingT = 1;
      if (!me.onShip) { if (me.bucket) { me.bucket = 0; sfx.bucket(); } break; }
      if (!me.bucket) {
        if (me.lp.y < DECK - 1 && S.water > 0.03) { me.bucket = 1; me.bucketSea = 0; sfx.bucket(); }
        else if (me.lp.y > DECK - 0.4 && nearRail()) { me.bucket = 1; me.bucketSea = 1; sfx.bucket(); toast('打了一桶海水，對著火按左鍵滅火'); }
        else toast(S.water > 0.03 ? '要在下層船艙才舀得到積水' : '走到船邊欄杆可以打海水');
      } else if (tg && tg.k === 'fire') {
        me.bucket = 0; const wp = localToWorld(new THREE.Vector3(tg.f.x, DECK + 0.4, tg.f.z)); doAct({ a: 'douse', f: tg.f.id, x: wp.x, y: wp.y, z: wp.z }); sfx.bucket();
      } else {
        if (me.lp.y > DECK - 0.4) { me.bucket = 0; if (!me.bucketSea) doAct({ a: 'dump' }); sfx.bucket(); const wp = localToWorld(me.lp.clone().add(new THREE.Vector3(-Math.sin(me.yaw) * 1.4, 1.2, -Math.cos(me.yaw) * 1.4))); FX.steam(wp.x, wp.y, wp.z); }
        else toast('上甲板才能把水倒進海裡');
      }
      break;
    }
    case 4: break;
    case 5: break;
    case 6: { // 火槍
      if (!W.up.gun) { me.useCD = 0.6; toast('還沒有火槍：到港口找收購商「強化 → 火槍」購買'); break; }
      me.useCD = gunReload(W); swingT = 0.6;
      const eye = myPos(), dir = camera.getWorldDirection(new THREE.Vector3());
      let best = null, bt = 70;
      const test = (x, y, z, rad, o) => { const v = new THREE.Vector3(x, y, z).sub(eye), t = v.dot(dir); if (t < 0 || t > bt) return; const perp = v.clone().addScaledVector(dir, -t).length(); if (perp < rad) { bt = t; best = o; } };
      for (const g of W.guards) test(g.x, terrainH(g.x, g.z) + 1.1, g.z, 0.75, { k: 'g', id: g.id });
      for (const c of W.crabs) test(c.x, terrainH(c.x, c.z) + 0.7, c.z, 0.9, { k: 'c', id: c.id });
      const end = eye.clone().addScaledVector(dir, bt);
      const muzzle = eye.clone().addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.12, 0));
      FX.gunshot(muzzle, end, true); sfx.gunshot(0);
      doAct({ a: 'shoot', k: best ? best.k : 'x', id: best ? best.id : -1, p: muzzle.toArray().map(n => +n.toFixed(2)), q: end.toArray().map(n => +n.toFixed(2)) });
      shake = Math.max(shake, 0.15);
      break;
    }
  }
}

// ---------- 每幀：場景物件 ----------
function syncEntities(dt) {
  const t = sea.t;
  // 船
  shipPoseCur = shipPose(W.ship, t, shipPoseCur);
  myShip.root.position.set(W.ship.x, shipPoseCur.y, W.ship.z); myShip.root.quaternion.copy(shipPoseCur.quat);
  myShip.update(W.ship, W.wind, dt, t);
  myShip.light.intensity = (1 - lastDayL) * 40;
  myShip.pose = shipPoseCur;
  const seen = new Set();
  for (const e of W.npcs) {
    seen.add(e.id); let m = npcMeshes.get(e.id);
    if (!m) { m = buildShip(e.kind); m.pose = {}; m.root.scale.setScalar(e.scale); scene.add(m.root); npcMeshes.set(e.id, m); }
    shipPose(e, t, m.pose); m.root.position.set(e.x, m.pose.y, e.z); m.root.quaternion.copy(m.pose.quat); m.update(e, W.wind, dt, t);
  }
  for (const [id, m] of npcMeshes) if (!seen.has(id)) { scene.remove(m.root); npcMeshes.delete(id); }
  // 海面：挖掉船殼內的水、畫航跡
  const U = world.waterU, inv = U.uShipInv.value, wk = U.uWake.value; let ni = 0;
  const cpos = myPos();
  const list = allShips(W).map(s => ({ s, m: meshById(s.id) })).filter(o => o.m && o.m.pose && o.m.pose.inv).sort((a, b) => Math.hypot(a.s.x - cpos.x, a.s.z - cpos.z) - Math.hypot(b.s.x - cpos.x, b.s.z - cpos.z));
  for (const { s, m } of list) { if (ni >= 8) break; inv[ni].copy(m.pose.inv); wk[ni].set(s.x, s.z, s.heading, s.sink > 0 ? 0 : Math.abs(s.speed)); U.uWakeS.value[ni] = s.scale; ni++; }
  U.uShipN.value = ni;
  // 火、浪花、沉船泡沫
  fireLevel = 0;
  for (const { s, m } of list) {
    const d = Math.hypot(s.x - cpos.x, s.z - cpos.z); if (d > 700) continue;
    for (const f of s.fires) { const p = new THREE.Vector3(f.x, DECK, f.z).applyMatrix4(m.pose.mat); FX.burn(p.x, p.y, p.z, f.i * s.scale, dt); if (d < 40) fireLevel += f.i * (1 - d / 40); }
    if (s.sink > 0) { FX.sinkFoam(s.x, s.z, 12 * s.scale, dt); if (s.sink < 8 && Math.random() < dt * 3) { const p = new THREE.Vector3((Math.random() - .5) * 4, DECK, (Math.random() - .5) * 14).applyMatrix4(m.pose.mat); FX.burn(p.x, p.y, p.z, 0.8, dt * 6); } }
    else if (Math.abs(s.speed) > 3.5 && d < 300) {
      const bow = new THREE.Vector3(0, 0.6, 12.2).applyMatrix4(m.pose.mat), wh = waveHeight(bow.x, bow.z);
      if (bow.y < wh + 0.9 && Math.random() < dt * 20) { const [vx, vz] = shipVel(s); FX.spray(bow.x, wh + 0.2, bow.z, vx, vz, Math.min(3, Math.abs(s.speed) / 4 + (wh + 0.9 - bow.y))); }
    }
  }
  for (const r of ruinSmoke) { r.t -= dt; FX.burn(r.x + (Math.random() - .5) * 4, r.y, r.z + (Math.random() - .5) * 4, Math.min(1, r.t / 40), dt); }
  for (let i = ruinSmoke.length - 1; i >= 0; i--) if (ruinSmoke[i].t <= 0) ruinSmoke.splice(i, 1);
  // 寶藏
  const tSeen = new Set();
  for (const tr of W.treasures) {
    if (tr.st === 'buried') continue;
    if (tr.carrier === myId) { if (performance.now() - (me.dropT || 0) > 1200) me.carry = tr.id; if (me.carry === tr.id) continue; }
    tSeen.add(tr.id); let m = treasureMeshes.get(tr.id);
    if (!m) { m = tr.tier === 0 ? bottleMesh() : buildChest(tr.tier); treasureMeshes.set(tr.id, m); }
    if (tr.st === 'ship') { if (m.parent !== myShip.cargo) myShip.cargo.add(m); m.position.set(tr.lx, tr.ly, tr.lz); m.rotation.set(0, tr.id, 0); }
    else if (tr.st === 'carry') { const r = remotes.get(tr.carrier); if (r && r.mesh) { if (m.parent !== r.mesh) r.mesh.add(m); m.position.set(0, 0.9, 0.45); m.rotation.set(0, 0, 0); m.scale.setScalar(0.8); } else m.visible = false; }
    else { if (m.parent !== scene) scene.add(m); m.scale.setScalar(1); m.visible = true; const fl = tr.st === 'float' || tr.st === 'bottle'; m.position.set(tr.x, fl ? waveHeight(tr.x, tr.z) - (tr.tier ? 0.25 : 0) : tr.y, tr.z); m.rotation.set(fl ? Math.sin(t + tr.id) * 0.2 : 0, tr.id * 1.3, fl ? Math.cos(t * 0.8 + tr.id) * 0.2 : 0); }
  }
  for (const [id, m] of treasureMeshes) if (!tSeen.has(id)) { m.parent?.remove(m); treasureMeshes.delete(id); }
  if (me.carry && !W.treasures.some(t => t.id === me.carry && t.carrier === myId) && (isHost || performance.now() - (me.carryT || 0) > 1600)) me.carry = null;
  if (me.carry && !W.treasures.some(t => t.id === me.carry)) me.carry = null;
  if (me.carry) { const tr = W.treasures.find(t => t.id === me.carry); if (tr) { const ch = heldItems[7]; if (ch.userData.tier !== tr.tier) { held.remove(ch); heldItems[7] = buildChest(tr.tier); heldItems[7].scale.setScalar(0.7); heldItems[7].position.set(-0.32, -0.15, -0.35); heldItems[7].userData.tier = tr.tier; held.add(heldItems[7]); } } }
  // 礁石蟹
  const cSeen = new Set();
  for (const c of W.crabs) {
    cSeen.add(c.id); let m = crabMeshes.get(c.id); if (!m) { m = crabMesh(); scene.add(m); crabMeshes.set(c.id, m); m.position.set(c.x, terrainH(c.x, c.z), c.z); }
    m.position.x += (c.x - m.position.x) * Math.min(1, dt * 8); m.position.z += (c.z - m.position.z) * Math.min(1, dt * 8); m.position.y = terrainH(m.position.x, m.position.z) + (c.mv ? Math.abs(Math.sin(t * 14)) * 0.08 : 0);
    m.rotation.y = c.h;
  }
  const gSeen = new Set();
  for (const g of W.guards) {
    if (Math.hypot(g.x - cpos.x, g.z - cpos.z) > 450) continue;
    gSeen.add(g.id); let m = guardMeshes.get(g.id); if (!m) { m = guardMesh(g); scene.add(m); guardMeshes.set(g.id, m); m.position.set(g.x, terrainH(g.x, g.z), g.z); }
    const px = m.position.x, pz = m.position.z;
    m.position.x += (g.x - px) * Math.min(1, dt * 8); m.position.z += (g.z - pz) * Math.min(1, dt * 8); m.position.y = terrainH(m.position.x, m.position.z);
    m.rotation.y = g.h; m.userData.animate(g.mv ? 3.5 : 0, dt);
    const bar = m.userData.bar; bar.visible = g.hp < g.max; bar.scale.x = Math.max(0.02, g.hp / g.max); bar.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion())).premultiply(m.quaternion.clone().invert());
  }
  for (const [id, m] of guardMeshes) if (!gSeen.has(id)) { scene.remove(m); guardMeshes.delete(id); }
  // 火山煙柱
  for (const v of world.volcanoes) { const d = Math.hypot(v.x - cpos.x, v.z - cpos.z); if (d < 2600) FX.volcano(v.x, v.y, v.z, dt); }
  for (const [id, m] of crabMeshes) if (!cSeen.has(id)) { FX.dirt(m.position.x, m.position.y + 0.6, m.position.z, 0.4); scene.remove(m); crabMeshes.delete(id); }
  // 砲彈
  for (const [id, b] of ballVis) {
    ballStep(b.p, b.v, dt); b.m.position.fromArray(b.p); b.life -= dt;
    if (b.a === 'c') { b.m.rotation.y += dt * 18; b.m.lookAt?.(b.p[0] + b.v[0], b.p[1] + b.v[1], b.p[2] + b.v[2]); b.m.rotateY(t * 20); }
    b.tr -= dt; if (b.tr <= 0) { b.tr = 0.025; FX.trail(b.p[0], b.p[1], b.p[2], b.a); }
    if (!b.wh && cpos.distanceTo(b.m.position) < 14) { b.wh = 1; sfx.whistle(); }
    if (b.life <= 0 || b.p[1] < -30) killBall(id);
  }
  // 其他船員
  const now = performance.now();
  for (const [id, r] of remotes) {
    if (now - r.last > 9000) { r.mesh?.parent?.remove(r.mesh); remotes.delete(id); toast(`${r.n} 失去連線`); continue; }
    if (!r.mesh || !r.cur) continue;
    const prev = r.mesh.position.clone();
    for (let i = 0; i < 3; i++) r.cur[i] += (r.p[i] - r.cur[i]) * Math.min(1, dt * 10);
    r.mesh.position.fromArray(r.cur); r.mesh.rotation.y = r.y + Math.PI;
    r.mesh.visible = !r.d;
    r.mesh.userData.animate(prev.distanceTo(r.mesh.position) / Math.max(dt, 1e-3), dt);
  }
  // 大砲軌跡
  if (me.station && me.station.cannon !== undefined) {
    const { p, dir } = cannonMuzzle(W.ship, me.station.cannon, shipPoseCur); const [vx, vz] = shipVel(W.ship), v0 = muzzleV(W, W.ship);
    const v = [dir.x * v0 + vx, dir.y * v0, dir.z * v0 + vz], a = trajGeo.attributes.position, q = [p.x, p.y, p.z];
    let n = 0; for (; n < 60; n++) { a.setXYZ(n, q[0], q[1], q[2]); for (let k = 0; k < 4; k++) ballStep(q, v, 0.03); if (q[1] < waveHeight(q[0], q[2])) { n++; a.setXYZ(Math.min(59, n), q[0], q[1], q[2]); n++; break; } }
    for (let i = n; i < 60; i++) a.setXYZ(i, q[0], q[1], q[2]);
    a.needsUpdate = true; traj.computeLineDistances(); traj.visible = true;
  } else traj.visible = false;
}

// ---------- HUD ----------
let lastDayL = 1, hudT = 0, lastIsland = null, fireLevel = 0;
function updateHUD(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  const S = W.ship;
  $('gold').textContent = `${W.gold.toLocaleString()} 金`;
  $('spd').textContent = `${(Math.abs(S.speed) * 1.94).toFixed(1)} 節`;
  const dir = camera.getWorldDirection(new THREE.Vector3()); const camH = Math.atan2(dir.x, dir.z);
  // 風吹往 wind.a；箭頭顯示相對於視線的風向
  $('wind').style.transform = `rotate(${(-(W.wind.a - camH)) * 180 / Math.PI}deg)`; $('windS').textContent = W.wind.s > 0.85 ? '強' : W.wind.s > 0.7 ? '中' : '弱';
  $('sailV').textContent = S.sail < 0.05 ? '收起' : `放下 ${Math.round(S.sail * 100)}%`;
  $('anchorV').textContent = S.anchorDir < 0 ? '起錨中⋯⋯' : S.anchor > 0.5 ? '已下錨' : '已起錨';
  $('waterV').textContent = `${Math.round(S.water * 100)}%`; $('waterB').style.width = S.water * 100 + '%'; $('waterB').style.background = S.water > 0.6 ? '#e05a3a' : '#4fb3c9';
  $('holesV').textContent = S.holes.length ? `${S.holes.length} 個（快補！）` : '0';
  $('holesV').style.color = S.holes.length ? '#ff9a7a' : '';
  $('supV').textContent = `砲 ${S.sup.n}／鏈 ${S.sup.c}／火 ${S.sup.f}／爆 ${S.sup.x}／板 ${S.sup.p}`;
  $('sailHPV').textContent = `${Math.round(S.sailHP * 100)}%`; $('sailHPV').style.color = S.sailHP < 0.6 ? '#ff9a7a' : '';
  $('fireV').textContent = S.fires.length ? `🔥 ${S.fires.length} 處（快滅火！）` : '無'; $('fireV').style.color = S.fires.length ? '#ffb36a' : '';
  const ev = [];
  if (W.fleet) { const left = W.npcs.filter(e => W.fleet.ids.includes(e.id) && e.sink <= 0).length; ev.push(`⚔ 黑鯊艦隊來襲：剩 ${left} 艘`); }
  const allies = W.npcs.filter(e => e.team === 1 && e.sink <= 0).length; if (allies) ev.push(`🛡 海巡隊友軍 ${allies} 艘`);
  if (W.bounty) ev.push(`🎯 懸賞：${W.bounty.done}/${W.bounty.need}（${W.bounty.reward} 金）`);
  if (W.wanted >= 0.05) ev.push(`🚨 通緝：<b style="color:#ffcf4a">${'★'.repeat(Math.ceil(W.wanted))}${'☆'.repeat(5 - Math.ceil(W.wanted))}</b>`);
  { const cp0 = myPos(); let ci = 0, bd = 1e9; CASTLES.forEach((C, i) => { const d = Math.hypot(C.x - cp0.x, C.z - cp0.z); if (d < bd) { bd = d; ci = i; } }); const C = CASTLES[ci], F = W.forts[ci];
    if (F) { const g = W.guards.filter(x => x.f === ci).length; ev.push(F.open ? `🏴 ${C.name}：已攻陷` : `🏰 ${C.name}：砲塔 ${F.hp.filter(h => h > 0).length}/${F.hp.length}　守軍 ${g}`); } }
  $('events').innerHTML = ev.map(x => `<div>${x}</div>`).join('');
  $('cargoV').textContent = W.treasures.filter(t => t.st === 'ship').length;
  updateHotbar(me); $('invB').textContent = AMMO_KEYS.map(k => me.inv[k] ? `${AMMO[k]}${me.inv[k]}` : '').filter(Boolean).join(' ') || '無'; $('invP').textContent = me.inv.p;
  $('hpV').textContent = Math.max(0, Math.round(me.hp)); $('hpB').style.width = Math.max(0, me.hp / maxHP(W) * 100) + '%';
  // 羅盤
  const labels = []; for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360; labels.push(n === 0 ? '<b style="color:#f2c14e">北</b>' : n === 90 ? '<b>東</b>' : n === 180 ? '<b>南</b>' : n === 270 ? '<b>西</b>' : n % 45 === 0 ? '◆' : '·'); }
  // 世界 -z = 北、+x = 東
  const strip = $('cstrip'); if (!strip.dataset.k) { strip.innerHTML = labels.map(l => `<span>${l}</span>`).join(''); strip.dataset.k = 1; }
  const w = $('compass').clientWidth;
  const hdg = ((Math.atan2(dir.x, -dir.z) * 180 / Math.PI) + 360) % 360;   // 以北為 0、順時針
  strip.style.left = (w / 2 - ((hdg + 360) / 15) * 40 - 20) + 'px';
  // 船員列表
  const crew = [`<div>⚓ ${esc(me.name)}（你）</div>`, ...[...remotes.values()].map(r => `<div>⚓ ${esc(r.n || '船員')}</div>`)];
  $('crew').innerHTML = crew.join('');
  // 任務
  $('quests').innerHTML = W.quests.length ? '📜 藏寶圖：' + W.quests.map(id => { const t = W.treasures.find(x => x.id === id); return t ? esc(ISLANDS[t.isl].name) : ''; }).join('、') + '<br><span style="opacity:.75">按 5 拿出藏寶圖，Q 切換</span>' : '📜 沒有藏寶圖：回潮聲港找阿海領取';
  // 抵達島嶼
  const cp = myPos(); const ni = nearestIsland(cp.x, cp.z);
  const isl = ni.d < 40 ? ni.I : null; if (isl && isl !== lastIsland) toast(`— ${isl.name} —`); lastIsland = isl;
  if (!$('mapOv').classList.contains('hidden')) drawMap(W, me, cp, remotes);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 主迴圈 ----------
let last = performance.now(), stT = 0, ambT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started) {
    if (isHost) { for (let k = 0; k < (window.__tbSpeed || 1); k++) { step(W, dt, simPlayers()); flushEvents(); } stT -= dt; if (net && stT <= 0) { stT = 0.1; send('st', pack(W)); } }
    else { sea.t += dt; W.t = sea.t; sea.amp = W.amp; smoothShips(W, dt); }
    updatePlayer(dt);
  } else { sea.t += dt; W.t = sea.t; W.ship.anchor = 1; }
  syncEntities(dt);
  const r = world.update(W, dt, (x, z, d) => { FX.bolt(x, z); setTimeout(() => sfx.thunder(), Math.min(2500, d * 3)); }); lastDayL = r.dayL;
  FX.update(dt, [Math.sin(W.wind.a) * W.wind.s * 3, Math.cos(W.wind.a) * W.wind.s * 3], r.fogC, r.fogD);
  if (started) updateHUD(dt);
  else { // 標題畫面：繞著船轉
    const a = now / 9000; camRig.position.set(Math.sin(a) * 26, 9 + Math.sin(a * 0.7) * 2, Math.cos(a) * 26 - 2); camRig.rotation.set(0, a, 0); camera.rotation.set(-0.25, 0, 0);
  }
  ambT -= dt; if (ambT <= 0) { ambT = 0.25; const cp = myPos(); ambient(W.amp / 2, W.storm.on, Math.abs(W.ship.speed), cp.y < waveHeight(cp.x, cp.z), fireLevel); if (W.ship.speed > 2 && Math.random() < 0.08 && me.onShip) sfx.creak(); }
  if (!window.__noRender) renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- 開始遊戲 ----------
function beginPlay() {
  started = true; $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  me.onShip = true; me.lp.set(0, DECK, -6.5); me.yaw = Math.PI; me.pitch = 0; reparentCam();
  camRig.rotation.set(0, 0, 0);
  if (!localStorage.getItem('tb_help')) { $('helpOv').classList.remove('hidden'); try { localStorage.setItem('tb_help', 1); } catch (e) {} }
  else $('pause').classList.remove('hidden');
  toast('⚓ 船停在潮聲港。到船頭絞盤起錨、放帆、掌舵出航吧！');
  setTimeout(() => toast('📜 你們有 2 張藏寶圖。按 5 拿出來看，M 打開航海圖'), 4000);
  if (net) $('netst').textContent = (isHost ? '房主' : '船員') + '｜房號 ' + room;
}
// ---------- 帳號、存檔 ----------
const acc = new Accounts(); setKeyOf(keyOf);
function applySave(sv) {
  if (!sv) return;
  W.gold = sv.gold | 0; for (const k in W.up) if (sv.up && sv.up[k] != null) W.up[k] = sv.up[k];
  W.ship.nc = 4 + 2 * W.up.guns; if (sv.sup) Object.assign(W.ship.sup, sv.sup); W.wanted = sv.wanted || 0; W.sunk = sv.sunk || 0;
  toast(`📦 讀取存檔：${W.gold} 金、強化等級已恢復`);
}
function doSave() { if (isHost && acc.me && started) acc.save({ gold: W.gold, up: W.up, sup: W.ship.sup, wanted: W.wanted, sunk: W.sunk }); }
setInterval(doSave, 45000);
function joinRoom(code) {
  if (started) { location.href = location.pathname + '?room=' + encodeURIComponent(code) + (location.search.includes('broker=') ? '&broker=' + new URLSearchParams(location.search).get('broker') : ''); return; }
  $('tnote').textContent = '正在加入房間 ' + code + '⋯⋯';
  ui_h.onJoin(acc.me ? acc.me.name : '船員' + Math.floor(Math.random() * 90 + 10), acc.me ? acc.me.color : COLORS[0], code).catch(e => $('tnote').textContent = e.message);
}
const ui_h = {
  acc, colors: COLORS, room: () => room, joinRoom,
  afterLogin() { me.name = acc.me.name; me.color = acc.me.color; if (ui_h.pendingRoom) { const r = ui_h.pendingRoom; ui_h.pendingRoom = null; joinRoom(r); } },
  async onSolo(name, color, saved) {
    me.name = name; me.color = color; isHost = true; W = newWorld();
    if (saved && acc.me) applySave(await acc.loadSave());
    if (acc.me) acc.presence('solo');
    initAudio(); beginPlay();
  },
  async onHost(name, color) {
    me.name = name; me.color = color; isHost = true; W = newWorld(); room = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join('');
    if (acc.me) applySave(await acc.loadSave());
    net = location.hash === '#local' ? new LocalNet(room, myId) : new MqttNet(room, myId); net.on('msg', onNet); net.on('status', s => $('netst').textContent = s === 'ok' ? `房主｜房號 ${room}` : '連線中斷，重新連線中⋯⋯');
    await net.connect(); if (acc.me) acc.presence(room, true); return room;
  },
  startHosted() { initAudio(); beginPlay(); },
  async onJoin(name, color, code) {
    me.name = name; me.color = color; isHost = false; room = code;
    net = location.hash === '#local' ? new LocalNet(room, myId) : new MqttNet(room, myId); net.on('msg', onNet); net.on('status', s => $('netst').textContent = s === 'ok' ? `船員｜房號 ${room}` : '連線中斷，重新連線中⋯⋯');
    await net.connect(); initAudio();
    const hi = () => send('p', { id: myId, n: me.name, c: me.color, s: 1, p: [0, DECK, -6], y: 0, it: 0, ca: null, d: 0 });
    hi();
    return new Promise((res, rej) => { const t0 = performance.now(); const iv = setInterval(() => { if (started) { clearInterval(iv); if (acc.me) acc.presence(room, false); res(); } else if (performance.now() - t0 > 12000) { clearInterval(iv); net.close(); net = null; room = null; rej(new Error('找不到這個房間（房主要先開房並出航）')); } else hi(); }, 800); });
  },
};
initUI(ui_h);
addEventListener('beforeunload', () => { doSave(); if (net) send('bye', { id: myId, host: isHost ? 1 : 0 }); if (acc.me) acc.presence(null); });
window.__tb = { acc, doSave, npcMeshes, FX, myShip, camera, W: () => W, me, setW: w => W = w, scene, world, act: m => doAct(m), handleEvent };   // 除錯用
