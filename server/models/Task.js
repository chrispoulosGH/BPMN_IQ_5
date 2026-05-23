const mongoose = require('mongoose');
const { VALID_STATES } = require('../services/stateTransitions');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  businessFlow: { type: String, required: true, trim: true },
  product: { type: String, required: true, trim: true },
  domain: { type: String, trim: true },
  subdomain: { type: String, trim: true },
  channel: { type: String, trim: true },
  actor: { type: String, trim: true },
  applications: [{ type: String, trim: true }],
  sequence: { type: Number },
  owner: { type: String, trim: true, default: null },
  state: { type: String, enum: VALID_STATES, default: 'published' },
}, { timestamps: true });

// A task is unique by name + businessFlow + product
taskSchema.index({ name: 1, businessFlow: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('Task', taskSchema);
