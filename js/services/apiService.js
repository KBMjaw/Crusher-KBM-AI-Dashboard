/**
 * Real backend implementation (FastAPI on the Raspberry Pi 5).
 * NOT ACTIVE in the prototype — enable by setting APP.dataSource = 'api'.
 *
 * The browser never talks to the VFD directly:
 *   PWA ──REST/WebSocket──▶ FastAPI ──▶ VFD controller ──RS485/Modbus RTU──▶ ABB ACS580
 *
 * Endpoint contract: see docs/API.md.
 */

import { APP } from '../config.js';
import { auth } from '../core/auth.js';

let ws = null;
let handlers = {};
let retry = 0;
let retryTimer = null;

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const token = auth.user?.token;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request(path, opts = {}) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${APP.apiBase}${path}`, { ...opts, headers: headers(), signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function connect() {
  const url = APP.apiBase.replace(/^http/, 'ws') + APP.wsPath;
  ws = new WebSocket(url);
  ws.onopen = () => { retry = 0; };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'live') handlers.onLive?.(msg.data, { trendSample: true });
    if (msg.type === 'alert') handlers.onAlert?.(msg.data);
  };
  ws.onclose = () => {
    handlers.onConnection?.({ online: false });
    retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
  };
}

export const apiService = {
  name: 'api',

  async start(h) {
    handlers = h;
    const live = await request('/api/v1/live');
    handlers.onLive?.(live, { trendSample: false });
    const trend = await request('/api/v1/vfd/trend?minutes=10');
    handlers.onTrendSeed?.(trend);
    connect();
  },

  stop() {
    clearTimeout(retryTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
  },

  getAlerts() {
    return request('/api/v1/alerts?limit=100');
  },

  getAnalytics({ from, to, label }) {
    return request(`/api/v1/analytics?from=${from}&to=${to}&label=${encodeURIComponent(label)}`);
  },

  async setControl(body) {
    try {
      await request('/api/v1/feeder/control', { method: 'POST', body: JSON.stringify(body) });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Command not accepted: ${e.message}` };
    }
  },

  refresh() {},

  demo: null,
};
