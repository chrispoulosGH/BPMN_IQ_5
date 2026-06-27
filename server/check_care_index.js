require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Check if products with Care in parent names are indexed
  const careLinked = await CSI.countDocuments({
    neighborhoodName: 'AT&T Journey',
    componentName: 'product',
    'cachedLineagePaths': { $regex: 'Care' }
  });
  
  console.log('Products indexed with Care in paths:', careLinked);
  
  const example = await CSI.findOne({
    neighborhoodName: 'AT&T Journey',
    componentName: 'product',
    'cachedLineagePaths': { $regex: 'Care' }
  }).lean();
  
  if (example) {
    console.log('\nExample product with Care:');
    console.log(JSON.stringify({
      rowName: example.rowName,
      paths: example.cachedLineagePaths,
      hierarchies: example.cachedHierarchies
    }, null, 2));
  } else {
    console.log('\n⚠️  No products found with Care in paths!');
  }
  
  mongoose.connection.close();
});
