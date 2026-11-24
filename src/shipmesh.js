// ===== 船的 3D 模型（全程式生成）=====
import * as THREE from 'three';
import { DECK, HOLD, KEEL, BOW, STERN, hullW, deckW, holdW, HATCH, HOLD_Z, MAST, WHEEL, CANNONS, CRATES, LADDERS, STATIONS } from './shipdef.js';

function canvasTex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t;
}
const texCache = {};
export function woodTex(base = '#8a5a34', key = 'w') {
  if (texCache[key]) return texCache[key];
  return texCache[key] = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const y = i * 32; g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`; g.fillRect(0, y, w, 32);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, y, w, 2);
      for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '255,230,200' : '40,20,5'},${Math.random() * 0.12})`; g.beginPath(); const yy = y + 3 + Math.random() * 27; g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + Math.random() * 4 - 2, w * .6, yy + Math.random() * 4 - 2, w, yy); g.stroke(); }
      const sx = (i * 97) % w; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(sx, y, 2, 32);
      g.fillStyle = 'rgba(30,20,10,.6)'; g.beginPath(); g.arc(sx + 6, y + 8, 1.4, 0, 7); g.arc(sx + 6, y + 24, 1.4, 0, 7); g.fill();
    }
  }, [2, 2]);
}
function sailTex(enemy) {
  return canvasTex(512, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (enemy) { grd.addColorStop(0, '#3b3a3a'); grd.addColorStop(1, '#232222'); } else { grd.addColorStop(0, '#f3ead2'); grd.addColorStop(1, '#ddd0ad'); }
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = enemy ? 'rgba(0,0,0,.35)' : 'rgba(120,90,50,.25)'; g.lineWidth = 3;
    for (let x = 64; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    if (enemy) {   // 黑鯊海盜團：鯊魚背鰭＋兩道刀痕
      g.fillStyle = '#8c1d1d'; g.beginPath(); g.moveTo(150, 340); g.quadraticCurveTo(250, 120, 330, 110); g.quadraticCurveTo(300, 220, 360, 340); g.closePath(); g.fill();
      g.strokeStyle = '#8c1d1d'; g.lineWidth = 14; g.beginPath(); g.moveTo(130, 380); g.lineTo(380, 380); g.stroke();
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(80,70,60,.6)'; g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 40, 30 + Math.random() * 30); }
    } else {      // 怒海同舟：浪花圓徽＋北極星
      g.fillStyle = '#16707a'; g.beginPath(); g.arc(256, 250, 120, 0, 7); g.fill();
      g.fillStyle = '#f3ead2'; g.beginPath(); g.arc(256, 250, 100, 0, 7); g.fill();
      g.fillStyle = '#16707a';
      g.beginPath(); g.moveTo(166, 290); for (let x = 166; x <= 346; x += 6) g.lineTo(x, 280 + Math.sin((x - 166) / 18) * 14); g.lineTo(346, 330); g.lineTo(166, 330); g.closePath(); g.fill();
      g.fillStyle = '#c4422b'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 18 : 54; g.lineTo(256 + Math.cos(a) * r, 222 + Math.sin(a) * r); }
      g.closePath(); g.fill();
      g.fillStyle = '#c4422b'; g.fillRect(0, h - 26, w, 14);
    }
  });
}

