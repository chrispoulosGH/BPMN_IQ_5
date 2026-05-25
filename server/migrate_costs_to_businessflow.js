/**
 * migrate_costs_to_businessflow.js
 *
 * Moves annualTotalCosts from the applications collection into the businessflows
 * collection, structured as: businessflow → tasks[] → applications[] → annualCosts[].
 *
 * Task→app mapping is sourced from the TechFast BPMN XML text annotations.
 * After migration, annualTotalCosts is removed from all application documents.
 */

const mongoose = require('mongoose');

// Full task→application mapping parsed from TechFast BPMN XML text annotations
const TECHFAST_TASK_APP_MAP = [
  { name: 'Arrive on Prem Update Job',         applications: ['Atlas UI', 'EDGE', 'FED FASTBPM'] },
  { name: 'Authorize Job Tools',                applications: ['FED FASTBPM'] },
  { name: 'Call in Trouble',                    applications: [] },
  { name: 'Check Job Tools',                    applications: ['FED FASTBPM'] },
  { name: 'Check Navigation Directions',        applications: ['FED FASTBPM'] },
  { name: 'Complete Customer Satisfaction Survey', applications: [] },
  { name: 'Create Appointment',                 applications: ['ISBUS', 'IDP Commerce Enabler Services', 'TRiP', 'IDP Order Graph Cloud', 'CSI Work Force', 'ISAAC WFE', 'CCMule Service', 'FORCE DCOE', 'EDGE'] },
  { name: 'Customer Confirmation SMS',          applications: ['notifyNow', 'CCMule CLM', 'BWSFMC', 'CEP', 'ABPT'] },
  { name: 'Dispatch To Job',                    applications: ['Atlas UI', 'FED FASTBPM', 'WMS NT'] },
  { name: 'Get Job Tools',                      applications: ['FED FASTBPM'] },
  { name: 'Log Into Device',                    applications: ['Atlas UI', 'Halo E AM'] },
  { name: 'Lookup Customer',                    applications: ['IDP Customer Graph Cloud', 'DPG Sales Sunrise', 'CCM Clarify CM', 'CCSF', 'CCMULE', 'Platform Support ATTFEDGOV1', 'eTRACS'] },
  { name: 'Probe Customer',                     applications: ['Nimbus'] },
  { name: 'Provision Device',                   applications: ['Intune', 'Atlas UI', 'Halo E AM', 'MIMDM'] },
  { name: 'Sell Customer',                      applications: ['Nimbus'] },
  { name: 'Sign Customer',                      applications: ['Nimbus'] },
  { name: 'Troubleshoot',                       applications: ['Avertack', 'OPUS C', 'CSI Customer Care', 'TLG MOB', 'Digital IDP'] },
  { name: 'View Job',                           applications: ['DMP', 'Atlas UI', 'FED FASTBPM', 'Digital IDP', 'EDGE'] },
];

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const db = mongoose.connection;
  const appCol = db.collection('applications');
  const bfCol  = db.collection('businessflows');

  // 1. Load all app cost data into a map { appName → annualCosts[] }
  const appsWithCosts = await appCol.find(
    { annualTotalCosts: { $exists: true, $ne: null, $not: { $size: 0 } } },
    { projection: { name: 1, annualTotalCosts: 1, _id: 0 } }
  ).toArray();

  const costMap = {};
  for (const a of appsWithCosts) {
    costMap[a.name] = (a.annualTotalCosts || []).map(c => ({
      year:            c.year,
      operationCost:   c.operationCost   ?? 0,
      developmentCost: c.developmentCost ?? 0,
      totalCost:       c.totalCost       ?? 0,
    }));
  }
  console.log(`Loaded cost data for ${Object.keys(costMap).length} applications`);

  // 2. Build tasks array: only include apps that have cost data
  const tasks = TECHFAST_TASK_APP_MAP.map(task => ({
    name: task.name,
    applications: task.applications
      .filter(appName => costMap[appName])
      .map(appName => ({
        name: appName,
        annualCosts: costMap[appName],
      })),
  }));

  const totalAppRefs = tasks.reduce((s, t) => s + t.applications.length, 0);
  console.log(`Built ${tasks.length} tasks with ${totalAppRefs} app cost references`);
  tasks.forEach(t => {
    if (t.applications.length) console.log(`  ${t.name}: ${t.applications.map(a => a.name).join(', ')}`);
  });

  // 3. Update the TechFast businessflow document
  const result = await bfCol.updateOne(
    { name: 'TechFast' },
    { $set: { tasks } },
    { upsert: false }
  );
  if (result.matchedCount === 0) {
    console.error('ERROR: TechFast businessflow document not found — no update made');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`\nUpdated TechFast businessflow (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);

  // 4. Strip annualTotalCosts from all application documents
  const unsetResult = await appCol.updateMany(
    { annualTotalCosts: { $exists: true } },
    { $unset: { annualTotalCosts: '' } }
  );
  console.log(`Removed annualTotalCosts from ${unsetResult.modifiedCount} application documents`);

  await mongoose.disconnect();
  console.log('\nMigration complete.');
}

run().catch(err => { console.error(err); process.exit(1); });
