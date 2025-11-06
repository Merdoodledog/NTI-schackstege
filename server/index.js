const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// serve public client files
app.use(express.static(path.join(__dirname, '..', 'public')));
// serve assets folder as well (keeps existing assets in repo root)
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// Simple proxy for Lichess games export to avoid CORS issues from client
app.get('/api/games/user/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const qs = new URLSearchParams(req.query).toString();
    const lichessUrl = `https://lichess.org/api/games/user/${encodeURIComponent(username)}${qs ? '?' + qs : ''}`;

    const headers = { Accept: 'application/x-ndjson' };
    const token = req.get('x-token') || req.get('authorization');
    if (token) {
      if (/^\s*bearer\s+/i.test(token)) headers['Authorization'] = token;
      else headers['Authorization'] = `Bearer ${token}`;
    }

    const r = await fetch(lichessUrl, { headers });
    const text = await r.text();
    res.set('Content-Type', r.headers.get('content-type') || 'text/plain');
    res.status(r.status).send(text);
  } catch (e) {
    console.error(e);
    res.status(500).send('Proxy error');
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));