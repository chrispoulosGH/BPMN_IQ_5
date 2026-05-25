/**
 * Generate a detailed HTML cost report by app, year, and cost type
 * for all applications in the My_TechFast diagram.
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);

function fmt(n) {
  return n ? '$' + Math.round(n).toLocaleString('en-US') : '—';
}

function lifecycleBadgeColor(lc) {
  const map = {
    build: '#1890ff',
    in_use: '#52c41a',
    in_maintenance: '#faad14',
    propose_to_retire: '#f5222d',
    funded_to_retire: '#cf1322',
    under_evaluation: '#722ed1',
    tracking: '#13c2c2',
  };
  return map[lc] || '#8c8c8c';
}

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const db = mongoose.connection;

  const diag = await db.collection('diagrams').findOne({ name: 'My_TechFast' });
  const appNames = [...new Set(
    diag.tasks.flatMap(t =>
      (t.applications || []).map(a => (typeof a === 'string' ? a : a.name))
    )
  )];

  const apps = await db.collection('applications')
    .find({ name: { $in: appNames } })
    .toArray();

  // Keep diagram order
  const orderedApps = appNames.map(n => apps.find(a => a.name === n)).filter(Boolean);

  await mongoose.disconnect();

  // ── Portfolio totals ──────────────────────────────────────────────────────
  const portfolioOp    = Array(10).fill(0);
  const portfolioDev   = Array(10).fill(0);
  const portfolioTotal = Array(10).fill(0);

  orderedApps.forEach(app => {
    (app.annualTotalCosts || []).forEach((row, i) => {
      portfolioOp[i]    += row.operationCost || 0;
      portfolioDev[i]   += row.developmentCost || 0;
      portfolioTotal[i] += row.totalCost || 0;
    });
  });

  // ── Build app table rows ──────────────────────────────────────────────────
  function appRows(app) {
    const lc = app.lifecycleStatus || 'unknown';
    const color = lifecycleBadgeColor(lc);
    const hasDev = lc === 'build' || lc === 'in_use';
    const rows = [];

    // Operation cost row
    const opCells = YEARS.map((yr, i) => {
      const v = app.annualTotalCosts?.[i]?.operationCost || 0;
      return `<td class="num">${fmt(v)}</td>`;
    }).join('');

    // Dev cost row (only if applicable)
    const devCells = hasDev ? YEARS.map((yr, i) => {
      const v = app.annualTotalCosts?.[i]?.developmentCost || 0;
      return `<td class="num dev">${fmt(v)}</td>`;
    }).join('') : null;

    // Total cost row
    const totCells = YEARS.map((yr, i) => {
      const v = app.annualTotalCosts?.[i]?.totalCost || 0;
      return `<td class="num total">${fmt(v)}</td>`;
    }).join('');

    const appRowspan = hasDev ? 3 : 2;

    rows.push(`
      <tr class="app-row">
        <td rowspan="${appRowspan}" class="app-name">
          ${app.name}
          <span class="badge" style="background:${color}">${lc.replace(/_/g,' ')}</span>
        </td>
        <td class="cost-type oper">Operation</td>
        ${opCells}
      </tr>`);

    if (hasDev) {
      rows.push(`
      <tr>
        <td class="cost-type dev-label">Development</td>
        ${devCells}
      </tr>`);
    }

    rows.push(`
      <tr class="total-row">
        <td class="cost-type total-label">Total</td>
        ${totCells}
      </tr>`);

    return rows.join('');
  }

  // ── HTML ──────────────────────────────────────────────────────────────────
  const yearHeaders = YEARS.map(y => `<th>${y}</th>`).join('');

  const appRowsHtml = orderedApps.map(appRows).join('<tr class="spacer"><td colspan="12"></td></tr>');

  const portOpCells    = portfolioOp.map(v    => `<td class="num">${fmt(v)}</td>`).join('');
  const portDevCells   = portfolioDev.map(v   => `<td class="num dev">${fmt(v)}</td>`).join('');
  const portTotalCells = portfolioTotal.map(v => `<td class="num total">${fmt(v)}</td>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>My_TechFast — Application Cost Report 2016–2025</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
  h1 { color: #58a6ff; font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #8b949e; font-size: 13px; margin-bottom: 24px; }

  /* Summary cards */
  .cards { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; min-width: 180px; }
  .card-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; }
  .card-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .card-value.blue  { color: #58a6ff; }
  .card-value.green { color: #3fb950; }
  .card-value.amber { color: #d29922; }
  .card-value.red   { color: #f85149; }

  /* Table */
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th { background: #1c2128; color: #58a6ff; padding: 8px 10px; text-align: right; white-space: nowrap; border-bottom: 2px solid #30363d; position: sticky; top: 0; z-index: 2; }
  th:first-child, th:nth-child(2) { text-align: left; }
  td { padding: 5px 10px; border-bottom: 1px solid #21262d; vertical-align: middle; }
  td.app-name { font-weight: 600; color: #e6edf3; font-size: 12px; white-space: nowrap; min-width: 200px; max-width: 240px; line-height: 1.4; border-right: 1px solid #30363d; }
  td.cost-type { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; padding-left: 14px; color: #8b949e; }
  td.oper        { color: #58a6ff; }
  td.dev-label   { color: #3fb950; }
  td.total-label { color: #d29922; font-weight: 600; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: #c9d1d9; }
  td.dev   { color: #3fb950; }
  td.total { color: #d29922; font-weight: 600; }
  tr.spacer td { height: 6px; background: #0d1117; border: none; }
  tr.total-row td { background: #1c2128; }
  tr.app-row td { padding-top: 8px; }

  /* Badge */
  .badge { display: inline-block; margin-top: 3px; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; color: #fff; text-transform: uppercase; letter-spacing: .04em; }

  /* Portfolio footer */
  .portfolio-section { margin-top: 32px; }
  .portfolio-section h2 { color: #58a6ff; font-size: 16px; margin-bottom: 12px; }
  tr.port-header td { background: #1c2128; color: #58a6ff; font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 10px; border-top: 2px solid #58a6ff; }
  tr.port-op    td.num { color: #58a6ff; }
  tr.port-dev   td.num { color: #3fb950; }
  tr.port-total td.num { color: #d29922; font-weight: 700; font-size: 13px; }
  tr.port-total td.cost-type { color: #d29922; font-weight: 700; }
  tr.port-total td { background: #21262d; border-top: 1px solid #30363d; }

  /* Legend */
  .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; font-size: 11px; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
</style>
</head>
<body>

<h1>My_TechFast — Application Cost Report</h1>
<div class="subtitle">Annual operation &amp; development costs, 2016–2025 &nbsp;|&nbsp; Generated ${new Date().toLocaleString()}</div>

<div class="cards">
  <div class="card">
    <div class="card-label">Applications</div>
    <div class="card-value blue">${orderedApps.length}</div>
  </div>
  <div class="card">
    <div class="card-label">2025 Portfolio Total</div>
    <div class="card-value amber">${fmt(portfolioTotal[9])}</div>
  </div>
  <div class="card">
    <div class="card-label">2025 Operations</div>
    <div class="card-value blue">${fmt(portfolioOp[9])}</div>
  </div>
  <div class="card">
    <div class="card-label">2025 Development</div>
    <div class="card-value green">${fmt(portfolioDev[9])}</div>
  </div>
  <div class="card">
    <div class="card-label">10-yr Total Spend</div>
    <div class="card-value red">${fmt(portfolioTotal.reduce((a,b)=>a+b,0))}</div>
  </div>
</div>

<div class="legend">
  <span class="legend-item"><span class="legend-dot" style="background:#58a6ff"></span>Operation Cost</span>
  <span class="legend-item"><span class="legend-dot" style="background:#3fb950"></span>Development Cost (build / in_use only)</span>
  <span class="legend-item"><span class="legend-dot" style="background:#d29922"></span>Total Cost</span>
</div>

<div class="wrap">
<table>
  <thead>
    <tr>
      <th>Application</th>
      <th>Cost Type</th>
      ${yearHeaders}
    </tr>
  </thead>
  <tbody>
    ${appRowsHtml}
    <tr class="spacer"><td colspan="12"></td></tr>
    <tr class="port-header">
      <td colspan="2">PORTFOLIO TOTAL — All 34 Applications</td>
      <td colspan="10"></td>
    </tr>
    <tr class="port-op">
      <td class="app-name"></td>
      <td class="cost-type oper">Operation</td>
      ${portOpCells}
    </tr>
    <tr class="port-dev">
      <td class="app-name"></td>
      <td class="cost-type dev-label">Development</td>
      ${portDevCells}
    </tr>
    <tr class="port-total">
      <td class="app-name"></td>
      <td class="cost-type total-label">Total</td>
      ${portTotalCells}
    </tr>
  </tbody>
</table>
</div>

</body>
</html>`;

  const outPath = path.join(__dirname, '..', 'My_TechFast_Cost_Report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`\n✓ Report written to: ${outPath}\n`);
})();
