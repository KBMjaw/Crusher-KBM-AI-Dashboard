/** Analytics & Reports. */

import { settings } from '../core/settings.js';
import { DataService } from '../services/dataService.js';
import { exportReport } from '../services/reportService.js';
import { icon } from '../ui/icons.js';
import { $, modal, toast } from '../ui/components.js';
import { lineChart, stackedBar, ring, barChart } from '../ui/charts.js';
import { setHTML } from '../ui/widgets.js';
import { FEEDER_STATES } from '../config.js';
import {
  fmtDuration, fmtDate, fmtDateShort, fmtTime, toISODate, fromISODate, esc,
} from '../core/format.js';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'date', label: 'Custom Date' },
  { id: 'daily', label: 'Daily (this month)' },
  { id: 'weekly', label: 'Weekly (last 7 days)' },
  { id: 'range', label: 'Custom Date Range' },
];
const MAX_RANGE_DAYS = 31;

let period = 'today';
let customDate = toISODate(new Date());
let rangeFrom = toISODate(new Date(Date.now() - 6 * 86400000));
let rangeTo = toISODate(new Date());
let data = null;
let reqId = 0;

function resolveRange() {
  const today = new Date();
  const iso = toISODate;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  switch (period) {
    case 'yesterday': { const y = iso(addDays(today, -1)); return { from: y, to: y, label: 'Yesterday' }; }
    case 'date': return { from: customDate, to: customDate, label: 'Custom Date' };
    case 'daily': return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today), label: 'Daily — Month to date' };
    case 'weekly': return { from: iso(addDays(today, -6)), to: iso(today), label: 'Weekly — Last 7 days' };
    case 'range': return { from: rangeFrom, to: rangeTo, label: 'Custom Date Range' };
    default: return { from: iso(today), to: iso(today), label: 'Today' };
  }
}

function validateRange() {
  const today = toISODate(new Date());
  if (period === 'date' && (!customDate || customDate > today)) return 'Choose a date up to today.';
  if (period === 'range') {
    if (!rangeFrom || !rangeTo) return 'Choose both dates.';
    if (rangeFrom > rangeTo) return '“From” must be before “To”.';
    if (rangeTo > today) return 'The range cannot end in the future.';
    const days = (fromISODate(rangeTo) - fromISODate(rangeFrom)) / 86400000 + 1;
    if (days > MAX_RANGE_DAYS) return `Choose at most ${MAX_RANGE_DAYS} days.`;
  }
  return '';
}

async function load(root) {
  const err = validateRange();
  setHTML($('[data-range-err]', root), err ? `<span class="t-red">${esc(err)}</span>` : '');
  if (err) return;
  const id = ++reqId;
  const body = $('[data-body]', root);
  body.classList.add('loading');
  const range = resolveRange();
  const a = await DataService.getAnalytics(range);
  if (id !== reqId || !document.body.contains(body)) return;
  data = a;
  body.classList.remove('loading');
  renderData(root, a);
}

function metric(ic, label, value, sub = '') {
  return `<div class="metric"><div class="eyebrow">${icon(ic, { size: 14 })}${label}</div><div class="metric-val">${value}</div>${sub ? `<div class="metric-sub">${sub}</div>` : ''}</div>`;
}

