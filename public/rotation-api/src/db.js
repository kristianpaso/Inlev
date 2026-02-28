const mongoose = require('mongoose');

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Add it to rotation-api/.env or Render env vars.');
  }
  mongoose.set('strictQuery', true);
  // Fail fast if DB is down instead of buffering 30s+.
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });
  console.log('✅ Connected to MongoDB');
  mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));
  mongoose.connection.on('error', (e) => console.error('❌ MongoDB error', e));

}

module.exports = { connectDb };
