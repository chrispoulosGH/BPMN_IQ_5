const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { Application, BusinessFlow } = require('../models/ReferenceData');
const Diagram = require('../models/Diagram');
const Server = require('../models/Server');
const DatabaseInstance = require('../models/DatabaseInstance');
const { getNeighborhoodName, withNeighborhood } = require('../utils/neighborhoodScope');

function buildNeighborhoodApplicationKeys(applications) {
  return {
    correlationIds: applications.map((app) => normalizeIdentifier(app?.correlationId)).filter(Boolean),
    acronyms: applications.map((app) => normalizeIdentifier(app?.acronym)).filter(Boolean),
    names: applications.map((app) => normalizeIdentifier(app?.name)).filter(Boolean),
  };
}

function buildServerScopeQuery(applications) {
  const keys = buildNeighborhoodApplicationKeys(applications);
  const orConditions = [
    keys.correlationIds.length ? { 'linkedApplications.correlationId': { $in: keys.correlationIds } } : null,
    keys.acronyms.length ? { 'linkedApplications.acronym': { $in: keys.acronyms } } : null,
    keys.names.length ? { 'linkedApplications.name': { $in: keys.names } } : null,
  ].filter(Boolean);

  return orConditions.length ? { $or: orConditions } : { _id: null };
}

function buildDatabaseScopeQuery(applications) {
  const keys = buildNeighborhoodApplicationKeys(applications);
  const orConditions = [
    keys.correlationIds.length ? { applicationCorrelationId: { $in: keys.correlationIds } } : null,
    keys.correlationIds.length ? { 'linkedApplications.correlationId': { $in: keys.correlationIds } } : null,
    keys.acronyms.length ? { applicationAcronym: { $in: keys.acronyms } } : null,
    keys.acronyms.length ? { 'linkedApplications.acronym': { $in: keys.acronyms } } : null,
    keys.names.length ? { applicationName: { $in: keys.names } } : null,
    keys.names.length ? { 'linkedApplications.name': { $in: keys.names } } : null,
  ].filter(Boolean);

  return orConditions.length ? { $or: orConditions } : { _id: null };
}

/**
 * GET /api/dashboard/task-risk
 * Returns aggregated risk/compliance profile for each task,
 * joining task.applications → Application collection attributes.
 */
