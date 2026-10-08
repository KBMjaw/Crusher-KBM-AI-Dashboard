/**
 * Data service facade. Views and state code depend only on this module, so
 * switching from demo data to the FastAPI backend is a config change
 * (APP.dataSource) rather than a UI rewrite.
 */

import { APP } from '../config.js';
import { store } from '../core/store.js';
import { mockService } from './mockService.js';
import { apiService } from './apiService.js';

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
        document.dispatchEvent(new CustomEvent('cm:alert', { detail: alert }));
      },
      onConnection(c) {
        store.patch('connection', c);
      },
    });
  },

  stop() { impl.stop(); },

  setControl(body) { return impl.setControl(body); },

  getAnalytics(range) { return impl.getAnalytics(range); },

  refresh() { impl.refresh(); },

  markAlertsRead(ids) {
    const set = ids ? new Set(ids) : null;
    store.patch('alerts', store.state.alerts.map((a) => (!set || set.has(a.id) ? { ...a, read: true } : a)));
  },
};
