
const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes_auth');
const storeRoutes = require('./routes_store');

const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));

// API
app.use('/api', authRoutes);
app.use('/api', storeRoutes);

// Serve static frontend
const publicDir = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicDir));

// Fallback for direct routes
const pages = ['/','/index.html','/login.html','/sandningar.html','/insamlare.html','/felsok.html','/uppdatera-info.html','/skicka-diff.html'];
app.get(pages, (req,res)=>{
  res.sendFile(path.join(publicDir, req.path === '/' ? 'index.html' : req.path));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=>console.log(`Inleverans server på http://localhost:${PORT}`));
