const mongoose = require('mongoose');

const diagramSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    xml: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    version: {
      type: Number,
      default: 1,
    },
    fileName: {
      type: String,
      default: null,
    },
    capabilities: {
      type: [
        {
          capabilityId: Number,
          capabilityName: String,
          confidence: Number,
          justification: String,
        },
      ],
      default: [],
    },
    changeHistory: {
      type: [
        {
          date: { type: Date, default: Date.now },
          userId: { type: String, required: true },
          note: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Text index for search
diagramSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Diagram', diagramSchema);
