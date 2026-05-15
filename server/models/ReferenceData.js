const mongoose = require('mongoose');

// Shared schema for simple name-only reference collections
const refSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
}, { timestamps: true });

const BusinessFlow = mongoose.model('BusinessFlow', refSchema);
const Product = mongoose.model('Product', refSchema);
const Application = mongoose.model('Application', refSchema);
const Persona = mongoose.model('Persona', refSchema);
const Channel = mongoose.model('Channel', refSchema);
const Domain = mongoose.model('Domain', refSchema);
const Subdomain = mongoose.model('Subdomain', refSchema);

module.exports = { BusinessFlow, Product, Application, Persona, Channel, Domain, Subdomain };
