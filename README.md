# QC Scraper Backend

Express + Puppeteer API that wraps the AcBuy/iTaoBuy scraper from the Discord bot. Powers the `/qc` page on deepinmycloset.com.

## Endpoint

`GET /api/qc?link=<url>`

Returns:

```json
{
  "source": "WD",
  "rawUrl": "https://weidian.com/item.html?itemID=123",
  "title": "...",
  "shop": "...",
  "images": ["...", "...", "...", "..."],
  "price": "$87.51",
  "weight": "1981g",
  "sales": "201"
}
```

Errors return `{ "error": "..." }` with a 4xx status.

## Deploy to Render

1. Push this folder to its own GitHub repo
2. On render.com → New → Web Service → connect the repo
3. Render will auto-detect `render.yaml` and set everything up
4. After the first deploy you'll get a URL like `https://qc-scraper.onrender.com`
5. Paste that URL into `API_BASE` inside `qc.html` on your frontend repo

## Local dev

```bash
npm install
node server.js
```

The server listens on `:3000` and you can test with:

```bash
curl "http://localhost:3000/api/qc?link=https://weidian.com/item.html?itemID=7607476812"
```

## CORS

Edit `ALLOWED_ORIGINS` in `server.js` to match your frontend domain.