/** 船殼：沿 z 的截面做成管狀 */
function hullGeo() {
  const zs = []; for (let z = STERN; z <= BOW + 0.001; z += 0.5) zs.push(z);
  const N = 14, pos = [], uv = [], idx = [];
  zs.forEach((z, i) => {
    const w = hullW(z), keel = KEEL + Math.max(0, (z - 6) / 6) * 1.8 + Math.max(0, (-9 - z)) * 0.6;
    const top = DECK + 0.95 + Math.max(0, (z - 8) / 4) * 0.5 + Math.max(0, (-8 - z) / 3) * 0.8;
    for (let j = 0; j <= N; j++) {
      const t = j / N, a = t * Math.PI;                 // 0=左舷頂 → π=右舷頂
      const sx = -Math.cos(a), sy = Math.sin(a);
      const yb = top - (top - keel) * Math.pow(sy, 0.65);
      const xw = w * Math.pow(Math.abs(sx), 0.4) * Math.sign(sx) * (0.55 + 0.45 * (1 - sy * 0.6));
      pos.push(j === 0 || j === N ? sx * w : xw, j === 0 || j === N ? top : yb, z);
      uv.push(z * 0.12, t * 2.2);
    }
  });
  for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j, b = a + N + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // 船尾封板
  const s0 = pos.length / 3; const w0 = hullW(STERN);
  pos.push(0, DECK, STERN); uv.push(0, 0);
  for (let j = 0; j <= N; j++) { pos.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]); uv.push(j / N, 1); }
  for (let j = 0; j < N; j++) idx.push(s0, s0 + 1 + j + 1, s0 + 1 + j);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function floorShape(wf, z0, z1, y, hole) {
  const s = new THREE.Shape(); const zsA = []; for (let z = z0; z <= z1 + 1e-3; z += 0.5) zsA.push(z);
  zsA.forEach((z, i) => i ? s.lineTo(wf(z), z) : s.moveTo(wf(z), z));
  [...zsA].reverse().forEach(z => s.lineTo(-wf(z), z));
  if (hole) { const h = new THREE.Path(); h.moveTo(hole.x0, hole.z0); h.lineTo(hole.x0, hole.z1); h.lineTo(hole.x1, hole.z1); h.lineTo(hole.x1, hole.z0); s.holes.push(h); }
  const g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = []; for (let i = 0; i < p.count; i++) uv.push(p.getX(i) * 0.35, p.getZ(i) * 0.35);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}

