const mongoose = require('mongoose');

const customFactoryRowSchema = new mongoose.Schema(
  {
    values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    owner: { type: String, default: '' },
    state: { type: String, default: 'staged' },
  },
  { timestamps: true }
);

const customFactorySchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    columns: [{ type: String, required: true, trim: true }],
    owner: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
    rows: [customFactoryRowSchema],
  },
  { timestamps: true }
);

customFactorySchema.index({ neighborhoodName: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CustomFactory', customFactorySchema);