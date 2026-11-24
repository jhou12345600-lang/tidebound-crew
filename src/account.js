// ===== 帳號、好友、在線狀態、邀請、存檔 =====
// 沒有自己的伺服器：資料存在 MQTT 公共伺服器的「保留訊息」，並在本機留一份備份（伺服器資料遺失時會自動補回）。
import { BROKERS } from './net.js';
const BASE = 'tidebound3d/v1/';
const enc = new TextEncoder(), dec = new TextDecoder();
/** 帳號名稱 → 主題安全的 key（UTF-8 轉 16 進位，大小寫不分） */
export const keyOf = n => [...enc.encode(n.trim().toLowerCase())].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem('tb_' + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('tb_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('tb_' + k); } catch (e) {} },
};
export const validName = n => /^[\p{L}\p{N}_]{2,12}$/u.test(n);

export class Accounts {
  constructor() { this.h = {}; this.me = null; this.friends = new Map(); this.requests = new Map(); this.invites = new Map(); this.waits = new Map(); }
  on(k, f) { this.h[k] = f; }
  emit(k, ...a) { this.h[k]?.(...a); }
  connect() {
    if (this.ready) return this.ready;
    const list = (new URLSearchParams(location.search).get('broker') || '').split(',').filter(Boolean).concat(BROKERS);
    this.ready = (async () => {
      if (!window.mqtt) throw new Error('連線元件載入失敗');
      let err;
      for (const url of list) { try { await this._try(url); return; } catch (e) { err = e; } }
      throw err || new Error('連不上伺服器');
    })();
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }
  _try(url, will) {
    return new Promise((res, rej) => {
      const c = window.mqtt.connect(url, { clientId: 'tba_' + Math.random().toString(36).slice(2, 10), clean: true, keepalive: 30, reconnectPeriod: 3000, connectTimeout: 7000, will });
      let first = true; const to = setTimeout(() => { if (first) { first = false; try { c.end(true); } catch (e) {} rej(new Error('連線逾時')); } }, 8000);
      c.on('connect', () => { if (first) { first = false; clearTimeout(to); this.c = c; this.url = url; res(); } else this._resub(); });
      c.on('error', e => { if (first) { first = false; clearTimeout(to); try { c.end(true); } catch (x) {} rej(e); } });
      c.on('message', (topic, payload) => this._msg(topic.slice(BASE.length), payload.length ? (() => { try { return JSON.parse(dec.decode(payload)); } catch (e) { return null; } })() : null));
    });
  }
  pub(t, obj, retain = true) { return new Promise(res => { if (this.c && this.c.connected) this.c.publish(BASE + t, obj == null ? '' : JSON.stringify(obj), { qos: 1, retain }, () => res()); else res(); }); }
  sub(t) { this.c && this.c.subscribe(BASE + t, { qos: 1 }); }
  unsub(t) { this.c && this.c.unsubscribe(BASE + t); }
  /** 讀一筆保留訊息（等最多 ms 毫秒） */
  get(t, ms = 1800) {
    return new Promise(res => {
      const done = v => { clearTimeout(tm); this.waits.delete(t); this.unsub(t); res(v); };
      const tm = setTimeout(() => done(undefined), ms);
      this.waits.set(t, done); this.sub(t);
    });
  }
  _msg(t, m) {
    if (this.waits.has(t)) { this.waits.get(t)(m); return; }
    if (!this.me) return;
    const [kind, a, b] = t.split('/');
    if (kind === 'on') { const f = [...this.friends.values()].find(x => x.key === a); if (f) { f.on = m && Date.now() - m.t < 90000 ? m : null; this.emit('friends'); } }
    else if (kind === 'freq' && a === this.me.key) { if (m && m.from) this.requests.set(b, m); else this.requests.delete(b); this.emit('friends'); }
    else if (kind === 'fok' && a === this.me.key && m && m.from) { this._addFriend(m.from); this.pub(`fok/${a}/${b}`, null); this.emit('toast', `🤝 ${m.from} 接受了你的好友邀請！`); }
    else if (kind === 'fdel' && a === this.me.key && m && m.from) { this._removeFriend(m.from, true); this.pub(`fdel/${a}/${b}`, null); }
    else if (kind === 'inv' && a === this.me.key) { if (m && m.room && Date.now() - m.t < 10 * 60000) { this.invites.set(b, m); this.emit('invite', m); } else this.invites.delete(b); }
  }
  async register(name, pw, color) {
    name = name.trim(); if (!validName(name)) throw new Error('帳號要 2–12 個字，只能用中文、英文、數字或底線');
    if (pw.length < 4) throw new Error('密碼至少 4 個字');
    await this.connect();
    const key = keyOf(name), old = await this.get('acct/' + key, 4000);
    if (old && old.h) throw new Error('這個帳號名稱已經有人用了');
    const s = Math.random().toString(36).slice(2, 12), h = await sha(s + ':' + pw);
    const rec = { n: name, s, h, c: color, f: [], t: Date.now() };
    await this.pub('acct/' + key, rec); LS.set('acct_' + key, rec);
    return this._login(rec, pw);
  }
  async login(name, pw) {
    name = name.trim(); await this.connect();
    const key = keyOf(name);
    let rec = await this.get('acct/' + key, 4000); const local = LS.get('acct_' + key);
    if (!rec && local) { rec = local; await this.pub('acct/' + key, rec); }           // 伺服器資料遺失：用本機備份補回
    if (!rec || !rec.h) throw new Error('找不到這個帳號（可以先註冊）');
    if (await sha(rec.s + ':' + pw) !== rec.h) throw new Error('密碼不對');
    if (local && local.t > rec.t && local.h === rec.h) rec = local;
    return this._login(rec, pw);
  }
  async _login(rec, pw) {
    const key = keyOf(rec.n);
    // 重新用「遺囑訊息」連線：斷線時自動清掉在線狀態
    await new Promise(r => { try { this.c.end(false, {}, () => r()); } catch (e) { r(); } setTimeout(r, 1500); });
    await this._try(this.url, { topic: BASE + 'on/' + key, payload: '', retain: true, qos: 1 });
    this.me = { name: rec.n, key, color: rec.c, rec };
    LS.set('acct_' + key, rec); LS.set('session', { n: rec.n, k: key, p: btoa(unescape(encodeURIComponent(pw))) });
    this.friends.clear(); for (const n of rec.f || []) this.friends.set(keyOf(n), { name: n, key: keyOf(n), on: null });
    this._resub(); this.presence(null);
    clearInterval(this._pi); this._pi = setInterval(() => this.presence(this._room, this._host), 30000);
    this.emit('login', this.me); this.emit('friends');
    return this.me;
  }
  _resub() {
    if (!this.me) return;
    const k = this.me.key;
    this.sub(`freq/${k}/+`); this.sub(`fok/${k}/+`); this.sub(`inv/${k}/+`); this.sub(`fdel/${k}/+`);
    for (const f of this.friends.values()) this.sub('on/' + f.key);
  }
  async tryResume() {
    const s = LS.get('session'); if (!s) return null;
    try { return await this.login(s.n, decodeURIComponent(escape(atob(s.p)))); } catch (e) { return null; }
  }
  logout() { if (this.me) this.pub('on/' + this.me.key, null); clearInterval(this._pi); LS.del('session'); this.me = null; this.friends.clear(); this.requests.clear(); try { this.c.end(true); } catch (e) {} this.c = null; this.ready = null; this.emit('logout'); }
  /** 在線狀態：room＝目前所在房號（null 表示在大廳） */
  presence(room, host = false) { this._room = room; this._host = host; if (this.me) this.pub('on/' + this.me.key, { n: this.me.name, c: this.me.color, room, host, t: Date.now() }); }
  _saveRec() { const r = this.me.rec; r.f = [...this.friends.values()].map(f => f.name); r.t = Date.now(); this.pub('acct/' + this.me.key, r); LS.set('acct_' + this.me.key, r); }
  _addFriend(name) { const k = keyOf(name); if (k === this.me.key || this.friends.has(k)) return; this.friends.set(k, { name, key: k, on: null }); this.sub('on/' + k); this._saveRec(); this.emit('friends'); }
  _removeFriend(name, silent) { const k = keyOf(name); if (!this.friends.has(k)) return; this.friends.delete(k); this.unsub('on/' + k); this._saveRec(); this.emit('friends'); if (!silent) this.pub(`fdel/${k}/${this.me.key}`, { from: this.me.name }); }
  async requestFriend(name) {
    name = name.trim(); const k = keyOf(name);
    if (!this.me) throw new Error('請先登入');
    if (k === this.me.key) throw new Error('不能加自己好友');
    if (this.friends.has(k)) throw new Error('已經是好友了');
    const rec = await this.get('acct/' + k, 4000); if (!rec || !rec.h) throw new Error('找不到這個帳號');
    if (this.requests.has(k)) { this.accept(k); return 'accepted'; }   // 對方也申請過我：直接成為好友
    this.pub(`freq/${k}/${this.me.key}`, { from: this.me.name, t: Date.now() });
    return 'sent';
  }
  accept(k) { const r = this.requests.get(k); if (!r) return; this._addFriend(r.from); this.pub(`fok/${k}/${this.me.key}`, { from: this.me.name, t: Date.now() }); this.pub(`freq/${this.me.key}/${k}`, null); this.requests.delete(k); this.emit('friends'); }
  decline(k) { this.pub(`freq/${this.me.key}/${k}`, null); this.requests.delete(k); this.emit('friends'); }
  remove(k) { const f = this.friends.get(k); if (f) this._removeFriend(f.name); }
  invite(k, room) { if (this.me) this.pub(`inv/${k}/${this.me.key}`, { from: this.me.name, room, t: Date.now() }); }
  clearInvite(k) { if (this.me) this.pub(`inv/${this.me.key}/${k}`, null); this.invites.delete(k); }
  // ---- 存檔（房主的船隊進度：金幣、強化、補給）----
  async loadSave() {
    if (!this.me) return null;
    const local = LS.get('save_' + this.me.key), remote = await this.get('save/' + this.me.key, 1500);
    if (remote && (!local || remote.t > local.t)) return remote;
    return local;
  }
  save(data) { if (!this.me) return; const d = { ...data, t: Date.now() }; LS.set('save_' + this.me.key, d); this.pub('save/' + this.me.key, d); }
}
