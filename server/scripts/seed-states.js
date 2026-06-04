/**
 * Seed the states reference collection and set all existing
 * factory records (except diagrams) to state = 'approved'.
 *
 * Usage: node scripts/seed-states.js
 */
const mongoose = require('mongoose');
const State = require('../models/State');
const { VALID_STATES } = require('../services/stateTransitions');
const { BusinessFlow, Product, Application, Channel, Domain, Subdomain, LineOfBusiness } = require('../models/ReferenceData');
const Task = require('../models/Task');
const Actor = require('../models/Actor');
const Capability = require('../models/Capability');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to', MONGO_URI);

  // 1. Seed states collection
  const stateDescriptions = {
    invalid: 'Imported with invalid reference-data links that require correction',
    staged: 'Imported/staged, not yet reviewed',
    draft: 'Work in progress',
    submitted: 'Submitted for approval',
    approved: 'Approved by reviewer',
    rejected: 'Rejected, returned to draft',
    published: 'Published and active',
    deleted: 'Soft-deleted',
  };

  for (let i = 0; i < VALID_STATES.length; i++) {
    const name = VALID_STATES[i];
    await State.findOneAndUpdate(
      { name },
      { name, description: stateDescriptions[name] || '', order: i },
      { upsert: true, new: true }
    );
  }
  console.log('States seeded:', VALID_STATES.join(', '));

  // 2. Set all existing factory records (non-diagrams) to 'approved'
  const collections = [
    { model: BusinessFlow, name: 'BusinessFlow' },
    { model: Product, name: 'Product' },
    { model: Application, name: 'Application' },
    { model: Channel, name: 'Channel' },
    { model: Domain, name: 'Domain' },
    { model: Subdomain, name: 'Subdomain' },
    { model: LineOfBusiness, name: 'LineOfBusiness' },
    { model: Task, name: 'Task' },
    { model: Actor, name: 'Actor' },
    { model: Capability, name: 'Capability' },
  ];

  for (const { model, name } of collections) {
    const result = await model.updateMany(
      { $or: [{ state: { $exists: false } }, { state: null }] },
      { $set: { state: 'approved' } }
    );
    console.log(`${name}: ${result.modifiedCount} records set to 'approved'`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
