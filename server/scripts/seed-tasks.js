/**
 * Seed script: populates MongoDB reference data and tasks from the E2EUX Excel file.
 * Usage: node scripts/seed-tasks.js
 */
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Task = require('../models/Task');
const { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain } = require('../models/ReferenceData');

const EXCEL_PATH = path.resolve(__dirname, '../../data/E2EUX Journey View.xlsx');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

const ACTORS = ['Customer', 'Call Center Agent', 'Scheduler', 'Technician'];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Read Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1); // skip header

  // Collect unique values
  const businessFlows = new Set();
  const products = new Set();
  const applications = new Set();
  const channels = new Set();
  const domains = new Set();
  const subdomains = new Set();

  // Build task map: key = name|businessFlow|product -> aggregated applications
  const taskMap = new Map();

  for (const row of rows) {
    const product = (row[5] || '').trim();
    const domain = (row[7] || '').trim();
    const subdomain = (row[9] || '').trim();
    const businessFlow = (row[11] || '').trim();
    const sequence = row[12];
    const taskName = (row[13] || '').trim();
    const channel = (row[4] || '').trim();
    const application = (row[15] || '').trim();

    if (!taskName || !businessFlow || !product) continue;

    if (product) products.add(product);
    if (businessFlow) businessFlows.add(businessFlow);
    if (application) applications.add(application);
    if (channel) channels.add(channel);
    if (domain) domains.add(domain);
    if (subdomain) subdomains.add(subdomain);

    const key = `${taskName}|${businessFlow}|${product}`;
    if (!taskMap.has(key)) {
      taskMap.set(key, {
        name: taskName,
        businessFlow,
        product,
        domain,
        subdomain,
        channel,
        sequence: typeof sequence === 'number' ? sequence : undefined,
        applications: new Set(),
      });
    }
    if (application) taskMap.get(key).applications.add(application);
  }

  console.log(`Parsed: ${taskMap.size} unique tasks, ${businessFlows.size} flows, ${products.size} products, ${applications.size} apps`);

  // Upsert reference data
  const upsertRef = async (Model, values) => {
    for (const name of values) {
      await Model.updateOne({ name }, { name }, { upsert: true });
    }
  };

  await upsertRef(BusinessFlow, businessFlows);
  await upsertRef(Product, products);
  await upsertRef(Application, applications);
  await upsertRef(Channel, channels);
  await upsertRef(Domain, domains);
  await upsertRef(Subdomain, subdomains);
  await upsertRef(Actor, ACTORS);
  console.log('Reference data seeded');

  // Upsert tasks
  let created = 0;
  let updated = 0;
  for (const task of taskMap.values()) {
    const filter = { name: task.name, businessFlow: task.businessFlow, product: task.product };
    const doc = {
      ...filter,
      domain: task.domain,
      subdomain: task.subdomain,
      channel: task.channel,
      sequence: task.sequence,
      applications: [...task.applications],
    };
    const result = await Task.updateOne(filter, { $set: doc }, { upsert: true });
    if (result.upsertedCount) created++;
    else updated++;
  }

  console.log(`Tasks: ${created} created, ${updated} updated`);
  await mongoose.disconnect();
  console.log('Done');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