export function buildShip(enemy = false) {
  const root = new THREE.Group();       // 位置／航向／搖晃
  const wood = new THREE.MeshStandardMaterial({ map: woodTex(enemy ? '#3a2a22' : '#8a5530', enemy ? 'we' : 'w'), roughness: 0.85, side: THREE.DoubleSide });
  const deckMat = new THREE.MeshStandardMaterial({ map: woodTex(enemy ? '#4b3a2c' : '#b58352', enemy ? 'de' : 'd'), roughness: 0.9, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: enemy ? 0x1a1412 : 0x3b2416, roughness: 0.8 });
  const stripe = new THREE.MeshStandardMaterial({ color: enemy ? 0x7a1717 : 0x16707a, roughness: 0.6 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, metalness: 0.7, roughness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.8, roughness: 0.3 });

  const hull = new THREE.Mesh(hullGeo(), wood); hull.castShadow = true; hull.receiveShadow = true; root.add(hull);
  // 船側飾帶
  const zsS = []; for (let z = STERN; z <= BOW - 1; z += 0.5) zsS.push(new THREE.Vector3(hullW(z) + 0.02, DECK + 0.25, z));
  for (const sd of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3(zsS.map(v => new THREE.Vector3(v.x * sd, v.y, v.z)));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.12, 5), stripe));
  }
  const deck = new THREE.Mesh(floorShape(deckW, -10.7, 10.9, DECK, HATCH), deckMat); deck.receiveShadow = true; root.add(deck);
  const hold = new THREE.Mesh(floorShape(holdW, HOLD_Z[0], HOLD_Z[1], HOLD), deckMat); hold.receiveShadow = true; root.add(hold);
  // 船艙天花板（甲板下方）
  const ceil = new THREE.Mesh(floorShape(deckW, -10.7, 10.9, DECK - 0.08, HATCH), dark); root.add(ceil);
  // 樓梯
  const stairs = new THREE.Group(); const nStep = 9;
  for (let i = 0; i < nStep; i++) {
    const t = (i + 0.5) / nStep, z = HATCH.z0 + t * (HATCH.z1 - HATCH.z0), y = HOLD + t * (DECK - HOLD);
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.36), deckMat); st.position.set(0, y - 0.04, z); stairs.add(st);
  }
  for (const sx of [-0.88, 0.88]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 4.3), dark); rail.position.set(sx, (HOLD + DECK) / 2 + 0.4, (HATCH.z0 + HATCH.z1) / 2); rail.rotation.x = -Math.atan2(DECK - HOLD, HATCH.z1 - HATCH.z0); stairs.add(rail); }
  root.add(stairs);
  // 欄杆
  const postG = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6), railPts = [[], []];
  for (let z = -10.4; z <= 10.6; z += 1.05) {
    for (const sd of [1, -1]) {
      const x = sd * (deckW(z) + 0.1); const p = new THREE.Mesh(postG, dark); p.position.set(x, DECK + 0.45, z); root.add(p);
      railPts[sd > 0 ? 0 : 1].push(new THREE.Vector3(x, DECK + 0.92, z));
    }
  }
  for (const pts of railPts) root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 5), dark));
  const sternRail = new THREE.Mesh(new THREE.BoxGeometry(deckW(-10.4) * 2 + 0.2, 0.12, 0.12), dark); sternRail.position.set(0, DECK + 0.92, -10.5); root.add(sternRail);
  // 桅杆、橫桁、帆
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, MAST.h, 10), wood); mast.position.set(MAST.x, DECK + MAST.h / 2, MAST.z); mast.castShadow = true; root.add(mast);
  const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.75, 0.6, 12, 1, true), wood); nest.position.set(MAST.x, DECK + MAST.h - 2, MAST.z); root.add(nest);
  const sailPivot = new THREE.Group(); sailPivot.position.set(MAST.x, 0, MAST.z - 0.35); root.add(sailPivot);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 10.4, 8), wood); yard.rotation.z = Math.PI / 2; yard.position.y = DECK + 13.2; sailPivot.add(yard);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9.6, 8), wood); boom.rotation.z = Math.PI / 2; boom.position.y = DECK + 4.6; sailPivot.add(boom);
  const sailG = new THREE.PlaneGeometry(9.6, 8.4, 12, 10);
  const sail = new THREE.Mesh(sailG, new THREE.MeshStandardMaterial({ map: sailTex(enemy), side: THREE.DoubleSide, roughness: 0.95, emissive: enemy ? 0x0a0a0a : 0x3a342a })); sail.castShadow = true; sail.frustumCulled = false; sailPivot.add(sail);
  const sailBase = Float32Array.from(sailG.attributes.position.array);
  // 船首斜桅
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 6, 8), wood); bowsprit.rotation.x = Math.PI / 2 - 0.25; bowsprit.position.set(0, DECK + 1.8, BOW + 1.2); root.add(bowsprit);
  // 舵輪
  const wheel = new THREE.Group(); wheel.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), dark));
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), wood); sp.rotation.z = i * Math.PI / 8 * 2 / 2; wheel.add(sp); sp.rotation.z = i * Math.PI / 4; }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10).rotateX(Math.PI / 2), brass));
  const wheelPost = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), dark); wheelPost.position.set(0, DECK + 0.6, WHEEL.z - 0.15); root.add(wheelPost);
  root.add(wheel);
  // 絞盤（錨）
  const cap = new THREE.Group(); cap.position.set(STATIONS.anchor.x, DECK, STATIONS.anchor.z + 0.9);
  cap.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 10).translate(0, 0.45, 0), wood));
  for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), dark); bar.position.y = 0.8; bar.rotation.y = i * Math.PI / 4; cap.add(bar); }
  root.add(cap);
  const anchor = new THREE.Group(); anchor.position.set(hullW(9) + 0.25, DECK - 0.4, 9);
  anchor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), iron));
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 5, 12, Math.PI), iron); arm.rotation.z = Math.PI; arm.position.y = -0.5; anchor.add(arm);
  root.add(anchor);
  // 大砲
  const cannons = CANNONS.map(c => {
    const g = new THREE.Group(); g.position.set(c.x, DECK, c.z); g.rotation.y = c.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 1.1), wood); cart.position.y = 0.3; g.add(cart);
    for (const wx of [-0.42, 0.42]) for (const wz of [-0.35, 0.35]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), dark); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.18, wz); g.add(wh); }
    const yaw = new THREE.Group(); yaw.position.y = 0.62; g.add(yaw);
    const pitch = new THREE.Group(); yaw.add(pitch);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 1.7, 12).rotateX(Math.PI / 2).translate(0, 0, 0.45), iron); barrel.castShadow = true; pitch.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), brass); ring.position.z = 1.28; pitch.add(ring);
    root.add(g); return { g, yaw, pitch };
  });
  // 船艙補給箱
  const crates = {};
  for (const k in CRATES) {
    const c = CRATES[k]; const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), deckMat); box.position.set(c.x, c.y + 0.4, c.z); root.add(box);
    if (k === 'balls') for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), iron); b.position.set(c.x - 0.3 + (i % 3) * 0.3, c.y + 0.88, c.z - 0.15 + Math.floor(i / 3) * 0.3); root.add(b); }
    else for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.22), wood); p.position.set(c.x, c.y + 0.84 + i * 0.07, c.z - 0.25 + i * 0.25); root.add(p); }
    crates[k] = box;
  }
  // 梯子
  for (const L of LADDERS) {
    const lg = new THREE.Group(); lg.position.set(L.x, 0, L.z);
    for (const dz of [-0.35, 0.35]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.8, 0.07), dark); r.position.set(0, DECK - 1.1, dz); lg.add(r); }
    for (let y = -2.6; y < DECK + 0.6; y += 0.45) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.7), dark); s.position.set(0, y + 0.2, 0); lg.add(s); }
    root.add(lg);
  }
  // 船尾燈籠
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xffa53a, emissiveIntensity: 1.5 }));
  lantern.position.set(0, DECK + 1.9, -10.6); root.add(lantern);
  const light = new THREE.PointLight(0xffb45a, 0, 26, 1.6); light.position.copy(lantern.position); root.add(light);
  const holdLight = new THREE.PointLight(0xffb45a, 4, 16, 1.4); holdLight.position.set(0, DECK - 0.6, -2); root.add(holdLight);
  // 船艙積水
  const waterG = floorShape(z => holdW(z) + 0.02, HOLD_Z[0], HOLD_Z[1], 0);
  const water = new THREE.Mesh(waterG, new THREE.MeshStandardMaterial({ color: 0x1b5b6b, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide }));
  water.visible = false; root.add(water);
  // 破洞層
  const holes = new THREE.Group(); root.add(holes);

  const api = {
    root, sail, cannons, wheel, cap, anchor, light, holdLight, water, holes, crates, cargo: new THREE.Group(), holeMeshes: new Map(),
    _sailBase: sailBase, _sailPivot: sailPivot,
    /** 依狀態更新外觀 */
    update(s, wind, dt, t) {
      // 帆：放下程度 s.sail(0~1)、角度 s.sailAng(-1~1)、受風 power
      sailPivot.rotation.y = s.sailAng * 0.9;
      const pw = s._power ?? 0.5, down = Math.max(0.07, s.sail), p = sailG.attributes.position, b = sailBase;
      const top = DECK + 13.2, H = 8.4 * down;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], v = (4.2 - b[i * 3 + 1]) / 8.4;            // 0 頂 → 1 底
        const u = (x + 4.8) / 9.6;
        const bul = (0.2 + pw * 1.5) * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) * down;
        const flap = Math.sin(t * 6 + u * 9 + v * 4) * 0.08 * (1.2 - pw);
        p.setXYZ(i, x * (1 - 0.06 * Math.sin(Math.PI * v)), top - v * H, -(bul + flap) * (s._windSide ?? 1));
      }
      p.needsUpdate = true; sailG.computeVertexNormals();
      wheel.rotation.z = -s.rudder * 3.4;
      cap.rotation.y += (s.anchorMoving || 0) * dt * 2;
      anchor.position.y = DECK - 0.4 - s.anchor * 6;
      cannons.forEach((c, i) => { const cs = s.cannons[i]; if (!cs) return; c.yaw.rotation.y = cs.yaw; c.pitch.rotation.x = -cs.pitch; });
      // 積水
      water.visible = s.water > 0.01; water.position.y = HOLD + 0.02 + s.water * 2.0;
      // 破洞
      const seen = new Set();
      for (const h of s.holes) {
        seen.add(h.id);
        if (!api.holeMeshes.has(h.id)) {
          const g = new THREE.Group(); g.position.set(h.x, h.y, h.z); g.rotation.y = h.x > 0 ? -Math.PI / 2 : Math.PI / 2;
          const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 9), new THREE.MeshBasicMaterial({ color: 0x050505 })); disc.position.z = 0.03; g.add(disc);
          for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4 + Math.random() * 0.3, 0.05), wood); const a = i / 7 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.05); sp.rotation.z = a + Math.PI / 2 + (Math.random() - .5); g.add(sp); }
          const jet = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 8, 1, true).rotateX(-Math.PI / 2).translate(0, -0.1, 0.75), new THREE.MeshBasicMaterial({ color: 0xbfe8f0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
          g.add(jet); g.userData.jet = jet;
          holes.add(g); api.holeMeshes.set(h.id, g);
        }
        const jet = api.holeMeshes.get(h.id).userData.jet; jet.scale.set(1, 1, 0.8 + Math.sin(t * 20 + h.id) * 0.2);
      }
      for (const [id, g] of api.holeMeshes) if (!seen.has(id)) { holes.remove(g); api.holeMeshes.delete(id); }
    },
  };
  root.add(api.cargo);
  return api;
}

