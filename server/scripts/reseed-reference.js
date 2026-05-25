/**
 * Reseed reference data (EXCEPT Application and BusinessFlow) from "E2EUX Journey Data Loader.xlsx".
 * Drops and rebuilds: LineOfBusiness, Channel, Product, Domain, Subdomain.
 * Also reseeds Tasks.
 * NOTE: BusinessFlow is now driven by diagram XML import (1:1 with diagrams collection).
 *
 * Usage: node scripts/reseed-reference.js
 */
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Task = require('../models/Task');
const { Product, Actor, Channel, Domain, Subdomain, LineOfBusiness } = require('../models/ReferenceData');

const EXCEL_PATH = path.resolve(__dirname, '../../data/E2EUX Journey Data Loader.xlsx');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

const ACTORS = ['Customer', 'Call Center Agent', 'Scheduler', 'Technician'];

async function reseed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Read Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1); // skip header

  // Collect unique values
  const linesOfBusiness = new Set();
  const channels = new Set();
  const products = new Set();
  const domains = new Set();
  const subdomains = new Set();

  // Build task map: key = name|businessFlow|product -> aggregated applications
  const taskMap = new Map();

  for (const row of rows) {
    const lineOfBusiness = (row[2] || '').trim();
    const channel = (row[3] || '').trim();
    const product = (row[4] || '').trim();
    const domain = (row[6] || '').trim();
    const subdomain = (row[8] || '').trim();
    const businessFlow = (row[10] || '').trim();
    const sequence = row[11]; // e2eux_sequence
    const taskName = (row[13] || '').trim(); // e2eux
    const application = (row[15] || '').trim();

    if (!taskName || !businessFlow || !product) continue;

    if (lineOfBusiness) linesOfBusiness.add(lineOfBusiness);
    if (channel) channels.add(channel);
    if (product) products.add(product);
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
        lineOfBusiness,
        sequence: typeof sequence === 'number' ? sequence : undefined,
        applications: new Set(),
      });
    }
    if (application) taskMap.get(key).applications.add(application);
  }

  console.log(`Parsed: ${taskMap.size} tasks, ${linesOfBusiness.size} LOBs, ${channels.size} channels, ${products.size} products, ${domains.size} domains, ${subdomains.size} subdomains`);

  // Drop collections (except Application)
  console.log('Dropping reference collections (except Application)...');
  await LineOfBusiness.deleteMany({});
  await Channel.deleteMany({});
  await Product.deleteMany({});
  await Domain.deleteMany({});
  await Subdomain.deleteMany({});
  await Actor.deleteMany({});
  await Task.deleteMany({});
  console.log('Dropped.');

  // Insert reference data
  const insertRef = async (Model, values, label) => {
    const docs = [...values].map(name => ({ name }));
    if (docs.length) await Model.insertMany(docs);
    console.log(`  ${label}: ${docs.length}`);
  };

  await insertRef(LineOfBusiness, linesOfBusiness, 'Lines of Business');
  await insertRef(Channel, channels, 'Channels');
  await insertRef(Product, products, 'Products');
  await insertRef(Domain, domains, 'Domains');
  await insertRef(Subdomain, subdomains, 'Subdomains');
  await insertRef(Actor, ACTORS, 'Actors');
  console.log('Reference data seeded.');

  // Insert tasks
  const taskDocs = [...taskMap.values()].map(t => ({
    name: t.name,
    businessFlow: t.businessFlow,
    product: t.product,
    domain: t.domain,
    subdomain: t.subdomain,
    channel: t.channel,
    sequence: t.sequence,
    applications: [...t.applications],
  }));
  await Task.insertMany(taskDocs, { ordered: false }).catch(err => {
    // Handle duplicate key errors from the unique index
    if (err.code === 11000 || err.writeErrors) {
      const inserted = err.result?.insertedCount || err.insertedDocs?.length || 0;
      console.log(`Tasks: ${inserted} inserted (some duplicates skipped)`);
    } else {
      throw err;
    }
  });
  const taskCount = await Task.countDocuments();
  console.log(`Tasks total in DB: ${taskCount}`);

  await mongoose.disconnect();
  console.log('Done.');
}

reseed().catch(err => {
  console.error(err);
  process.exit(1);
});
