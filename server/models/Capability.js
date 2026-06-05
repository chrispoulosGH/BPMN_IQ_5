const mongoose = require('mongoose');
const { VALID_STATES } = require('../services/stateTransitions');
const { DEFAULT_NEIGHBORHOOD_NAME } = require('../utils/neighborhoodScope');

const capabilitySchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, trim: true, default: DEFAULT_NEIGHBORHOOD_NAME, index: true },
    capabilityId: {
      type: Number,
      required: true,
      index: true,
    },
    aspectOrder: { type: Number },
    domainOrder: { type: Number },
    domainName: { type: String, trim: true, index: true },
    aspect: { type: String, trim: true, index: true },
    domainIndependentName: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    briefDescription: { type: String, default: '' },
    fullDescription: { type: String, default: '' },
    definition: { type: String, default: '' },
    characteristics: { type: String, default: '' },
    decompositionExamples: { type: String, default: '' },
    references: { type: String, default: '' },
    tmfStatus: { type: String, default: '' },
    tmfVersion: { type: String, default: '' },
    owner: { type: String, trim: true, default: null },
    state: { type: String, enum: VALID_STATES, default: 'published' },
  },
  { timestamps: true }
);

capabilitySchema.index({ neighborhoodName: 1, capabilityId: 1 }, { unique: true });

// Text index for search by name/description/domain
capabilitySchema.index({ name: 'text', briefDescription: 'text', domainName: 'text', aspect: 'text' });

module.exports = mongoose.model('Capability', capabilitySchema);
