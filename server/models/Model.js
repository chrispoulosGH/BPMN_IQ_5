const mongoose = require('mongoose');

const modelQualifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    fieldName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const modelForeignKeySchema = new mongoose.Schema(
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

const modelFactorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    parentFactoryName: { type: String, default: '', trim: true },
    qualifierColumns: { type: [modelQualifierSchema], default: [] },
    foreignKeyColumns: { type: [modelForeignKeySchema], default: [] },
    level: { type: Number, default: 0 },
  },
  { _id: false }
);

const modelCatalogRowSchema = new mongoose.Schema(
  {
    values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const modelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    owner: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
    modelCatalogColumns: { type: [String], default: [] },
    modelCatalogRows: { type: [modelCatalogRowSchema], default: [] },
    schemaFactories: { type: [modelFactorySchema], default: [] },
    tupleType: { type: [String], default: [] }, // Column names ending in "Component" - defines the tuple key
    modelCatalogHash: { type: Object, default: {} }, // Hash of concatenated tuple values from model rows (plain object, not Map)
  },
  { timestamps: true, collection: 'models' }
);

module.exports = mongoose.models.Model || mongoose.model('Model', modelSchema);