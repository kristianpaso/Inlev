// trav-api/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('./db'); // koppla till MongoDB

const gamesRouter = require('./routes/games');
const tracksRouter = require('./routes/tracks'); // 🔹 NY
const analysesRouter = require('./routes/analyses'); // 🔹 NY // 🔹 NY

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Trav API är igång');
});

app.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const readyState = mongoose.connection.readyState;
  const mongoStatus =
    typeof mongoose.getTravMongoStatus === 'function'
      ? mongoose.getTravMongoStatus()
      : {};

  res.json({
    ok: true,
    api: 'up',
    mongo: {
      readyState,
      state: states[readyState] || 'unknown',
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null,
      ...mongoStatus,
    },
  });
});

app.use('/api/trav/games', gamesRouter);
app.use('/api/trav/tracks', tracksRouter); // 🔹 NY
app.use('/api/trav/analyses', analysesRouter); // 🔹 NY // 🔹 NY

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Trav API lyssnar på port ${PORT}`);
});
