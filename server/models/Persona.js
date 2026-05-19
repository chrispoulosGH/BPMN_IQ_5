const mongoose = require('mongoose');

const personaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    role: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

personaSchema.index({ name: 'text', role: 'text', description: 'text' });

module.exports = mongoose.models.Persona || mongoose.model('Persona', personaSchema);
