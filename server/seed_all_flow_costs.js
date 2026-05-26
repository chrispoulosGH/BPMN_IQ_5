/**
 * seed_all_flow_costs.js
 *
 * Seeds realistic enterprise cost data (tasks + applications + annualCosts)
 * for all 100 business flows in the `businessflows` collection.
 *
 * Cost model is based on large enterprise (AT&T / Telco scale) benchmarks:
 *   Tier 1 (core / billing / CRM / ERP): $2M–$15M op, $800K–$6M dev
 *   Tier 2 (supporting systems):          $500K–$3M op,  $150K–$1.2M dev
 *   Tier 3 (peripheral / utilities):      $80K–$600K op,  $30K–$300K dev
 *
 * Growth model (2016–2025):
 *   Operation costs:   base +3–6% / yr (contract escalation + inflation)
 *     - Periodic efficiency drives every 3–5 yrs reduce op by 8–18%
 *   Development costs: much more volatile, ±5–35% year on year
 *     - Active build apps trend upward in early years, taper after launch
 *     - in_use apps have moderate dev peaks around major releases
 *     - in_maintenance apps have low, declining dev spend
 *     - propose_to_retire: near-zero dev, declining op
 *
 * Skips any flow that already has tasks with application cost data.
 */

'use strict';

const mongoose = require('mongoose');

// ── Constants ──────────────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i); // 2016..2025
const MONGO_URI = 'mongodb://127.0.0.1:27017/bpmn_iq';

// ── Seeded Pseudo-Random (deterministic per flow name, so re-runs are stable) ──
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randBetween(rng, min, max) {
  return rng() * (max - min) + min;
}

function randIntBetween(rng, min, max) {
  return Math.floor(randBetween(rng, min, max + 1));
}

function pickFrom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Task Templates keyed by flow category ─────────────────────────────────────
const TASK_SETS = {
  order: [
    'Authenticate Customer', 'Lookup Customer Account', 'Select Product', 'Check Credit',
    'Configure Service Options', 'Validate Address', 'Submit Order', 'Process Payment',
    'Provision Service', 'Assign Device', 'Activate Service', 'Send Confirmation',
    'Schedule Installation', 'Complete Order',
  ],
  upgrade: [
    'Verify Customer Identity', 'Load Account Details', 'Select Upgrade Option',
    'Trade In Device Assessment', 'Apply Promotion', 'Update Rate Plan', 'Process Trade Value',
    'Submit Upgrade Order', 'Provision New Service', 'Ship or Assign Device',
    'Deactivate Old Device', 'Send Order Confirmation',
  ],
  activation: [
    'Receive Activation Request', 'Validate SIM / IMEI', 'Check Network Availability',
    'Assign Number', 'Set Provisioning Parameters', 'Push Device Configuration',
    'Test Connectivity', 'Update CRM Record', 'Send Welcome Notification',
  ],
  billing: [
    'Collect Usage Data', 'Apply Rate Charges', 'Calculate Taxes and Surcharges',
    'Apply Credits and Adjustments', 'Generate Invoice', 'Post to Accounts Receivable',
    'Send Bill Notification', 'Process Payment', 'Reconcile Payments', 'Generate Reports',
  ],
  payroll: [
    'Collect Time Data', 'Validate Timesheet Entries', 'Calculate Gross Pay',
    'Apply Deductions', 'Calculate Net Pay', 'Generate Payroll File',
    'Post to General Ledger', 'Distribute Payments', 'File Tax Reports', 'Archive Records',
  ],
  support: [
    'Log Support Request', 'Triage Incident', 'Diagnose Issue', 'Schedule Dispatch',
    'Dispatch Technician', 'Perform On-Site Repair', 'Test Resolution', 'Update Ticket',
    'Notify Customer', 'Close Incident', 'Capture Customer Satisfaction',
  ],
  sales: [
    'Create Opportunity', 'Qualify Lead', 'Generate Proposal', 'Create Quote',
    'Negotiation', 'Legal Review', 'Execute Contract', 'Submit Sales Order',
    'Hand Off to Provisioning', 'Revenue Recognition',
  ],
  hr: [
    'Post Job Requisition', 'Screen Applications', 'Schedule Interviews',
    'Background Check', 'Generate Offer Letter', 'Complete Onboarding Forms',
    'Provision Systems Access', 'Assign Training', 'Enroll in Benefits', 'New Hire Orientation',
  ],
  dispatch: [
    'Receive Work Order', 'Assign Crew', 'Load Vehicle', 'Navigate to Site',
    'Complete Field Work', 'Capture Job Evidence', 'Update Work Order Status',
    'Return Equipment', 'Submit Field Report',
  ],
  generic: [
    'Initiate Request', 'Validate Input', 'Route for Approval', 'Execute Process',
    'Update Records', 'Notify Stakeholders', 'Archive Transaction', 'Generate Report',
  ],
};

