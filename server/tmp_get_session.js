const mongoose = require('mongoose');
const Session = require('./models/Session');
const Model = require('./models/Model');

async function main(){
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');
  const s = await Session.findOne({ expiresAt: { $gt: new Date() } }).lean();
  const mn = await Model.distinct('name');
  console.log('SESSION_TOKEN=', s ? s.token : '(none)');
  console.log('SESSION_USER=', s ? s.userId : '(none)');
  console.log('MODEL_NAMES=', mn);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
