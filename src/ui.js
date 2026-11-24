// ===== 介面：標題、提示、地圖、藏寶圖、收購商 =====
import { ISLANDS, terrainH, WORLD_R, SEAS, CASTLES, PORTS, seaAt } from './geo.js';
import { TIER, UPS, upCost, ROLES, MAX_CREW } from './sim.js';
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
const OVS = ['helpOv', 'mapOv', 'shopOv', 'msgOv', 'frOv', 'crewOv'];
export function anyOverlay() { return OVS.some(id => !$(id).classList.contains('hidden')); }
export function closeAll() { OVS.forEach(id => $(id).classList.add('hidden')); }

const ICONS = {
  sword: '<path d="M20 3l1 1-11 11-2-2zM6 14l4 4-2 1-3-3zM4 17l3 3-2 1-2-2z" fill="currentColor"/>',
  shovel: '<path d="M14 3l7 7-3 1-2-2-8 8 1 1-3 3-3-3 3-3 1 1 8-8-2-2z" fill="currentColor"/>',
  plank: '<rect x="3" y="9" width="18" height="6" rx="1" fill="currentColor"/><circle cx="6" cy="12" r="1" fill="#0008"/><circle cx="18" cy="12" r="1" fill="#0008"/>',
  bucket: '<path d="M5 8h14l-2 12H7z" fill="currentColor"/><path d="M5 8c0-5 14-5 14 0" stroke="currentColor" stroke-width="2" fill="none"/>',
  map: '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z" fill="currentColor"/><path d="M14 10l3 3m0-3l-3 3" stroke="#c4422b" stroke-width="2"/>',
  gun: '<path d="M2 9h15l2-2h3v4h-3l-1 1h-5l-2 6H6l1-5H2z" fill="currentColor"/>',
  glass: '<path d="M3 15l12-7 2 4-12 7z" fill="currentColor"/><rect x="15" y="5" width="6" height="6" rx="1" transform="rotate(-30 18 8)" fill="currentColor"/>',
};
const ITEMN = [['sword', '劍'], ['shovel', '鏟子'], ['plank', '木板'], ['bucket', '水桶'], ['map', '藏寶圖'], ['glass', '望遠鏡'], ['gun', '火槍']];
export function updateHotbar(me) {
  const k = me.item + '|' + me.inv.p + '|' + me.bucket + '|' + !!me.carry + '|' + !!me.gunOwned;
  const hb = $('hotbar'); if (hb.dataset.k === k) return; hb.dataset.k = k;
  hb.innerHTML = ITEMN.map(([ic, n], i) => `<div class="${i === me.item && !me.carry ? 'sel' : ''}"><em>${i + 1}</em><svg viewBox="0 0 24 24">${ICONS[ic]}</svg>${n}${i === 2 ? `<u>×${me.inv.p}</u>` : i === 3 && me.bucket ? '<u>滿</u>' : i === 6 && !me.gunOwned ? '<u>🔒</u>' : ''}</div>`).join('');
}