function renderData(root, a) {
  const s = settings.all;
  const p = a.period;
  const today = toISODate(new Date());
  const span = p.from === p.to ? fmtDate(p.from) : `${fmtDate(p.from)} – ${fmtDate(p.to)}`;
  setHTML($('[data-plabel]', root), `${esc(span)}${p.to === today ? ' · up to now' : ''} · ${p.days} day${p.days === 1 ? '' : 's'} · ${esc(a.source || 'Live data')}`);

  const stTotal = a.states.EMPTY + a.states.PARTIAL + a.states.FULL;
  const pct = (v) => (stTotal ? Math.round((v / stTotal) * 100) : 0);
  const manualSec = a.vfd.manualPeriods.reduce((x, m) => x + m.durationSec, 0);
  const multi = p.days > 1;
  const noData = a.elapsedSec === 0;

  setHTML($('[data-body]', root), noData ? `<section class="card"><div class="banner soft-blue">${icon('info', { size: 18 })}<div><strong>No operating data yet</strong>The plant operating window starts at 06:00. Choose another period.</div></div></section>` : `
    <section class="card">
      <div class="card-head"><div class="card-title">${icon('cpu', { size: 16 })}Production & Operation</div></div>
      <div class="grid-6">
        ${metric('clock', 'Crusher runtime', fmtDuration(a.runtimeSec), `${((a.runtimeSec / Math.max(1, a.elapsedSec)) * 100).toFixed(0)}% of operating time`)}
        ${metric('power', 'Downtime', fmtDuration(a.downtimeSec), `${a.stopEvents.length} stop${a.stopEvents.length === 1 ? '' : 's'}`)}
        ${metric('layers', 'Feeder runtime', fmtDuration(a.feederRuntimeSec))}
        ${metric('zap', 'VFD runtime', fmtDuration(a.vfdRuntimeSec))}
        ${metric('truck', 'Throughput', `${Math.round(a.outputT).toLocaleString('en-IN')}<small>t</small>`, 'Estimated')}
        ${metric('gauge', 'Average rate', `${a.avgTph.toFixed(0)}<small>t/h</small>`, 'While running')}
      </div>
    </section>

    <div class="two-col">
      <div class="stack-y">
        <section class="card">
          <div class="card-head"><div class="card-title">${icon('camera', { size: 16 })}Feeder State Duration · AI</div><span class="subtle" style="font-size:12.5px">Total ${fmtDuration(stTotal)}</span></div>
          ${stackedBar([
            { value: a.states.EMPTY, tone: 'amber', label: 'Empty' },
            { value: a.states.PARTIAL, tone: 'blue', label: 'Partially full' },
            { value: a.states.FULL, tone: 'green', label: 'Full' },
          ])}
          <div class="legend">
            ${['EMPTY', 'PARTIAL', 'FULL'].map((k) => `<div class="legend-item"><span class="sw bg-${FEEDER_STATES[k].tone}"></span>${FEEDER_STATES[k].label}
              <strong>${fmtDuration(a.states[k])}</strong><em>${pct(a.states[k])}% · ${a.detections[k]} detections</em></div>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">${icon('pulse', { size: 16 })}VFD Frequency Trend</div><span class="subtle" style="font-size:12.5px">${multi ? 'Hourly average' : '10-min samples'}</span></div>
          ${lineChart(a.vfd.trend, {
            height: 190, min: 0, max: 50,
            bands: [{ y: s.freqFull, label: `Full ${s.freqFull}` }, { y: s.freqEmpty, label: `Empty ${s.freqEmpty}` }],
            xLabel: (t) => (multi ? fmtDateShort(t) : new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })),
          })}
          <div class="grid-4" style="margin-top:12px">
            ${metric('pulse', 'Average', `${a.vfd.avgHz.toFixed(1)}<small>Hz</small>`)}
            ${metric('minus', 'Minimum', `${a.vfd.minHz.toFixed(0)}<small>Hz</small>`)}
            ${metric('plus', 'Maximum', `${a.vfd.maxHz.toFixed(0)}<small>Hz</small>`)}
            ${metric('hand', 'Manual', `${a.vfd.manualPeriods.length}<small>× · ${fmtDuration(manualSec, { short: true })}</small>`)}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">${icon('hand', { size: 16 })}Manual Override Periods</div></div>
          ${a.vfd.manualPeriods.length ? `<div class="table-scroll"><table class="data-table">
            <thead><tr>${multi ? '<th>Date</th>' : ''}<th>Start</th><th>End</th><th class="num">Duration</th><th class="num">Speed</th></tr></thead>
            <tbody>${a.vfd.manualPeriods.slice(-40).reverse().map((m) => `<tr>${multi ? `<td>${fmtDateShort(m.start)}</td>` : ''}<td>${fmtTime(m.start)}</td><td>${fmtTime(m.end)}</td><td class="num">${fmtDuration(m.durationSec, { short: true })}</td><td class="num"><strong>${m.hz} Hz</strong></td></tr>`).join('')}</tbody>
          </table></div>${a.vfd.manualPeriods.length > 40 ? '<p class="form-note" style="margin-top:8px">Showing latest 40. Full list in the downloaded report.</p>' : ''}` : '<p class="subtle">No manual overrides in this period.</p>'}
        </section>
      </div>

      <div class="stack-y">
        <section class="card">
          <div class="card-head"><div class="card-title">${icon('gauge', { size: 16 })}OEE</div></div>
          <div class="oee-wrap">
            ${ring(a.oee.overall, { tone: a.oee.overall >= 75 ? 'green' : a.oee.overall >= 60 ? 'amber' : 'red', label: `${a.oee.overall.toFixed(1)}%`, sub: 'Overall' })}
            <div class="oee-parts">
              ${[['Availability', a.oee.availability], ['Performance', a.oee.performance], ['Quality', a.oee.quality]].map(([k, v]) => `
                <div class="oee-part"><span class="muted">${k}</span><strong>${v.toFixed(1)}%</strong><div class="meter"><span style="width:${Math.min(100, v)}%"></span></div></div>`).join('')}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">${icon('bell', { size: 16 })}Alerts</div><a class="card-link" href="#/alerts">Open ${icon('chevron', { size: 16 })}</a></div>
          <div class="grid-2 keep">
            ${metric('bell', 'Total', a.alerts.total)}
            ${metric('fault', 'Faults', `<span class="t-red">${a.alerts.fault}</span>`)}
            ${metric('alert', 'Warnings', `<span class="t-amber">${a.alerts.warning}</span>`)}
            ${metric('hand', 'Manual events', a.alerts.manual)}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div class="card-title">${icon('power', { size: 16 })}Stops & Downtime</div></div>
          ${a.stopEvents.length ? a.stopEvents.slice(-8).reverse().map((e) => `
            <div class="kv"><span>${multi ? `${fmtDateShort(e.start)} · ` : ''}${fmtTime(e.start)} · ${esc(e.reason || '')}</span>
            <strong class="${e.type === 'FAULT' ? 't-red' : ''}">${fmtDuration(e.durationSec, { short: true })}</strong></div>`).join('') : '<p class="subtle">No stops in this period.</p>'}
        </section>

        ${multi ? `<section class="card">
          <div class="card-head"><div class="card-title">${icon('truck', { size: 16 })}Daily Production (t)</div></div>
          ${barChart(a.days.slice(-14).map((d) => ({ label: fmtDateShort(d.date).replace(' ', ' '), value: d.outputT })), { unit: 't' })}
        </section>` : ''}
      </div>
    </div>

    ${multi ? `<section class="card">
      <div class="card-head"><div class="card-title">${icon('table', { size: 16 })}Daily Breakdown</div></div>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Date</th><th class="num">Runtime</th><th class="num">Downtime</th><th class="num">Output</th><th class="num">Avg Hz</th><th class="num">OEE</th></tr></thead>
        <tbody>${a.days.slice().reverse().map((d) => `<tr><td>${fmtDate(d.date)}</td><td class="num">${fmtDuration(d.runtimeSec, { short: true })}</td><td class="num">${fmtDuration(d.downtimeSec, { short: true })}</td><td class="num">${Math.round(d.outputT)} t</td><td class="num">${d.avgHz.toFixed(1)}</td><td class="num"><strong>${d.oee.toFixed(1)}%</strong></td></tr>`).join('')}</tbody>
      </table></div>
    </section>` : ''}`);
}

function openDownload() {
  if (!data) return;
  const close = modal({
    title: 'Download Report',
    size: 'sm',
    body: `
      <p class="muted" style="margin-bottom:12px;font-size:14px">${esc(data.period.label)} · ${esc(data.period.from === data.period.to ? fmtDate(data.period.from) : `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`)}</p>
      <div class="eyebrow" style="margin-bottom:8px">Select format</div>
      <div class="radio-list" role="radiogroup">
        <label class="radio-opt"><input type="radio" name="fmt" value="pdf" checked>${icon('file', { size: 20 })}<span><strong>PDF</strong><small>Formatted report with trend chart</small></span></label>
        <label class="radio-opt"><input type="radio" name="fmt" value="excel">${icon('table', { size: 20 })}<span><strong>Excel</strong><small>.xlsx workbook, one sheet per section</small></span></label>
        <label class="radio-opt"><input type="radio" name="fmt" value="csv">${icon('file', { size: 20 })}<span><strong>CSV</strong><small>Plain data for other tools</small></span></label>
      </div>
      <p class="form-note" style="margin-top:12px">Includes runtime, downtime, AI feeder states, VFD frequency, manual overrides, alerts and OEE.</p>`,
    footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-dl>${icon('download', { size: 18 })}Download</button>`,
    onMount(el, done) {
      el.querySelector('.modal-foot [data-close]').onclick = done;
      const btn = el.querySelector('[data-dl]');
      btn.onclick = async () => {
        const fmtSel = el.querySelector('input[name="fmt"]:checked').value;
        btn.disabled = true;
        btn.textContent = 'Preparing…';
        try {
          await exportReport(fmtSel, data);
          toast(`${fmtSel === 'excel' ? 'Excel' : fmtSel.toUpperCase()} report downloaded`, 'success');
          done();
        } catch (e) {
          toast(e.message || 'Report could not be created', 'error');
          btn.disabled = false;
          btn.innerHTML = `${icon('download', { size: 18 })}Download`;
        }
      };
    },
  });
  void close;
}

