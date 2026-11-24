// ===== 介面：標題、提示、地圖、藏寶圖、收購商 =====
import { ISLANDS, terrainH, WORLD_R, MERCHANT } from './geo.js';
import { TIER } from './sim.js';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ui = {
  msg(h, p) { $('msgH').textContent = h; $('msgP').textContent = p; $('msgOv').classList.remove('hidden'); document.exitPointerLock?.(); },
};
export function toast(t, warn) {
  const d = document.createElement('div'); d.textContent = t; if (warn) d.className = 'warn';
  const box = $('toasts'); box.appendChild(d); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), warn ? 6000 : 4200);
}
export function chatLine(n, t) {
  const d = document.createElement('div'); d.innerHTML = `<b>${esc(n)}</b>：${esc(t)}`; const l = $('chatL'); l.appendChild(d); while (l.children.length > 6) l.firstChild.remove();
  setTimeout(() => d.remove(), 20000);
}
const OVS = ['helpOv', 'mapOv', 'shopOv', 'msgOv'];
export function anyOverlay() { return OVS.some(id => !$(id).classList.contains('hidden')); }
export function closeAll() { OVS.forEach(id => $(id).classList.add('hidden')); }

const ICONS = {
  sword: '<path d="M20 3l1 1-11 11-2-2zM6 14l4 4-2 1-3-3zM4 17l3 3-2 1-2-2z" fill="currentColor"/>',
  shovel: '<path d="M14 3l7 7-3 1-2-2-8 8 1 1-3 3-3-3 3-3 1 1 8-8-2-2z" fill="currentColor"/>',
  plank: '<rect x="3" y="9" width="18" height="6" rx="1" fill="currentColor"/><circle cx="6" cy="12" r="1" fill="#0008"/><circle cx="18" cy="12" r="1" fill="#0008"/>',
  bucket: '<path d="M5 8h14l-2 12H7z" fill="currentColor"/><path d="M5 8c0-5 14-5 14 0" stroke="currentColor" stroke-width="2" fill="none"/>',
  map: '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z" fill="currentColor"/><path d="M14 10l3 3m0-3l-3 3" stroke="#c4422b" stroke-width="2"/>',
  glass: '<path d="M3 15l12-7 2 4-12 7z" fill="currentColor"/><rect x="15" y="5" width="6" height="6" rx="1" transform="rotate(-30 18 8)" fill="currentColor"/>',
};
const ITEMN = [['sword', '劍'], ['shovel', '鏟子'], ['plank', '木板'], ['bucket', '水桶'], ['map', '藏寶圖'], ['glass', '望遠鏡']];
export function updateHotbar(me) {
  const k = me.item + '|' + me.inv.planks + '|' + me.bucket + '|' + me.inv.balls + '|' + !!me.carry;
  const hb = $('hotbar'); if (hb.dataset.k === k) return; hb.dataset.k = k;
  hb.innerHTML = ITEMN.map(([ic, n], i) => `<div class="${i === me.item && !me.carry ? 'sel' : ''}"><em>${i + 1}</em><svg viewBox="0 0 24 24">${ICONS[ic]}</svg>${n}${i === 2 ? `<u>×${me.inv.planks}</u>` : i === 3 && me.bucket ? '<u>滿</u>' : ''}</div>`).join('');
}

