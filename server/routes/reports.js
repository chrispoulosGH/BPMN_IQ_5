const express = require('express');
const router  = express.Router();
const { Application } = require('../models/ReferenceData');
const Server = require('../models/Server');
const DatabaseInstance = require('../models/DatabaseInstance');
const { getNeighborhoodName } = require('../utils/neighborhoodScope');
const { loadScopedFlowCostDocumentsFromComponentsAndDiagrams } = require('../utils/flowCostSource');

const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);

function fmt(n) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtM(n) {
  return '$' + (n / 1_000_000).toFixed(2) + 'M';
}
function heatColor(v, min, max) {
  if (!v || max === min) return 'transparent';
  const pct = (v - min) / (max - min);
  const r = Math.round(48  + pct * (248 - 48));
  const g = Math.round(187 - pct * (187 - 81));
  const b = Math.round(90  - pct * (90  - 81));
  return `rgba(${r},${g},${b},0.18)`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severityColor(severity) {
  const key = normalizeKey(severity);
  if (key === 'critical') return '#f85149';
  if (key === 'high') return '#ff7b72';
  if (key === 'medium') return '#d29922';
  if (key === 'low') return '#3fb950';
  return '#8b949e';
}

function collectVulnerabilityNotes(healthNotes) {
  return (Array.isArray(healthNotes) ? healthNotes : []).filter((note) => {
    const vulnerabilities = Array.isArray(note?.vulnerabilities) ? note.vulnerabilities.filter(Boolean) : [];
    return vulnerabilities.length > 0;
  });
}

function buildApplicationIndex(applications) {
  const map = new Map();
  for (const app of applications) {
    for (const candidate of [app?.correlationId, app?.acronym, app?.name]) {
      const key = normalizeKey(candidate);
      if (key && !map.has(key)) map.set(key, app);
    }
  }
  return map;
}

function assetMatchesApplication(asset, applicationRef, type) {
  const identifiers = new Set([
    normalizeKey(applicationRef?.rawName),
    normalizeKey(applicationRef?.name),
    normalizeKey(applicationRef?.correlationId),
    normalizeKey(applicationRef?.acronym),
  ].filter(Boolean));

  if (!identifiers.size) return false;

  const candidates = new Set();
  for (const linked of Array.isArray(asset?.linkedApplications) ? asset.linkedApplications : []) {
    candidates.add(normalizeKey(linked?.name));
    candidates.add(normalizeKey(linked?.correlationId));
    candidates.add(normalizeKey(linked?.acronym));
  }

  if (type === 'database') {
    candidates.add(normalizeKey(asset?.applicationName));
    candidates.add(normalizeKey(asset?.applicationCorrelationId));
    candidates.add(normalizeKey(asset?.applicationAcronym));
  }

  for (const candidate of candidates) {
    if (candidate && identifiers.has(candidate)) return true;
  }
  return false;
}

function formatServerFinding(server) {
  const notes = collectVulnerabilityNotes(server?.healthNotes);
  if (!notes.length) return null;
  const detailBits = [server?.hostName, server?.ipAddress, server?.os].map(normalizeText).filter(Boolean);
  return {
    key: server?._id || server?.sourceKey || server?.name,
    title: normalizeText(server?.name) || 'Unnamed Server',
    subtitle: detailBits.join(' · '),
    notes,
  };
}

function formatDatabaseFinding(database) {
  const notes = collectVulnerabilityNotes(database?.healthNotes);
  if (!notes.length) return null;
  const detailBits = [database?.instanceName, database?.vendor, database?.version].map(normalizeText).filter(Boolean);
  return {
    key: database?._id || database?.sourceKey || database?.name,
    title: normalizeText(database?.name) || normalizeText(database?.instanceName) || 'Unnamed Database',
    subtitle: detailBits.join(' · '),
    notes,
  };
}

function countFindingItems(findings) {
  return (Array.isArray(findings) ? findings : []).reduce((sum, finding) => {
    return sum + (Array.isArray(finding?.notes) ? finding.notes.reduce((noteSum, note) => {
      const vulnerabilities = Array.isArray(note?.vulnerabilities) ? note.vulnerabilities.filter(Boolean) : [];
      return noteSum + vulnerabilities.length;
    }, 0) : 0);
  }, 0);
}

function renderAssetFindings(findings, emptyLabel) {
  if (!findings.length) {
    return `<div class="empty-state">${escapeHtml(emptyLabel)}</div>`;
  }

  return findings.map((finding) => `
    <div class="asset-card">
      <div class="asset-title">${escapeHtml(finding.title)}</div>
      ${finding.subtitle ? `<div class="asset-subtitle">${escapeHtml(finding.subtitle)}</div>` : ''}
      ${finding.notes.map((note) => `
        <div class="note-card">
          <div class="note-header">
            <span class="severity-pill" style="background:${severityColor(note.severity)}">${escapeHtml(note.severity || 'info')}</span>
            <span class="note-label">${escapeHtml(note.label || 'Vulnerability Note')}</span>
          </div>
          <div class="note-body">${escapeHtml(note.note || '')}</div>
          ${note.vulnerabilities?.length ? `
            <ul class="vuln-list">
              ${note.vulnerabilities.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>` : ''}
          }
          ${note.sourceUrl ? `<div class="note-source">Source: <a href="${escapeHtml(note.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(note.sourceUrl)}</a></div>` : ''}
        </div>`).join('')}
    </div>`).join('');
}

