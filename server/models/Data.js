const mongoose = require('mongoose');

const dataQualifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    fieldName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const dataForeignKeySchema = new mongoose.Schema(
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

const dataRowSchema = new mongoose.Schema(
  {
    values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    tuple: { type: String, default: '' },
    componentQualifiers: {
      type: Map,
      of: new mongoose.Schema({ type: Map, of: mongoose.Schema.Types.Mixed }, { _id: false }),
      default: {},
    },
    foreignKeys: {
      type: Object,
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

const dataSchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, index: true, trim: true },
    modelName: { type: String, default: '', index: true, trim: true },
    name: { type: String, required: true, trim: true },
    dataType: { type: String, default: '', index: true, trim: true },
    sourceColumnName: { type: String, default: '', trim: true },
    shortDescription: { type: String, default: '', trim: true },
    parentFactoryName: { type: String, default: '', trim: true },
    componentType: { type: String, default: '', index: true, trim: true },
    columns: [{ type: String, required: true, trim: true }],
    qualifierColumns: { type: [dataQualifierSchema], default: [] },
    foreignKeyColumns: { type: [dataForeignKeySchema], default: [] },
    owner: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
    rows: [dataRowSchema],
  },
  { timestamps: true, collection: 'Data' }
);

dataSchema.index({ neighborhoodName: 1, modelName: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Data || mongoose.model('Data', dataSchema);