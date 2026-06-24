const mongoose = require('mongoose');

const componentQualifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    fieldName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const componentForeignKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    fieldName: { type: String, required: true, trim: true },
    targetReference: { type: String, default: '', trim: true },
    targetGroup: { type: String, default: '', trim: true },
    targetScope: { type: String, default: '', trim: true },
    targetColumnName: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const componentRowSchema = new mongoose.Schema(
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

const componentSchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, index: true, trim: true },
    modelName: { type: String, default: '', index: true, trim: true },
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, default: '', trim: true },
    shortDescription: { type: String, default: '', trim: true },
    parentFactoryName: { type: String, default: '', trim: true },
    columns: [{ type: String, required: true, trim: true }],
    qualifierColumns: { type: [componentQualifierSchema], default: [] },
    foreignKeyColumns: { type: [componentForeignKeySchema], default: [] },
    owner: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
    rows: [componentRowSchema],
  },
  { timestamps: true, collection: 'components' }
);

// Ensure uniqueness across neighborhood + model + name to support model namespaces
componentSchema.index({ neighborhoodName: 1, modelName: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Component || mongoose.model('Component', componentSchema);