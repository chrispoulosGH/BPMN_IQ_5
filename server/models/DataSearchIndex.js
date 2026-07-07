const mongoose = require('mongoose');

const hierarchyNodeSchema = new mongoose.Schema(
  {
    componentName: { type: String, required: true },
    componentId: { type: mongoose.Schema.Types.ObjectId },
    rowName: { type: String, required: true },
    rowId: { type: mongoose.Schema.Types.ObjectId },
  },
  { _id: false }
);

const dataSearchIndexSchema = new mongoose.Schema(
  {
    neighborhoodName: { type: String, required: true, index: true },
    componentName: { type: String, required: true, index: true },
    dataType: { type: String, default: '', index: true },
    componentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Data', index: true },
    rowId: { type: mongoose.Schema.Types.ObjectId, index: true },
    rowName: { type: String, required: true },
    searchableTextLower: { type: String, index: true },
    allValues: [String],
    fieldByValue: mongoose.Schema.Types.Mixed,
    frequency: { type: Number, default: 1 },
    cachedLineagePaths: [String],
    cachedHierarchies: [[hierarchyNodeSchema]],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'dataSearchIndex' }
);

dataSearchIndexSchema.index({ neighborhoodName: 1, searchableTextLower: 1 });
dataSearchIndexSchema.index({ neighborhoodName: 1, componentName: 1 });
dataSearchIndexSchema.index({ allValues: 'text', searchableTextLower: 'text' });

module.exports = mongoose.models.DataSearchIndex || mongoose.model('DataSearchIndex', dataSearchIndexSchema);