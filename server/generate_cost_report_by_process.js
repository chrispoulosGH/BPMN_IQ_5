/**
 * generate_cost_report_by_process.js
 *
 * Generates a detailed HTML cost report organised by business process (task).
 * Data source: businessflows.TechFast.tasks[].applications[].annualCosts
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);
const OUT   = path.join(__dirname, '..', 'TechFast_Process_Cost_Report.html');

function fmt(n) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtM(n) {
  return '$' + (n / 1_000_000).toFixed(2) + 'M';
}

// Colour ramp: low (green) → high (red) within a column
function heatColor(v, min, max) {
  if (!v || max === min) return 'transparent';
  const pct = (v - min) / (max - min);
  const r = Math.round(48  + pct * (248 - 48));
  const g = Math.round(187 - pct * (187 - 81));
  const b = Math.round(90  - pct * (90  - 81));
  return `rgba(${r},${g},${b},0.18)`;
}

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const db = mongoose.connection;

  const bf = await db.collection('businessflows').findOne({ name: 'TechFast_3' });
  if (!bf || !bf.tasks?.length) {
    console.error('No TechFast businessflow task data found. Run migrate_costs_to_businessflow.js first.');
    process.exit(1);
  }

  // Also pull lifecycle status for each app
  const allAppNames = [...new Set(bf.tasks.flatMap(t => t.applications.map(a => a.name)))];
  const appDocs = await db.collection('applications').find(
    { name: { $in: allAppNames } },
    { projection: { name: 1, lifecycleStatus: 1, _id: 0 } }
  ).toArray();
  const lcMap = Object.fromEntries(appDocs.map(a => [a.name, a.lifecycleStatus || 'unknown']));

  await mongoose.disconnect();

  // ── Compute column min/max for heat map ───────────────────────────────────
  // Per-year totals across all task-app combos (for heat normalisation)
  const yearTotals = Array(10).fill(0);
  bf.tasks.forEach(task => {
    task.applications.forEach(app => {
      app.annualCosts.forEach((c, i) => { yearTotals[i] += c.totalCost || 0; });
    });
  });
  const yearMax = Math.max(...yearTotals);
  const yearMin = Math.min(...yearTotals.filter(v => v > 0));

  // ── Per-task totals (all years, all apps) ─────────────────────────────────
  const taskTotals = bf.tasks.map(task => {
    let op = 0, dev = 0, tot = 0;
    task.applications.forEach(app => {
      app.annualCosts.forEach(c => {
        op  += c.operationCost   || 0;
        dev += c.developmentCost || 0;
        tot += c.totalCost       || 0;
      });
    });
    return { name: task.name, op, dev, tot, appCount: task.applications.length };
  });

  // ── Grand portfolio totals ────────────────────────────────────────────────
  const portByYear = YEARS.map((_, yi) => ({
    op:  bf.tasks.reduce((s, t) => s + t.applications.reduce((ss, a) => ss + (a.annualCosts[yi]?.operationCost   || 0), 0), 0),
    dev: bf.tasks.reduce((s, t) => s + t.applications.reduce((ss, a) => ss + (a.annualCosts[yi]?.developmentCost || 0), 0), 0),
    tot: bf.tasks.reduce((s, t) => s + t.applications.reduce((ss, a) => ss + (a.annualCosts[yi]?.totalCost       || 0), 0), 0),
  }));
  const grandOp  = portByYear.reduce((s, r) => s + r.op,  0);
  const grandDev = portByYear.reduce((s, r) => s + r.dev, 0);
  const grandTot = portByYear.reduce((s, r) => s + r.tot, 0);

  // ── Lifecycle badge ───────────────────────────────────────────────────────
  function lcBadge(name) {
    const lc = lcMap[name] || 'unknown';
    const colors = {
      build: '#1890ff', in_use: '#52c41a', in_maintenance: '#faad14',
      propose_to_retire: '#f5222d', funded_to_retire: '#cf1322',
      under_evaluation: '#722ed1', tracking: '#13c2c2',
    };
    const c = colors[lc] || '#8c8c8c';
    return `<span class="badge" style="background:${c}">${lc.replace(/_/g,' ')}</span>`;
  }

  // ── Build per-task section ────────────────────────────────────────────────
  function taskSection(task, taskIdx) {
    const taskTotal = taskTotals[taskIdx];
    if (task.applications.length === 0) {
      return `
      <div class="task-section">
        <div class="task-header">
          <span class="task-num">${String(taskIdx + 1).padStart(2,'0')}</span>
          <span class="task-name">${task.name}</span>
          <span class="task-meta no-apps">No application cost data</span>
        </div>
      </div>`;
    }

    // Per-app, per-year totalCost for heat map normalisation within this task
    const taskAppYearTotals = task.applications.map(a =>
      a.annualCosts.map(c => c.totalCost || 0)
    );
    const flatVals = taskAppYearTotals.flat().filter(v => v > 0);
    const taskMin = flatVals.length ? Math.min(...flatVals) : 0;
    const taskMax = flatVals.length ? Math.max(...flatVals) : 0;

    const yearHeaders = YEARS.map(y => `<th>${y}</th>`).join('');

    // App rows
    const appRows = task.applications.map(app => {
      const opRow  = app.annualCosts.map((c, i) => {
        const bg = heatColor(c.operationCost, taskMin, taskMax);
        return `<td class="num" style="background:${bg}">${fmt(c.operationCost)}</td>`;
      }).join('');
      const devRow = app.annualCosts.map((c, i) => {
        const bg = heatColor(c.developmentCost, taskMin, taskMax);
        return `<td class="num dev" style="background:${bg}">${fmt(c.developmentCost)}</td>`;
      }).join('');
      const totRow = app.annualCosts.map((c, i) => {
        const bg = heatColor(c.totalCost, taskMin, taskMax);
        return `<td class="num total" style="background:${bg}">${fmt(c.totalCost)}</td>`;
      }).join('');

      return `
        <tr class="app-row">
          <td rowspan="3" class="app-name">${app.name}${lcBadge(app.name)}</td>
          <td class="cost-type oper">Operation</td>${opRow}
        </tr>
        <tr>
          <td class="cost-type dev-label">Development</td>${devRow}
        </tr>
        <tr class="total-row">
          <td class="cost-type total-label">Total</td>${totRow}
        </tr>
        <tr class="micro-spacer"><td colspan="12"></td></tr>`;
    }).join('');

    // Task subtotal row
    const subtotalByYear = YEARS.map((_, yi) =>
      task.applications.reduce((s, a) => s + (a.annualCosts[yi]?.totalCost || 0), 0)
    );
    const subtotalCells = subtotalByYear.map((v, i) => {
      const bg = heatColor(v, Math.min(...subtotalByYear.filter(x=>x>0)), Math.max(...subtotalByYear));
      return `<td class="num subtotal" style="background:${bg}">${fmt(v)}</td>`;
    }).join('');

    return `
    <div class="task-section">
      <div class="task-header">
        <span class="task-num">${String(taskIdx + 1).padStart(2,'0')}</span>
        <span class="task-name">${task.name}</span>
        <span class="task-meta">${task.applications.length} app${task.applications.length !== 1 ? 's' : ''} &nbsp;·&nbsp; 10-yr total: <strong>${fmtM(taskTotal.tot)}</strong></span>
      </div>
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th style="min-width:180px">Application</th>
              <th style="min-width:100px">Cost Type</th>
              ${yearHeaders}
            </tr>
          </thead>
          <tbody>
            ${appRows}
            <tr class="subtotal-row">
              <td colspan="2" class="subtotal-label">Task Subtotal</td>
              ${subtotalCells}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Summary bar chart data (sparkline via inline SVG) ─────────────────────
  function miniBar(vals, color) {
    const max = Math.max(...vals);
    const w = 40, h = 20, gap = 2;
    const bw = (w - gap * (vals.length - 1)) / vals.length;
    const bars = vals.map((v, i) => {
      const bh = max ? Math.round((v / max) * h) : 0;
      const x  = i * (bw + gap);
      const y  = h - bh;
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" fill="${color}" rx="1"/>`;
    }).join('');
    return `<svg width="${w}" height="${h}" style="display:block;margin:4px 0">${bars}</svg>`;
  }

  // Task summary cards (top 5 by total cost)
  const sortedTasks = [...taskTotals].sort((a,b) => b.tot - a.tot);

  const summaryCards = sortedTasks.slice(0, 5).map(t => `
    <div class="card">
      <div class="card-label">${t.name}</div>
      <div class="card-value amber">${fmtM(t.tot)}</div>
      <div class="card-sub">${t.appCount} apps &nbsp; Op: ${fmtM(t.op)} &nbsp; Dev: ${fmtM(t.dev)}</div>
    </div>`).join('');

  // Grand portfolio year row
  const portTotCells = portByYear.map(r => `<td class="num total">${fmt(r.tot)}</td>`).join('');
  const portOpCells  = portByYear.map(r => `<td class="num">${fmt(r.op)}</td>`).join('');
  const portDevCells = portByYear.map(r => `<td class="num dev">${fmt(r.dev)}</td>`).join('');

  // All task sections
  const allTaskSections = bf.tasks.map((t, i) => taskSection(t, i)).join('\n');

  // ── Full HTML ─────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>TechFast_3 — Cost Report by Business Process 2016–2025</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
  h1   { color: #58a6ff; font-size: 22px; margin-bottom: 2px; }
  h2   { color: #58a6ff; font-size: 15px; margin: 28px 0 12px; border-bottom: 1px solid #30363d; padding-bottom: 6px; }
  .subtitle { color: #8b949e; font-size: 13px; margin-bottom: 20px; }

  /* Summary cards */
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; min-width: 200px; }
  .card-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .card-value  { font-size: 20px; font-weight: 700; margin-top: 4px; }
  .card-sub    { font-size: 10px; color: #6e7681; margin-top: 3px; }
  .amber { color: #d29922; }
  .blue  { color: #58a6ff; }
  .green { color: #3fb950; }
  .red   { color: #f85149; }

  /* Grand totals summary */
  .grand-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .grand-card  { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; }
  .grand-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; }
  .grand-value { font-size: 24px; font-weight: 700; margin-top: 4px; }

  /* Portfolio table */
  .port-wrap { overflow-x: auto; margin-bottom: 32px; }

  /* Task sections */
  .task-section { margin-bottom: 32px; }
  .task-header  { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .task-num     { background: #30363d; color: #8b949e; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 7px; font-variant-numeric: tabular-nums; }
  .task-name    { font-size: 15px; font-weight: 700; color: #e6edf3; }
  .task-meta    { font-size: 12px; color: #8b949e; margin-left: auto; }
  .task-meta.no-apps { color: #3d444d; font-style: italic; }
  .task-meta strong  { color: #d29922; }

  /* Table */
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; min-width: 900px; }
  th { background: #1c2128; color: #58a6ff; padding: 7px 10px; text-align: right; white-space: nowrap;
       border-bottom: 2px solid #30363d; position: sticky; top: 0; z-index: 2; }
  th:first-child, th:nth-child(2) { text-align: left; }
  td { padding: 4px 10px; border-bottom: 1px solid #21262d; vertical-align: middle; }
  td.app-name   { font-weight: 600; color: #e6edf3; font-size: 11px; min-width: 170px; max-width: 220px;
                  line-height: 1.5; border-right: 1px solid #30363d; vertical-align: top; padding-top: 8px; }
  td.cost-type  { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap;
                  padding-left: 12px; color: #8b949e; width: 100px; }
  td.oper        { color: #58a6ff; }
  td.dev-label   { color: #3fb950; }
  td.total-label { color: #d29922; font-weight: 600; }
  td.subtotal-label { color: #fff; font-weight: 700; font-size: 11px; text-transform: uppercase;
                      letter-spacing: .06em; padding-left: 12px; background: #1c2128; }
  td.num     { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: #c9d1d9; }
  td.dev     { color: #3fb950; }
  td.total   { color: #d29922; font-weight: 600; }
  td.subtotal { color: #fff; font-weight: 700; background: #1c2128 !important; }
  tr.total-row    td { background: #161b22; }
  tr.subtotal-row td { background: #1c2128; border-top: 2px solid #30363d; }
  tr.micro-spacer td { height: 4px; background: #0d1117; border: none; }

  .badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px;
           color: #fff; font-weight: 600; margin-left: 5px; vertical-align: middle; text-transform: capitalize; }

  /* Rank bar */
  .rank-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
  .rank-bar-bg { flex: 1; background: #21262d; border-radius: 3px; height: 14px; overflow: hidden; }
  .rank-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #1d4ed8, #3b82f6); }
  .rank-label { width: 200px; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank-value { width: 90px; text-align: right; color: #d29922; font-weight: 700; font-variant-numeric: tabular-nums; }

  @media print {
    body { background: #fff; color: #000; }
    .task-section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<h1>TechFast_3 — Cost Report by Business Process</h1>
<p class="subtitle">Business Flow: TechFast_3 &nbsp;·&nbsp; 10-Year Window: 2016–2025 &nbsp;·&nbsp; Generated: ${new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})}</p>

<!-- Grand totals -->
<div class="grand-cards">
  <div class="grand-card">
    <div class="grand-label">Total Portfolio Cost (10yr)</div>
    <div class="grand-value amber">${fmtM(grandTot)}</div>
  </div>
  <div class="grand-card">
    <div class="grand-label">Total Operation Cost</div>
    <div class="grand-value blue">${fmtM(grandOp)}</div>
  </div>
  <div class="grand-card">
    <div class="grand-label">Total Development Cost</div>
    <div class="grand-value green">${fmtM(grandDev)}</div>
  </div>
  <div class="grand-card">
    <div class="grand-label">Business Processes</div>
    <div class="grand-value">${bf.tasks.length} <span style="font-size:14px;color:#8b949e">tasks</span></div>
  </div>
</div>

<h2>Top 5 Business Processes by 10-Year Cost</h2>
<div class="cards">${summaryCards}</div>

<h2>Cost Rank — All Business Processes</h2>
<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-bottom:32px">
  ${sortedTasks.map(t => {
    const pct = grandTot ? (t.tot / grandTot * 100) : 0;
    return `
    <div class="rank-row">
      <div class="rank-label">${t.name}</div>
      <div class="rank-bar-bg">
        <div class="rank-bar-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="rank-value">${fmtM(t.tot)}</div>
      <div style="width:40px;text-align:right;font-size:10px;color:#6e7681">${pct.toFixed(1)}%</div>
    </div>`;
  }).join('')}
</div>

<h2>Portfolio Annual Summary</h2>
<div class="port-wrap">
  <table>
    <thead>
      <tr>
        <th style="min-width:180px">Scope</th>
        <th style="min-width:100px">Cost Type</th>
        ${YEARS.map(y => `<th>${y}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      <tr><td class="app-name">All Processes</td><td class="cost-type oper">Operation</td>${portOpCells}</tr>
      <tr><td></td>                               <td class="cost-type dev-label">Development</td>${portDevCells}</tr>
      <tr class="total-row"><td></td>             <td class="cost-type total-label">Total</td>${portTotCells}</tr>
    </tbody>
  </table>
</div>

<h2>Detail by Business Process</h2>
${allTaskSections}

</body>
</html>`;

  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`Report written → ${OUT}`);
  console.log(`Grand total: ${fmtM(grandTot)} over 10 years`);
  console.log(`Tasks with costs: ${bf.tasks.filter(t => t.applications.length > 0).length} of ${bf.tasks.length}`);
})().catch(err => { console.error(err); process.exit(1); });
