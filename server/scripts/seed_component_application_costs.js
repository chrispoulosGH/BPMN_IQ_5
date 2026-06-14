'use strict';

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const Component = require('../models/Component');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function hashStr(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randBetween(rng, min, max) {
  return rng() * (max - min) + min;
}

function pickLifecycle(appName, existingLifecycle) {
  const normalized = normalizeKey(existingLifecycle);
  if (normalized) return normalized;

  const pool = ['in_use', 'in_use', 'in_use', 'build', 'build', 'in_maintenance', 'propose_to_retire'];
  const rng = seededRng(hashStr(`${appName}:lifecycle`));
  return pool[Math.floor(rng() * pool.length)];
}

const BASE_RANGES = {
  in_use: { op: [300000, 2400000], dev: [60000, 700000] },
  build: { op: [220000, 1800000], dev: [180000, 1400000] },
  in_maintenance: { op: [180000, 1300000], dev: [15000, 180000] },
  propose_to_retire: { op: [90000, 700000], dev: [0, 50000] },
};

function generateAnnualCosts(seedKey, lifecycleStatus) {
  const lifecycle = BASE_RANGES[lifecycleStatus] ? lifecycleStatus : 'in_use';
  const range = BASE_RANGES[lifecycle];
  const rng = seededRng(hashStr(seedKey));

  let op = randBetween(rng, range.op[0], range.op[1]);
  let dev = randBetween(rng, range.dev[0], range.dev[1]);

  return YEARS.map((year, index) => {
    if (index > 0) {
      if (lifecycle === 'build') {
        const opGrowth = 1 + randBetween(rng, 0.01, 0.05);
        const devGrowth = index < 4
          ? 1 + randBetween(rng, 0.08, 0.30)
          : 1 + randBetween(rng, -0.22, 0.06);
        op *= opGrowth;
        dev = Math.max(0, dev * devGrowth);
      } else if (lifecycle === 'in_use') {
        const opGrowth = 1 + randBetween(rng, 0.03, 0.08);
        let devGrowth = 1 + randBetween(rng, -0.08, 0.18);
        if (rng() < 0.15) devGrowth = 1 + randBetween(rng, 0.2, 0.5);
        op *= opGrowth;
        dev = Math.max(0, dev * devGrowth);
      } else if (lifecycle === 'in_maintenance') {
        op *= 1 + randBetween(rng, -0.03, 0.04);
        dev = Math.max(0, dev * (1 + randBetween(rng, -0.28, 0.03)));
      } else {
        op *= 1 + randBetween(rng, -0.12, -0.02);
        dev = Math.max(0, dev * (1 + randBetween(rng, -0.45, -0.08)));
      }
    }

    const operationCost = Math.round(op);
    const developmentCost = Math.round(dev);
    return {
      year,
      operationCost,
      developmentCost,
      totalCost: operationCost + developmentCost,
    };
  });
}

function rowValuesToObject(values) {
  if (!values) return {};
  if (values instanceof Map) return Object.fromEntries(values.entries());
  return { ...values };
}

function resolveAppName(component, rowValues) {
  const explicitName = normalizeText(rowValues.name);
  if (explicitName) return explicitName;

  for (const column of Array.isArray(component?.columns) ? component.columns : []) {
    const value = normalizeText(rowValues[column]);
    if (value) return value;
  }

  return '';
}

async function run() {
  await mongoose.connect(MONGO_URI);

  const components = await Component.find(
    { name: { $regex: /^application$/i } },
    { neighborhoodName: 1, name: 1, columns: 1, rows: 1 }
  );

  if (!components.length) {
    console.log('No Application components found. Nothing to seed.');
    await mongoose.disconnect();
    return;
  }

  let updatedComponents = 0;
  let updatedRows = 0;

  for (const component of components) {
    let componentTouched = false;

    for (const row of component.rows || []) {
      const rowValues = rowValuesToObject(row.values);
      const appName = resolveAppName(component, rowValues);
      if (!appName) continue;

      const lifecycleStatus = pickLifecycle(appName, rowValues.lifecycleStatus || rowValues.lifecycle);
      const seedKey = `${component.neighborhoodName}|||${component.name}|||${appName}`;
      const annualCosts = generateAnnualCosts(seedKey, lifecycleStatus);

      row.values = {
        ...rowValues,
        lifecycleStatus,
        annualCosts,
      };

      componentTouched = true;
      updatedRows += 1;
    }

    if (componentTouched) {
      updatedComponents += 1;
      if (!dryRun) await component.save();
    }
  }

  console.log(dryRun ? 'DRY RUN COMPLETE' : 'SEED COMPLETE');
  console.log(`Application components updated: ${updatedComponents}`);
  console.log(`Application rows updated: ${updatedRows}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
