const { MongoClient } = require('mongodb');
(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const col = db.collection('componentSearchIndex');
  const neighborhood = 'CTX';
  const cnt = await col.countDocuments({ neighborhoodName: neighborhood });
  console.log('count:', cnt);
  const distinct = await col.distinct('rowName', { neighborhoodName: neighborhood });
  console.log('distinct sample:', distinct.slice(0, 20));
  const sample = await col.find({ neighborhoodName: neighborhood }).limit(5).toArray();
  console.log('sample entry keys:', sample.length ? Object.keys(sample[0]) : 'none');
  if (distinct.length > 0) {
    const term = distinct[0];
    console.log('testing term:', term);
    const esc = term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regexWordBound = new RegExp('\\b' + esc + '\\b', 'i');
    const resWord = await col.find({ neighborhoodName: neighborhood, searchableTextLower: { $regex: regexWordBound } }).limit(5).toArray();
    console.log('matches with word boundaries:', resWord.length);
    console.log('escaped term:', esc);
    const regexRaw = new RegExp(esc, 'i');
    const resRaw = await col.find({ neighborhoodName: neighborhood, searchableTextLower: { $regex: regexRaw } }).limit(5).toArray();
    console.log('matches with raw substring regex:', resRaw.length);
    console.log('raw match samples:', resRaw.map(r => ({ rowName: r.rowName, searchableTextLower: (r.searchableTextLower || '').slice(0, 120) })));

    // Direct lookup by rowName to inspect stored searchableTextLower for this exact row
    const exact = await col.findOne({ neighborhoodName: neighborhood, rowName: term });
    console.log('direct find by rowName:', exact ? { rowName: exact.rowName, searchableTextLower: (exact.searchableTextLower || '').slice(0,200) } : null);
    if (exact) {
      console.log('regexRaw source:', regexRaw.source);
      console.log('regexRaw.test(searchableTextLower):', regexRaw.test(exact.searchableTextLower));
    }
  }
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
