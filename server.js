// server.js – Express server som mappar /trav* till public/trav/trav.index.html
const express = require('express'); const path = require('path'); const app = express();
const PORT = process.env.PORT || 5000;
const publicDir = path.join(__dirname, 'public');
const travFile = path.join(publicDir, 'trav', 'trav.index.html');
app.use(express.static(publicDir, { extensions: ['html'] }));
app.get(['/trav', '/trav/', '/trav.html', '/trav/trav.index.html', '/trav/kuponger', '/trav/analys', '/trav/preview'], (req,res)=>res.sendFile(travFile));
app.listen(PORT, ()=> console.log(`Server igång: http://localhost:${PORT}\nTrav: /trav eller /trav.html`));
