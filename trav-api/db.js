const mongoose = require('mongoose');

// Läs från env, annars använd lokal databas för dev.
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trav';

if (!process.env.MONGODB_URI) {
  console.warn(
    '⚠️ MONGODB_URI saknas i environment, använder lokal MongoDB på mongodb://127.0.0.1:27017/trav'
  );
}

const RETRY_DELAY_MS = Number(process.env.MONGODB_RETRY_DELAY_MS || 10000);

mongoose.set('strictQuery', false);

// Gör att routes failar snabbt om DB tillfälligt är nere, i stället för att hänga länge.
mongoose.set('bufferCommands', false);

let reconnectTimer = null;
let isConnecting = false;
let lastMongoError = null;
let nextRetryAt = null;

function maskMongoUri(uri) {
  return String(uri || '').replace(/\/\/([^:/?#]+):([^@/?#]+)@/, '//***:***@');
}

function getMongoUriHost(uri) {
  try {
    return new URL(String(uri || '')).host || null;
  } catch (_) {
    return null;
  }
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return;

  const message = reason?.message || reason || 'okänt fel';
  lastMongoError = message;
  nextRetryAt = new Date(Date.now() + RETRY_DELAY_MS);

  console.warn(
    `⚠️ MongoDB ej ansluten (${message}). Försöker igen om ${RETRY_DELAY_MS / 1000}s...`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    nextRetryAt = null;
    connectMongo();
  }, RETRY_DELAY_MS);
}

async function connectMongo() {
  if (isConnecting || mongoose.connection.readyState === 1) return;

  isConnecting = true;

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
      connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
      socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 45000),
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10),
    });

    console.log(`✅ Ansluten till MongoDB (Trav): ${maskMongoUri(MONGODB_URI)}`);
    lastMongoError = null;
    nextRetryAt = null;
  } catch (err) {
    lastMongoError = err?.message || String(err);
    scheduleReconnect(err);
  } finally {
    isConnecting = false;
  }
}

mongoose.connection.on('disconnected', () => {
  scheduleReconnect('anslutningen bröts');
});

mongoose.connection.on('error', (err) => {
  lastMongoError = err?.message || String(err);
  console.error('❌ MongoDB-fel', err.message || err);
});

connectMongo();

mongoose.getTravMongoStatus = function getTravMongoStatus() {
  return {
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    uriHost: getMongoUriHost(MONGODB_URI),
    retryDelayMs: RETRY_DELAY_MS,
    nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
    retryInMs: nextRetryAt ? Math.max(0, nextRetryAt.getTime() - Date.now()) : null,
    lastError: lastMongoError,
  };
};

module.exports = mongoose;
