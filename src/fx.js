// ===== 特效：粒子（火、煙、水花、火花）、木屑、衝擊波環、閃光、閃電 =====
import * as THREE from 'three';
import { waveHeight } from './waves.js';

const VS = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aSeed;
uniform float uScale; varying float vA; varying vec3 vC; varying float vS; varying float vD;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 900.0); vA = aAlpha; vC = aColor; vS = aSeed; vD = -mv.z; }`;
const FS = (add) => /* glsl */`
uniform vec3 uFog; uniform float uFogD; varying float vA; varying vec3 vC; varying float vS; varying float vD;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = smoothstep(1.0, ${add ? '0.0' : '0.35'}, r);
  ${add ? 'a = a * a;' : 'float n = sin(atan(c.y, c.x) * 5.0 + vS * 6.0) * 0.08 + sin(c.x * 11.0 + vS * 3.0) * 0.06; a *= smoothstep(1.0, 0.55, r + n);'}
  float fog = 1.0 - exp(-uFogD*uFogD*vD*vD);
  vec3 col = ${add ? 'vC * (1.0 - fog)' : 'mix(vC, uFog, fog)'};
  gl_FragColor = vec4(col, a * vA ${add ? '* (1.0 - fog)' : ''});
  #include <colorspace_fragment>
}`;

class Layer {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.seed = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.u = { uScale: { value: 400 }, uFog: { value: new THREE.Color() }, uFogD: { value: 0.001 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS(additive), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 4 : 3; scene.add(this.pts);
    this.g = g;
    // 粒子狀態
    this.P = []; // {x,y,z,vx,vy,vz,life,max,s0,s1,a0,r,g,b,r1,g1,b1,drag,grav,wind}
  }
  add(o) { if (this.P.length >= this.max) this.P.shift(); this.P.push(o); }
  update(dt, wind) {
    const P = this.P;
    for (const p of P) {
      p.life -= dt; const d = Math.exp(-p.drag * dt);
      p.vx = p.vx * d + wind[0] * p.wind * dt; p.vz = p.vz * d + wind[1] * p.wind * dt; p.vy = p.vy * d - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = 0; }
    }
    this.P = P.filter(p => p.life > 0);
    const n = this.n = this.P.length;
    for (let i = 0; i < n; i++) {
      const p = this.P[i], t = 1 - p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r + (p.r1 - p.r) * t; this.col[i * 3 + 1] = p.g + (p.g1 - p.g) * t; this.col[i * 3 + 2] = p.b + (p.b1 - p.b) * t;
      this.size[i] = p.s0 + (p.s1 - p.s0) * Math.pow(t, p.sp || 0.5);
      const fin = p.fin || 0.08;
      this.alpha[i] = p.a0 * Math.min(1, t / fin) * (1 - Math.pow(t, p.fo || 1.6));
      this.seed[i] = p.seed;
    }
    this.g.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aSeed']) this.g.attributes[k].needsUpdate = true;
  }
}

export function createFX(scene, camera, renderer) {
  const add = new Layer(scene, 4000, true), alpha = new Layer(scene, 5000, false);
  const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const R = Math.random, rs = (a) => (R() - 0.5) * 2 * a;
  function P(layer, x, y, z, o) {
    const c0 = o.c0 || [1, 1, 1], c1 = o.c1 || c0;
    layer.add({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life, max: o.life, s0: o.s0, s1: o.s1 ?? o.s0, a0: o.a ?? 1, r: c0[0], g: c0[1], b: c0[2], r1: c1[0], g1: c1[1], b1: c1[2], drag: o.drag ?? 0.5, grav: o.grav ?? 0, wind: o.wind ?? 0, seed: R() * 10, fin: o.fin, fo: o.fo, sp: o.sp, floor: o.floor });
  }
  const FIRE = C(0xffb347), FIRE2 = C(0xff4a12), WHITE = [1, 1, 1], SMOKE = C(0x8a8a88), SMOKE_D = C(0x2c2a28), SMOKE_L = C(0xd8d6d0), SPLASH = C(0xeaf6fa), SAND = C(0xc9b07a);

  // 木屑碎片（實體方塊）
  const DEB = 500, debGeo = new THREE.BoxGeometry(0.12, 0.08, 0.6), debMat = new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.9 });
  const debris = new THREE.InstancedMesh(debGeo, debMat, DEB); debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debris.frustumCulled = false; debris.castShadow = true; scene.add(debris);
  const D = []; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
  function deb(x, y, z, vx, vy, vz, s = 1) { if (D.length >= DEB) D.shift(); D.push({ x, y, z, vx, vy, vz, rx: R() * 6, ry: R() * 6, rz: R() * 6, wx: rs(9), wy: rs(9), wz: rs(9), s: s * (0.5 + R()), life: 14 + R() * 8, float: 0 }); }
  // 衝擊波環
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  function ring(x, z, r, life = 1.4, col = 0xffffff) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false })); m.position.set(x, waveHeight(x, z) + 0.15, z); m.renderOrder = 2; scene.add(m); rings.push({ m, r, life, max: life }); }
  // 閃光燈
  const lights = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffaa55, 0, 90, 1.6); scene.add(l); lights.push({ l, t: 0, max: 1, I: 0 }); }
  function flash(x, y, z, I = 2500, dur = 0.18, col = 0xffaa55) { const L = lights.reduce((a, b) => a.t < b.t ? a : b); L.l.position.set(x, y, z); L.l.color.set(col); L.I = I; L.t = dur; L.max = dur; }
  // 閃電
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 1, fog: false })); bolt.visible = false; bolt.frustumCulled = false; scene.add(bolt); let boltT = 0;

  const api = {
    /** 砲口：火舌、火花、大團白色硝煙（隨風飄） */
    muzzle(p, dir, big = 1) {
      const [x, y, z] = [p.x, p.y, p.z];
      for (let i = 0; i < 26 * big; i++) { const sp = 8 + R() * 26; P(add, x, y, z, { vx: dir.x * sp + rs(3), vy: dir.y * sp + rs(3), vz: dir.z * sp + rs(3), life: 0.12 + R() * 0.16, s0: 1.4 * big, s1: 2.6 * big, c0: WHITE, c1: FIRE2, drag: 6 }); }
      for (let i = 0; i < 14; i++) { const sp = 15 + R() * 30; P(add, x, y, z, { vx: dir.x * sp + rs(6), vy: dir.y * sp + rs(5) + 3, vz: dir.z * sp + rs(6), life: 0.4 + R() * 0.5, s0: 0.18, s1: 0.05, c0: FIRE, c1: FIRE2, drag: 1.5, grav: 9 }); }
      for (let i = 0; i < 22 * big; i++) { const sp = 2 + R() * 10; P(alpha, x + dir.x * R() * 3, y + dir.y * R() * 3, z + dir.z * R() * 3, { vx: dir.x * sp + rs(1.5), vy: dir.y * sp + 0.6 + R(), vz: dir.z * sp + rs(1.5), life: 5 + R() * 4, s0: 1.6 * big, s1: 7 * big, c0: SMOKE_L, c1: SMOKE, a: 0.55, drag: 1.3, wind: 0.5, fin: 0.03, fo: 1.3 }); }
      flash(x, y, z, 1800 * big, 0.12);
    },
    /** 砲彈命中船殼：火球、木屑、黑煙 */
    explosion(x, y, z, kind = 'n', big = 1) {
      const bb = kind === 'x' ? 2.2 : 1;
      const k = big * bb;
      for (let i = 0; i < 40 * k; i++) { const a = R() * Math.PI * 2, u = R() * 2 - 1, sp = (3 + R() * 9) * Math.sqrt(k), s = Math.sqrt(1 - u * u); P(add, x, y, z, { vx: Math.cos(a) * s * sp, vy: u * sp + 2, vz: Math.sin(a) * s * sp, life: 0.35 + R() * 0.45, s0: 1.2 * k, s1: 3.2 * k, c0: WHITE, c1: FIRE2, drag: 3.2, fin: 0.02 }); }
      for (let i = 0; i < 30 * k; i++) { const sp = 10 + R() * 25; P(add, x, y, z, { vx: rs(1) * sp, vy: R() * sp, vz: rs(1) * sp, life: 0.6 + R() * 0.8, s0: 0.16, s1: 0.04, c0: FIRE, c1: FIRE2, drag: 0.8, grav: 12 }); }
      for (let i = 0; i < 26 * k; i++) P(alpha, x + rs(1), y + rs(1), z + rs(1), { vx: rs(3), vy: 1.5 + R() * 4, vz: rs(3), life: 4 + R() * 5, s0: 2 * k, s1: 9 * k, c0: SMOKE_D, c1: SMOKE, a: 0.75, drag: 1.0, wind: 0.6, fin: 0.04, fo: 1.2 });
      for (let i = 0; i < 22 * k; i++) deb(x, y, z, rs(9) * Math.sqrt(k), 4 + R() * 12 * Math.sqrt(k), rs(9) * Math.sqrt(k), k > 1.5 ? 1.4 : 1);
      flash(x, y, z, 4000 * k, 0.22);
    },
    /** 砲彈落水：高水柱＋水霧＋白色波環 */
    splash(x, z, kind = 'n') {
      const y = waveHeight(x, z), k = kind === 'x' ? 2 : 1;
      for (let i = 0; i < 46 * k; i++) { const sp = 6 + R() * 18 * Math.sqrt(k), sp2 = R() * 3.5; const a = R() * 6.28; P(alpha, x + rs(0.6), y, z + rs(0.6), { vx: Math.cos(a) * sp2, vy: sp, vz: Math.sin(a) * sp2, life: 1.2 + R() * 1.1, s0: 0.9, s1: 2.2 * k, c0: SPLASH, a: 0.85, drag: 0.4, grav: 13, fin: 0.02 }); }
      for (let i = 0; i < 16 * k; i++) P(alpha, x + rs(2), y + 1, z + rs(2), { vx: rs(2), vy: 1 + R() * 2, vz: rs(2), life: 2.5 + R() * 2, s0: 2.5, s1: 7 * k, c0: SPLASH, a: 0.35, drag: 1.2, wind: 0.5 });
      ring(x, z, 9 * k, 1.6);
      if (kind === 'x') { api.explosion(x, y + 0.5, z, 'n', 0.8); }
    },
    /** 打水漂 */
    skip(x, z) { const y = waveHeight(x, z); for (let i = 0; i < 20; i++) P(alpha, x, y, z, { vx: rs(3), vy: 4 + R() * 7, vz: rs(3), life: 0.8 + R() * 0.5, s0: 0.6, s1: 1.4, c0: SPLASH, a: 0.8, grav: 13 }); ring(x, z, 4, 1); },
    /** 打到地面／岩石 */
    dirt(x, y, z, k = 1) {
      for (let i = 0; i < 34 * k; i++) P(alpha, x, y, z, { vx: rs(6), vy: 3 + R() * 9, vz: rs(6), life: 1.2 + R(), s0: 0.6, s1: 2.6 * k, c0: SAND, c1: SMOKE, a: 0.85, grav: 10, drag: 0.8 });
      for (let i = 0; i < 14 * k; i++) P(add, x, y, z, { vx: rs(8), vy: R() * 9, vz: rs(8), life: 0.3 + R() * 0.3, s0: 1.4 * k, s1: 2.8 * k, c0: WHITE, c1: FIRE2, drag: 4 });
      flash(x, y, z, 2500 * k, 0.15);
    },
    /** 帆被打穿：碎布與木屑 */
    tear(x, y, z) { for (let i = 0; i < 18; i++) P(alpha, x, y, z, { vx: rs(5), vy: rs(4), vz: rs(5), life: 1.5 + R(), s0: 0.35, s1: 0.2, c0: C(0xe8dcc0), a: 0.9, grav: 3, drag: 1.5 }); for (let i = 0; i < 4; i++) deb(x, y, z, rs(5), rs(3), rs(5), 0.5); },
    /** 持續燃燒（每幀呼叫） */
    burn(x, y, z, i, dt) {
      const n = Math.random() < dt * 60 ? Math.ceil(i * 3) : 0;
      for (let k = 0; k < n; k++) P(add, x + rs(0.7 * i + 0.2), y + R() * 0.3, z + rs(0.7 * i + 0.2), { vx: rs(0.4), vy: 2 + R() * 2.5 * i, vz: rs(0.4), life: 0.5 + R() * 0.6, s0: 1.3 * (0.5 + i), s1: 0.3, c0: C(0xfff0a0), c1: FIRE2, drag: 0.6, sp: 1, fin: 0.1, fo: 1 });
      if (R() < dt * 14 * i) P(alpha, x + rs(0.5), y + 1.5, z + rs(0.5), { vx: rs(0.6), vy: 2.5 + R() * 2, vz: rs(0.6), life: 4 + R() * 4, s0: 1.5, s1: 8 * (0.5 + i), c0: SMOKE_D, c1: C(0x555350), a: 0.6, drag: 0.4, wind: 0.8, fin: 0.05 });
      if (R() < dt * 2 * i) P(add, x, y + 0.5, z, { vx: rs(1.5), vy: 4 + R() * 4, vz: rs(1.5), life: 1 + R(), s0: 0.12, s1: 0.04, c0: FIRE, c1: FIRE2, grav: -1, drag: 0.5 });
    },
    /** 熄火的白煙 */
    steam(x, y, z) { for (let i = 0; i < 16; i++) P(alpha, x + rs(0.6), y, z + rs(0.6), { vx: rs(1), vy: 2 + R() * 3, vz: rs(1), life: 1.5 + R(), s0: 1, s1: 4, c0: SMOKE_L, a: 0.6, wind: 0.5 }); },
    /** 砲彈飛行的煙跡 */
    trail(x, y, z, kind) {
      if (kind === 'f') { P(add, x, y, z, { life: 0.35, s0: 1.1, s1: 0.2, c0: FIRE, c1: FIRE2 }); P(alpha, x, y, z, { life: 1.6, s0: 0.5, s1: 2, c0: SMOKE_D, a: 0.35, wind: 0.4 }); }
      else if (kind === 'x') { P(add, x, y, z, { vx: rs(2), vy: rs(2), vz: rs(2), life: 0.25, s0: 0.3, s1: 0.05, c0: FIRE, c1: FIRE2 }); P(alpha, x, y, z, { life: 1.2, s0: 0.4, s1: 1.4, c0: SMOKE, a: 0.3, wind: 0.4 }); }
      else P(alpha, x, y, z, { life: 0.9, s0: 0.25, s1: 1.1, c0: SMOKE_L, a: 0.22, wind: 0.4 });
    },
    /** 船首浪花 */
    spray(x, y, z, vx, vz, k) { for (let i = 0; i < 3 * k; i++) P(alpha, x + rs(1), y, z + rs(1), { vx: vx * 0.6 + rs(3), vy: 2 + R() * 4 * k, vz: vz * 0.6 + rs(3), life: 0.9 + R() * 0.6, s0: 0.5, s1: 1.8, c0: SPLASH, a: 0.6, grav: 11, drag: 0.4 }); },
    /** 沉船：氣泡、白沫、殘骸 */
    sinkFoam(x, z, r, dt) {
      if (R() < dt * 30) { const a = R() * 6.28, d = R() * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; P(alpha, px, waveHeight(px, pz) + 0.1, pz, { vy: 0.5 + R() * 1.5, life: 1.2 + R(), s0: 0.6, s1: 2.2, c0: SPLASH, a: 0.7 }); }
    },
    wreck(x, z, n = 30) { for (let i = 0; i < n; i++) deb(x + rs(8), waveHeight(x, z) + 1, z + rs(8), rs(3), 2 + R() * 4, rs(3), 1.5); },
    bolt(cx, cz) {
      const a = boltGeo.attributes.position; let x = cx, y = 520, z = cz;
      for (let i = 0; i < 40; i++) { a.setXYZ(i, x, y, z); y -= 13.5; x += rs(9); z += rs(9); }
      a.needsUpdate = true; bolt.visible = true; boltT = 0.18;
    },
    ring, flash,
    update(dt, wind, fogCol, fogD) {
      const sc = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
      for (const L of [add, alpha]) { L.u.uScale.value = sc; L.u.uFog.value.copy(fogCol); L.u.uFogD.value = fogD; L.update(dt, wind); }
      // 木屑
      for (let i = 0; i < D.length; i++) {
        const d = D[i]; d.life -= dt;
        const wh = waveHeight(d.x, d.z);
        if (d.y > wh || d.vy > 0) { d.vy -= 13 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt; }
        if (d.y <= wh) { d.float = 1; d.y += (wh - 0.03 - d.y) * Math.min(1, dt * 6); d.vx *= 0.9; d.vz *= 0.9; d.vy = 0; d.wx *= 0.9; d.wy *= 0.9; d.wz *= 0.9; d.x += wind[0] * dt * 0.3; d.z += wind[1] * dt * 0.3; }
        const s = d.s * Math.min(1, d.life / 2);
        M.compose(V.set(d.x, d.y, d.z), Q.setFromEuler(E.set(d.rx, d.ry, d.rz)), S.set(s, s, s)); debris.setMatrixAt(i, M);
      }
      for (let i = D.length - 1; i >= 0; i--) if (D[i].life <= 0) D.splice(i, 1);
      for (let i = D.length; i < DEB; i++) { M.makeScale(0, 0, 0); debris.setMatrixAt(i, M); }
      debris.count = DEB; debris.instanceMatrix.needsUpdate = true;
      // 環
      for (const r of rings) { r.life -= dt; const t = 1 - r.life / r.max; r.m.scale.setScalar(1 + r.r * Math.sqrt(t)); r.m.material.opacity = 0.65 * (1 - t); r.m.position.y = waveHeight(r.m.position.x, r.m.position.z) + 0.12; if (r.life <= 0) { scene.remove(r.m); r.m.material.dispose(); } }
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
      for (const L of lights) { L.t = Math.max(0, L.t - dt); L.l.intensity = L.t > 0 ? L.I * (L.t / L.max) : 0; }
      boltT -= dt; bolt.visible = boltT > 0; bolt.material.opacity = Math.max(0, boltT / 0.18);
    },
  };
  return api;
}
