// trav-api/db.js
const mongoose = require('mongoose');

// Anvand samma MONGODB_URI som Bigplus API. Travs modeller anvander egna
// collections i samma databas och blandas darfor inte ihop med Bigplus-data.
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bigplus';

// Atlas SRV-uppslag kan vara otillgangligt via lokal DNS. Den har modulen
// anvander DNS-over-HTTPS som fallback utan att exponera anslutningsstrangen.
require('./mongodb-dns-fallback');

if (!process.env.MONGODB_URI) {
  console.warn(
    'MONGODB_URI saknas i environment, anvander lokal MongoDB pa mongodb://127.0.0.1:27017/bigplus'
  );
}

mongoose.set('strictQuery', false);
mongoose.set('bufferCommands', false);

const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 12000,
  connectTimeoutMS: 12000,
  socketTimeoutMS: 20000,
  family: 4,
};
const RETRY_DELAY_MS = 10000;
let reconnectTimer = null;
let isConnecting = false;

function scheduleReconnect() {
  if (reconnectTimer || isConnecting || mongoose.connection.readyState === 1) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectMongo();
  }, RETRY_DELAY_MS);
  reconnectTimer.unref?.();
}

async function connectMongo() {
  if (isConnecting || mongoose.connection.readyState === 1) return;

  isConnecting = true;
  try {
    await mongoose.connect(MONGODB_URI, CONNECT_OPTIONS);
    console.log('Ansluten till MongoDB (Trav)');
  } catch (error) {
    console.error(
      `MongoDB-anslutning misslyckades (${error.code || error.name || 'okant fel'}). Nasta forsok om ${RETRY_DELAY_MS / 1000}s.`
    );
  } finally {
    isConnecting = false;
    if (mongoose.connection.readyState !== 1) scheduleReconnect();
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB franboren; forsoker ansluta igen.');
  scheduleReconnect();
});

mongoose.connection.on('error', (error) => {
  console.error(
    `MongoDB-fel (${error.code || error.name || 'okant fel'}).`
  );
});

connectMongo();

module.exports = mongoose;