export default {
  id: 'analytics',
  head: () => ({ title: 'Analytics & Reports', subtitle: 'Production, AI feeder, VFD and OEE' }),

  render(root) {
    const today = toISODate(new Date());
    root.innerHTML = `
      <div class="stack-y">
        <section class="card">
          <div class="period-bar">
            <label class="sr-only" for="period">Report period</label>
            <select id="period" class="select" data-period>${PERIODS.map((p) => `<option value="${p.id}" ${p.id === period ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
            <div class="dates" data-date hidden><input type="date" data-d1 max="${today}" value="${customDate}" aria-label="Date"></div>
            <div class="dates" data-range hidden>
              <input type="date" data-r1 max="${today}" value="${rangeFrom}" aria-label="From date"><span class="subtle">to</span>
              <input type="date" data-r2 max="${today}" value="${rangeTo}" aria-label="To date">
            </div>
            <button class="btn btn-primary btn-sm" data-download style="margin-left:auto">${icon('download', { size: 17 })}Download Report</button>
          </div>
          <div class="period-label" data-plabel></div>
          <div class="period-label" data-range-err></div>
        </section>
        <div class="stack-y" data-body><section class="card subtle">Loading…</section></div>
      </div>`;

    const sync = () => {
      $('[data-date]', root).hidden = period !== 'date';
      $('[data-range]', root).hidden = period !== 'range';
    };
    sync();
    $('[data-period]', root).addEventListener('change', (e) => { period = e.target.value; sync(); load(root); });
    $('[data-d1]', root).addEventListener('change', (e) => { customDate = e.target.value; load(root); });
    $('[data-r1]', root).addEventListener('change', (e) => { rangeFrom = e.target.value; load(root); });
    $('[data-r2]', root).addEventListener('change', (e) => { rangeTo = e.target.value; load(root); });
    $('[data-download]', root).addEventListener('click', openDownload);
    load(root);
  },
};
