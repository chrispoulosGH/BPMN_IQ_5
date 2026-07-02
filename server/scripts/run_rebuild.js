require('dotenv').config();
const mongoose = require('mongoose');
const { rebuildSearchIndex } = require('../utils/searchIndexBuilder');

const neighborhoodName = process.argv[2] || process.env.NEIGHBORHOOD_NAME || '';
if (!neighborhoodName) {
  console.error('Usage: node run_rebuild.js <neighborhoodName>');
  process.exit(2);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to MongoDB');
    try {
      const result = await rebuildSearchIndex(neighborhoodName);
      console.log('✓ Search index rebuild complete!');
      console.log(result);
    } catch (err) {
      console.error('✗ Error rebuilding index:', err);
    } finally {
      mongoose.connection.close();
    }
  })
  .catch(err => {
    console.error('Database connection error:', err);
    process.exit(1);
  });
