// ===== 3D 世界：天空、海面、島嶼、港口、天氣 =====
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { WAVE_GLSL, sea } from './waves.js';
import { ISLANDS, terrainH, PIERS, MERCHANT, fbm, rng } from './geo.js';
import { woodTex, buildPerson } from './shipmesh.js';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 6000); camera.rotation.order = 'YXZ';
  scene.fog = new THREE.FogExp2(0x9fc6dc, 0.0009);

  // 天空
  const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
  const su = sky.material.uniforms; su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const stars = (() => {
    const g = new THREE.BufferGeometry(), p = []; const r = rng(7);
    for (let i = 0; i < 1800; i++) { const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u); if (u < 0.05) continue; p.push(Math.cos(a) * s * 4000, u * 4000, Math.sin(a) * s * 4000); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const pts = new THREE.Points(g, m); scene.add(pts); return pts;
  })();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 20, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false })); scene.add(moon);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a5a40, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.near = 1; sc.far = 400; sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // 海面：非均勻格網（中心密、外圍疏），跟著攝影機
  const N = 300, S = 3200, pw = 2.2;
  const pos = new Float32Array((N + 1) * (N + 1) * 3), idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = i / N * 2 - 1, v = j / N * 2 - 1, k = (j * (N + 1) + i) * 3;
    pos[k] = Math.sign(u) * Math.pow(Math.abs(u), pw) * S; pos[k + 1] = 0; pos[k + 2] = Math.sign(v) * Math.pow(Math.abs(v), pw) * S;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); wg.setIndex(idx);
  const waterU = {
    uTime: { value: 0 }, uAmp: { value: 0.8 }, uCam: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uSkyCol: { value: new THREE.Color(0.6, 0.75, 0.9) }, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.0009 },
    uShipInv: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] }, uShipN: { value: 0 },
    uDeep: { value: new THREE.Color(0x05304a) }, uShallow: { value: new THREE.Color(0x1a8a96) }, uStorm: { value: 0 }, uNight: { value: 0 },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterU, transparent: true,
    vertexShader: WAVE_GLSL + /* glsl */`
      varying vec3 vW; varying vec3 vN; varying float vH;
      void main(){
        vec3 p = (modelMatrix * vec4(position,1.0)).xyz; vec3 n;
        vec3 d = gerstner(p.xz, n); p += d; vW = p; vN = n; vH = d.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCam, uSun, uSunCol, uSkyCol, uFogCol, uDeep, uShallow; uniform float uFogD, uTime, uAmp, uStorm, uNight;
      uniform mat4 uShipInv[4]; uniform int uShipN;
      varying vec3 vW; varying vec3 vN; varying float vH;
      float hullW(float z){ if(z>=-1.0){ float t=min(1.0,(z+1.0)/13.0); return max(0.12, 3.4*sqrt(1.0-t*t)); } float t=min(1.0,(-1.0-z)/10.0); return 3.4-0.6*t*t; }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      void main(){
        for(int i=0;i<4;i++){ if(i>=uShipN) break; vec3 l = (uShipInv[i] * vec4(vW,1.0)).xyz;
          if(l.z>-11.0 && l.z<12.0 && l.y<2.6 && l.y>-2.5 && abs(l.x) < hullW(l.z)-0.08) discard; }
        vec3 V = normalize(uCam - vW); float dist = length(uCam - vW);
        // 細小波紋
        vec2 q = vW.xz * 0.35; float t = uTime;
        float e = 0.08; float r0 = n2(q + t*0.6) + n2(q*2.3 - t*0.9)*0.5;
        float rx = n2(q + vec2(e,0) + t*0.6) + n2((q+vec2(e,0))*2.3 - t*0.9)*0.5;
        float rz = n2(q + vec2(0,e) + t*0.6) + n2((q+vec2(0,e))*2.3 - t*0.9)*0.5;
        float rip = (0.35 + uStorm*0.4) * (1.0 - smoothstep(30.0, 220.0, dist));
        vec3 N = normalize(vN + vec3(-(rx-r0)/e, 0.0, -(rz-r0)/e) * rip * 0.08);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        float crest = clamp(vH / (1.2*uAmp) * 0.5 + 0.5, 0.0, 1.0);
        vec3 body = mix(uDeep, uShallow, crest * 0.55 + 0.08) * (1.0 - uNight*0.8);
        vec3 R = reflect(-V, N);
        vec3 refl = mix(uSkyCol * 0.85, uSkyCol, clamp(R.y*2.0, 0.0, 1.0));
        vec3 col = mix(body, refl, fres * 0.85);
        float spec = pow(max(dot(R, uSun), 0.0), 380.0) * 6.0 + pow(max(dot(R, uSun), 0.0), 40.0) * 0.25;
        col += uSunCol * spec * (1.0 - uStorm*0.8);
        // 浪頭白沫
        float foamN = n2(vW.xz*0.6 + t*0.4) * 0.6 + n2(vW.xz*1.7 - t*0.7)*0.4;
        float foam = smoothstep(0.55, 0.95, crest + (foamN-0.5)*0.35) * (0.35 + uStorm*0.6);
        col = mix(col, vec3(0.92,0.96,0.98)*(1.0-uNight*0.75), foam * (1.0 - smoothstep(80.0, 400.0, dist)));
        float fog = 1.0 - exp(-uFogD*uFogD*dist*dist);
        col = mix(col, uFogCol, fog);
        float a = mix(0.82, 1.0, max(fres, smoothstep(10.0, 90.0, dist)));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(wg, waterMat); water.frustumCulled = false; water.renderOrder = 1; scene.add(water);

  // 海底（避免看穿）
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x0b2a35 })); seabed.position.y = -28; scene.add(seabed);

  // 島嶼
  const islandGroup = new THREE.Group(); scene.add(islandGroup);
  const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
  const palmTrunk = new THREE.CylinderGeometry(0.18, 0.3, 1, 7).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1 });
  const leafG = (() => { const g = new THREE.ConeGeometry(2.6, 0.5, 7, 1, true); g.translate(0, -0.1, 0); return g; })();
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const rockG = new THREE.DodecahedronGeometry(1, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8680, roughness: 1, flatShading: true });
  const bushG = new THREE.IcosahedronGeometry(1, 0), bushMat = new THREE.MeshStandardMaterial({ color: 0x4f7d2f, roughness: 1, flatShading: true });
  const C = { sandW: new THREE.Color(0xc9b98a), sand: new THREE.Color(0xe8d6a0), grass: new THREE.Color(0x6a9a45), grass2: new THREE.Color(0x4c7a36), rock: new THREE.Color(0x8c8577), snow: new THREE.Color(0xa59e90), deep: new THREE.Color(0x2b8d93) };
  const tmp = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), SC = new THREE.Vector3();
  for (const I of ISLANDS) {
    const size = I.r * 2.8, segs = Math.min(170, Math.round(size / 1.6));
    const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + I.x, z = p.getZ(i) + I.z; const h = terrainH(x, z); p.setY(i, h);
      const hx = terrainH(x + 1.5, z) - h, hz = terrainH(x, z + 1.5) - h, slope = Math.hypot(hx, hz) / 1.5;
      const n = fbm(x * 0.08, z * 0.08, 3, 2);
      if (h < -0.2) tmp.copy(C.deep).lerp(C.sandW, Math.max(0, 1 + h / 6));
      else if (h < 2.3) tmp.copy(C.sand).lerp(C.sandW, n * 0.4);
      else if (slope > 0.9 || h > I.h * 0.8) tmp.copy(C.rock).lerp(C.snow, n * 0.5);
      else tmp.copy(C.grass).lerp(C.grass2, n).lerp(C.sand, Math.max(0, (3.2 - h)) * 0.5);
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, terrMat); m.position.set(I.x, 0, I.z); m.receiveShadow = true; m.castShadow = true; islandGroup.add(m);
    // 植被
    const r = rng(I.seed * 7), palms = [], rocks = [], bushes = [];
    for (let k = 0; k < I.r * 3; k++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * I.r * 1.05, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, h = terrainH(x, z);
      if (I.port && z > I.z + 5 && Math.abs(x - I.x) < 50) continue;
      if (h > 2.6 && h < I.h * 0.7 && r() < 0.55) palms.push([x, h, z, 5 + r() * 5, r()]);
      else if (h > 1 && r() < 0.25) rocks.push([x, h, z, 0.5 + r() * 2.2]);
      else if (h > 3 && r() < 0.4) bushes.push([x, h, z, 0.6 + r() * 1.2]);
    }
    const tr = new THREE.InstancedMesh(palmTrunk, trunkMat, palms.length), lf = new THREE.InstancedMesh(leafG, leafMat, palms.length * 2);
    palms.forEach(([x, h, z, ht, rr], i) => {
      Q.setFromAxisAngle(V3.set(Math.cos(rr * 6), 0, Math.sin(rr * 6)), 0.12); M4.compose(V3.set(x, h - 0.2, z), Q, SC.set(1, ht, 1)); tr.setMatrixAt(i, M4);
      const top = V3.set(x + Math.cos(rr * 6) * ht * 0.12, h + ht - 0.3, z + Math.sin(rr * 6) * ht * 0.12).clone();
      Q.setFromAxisAngle(V3.set(0, 1, 0), rr * 6); M4.compose(top, Q, SC.set(1, 1, 1)); lf.setMatrixAt(i * 2, M4);
      Q.setFromAxisAngle(V3.set(0, 1, 0), rr * 6 + 0.45); M4.compose(top.add(V3.set(0, 0.25, 0)), Q, SC.set(0.75, 1.2, 0.75)); lf.setMatrixAt(i * 2 + 1, M4);
    });
    tr.castShadow = lf.castShadow = true; islandGroup.add(tr, lf);
    const rk = new THREE.InstancedMesh(rockG, rockMat, rocks.length); rocks.forEach(([x, h, z, s], i) => { Q.setFromEuler(new THREE.Euler(s, s * 3, s * 2)); M4.compose(V3.set(x, h, z), Q, SC.set(s, s * 0.7, s * 1.1)); rk.setMatrixAt(i, M4); }); rk.castShadow = true; islandGroup.add(rk);
    const bu = new THREE.InstancedMesh(bushG, bushMat, bushes.length); bushes.forEach(([x, h, z, s], i) => { M4.compose(V3.set(x, h + s * 0.3, z), Q.identity(), SC.set(s, s * 0.7, s)); bu.setMatrixAt(i, M4); }); islandGroup.add(bu);
  }

  // 港口：棧橋、房子、燈塔、收購商
  const port = new THREE.Group(); scene.add(port);
  const pierMat = new THREE.MeshStandardMaterial({ map: woodTex('#9b7349', 'pier'), roughness: 0.9 });
  for (const p of PIERS) {
    const w = p.x1 - p.x0, l = p.z1 - p.z0;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, l), pierMat); top.position.set((p.x0 + p.x1) / 2, p.y - 0.15, (p.z0 + p.z1) / 2); top.receiveShadow = top.castShadow = true; port.add(top);
    for (let z = p.z0 + 1; z < p.z1; z += 4) for (const x of [p.x0 + 0.4, p.x1 - 0.4]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 30, 7), pierMat); pole.position.set(x, p.y - 15, z); port.add(pole); }
  }
  const P0 = ISLANDS[0];
  const houseCols = [0xd9c7a3, 0xc98f6b, 0xe3dccb, 0x9fb7b0];
  for (let i = 0; i < 7; i++) {
    const x = P0.x - 38 + i * 11 + (i > 3 ? 6 : 0), z = P0.z + 28 + (i % 2) * 8; if (Math.abs(x - P0.x) < 8) continue;
    const h = terrainH(x, z), hg = new THREE.Group(); hg.position.set(x, h, z); hg.rotation.y = (i % 3 - 1) * 0.15;
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 6), new THREE.MeshStandardMaterial({ color: houseCols[i % 4], roughness: 0.9 })); body.position.y = 2.5; hg.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3, 4), new THREE.MeshStandardMaterial({ color: 0x8b3a2b, roughness: 0.8 })); roof.position.y = 6.5; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85); hg.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a2e1a })); door.position.set(0, 1.2, 3.02); hg.add(door);
    hg.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); port.add(hg);
  }
  // 燈塔
  const lh = new THREE.Group(); const lx = P0.x + 52, lz = P0.z + 62; lh.position.set(lx, terrainH(lx, lz), lz);
  for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.4 - i * 0.35, 2.75 - i * 0.35, 4, 14), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xc4422b : 0xf2ede2 })); seg.position.y = 2 + i * 4; lh.add(seg); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 2 })); lamp.position.y = 17.4; lh.add(lamp);
  const lhLight = new THREE.PointLight(0xffd27a, 0, 160, 1.2); lhLight.position.y = 18; lh.add(lhLight); port.add(lh);
  // 收購商攤位
  const stall = new THREE.Group(); stall.position.set(MERCHANT.x + 2.5, MERCHANT.y, MERCHANT.z + 1.5);
  const tbl = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1.4), pierMat); tbl.position.y = 0.5; stall.add(tbl);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 2.6), new THREE.MeshStandardMaterial({ color: 0x16707a })); awn.position.set(0, 3, -0.4); awn.rotation.x = 0.2; stall.add(awn);
  for (const x of [-2.1, 2.1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), pierMat); post.position.set(x, 1.5, 0.6); stall.add(post); }
  port.add(stall);
  const merchant = buildPerson(0x16707a, 0x7a2a1d); merchant.position.set(MERCHANT.x + 2.5, MERCHANT.y, MERCHANT.z + 0.2); merchant.rotation.y = 0; port.add(merchant);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 10), pierMat); pad.position.set(MERCHANT.x, MERCHANT.y - 0.15, MERCHANT.z + 1); pad.receiveShadow = true; port.add(pad);
  merchant.userData.label = '收購商 阿海';

  // 雨
  const RN = 2500, rainG = new THREE.BufferGeometry(), rp = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) { const x = (Math.random() - .5) * 80, y = Math.random() * 40, z = (Math.random() - .5) * 80; rp.set([x, y, z, x + 0.15, y - 1.1, z], i * 6); }
  rainG.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.0, fog: false })); rain.frustumCulled = false; scene.add(rain);
  // 暴風雲
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0x3a4048, transparent: true, opacity: 0.0, fog: false, depthWrite: false });
  const clouds = new THREE.Group(); scene.add(clouds);
  for (let i = 0; i < 60; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(40 + Math.random() * 40, 8, 6), cloudMat); const a = Math.random() * 6.28, d = Math.random() * 380; c.position.set(Math.cos(a) * d, 120 + Math.random() * 40, Math.sin(a) * d); c.scale.y = 0.35; clouds.add(c); }
  const flash = new THREE.AmbientLight(0xdde6ff, 0); scene.add(flash);

  const sunDir = new THREE.Vector3(), fogC = new THREE.Color(), skyC = new THREE.Color();
  let flashT = 0, nextFlash = 4;
  const api = {
    renderer, scene, camera, sun, water, waterU, merchant, lhLight,
    resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    /** 每幀更新天空、光線、天氣（W 為世界狀態） */
    update(W, dt, onThunder) {
      const cp = camera.getWorldPosition(new THREE.Vector3());
      // 太陽：day 0.25 日出、0.5 正午、0.75 日落
      const ang = (W.day - 0.25) * Math.PI * 2;
      sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang), 0.45).normalize();
      su.sunPosition.value.copy(sunDir);
      const dayL = THREE.MathUtils.smoothstep(sunDir.y, -0.12, 0.25), storm = W.storm.on;
      su.turbidity.value = 4 + storm * 14; su.rayleigh.value = 1.6 + storm * 2 - (1 - dayL) * 1.2;
      sun.position.copy(cp).addScaledVector(sunDir.y > -0.05 ? sunDir : new THREE.Vector3(-sunDir.x, -sunDir.y, sunDir.z), 200); sun.target.position.copy(cp);
      sun.intensity = (sunDir.y > 0 ? 2.6 * dayL : 0.35) * (1 - storm * 0.7);
      sun.color.setHSL(sunDir.y > 0 ? 0.1 : 0.6, sunDir.y > 0 ? 0.6 - dayL * 0.4 : 0.3, sunDir.y > 0 ? 0.6 + dayL * 0.3 : 0.75);
      hemi.intensity = (0.25 + 0.85 * dayL) * (1 - storm * 0.45);
      stars.material.opacity = (1 - dayL) * (1 - storm); stars.position.copy(cp);
      moon.position.copy(cp).add(new THREE.Vector3(-sunDir.x, -sunDir.y, -sunDir.z).multiplyScalar(3500)); moon.visible = sunDir.y < 0.05;
      // 霧與水色
      skyC.setHSL(0.57, 0.45 - storm * 0.35, 0.08 + 0.58 * dayL - storm * 0.18);
      if (sunDir.y > -0.1 && sunDir.y < 0.18) skyC.lerp(new THREE.Color(0xf0a46a), (1 - Math.abs(sunDir.y - 0.04) / 0.14) * 0.45 * (1 - storm));
      fogC.copy(skyC); scene.fog.color.copy(fogC);
      scene.fog.density = 0.0008 + storm * 0.0042 + (1 - dayL) * 0.0004;
      waterU.uFogCol.value.copy(fogC); waterU.uFogD.value = scene.fog.density; waterU.uSkyCol.value.copy(skyC);
      waterU.uSun.value.copy(sunDir.y > 0 ? sunDir : new THREE.Vector3(-sunDir.x, -sunDir.y, -sunDir.z)); waterU.uSunCol.value.copy(sun.color).multiplyScalar(sunDir.y > 0 ? dayL : 0.25);
      waterU.uTime.value = sea.t; waterU.uAmp.value = W.amp; waterU.uCam.value.copy(cp); waterU.uStorm.value = storm; waterU.uNight.value = 1 - dayL;
      water.position.set(Math.round(cp.x / 8) * 8, 0, Math.round(cp.z / 8) * 8);
      renderer.toneMappingExposure = 0.5 + (1 - dayL) * 0.25;
      lhLight.intensity = (1 - dayL) * 900;
      // 雨、雲、閃電
      rain.material.opacity = storm * 0.55; rain.visible = storm > 0.02; rain.position.set(cp.x, cp.y - 20 + ((sea.t * 30) % 1.1), cp.z);
      rain.position.y = cp.y - 18 - ((sea.t * 28) % 20);
      cloudMat.opacity = storm * 0.9; clouds.visible = storm > 0.02; clouds.position.set(W.storm.x, 0, W.storm.z);
      nextFlash -= dt;
      if (storm > 0.6 && nextFlash <= 0) { flashT = 0.25; nextFlash = 4 + Math.random() * 9; onThunder && onThunder(); }
      flashT = Math.max(0, flashT - dt); flash.intensity = flashT > 0 ? (Math.sin(flashT * 60) > 0 ? 3 : 0.5) * storm : 0;
      return { dayL, storm };
    },
  };
  addEventListener('resize', api.resize); api.resize();
  return api;
}
