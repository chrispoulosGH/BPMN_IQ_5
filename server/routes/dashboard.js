const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { Application, BusinessFlow } = require('../models/ReferenceData');
const Diagram = require('../models/Diagram');

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

/**
 * GET /api/dashboard/flow-3d
 * Returns data for the 3D visualization driven by the Diagram collection:
 * - businessFlows: list of diagram names (used as selectable items)
 * - points: array of { appName, businessCriticality, lifecycleStatus, task, businessFlow, taskOrder }
 * - taskOrders: { [diagramName]: string[] } — tasks in execution order per diagram
 */
router.get('/flow-3d', async (_req, res) => {
  try {
    const [apps, diagrams] = await Promise.all([
      Application.find().lean(),
      Diagram.find({}, { name: 1, tasks: 1 }).lean(),
    ]);

    // App lookup by lowercase name
    const appMap = new Map();
    for (const app of apps) {
      appMap.set(app.name.toLowerCase().trim(), app);
    }

    const diagramNames = [];
    const points = [];
    const taskOrders = {};

    for (const diagram of diagrams) {
      if (!diagram.tasks || !diagram.tasks.length) continue;
      const diagramName = diagram.name;
      diagramNames.push(diagramName);

      const diagramTasks = diagram.tasks;

      // Build adjacency for topological sort
      const next = new Map();
      const prev = new Map();
      const allNames = new Set();

      for (const dt of diagramTasks) {
        allNames.add(dt.name);
        if (!next.has(dt.name)) next.set(dt.name, []);
        if (!prev.has(dt.name)) prev.set(dt.name, []);

        if (dt.target) {
          const targets = dt.target.split(',').map(s => s.trim()).filter(Boolean);
          next.set(dt.name, (next.get(dt.name) || []).concat(targets));
          for (const t of targets) {
            if (!prev.has(t)) prev.set(t, []);
            prev.get(t).push(dt.name);
          }
        }
      }

      // Topological sort (Kahn's algorithm)
      const inDegree = new Map();
      for (const name of allNames) inDegree.set(name, (prev.get(name) || []).filter(p => allNames.has(p)).length);
      const queue = [];
      for (const [name, deg] of inDegree) { if (deg === 0) queue.push(name); }
      const sorted = [];
      while (queue.length) {
        const current = queue.shift();
        sorted.push(current);
        for (const nxt of (next.get(current) || [])) {
          if (!allNames.has(nxt)) continue;
          inDegree.set(nxt, inDegree.get(nxt) - 1);
          if (inDegree.get(nxt) === 0) queue.push(nxt);
        }
      }
      // Append any remaining (cycles)
      for (const name of allNames) {
        if (!sorted.includes(name)) sorted.push(name);
      }

      taskOrders[diagramName] = sorted;

      // Build order index map
      const orderMap = {};
      sorted.forEach((name, idx) => { orderMap[name.toLowerCase().trim()] = idx; });

      // For each task in this diagram, use applications embedded directly on the diagram task
      // Build a lookup of diagram task objects by name for quick access
      const diagramTaskMap = new Map();
      for (const dt of diagramTasks) {
        diagramTaskMap.set(dt.name.toLowerCase().trim(), dt);
      }

      for (const dtName of sorted) {
        const dt = diagramTaskMap.get(dtName.toLowerCase().trim());
        if (!dt) continue;
        const taskOrder = orderMap[dtName.toLowerCase().trim()] ?? -1;

        // applications is an array of { name } objects on the diagram task
        for (const appRef of (dt.applications || [])) {
          const appName = typeof appRef === 'string' ? appRef : appRef.name;
          if (!appName) continue;
          const app = appMap.get(appName.toLowerCase().trim());
          if (!app) continue;
          points.push({
            appName: app.name,
            businessCriticality: app.businessCriticality || 'Unknown',
            lifecycleStatus: app.lifecycleStatus || 'Unknown',
            task: dt.name,
            businessFlow: diagramName,
            taskOrder,
          });
        }
      }
    }

    res.json({
      businessFlows: diagramNames.sort(),
      points,
      taskOrders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/flow-cost-3d
 * Returns cost data for the "Cost by Business Flow" 3D chart.
 * Points: { businessFlow, task, taskOrder, year, totalCost, opCost, devCost }
 * One point per task × year combination (summed across all apps in that task).
 * Source: businessflows collection → tasks[].applications[].annualCosts[]
 */
router.get('/flow-cost-3d', async (_req, res) => {
  try {
    const db = require('mongoose').connection;
    const bfDocs = await db.collection('businessflows')
      .find({ 'tasks.0': { $exists: true } })
      .toArray();

    const businessFlows = [];
    const points = [];
    const taskOrders = {};

    for (const bf of bfDocs) {
      if (!bf.tasks || !bf.tasks.length) continue;
      const flowName = bf.name;
      businessFlows.push(flowName);

      const ordered = bf.tasks.map(t => t.name);
      taskOrders[flowName] = ordered;

      bf.tasks.forEach((task, taskIdx) => {
        if (!task.applications || !task.applications.length) return;

        // Sum costs across all apps for each year index
        const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);
        YEARS.forEach((year, yi) => {
          let totalCost = 0, opCost = 0, devCost = 0;
          task.applications.forEach(app => {
            const entry = app.annualCosts?.[yi];
            if (entry) {
              totalCost += entry.totalCost       || 0;
              opCost    += entry.operationCost   || 0;
              devCost   += entry.developmentCost || 0;
            }
          });
          if (totalCost > 0) {
            points.push({ businessFlow: flowName, task: task.name, taskOrder: taskIdx, year, totalCost, opCost, devCost });
          }
        });
      });
    }

    res.json({ businessFlows: businessFlows.sort(), points, taskOrders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
