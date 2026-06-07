const mongoose = require('mongoose');

const customFactoryQualifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    fieldName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const customFactoryRowSchema = new mongoose.Schema(
  {
    values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    owner: { type: String, default: '' },
    state: { type: String, default: 'staged' },
    sourcedFrom: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    parentFactoryName: { type: String, default: '' },
    parentName: { type: String, default: '' },
  },
  { timestamps: true }
);

const customFactorySchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, default: '', trim: true },
    parentFactoryName: { type: String, default: '', trim: true },
    columns: [{ type: String, required: true, trim: true }],
    qualifierColumns: { type: [customFactoryQualifierSchema], default: [] },
    owner: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
    rows: [customFactoryRowSchema],
  },
  { timestamps: true }
);

customFactorySchema.index({ neighborhoodName: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CustomFactory', customFactorySchema);