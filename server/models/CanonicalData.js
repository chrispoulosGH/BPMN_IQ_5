const mongoose = require('mongoose');
const { Schema } = mongoose;

const SourceBatchSchema = new Schema({
  batchId: { type: String, required: true },
  rowIndex: { type: Number },
}, { _id: false });

const CanonicalDataSchema = new Schema({
  neighborhoodName: { type: String, index: true, required: true },
  componentType: { type: String, index: true, required: true },
  dataType: { type: String, index: true, default: '' },
  primaryKey: { type: String, required: true },
  values: { type: Schema.Types.Mixed, default: {} },
  parentKeys: { type: [String], default: [] },
  parentRefs: [{ type: Schema.Types.ObjectId, ref: 'CanonicalData' }],
  childrenRefs: [{ type: Schema.Types.ObjectId, ref: 'CanonicalData' }],
  path: { type: String },
  sourceBatches: { type: [SourceBatchSchema], default: [] },
}, { timestamps: true, collection: 'canonicaldata' });

CanonicalDataSchema.index({ neighborhoodName: 1, componentType: 1, primaryKey: 1 }, { unique: true });
CanonicalDataSchema.index({ neighborhoodName: 1, primaryKey: 1 });

module.exports = mongoose.models.CanonicalData || mongoose.model('CanonicalData', CanonicalDataSchema);