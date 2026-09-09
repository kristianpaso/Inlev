// trav-api/db.js
const mongoose = require('mongoose');

// Travet använder samma MongoDB-kluster som Bigplus, men en egen databas.
// Databasnamnet skrivs därför över med dbName och blir alltid "travet".
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const TRAV_MONGODB_DB = String(process.env.TRAV_MONGODB_DB || 'travet').trim() || 'travet';

// Atlas SRV-uppslag kan vara otillgangligt via lokal DNS. Den har modulen
// anvander DNS-over-HTTPS som fallback utan att exponera anslutningsstrangen.
require('./mongodb-dns-fallback');

if (!MONGODB_URI) {
  console.error(
    'MONGODB_URI saknas. Trav API startar utan lokal fallback och väntar på MongoDB-konfiguration.'
  );
}

mongoose.set('strictQuery', false);
mongoose.set('bufferCommands', false);

const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 12000,
  connectTimeoutMS: 12000,
  socketTimeoutMS: 20000,
  family: 4,
  dbName: TRAV_MONGODB_DB,
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
  if (!MONGODB_URI) {
    scheduleReconnect();
    return;
  }

  isConnecting = true;
  try {
    await mongoose.connect(MONGODB_URI, CONNECT_OPTIONS);
    console.log(`Ansluten till MongoDB (Travet, databas: ${TRAV_MONGODB_DB})`);
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