/** 寶箱模型 */
const chestCols = { 1: ['#7a4a26', '#9aa0a8'], 2: ['#5d6670', '#d8dde3'], 3: ['#7a2a1d', '#f2c14e'] };
export function buildChest(tier = 1) {
  const [w, m] = chestCols[tier] || chestCols[1];
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: w, roughness: 0.8, map: woodTex('#888', 'chest') });
  const metal = new THREE.MeshStandardMaterial({ color: m, metalness: 0.8, roughness: 0.3, emissive: tier === 3 ? 0x332200 : 0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), wood); body.position.y = 0.25; g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood); lid.position.y = 0.5; g.add(lid);
  for (const x of [-0.32, 0.32]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.62), metal); band.position.set(x, 0.26, 0); g.add(band); const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), metal); bt.position.set(x, 0.5, 0); g.add(bt); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), metal); lock.position.set(0, 0.45, 0.31); g.add(lock);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 玩家／NPC 小人 */
export function buildPerson(color = 0xc4422b, hat = 0x2a1d14) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b089, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2d3444, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: hat, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.7, 10), cloth); torso.position.y = 1.15; g.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.1, 10), dark); belt.position.y = 0.84; g.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin); head.position.y = 1.68; g.add(head);
  const hatB = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), dark); hatB.position.y = 1.83; g.add(hatB);
  const hatT = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.2, 12), dark); hatT.position.y = 1.94; g.add(hatT);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 0.8, 0); const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.8, 8), pants); lm.position.y = -0.4; leg.add(lm);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), dark); boot.position.set(0, -0.78, 0.05); leg.add(boot); g.add(leg); legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * 0.34, 1.45, 0); const am = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.62, 8), cloth); am.position.y = -0.3; arm.add(am);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), skin); hand.position.y = -0.64; arm.add(hand); g.add(arm); arms.push(arm);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { legs, arms, phase: 0 };
  g.userData.animate = (speed, dt, swing = 0) => {
    const u = g.userData; u.phase += dt * speed * 3.2; const a = Math.sin(u.phase) * Math.min(1, speed / 3) * 0.7;
    legs[0].rotation.x = a; legs[1].rotation.x = -a; arms[0].rotation.x = -a * 0.8; arms[1].rotation.x = a * 0.8 - swing;
  };
  return g;
}