function getAnnualCostTotal(annualCosts) {
  return (Array.isArray(annualCosts) ? annualCosts : []).reduce((sum, entry) => sum + (entry?.totalCost || 0), 0);
}

function normalizeCostKeyPart(value) {
  return String(value || '').trim().toLowerCase();
}

function buildUniqueFlowTaskAppCostRows(flowDoc) {
  const flowName = normalizeText(flowDoc?.name);
  const byCompositeKey = new Map();

  for (const task of Array.isArray(flowDoc?.tasks) ? flowDoc.tasks : []) {
    const taskName = normalizeText(task?.name);
    if (!taskName) continue;

    for (const app of Array.isArray(task?.applications) ? task.applications : []) {
      const appName = normalizeText(app?.name);
      if (!appName) continue;

      const key = `${normalizeCostKeyPart(flowName)}|||${normalizeCostKeyPart(taskName)}|||${normalizeCostKeyPart(appName)}`;
      if (!byCompositeKey.has(key)) {
        byCompositeKey.set(key, {
          businessFlow: flowName,
          task: taskName,
          application: appName,
          annualCosts: Array.from({ length: YEARS.length }, (_, index) => ({
            year: YEARS[index],
            operationCost: 0,
            developmentCost: 0,
            totalCost: 0,
          })),
        });
      }

      const row = byCompositeKey.get(key);
      for (let i = 0; i < YEARS.length; i += 1) {
        const entry = app?.annualCosts?.[i];
        if (!entry) continue;
        row.annualCosts[i].operationCost += Number(entry.operationCost || 0);
        row.annualCosts[i].developmentCost += Number(entry.developmentCost || 0);
        row.annualCosts[i].totalCost += Number(entry.totalCost || 0);
      }
    }
  }

  return [...byCompositeKey.values()];
}

function getBusinessFlowCostTotals(flowDoc) {
  const uniqueRows = buildUniqueFlowTaskAppCostRows(flowDoc);
  const tasks = new Set(uniqueRows.map((row) => row.task));
  const applicationCount = uniqueRows.length;
  const totalCost = uniqueRows.reduce((sum, row) => sum + getAnnualCostTotal(row.annualCosts), 0);

  return { taskCount: tasks.size, applicationCount, totalCost };
}

