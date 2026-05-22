const mongoose = require('mongoose');
const { VALID_STATES } = require('../services/stateTransitions');

// Shared schema for simple name-only reference collections
const refSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  owner: { type: String, trim: true, default: null },
  state: { type: String, enum: VALID_STATES, default: 'draft' },
}, { timestamps: true });

// Richer schema for Application (ITAP data)
const applicationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  correlationId: { type: String, default: null },
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
  state: { type: String, enum: VALID_STATES, default: 'draft' },
}, { timestamps: true });

const BusinessFlow = mongoose.model('BusinessFlow', refSchema);
const Product = mongoose.model('Product', refSchema);
const Application = mongoose.model('Application', applicationSchema);
const Actor = mongoose.model('Actor', refSchema);
const Channel = mongoose.model('Channel', refSchema);
const Domain = mongoose.model('Domain', refSchema);
const Subdomain = mongoose.model('Subdomain', refSchema);
const LineOfBusiness = mongoose.model('LineOfBusiness', refSchema);

module.exports = { BusinessFlow, Product, Application, Actor, Channel, Domain, Subdomain, LineOfBusiness };
