/*
  build_component_summary.js

  Usage:
    node build_component_summary.js [--neighborhood=CTX] [--batchSize=1000]

  This script reads canonical `components` documents and upserts a
  `ComponentSummary` per `neighborhoodName`+`primaryKey` where
  `valuesByType` is a map of componentType -> values object.

  Notes: run after materializer completes or periodically.
*/

const { buildComponentSummary } = require('../lib/buildComponentSummary');

// Simple arg parsing
const args = {};
process.argv.slice(2).forEach(a => {
  if (a.startsWith('--neighborhood=')) args.neighborhoodName = a.split('=')[1];
  if (a.startsWith('--batchSize=')) args.batchSize = a.split('=')[1];
});

buildComponentSummary(args).then(result => {
  console.log('Finished. Total processed:', result.processed);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