function buildCostSummaryPayload(flowDocs) {
  const flows = (Array.isArray(flowDocs) ? flowDocs : [])
    .map((doc) => ({
      name: normalizeText(doc?.name) || 'Unnamed Business Flow',
      ...getBusinessFlowCostTotals(doc),
    }))
    .filter((flow) => flow.totalCost > 0)
    .sort((a, b) => b.totalCost - a.totalCost || a.name.localeCompare(b.name));

  const totalPortfolioCost = flows.reduce((sum, flow) => sum + flow.totalCost, 0);
  const totalTaskCount = flows.reduce((sum, flow) => sum + flow.taskCount, 0);
  const totalApplicationCount = flows.reduce((sum, flow) => sum + flow.applicationCount, 0);

  return {
    flows,
    totalPortfolioCost,
    totalTaskCount,
    totalApplicationCount,
  };
}

/**
 * GET /api/reports/business-flows
 * Returns all business flows that have at least one task with application cost data.
 */
router.get('/business-flows', async (req, res) => {
  try {
    const docs = await loadScopedFlowCostDocumentsFromComponentsAndDiagrams(req);
    const names = buildCostSummaryPayload(docs).flows.map((flow) => flow.name);
    res.json(names.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/cost-summary-data
 * Returns ranked business flow cost summary data for interactive UI rendering.
 */
router.get('/cost-summary-data', async (req, res) => {
  try {
    const docs = await loadScopedFlowCostDocumentsFromComponentsAndDiagrams(req);

    const summary = buildCostSummaryPayload(docs);
    if (!summary.flows.length) {
      return res.status(404).json({ error: 'No business flow cost data found.' });
    }

    res.json({
      generatedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      ...summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/cost-summary
 * Generates and returns an HTML summary report ranking all business flows by total cost.
 */
router.get('/cost-summary', async (req, res) => {
  try {
    const docs = await loadScopedFlowCostDocumentsFromComponentsAndDiagrams(req);

    const {
      flows: rankedFlows,
      totalPortfolioCost,
      totalTaskCount,
      totalApplicationCount,
    } = buildCostSummaryPayload(docs);

    if (!rankedFlows.length) {
      return res.status(404).json({ error: 'No business flow cost data found.' });
    }

    const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const topFiveCards = rankedFlows.slice(0, 5).map((flow, index) => `
      <div class="summary-card">
        <div class="summary-rank">#${index + 1}</div>
        <div class="summary-name">${escapeHtml(flow.name)}</div>
        <div class="summary-value">${fmtM(flow.totalCost)}</div>
        <div class="summary-meta">${flow.taskCount} tasks · ${flow.applicationCount} app links</div>
      </div>`).join('');

    const sidebarRows = rankedFlows.map((flow, index) => {
      const pct = totalPortfolioCost ? (flow.totalCost / totalPortfolioCost * 100) : 0;
      const detailHref = `/api/reports/cost-by-process?businessFlow=${encodeURIComponent(flow.name)}`;
      return `
        <a class="rank-link" href="${detailHref}">
          <div class="rank-index">${index + 1}</div>
          <div class="rank-label">${escapeHtml(flow.name)}</div>
          <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="rank-value">${fmtM(flow.totalCost)}</div>
        </a>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Business Flow Cost Summary Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
  h1 { color: #58a6ff; font-size: 24px; margin: 0 0 4px; }
  h2 { color: #58a6ff; font-size: 15px; margin: 0 0 12px; }
  p { margin: 0; }
  .subtitle { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
  .layout { display: grid; grid-template-columns: minmax(340px, 420px) minmax(0, 1fr); gap: 20px; align-items: start; }
  .panel { background: #161b22; border: 1px solid #30363d; border-radius: 12px; }
  .sidebar { padding: 16px; position: sticky; top: 24px; }
  .sidebar-note { color: #8b949e; font-size: 12px; margin-bottom: 14px; }
  .rank-list { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 120px); overflow-y: auto; padding-right: 4px; }
  .rank-link { display: grid; grid-template-columns: 28px minmax(0, 1fr) minmax(110px, 1fr) 88px; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 10px; text-decoration: none; color: inherit; background: #0f1720; border: 1px solid #263040; transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease; }
  .rank-link:hover { background: #172030; border-color: #3b82f6; transform: translateX(2px); }
  .rank-index { color: #8b949e; font-size: 12px; font-weight: 700; text-align: center; }
  .rank-label { color: #e6edf3; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank-bar-bg { background: #21262d; border-radius: 999px; height: 14px; overflow: hidden; }
  .rank-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #1d4ed8, #60a5fa); }
  .rank-value { color: #d29922; text-align: right; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .content { padding: 20px; display: flex; flex-direction: column; gap: 20px; }
  .hero { display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)); gap: 12px; }
  .hero-card, .summary-card { background: #0f1720; border: 1px solid #263040; border-radius: 12px; padding: 16px; }
  .hero-label, .summary-rank { color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .hero-value { color: #e6edf3; font-size: 26px; font-weight: 700; margin-top: 4px; }
  .hero-value.amber { color: #d29922; }
  .hero-value.blue { color: #58a6ff; }
  .hero-value.green { color: #3fb950; }
  .hero-sub { color: #8b949e; font-size: 11px; margin-top: 4px; }
  .top-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
  .summary-name { color: #e6edf3; font-size: 14px; font-weight: 700; margin-top: 8px; }
  .summary-value { color: #d29922; font-size: 22px; font-weight: 700; margin-top: 6px; }
  .summary-meta { color: #8b949e; font-size: 11px; margin-top: 4px; }
  .instruction { color: #8b949e; font-size: 13px; line-height: 1.5; }
  @media (max-width: 1100px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { position: static; }
    .hero { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<h1>Business Flow Cost Summary Report</h1>
<p class="subtitle">Ranked 10-year cost summary across all business flows · Generated: ${generatedDate}</p>

<div class="layout">
  <aside class="panel sidebar">
    <h2>Cost Rank Sidebar</h2>
    <p class="sidebar-note">Select any business flow to open its detailed Business Flow Cost Report.</p>
    <div class="rank-list">${sidebarRows}</div>
  </aside>

  <section class="panel content">
    <div class="hero">
      <div class="hero-card">
        <div class="hero-label">Business Flows</div>
        <div class="hero-value blue">${rankedFlows.length}</div>
        <div class="hero-sub">Flows with cost data</div>
      </div>
      <div class="hero-card">
        <div class="hero-label">Portfolio Cost</div>
        <div class="hero-value amber">${fmtM(totalPortfolioCost)}</div>
        <div class="hero-sub">10-year aggregate total</div>
      </div>
      <div class="hero-card">
        <div class="hero-label">Coverage</div>
        <div class="hero-value green">${totalTaskCount}</div>
        <div class="hero-sub">Tasks · ${totalApplicationCount} application links</div>
      </div>
    </div>

    <div>
      <h2>Top 5 Business Flows by Total Cost</h2>
      <div class="top-grid">${topFiveCards}</div>
    </div>

    <div>
      <h2>How to Use This Report</h2>
      <p class="instruction">The left sidebar ranks every business flow by its total 10-year cost. Each row is an active link to the existing detailed Business Flow Cost Report for that flow, so this summary acts as the portfolio entry point and the current report remains the drill-down view.</p>
    </div>
  </section>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/cost-by-process?businessFlow=TechFast_3
 * Generates and returns the detailed HTML cost report for the given business flow.
 */
router.get('/cost-by-process', async (req, res) => {
  const bfName = req.query.businessFlow;
  if (!bfName) return res.status(400).json({ error: 'businessFlow query param required' });

  try {
    const docs = await loadScopedFlowCostDocumentsFromComponentsAndDiagrams(req);
    const normalizedBfName = normalizeKey(bfName);
    const bf = docs.find((doc) => normalizeKey(doc?.name) === normalizedBfName);
    if (!bf || !bf.tasks?.length) {
      return res.status(404).json({ error: `Business flow "${bfName}" has no task cost data.` });
    }

    const lcMap = {};

    // Totals
    const taskTotals = bf.tasks.map(task => {
      let op = 0, dev = 0, tot = 0;
      const uniqueRows = buildUniqueFlowTaskAppCostRows({ name: bf.name, tasks: [task] });
      uniqueRows.forEach((row) => {
        row.annualCosts.forEach((c) => {
          op  += c.operationCost   || 0;
          dev += c.developmentCost || 0;
          tot += c.totalCost       || 0;
        });
      });
      return { name: task.name, op, dev, tot, appCount: uniqueRows.length };
    });

    const uniqueFlowRows = buildUniqueFlowTaskAppCostRows(bf);
    const rowsByTask = new Map();
    for (const row of uniqueFlowRows) {
      const key = normalizeCostKeyPart(row.task);
      if (!rowsByTask.has(key)) rowsByTask.set(key, []);
      rowsByTask.get(key).push(row);
    }

    const portByYear = YEARS.map((_, yi) => ({
      op:  uniqueFlowRows.reduce((sum, row) => sum + (row.annualCosts[yi]?.operationCost || 0), 0),
      dev: uniqueFlowRows.reduce((sum, row) => sum + (row.annualCosts[yi]?.developmentCost || 0), 0),
      tot: uniqueFlowRows.reduce((sum, row) => sum + (row.annualCosts[yi]?.totalCost || 0), 0),
    }));
    const grandOp  = portByYear.reduce((s, r) => s + r.op,  0);
    const grandDev = portByYear.reduce((s, r) => s + r.dev, 0);
    const grandTot = portByYear.reduce((s, r) => s + r.tot, 0);

    const lcBadge = (name) => {
      const lc = lcMap[name] || 'unknown';
      const colors = {
        build: '#1890ff', in_use: '#52c41a', in_maintenance: '#faad14',
        propose_to_retire: '#f5222d', funded_to_retire: '#cf1322',
        under_evaluation: '#722ed1', tracking: '#13c2c2',
      };
      const c = colors[lc] || '#8c8c8c';
      return `<span class="badge" style="background:${c}">${lc.replace(/_/g,' ')}</span>`;
    };

    const taskSection = (task, taskIdx) => {
      const taskTotal = taskTotals[taskIdx];
      const taskRows = rowsByTask.get(normalizeCostKeyPart(task.name)) || [];
      if (!taskRows.length) {
        return `
        <div class="task-section">
          <div class="task-header">
            <span class="task-num">${String(taskIdx + 1).padStart(2,'0')}</span>
            <span class="task-name">${task.name}</span>
            <span class="task-meta no-apps">No application cost data</span>
          </div>
        </div>`;
      }
      const flatVals = taskRows.flatMap((row) => row.annualCosts.map((c) => c.totalCost || 0)).filter((v) => v > 0);
      const taskMin  = flatVals.length ? Math.min(...flatVals) : 0;
      const taskMax  = flatVals.length ? Math.max(...flatVals) : 0;

      const yearHeaders = YEARS.map(y => `<th>${y}</th>`).join('');
      const appRows = taskRows.map((row) => {
        const opRow  = row.annualCosts.map((c) => `<td class="num" style="background:${heatColor(c.operationCost, taskMin, taskMax)}">${fmt(c.operationCost)}</td>`).join('');
        const devRow = row.annualCosts.map((c) => `<td class="num dev" style="background:${heatColor(c.developmentCost, taskMin, taskMax)}">${fmt(c.developmentCost)}</td>`).join('');
        const totRow = row.annualCosts.map((c) => `<td class="num total" style="background:${heatColor(c.totalCost, taskMin, taskMax)}">${fmt(c.totalCost)}</td>`).join('');
        return `
          <tr class="app-row">
            <td rowspan="3" class="app-name">${row.application}${lcBadge(row.application)}</td>
            <td class="cost-type oper">Operation</td>${opRow}
          </tr>
          <tr><td class="cost-type dev-label">Development</td>${devRow}</tr>
          <tr class="total-row"><td class="cost-type total-label">Total</td>${totRow}</tr>
          <tr class="micro-spacer"><td colspan="12"></td></tr>`;
      }).join('');

      const subtotalByYear = YEARS.map((_, yi) =>
        taskRows.reduce((sum, row) => sum + (row.annualCosts[yi]?.totalCost || 0), 0)
      );
      const subMin = Math.min(...subtotalByYear.filter(x => x > 0));
      const subMax = Math.max(...subtotalByYear);
      const subtotalCells = subtotalByYear.map(v =>
        `<td class="num subtotal" style="background:${heatColor(v, subMin, subMax)}">${fmt(v)}</td>`
      ).join('');

      return `
      <div class="task-section">
        <div class="task-header">
          <span class="task-num">${String(taskIdx + 1).padStart(2,'0')}</span>
          <span class="task-name">${task.name}</span>
          <span class="task-meta">${taskRows.length} app${taskRows.length !== 1 ? 's' : ''} &nbsp;·&nbsp; 10-yr total: <strong>${fmtM(taskTotal.tot)}</strong></span>
        </div>
        <div class="wrap">
          <table>
            <thead><tr><th style="min-width:180px">Application</th><th style="min-width:100px">Cost Type</th>${yearHeaders}</tr></thead>
            <tbody>
              ${appRows}
              <tr class="subtotal-row">
                <td colspan="2" class="subtotal-label">Task Subtotal</td>${subtotalCells}
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
    };

    const sortedTasks = [...taskTotals].sort((a, b) => b.tot - a.tot);
    const summaryCards = sortedTasks.slice(0, 5).map(t => `
      <div class="card">
        <div class="card-label">${t.name}</div>
        <div class="card-value amber">${fmtM(t.tot)}</div>
        <div class="card-sub">${t.appCount} apps &nbsp; Op: ${fmtM(t.op)} &nbsp; Dev: ${fmtM(t.dev)}</div>
      </div>`).join('');

    const portTotCells = portByYear.map(r => `<td class="num total">${fmt(r.tot)}</td>`).join('');
    const portOpCells  = portByYear.map(r => `<td class="num">${fmt(r.op)}</td>`).join('');
    const portDevCells = portByYear.map(r => `<td class="num dev">${fmt(r.dev)}</td>`).join('');
    const allTaskSections = bf.tasks.map((t, i) => taskSection(t, i)).join('\n');
    const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${bfName} — Cost Report by Business Process 2016–2025</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
  .report-nav { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 8px 12px; border-radius: 999px; border: 1px solid #30363d; background: #161b22; color: #8b949e; text-decoration: none; font-size: 12px; font-weight: 600; transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease; }
  .report-nav:hover { color: #e6edf3; border-color: #58a6ff; background: #172030; }
  h1   { color: #58a6ff; font-size: 22px; margin-bottom: 2px; }
  h2   { color: #58a6ff; font-size: 15px; margin: 28px 0 12px; border-bottom: 1px solid #30363d; padding-bottom: 6px; }
  .subtitle { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; min-width: 200px; }
  .card-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .card-value  { font-size: 20px; font-weight: 700; margin-top: 4px; }
  .card-sub    { font-size: 10px; color: #6e7681; margin-top: 3px; }
  .amber { color: #d29922; } .blue { color: #58a6ff; } .green { color: #3fb950; }
  .grand-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .grand-card  { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; }
  .grand-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; }
  .grand-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  .port-wrap { overflow-x: auto; margin-bottom: 32px; }
  .task-section { margin-bottom: 32px; }
  .task-header  { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .task-num     { background: #30363d; color: #8b949e; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 7px; }
  .task-name    { font-size: 15px; font-weight: 700; color: #e6edf3; }
  .task-meta    { font-size: 12px; color: #8b949e; margin-left: auto; }
  .task-meta.no-apps { color: #3d444d; font-style: italic; }
  .task-meta strong  { color: #d29922; }
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
  td.oper { color: #58a6ff; } td.dev-label { color: #3fb950; } td.total-label { color: #d29922; font-weight: 600; }
  td.subtotal-label { color: #fff; font-weight: 700; font-size: 11px; text-transform: uppercase;
                      letter-spacing: .06em; padding-left: 12px; background: #1c2128; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: #c9d1d9; }
  td.dev { color: #3fb950; } td.total { color: #d29922; font-weight: 600; }
  td.subtotal { color: #fff; font-weight: 700; background: #1c2128 !important; }
  tr.total-row td { background: #161b22; }
  tr.subtotal-row td { background: #1c2128; border-top: 2px solid #30363d; }
  tr.micro-spacer td { height: 4px; background: #0d1117; border: none; }
  .badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px;
           color: #fff; font-weight: 600; margin-left: 5px; vertical-align: middle; text-transform: capitalize; }
  .rank-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
  .rank-bar-bg { flex: 1; background: #21262d; border-radius: 3px; height: 14px; overflow: hidden; }
  .rank-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #1d4ed8, #3b82f6); }
  .rank-label { width: 200px; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank-value { width: 90px; text-align: right; color: #d29922; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<a class="report-nav" href="/api/reports/cost-summary">&larr; Back to Business Flow Cost Summary Report</a>
<h1>${bfName} — Cost Report by Business Process</h1>
<p class="subtitle">Business Flow: ${bfName} &nbsp;·&nbsp; 10-Year Window: 2016–2025 &nbsp;·&nbsp; Generated: ${generatedDate}</p>

<div class="grand-cards">
  <div class="grand-card"><div class="grand-label">Total Portfolio Cost (10yr)</div><div class="grand-value amber">${fmtM(grandTot)}</div></div>
  <div class="grand-card"><div class="grand-label">Total Operation Cost</div><div class="grand-value blue">${fmtM(grandOp)}</div></div>
  <div class="grand-card"><div class="grand-label">Total Development Cost</div><div class="grand-value green">${fmtM(grandDev)}</div></div>
  <div class="grand-card"><div class="grand-label">Business Processes</div><div class="grand-value">${bf.tasks.length} <span style="font-size:14px;color:#8b949e">tasks</span></div></div>
</div>

<h2>Top 5 Business Processes by 10-Year Cost</h2>
<div class="cards">${summaryCards}</div>

<h2>Cost Rank — All Tasks in This Business Flow</h2>
<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-bottom:32px">
  ${sortedTasks.map(t => {
    const pct = grandTot ? (t.tot / grandTot * 100) : 0;
    return `<div class="rank-row">
      <div class="rank-label">${t.name}</div>
      <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="rank-value">${fmtM(t.tot)}</div>
      <div style="width:40px;text-align:right;font-size:10px;color:#6e7681">${pct.toFixed(1)}%</div>
    </div>`;
  }).join('')}
</div>

<h2>Portfolio Annual Summary</h2>
<div class="port-wrap">
  <table>
    <thead><tr><th style="min-width:180px">Scope</th><th style="min-width:100px">Cost Type</th>${YEARS.map(y => `<th>${y}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><td class="app-name">All Processes</td><td class="cost-type oper">Operation</td>${portOpCells}</tr>
      <tr><td></td><td class="cost-type dev-label">Development</td>${portDevCells}</tr>
      <tr class="total-row"><td></td><td class="cost-type total-label">Total</td>${portTotCells}</tr>
    </tbody>
  </table>
</div>

<h2>Detail by Task</h2>
${allTaskSections}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