export function initUI(h) {
  let color = h.colors[0];
  try { $('nameIn').value = localStorage.getItem('tb_name') || ''; color = +(localStorage.getItem('tb_col') || color); } catch (e) {}
  const cols = $('cols');
  const drawCols = () => cols.innerHTML = h.colors.map(c => `<button data-c="${c}" class="${c === color ? 'sel' : ''}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="顏色"></button>`).join('');
  drawCols(); cols.onclick = e => { const b = e.target.closest('button'); if (b) { color = +b.dataset.c; drawCols(); } };
  const nm = () => { const n = $('nameIn').value.trim().slice(0, 10) || '船員' + Math.floor(Math.random() * 90 + 10); try { localStorage.setItem('tb_name', n); localStorage.setItem('tb_col', color); } catch (e) {} return n; };
  const note = t => $('tnote').textContent = t;
  $('bSolo').onclick = () => h.onSolo(nm(), color);
  $('bHost').onclick = async () => {
    $('bHost').disabled = true; note('正在連線到伺服器⋯⋯');
    try {
      const code = await h.onHost(nm(), color);
      const url = location.origin + location.pathname + '?room=' + code;
      $('roomCode').textContent = code; $('roomLink').textContent = url; $('roomBox').classList.remove('hidden');
      $('bCopy').onclick = () => navigator.clipboard?.writeText(url).then(() => $('bCopy').textContent = '已複製！').catch(() => $('bCopy').textContent = '請手動複製');
      note('朋友打開網址或輸入房號後，按「出航」。出航後朋友也能隨時加入。');
    } catch (e) { note('連線失敗：' + e.message + '。可以先單人出航。'); $('bHost').disabled = false; }
  };
  $('bStart').onclick = () => h.startHosted();
  $('bJoin').onclick = () => { $('joinBox').classList.toggle('hidden'); $('codeIn').focus(); };
  const join = async () => {
    const code = $('codeIn').value.trim().toUpperCase(); if (code.length !== 5) { note('房號是 5 個英文字母'); return; }
    $('bJoinGo').disabled = true; note('正在尋找房間 ' + code + '⋯⋯');
    try { await h.onJoin(nm(), color, code); } catch (e) { note(e.message); $('bJoinGo').disabled = false; }
  };
  $('bJoinGo').onclick = join; $('codeIn').onkeydown = e => { if (e.key === 'Enter') join(); };
  const q = new URLSearchParams(location.search).get('room');
  if (q) { $('joinBox').classList.remove('hidden'); $('codeIn').value = q.toUpperCase().slice(0, 5); note('朋友邀請你上船！輸入名字後按「上船」。'); }
  $('bHelpX').onclick = () => { $('helpOv').classList.add('hidden'); $('cv').requestPointerLock?.(); };
  $('msgB').onclick = () => $('msgOv').classList.add('hidden');
  $('mapOv').onclick = () => $('mapOv').classList.add('hidden');
  $('shopOv').onclick = e => { if (e.target.id === 'shopOv') $('shopOv').classList.add('hidden'); };
}

export function openShop(W, act) {
  const S = W.ship, onShip = W.treasures.filter(t => t.st === 'ship').length;
  $('shopTxt').innerHTML = `「歡迎回到潮聲港！把寶箱扛到我面前（按 E）我就照價收購：木製 ${TIER[1].gold}、白銀 ${TIER[2].gold}、黃金 ${TIER[3].gold} 金。」<br>你們有 <b>${W.gold}</b> 金，船上還有 <b>${onShip}</b> 個寶箱沒卸下，藏寶圖 <b>${W.quests.length}</b>/3 張。`;
  $('shopBtns').innerHTML = '';
  const add = (t, f, cls = '', dis = false) => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.disabled = dis; b.onclick = () => { f(); $('shopOv').classList.add('hidden'); $('cv').requestPointerLock?.(); }; $('shopBtns').appendChild(b); };
  add('領取一張新的藏寶圖（免費）', act.quest, 'pri', W.quests.length >= 3);
  add(`補給船隻：砲彈 30＋木板 18（60 金，現有 ${S.balls}／${S.planks}）`, act.restock, 'tealb', W.gold < 60);
  add('離開', () => {});
  $('shopOv').classList.remove('hidden');
}

