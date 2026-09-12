// trav-api/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('./db'); // koppla till MongoDB

const gamesRouter = require('./routes/games');
const tracksRouter = require('./routes/tracks'); // 🔹 NY
const analysesRouter = require('./routes/analyses'); // 🔹 NY // 🔹 NY
const roundsRouter = require('./routes/rounds');
const tipstersRouter = require('./routes/tipsters');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Trav API är igång');
});

app.get('/health', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    api: 'up',
    database: ready ? mongoose.connection.name : 'travet',
  });
});

function requireMongo(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Trav API vantar en aktiv MongoDB-anslutning',
    });
  }
  return next();
}

app.use('/api/trav/games', requireMongo, gamesRouter);
app.use('/api/trav/tracks', requireMongo, tracksRouter);
app.use('/api/trav/analyses', requireMongo, analysesRouter);
app.use('/api/trav/rounds', requireMongo, roundsRouter);
app.use('/api/trav/rounds', requireMongo, tipstersRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Trav API lyssnar på port ${PORT}`);
});