function classifyFlow(name) {
  const n = name.toLowerCase();
  if (/payroll|pay input|gl|disbursement/.test(n)) return 'payroll';
  if (/billing|invoice|charge|rate plan|prepaid|postpaid|radius|ericsson/.test(n)) return 'billing';
  if (/hire|onboard|workday/.test(n)) return 'hr';
  if (/upgrade|add a line|add line|trade|anytime|lic|nua/.test(n)) return 'upgrade';
  if (/activat|provision/.test(n)) return 'activation';
  if (/order|purchase|buy|bopis|aop|cart|checkout/.test(n)) return 'order';
  if (/troubleshoot|repair|support|triage|callback|assurance/.test(n)) return 'support';
  if (/sales|opportunity|proposal|quote|contract/.test(n)) return 'sales';
  if (/dispatch|bury|bore|drop|install|expert path/.test(n)) return 'dispatch';
  return 'generic';
}

// ── Enterprise App Tier Assignment ────────────────────────────────────────────
// Tier is derived from app name keywords to simulate realistic cost stratification
function appTier(appName) {
  const n = appName.toLowerCase();
  // Tier 1: core enterprise platforms (billing, CRM, ERP, large orchestration)
  if (/billing|crm|erp|oracle|salesforce|workday|sap|mainframe|core|commerce|order graph|oss|bss|revenue|clarify|siebel|amdocs|ericsson|genesis|mediation/.test(n)) return 1;
  // Tier 2: mid-size supporting systems
  if (/workflow|portal|platform|analytics|warehouse|reporting|middleware|mule|service|catalog|idp|provisioning|identity|gateway|api|integration/.test(n)) return 2;
  // Tier 3: small utilities & tools
  return 3;
}

// ── Cost Generation ───────────────────────────────────────────────────────────
// Base ranges per tier per lifecycle
const BASE_RANGES = {
  1: { op: [2_000_000, 14_000_000], dev: [800_000, 5_500_000] },
  2: { op: [500_000, 3_000_000],    dev: [150_000, 1_200_000] },
  3: { op: [80_000, 600_000],       dev: [30_000, 280_000]    },
};

const LIFECYCLE_DEV_MULTIPLIERS = {
  build:             { devFactor: 1.0,  opFactor: 0.65 },  // high dev, below-full op
  in_use:            { devFactor: 0.38, opFactor: 1.0  },  // moderate dev, full op
  in_maintenance:    { devFactor: 0.12, opFactor: 0.80 },  // minimal dev
  propose_to_retire: { devFactor: 0.04, opFactor: 0.55 },  // near-zero dev, declining op
};

function generateAnnualCosts(appName, lifecycleStatus, rng) {
  const tier = appTier(appName);
  const range = BASE_RANGES[tier];
  const lc = LIFECYCLE_DEV_MULTIPLIERS[lifecycleStatus] || { devFactor: 0.3, opFactor: 0.9 };

  // Base costs (first year: 2016)
  const opBase  = randBetween(rng, range.op[0], range.op[1]) * lc.opFactor;
  const devBase = randBetween(rng, range.dev[0], range.dev[1]) * lc.devFactor;

  const annualCosts = [];
  let opCurrent  = opBase;
  let devCurrent = devBase;

  // Efficiency-drive years: random offsets in each flow so they don't all align
  const efficiencyYear1 = 2016 + randIntBetween(rng, 1, 4); // one drive mid-period
  const efficiencyYear2 = efficiencyYear1 + randIntBetween(rng, 3, 5); // possibly a second

  for (let yi = 0; yi < YEARS.length; yi++) {
    const year = YEARS[yi];

    // ── Operation cost evolution ─────────────────────────────────────────────
    let opGrowth = 1 + randBetween(rng, 0.03, 0.065); // base +3–6.5%/yr

    if (year === efficiencyYear1 || year === efficiencyYear2) {
      // Efficiency program: 8–18% reduction
      opGrowth = 1 - randBetween(rng, 0.08, 0.18);
    }

    // Cloud migration tailwind (2019–2022): slight op reduction chance
    if (year >= 2019 && year <= 2022 && rng() < 0.25) {
      opGrowth *= 1 - randBetween(rng, 0.03, 0.08);
    }

    // Post-pandemic surge (2021–2023): some systems saw op cost spikes
    if (year >= 2021 && year <= 2023 && rng() < 0.20) {
      opGrowth *= 1 + randBetween(rng, 0.04, 0.12);
    }

    if (lifecycleStatus === 'propose_to_retire') {
      opGrowth = Math.min(opGrowth, 1 - randBetween(rng, 0.05, 0.15));
    }

    if (yi > 0) opCurrent = opCurrent * opGrowth;

    // ── Development cost evolution ───────────────────────────────────────────
    let devGrowth;

    if (lifecycleStatus === 'build') {
      // Build apps: dev ramps up first 3 yrs, plateaus, then drops post-launch
      if (yi < 3)       devGrowth = 1 + randBetween(rng, 0.10, 0.35);
      else if (yi < 6)  devGrowth = 1 + randBetween(rng, -0.05, 0.15);
      else              devGrowth = 1 + randBetween(rng, -0.25, 0.05);
    } else if (lifecycleStatus === 'in_use') {
      // In-use: periodic feature releases cause spikes; occasional cuts
      if (rng() < 0.20) devGrowth = 1 + randBetween(rng, 0.15, 0.40);  // release spike
      else if (rng() < 0.20) devGrowth = 1 - randBetween(rng, 0.10, 0.30); // budget cut
      else devGrowth = 1 + randBetween(rng, -0.05, 0.12); // normal variation
    } else if (lifecycleStatus === 'in_maintenance') {
      // Maintenance: generally declining dev spend
      devGrowth = 1 + randBetween(rng, -0.20, 0.05);
    } else if (lifecycleStatus === 'propose_to_retire') {
      devGrowth = 1 + randBetween(rng, -0.40, -0.05);
    } else {
      devGrowth = 1 + randBetween(rng, -0.08, 0.15);
    }

    if (yi > 0) devCurrent = Math.max(devCurrent * devGrowth, 0);

    const opRounded  = Math.round(opCurrent);
    const devRounded = Math.round(devCurrent);

    annualCosts.push({
      year,
      operationCost:   opRounded,
      developmentCost: devRounded,
      totalCost:       opRounded + devRounded,
    });
  }

  return annualCosts;
}

