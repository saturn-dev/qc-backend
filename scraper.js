const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
  }
  return browserPromise;
}

const SHORT_LINK_HOSTS = ['e.tb.cn', 'm.tb.cn', 'tb.cn', 's.click.taobao.com'];

const AGENT_HOSTS = [
  'acbuy.com', 'itaobuy.com', 'kakobuy.com', 'cssbuy.com', 'sugargoo.com',
  'wegobuy.com', 'superbuy.com', 'pandabuy.com', 'hoobuy.com', 'joyabuy.com',
  'hagobuy.com', 'cnfans.com', 'mulebuy.com', 'allchinabuy.com', 'ootdbuy.com',
  'basetao.com', 'lovegobuy.com', 'ponybuy.com', 'orientdig.com', 'kameymall.com',
];

function hostMatches(host, list) {
  return list.some(h => host === h || host.endsWith(`.${h}`));
}

async function resolveShortLink(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return rawUrl; }
  const host = u.hostname.replace(/^www\./, '');
  if (!hostMatches(host, SHORT_LINK_HOSTS)) return rawUrl;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    );
    await page.goto(rawUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
    return page.url();
  } catch {
    return rawUrl;
  } finally {
    await page.close();
  }
}

function unwrapAgentUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return rawUrl; }

  const host = u.hostname.replace(/^www\./, '');
  if (!hostMatches(host, AGENT_HOSTS)) return rawUrl;

  const candidateKeys = ['url', 'link', 'goods_id', 'shop_type'];
  let inner = null;
  for (const key of candidateKeys) {
    const v = u.searchParams.get(key);
    if (v && /^https?:/i.test(decodeURIComponent(v))) {
      inner = v;
      break;
    }
  }
  if (!inner) return null;

  let decoded = decodeURIComponent(inner);
  if (/%[0-9A-Fa-f]{2}/.test(decoded) && /^https?%3A/i.test(inner)) {
    try { decoded = decodeURIComponent(decoded); } catch {}
  }
  return decoded;
}

function stripTaobaoTrackingParams(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes('taobao.com') && !u.hostname.includes('tmall.com')) {
      return rawUrl;
    }
    const id = u.searchParams.get('id');
    if (!id) return rawUrl;
    return `https://item.taobao.com/item.htm?id=${id}`;
  } catch {
    return rawUrl;
  }
}

function parseSourceUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch {
    throw new Error('Invalid link.');
  }
  const host = u.hostname.replace(/^www\./, '');

  if (host.includes('weidian.com')) {
    const id = u.searchParams.get('itemID') || u.searchParams.get('itemId');
    if (!id) throw new Error('Invalid link.');
    return { source: 'WD', itemID: id };
  }
  if (host.includes('taobao.com') || host.includes('tmall.com')) {
    const id = u.searchParams.get('id');
    if (!id) throw new Error('Invalid link.');
    return { source: 'TB', itemID: id };
  }
  if (host.includes('1688.com')) {
    const match = u.pathname.match(/(\d+)\.html/);
    const id = match ? match[1] : u.searchParams.get('id');
    if (!id) throw new Error('Invalid link.');
    return { source: 'AL', itemID: id };
  }
  throw new Error('Invalid link.');
}

function buildAcbuyUrl(rawUrl, source, itemID) {
  const encoded = encodeURIComponent(encodeURIComponent(rawUrl));
  return `https://www.acbuy.com/product?url=${encoded}&id=${itemID}&source=${source}`;
}

function buildItaobuyUrl(rawUrl) {
  const encoded = encodeURIComponent(rawUrl);
  return `https://www.itaobuy.com/product-detail?url=${encoded}`;
}

function cleanImageUrl(url) { return url.split('?')[0]; }

async function scrapeItaobuyQC(rawUrl) {
  const itaobuyUrl = buildItaobuyUrl(rawUrl);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 900 });

    await page.goto(itaobuyUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    const SELECTOR = 'div.bg-\\[\\#f8f8f8\\] img[thumbnail="true"]';
    try {
      await page.waitForSelector(SELECTOR, { timeout: 15000 });
    } catch {
      return [];
    }

    const images = await page.evaluate(() => {
      const imgs = document.querySelectorAll('div.bg-\\[\\#f8f8f8\\] img[thumbnail="true"]');
      return Array.from(imgs).map(img => img.src).filter(Boolean);
    });

    return images.slice(0, 4).map(cleanImageUrl);
  } finally {
    await page.close();
  }
}

async function scrapeQC(userInput) {
  const resolved = await resolveShortLink(userInput);
  const unwrapped = unwrapAgentUrl(resolved);
  if (unwrapped === null) throw new Error('Invalid link.');
  const rawUrl = stripTaobaoTrackingParams(unwrapped);

  const { source, itemID } = parseSourceUrl(rawUrl);
  const acbuyUrl = buildAcbuyUrl(rawUrl, source, itemID);

  const browser = await getBrowser();
  const page = await browser.newPage();

  let acbuyLoaded = false;

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 900 });

    await page.goto(acbuyUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    acbuyLoaded = true;

    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('.goods-data .g-name');
      const title = titleEl ? titleEl.textContent.trim() : null;

      const shopEl = document.querySelector('.shop .link');
      const shop = shopEl ? shopEl.textContent.trim() : null;

      const qcImgs = document.querySelectorAll('.qc-img ul.small li img');
      const images = Array.from(qcImgs).map(img => img.src).filter(Boolean);

      let price = null;
      const priceEl = document.querySelector('.g-price');
      if (priceEl) {
        const txt = priceEl.textContent || '';
        const m = txt.match(/\$[\d.,]+/);
        price = m ? m[0] : null;
      }

      let weight = null;
      let sales = null;
      document.querySelectorAll('.weight-box').forEach(box => {
        const items = box.querySelectorAll('.item');
        if (items.length < 2) return;
        const label = items[0].textContent.trim().toLowerCase();
        const value = items[1].textContent.trim();
        if (label.includes('weight')) weight = value;
        else if (label.includes('sales')) sales = value;
      });

      return { title, shop, images, price, weight, sales };
    });

    let finalImages = data.images.slice(0, 4).map(cleanImageUrl);

    if (finalImages.length === 0) {
      try {
        finalImages = await scrapeItaobuyQC(rawUrl);
      } catch (err) {
        console.error('iTaoBuy fallback failed:', err.message);
      }
    }

    if (finalImages.length === 0) {
      throw new Error('Product out of stock or dead link. Try again later.');
    }

    const priceFormatted = data.price || 'N/A';
    const weightFormatted = (data.weight && /\d/.test(data.weight)) ? `${data.weight}g` : 'N/A';
    const salesFormatted = (data.sales && /\d/.test(data.sales)) ? data.sales : 'N/A';

    return {
      source,
      acbuyUrl,
      rawUrl,
      title: data.title,
      shop: data.shop,
      images: finalImages,
      price: priceFormatted,
      weight: weightFormatted,
      sales: salesFormatted,
    };
  } catch (err) {
    if (!acbuyLoaded) {
      throw new Error('Product out of stock or dead link. Try again later.');
    }
    throw err;
  } finally {
    await page.close();
  }
}

module.exports = { scrapeQC };
