const mongoose = require('mongoose');

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Add it to rotation-api/.env or Render env vars.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
}

module.exports = { connectDb };
