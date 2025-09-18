# Schema Module — Merge Instructions
Kopiera in följande utan att röra andra projekt:
- public/schema/ (index.html, style.css, app.js)
- public/js/augment-projectbar.js
- routes/schema.api.js
- data/schema-logs.json

Express:
app.use('/schema', express.static(path.join(__dirname,'public','schema')));
app.use('/api/schema', require('./routes/schema.api'));
app.use('/js', express.static(path.join(__dirname,'public','js')));

Testa lokalt:
npm install
npm start
http://localhost:5000/schema/
