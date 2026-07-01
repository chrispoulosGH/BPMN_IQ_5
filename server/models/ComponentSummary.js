const mongoose = require('mongoose');
const { Schema } = mongoose;

const ComponentSummarySchema = new Schema({
  neighborhoodName: { type: String, required: true, index: true },
  primaryKey: { type: String, required: true },
  // Map of componentType -> values object
  valuesByType: { type: Schema.Types.Mixed, default: {} },
  // track source component ids / batches if desired
  sources: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });

ComponentSummarySchema.index({ neighborhoodName: 1, primaryKey: 1 }, { unique: true });

module.exports = mongoose.model('ComponentSummary', ComponentSummarySchema);
