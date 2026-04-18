require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scrapeQC } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow your GitHub Pages site + localhost for dev.
// Add any other domains you host the frontend on.
const ALLOWED_ORIGINS = [
  'https://deepinmycloset.com',
  'https://www.deepinmycloset.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow curl / Postman
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
}));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'qc-scraper', uptime: process.uptime() });
});

app.get('/api/qc', async (req, res) => {
  const link = (req.query.link || '').toString().trim();
  if (!link) {
    return res.status(400).json({ error: 'Missing ?link= parameter.' });
  }

  try {
    const result = await scrapeQC(link);
    res.json(result);
  } catch (err) {
    console.error('[scrape error]', err.message);
    res.status(400).json({ error: err.message || 'Something went wrong.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ QC backend listening on :${PORT}`);
});
