// trav-api/db.js
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI saknas i .env');
  process.exit(1);
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
