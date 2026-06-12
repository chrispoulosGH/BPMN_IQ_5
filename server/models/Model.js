const mongoose = require('mongoose');

const modelQualifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    fieldName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const modelFactorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sourceColumnName: { type: String, required: true, trim: true },
    parentFactoryName: { type: String, default: '', trim: true },
    qualifierColumns: { type: [modelQualifierSchema], default: [] },
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
  },
  { timestamps: true, collection: 'models' }
);

module.exports = mongoose.models.Model || mongoose.model('Model', modelSchema);