// ── Task + App Selection ───────────────────────────────────────────────────────
/**
 * Pick task names and app assignments for a given business flow.
 * We pick 5–12 tasks from the relevant template, then for each task
 * select 2–6 apps from the available app pool (random but skewed towards
 * realistic cardinality for a large enterprise).
 */
function buildTasksForFlow(flowName, allApps, rng) {
  const category  = classifyFlow(flowName);
  const taskPool  = TASK_SETS[category] || TASK_SETS.generic;
  const numTasks  = randIntBetween(rng, 5, Math.min(12, taskPool.length));

  // Shuffle task pool deterministically, then take numTasks
  const shuffled = [...taskPool].sort(() => rng() - 0.5);
  const chosenTasks = shuffled.slice(0, numTasks);

  return chosenTasks.map((taskName, taskIdx) => {
    // Apps per task: 2–6
    const numApps = randIntBetween(rng, 2, 6);
    // Shuffle available apps and take a slice; we re-seed per task for variety
    const taskRng = seededRng(hashStr(flowName + taskName + taskIdx));
    const appPool = [...allApps].sort(() => taskRng() - 0.5).slice(0, numApps * 6);
    const chosenApps = appPool.slice(0, numApps);

    return {
      name: taskName,
      applications: chosenApps.map(app => {
        const appRng = seededRng(hashStr(flowName + taskName + app.name));
        return {
          name: app.name,
          annualCosts: generateAnnualCosts(app.name, app.lifecycleStatus, appRng),
        };
      }),
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection;
  const bfCol  = db.collection('businessflows');
  const appCol = db.collection('applications');

  // Load all apps (name + lifecycleStatus). Only use apps with a known lifecycle.
  const allApps = await appCol.find(
    { lifecycleStatus: { $in: ['build', 'in_use', 'in_maintenance', 'propose_to_retire'] } },
    { projection: { name: 1, lifecycleStatus: 1, _id: 0 } }
  ).toArray();

  console.log(`Loaded ${allApps.length} apps with known lifecycle status`);

  // Load all business flows
  const flows = await bfCol.find({}).toArray();
  console.log(`Processing ${flows.length} business flows\n`);

  let seeded = 0;
  let skipped = 0;

  for (const flow of flows) {
    // Skip if already has task cost data
    const hasData = Array.isArray(flow.tasks) &&
      flow.tasks.some(t =>
        Array.isArray(t.applications) &&
        t.applications.some(a => Array.isArray(a.annualCosts) && a.annualCosts.length > 0)
      );

    if (hasData) {
      console.log(`  SKIP  ${flow.name} (already has cost data)`);
      skipped++;
      continue;
    }

    // Use a deterministic seed per flow name for reproducibility
    const rng = seededRng(hashStr(flow.name));
    const tasks = buildTasksForFlow(flow.name, allApps, rng);

    const totalApps = tasks.reduce((s, t) => s + t.applications.length, 0);
    const totalCostPoints = totalApps * YEARS.length;

    await bfCol.updateOne(
      { _id: flow._id },
      { $set: { tasks } }
    );

    console.log(`  SEEDED  ${flow.name.padEnd(55)} | ${tasks.length} tasks | ${totalApps} apps | ${totalCostPoints} cost points`);
    seeded++;
  }

  console.log(`\nDone. Seeded: ${seeded} | Skipped (already had data): ${skipped}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
