require('dotenv').config();
const mongoose = require('mongoose');
const { rebuildSearchIndex } = require('./utils/searchIndexBuilder');

const neighborhoodName = 'AT&T Journey';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      const result = await rebuildSearchIndex(neighborhoodName);
      console.log('✓ Search index rebuild complete!');
      console.log(result);
    } catch (error) {
      console.error('✗ Error rebuilding index:', error.message);
    }
    
    mongoose.connection.close();
  })
  .catch(error => {
    console.error('Database connection error:', error.message);
    process.exit(1);
  });
