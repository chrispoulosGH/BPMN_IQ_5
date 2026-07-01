const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bpmn_iq';
(async function(){
  try{
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const cc = db.collection('canonicalcomponents');
    const total = await cc.countDocuments();
    const totalCTX = await cc.countDocuments({ neighborhoodName: 'CTX' });
    const types = await cc.distinct('componentType', { neighborhoodName: 'CTX' });
    const primaryCount = await cc.distinct('primaryKey', { neighborhoodName: 'CTX' });
    console.log(JSON.stringify({ totalCanonical: total, totalCanonical_CTX: totalCTX, componentTypes_CTX: types, primaryKeyCount_CTX: primaryCount.length }, null, 2));
    process.exit(0);
  }catch(e){console.error('ERROR',e);process.exit(1);} 
})();
