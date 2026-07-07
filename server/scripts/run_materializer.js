const { materializeFromBatches } = require('../lib/materializer');

const neighborhood = process.argv[2];
const domain = String(process.argv[3] || '').trim().toLowerCase() === 'data' ? 'data' : 'component';

(async () => {
  console.log('Starting materializer for', neighborhood || 'ALL');
  try {
    const r = await materializeFromBatches({ neighborhoodName: neighborhood, domain });
    console.log('Materializer finished:', r);
    try {
      await materializeFromBatches.postProcess({ neighborhoodName: neighborhood, domain });
      console.log('Post-process (rebuild index) finished');
    } catch (err) {
      console.error('Post-process failed', err && err.message);
    }
    process.exit(0);
  } catch (err) {
    console.error('Materializer error', err);
    process.exit(1);
  }
})();
