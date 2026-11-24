// ===== 音效（WebAudio 即時合成，不用音檔）=====
let ctx, master, sea, seaF, rainG, windG, fireG;
function noiseBuf(sec = 2) { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  const loop = (f, q, g) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf(3); s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f; fl.Q.value = q; const gn = ctx.createGain(); gn.gain.value = g; s.connect(fl); fl.connect(gn); gn.connect(master); s.start(); return [gn, fl]; };
  [sea, seaF] = loop(420, 0.6, 0.25); [rainG] = loop(5000, 0.3, 0); [windG] = loop(900, 2, 0.04); [fireG] = loop(2600, 0.8, 0);
}
export function ambient(wave, storm, speed, under, fire = 0) {
  if (!ctx) return; const t = ctx.currentTime;
  fireG.gain.setTargetAtTime(Math.min(0.25, fire * 0.12) * (0.7 + Math.random() * 0.6), t, 0.08);
  sea.gain.setTargetAtTime(0.18 + wave * 0.12 + storm * 0.15, t, 0.3); seaF.frequency.setTargetAtTime(under ? 180 : 380 + speed * 25 + storm * 300, t, 0.3);
  rainG.gain.setTargetAtTime(storm * 0.22, t, 0.5); windG.gain.setTargetAtTime(0.03 + storm * 0.12, t, 0.5);
}
function burst(dur, f0, f1, gain, type = 'lowpass', delay = 0) {
  if (!ctx) return; const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(Math.max(0.2, dur)); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
function tone(f, dur, gain, type = 'sine', f1, delay = 0) {
  if (!ctx) return; const t = ctx.currentTime + delay; const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
export const sfx = {
  boom(d = 0, big = 1) { const v = Math.max(0.04, 1 - d / 600) * big; burst(2.2, 2200, 40, Math.min(1, 0.9 * v)); tone(55, 1.4, 0.8 * v, 'sine', 25); burst(0.5, 6000, 800, 0.35 * v, 'highpass'); },
  gunshot(d = 0) { const v = Math.max(0.03, 1 - d / 250); burst(0.35, 5000, 300, 0.7 * v, 'lowpass'); tone(180, 0.15, 0.3 * v, 'square', 60); },
  whistle() { tone(1400, 0.6, 0.06, 'sine', 500); burst(0.6, 3000, 900, 0.1, 'bandpass'); },
  crumble(d = 0) { const v = Math.max(0.05, 1 - d / 500); burst(2.5, 900, 60, 0.8 * v); for (let i = 0; i < 5; i++) burst(0.3, 1500, 200, 0.3 * v, 'bandpass', 0.2 + i * 0.25); },
  rip() { burst(0.35, 5000, 1200, 0.25, 'highpass'); },
  hiss() { burst(1.2, 6000, 2000, 0.2, 'highpass'); },
  cannon(d = 0) { const v = Math.max(0.05, 1 - d / 400); burst(1.4, 1800, 60, 0.9 * v); tone(70, 0.8, 0.7 * v, 'sine', 35); },
  hit(d = 0) { const v = Math.max(0.05, 1 - d / 300); burst(0.6, 3000, 200, 0.7 * v, 'bandpass'); tone(160, 0.3, 0.3 * v, 'square', 60); },
  splash(d = 0) { const v = Math.max(0.03, 1 - d / 300); burst(0.9, 2500, 300, 0.4 * v, 'bandpass'); },
  thunder() { burst(3, 400, 40, 0.8); burst(1.5, 2500, 200, 0.3, 'lowpass', 0.05); },
  dig() { burst(0.25, 1200, 300, 0.4, 'bandpass'); },
  swing() { burst(0.18, 4000, 1500, 0.2, 'highpass'); },
  thunk() { tone(220, 0.12, 0.3, 'triangle', 120); burst(0.1, 2000, 500, 0.2); },
  coin() { tone(988, 0.12, 0.25, 'square'); tone(1319, 0.3, 0.2, 'square', null, 0.1); },
  bucket() { burst(0.5, 1800, 400, 0.35, 'bandpass'); },
  hurt() { tone(300, 0.25, 0.3, 'sawtooth', 120); },
  chime() { tone(660, 0.3, 0.18); tone(880, 0.4, 0.15, 'sine', null, 0.12); },
  creak() { tone(90 + Math.random() * 40, 0.6, 0.05, 'sawtooth', 70); },
};
