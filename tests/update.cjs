/**
 * PWA update-flow + upgrade tests.
 *   node tests/update.cjs
 * Serves a temporary copy of the app, "deploys" a new version while the app
 * is open, and checks the banner flow. Also checks that upgrading an install
 * that has old example audit entries removes them but keeps real records.
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-upd-'));
const PORT = 8091; const BASE = `http://localhost:${PORT}`;
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? `  — ${info}` : ''}`); };
const wait = (p, ms = 400) => p.waitForTimeout(ms);

execSync(`cp -r "${ROOT}/." "${TMP}/" && rm -rf "${TMP}/.git"`);
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: TMP, stdio: 'ignore' });

(async () => {
  for (let i = 0; i < 50; i++) { try { execSync(`curl -s ${BASE} >/dev/null`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));

  /* Upgrade from an install that had example audit entries */
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('cm.audit', JSON.stringify([
      { id: 'seed-1', ts: new Date().toISOString(), username: 'admin', role: 'Administrator', ip: '192.168.1.105', action: 'LOGIN', details: 'example', prev: '', next: '', source: 'demo-seed' },
      { id: 'a-real', ts: new Date().toISOString(), username: 'admin', role: 'Administrator', ip: '192.168.1.112', action: 'PASSWORD_CHANGED', details: 'real', prev: '', next: '', source: 'device-demo' },
    ]));
  });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.fill('input[name=username]', 'admin'); await p.fill('input[name=password]', '12345');
  await p.click('button[type=submit]'); await wait(p, 1000);
  const audit = await p.evaluate(() => JSON.parse(localStorage.getItem('cm.audit')));
  check('Upgrade: example audit entries removed', !audit.some((r) => r.source === 'demo-seed'));
  check('Upgrade: real records kept and marked simulated/unverified', audit.some((r) => r.id === 'a-real' && r.ipSimulated === true && r.verified === false));

  /* Update banner */
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await p.reload({ waitUntil: 'networkidle' }); await wait(p, 800);
  check('Service worker controls the page', await p.evaluate(() => !!navigator.serviceWorker.controller));
  await p.evaluate(() => { window.__notReloaded = true; });
  // "Deploy" a new version.
  const sw = fs.readFileSync(path.join(TMP, 'sw.js'), 'utf8').replace(/const VERSION = '([^']+)'/, "const VERSION = 'cm-test-next'");
  fs.writeFileSync(path.join(TMP, 'sw.js'), sw);
  await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await p.waitForSelector('.update-banner', { timeout: 15000 }).catch(() => {});
  check('Banner "New version available" appears', (await p.textContent('.update-banner').catch(() => '')).includes('New version available'));
  await wait(p, 1500);
  check('App is not reloaded automatically', await p.evaluate(() => window.__notReloaded === true));
  // Unsaved work: pending manual speed on Machine screen.
  await p.evaluate(() => { location.hash = '#/machine'; }); await wait(p, 700);
  await p.click('details.demo summary'); await p.uncheck('[data-demo-cycle]');
  await p.click('[data-demo-ai] button[data-v=EMPTY]'); await wait(p);
  await p.click('[data-mode=MANUAL]'); await wait(p, 600);
  await p.$eval('[data-step="1"]', (el) => el.scrollIntoView({ block: 'center' }));
  await p.click('[data-step="1"]'); await wait(p);
  await p.click('.update-banner [data-reload]'); await wait(p, 400);
  check('Reload with unsaved work asks first', (await p.textContent('.confirm-msg').catch(() => '')).includes('not yet applied'));
  await p.click('.modal [data-act=cancel]'); await wait(p, 400);
  check('"Keep working" keeps app and pending change', await p.evaluate(() => window.__notReloaded === true) && (await p.textContent('[data-pending]')).includes('Pending'));
  await p.click('.update-banner [data-reload]'); await wait(p, 300);
  await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => {}), p.click('.modal [data-act=ok]')]);
  await wait(p, 1500);
  check('Reload after confirm loads the new version', await p.evaluate(async () => window.__notReloaded === undefined && (await caches.keys()).includes('cm-test-next')));
  check('Old cache removed after update', await p.evaluate(async () => (await caches.keys()).length === 1));
  check('No banner after updating', !(await p.isVisible('.update-banner')));
  check('No JavaScript errors', errors.length === 0, errors.join(' | '));

  await b.close(); server.kill(); fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); server.kill(); process.exit(2); });
