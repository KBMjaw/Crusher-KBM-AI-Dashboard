/**
 * PIN check for protected settings (Empty feeder speed configuration).
 *
 * Prototype only: verification happens in the browser against a hash in
 * config.js. When FastAPI is connected, POST the PIN to the backend instead
 * and let it decide (and audit) — see docs/API.md.
 */

import { APP } from '../config.js';
import { session } from './storage.js';
import { audit, AUDIT } from '../services/auditService.js';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export const pinGuard = {
  /** Seconds remaining in lockout, 0 when not locked. */
  get lockedFor() {
    const until = session.get('pinLockUntil', 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  },

  /**
   * Returns { ok } or { ok:false, error }.
   * `context` describes what was being unlocked (for the audit log).
   */
  async verify(pin, context = 'Empty feeder speed settings') {
    if (this.lockedFor) return { ok: false, error: `Too many attempts. Try again in ${this.lockedFor} s.` };
    await new Promise((r) => setTimeout(r, 250));
    const ok = /^\d{4}$/.test(pin) && fnv1a(`kbm-pin:${pin}`) === APP.settingsPinHash;
    if (ok) {
      session.set('pinFails', 0);
      audit.record({ action: AUDIT.PIN_VERIFIED, details: `PIN verified to modify ${context}` });
      return { ok: true };
    }
    const fails = session.get('pinFails', 0) + 1;
    session.set('pinFails', fails);
    audit.record({ action: AUDIT.PIN_FAILED, details: `Incorrect PIN while modifying ${context} (attempt ${fails})` });
    if (fails >= APP.pinMaxAttempts) {
      session.set('pinFails', 0);
      session.set('pinLockUntil', Date.now() + APP.pinLockoutSec * 1000);
      return { ok: false, error: `Incorrect PIN. Too many attempts — locked for ${APP.pinLockoutSec} s.` };
    }
    return { ok: false, error: 'Incorrect PIN. Please try again.' };
  },
};
