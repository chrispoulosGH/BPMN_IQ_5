const mongoose = require('mongoose');
const { VALID_STATES } = require('../services/stateTransitions');

const actorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    role: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    owner: { type: String, trim: true, default: null },
    state: { type: String, enum: VALID_STATES, default: 'published' },
  },
  { timestamps: true }
);

actorSchema.index({ name: 'text', role: 'text', description: 'text' });

module.exports = mongoose.models.Actor || mongoose.model('Actor', actorSchema);