/** 好友清單（大廳與遊戲中共用） */
export function renderFriends(el, acc, h, inGame) {
  if (!acc.me) { el.innerHTML = '<div class="note">登入後才能加好友</div>'; return; }
  const rows = [];
  for (const [k, r] of acc.requests) rows.push(`<div class="fr req"><span class="dot on"></span><span class="nm">${esc(r.from)}<small>想加你好友</small></span><button class="pri" data-acc="${k}">接受</button><button data-dec="${k}">拒絕</button></div>`);
  const fl = [...acc.friends.values()].sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0));
  for (const f of fl) {
    const on = f.on, st = !on ? '離線' : on.room === 'solo' ? '單人航行中' : on.room ? `在房間 ${esc(on.room)} 航行中${on.host ? '（船長）' : ''}` : '在大廳';
    const canJoin = on && on.room && on.room !== 'solo' && on.room !== h.room();
    const canInv = inGame && on && h.room() && on.room !== h.room();
    rows.push(`<div class="fr"><span class="dot ${on ? 'on' : ''}"></span><span class="nm">${esc(f.name)}<small>${st}</small></span>${canJoin ? `<button class="tealb" data-join="${esc(on.room)}">加入</button>` : ''}${canInv ? `<button class="pri" data-inv="${f.key}">邀請</button>` : ''}<button class="ghost" data-del="${f.key}" title="刪除好友">✕</button></div>`);
  }
  if (!rows.length) rows.push('<div class="note" style="margin:0">還沒有好友。輸入朋友的帳號加好友，對方接受後就會出現在這裡。</div>');
  el.innerHTML = rows.join('');
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.acc) acc.accept(b.dataset.acc);
    else if (b.dataset.dec) acc.decline(b.dataset.dec);
    else if (b.dataset.join) h.joinRoom(b.dataset.join);
    else if (b.dataset.inv) { acc.invite(b.dataset.inv, h.room()); b.textContent = '已邀請'; b.disabled = true; }
    else if (b.dataset.del) { if (b.dataset.sure) acc.remove(b.dataset.del); else { b.dataset.sure = 1; b.textContent = '確定刪除？'; } }
  };
}
export function initUI(h) {
  const acc = h.acc;
  let color = h.colors[0], mode = 'login';
  const cols = $('cols');
  const drawCols = () => cols.innerHTML = h.colors.map(c => `<button data-c="${c}" class="${c === color ? 'sel' : ''}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="顏色"></button>`).join('');
  drawCols(); cols.onclick = e => { const b = e.target.closest('button'); if (b) { color = +b.dataset.c; drawCols(); } };
  const note = t => $('tnote').textContent = t;
  const setMode = m => { mode = m; $('tLogin').classList.toggle('on', m === 'login'); $('tReg').classList.toggle('on', m === 'reg'); $('regExtra').classList.toggle('hidden', m !== 'reg'); $('bAuth').textContent = m === 'reg' ? '註冊並登入' : '登入'; $('pwIn').autocomplete = m === 'reg' ? 'new-password' : 'current-password'; };
  $('tLogin').onclick = () => setMode('login'); $('tReg').onclick = () => setMode('reg');
  const showLobby = () => { $('authBox').classList.add('hidden'); $('lobbyBox').classList.remove('hidden'); $('whoName').textContent = '⚓ ' + acc.me.name; renderFriends($('friendList'), acc, h, false); };
  const doAuth = async () => {
    const n = $('accIn').value, p = $('pwIn').value; $('bAuth').disabled = true; note(mode === 'reg' ? '正在註冊⋯⋯' : '正在登入⋯⋯');
    try { if (mode === 'reg') await acc.register(n, p, color); else await acc.login(n, p); note('登入成功！'); showLobby(); h.afterLogin(); }
    catch (e) { note(e.message || '連線失敗，請稍後再試'); }
    $('bAuth').disabled = false;
  };
  $('bAuth').onclick = doAuth; $('pwIn').onkeydown = e => { if (e.key === 'Enter') doAuth(); };
  $('bGuest').onclick = () => h.onSolo('訪客' + Math.floor(Math.random() * 90 + 10), color);
  $('bLogout').onclick = () => { acc.logout(); $('lobbyBox').classList.add('hidden'); $('authBox').classList.remove('hidden'); note('已登出'); };
  acc.on('friends', () => { if (!$('lobbyBox').classList.contains('hidden')) renderFriends($('friendList'), acc, h, false); if (!$('frOv').classList.contains('hidden')) renderFriends($('friendList2'), acc, h, true); });
  acc.on('toast', t => { toast(t); note(t); });
  acc.on('invite', m => { $('invTxt').textContent = `📨 ${m.from} 邀請你上船（房號 ${m.room}）`; $('invPop').classList.remove('hidden'); $('invGo').onclick = () => { $('invPop').classList.add('hidden'); acc.clearInvite(keyOfName(m.from)); h.joinRoom(m.room); }; $('invNo').onclick = () => { $('invPop').classList.add('hidden'); acc.clearInvite(keyOfName(m.from)); }; });
  const addFr = async (inp) => { const n = $(inp).value.trim(); if (!n) return; try { const r = await acc.requestFriend(n); $(inp).value = ''; const t = r === 'accepted' ? `🤝 你和 ${n} 成為好友了！` : `已送出好友邀請給 ${n}，等對方接受`; note(t); toast(t); } catch (e) { note(e.message); toast(e.message); } };
  $('bAddFr').onclick = () => addFr('frIn'); $('bAddFr2').onclick = () => addFr('frIn2');
  $('bFrX').onclick = () => { $('frOv').classList.add('hidden'); $('cv').requestPointerLock?.(); };
  $('bSolo').onclick = () => h.onSolo(acc.me.name, acc.me.color, true);
  $('bHost').onclick = async () => {
    $('bHost').disabled = true; note('正在開房⋯⋯');
    try {
      const code = await h.onHost(acc.me.name, acc.me.color);
      const url = location.origin + location.pathname + '?room=' + code;
      $('roomCode').textContent = code; $('roomLink').textContent = url; $('roomBox').classList.remove('hidden');
      $('bCopy').onclick = () => navigator.clipboard?.writeText(url).then(() => $('bCopy').textContent = '已複製！').catch(() => $('bCopy').textContent = '請手動複製');
      note('好友現在就能從好友清單按「加入」。按「出航」開始，出航後好友也能隨時上船。');
      renderFriends($('friendList'), acc, h, true);
    } catch (e) { note('開房失敗：' + e.message); $('bHost').disabled = false; }
  };
  $('bStart').onclick = () => h.startHosted();
  $('bJoin').onclick = () => { $('joinBox').classList.toggle('hidden'); $('codeIn').focus(); };
  const join = () => { const code = $('codeIn').value.trim().toUpperCase(); if (code.length !== 5) { note('房號是 5 個英文字母'); return; } h.joinRoom(code); };
  $('bJoinGo').onclick = join; $('codeIn').onkeydown = e => { if (e.key === 'Enter') join(); };
  $('bHelpX').onclick = () => { $('helpOv').classList.add('hidden'); $('cv').requestPointerLock?.(); };
  $('msgB').onclick = () => $('msgOv').classList.add('hidden');
  $('mapOv').onclick = () => $('mapOv').classList.add('hidden');
  $('shopOv').onclick = e => { if (e.target.id === 'shopOv') $('shopOv').classList.add('hidden'); };
  // 自動登入（上次沒登出）
  const q = new URLSearchParams(location.search).get('room');
  if (q) note(`朋友邀請你上船（房號 ${q.toUpperCase()}）！登入後就會自動加入。`);
  note('正在連線⋯⋯');
  acc.tryResume().then(me => {
    if (me) { showLobby(); h.afterLogin(); if (q) h.joinRoom(q.toUpperCase().slice(0, 5)); else note('歡迎回來，' + me.name + '！'); }
    else { note(q ? `朋友邀請你上船（房號 ${q.toUpperCase()}）！登入或註冊後就會自動加入。` : '登入或註冊帳號，就能加好友一起出航。'); h.pendingRoom = q ? q.toUpperCase().slice(0, 5) : null; }
  }).catch(() => note('連不上伺服器，可以先「不登入，單人試玩」'));
  return { showLobby };
}
let keyOfName = n => n;
export function setKeyOf(f) { keyOfName = f; }