// ---------- 航海圖 ----------
let baseMap = null;
function buildBase() {
  const N = 450, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N * 2 - 1) * WORLD_R * 1.05, z = (j / N * 2 - 1) * WORLD_R * 1.05, h = terrainH(x, z), k = (j * N + i) * 4;
    let r, gg, b;
    if (h > 2.3) { const t = Math.min(1, h / 30); r = 150 - t * 40; gg = 150 - t * 30; b = 90 - t * 20; }
    else if (h > 0) { r = 222; gg = 200; b = 140; }
    else if (h > -8) { r = 120 + h * 6; gg = 190 + h * 4; b = 190 + h * 2; }
    else { r = 196; gg = 182; b = 140; }
    if (h <= 0 && h > -8) { r = 160 + h * 4; gg = 196 + h * 3; b = 180 + h * 2; }
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
// 世界 -z 為北、+x 為東（和 3D 畫面一致）
const w2m = (x, z, S) => [(x / (WORLD_R * 1.05) + 1) / 2 * S, (1 + z / (WORLD_R * 1.05)) / 2 * S];
export function drawMap(W, me, cp, remotes) {
  if (!baseMap) baseMap = buildBase();
  const cv = $('mapCv'), g = cv.getContext('2d'), S = cv.width;
  g.fillStyle = '#e9dcb4'; g.fillRect(0, 0, S, S);
  g.imageSmoothingEnabled = true; g.drawImage(baseMap, 0, 0, S, S);
  // 格線與邊框
  g.strokeStyle = 'rgba(90,60,30,.18)'; g.lineWidth = 1; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * S / 8, 0); g.lineTo(i * S / 8, S); g.moveTo(0, i * S / 8); g.lineTo(S, i * S / 8); g.stroke(); }
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 10; g.strokeRect(5, 5, S - 10, S - 10);
  const [cx, cz] = w2m(0, 0, S); g.strokeStyle = 'rgba(120,40,20,.45)'; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.arc(cx, cz, WORLD_R / (WORLD_R * 1.05) / 2 * S, 0, 7); g.stroke(); g.setLineDash([]);
  // 暴風雨
  const [sx, sz] = w2m(W.storm.x, W.storm.z, S); const sr = W.storm.r / (WORLD_R * 1.05) / 2 * S;
  const gr = g.createRadialGradient(sx, sz, 0, sx, sz, sr); gr.addColorStop(0, 'rgba(40,50,70,.55)'); gr.addColorStop(1, 'rgba(40,50,70,0)'); g.fillStyle = gr; g.beginPath(); g.arc(sx, sz, sr, 0, 7); g.fill();
  g.fillStyle = '#e9dcb4'; g.font = '900 15px "Noto Sans TC"'; g.textAlign = 'center'; g.fillStyle = 'rgba(30,40,60,.8)'; g.fillText('暴風雨', sx, sz);
  // 島名
  g.font = '700 16px "Noto Sans TC"'; g.fillStyle = '#3b2716';
  for (const I of ISLANDS) { const [x, y] = w2m(I.x, I.z, S); g.fillText(I.name + (I.port ? ' ⚓' : ''), x, y + I.r / (WORLD_R * 1.05) / 2 * S + 18); }
  // 任務 X
  for (const id of W.quests) { const t = W.treasures.find(x => x.id === id); if (!t) continue; const I = ISLANDS[t.isl]; const [x, y] = w2m(I.x, I.z, S); g.strokeStyle = '#c4422b'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, I.r / (WORLD_R * 1.05) / 2 * S + 8, 0, 7); g.stroke(); }
  // 漂浮物
  for (const t of W.treasures) if (t.st === 'float' || t.st === 'bottle' || t.st === 'ground') { const [x, y] = w2m(t.x, t.z, S); g.fillStyle = t.st === 'bottle' ? '#2e8f6a' : '#e0a92d'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  // 敵船
  for (const e of W.enemies) { const [x, y] = w2m(e.x, e.z, S); shipIcon(g, x, y, e.heading, '#1a1412'); }
  // 我們的船
  const [px, py] = w2m(W.ship.x, W.ship.z, S); shipIcon(g, px, py, W.ship.heading, '#16707a');
  // 自己
  const [mx, my] = w2m(cp.x, cp.z, S); g.fillStyle = '#c4422b'; g.beginPath(); g.arc(mx, my, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  // 羅盤玫瑰
  g.save(); g.translate(S - 70, 70); g.fillStyle = '#6b4a2a'; g.font = '900 18px "Noto Sans TC"'; g.fillText('北', 0, -34); g.beginPath(); g.moveTo(0, -26); g.lineTo(7, 0); g.lineTo(0, 26); g.lineTo(-7, 0); g.closePath(); g.fill(); g.restore();
  g.fillStyle = '#3b2716'; g.font = '700 14px "Noto Sans TC"'; g.textAlign = 'left'; g.fillText('點一下關閉　◆ 綠：我們的船　黑：黑鯊海盜　紅圈：藏寶島　金點：寶箱　綠點：漂流瓶', 20, S - 20);
}
function shipIcon(g, x, y, h, col) { g.save(); g.translate(x, y); g.rotate(Math.PI - h); g.fillStyle = col; g.beginPath(); g.moveTo(0, -12); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); g.restore(); }

