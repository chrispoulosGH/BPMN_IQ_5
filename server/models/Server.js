const mongoose = require('mongoose');

const linkedApplicationSchema = new mongoose.Schema({
  correlationId: { type: String, default: null },
  name: { type: String, default: null },
  acronym: { type: String, default: null },
  apmNumber: { type: String, default: null },
  relationType: { type: String, default: null },
  relationSystemId: { type: String, default: null },
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

const serverSchema = new mongoose.Schema({
  sourceKey: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  serverSystemId: { type: String, default: null },
  objectId: { type: String, default: null },
  assetId: { type: String, default: null },
  assetTag: { type: String, default: null },
  hostName: { type: String, default: null },
  fqdn: { type: String, default: null },
  ipAddress: { type: String, default: null },
  macAddress: { type: String, default: null },
  environment: { type: String, default: null },
  installStatus: { type: String, default: null },
  operationalStatus: { type: String, default: null },
  lifecycleStage: { type: String, default: null },
  lifecycleStatus: { type: String, default: null },
  usedFor: { type: String, default: null },
  os: { type: String, default: null },
  osVersion: { type: String, default: null },
  osDomain: { type: String, default: null },
  osServicePack: { type: String, default: null },
  normalizedOs: { type: String, default: null },
  normalizedOsVersion: { type: String, default: null },
  normalizedOsServicePack: { type: String, default: null },
  vendorName: { type: String, default: null },
  manufacturer: { type: String, default: null },
  modelNumber: { type: String, default: null },
  serialNumber: { type: String, default: null },
  cpuCount: { type: Number, default: null },
  cpuName: { type: String, default: null },
  cpuSpeed: { type: String, default: null },
  ram: { type: Number, default: null },
  location: { type: String, default: null },
  supportGroup: { type: String, default: null },
  supportedBy: { type: String, default: null },
  managedByGroup: { type: String, default: null },
  cloudAccountId: { type: String, default: null },
  internetFacing: { type: String, default: null },
  virtualized: { type: Boolean, default: null },
  className: { type: String, default: null },
  relationTypes: [{ type: String }],
  relationPorts: [{ type: String }],
  linkedApplications: [linkedApplicationSchema],
  healthNotes: [healthNoteSchema],
}, { timestamps: true });

serverSchema.index({ name: 1 });
serverSchema.index({ serverSystemId: 1 });
serverSchema.index({ hostName: 1 });
serverSchema.index({ fqdn: 1 });
serverSchema.index({ ipAddress: 1 });
serverSchema.index({ 'linkedApplications.correlationId': 1 });
serverSchema.index({ 'linkedApplications.name': 1 });
serverSchema.index({ 'healthNotes.label': 1 });

module.exports = mongoose.model('Server', serverSchema);