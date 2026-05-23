const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { Application, BusinessFlow } = require('../models/ReferenceData');

/**
 * GET /api/dashboard/task-risk
 * Returns aggregated risk/compliance profile for each task,
 * joining task.applications → Application collection attributes.
 */
router.get('/task-risk', async (_req, res) => {
  try {
    const [tasks, apps] = await Promise.all([
      Task.find().lean(),
      Application.find().lean(),
    ]);

    // Build app lookup by lowercase name
    const appMap = new Map();
    for (const app of apps) {
      appMap.set(app.name.toLowerCase().trim(), app);
    }

    // Aggregate per task
    const taskProfiles = tasks.map((task) => {
      const resolvedApps = (task.applications || [])
        .map((name) => appMap.get(name.toLowerCase().trim()))
        .filter(Boolean);

      return {
        _id: task._id,
        name: task.name,
        businessFlow: task.businessFlow,
        product: task.product,
        domain: task.domain,
        channel: task.channel,
        actor: task.actor,
        appCount: resolvedApps.length,
        criticality: countValues(resolvedApps, 'businessCriticality'),
        lifecycle: countValues(resolvedApps, 'lifecycleStatus'),
        applicationType: countValues(resolvedApps, 'applicationType'),
        customerFacing: countYN(resolvedApps, 'customerFacing'),
        internetFacing: countYN(resolvedApps, 'internetFacing'),
        cpni: countYN(resolvedApps, 'cpniIndicator'),
        handleSpi: countYN(resolvedApps, 'handleSpi'),
        storeSpi: countYN(resolvedApps, 'storeSpi'),
        pciData: countYN(resolvedApps, 'pciData'),
        pciDataStored: countYN(resolvedApps, 'pciDataStored'),
        soxFsa: countYN(resolvedApps, 'soxFsa'),
        // Composite risk score (higher = more regulated)
        riskScore: computeRiskScore(resolvedApps),
      };
    });

    res.json(taskProfiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/flow-risk
 * Aggregates task-level data up to business flow level.
 */
router.get('/flow-risk', async (_req, res) => {
  try {
    const [tasks, apps] = await Promise.all([
      Task.find().lean(),
      Application.find().lean(),
    ]);

    const appMap = new Map();
    for (const app of apps) {
      appMap.set(app.name.toLowerCase().trim(), app);
    }

    // Group tasks by businessFlow
    const flowMap = new Map();
    for (const task of tasks) {
      if (!flowMap.has(task.businessFlow)) {
        flowMap.set(task.businessFlow, []);
      }
      flowMap.get(task.businessFlow).push(task);
    }

    const flowProfiles = [];
    for (const [flowName, flowTasks] of flowMap) {
      // Gather all unique apps across all tasks in this flow
      const allAppNames = new Set();
      for (const t of flowTasks) {
        for (const a of t.applications || []) {
          allAppNames.add(a.toLowerCase().trim());
        }
      }
      const resolvedApps = [...allAppNames]
        .map((n) => appMap.get(n))
        .filter(Boolean);

      flowProfiles.push({
        name: flowName,
        taskCount: flowTasks.length,
        appCount: resolvedApps.length,
        uniqueApps: allAppNames.size,
        criticality: countValues(resolvedApps, 'businessCriticality'),
        lifecycle: countValues(resolvedApps, 'lifecycleStatus'),
        applicationType: countValues(resolvedApps, 'applicationType'),
        customerFacing: countYN(resolvedApps, 'customerFacing'),
        internetFacing: countYN(resolvedApps, 'internetFacing'),
        cpni: countYN(resolvedApps, 'cpniIndicator'),
        handleSpi: countYN(resolvedApps, 'handleSpi'),
        storeSpi: countYN(resolvedApps, 'storeSpi'),
        pciData: countYN(resolvedApps, 'pciData'),
        pciDataStored: countYN(resolvedApps, 'pciDataStored'),
        soxFsa: countYN(resolvedApps, 'soxFsa'),
        riskScore: computeRiskScore(resolvedApps),
      });
    }

    // Sort by risk score descending
    flowProfiles.sort((a, b) => b.riskScore - a.riskScore);
    res.json(flowProfiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ────────────────────────────────────────────────

function countValues(apps, field) {
  const counts = {};
  for (const app of apps) {
    const val = app[field] || 'Unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function countYN(apps, field) {
  let yes = 0, no = 0, unknown = 0;
  for (const app of apps) {
    const val = (app[field] || '').toUpperCase();
    if (val === 'Y' || val === 'YES' || val === 'TRUE') yes++;
    else if (val === 'N' || val === 'NO' || val === 'FALSE') no++;
    else unknown++;
  }
  return { yes, no, unknown };
}

function computeRiskScore(apps) {
  let score = 0;
  for (const app of apps) {
    // Criticality weights
    const crit = (app.businessCriticality || '').toLowerCase();
    if (crit.includes('mission')) score += 4;
    else if (crit.includes('critical') || crit.includes('business_critical')) score += 3;
    else if (crit.includes('operational') || crit.includes('business_operational')) score += 2;
    else if (crit.includes('essential') || crit.includes('non_essential')) score += 1;

    // Compliance flags (each Y adds weight)
    if ((app.cpniIndicator || '').toUpperCase() === 'Y') score += 3;
    if ((app.handleSpi || '').toUpperCase() === 'Y') score += 2;
    if ((app.storeSpi || '').toUpperCase() === 'Y') score += 3;
    if ((app.pciData || '').toUpperCase() === 'Y') score += 3;
    if ((app.pciDataStored || '').toUpperCase() === 'Y') score += 4;
    if ((app.soxFsa || '').toUpperCase() === 'Y') score += 3;
    if ((app.customerFacing || '').toUpperCase() === 'Y') score += 1;
    if ((app.internetFacing || '').toUpperCase() === 'Y') score += 2;
  }
  return score;
}

module.exports = router;