// ---------- 藏寶圖（羊皮紙）----------
const tmCache = new Map();
export function drawTreasureMap(W, me) {
  const cv = $('tmapCv'), g = cv.getContext('2d'), S = cv.width;
  const qs = W.quests.map(id => W.treasures.find(t => t.id === id)).filter(Boolean);
  if (!qs.length) { const key = 'none'; if (cv.dataset.k === key) return; cv.dataset.k = key; parchment(g, S); g.fillStyle = '#5b4630'; g.font = '900 30px "Noto Serif TC"'; g.textAlign = 'center'; g.fillText('沒有藏寶圖', S / 2, S / 2 - 10); g.font = '700 18px "Noto Sans TC"'; g.fillText('回潮聲港找收購商阿海領取，或撿海上的漂流瓶', S / 2, S / 2 + 26); return; }
  const t = qs[me.mapIdx % qs.length], key = t.id + '/' + qs.length;
  if (cv.dataset.k === key) return; cv.dataset.k = key;
  let img = tmCache.get(t.id);
  const I = ISLANDS[t.isl], span = I.r * 2.7;
  if (!img) {
    const N = 220, c = document.createElement('canvas'); c.width = c.height = N; const gg = c.getContext('2d'), id = gg.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = I.x + (i / N - 0.5) * span, z = I.z + (j / N - 0.5) * span, h = terrainH(x, z), k = (j * N + i) * 4;
      let a = 0, col = [120, 85, 45];
      if (h > 2.3) { a = 120 + Math.min(100, h * 4); col = [110 - h, 80 - h, 40]; } else if (h > 0) { a = 90; col = [150, 110, 60]; } else if (h > -3) { a = 40; col = [90, 110, 110]; }
      id.data.set([...col, a], k);
    }
    gg.putImageData(id, 0, 0); img = c; tmCache.set(t.id, img);
  }
  parchment(g, S);
  g.imageSmoothingEnabled = true; g.drawImage(img, 60, 70, S - 120, S - 120);
  const px = 60 + ((t.x - I.x) / span + 0.5) * (S - 120), py = 70 + ((t.z - I.z) / span + 0.5) * (S - 120);
  g.strokeStyle = '#a5261a'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(px - 14, py - 14); g.lineTo(px + 14, py + 14); g.moveTo(px + 14, py - 14); g.lineTo(px - 14, py + 14); g.stroke();
  g.fillStyle = '#3b2716'; g.font = '900 32px "Noto Serif TC"'; g.textAlign = 'center'; g.fillText(I.name, S / 2, 52);
  g.font = '700 16px "Noto Sans TC"'; g.fillText(`${TIER[t.tier].name}？　${(me.mapIdx % qs.length) + 1}/${qs.length}（Q 切換）`, S / 2, S - 26);
  g.save(); g.translate(S - 64, 110); g.font = '900 18px "Noto Sans TC"'; g.fillText('北', 0, -28); g.beginPath(); g.moveTo(0, -20); g.lineTo(6, 0); g.lineTo(0, 20); g.lineTo(-6, 0); g.closePath(); g.fill(); g.restore();
}
function parchment(g, S) {
  g.clearRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.7); gr.addColorStop(0, '#f1e2b8'); gr.addColorStop(1, '#c9a86a');
  g.fillStyle = gr; g.beginPath();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; const r = S * 0.49 + Math.sin(i * 7.3) * 5; const x = S / 2 + Math.cos(a) * r * 1.0, y = S / 2 + Math.sin(a) * r; i ? g.lineTo(Math.max(6, Math.min(S - 6, x)), Math.max(6, Math.min(S - 6, y))) : g.moveTo(x, y); }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(90,60,30,.4)'; g.lineWidth = 3; g.stroke();
}
