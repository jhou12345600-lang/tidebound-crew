// ===== 連線層：MQTT 公共伺服器（GitHub Pages 可用）/ 同瀏覽器分頁測試用 BroadcastChannel =====
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const BASE = 'tidebound3d/v1/';

export class MqttNet {
  constructor(room, myId) { this.room = room; this.myId = myId; this.h = {}; }
  on(k, f) { this.h[k] = f; }
  async connect() {
    if (!window.mqtt) throw new Error('連線元件載入失敗（請檢查網路）');
    let lastErr;
    const list = (new URLSearchParams(location.search).get('broker') || '').split(',').filter(Boolean).concat(BROKERS);
    for (const url of list) {
      try { await this._try(url); return; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('連不上伺服器');
  }
  _try(url) {
    return new Promise((res, rej) => {
      const c = window.mqtt.connect(url, { clientId: 'tb_' + this.myId + '_' + Math.random().toString(36).slice(2, 6), clean: true, keepalive: 25, reconnectPeriod: 2000, connectTimeout: 7000 });
      let first = true;
      const to = setTimeout(() => { if (first) { first = false; try { c.end(true); } catch (e) {} rej(new Error('連線逾時')); } }, 8000);
      c.on('connect', () => {
        this.h.status?.('ok');
        c.subscribe(BASE + this.room + '/#', { qos: 0 }, () => { if (first) { first = false; clearTimeout(to); this.c = c; res(); } });
      });
      c.on('reconnect', () => this.h.status?.('reconnecting'));
      c.on('offline', () => this.h.status?.('offline'));
      c.on('error', e => { if (first) { first = false; clearTimeout(to); try { c.end(true); } catch (x) {} rej(e); } });
      c.on('message', (topic, payload) => {
        const k = topic.slice((BASE + this.room + '/').length);
        let m; try { m = JSON.parse(new TextDecoder().decode(payload)); } catch (e) { return; }
        if (m && m._f === this.myId) return;            // 自己發的
        this.h.msg?.(k.split('/')[0], m);
      });
    });
  }
  pub(k, obj) { if (!this.c || !this.c.connected) return; obj._f = this.myId; this.c.publish(BASE + this.room + '/' + k, JSON.stringify(obj), { qos: 0 }); }
  close() { try { this.c && this.c.end(true); } catch (e) {} }
}

export class LocalNet {
  constructor(room, myId) { this.room = room; this.myId = myId; this.h = {}; }
  on(k, f) { this.h[k] = f; }
  connect() { this.bc = new BroadcastChannel('tb3d-' + this.room); this.bc.onmessage = e => { const { k, m } = e.data; if (m._f !== this.myId) this.h.msg?.(k, m); }; this.h.status?.('ok'); return Promise.resolve(); }
  pub(k, obj) { obj._f = this.myId; this.bc.postMessage({ k, m: obj }); }
  close() { this.bc && this.bc.close(); }
}
