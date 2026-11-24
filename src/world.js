// ===== 3D 世界：天空、雲、海面、島嶼、港口、要塞、天氣 =====
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { WAVE_GLSL, sea, waveHeight } from './waves.js';
import { ISLANDS, terrainH, PIERS, MERCHANT, fbm, rng, SEABED } from './geo.js';
import { woodTex, buildPerson } from './shipmesh.js';
import { fortTowers, FORT_ISL } from './sim.js';

const NOISE_GLSL = /* glsl */`
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
float fbm5(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+vec2(13.1,7.7); a*=0.5; } return s; }
`;
const HULLW_GLSL = /* glsl */`
float hullW(float z){ if(z>=-1.0){ float t=min(1.0,(z+1.0)/13.0); return max(0.12, 3.4*sqrt(1.0-t*t)); } float t=min(1.0,(-1.0-z)/10.0); return 3.4-0.6*t*t; }
`;
const MAXS = 8, DEPTH_SPAN = 3400;

function cloudMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCover: { value: 0.42 }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uDay: { value: 1 }, uStormP: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(1, 0) }, uCam: { value: new THREE.Vector3() } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE_GLSL + /* glsl */`
      uniform float uTime, uCover, uDay; uniform vec3 uSun, uSunCol, uStormP, uCam; uniform vec2 uWind; varying vec3 vW;
      void main(){
        vec2 p = vW.xz * 0.0011 + uWind * uTime * 0.004;
        float n = fbm5(p) * 0.7 + fbm5(p * 2.7 + 4.0) * 0.3;
        n = clamp((n - 0.28) / 0.42, 0.0, 1.0);
        float st = 1.0 - smoothstep(uStormP.z * 1.1, uStormP.z * 3.4, distance(vW.xz, uStormP.xy));
        float cov = uCover + st * 0.62;
        float c = smoothstep(1.0 - cov, 1.0 - cov + 0.3, n + st * 0.75) * (0.85 + st * 0.15);
        float thick = smoothstep(1.0 - cov, 1.0, n);
        vec3 lit = mix(vec3(1.0), uSunCol, 0.35) * (0.35 + 0.75 * uDay);
        vec3 shade = vec3(0.42, 0.45, 0.5) * (0.25 + 0.6 * uDay);
        vec3 col = mix(lit, shade, clamp(thick * 0.9 + st * 0.75, 0.0, 1.0)) * (1.0 - st * 0.45);
        float far = 1.0 - smoothstep(4500.0, 9500.0, distance(vW.xz, uCam.xz));
        gl_FragColor = vec4(col, c * far * 0.95);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function buildFort(scene) {
  const T = fortTowers(), g = new THREE.Group(); scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8778, roughness: 0.95, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5d574c, roughness: 1, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x232325, metalness: 0.6, roughness: 0.45 });
  const flagM = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, side: THREE.DoubleSide });
  const towers = T.map((t, i) => {
    const tg = new THREE.Group(); tg.position.set(t.x, t.y - 1, t.z); g.add(tg);
    const intact = new THREE.Group(); tg.add(intact);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.3, 11, 12), stone); body.position.y = 5.5; intact.add(body);
    for (let k = 0; k < 10; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.9), stone); const a = k / 10 * Math.PI * 2; m.position.set(Math.cos(a) * 3.4, 11.5, Math.sin(a) * 3.4); m.rotation.y = -a; intact.add(m); }
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 2.6, 10).rotateX(Math.PI / 2).translate(0, 0, 1.4), iron); gun.position.y = 11.6; intact.add(gun);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5), dark); pole.position.set(-2, 13.5, 0); intact.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), flagM); flag.position.set(-0.9, 15.2, 0); intact.add(flag);
    const ruin = new THREE.Group(); ruin.visible = false; tg.add(ruin);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.3, 3.5, 12, 1, true), dark); stub.position.y = 1.75; ruin.add(stub);
    for (let k = 0; k < 14; k++) { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.9, 0), stone); rk.position.set((Math.random() - .5) * 10, 0.4, (Math.random() - .5) * 10); rk.rotation.set(Math.random() * 3, Math.random() * 3, 0); ruin.add(rk); }
    tg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { tg, intact, ruin, gun, flag, x: t.x, y: t.y, z: t.z };
  });
  // 城牆
  for (let i = 0; i < T.length; i++) {
    const a = T[i], b = T[(i + 1) % T.length], len = Math.hypot(b.x - a.x, b.z - a.z) - 7;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5, len), stone);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; w.position.set(mx, Math.max(terrainH(mx, mz), (a.y + b.y) / 2) + 1.5, mz); w.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    w.castShadow = w.receiveShadow = true; g.add(w);
  }
  const I = ISLANDS[FORT_ISL];
  const keep = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 9), stone); keep.position.set(I.x, terrainH(I.x, I.z - 8) + 2.5, I.z - 8); keep.castShadow = true; g.add(keep);
  return {
    towers,
    set(hp, t) {
      towers.forEach((tw, i) => { const alive = hp[i] > 0; tw.intact.visible = alive; tw.ruin.visible = !alive; tw.flag.rotation.y = Math.sin(t * 2 + i) * 0.3; });
    },
  };
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 12000); camera.rotation.order = 'YXZ';
  scene.fog = new THREE.FogExp2(0x9fc6dc, 0.0009);

  // 天空（主場景＋環境貼圖用的天空場景）
  const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
  const su = sky.material.uniforms; su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const cloudMat = cloudMaterial();
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(Math.PI / 2), cloudMat); clouds.renderOrder = -1; scene.add(clouds);
  const skyScene = new THREE.Scene(); const sky2 = new THREE.Mesh(sky.geometry, sky.material); sky2.scale.setScalar(10000); skyScene.add(sky2);
  const clouds2 = new THREE.Mesh(clouds.geometry, cloudMat); skyScene.add(clouds2);
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(1, 20000, cubeRT); skyScene.add(cubeCam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envT = 0, envRT = null;
  scene.environmentIntensity = 0.55;

  const stars = (() => {
    const g = new THREE.BufferGeometry(), p = []; const r = rng(7);
    for (let i = 0; i < 2200; i++) { const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u); if (u < 0.05) continue; p.push(Math.cos(a) * s * 8000, u * 8000, Math.sin(a) * s * 8000); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const pts = new THREE.Points(g, m); scene.add(pts); return pts;
  })();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(110, 20, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false })); scene.add(moon);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3a5a40, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 400; sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // 地形深度貼圖（給海面算淺灘顏色和海岸白浪）
  const DN = 768, dData = new Uint8Array(DN * DN).fill(Math.round((SEABED + 30) / 80 * 255));
  for (const I of ISLANDS) {
    const r = I.r * 1.45, i0 = Math.floor(((I.x - r) / DEPTH_SPAN + 0.5) * DN), i1 = Math.ceil(((I.x + r) / DEPTH_SPAN + 0.5) * DN), j0 = Math.floor(((I.z - r) / DEPTH_SPAN + 0.5) * DN), j1 = Math.ceil(((I.z + r) / DEPTH_SPAN + 0.5) * DN);
    for (let j = Math.max(0, j0); j < Math.min(DN, j1); j++) for (let i = Math.max(0, i0); i < Math.min(DN, i1); i++) {
      const x = ((i + 0.5) / DN - 0.5) * DEPTH_SPAN, z = ((j + 0.5) / DN - 0.5) * DEPTH_SPAN;
      dData[j * DN + i] = Math.max(0, Math.min(255, Math.round((terrainH(x, z) + 30) / 80 * 255)));
    }
  }
  const depthTex = new THREE.DataTexture(dData, DN, DN, THREE.RedFormat, THREE.UnsignedByteType); depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;

  // 海面：非均勻格網（中心密、外圍疏），跟著攝影機
  const N = 320, S = 6000, pw = 2.4;
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
    uShipInv: { value: Array.from({ length: MAXS }, () => new THREE.Matrix4()) }, uShipN: { value: 0 },
    uWake: { value: Array.from({ length: MAXS }, () => new THREE.Vector4()) }, uWakeS: { value: new Array(MAXS).fill(1) },
    uDeep: { value: new THREE.Color(0x032a40) }, uMid: { value: new THREE.Color(0x0b4f66) }, uShallow: { value: new THREE.Color(0x2fb3b0) },
    uStorm: { value: 0 }, uNight: { value: 0 }, uEnv: { value: cubeRT.texture }, uDepth: { value: depthTex }, uStormP: { value: new THREE.Vector3() },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterU, transparent: true, side: THREE.DoubleSide,
    vertexShader: WAVE_GLSL + /* glsl */`
      varying vec3 vW; varying vec3 vN; varying float vH;
      void main(){
        vec3 p = (modelMatrix * vec4(position,1.0)).xyz; vec3 n;
        vec3 d = gerstner(p.xz, n); p += d; vW = p; vN = n; vH = d.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: NOISE_GLSL + HULLW_GLSL + /* glsl */`
      uniform vec3 uCam, uSun, uSunCol, uSkyCol, uFogCol, uDeep, uMid, uShallow, uStormP; uniform float uFogD, uTime, uAmp, uStorm, uNight;
      uniform mat4 uShipInv[${MAXS}]; uniform int uShipN; uniform vec4 uWake[${MAXS}]; uniform float uWakeS[${MAXS}];
      uniform samplerCube uEnv; uniform sampler2D uDepth;
      varying vec3 vW; varying vec3 vN; varying float vH;
      void main(){
        // 船殼內不顯示海水
        for(int i=0;i<${MAXS};i++){ if(i>=uShipN) break; vec3 l = (uShipInv[i] * vec4(vW,1.0)).xyz;
          if(l.z>-11.0 && l.z<12.0 && l.y<2.7 && l.y>-2.6 && abs(l.x) < hullW(l.z)-0.08) discard; }
        float dist = length(uCam - vW); vec3 V = normalize(uCam - vW);
        if(!gl_FrontFacing){
          // 從水下往上看：全反射＋天光窗口
          float win = pow(max(dot(-V, vec3(0,-1,0)), 0.0), 3.0);
          vec3 col = mix(vec3(0.02,0.16,0.2), uSkyCol*1.1 + vec3(0.1,0.2,0.2), win) * (1.0 - uNight*0.8);
          gl_FragColor = vec4(col, 0.96);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        float t = uTime;
        // 細小波紋（法線擾動）
        vec2 q = vW.xz * 0.32; float e = 0.08;
        float r0 = n2(q + t*0.6) + n2(q*2.3 - t*0.9)*0.5 + n2(q*5.1 + t*1.3)*0.25;
        float rx = n2(q + vec2(e,0) + t*0.6) + n2((q+vec2(e,0))*2.3 - t*0.9)*0.5 + n2((q+vec2(e,0))*5.1 + t*1.3)*0.25;
        float rz = n2(q + vec2(0,e) + t*0.6) + n2((q+vec2(0,e))*2.3 - t*0.9)*0.5 + n2((q+vec2(0,e))*5.1 + t*1.3)*0.25;
        float rip = (0.4 + uStorm*0.5) * (1.0 - smoothstep(40.0, 320.0, dist));
        vec3 N = normalize(vN + vec3(-(rx-r0)/e, 0.0, -(rz-r0)/e) * rip * 0.09);
        // 水深
        float ground = texture2D(uDepth, vW.xz / ${DEPTH_SPAN.toFixed(1)} + 0.5).r * 80.0 - 30.0;
        float depth = vW.y - ground;
        float shallow = 1.0 - smoothstep(0.5, 11.0, depth);
        // 顏色：深海 → 中層 → 淺灘；浪峰透光（次表面散射）
        float crest = clamp(vH / (1.4*uAmp) * 0.5 + 0.5, 0.0, 1.0);
        float sss = pow(max(dot(V, -uSun) * 0.5 + 0.5, 0.0), 3.0) * smoothstep(0.45, 0.95, crest);
        vec3 body = mix(uDeep, uMid, crest * 0.6);
        body += uShallow * sss * 0.55 * (1.0 - uNight) * (1.0 - uStorm*0.6);
        body = mix(body, uShallow, shallow * 0.75);
        float storm = uStorm;
        body = mix(body, vec3(0.06,0.11,0.13), storm * 0.55);
        body *= (1.0 - uNight * 0.85);
        // 天空反射（即時環境貼圖）
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 refl = textureCube(uEnv, R).rgb;
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0) * 0.9);
        float sd = max(dot(R, uSun), 0.0);
        col += uSunCol * (pow(sd, 700.0) * 9.0 + pow(sd, 60.0) * 0.35) * (1.0 - storm*0.9);
        // 白沫：浪頭、海岸、船殼、航跡
        float fN = n2(vW.xz*0.55 + t*0.35) * 0.55 + n2(vW.xz*1.9 - t*0.6) * 0.3 + n2(vW.xz*5.0 + t)*0.15;
        float foam = smoothstep(0.58, 0.98, crest + (fN-0.5)*0.4) * (0.25 + storm*0.85);
        float shore = (1.0 - smoothstep(0.0, 1.6 + uAmp*0.6, depth)) * (0.6 + 0.4*sin(t*1.3 + depth*3.0 + fN*6.0));
        foam += max(0.0, shore) * step(-1.0, depth);
        for(int i=0;i<${MAXS};i++){ if(i>=uShipN) break;
          vec4 w = uWake[i]; float sc = uWakeS[i]; vec2 d = vW.xz - w.xy;
          vec2 f = vec2(sin(w.z), cos(w.z)), rt = vec2(cos(w.z), -sin(w.z));
          float lz = dot(d, f) / sc, lx = dot(d, rt) / sc, spd = clamp(w.w / 9.0, 0.0, 1.3);
          if(lz > -12.0 && lz < 13.5){ float hw = hullW(clamp(lz, -11.0, 12.0)); float ed = abs(abs(lx) - hw); foam += (1.0 - smoothstep(0.0, 0.8 + spd, ed)) * (0.3 + spd * 0.9) * (lz > 6.0 ? 1.4 : 1.0); }
          float s = -lz - 10.0;
          if(s > 0.0 && s < 280.0){
            float fade = (1.0 - s / 280.0) * spd;
            float kel = abs(lx) - (1.8 + s * 0.34); foam += exp(-kel*kel / (1.2 + s * 0.07)) * fade * 0.85;
            foam += exp(-lx*lx / (3.0 + s * 0.22)) * max(0.0, 1.0 - s / 130.0) * spd * 0.95;
          }
        }
        foam = clamp(foam * (0.45 + 0.75 * fN), 0.0, 1.0) * (1.0 - smoothstep(150.0, 600.0, dist));
        col = mix(col, vec3(0.93,0.97,0.99) * (1.0 - uNight*0.75) * (1.0 - storm * 0.3), foam);
        float fog = 1.0 - exp(-uFogD*uFogD*dist*dist);
        col = mix(col, uFogCol, fog);
        float a = mix(0.86, 1.0, max(fres, smoothstep(10.0, 90.0, dist)));
        a = mix(a, 0.6, shallow * (1.0 - foam) * (1.0 - smoothstep(30.0, 200.0, dist)));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(wg, waterMat); water.frustumCulled = false; water.renderOrder = 1; scene.add(water);
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x0b2a35 })); seabed.position.y = -28; scene.add(seabed);

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


  // 黑鯊要塞
  const fort = buildFort(scene);

  // 雨
  const RN = 3500, rainG = new THREE.BufferGeometry(), rp = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) { const x = (Math.random() - .5) * 90, y = Math.random() * 45, z = (Math.random() - .5) * 90; rp.set([x, y, z, x + 0.25, y - 1.3, z], i * 6); }
  rainG.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.0, fog: false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const flash = new THREE.AmbientLight(0xdde6ff, 0); scene.add(flash);

  const DUSK = new THREE.Color(0xf0a46a);
  const sunDir = new THREE.Vector3(), fogC = new THREE.Color(), skyC = new THREE.Color(), tmpV = new THREE.Vector3();
  let flashT = 0, nextFlash = 4;
  const api = {
    renderer, scene, camera, sun, water, waterU, merchant, lhLight, fort,
    resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    /** 每幀更新天空、光線、天氣 */
    update(W, dt, onThunder) {
      const cp = camera.getWorldPosition(new THREE.Vector3());
      const ang = (W.day - 0.25) * Math.PI * 2;
      sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang), 0.45).normalize();
      su.sunPosition.value.copy(sunDir);
      const dayL = THREE.MathUtils.smoothstep(sunDir.y, -0.12, 0.25);
      // 局部暴風雨強度（以攝影機位置為準）
      const sd = Math.hypot(cp.x - W.storm.x, cp.z - W.storm.z), storm = Math.max(W.storm.on, Math.max(0, Math.min(1, (W.storm.r * 1.25 - sd) / (W.storm.r * 0.5))));
      su.turbidity.value = 4 + storm * 14; su.rayleigh.value = Math.max(0.2, 1.6 + storm * 2 - (1 - dayL) * 1.2);
      sun.position.copy(cp).addScaledVector(sunDir.y > -0.05 ? sunDir : tmpV.set(-sunDir.x, -sunDir.y, sunDir.z), 200); sun.target.position.copy(cp);
      sun.intensity = (sunDir.y > 0 ? 2.6 * dayL : 0.35) * (1 - storm * 0.75);
      sun.color.setHSL(sunDir.y > 0 ? 0.1 : 0.6, sunDir.y > 0 ? 0.6 - dayL * 0.4 : 0.3, sunDir.y > 0 ? 0.6 + dayL * 0.3 : 0.75);
      hemi.intensity = (0.25 + 0.85 * dayL) * (1 - storm * 0.45);
      stars.material.opacity = (1 - dayL) * (1 - storm); stars.position.copy(cp);
      moon.position.copy(cp).add(tmpV.set(-sunDir.x, -sunDir.y, -sunDir.z).multiplyScalar(7000)); moon.visible = sunDir.y < 0.05;
      // 雲
      const cu = cloudMat.uniforms; cu.uTime.value = sea.t; cu.uSun.value.copy(sunDir); cu.uSunCol.value.copy(sun.color); cu.uDay.value = dayL; cu.uStormP.value.set(W.storm.x, W.storm.z, W.storm.r); cu.uWind.value.set(Math.sin(W.wind.a), Math.cos(W.wind.a)); cu.uCam.value.copy(cp);
      cu.uCover.value = 0.38 + 0.08 * Math.sin(sea.t * 0.003);
      clouds.position.set(cp.x, 520, cp.z);
      // 霧與水色
      skyC.setHSL(0.57, 0.45 - storm * 0.35, 0.08 + 0.58 * dayL - storm * 0.2);
      if (sunDir.y > -0.1 && sunDir.y < 0.18) skyC.lerp(DUSK, (1 - Math.abs(sunDir.y - 0.04) / 0.14) * 0.45 * (1 - storm));
      const under = cp.y < waveHeight(cp.x, cp.z) - 0.05;
      fogC.copy(skyC);
      let fogD = 0.00045 + storm * 0.0042 + (1 - dayL) * 0.0003;
      if (under) { fogC.setRGB(0.02, 0.17, 0.2).multiplyScalar(0.3 + dayL * 0.7); fogD = 0.045; }
      scene.fog.color.copy(fogC); scene.fog.density = fogD;
      waterU.uFogCol.value.copy(fogC); waterU.uFogD.value = under ? 0.02 : fogD; waterU.uSkyCol.value.copy(skyC);
      waterU.uSun.value.copy(sunDir.y > 0 ? sunDir : tmpV.set(-sunDir.x, -sunDir.y, -sunDir.z)); waterU.uSunCol.value.copy(sun.color).multiplyScalar(sunDir.y > 0 ? dayL : 0.25);
      waterU.uTime.value = sea.t; waterU.uAmp.value = W.amp; waterU.uCam.value.copy(cp); waterU.uStorm.value = storm; waterU.uNight.value = 1 - dayL;
      water.position.set(Math.round(cp.x / 8) * 8, 0, Math.round(cp.z / 8) * 8);
      renderer.toneMappingExposure = 0.5 + (1 - dayL) * 0.25;
      lhLight.intensity = (1 - dayL) * 900;
      // 環境貼圖（天空＋雲），每 2 秒更新一次
      envT -= dt;
      if (envT <= 0) {
        envT = 2; cubeCam.position.set(cp.x, 20, cp.z); clouds2.position.set(cp.x, 520, cp.z);
        cubeCam.update(renderer, skyScene);
        const old = envRT; envRT = pmrem.fromCubemap(cubeRT.texture); scene.environment = envRT.texture; if (old) old.dispose();
        scene.environmentIntensity = 0.25 + 0.4 * dayL;
      }
      // 雨、閃電
      rain.visible = storm > 0.03 && !under; rain.material.opacity = storm * 0.5;
      rain.position.set(cp.x, cp.y - 22 - ((sea.t * 30) % 22), cp.z);
      nextFlash -= dt;
      if (storm > 0.55 && nextFlash <= 0) {
        flashT = 0.3; nextFlash = 3 + Math.random() * 8;
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 500;
        onThunder && onThunder(cp.x + Math.cos(a) * d, cp.z + Math.sin(a) * d, d);
      }
      flashT = Math.max(0, flashT - dt); flash.intensity = flashT > 0 ? (Math.sin(flashT * 70) > 0 ? 4 : 0.6) * storm : 0;
      fort.set(W.fort.hp, sea.t);
      return { dayL, storm, fogC, fogD, under };
    },
  };
  addEventListener('resize', api.resize); api.resize();
  return api;
}
