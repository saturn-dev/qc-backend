require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scrapeQC } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;

// Allow all origins — this is a public read-only API, safe to open up
app.use(cors());

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
