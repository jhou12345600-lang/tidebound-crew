// ===== 船的格局（船內座標：+z 船頭、+x 右舷、y 向上）— 模擬、碰撞、畫面共用 =====
export const DECK = 2.4, HOLD = 0.25, KEEL = -1.7;
export const BOW = 12, STERN = -11;
/** 船殼半寬 */
export function hullW(z) {
  if (z >= -1) { const t = Math.min(1, (z + 1) / 13); return Math.max(0.12, 3.4 * Math.sqrt(1 - t * t)); }
  const t = Math.min(1, (-1 - z) / 10); return 3.4 - 0.6 * t * t;
}
export const deckW = z => Math.max(0, hullW(z) - 0.38);
export const holdW = z => Math.max(0, hullW(z) * 0.8 - 0.1);
export const HATCH = { x0: -0.9, x1: 0.9, z0: 2.0, z1: 5.6 };   // 甲板開口＋樓梯（往船頭爬上）
export const HOLD_Z = [-9.2, 8.6];
export const DECK_Z = [-10.6, 10.8];

export const STATIONS = {
  helm: { x: 0, y: DECK, z: -9.6, look: 0 },
  sail: { x: 0.9, y: DECK, z: -1.0, look: 0 },
  anchor: { x: 0, y: DECK, z: 8.2, look: 0 },
};
export const WHEEL = { x: 0, y: DECK + 1.25, z: -8.8 };
export const MAST = { x: 0, z: -1, h: 15 };
// 前 4 門是基本砲位，後 4 門要升級「加裝大砲」才會啟用
export const CANNONS = [
  { x: 2.45, z: -5.0, side: 1 }, { x: 2.45, z: 5.4, side: 1 },
  { x: -2.45, z: -5.0, side: -1 }, { x: -2.45, z: 5.4, side: -1 },
  { x: 2.4, z: -7.6, side: 1 }, { x: -2.4, z: -7.6, side: -1 },
  { x: 2.45, z: 1.6, side: 1 }, { x: -2.45, z: 1.6, side: -1 },
];
export const CRATES = {
  n: { x: 1.5, y: HOLD, z: -6.6, label: '砲彈' },
  p: { x: -1.5, y: HOLD, z: -6.6, label: '木板' },
  c: { x: 1.5, y: HOLD, z: -4.3, label: '鏈彈' },
  f: { x: -1.5, y: HOLD, z: -4.3, label: '火焰彈' },
  x: { x: 0, y: HOLD, z: 7.0, label: '爆裂彈' },
};
// 船殼剖面（和 3D 模型同一公式）：回傳某個 z 的龍骨高度與頂高
export function hullKeel(z) { return KEEL + Math.max(0, (z - 6) / 6) * 1.8 + Math.max(0, (-9 - z)) * 0.6; }
export function hullTop(z) { return DECK + 0.95 + Math.max(0, (z - 8) / 4) * 0.5 + Math.max(0, (-8 - z) / 3) * 0.8; }
export function hullSectionPt(z, t) {     // t: 0 左舷頂 → 1 右舷頂
  const w = hullW(z), keel = hullKeel(z), top = hullTop(z), a = t * Math.PI, sx = -Math.cos(a), sy = Math.sin(a);
  if (t <= 0 || t >= 1) return [sx * w, top];
  return [w * Math.pow(Math.abs(sx), 0.4) * Math.sign(sx) * (0.55 + 0.45 * (1 - sy * 0.6)), top - (top - keel) * Math.pow(sy, 0.65)];
}
/** 船殼在 (z, y) 處的外側半寬 */
export function hullXAt(z, y) {
  // 由龍骨往上找
  let last = hullSectionPt(z, 0.5);
  for (let k = 1; k <= 14; k++) {
    const p = hullSectionPt(z, 0.5 + k / 28);
    if (p[1] >= y) { const f = (y - last[1]) / ((p[1] - last[1]) || 1); return last[0] + (p[0] - last[0]) * Math.max(0, Math.min(1, f)); }
    last = p;
  }
  return hullW(z);
}
export const LADDERS = [{ x: hullW(0) + 0.12, z: 0, side: 1 }, { x: -hullW(0) - 0.12, z: 0, side: -1 }];

/** 船內的地板高度（給定腳底高度 fy，回傳可站上去的最高面；沒有則 null） */
export function shipFloor(x, fy, z) {
  let best = null;
  const inHatch = x > HATCH.x0 && x < HATCH.x1 && z > HATCH.z0 && z < HATCH.z1;
  const cand = (y) => { if (y <= fy + 0.55 && (best === null || y > best)) best = y; };
  if (!inHatch && z > DECK_Z[0] && z < DECK_Z[1] && Math.abs(x) < deckW(z) + 0.05) cand(DECK);
  if (inHatch) cand(HOLD + (z - HATCH.z0) / (HATCH.z1 - HATCH.z0) * (DECK - HOLD));
  if (z > HOLD_Z[0] && z < HOLD_Z[1] && Math.abs(x) < holdW(z) + 0.05) cand(HOLD);
  return best;
}
/** 把玩家限制在船內牆壁之間；回傳 'over' 表示翻出船外 */
export function shipClamp(p, onFloorY) {
  const inHold = p.y < DECK - 0.6;
  if (inHold) {
    const inHatch = p.x > HATCH.x0 - 0.05 && p.x < HATCH.x1 + 0.05 && p.z > HATCH.z0 && p.z < HATCH.z1;
    if (!inHatch || p.y < HOLD + 0.4) {
      p.z = Math.min(HOLD_Z[1] - 0.3, Math.max(HOLD_Z[0] + 0.3, p.z));
      const w = holdW(p.z) - 0.3; p.x = Math.max(-w, Math.min(w, p.x));
    }
    return null;
  }
  // 甲板：欄杆擋住，除非跳起來越過
  const high = p.y > DECK + 0.75;
  const w = deckW(p.z) - 0.25;
  if (!high) {
    p.z = Math.min(DECK_Z[1] - 0.2, Math.max(DECK_Z[0] + 0.2, p.z));
    const ww = deckW(p.z) - 0.25; p.x = Math.max(-ww, Math.min(ww, p.x));
    // 桅杆
    const mx = p.x - MAST.x, mz = p.z - MAST.z, md = Math.hypot(mx, mz);
    if (md < 0.65) { p.x = MAST.x + mx / (md || 1) * 0.65; p.z = MAST.z + mz / (md || 1) * 0.65; }
    return null;
  }
  if (Math.abs(p.x) > w + 0.6 || p.z > DECK_Z[1] + 0.4 || p.z < DECK_Z[0] - 0.4) return 'over';
  return null;
}
/** 砲彈是否穿過船帆（船內座標） */
export function sailHit(x, y, z, sailAng = 0) {
  if (y < DECK + 4.6 || y > DECK + 13.2) return false;
  const a = sailAng * 0.9, dx = x - MAST.x, dz = z - (MAST.z - 0.35);
  const along = dx * Math.cos(a) - dz * Math.sin(a), across = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(along) < 4.8 && Math.abs(across) < 1.2;
}
/** 砲彈是否打中船殼（船內座標） */
export function hullHit(x, y, z) {
  if (z < STERN - 0.3 || z > BOW + 0.3) return false;
  if (y < KEEL - 0.2 || y > DECK + 1.2) return false;
  return Math.abs(x) < hullW(z) + 0.25;
}
