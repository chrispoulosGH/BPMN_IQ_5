const fetch = require('node-fetch');

const BASE = process.env.BASE_URL || 'http://localhost:3001';

async function test(neighborhood = 'CTX') {
  console.log('Testing components load for neighborhood:', neighborhood);
  const compRes = await fetch(`${BASE}/api/components?neighborhoodName=${encodeURIComponent(neighborhood)}&limit=10`, { credentials: 'include' });
  const comps = await compRes.json();
  console.log('components:', JSON.stringify(comps, null, 2));

  const sumRes = await fetch(`${BASE}/api/component-summaries?neighborhoodName=${encodeURIComponent(neighborhood)}&limit=10`, { credentials: 'include' });
  const sums = await sumRes.json();
  console.log('component-summaries:', JSON.stringify(sums, null, 2));
}

const n = process.argv[2] || 'CTX';
test(n).catch(err => {
  console.error('Test failed', err);
  process.exit(1);
});
