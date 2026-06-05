const mongoose = require('mongoose');

const factoryNeighborhoodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    owner: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FactoryNeighborhood', factoryNeighborhoodSchema);