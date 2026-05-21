const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    role: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    owner: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

actorSchema.index({ name: 'text', role: 'text', description: 'text' });

module.exports = mongoose.models.Actor || mongoose.model('Actor', actorSchema);