export function openShop(W, act, portName = '港口') {
  const S = W.ship, onShip = W.treasures.filter(t => t.st === 'ship').length;
  $('shopTxt').innerHTML = `「歡迎來到${portName}！把寶箱扛到我面前（按 E）我就照價收購。」<br>你們有 <b>${W.gold.toLocaleString()}</b> 金，船上還有 <b>${onShip}</b> 個寶箱沒卸下，藏寶圖 <b>${W.quests.length}</b>/3 張。`;
  const box = $('shopBtns'); box.innerHTML = '';
  const close = () => { $('shopOv').classList.add('hidden'); $('cv').requestPointerLock?.(); };
  const head = t => { const d = document.createElement('div'); d.className = 'lab'; d.textContent = t; box.appendChild(d); };
  const add = (t, f, cls = '', dis = false, keep = false) => { const b = document.createElement('button'); b.innerHTML = t; b.className = cls; b.disabled = dis; b.onclick = () => { f(); if (keep) setTimeout(() => openShop(W, act, portName), 120); else close(); }; box.appendChild(b); return b; };
  head('任務');
  add('領取一張新的藏寶圖（免費）', act.quest, 'pri', W.quests.length >= 3);
  add(W.bounty ? `懸賞進行中：擊沉 ${W.bounty.done}/${W.bounty.need} 艘海盜船` : '接下懸賞：擊沉海盜船換賞金', act.bounty, 'pri', !!W.bounty);
  if (W.wanted >= 0.5) add(`付罰金撤銷通緝 ${'★'.repeat(Math.ceil(W.wanted))}（${Math.round(W.wanted) * 300} 金）`, act.pardon, 'redb', W.gold < Math.round(W.wanted) * 300);
  head('補給（船要停在港口附近）');
  add('補滿彈藥與木板：砲彈 30、鏈彈 6、火焰彈 6、木板 18（60 金）', act.restock, 'tealb', W.gold < 60);
  add(`爆裂彈 ×4（150 金，船上現有 ${S.sup.x}）`, act.buyx, 'tealb', W.gold < 150);
  head(`招募船員（${W.crew.length}/${MAX_CREW}，按 C 下命令）`);
  { const grid = document.createElement('div'); grid.className = 'upg'; box.appendChild(grid);
    for (const r in ROLES) { const R0 = ROLES[r], n = W.crew.filter(c => c.role === r).length; const b = document.createElement('button'); b.disabled = W.gold < R0.cost || W.crew.length >= MAX_CREW;
      b.innerHTML = `<b>${R0.name}</b> <span class="lv">船上 ${n} 名</span><small>${R0.desc}</small><span class="cost">雇用 ${R0.cost} 金</span>`;
      b.onclick = () => { act.hire(r); setTimeout(() => openShop(W, act, portName), 150); }; grid.appendChild(b); } }
  for (const grp of ['武器', '船隻', '大砲']) {
    head(`強化：${grp}（全體船員共用）`);
    const grid = document.createElement('div'); grid.className = 'upg'; box.appendChild(grid);
    for (const k in UPS) {
      const U = UPS[k]; if (U.group !== grp) continue;
      const lv = W.up[k], max = lv >= U.max, cost = max ? 0 : upCost(k, lv);
      const b = document.createElement('button'); b.disabled = max || W.gold < cost;
      b.innerHTML = `<b>${U.name}</b> <span class="lv">${'■'.repeat(lv)}${'□'.repeat(U.max - lv)}</span><small>${U.desc}</small><span class="cost">${max ? '已滿級' : (k === 'gun' && lv === 0 ? '購買 ' : '升級 ') + cost.toLocaleString() + ' 金'}</span>`;
      b.onclick = () => { act.upgrade(k); setTimeout(() => openShop(W, act, portName), 150); };
      grid.appendChild(b);
    }
  }
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
  g.font = '900 30px "Noto Serif TC"'; g.fillStyle = 'rgba(70,45,20,.35)';
  for (const SA of SEAS) { const [x, y] = w2m(SA.x, SA.z, S); g.fillText(SA.name, x, y - SA.r / (WORLD_R * 1.05) / 2 * S * 0.72); g.strokeStyle = 'rgba(70,45,20,.18)'; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.arc(x, y, SA.r / (WORLD_R * 1.05) / 2 * S, 0, 7); g.stroke(); g.setLineDash([]); }
  g.font = '700 11px "Noto Sans TC"'; g.fillStyle = '#3b2716';
  for (const I of ISLANDS) { if (!I.name || I.castle !== undefined) continue; const [x, y] = w2m(I.x, I.z, S); g.font = I.port ? '900 13px "Noto Sans TC"' : '700 11px "Noto Sans TC"'; g.fillText(I.name + (I.port ? ' ⚓' : ''), x, y + I.r / (WORLD_R * 1.05) / 2 * S + 12); }
  // 任務 X
  for (const id of W.quests) { const t = W.treasures.find(x => x.id === id); if (!t) continue; const I = ISLANDS[t.isl]; const [x, y] = w2m(I.x, I.z, S); g.strokeStyle = '#c4422b'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, I.r / (WORLD_R * 1.05) / 2 * S + 8, 0, 7); g.stroke(); }
  // 漂浮物
  for (const t of W.treasures) if (t.st === 'float' || t.st === 'bottle' || t.st === 'ground') { const [x, y] = w2m(t.x, t.z, S); g.fillStyle = t.st === 'bottle' ? '#2e8f6a' : '#e0a92d'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  // 敵船
  CASTLES.forEach((C, i) => { const F = W.forts[i], [x, y] = w2m(C.x, C.z, S); g.fillStyle = F && F.open ? '#8a8a8a' : C.team === 3 ? '#1f4f8c' : '#7a1717'; g.fillRect(x - 6, y - 6, 12, 12); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x - 6, y - 6, 12, 12); g.fillStyle = '#2b1a0c'; g.font = '900 12px "Noto Sans TC"'; g.fillText(C.name + (F && F.open ? '（已攻陷）' : ''), x, y - 10); });
  for (const e of W.npcs) { if (e.sink > 0) continue; const [x, y] = w2m(e.x, e.z, S); shipIcon(g, x, y, e.heading, e.team === 1 ? '#2f6fc0' : e.team === 3 ? '#e8ecef' : '#1a1412', Math.max(0.8, e.scale)); }
  // 我們的船
  const [px, py] = w2m(W.ship.x, W.ship.z, S); shipIcon(g, px, py, W.ship.heading, '#16707a');
  // 自己
  const [mx, my] = w2m(cp.x, cp.z, S); g.fillStyle = '#c4422b'; g.beginPath(); g.arc(mx, my, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  // 羅盤玫瑰
  g.save(); g.translate(S - 70, 70); g.fillStyle = '#6b4a2a'; g.font = '900 18px "Noto Sans TC"'; g.fillText('北', 0, -34); g.beginPath(); g.moveTo(0, -26); g.lineTo(7, 0); g.lineTo(0, 26); g.lineTo(-7, 0); g.closePath(); g.fill(); g.restore();
  g.fillStyle = '#3b2716'; g.font = '700 14px "Noto Sans TC"'; g.textAlign = 'left'; g.fillText('點一下關閉　綠：我們的船　藍：海巡隊　白：國際海警　黑：海盜　方塊：城堡　紅圈：藏寶島　金點：寶箱', 20, S - 20);
}
function shipIcon(g, x, y, h, col, sc = 1) { g.save(); g.translate(x, y); g.rotate(Math.PI - h); g.scale(sc, sc); g.fillStyle = col; g.beginPath(); g.moveTo(0, -12); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); g.restore(); }

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
