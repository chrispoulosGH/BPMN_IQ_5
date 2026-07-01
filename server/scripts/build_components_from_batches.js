const { populateComponentsFromBatches } = require('../lib/populateComponentsFromBatches');

(async function(){
  try {
    const neighborhood = process.argv[2] || process.env.NEIGHBORHOOD || 'CTX';
    console.log('Building components from batches for', neighborhood);
    const r = await populateComponentsFromBatches({ neighborhoodName: neighborhood });
    console.log('Result:', r);
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();