router.get('/task-risk', async (req, res) => {
  try {
    const apps = await Application.find(withNeighborhood(req)).lean();
    const [tasks, servers, databases] = await Promise.all([
      Task.find(withNeighborhood(req)).lean(),
      Server.find(buildServerScopeQuery(apps), { linkedApplications: 1, healthNotes: 1 }).lean(),
      DatabaseInstance.find(buildDatabaseScopeQuery(apps), { applicationCorrelationId: 1, applicationName: 1, applicationAcronym: 1, linkedApplications: 1, healthNotes: 1 }).lean(),
    ]);

    // Build app lookup by lowercase name
    const appMap = new Map();
    for (const app of apps) {
      appMap.set(app.name.toLowerCase().trim(), app);
    }
    const appInfrastructureMap = buildApplicationInfrastructureMap(apps, servers, databases);

    // Aggregate per task
    const taskProfiles = tasks.map((task) => {
      const resolvedApps = (task.applications || [])
        .map((name) => appMap.get(name.toLowerCase().trim()))
        .filter(Boolean);
      const infrastructure = sumInfrastructureForApps(resolvedApps, appInfrastructureMap);

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
        serverVulnerabilities: infrastructure.serverVulnerabilities,
        dbVulnerabilities: infrastructure.dbVulnerabilities,
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
router.get('/flow-risk', async (req, res) => {
  try {
    const apps = await Application.find(withNeighborhood(req)).lean();
    const [tasks, servers, databases] = await Promise.all([
      Task.find(withNeighborhood(req)).lean(),
      Server.find(buildServerScopeQuery(apps), { linkedApplications: 1, healthNotes: 1 }).lean(),
      DatabaseInstance.find(buildDatabaseScopeQuery(apps), { applicationCorrelationId: 1, applicationName: 1, applicationAcronym: 1, linkedApplications: 1, healthNotes: 1 }).lean(),
    ]);

    const appMap = new Map();
    for (const app of apps) {
      appMap.set(app.name.toLowerCase().trim(), app);
    }
    const appInfrastructureMap = buildApplicationInfrastructureMap(apps, servers, databases);

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
      const infrastructure = sumInfrastructureForApps(resolvedApps, appInfrastructureMap);

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
        serverVulnerabilities: infrastructure.serverVulnerabilities,
        dbVulnerabilities: infrastructure.dbVulnerabilities,
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

/**
 * GET /api/dashboard/capability-flow-relationships
 * Builds capability-to-business-flow relationship strengths from diagram data.
 */
router.get('/capability-flow-relationships', async (req, res) => {
  try {
    const diagrams = await Diagram.find(withNeighborhood(req), { name: 1, businessFlow: 1, capabilities: 1 }).lean();

    const capabilityCounts = new Map();
    const flowCounts = new Map();
    const linkCounts = new Map();
    let diagramsWithCapabilities = 0;

    for (const d of diagrams) {
      const flowName = (d.businessFlow || d.name || '').trim();
      const names = Array.from(
        new Set(
          (d.capabilities || [])
            .map((c) => (c?.capabilityName || '').trim())
            .filter(Boolean)
        )
      );

      if (!names.length || !flowName) continue;
      diagramsWithCapabilities++;
      flowCounts.set(flowName, (flowCounts.get(flowName) || 0) + 1);

      for (const n of names) {
        capabilityCounts.set(n, (capabilityCounts.get(n) || 0) + 1);
        const key = `${n}|||${flowName}`;
        linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      }
    }

    const capabilities = [...capabilityCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const businessFlows = [...flowCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const links = [...linkCounts.entries()]
      .map(([key, count]) => {
        const [capability, businessFlow] = key.split('|||');
        return { capability, businessFlow, count };
      })
      .sort((a, b) => b.count - a.count);

    res.json({
      totalDiagrams: diagrams.length,
      diagramsWithCapabilities,
      capabilityCount: capabilities.length,
      businessFlowCount: businessFlows.length,
      linkCount: links.length,
      capabilities,
      businessFlows,
      links,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/lob-drilldown-tree
 * Returns a hierarchical drilldown tree:
 * LOB -> Channel -> Product -> Domain -> Subdomain -> Business Flow -> Task -> Application
 */
router.get('/lob-drilldown-tree', async (req, res) => {
  try {
    const [diagrams, applications] = await Promise.all([
      Diagram.find(
        withNeighborhood(req),
        { lineOfBusiness: 1, channel: 1, product: 1, domain: 1, subdomain: 1, businessFlow: 1, name: 1, tasks: 1 }
      ).lean(),
      Application.find(withNeighborhood(req), { acronym: 1, correlationId: 1 }).lean(),
    ]);

    const appCorrelationByIdentifier = new Map();
    for (const app of applications) {
      const correlationId = normalizeValue(app?.correlationId, '');
      const acronym = normalizeValue(app?.acronym, '').toLowerCase();
      if (correlationId && !appCorrelationByIdentifier.has(correlationId.toLowerCase())) {
        appCorrelationByIdentifier.set(correlationId.toLowerCase(), correlationId);
      }
      if (acronym && correlationId && !appCorrelationByIdentifier.has(acronym)) {
        appCorrelationByIdentifier.set(acronym, correlationId);
      }
    }

    const root = new Map();

    for (const d of diagrams) {
      const lob = normalizeValue(d.lineOfBusiness, 'Unspecified LOB');
      const channel = normalizeValue(d.channel, 'Unspecified Channel');
      const product = normalizeValue(d.product, 'Unspecified Product');
      const domain = normalizeValue(d.domain, 'Unspecified Domain');
      const subdomain = normalizeValue(d.subdomain, 'Unspecified Subdomain');
      const businessFlow = normalizeValue(d.businessFlow || d.name, 'Unspecified Business Flow');

      const basePath = [lob, channel, product, domain, subdomain, businessFlow];
      const levels = ['lob', 'channel', 'product', 'domain', 'subdomain', 'businessFlow'];

      let childrenMap = root;
      for (let i = 0; i < basePath.length; i++) {
        const segment = basePath[i];
        const level = levels[i];
        const node = getOrCreateTreeNode(childrenMap, segment, level, basePath.slice(0, i + 1));
        node.count += 1;
        childrenMap = node.children;
      }

      for (const task of d.tasks || []) {
        const taskName = normalizeValue(task?.name, 'Unnamed Task');
        const taskPath = [...basePath, taskName];
        const taskNode = getOrCreateTreeNode(childrenMap, taskName, 'task', taskPath);
        taskNode.count += 1;

        const apps = (task?.applications || [])
          .map((a) => normalizeValue(a?.name, ''))
          .filter(Boolean);

        if (!apps.length) {
          const noAppPath = [...taskPath, 'No Application'];
          const noAppNode = getOrCreateTreeNode(taskNode.children, 'No Application', 'application', noAppPath);
          noAppNode.count += 1;
          continue;
        }

        for (const appName of Array.from(new Set(apps))) {
          const appPath = [...taskPath, appName];
          const appCorrelationId = appCorrelationByIdentifier.get(appName.toLowerCase()) || undefined;
          const appNode = getOrCreateTreeNode(taskNode.children, appName, 'application', appPath, appCorrelationId ? { correlationId: appCorrelationId } : undefined);
          appNode.count += 1;
        }
      }
    }

    const tree = mapToTreeArray(root);
    res.json({
      levels: ['lob', 'channel', 'product', 'domain', 'subdomain', 'businessFlow', 'task', 'application'],
      totalDiagrams: diagrams.length,
      rootCount: tree.length,
      tree,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/server-location-points
 * Returns lightweight server data needed for geographic map rendering.
 */
router.get('/server-location-points', async (req, res) => {
  try {
    const apps = await Application.find(withNeighborhood(req)).lean();
    const rows = await Server.find(
      buildServerScopeQuery(apps),
      {
        name: 1,
        hostName: 1,
        ipAddress: 1,
        location: 1,
        environment: 1,
        operationalStatus: 1,
        internetFacing: 1,
        healthNotes: 1,
        linkedApplications: 1,
      }
    ).lean();

    res.json({
      totalServers: rows.length,
      points: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ────────────────────────────────────────────────

function normalizeValue(value, fallback = '') {
  const v = (value || '').toString().trim();
  return v || fallback;
}

function getOrCreateTreeNode(map, name, level, pathParts, metadata) {
  if (!map.has(name)) {
    map.set(name, {
      id: `${level}::${pathParts.join(' > ')}`,
      name,
      level,
      count: 0,
      children: new Map(),
      metadata: metadata || null,
    });
  } else if (metadata) {
    const existing = map.get(name);
    existing.metadata = { ...(existing.metadata || {}), ...metadata };
  }
  return map.get(name);
}

function mapToTreeArray(map) {
  return [...map.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      id: node.id,
      name: node.name,
      level: node.level,
      count: node.count,
      ...(node.metadata ? { metadata: node.metadata } : {}),
      children: mapToTreeArray(node.children),
    }));
}

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

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function countVulnerabilityItems(healthNotes) {
  return (Array.isArray(healthNotes) ? healthNotes : []).reduce((sum, note) => {
    const vulnerabilities = Array.isArray(note?.vulnerabilities) ? note.vulnerabilities.filter(Boolean) : [];
    return sum + vulnerabilities.length;
  }, 0);
}

function buildApplicationInfrastructureMap(apps, servers, databases) {
  const appByIdentifier = new Map();
  const infrastructureByAppId = new Map();

  for (const app of apps) {
    const appId = String(app._id);
    infrastructureByAppId.set(appId, { serverVulnerabilities: 0, dbVulnerabilities: 0 });
    for (const value of [app.name, app.acronym, app.correlationId]) {
      const key = normalizeIdentifier(value);
      if (key && !appByIdentifier.has(key)) appByIdentifier.set(key, appId);
    }
  }

  const addCounts = (appIds, field, count) => {
    if (!count) return;
    for (const appId of appIds) {
      const row = infrastructureByAppId.get(appId);
      if (!row) continue;
      row[field] += count;
    }
  };

  for (const server of servers) {
    const appIds = new Set();
    for (const linked of server.linkedApplications || []) {
      for (const value of [linked?.name, linked?.acronym, linked?.correlationId]) {
        const appId = appByIdentifier.get(normalizeIdentifier(value));
        if (appId) appIds.add(appId);
      }
    }
    addCounts(appIds, 'serverVulnerabilities', countVulnerabilityItems(server.healthNotes));
  }

  for (const database of databases) {
    const appIds = new Set();
    for (const value of [database.applicationName, database.applicationAcronym, database.applicationCorrelationId]) {
      const appId = appByIdentifier.get(normalizeIdentifier(value));
      if (appId) appIds.add(appId);
    }
    for (const linked of database.linkedApplications || []) {
      for (const value of [linked?.name, linked?.acronym, linked?.correlationId]) {
        const appId = appByIdentifier.get(normalizeIdentifier(value));
        if (appId) appIds.add(appId);
      }
    }
    addCounts(appIds, 'dbVulnerabilities', countVulnerabilityItems(database.healthNotes));
  }

  return infrastructureByAppId;
}

function sumInfrastructureForApps(apps, infrastructureMap) {
  const totals = { serverVulnerabilities: 0, dbVulnerabilities: 0 };
  const seen = new Set();
  for (const app of apps) {
    const appId = String(app?._id || '');
    if (!appId || seen.has(appId)) continue;
    seen.add(appId);
    const row = infrastructureMap.get(appId);
    if (!row) continue;
    totals.serverVulnerabilities += row.serverVulnerabilities || 0;
    totals.dbVulnerabilities += row.dbVulnerabilities || 0;
  }
  return totals;
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
router.get('/flow-3d', async (req, res) => {
  try {
    const [apps, diagrams] = await Promise.all([
      Application.find(withNeighborhood(req)).lean(),
      Diagram.find(withNeighborhood(req), { name: 1, tasks: 1 }).lean(),
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
router.get('/flow-cost-3d', async (req, res) => {
  try {
    const db = require('mongoose').connection;
    const bfDocs = await db.collection('businessflows')
      .find({ neighborhoodName: getNeighborhoodName(req), 'tasks.0': { $exists: true } })
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

/**
 * GET /api/dashboard/cost-by-year?year=2025
 * Returns top-20 business flows and top-20 tasks ranked by total cost for the given year.
 * Source: businessflows collection → tasks[].applications[].annualCosts[yearIdx]
 */
router.get('/cost-by-year', async (req, res) => {
  const year = parseInt(req.query.year) || 2025;
  const yearIdx = year - 2016;
  if (yearIdx < 0 || yearIdx >= 10) {
    return res.status(400).json({ error: 'Year must be between 2016 and 2025' });
  }
  try {
    const db = require('mongoose').connection;
    const bfDocs = await db.collection('businessflows')
      .find({ neighborhoodName: getNeighborhoodName(req), 'tasks.0': { $exists: true } })
      .toArray();

    const flowMap = new Map();
    const taskMap = new Map();

    for (const bf of bfDocs) {
      if (!flowMap.has(bf.name)) {
        flowMap.set(bf.name, { name: bf.name, opCost: 0, devCost: 0, totalCost: 0 });
      }
      for (const task of (bf.tasks || [])) {
        const taskKey = `${bf.name}::${task.name}`;
        if (!taskMap.has(taskKey)) {
          taskMap.set(taskKey, { name: task.name, businessFlow: bf.name, opCost: 0, devCost: 0, totalCost: 0 });
        }
        for (const app of (task.applications || [])) {
          const entry = app.annualCosts?.[yearIdx];
          if (!entry) continue;
          flowMap.get(bf.name).opCost    += entry.operationCost   || 0;
          flowMap.get(bf.name).devCost   += entry.developmentCost || 0;
          flowMap.get(bf.name).totalCost += entry.totalCost       || 0;
          taskMap.get(taskKey).opCost    += entry.operationCost   || 0;
          taskMap.get(taskKey).devCost   += entry.developmentCost || 0;
          taskMap.get(taskKey).totalCost += entry.totalCost       || 0;
        }
      }
    }

    const flows = [...flowMap.values()].sort((a, b) => b.totalCost - a.totalCost).slice(0, 20);
    const tasks = [...taskMap.values()].sort((a, b) => b.totalCost - a.totalCost).slice(0, 20);

    res.json({ flows, tasks, year });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/capability-cost-by-year?year=2025
 * Returns top-10 business capabilities ranked by total cost for the given year.
 * Cost attribution is derived from business flow totals, grouped by the set of
 * capabilities tagged on the corresponding diagram(s) for each flow.
 */
router.get('/capability-cost-by-year', async (req, res) => {
  const year = parseInt(req.query.year) || 2025;
  const yearIdx = year - 2016;
  if (yearIdx < 0 || yearIdx >= 10) {
    return res.status(400).json({ error: 'Year must be between 2016 and 2025' });
  }

  try {
    const db = require('mongoose').connection;
    const [bfDocs, diagramDocs] = await Promise.all([
      db.collection('businessflows')
        .find({ neighborhoodName: getNeighborhoodName(req), 'tasks.0': { $exists: true } })
        .toArray(),
      Diagram.find(withNeighborhood(req), { name: 1, businessFlow: 1, capabilities: 1 }).lean(),
    ]);

    const flowCostMap = new Map();
    for (const bf of bfDocs) {
      let opCost = 0;
      let devCost = 0;
      let totalCost = 0;

      for (const task of (bf.tasks || [])) {
        for (const app of (task.applications || [])) {
          const entry = app.annualCosts?.[yearIdx];
          if (!entry) continue;
          opCost += entry.operationCost || 0;
          devCost += entry.developmentCost || 0;
          totalCost += entry.totalCost || 0;
        }
      }

      if (totalCost > 0) {
        flowCostMap.set((bf.name || '').trim(), { name: (bf.name || '').trim(), opCost, devCost, totalCost });
      }
    }

    const capabilityToFlows = new Map();
    for (const diagram of diagramDocs) {
      const flowName = normalizeValue(diagram.businessFlow || diagram.name, '');
      if (!flowName) continue;

      const capabilityNames = Array.from(new Set(
        (diagram.capabilities || [])
          .map((capability) => normalizeValue(capability?.capabilityName, ''))
          .filter(Boolean)
      ));

      if (!capabilityNames.length) continue;

      if (!capabilityToFlows.has(flowName)) {
        capabilityToFlows.set(flowName, new Set());
      }
      const flowCapabilities = capabilityToFlows.get(flowName);
      for (const capabilityName of capabilityNames) {
        flowCapabilities.add(capabilityName);
      }
    }

    const capabilityMap = new Map();
    for (const [flowName, flowCost] of flowCostMap.entries()) {
      const capabilityNames = capabilityToFlows.get(flowName);
      if (!capabilityNames || !capabilityNames.size) continue;

      for (const capabilityName of capabilityNames) {
        if (!capabilityMap.has(capabilityName)) {
          capabilityMap.set(capabilityName, {
            name: capabilityName,
            opCost: 0,
            devCost: 0,
            totalCost: 0,
            flowCount: 0,
          });
        }

        const capabilityRow = capabilityMap.get(capabilityName);
        capabilityRow.opCost += flowCost.opCost;
        capabilityRow.devCost += flowCost.devCost;
        capabilityRow.totalCost += flowCost.totalCost;
        capabilityRow.flowCount += 1;
      }
    }

    const capabilities = [...capabilityMap.values()]
      .sort((a, b) => b.totalCost - a.totalCost || b.flowCount - a.flowCount || a.name.localeCompare(b.name))
      .slice(0, 10);

    res.json({ capabilities, year });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
