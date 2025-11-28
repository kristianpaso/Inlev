// trav-api/db.js
const mongoose = require('mongoose');

// 1) Läs från env, annars använd lokal databas (för dev)
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trav';

if (!process.env.MONGODB_URI) {
  console.warn(
    '⚠️ MONGODB_URI saknas i environment, använder lokal MongoDB på mongodb://127.0.0.1:27017/trav'
  );
}

mongoose.set('strictQuery', false);

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Ansluten till MongoDB (Trav)');
  })
  .catch((err) => {
    console.error('❌ Misslyckades ansluta till MongoDB', err);
    process.exit(1);
  });

module.exports = mongoose;
