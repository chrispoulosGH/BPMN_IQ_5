const Component = require('../models/Component');
const Diagram = require('../models/Diagram');
const { getNeighborhoodName, withNeighborhood } = require('./neighborhoodScope');

const COST_YEARS = Array.from({ length: 10 }, (_, index) => 2016 + index);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function createEmptyAnnualCosts() {
  return COST_YEARS.map((year) => ({
    year,
    operationCost: 0,
    developmentCost: 0,
    totalCost: 0,
  }));
}

function cloneAnnualCosts(annualCosts) {
  const rows = createEmptyAnnualCosts();
  for (let i = 0; i < COST_YEARS.length; i += 1) {
    const entry = Array.isArray(annualCosts) ? annualCosts[i] : null;
    if (!entry) continue;
    rows[i].operationCost = toNumber(entry.operationCost);
    rows[i].developmentCost = toNumber(entry.developmentCost);
    rows[i].totalCost = toNumber(entry.totalCost);
  }
  return rows;
}

function mergeAnnualCosts(target, source) {
  for (let i = 0; i < COST_YEARS.length; i += 1) {
    target[i].operationCost += toNumber(source[i]?.operationCost);
    target[i].developmentCost += toNumber(source[i]?.developmentCost);
    target[i].totalCost += toNumber(source[i]?.totalCost);
  }
}

function finalizeAnnualCosts(rows) {
  for (const row of rows) {
    if (!row.totalCost && (row.operationCost || row.developmentCost)) {
      row.totalCost = row.operationCost + row.developmentCost;
    }
  }
  return rows;
}

function readRowValues(row) {
  if (!row?.values) return {};
  if (row.values instanceof Map) return Object.fromEntries(row.values.entries());
  return { ...row.values };
}

function resolveComponentRowName(component, rowValues) {
  const directName = normalizeText(rowValues?.name);
  if (directName) return directName;

  for (const column of Array.isArray(component?.columns) ? component.columns : []) {
    const value = normalizeText(rowValues?.[column]);
    if (value) return value;
  }

  return '';
}

function parseAnnualCostsFromRowValues(rowValues) {
  const rows = createEmptyAnnualCosts();

  if (Array.isArray(rowValues?.annualCosts)) {
    for (let i = 0; i < COST_YEARS.length; i += 1) {
      const entry = rowValues.annualCosts[i];
      if (!entry) continue;
      rows[i].operationCost += toNumber(entry.operationCost);
      rows[i].developmentCost += toNumber(entry.developmentCost);
      rows[i].totalCost += toNumber(entry.totalCost);
    }
  }

  for (const [rawKey, rawValue] of Object.entries(rowValues || {})) {
    const key = normalizeKey(rawKey).replace(/[^a-z0-9]/g, '');
    if (!key) continue;

    const yearMatch = key.match(/201[6-9]|202[0-5]/);
    if (!yearMatch) continue;

    const year = Number(yearMatch[0]);
    const yearIndex = COST_YEARS.indexOf(year);
    if (yearIndex < 0) continue;

    if (key === 'name' || key.includes('lifecycle') || key.includes('owner') || key.includes('state')) {
      continue;
    }

    const value = toNumber(rawValue);
    if (!value) continue;

    if (key.includes('operation') || key.includes('operational') || /^op\d/.test(key) || key.includes('opcost')) {
      rows[yearIndex].operationCost += value;
      continue;
    }

    if (key.includes('development') || /^dev\d/.test(key) || key.includes('devcost')) {
      rows[yearIndex].developmentCost += value;
      continue;
    }

    if (key.includes('total') || key.includes('cost')) {
      rows[yearIndex].totalCost += value;
    }
  }

  return finalizeAnnualCosts(rows);
}

function buildApplicationCostIndex(components) {
  const index = new Map();

  for (const component of Array.isArray(components) ? components : []) {
    for (const row of Array.isArray(component?.rows) ? component.rows : []) {
      const rowValues = readRowValues(row);
      const appName = resolveComponentRowName(component, rowValues);
      if (!appName) continue;

      const key = normalizeKey(appName);
      if (!index.has(key)) {
        index.set(key, createEmptyAnnualCosts());
      }

      const parsed = parseAnnualCostsFromRowValues(rowValues);
      mergeAnnualCosts(index.get(key), parsed);
    }
  }

  for (const [key, rows] of index.entries()) {
    index.set(key, finalizeAnnualCosts(rows));
  }

  return index;
}

function buildFlowDocsFromDiagrams(diagrams, appCostIndex) {
  const flowMap = new Map();

  for (const diagram of Array.isArray(diagrams) ? diagrams : []) {
    const flowName = normalizeText(diagram?.businessFlow) || normalizeText(diagram?.name) || 'Unspecified Business Flow';
    const flowKey = normalizeKey(flowName);

    if (!flowMap.has(flowKey)) {
      flowMap.set(flowKey, {
        name: flowName,
        tasks: [],
      });
    }

    const flow = flowMap.get(flowKey);
    const taskMap = new Map(flow.tasks.map((task) => [normalizeKey(task.name), task]));

    for (const task of Array.isArray(diagram?.tasks) ? diagram.tasks : []) {
      const taskName = normalizeText(task?.name);
      if (!taskName) continue;

      const taskKey = normalizeKey(taskName);
      if (!taskMap.has(taskKey)) {
        const createdTask = { name: taskName, applications: [] };
        flow.tasks.push(createdTask);
        taskMap.set(taskKey, createdTask);
      }

      const flowTask = taskMap.get(taskKey);
      const appNames = new Set(
        (Array.isArray(task?.applications) ? task.applications : [])
          .map((entry) => normalizeText(typeof entry === 'string' ? entry : entry?.name))
          .filter(Boolean)
          .map((name) => normalizeKey(name))
      );

      for (const appKey of appNames) {
        const appName = (Array.isArray(task?.applications) ? task.applications : [])
          .map((entry) => normalizeText(typeof entry === 'string' ? entry : entry?.name))
          .find((name) => normalizeKey(name) === appKey);
        if (!appName) continue;

        const existing = flowTask.applications.find((entry) => normalizeKey(entry?.name) === appKey);
        if (existing) continue;

        const annualCosts = appCostIndex.get(appKey) || createEmptyAnnualCosts();
        flowTask.applications.push({
          name: appName,
          annualCosts: cloneAnnualCosts(annualCosts),
        });
      }
    }
  }

  return [...flowMap.values()].filter((flow) => Array.isArray(flow.tasks) && flow.tasks.length > 0);
}

async function loadScopedFlowCostDocumentsFromComponentsAndDiagrams(req) {
  const neighborhoodName = getNeighborhoodName(req);

  const [diagrams, applicationComponents] = await Promise.all([
    Diagram.find(withNeighborhood(req), { name: 1, businessFlow: 1, tasks: 1 }).lean(),
    Component.find(
      {
        neighborhoodName,
        name: { $regex: /^application$/i },
      },
      { name: 1, columns: 1, rows: 1 }
    ).lean(),
  ]);

  const appCostIndex = buildApplicationCostIndex(applicationComponents);
  return buildFlowDocsFromDiagrams(diagrams, appCostIndex);
}

module.exports = {
  COST_YEARS,
  createEmptyAnnualCosts,
  loadScopedFlowCostDocumentsFromComponentsAndDiagrams,
};
