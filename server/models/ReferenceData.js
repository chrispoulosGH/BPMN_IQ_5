const mongoose = require('mongoose');
const { VALID_STATES } = require('../services/stateTransitions');
const { DEFAULT_NEIGHBORHOOD_NAME } = require('../utils/neighborhoodScope');

// Shared schema for simple name-only reference collections
const refSchema = new mongoose.Schema({
  neighborhoodName: { type: String, required: true, trim: true, default: DEFAULT_NEIGHBORHOOD_NAME, index: true },
  name: { type: String, required: true, trim: true },
  owner: { type: String, trim: true, default: null },
  state: { type: String, enum: VALID_STATES, default: 'published' },
}, { timestamps: true });

refSchema.index({ neighborhoodName: 1, name: 1 }, { unique: true });

// Sub-schemas for BusinessFlow task→application cost embedding
const annualCostSchema = new mongoose.Schema({
  year: { type: Number },
  operationCost: { type: Number, default: 0 },
  developmentCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
}, { _id: false });

const bfAppSchema = new mongoose.Schema({
  name: { type: String },
  annualCosts: [annualCostSchema],
}, { _id: false });

const bfTaskSchema = new mongoose.Schema({
  name: { type: String },
  applications: [bfAppSchema],
}, { _id: false });

// Richer schema for BusinessFlow (extends refSchema fields)
const businessFlowSchema = new mongoose.Schema({
  neighborhoodName: { type: String, required: true, trim: true, default: DEFAULT_NEIGHBORHOOD_NAME, index: true },
  name: { type: String, required: true, trim: true },
  owner: { type: String, trim: true, default: null },
  state: { type: String, enum: VALID_STATES, default: 'published' },
  tasks: [bfTaskSchema],
}, { timestamps: true });

businessFlowSchema.index({ neighborhoodName: 1, name: 1 }, { unique: true });

// Richer schema for Application (ITAP data)
const applicationSchema = new mongoose.Schema({
  neighborhoodName: { type: String, required: true, trim: true, default: DEFAULT_NEIGHBORHOOD_NAME, index: true },
  name: { type: String, required: true, trim: true },
  correlationId: {
    type: String,
    trim: true,
    default: null,
    set: (value) => {
      const text = String(value || '').trim();
      return text || null;
    },
  },
  shortDescription: { type: String, default: null },
  applicationType: { type: String, default: null },
  businessCriticality: { type: String, default: null },
  discoverySource: { type: String, default: null },
  installType: { type: String, default: null },
  cpniIndicator: { type: String, default: null },
  customerFacing: { type: String, default: null },
  handleSpi: { type: String, default: null },
  internetFacing: { type: String, default: null },
  pciData: { type: String, default: null },
  soxFsa: { type: String, default: null },
  storeSpi: { type: String, default: null },
  acronym: { type: String, default: null },
  applPurpose: { type: String, default: null },
  lifecycle: { type: String, default: null },
  lifecycleStatus: { type: String, default: null },
  businessPurpose: { type: String, default: null },
  pciDataStored: { type: String, default: null },
  userInterface: { type: String, default: null },
  owner: { type: String, trim: true, default: null },
  state: { type: String, enum: VALID_STATES, default: 'published' },
}, { timestamps: true });

applicationSchema.index({ neighborhoodName: 1, name: 1 }, { unique: true });

applicationSchema.index(
  { neighborhoodName: 1, correlationId: 1 },
  {
    unique: true,
    partialFilterExpression: { correlationId: { $type: 'string' } },
  }
);

const BusinessFlow = mongoose.models.BusinessFlow || mongoose.model('BusinessFlow', businessFlowSchema);
const Product = mongoose.models.Product || mongoose.model('Product', refSchema);
const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);
const Actor = mongoose.models.Actor || mongoose.model('Actor', refSchema);
const Channel = mongoose.models.Channel || mongoose.model('Channel', refSchema);
const Domain = mongoose.models.Domain || mongoose.model('Domain', refSchema);
const Subdomain = mongoose.models.Subdomain || mongoose.model('Subdomain', refSchema);
const LineOfBusiness = mongoose.models.LineOfBusiness || mongoose.model('LineOfBusiness', refSchema);

module.exports = { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain, LineOfBusiness };
