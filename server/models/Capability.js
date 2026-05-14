const mongoose = require('mongoose');

const capabilitySchema = new mongoose.Schema(
  {
    capabilityId: {
      type: Number,
      required: true,
      unique: true,
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
  },
  { timestamps: true }
);

// Text index for search by name/description/domain
capabilitySchema.index({ name: 'text', briefDescription: 'text', domainName: 'text', aspect: 'text' });

module.exports = mongoose.model('Capability', capabilitySchema);
