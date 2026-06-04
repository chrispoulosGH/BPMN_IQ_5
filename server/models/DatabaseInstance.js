const mongoose = require('mongoose');

const linkedApplicationSchema = new mongoose.Schema({
  correlationId: { type: String, default: null },
  name: { type: String, default: null },
  acronym: { type: String, default: null },
  apmNumber: { type: String, default: null },
  serviceName: { type: String, default: null },
}, { _id: false });

const healthNoteSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], default: 'info' },
  note: { type: String, required: true, trim: true },
  rationale: { type: String, default: null },
  decisionFactors: [{ type: String }],
  vulnerabilities: [{ type: String }],
  sourceUrl: { type: String, default: null },
}, { _id: false });

const databaseInstanceSchema = new mongoose.Schema({
  sourceKey: { type: String, required: true, unique: true, trim: true },
  apmNumber: { type: String, default: null },
  applicationCorrelationId: { type: String, default: null },
  applicationAcronym: { type: String, default: null },
  applicationName: { type: String, default: null },
  applicationInstallStatus: { type: String, default: null },
  serviceName: { type: String, default: null },
  instanceName: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  databaseClassName: { type: String, default: null },
  applicationOwner: { type: String, default: null },
  lowestLevelOwner: { type: String, default: null },
  lowestLevelOwnerUserName: { type: String, default: null },
  version: { type: String, default: null },
  vendor: { type: String, default: null },
  ownedBy: { type: String, default: null },
  location: { type: String, default: null },
  lifecycleStageStatus: { type: String, default: null },
  normalizedVendor: { type: String, default: null },
  linkedApplications: [linkedApplicationSchema],
  healthNotes: [healthNoteSchema],
}, { timestamps: true });

databaseInstanceSchema.index({ name: 1 });
databaseInstanceSchema.index({ instanceName: 1 });
databaseInstanceSchema.index({ applicationCorrelationId: 1 });
databaseInstanceSchema.index({ applicationName: 1 });
databaseInstanceSchema.index({ databaseClassName: 1 });
databaseInstanceSchema.index({ normalizedVendor: 1 });
databaseInstanceSchema.index({ 'linkedApplications.correlationId': 1 });
databaseInstanceSchema.index({ 'linkedApplications.name': 1 });
databaseInstanceSchema.index({ 'healthNotes.label': 1 });

module.exports = mongoose.model('DatabaseInstance', databaseInstanceSchema);