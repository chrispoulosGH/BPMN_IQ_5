const mongoose = require('mongoose');
const { VALID_STATES } = require('../services/stateTransitions');
const { DEFAULT_NEIGHBORHOOD_NAME } = require('../utils/neighborhoodScope');

const actorSchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, trim: true, default: DEFAULT_NEIGHBORHOOD_NAME, index: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    owner: { type: String, trim: true, default: null },
    state: { type: String, enum: VALID_STATES, default: 'published' },
  },
  { timestamps: true }
);

actorSchema.index({ neighborhoodName: 1, name: 1 }, { unique: true });
actorSchema.index({ name: 'text', role: 'text', description: 'text' });

module.exports = mongoose.models.Actor || mongoose.model('Actor', actorSchema);
