// ===== 怒海同舟 3D：海浪（Gerstner）— CPU 與 GPU 共用同一組參數 =====
export const WAVES = [
  { d: [0.95, 0.31], L: 118, A: 1.05, Q: 0.22 },   // 遠方湧浪
  { d: [0.70, 0.71], L: 64, A: 0.72, Q: 0.32 },
  { d: [0.52, 0.85], L: 37, A: 0.40, Q: 0.38 },
  { d: [-0.38, 0.92], L: 21, A: 0.22, Q: 0.45 },
  { d: [0.99, -0.12], L: 13, A: 0.12, Q: 0.5 },
  { d: [0.82, -0.57], L: 8.3, A: 0.07, Q: 0.5 },
  { d: [-0.2, -0.98], L: 5.1, A: 0.04, Q: 0.5 },
];
for (const w of WAVES) { const l = Math.hypot(w.d[0], w.d[1]); w.d = [w.d[0] / l, w.d[1] / l]; w.k = 2 * Math.PI / w.L; w.c = Math.sqrt(9.8 / w.k); }

export const sea = { amp: 0.8, t: 0 };   // amp 受天氣影響（平靜 0.7、暴風雨 2.0）

function disp(x, z, t, amp, out) {
  let dx = 0, dy = 0, dz = 0;
  for (const w of WAVES) {
    const a = w.A * amp, f = w.k * (w.d[0] * x + w.d[1] * z - w.c * t);
    const c = Math.cos(f), s = Math.sin(f);
    dx += w.Q * a * w.d[0] * c; dz += w.Q * a * w.d[1] * c; dy += a * s;
  }
  out[0] = dx; out[1] = dy; out[2] = dz; return out;
}
const _o = [0, 0, 0];
/** 世界座標 (x,z) 的海面高度（反解水平位移，和畫面一致） */
export function waveHeight(x, z, t = sea.t, amp = sea.amp) {
  let px = x, pz = z;
  for (let i = 0; i < 3; i++) { disp(px, pz, t, amp, _o); px = x - _o[0]; pz = z - _o[2]; }
  return disp(px, pz, t, amp, _o)[1];
}

export const WAVE_GLSL = /* glsl */`
uniform float uTime; uniform float uAmp; uniform vec3 uCam;
const int NW = ${WAVES.length};
vec4 W_D[NW]; // dx,dz,k,c
vec2 W_A[NW]; // A,Q
void initW(){
${WAVES.map((w, i) => `  W_D[${i}] = vec4(${w.d[0].toFixed(5)}, ${w.d[1].toFixed(5)}, ${w.k.toFixed(6)}, ${w.c.toFixed(6)}); W_A[${i}] = vec2(${w.A.toFixed(4)}, ${w.Q.toFixed(4)});`).join('\n')}
}
vec3 gerstner(vec2 p, out vec3 nrm){
  initW();
  vec3 d = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0);
  float dist = length(p - uCam.xz);
  for(int i=0;i<NW;i++){
    float L = 6.2831853 / W_D[i].z;
    float fade = 1.0 - smoothstep(L*5.0, L*10.0, dist);
    float a = W_A[i].x * uAmp * fade; float q = W_A[i].y;
    vec2 dir = W_D[i].xy; float k = W_D[i].z;
    float f = k * (dot(dir, p) - W_D[i].w * uTime);
    float c = cos(f), s = sin(f);
    d.x += q*a*dir.x*c; d.z += q*a*dir.y*c; d.y += a*s;
    n.x -= dir.x * k * a * c; n.z -= dir.y * k * a * c; n.y -= q * k * a * s;
  }
  nrm = normalize(n);
  return d;
}
`;
