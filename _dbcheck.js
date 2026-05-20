const mongoose = require('mongoose');
const fs = require('fs');

(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq', { serverSelectionTimeoutMS: 5000 });
    const col = mongoose.connection.collection('diagrams');
    const docs = await col.find({}, { projection: { name: 1, status: 1 } }).toArray();
    const out = 'Count: ' + docs.length + '\n' + docs.map(d => (d.name || '(null)') + ' | ' + (d.status || '(null)')).join('\n');
    fs.writeFileSync('_dbresult.txt', out);
    await mongoose.disconnect();
  } catch (e) {
    fs.writeFileSync('_dbresult.txt', 'ERROR: ' + e.message);
  }
  process.exit(0);
})();
