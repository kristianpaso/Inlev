const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({limit: '5mb'}));

app.use('/schema', express.static(path.join(__dirname, 'public', 'schema')));

app.use((req, res, next) => {
  const send = res.send;
  res.send = function (body) {
    try {
      const ct = (res.get('Content-Type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        const marker = '</body>';
        const scriptTag = '<script src="/js/augment-projectbar.js"></script>';
        if (typeof body === 'string' && body.includes(marker)) {
          body = body.replace(marker, scriptTag + marker);
          return send.call(this, body);
        }
      }
    } catch (e) {}
    return send.call(this, body);
  };
  next();
});

app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

const schemaApi = require('./routes/schema.api');
app.use('/api/schema', schemaApi);

app.get('/', (req, res) => res.redirect('/schema/'));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Schema server running at http://localhost:${PORT}/schema/`));
