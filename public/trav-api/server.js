// trav-api/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
require('./db'); // koppla till MongoDB

const gamesRouter = require('./routes/games');
const tracksRouter = require('./routes/tracks'); // 🔹 NY

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Trav API är igång');
});

app.use('/api/trav/games', gamesRouter);
app.use('/api/trav/tracks', tracksRouter); // 🔹 NY

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Trav API lyssnar på port ${PORT}`);
});
