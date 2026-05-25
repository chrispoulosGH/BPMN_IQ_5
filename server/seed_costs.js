/**
 * Seed operation & development cost histories for all apps in My_TechFast diagram.
 * Years: 2016–2025 (10 years back from 2026)
 * - operationCosts:  all apps, random base $500K–$2M, grows 5–10%/yr
 * - developmentCosts: only 'build' and 'in_use' apps
 *     build   → random base $300K–$1.5M, grows 5–10%/yr
 *     in_use  → 20–50% of build base for same app, grows 5–10%/yr
 */

const mongoose = require('mongoose');
const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i); // 2016..2025

// Lifecycle pool — realistic distribution for a mature enterprise portfolio
const LIFECYCLE_POOL = [
  'in_use', 'in_use', 'in_use', 'in_use', 'in_use', 'in_use',  // 40%
  'build', 'build', 'build', 'build', 'build',                   // 33%
  'in_maintenance', 'in_maintenance', 'in_maintenance',           // 20%
  'propose_to_retire',                                            //  7%
];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pickLifecycle() {
  return LIFECYCLE_POOL[randInt(0, LIFECYCLE_POOL.length - 1)];
}

/** Generate a cost series starting at base, growing 5–10% each year */
function generateCostSeries(base) {
  const series = [];
  let current = base;
  for (let i = 0; i < YEARS.length; i++) {
    series.push(Math.round(current));
    current *= 1 + rand(0.05, 0.10);
  }
  return series;
}

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const db = mongoose.connection;

  // ── 1. Get app names from My_TechFast ──────────────────────────────────────
  const diag = await db.collection('diagrams').findOne({ name: 'My_TechFast' });
  if (!diag) { console.error('Diagram My_TechFast not found'); process.exit(1); }

  const appNames = [...new Set(
    diag.tasks.flatMap(t =>
      (t.applications || []).map(a => (typeof a === 'string' ? a : a.name))
    )
  )];

  console.log(`\nFound ${appNames.length} apps in My_TechFast\n`);

  // ── 2. Build & upsert each app ─────────────────────────────────────────────
  const results = [];

  for (const appName of appNames) {
    // Check if it already exists to preserve lifecycleStatus
    const existing = await db.collection('applications').findOne({ name: appName });
    const lifecycle = existing?.lifecycleStatus || pickLifecycle();

    // Operation cost: all apps
    const opBase = rand(500_000, 2_000_000);
    const operationCosts = generateCostSeries(opBase).map((cost, i) => ({
      year: YEARS[i], cost
    }));

    // Development cost: build and in_use only
    let developmentCosts = null;
    let devBase = null;
    if (lifecycle === 'build') {
      devBase = rand(300_000, 1_500_000);
      developmentCosts = generateCostSeries(devBase).map((cost, i) => ({
        year: YEARS[i], cost
      }));
    } else if (lifecycle === 'in_use') {
      // in_use dev cost = 20–50% of a build-scale base
      const buildEquivalent = rand(300_000, 1_500_000);
      devBase = buildEquivalent * rand(0.20, 0.50);
      developmentCosts = generateCostSeries(devBase).map((cost, i) => ({
        year: YEARS[i], cost
      }));
    }

    // Annual total costs
    const annualTotalCosts = YEARS.map((year, i) => {
      const opCost = operationCosts[i].cost;
      const devCost = developmentCosts ? developmentCosts[i].cost : 0;
      return { year, operationCost: opCost, developmentCost: devCost, totalCost: opCost + devCost };
    });

    await db.collection('applications').updateOne(
      { name: appName },
      {
        $set: {
          lifecycleStatus: lifecycle,
          operationCosts,
          developmentCosts: developmentCosts || [],
          annualTotalCosts,
          updatedAt: new Date(),
        },
        $setOnInsert: { name: appName, createdAt: new Date() },
      },
      { upsert: true }
    );

    results.push({ appName, lifecycle, operationCosts, developmentCosts, annualTotalCosts });
  }

  // ── 3. Print report ────────────────────────────────────────────────────────
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');

  console.log('═'.repeat(120));
  console.log('COST REPORT — My_TechFast Applications (2016–2025)');
  console.log('═'.repeat(120));
  console.log(
    'Application'.padEnd(34) +
    'Lifecycle'.padEnd(20) +
    YEARS.map(y => String(y).padStart(13)).join('')
  );
  console.log('─'.repeat(120));

  let grandOp = Array(10).fill(0);
  let grandDev = Array(10).fill(0);
  let grandTotal = Array(10).fill(0);

  for (const { appName, lifecycle, annualTotalCosts } of results) {
    const opRow  = annualTotalCosts.map(r => fmt(r.operationCost).padStart(13)).join('');
    const devRow = annualTotalCosts.map(r => fmt(r.developmentCost).padStart(13)).join('');
    const totRow = annualTotalCosts.map(r => fmt(r.totalCost).padStart(13)).join('');

    annualTotalCosts.forEach((r, i) => {
      grandOp[i]    += r.operationCost;
      grandDev[i]   += r.developmentCost;
      grandTotal[i] += r.totalCost;
    });

    const truncName = appName.length > 32 ? appName.slice(0, 31) + '…' : appName;
    const lc = lifecycle.padEnd(18);
    console.log(`\n${truncName.padEnd(34)}${lc}  OPER ${opRow}`);
    if (lifecycle === 'build' || lifecycle === 'in_use') {
      console.log(' '.repeat(34) + ' '.repeat(20) + `  DEV  ${devRow}`);
    }
    console.log(' '.repeat(34) + ' '.repeat(20) + `  TOT  ${totRow}`);
  }

  console.log('\n' + '═'.repeat(120));
  console.log('PORTFOLIO TOTALS'.padEnd(54) + grandOp.map((v,i) => fmt(v).padStart(13)).join(''));
  console.log(' '.repeat(54) + grandDev.map(v => fmt(v).padStart(13)).join(''));
  console.log(' '.repeat(54) + grandTotal.map(v => fmt(v).padStart(13)).join(''));
  console.log('═'.repeat(120));
  console.log(`\nYear labels (columns left→right): ${YEARS.join(', ')}`);
  console.log(`\nRows: OPER = operation cost | DEV = development cost | TOT = total`);
  console.log(`\n✓ Updated ${results.length} application documents in MongoDB\n`);

  await mongoose.disconnect();
})();
