/**
 * Data service facade. Views and state code depend only on this module, so
 * switching from demo data to the FastAPI backend is a config change
 * (APP.dataSource) rather than a UI rewrite.
 */

import { APP } from '../config.js';
import { store } from '../core/store.js';
import { mockService } from './mockService.js';
import { apiService } from './apiService.js';
import { audit } from './auditService.js';

const impl = APP.dataSource === 'api' ? apiService : mockService;
const MAX_TREND = 120;
const MAX_ALERTS = 200;

export const DataService = {
  get source() { return impl.name; },
  get demo() { return impl.demo; },

  async start() {
    const alerts = await impl.getAlerts();
    store.patch('alerts', alerts);
    await impl.start({
      onLive(snap, { trendSample }) {
        const st = store.state;
        st.connection = { ...st.connection, ...snap.connection, lastUpdate: snap.timestamp };
        st.crusher = { ...st.crusher, ...snap.crusher };
        st.feeder = { ...st.feeder, ...snap.feeder };
        st.vfd = { ...st.vfd, ...snap.vfd };
        if (trendSample) {
          st.trend = [...st.trend, { t: Date.parse(snap.timestamp), hz: snap.vfd.outputHz }].slice(-MAX_TREND);
        }
        store.emit('live');
      },
      onTrendSeed(points) {
        store.patch('trend', points.slice(-MAX_TREND));
      },
      onAlert(alert) {
        store.patch('alerts', [alert, ...store.state.alerts].slice(0, MAX_ALERTS));
        if (alert.type === 'MANUAL_OVERRIDE_AUTO_REVERT') {
          audit.record({ action: 'MANUAL_OVERRIDE_DISABLED', details: `${alert.description} (by system)`, prev: 'MANUAL', next: `AUTO · ${store.state.vfd.commandHz} Hz`, username: 'system', role: 'Automation' });
        }
        document.dispatchEvent(new CustomEvent('cm:alert', { detail: alert }));
      },
      onConnection(c) {
        store.patch('connection', c);
      },
    });
  },

  stop() { impl.stop(); },

  /** Operator control request; successful changes are written to the audit log. */
  async setControl(body) {
    const before = { ...store.state.vfd };
    const ai = store.state.feeder.aiState;
    const res = await impl.setControl(body);
    if (!res.ok) return res;
    const after = store.state.vfd;
    const ctx = `State ${ai} · Control ${after.mode}`;
    if (before.mode !== 'MANUAL' && after.mode === 'MANUAL') {
      audit.record({ action: 'MANUAL_OVERRIDE_ENABLED', details: `Empty feeder manual control enabled · VFD ${after.commandHz} Hz · State ${ai}`, prev: `AUTO · ${before.commandHz} Hz`, next: `MANUAL · ${after.commandHz} Hz` });
    } else if (before.mode === 'MANUAL' && after.mode !== 'MANUAL') {
      audit.record({ action: 'MANUAL_OVERRIDE_DISABLED', details: `Manual control disabled by operator · State ${ai}`, prev: `MANUAL · ${before.commandHz} Hz`, next: `AUTO · ${after.commandHz} Hz` });
    } else if (after.mode === 'MANUAL' && before.manualHz !== after.manualHz) {
      audit.record({ action: 'EMPTY_SPEED_CHANGED', details: ctx, prev: `${before.manualHz} Hz`, next: `${after.manualHz} Hz` });
    }
    return res;
  },

  getAnalytics(range) { return impl.getAnalytics(range); },

  refresh() { impl.refresh(); },

  markAlertsRead(ids) {
    const set = ids ? new Set(ids) : null;
    store.patch('alerts', store.state.alerts.map((a) => (!set || set.has(a.id) ? { ...a, read: true } : a)));
  },
};
