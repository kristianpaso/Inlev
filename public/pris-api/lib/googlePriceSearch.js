// Google Price Search (via Google Custom Search JSON API) + price extraction from product pages
// Needs env:
// - GOOGLE_CSE_API_KEY
// - GOOGLE_CSE_CX
//
// This does NOT scrape Google HTML (which is blocked). It uses Google's official JSON API.

const UA = "Mozilla/5.0 (PriceWatcher/1.0)";

function hasGoogleConfig() {
  return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
}

function hostFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}

async function googleSearch({ q, limit=10 }) {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(Math.min(Math.max(limit, 1), 10)));

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google CSE error ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map(it => ({ title: it.title, link: it.link, snippet: it.snippet }));
}

function extractJsonLd(html) {
  const out = [];
  const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      // Some pages include multiple JSON objects/arrays
      const parsed = JSON.parse(raw);
      out.push(parsed);
    } catch {
      // ignore
    }
  }
  return out;
}

function flattenJsonLd(nodes) {
  const arr = [];
  const pushNode = (n) => {
    if (!n) return;
    if (Array.isArray(n)) n.forEach(pushNode);
    else if (typeof n === "object") {
      arr.push(n);
      // @graph common
      if (n["@graph"]) pushNode(n["@graph"]);
    }
  };
  nodes.forEach(pushNode);
  return arr;
}

function pickOfferPrice(node) {
  // Try schema.org Product/Offer patterns
  const offers = node.offers;
  const offerArr = Array.isArray(offers) ? offers : (offers ? [offers] : []);
  for (const off of offerArr) {
    const price = off.price ?? off.lowPrice ?? off.highPrice;
    const currency = off.priceCurrency;
    if (price != null) {
      const n = Number(String(price).replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(/,/g, "."));
      if (Number.isFinite(n)) return { price: n, currency: currency || "SEK", offer: off };
    }
  }
  return null;
}

function detectProductTitle(nodes, fallback) {
  for (const n of nodes) {
    const t = n.name || n.headline;
    if (typeof t === "string" && t.length > 3) return t;
  }
  return fallback || "Okänd produkt";
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8" },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("text/html")) return null;
  return await res.text();
}

async function searchGooglePrices({ q, limit=10 }) {
  const results = [];
  const links = await googleSearch({ q, limit });

  // Fetch a few pages and try extract price from JSON-LD
  for (const it of links) {
    const url = it.link;
    const html = await fetchHtml(url);
    if (!html) continue;

    const ld = extractJsonLd(html);
    const flat = flattenJsonLd(ld);

    let best = null;
    for (const node of flat) {
      const offer = pickOfferPrice(node);
      if (offer && (!best || offer.price < best.price)) {
        best = offer;
      }
    }
    if (!best) continue;

    const title = detectProductTitle(flat, it.title);
    const store = hostFromUrl(url);

    results.push({
      id: "g|" + (store || "") + "|" + url,
      title,
      brand: null,
      price: best.price,
      currency: best.currency || "SEK",
      store,
      url,
      image: null,
      source: "Google",
      originalPrice: null,
      isDiscounted: false,
    });
  }

  results.sort((a,b) => a.price - b.price);
  return results;
}

async function searchGooglePricesIfConfigured(args) {
  if (!hasGoogleConfig()) return [];
  return await searchGooglePrices({ q: args.q, limit: Math.min(args.limit || 10, 10) });
}

module.exports = { searchGooglePricesIfConfigured };
