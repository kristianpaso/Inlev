/**
 * Prisjakt client
 *
 * IMPORTANT:
 * - User does NOT want accounts / paid API keys.
 * - Therefore we fall back to scraping the public Prisjakt search page.
 * - If PARTNER_* env vars exist, we can still try the partner API first.
 *
 * Output format (frontend expects):
 * [{
 *   title, price, originalPrice, store, image, url, source
 * }]
 */

const BASE = "https://www.prisjakt.nu";

function hasPrisjaktConfig() {
  return Boolean(process.env.PARTNER_ID && process.env.PARTNER_KEY);
}

function buildPartnerAuthHeader() {
  // Prisjakt Partner API uses "Basic <base64(partnerId:partnerKey)>"
  const token = Buffer.from(`${process.env.PARTNER_ID}:${process.env.PARTNER_KEY}`).toString("base64");
  return `Basic ${token}`;
}

function toIntPrice(str) {
  if (!str) return null;
  // e.g. "8 495 kr" or "8 495 kr" or "8495"
  const cleaned = String(str)
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[^\d]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ");
}

function absUrl(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${BASE}${href}`;
  return `${BASE}/${href}`;
}

function normalizeArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.values(x);
  return [];
}

/**
 * Partner API mapping (only used if configured).
 * NOTE: We keep this best-effort since the user can run without it.
 */
function mapPartnerItem(item) {
  if (!item) return null;
  const title = item.name || item.title || item.productName;
  const url = item.url ? absUrl(item.url) : (item.id ? `${BASE}/produkt.php?p=${item.id}` : null);
  const image = item.image || item.imageUrl || item.image_url || null;
  const price = item.price || item.lowestPrice || item.lowest_price || null;
  const store = item.store || item.shop || item.vendor || null;

  const priceInt = typeof price === "number" ? Math.round(price) : toIntPrice(price);
  if (!title || !priceInt) return null;

  return {
    title,
    price: priceInt,
    originalPrice: item.originalPrice ? (typeof item.originalPrice === "number" ? Math.round(item.originalPrice) : toIntPrice(item.originalPrice)) : null,
    store: store || null,
    image: image || null,
    url,
    source: "Prisjakt"
  };
}

async function searchPrisjaktPartner({ query, limit = 12 }) {
  const url = `${BASE}/api/partner/search?query=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`;

  const res = await fetch(url, {
    headers: {
      "Authorization": buildPartnerAuthHeader(),
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Prisjakt partner API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const items = normalizeArray(data?.items || data?.results || data?.products || data);
  return items.map(mapPartnerItem).filter(Boolean).sort((a, b) => a.price - b.price).slice(0, limit);
}

/**
 * Public search scraping.
 *
 * Strategy:
 * 1) Fetch the public search HTML.
 * 2) Try to parse __NEXT_DATA__ (if present) for structured data.
 * 3) Fallback: parse ProductGridCard <li> blocks (server-rendered on many pages).
 */
function extractNextData(html) {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function collectCandidates(obj, out) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    for (const v of obj) collectCandidates(v, out);
    return;
  }
  if (typeof obj !== "object") return;

  // Heuristic: objects that look like a product.
  const keys = Object.keys(obj);
  const hasName = ("productName" in obj) || ("name" in obj) || ("title" in obj);
  const hasPrice = ("lowestPrice" in obj) || ("price" in obj) || ("minPrice" in obj) || ("fromPrice" in obj);
  const hasId = ("id" in obj) || ("productId" in obj) || ("product_id" in obj) || ("p" in obj);
  const hasImage = ("image" in obj) || ("imageUrl" in obj) || ("image_url" in obj) || ("imageUrls" in obj);

  if (hasName && (hasPrice || hasImage || hasId)) {
    out.push(obj);
  }

  for (const k of keys) collectCandidates(obj[k], out);
}

function mapNextDataCandidate(c) {
  const title = c.productName || c.name || c.title;
  const id = c.id || c.productId || c.product_id || c.p;
  const href = c.href || c.url || (id ? `/produkt.php?p=${id}` : null);

  // image can be string or array/object
  let image = c.imageUrl || c.image_url || c.image;
  if (!image && Array.isArray(c.imageUrls)) image = c.imageUrls[0];
  if (image && typeof image === "object") {
    image = image.url || image.src || null;
  }

  const store = c.storeName || c.store || c.shop || c.vendor || null;

  const priceRaw = c.lowestPrice ?? c.price ?? c.minPrice ?? c.fromPrice ?? null;
  const price = typeof priceRaw === "number" ? Math.round(priceRaw) : toIntPrice(priceRaw);

  if (!title || !price) return null;

  return {
    title: decodeHtmlEntities(title),
    price,
    originalPrice: null,
    store: store ? decodeHtmlEntities(store) : null,
    image: image ? absUrl(image) : null,
    url: href ? absUrl(href) : (id ? `${BASE}/produkt.php?p=${id}` : null),
    source: "Prisjakt"
  };
}

function parseProductGridCards(html, limit = 12) {
  // Split by ProductGridCard marker
  const parts = html.split(/data-test="ProductGridCard"/);
  if (parts.length <= 1) return [];

  const items = [];
  for (let i = 1; i < parts.length && items.length < limit; i++) {
    const chunk = parts[i];

    const img = chunk.match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;
    const href = chunk.match(/<a[^>]+href="([^"]+)"[^>]*data-test="ProductCardProductName"/i)?.[1]
      || chunk.match(/<a[^>]+href="([^"]+)"[^>]*class="productName/i)?.[1]
      || null;

    // product name text inside <p ...> ... </p> after productName link
    const nameMatch = chunk.match(/data-test="ProductCardProductName"[\s\S]{0,500}?<p[^>]*>([\s\S]*?)<\/p>/i)
      || chunk.match(/class="productName[\s\S]{0,500}?<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = nameMatch ? decodeHtmlEntities(nameMatch[1].replace(/<[^>]+>/g, "").trim()) : null;

    // price
    const priceMatch = chunk.match(/class="text-m font-heaviest"[\s\S]{0,200}?>([\s\S]*?)<\/p>/i)
      || chunk.match(/data-sentry-component="Price"[\s\S]{0,600}?font-heaviest"[\s\S]{0,100}?>([\s\S]*?)<\/p>/i);
    const price = priceMatch ? toIntPrice(priceMatch[1]) : null;

    // store name: "hos<span ...> Moory</span>"
    const storeMatch = chunk.match(/hos\s*<span[^>]*>\s*([^<]+)\s*<\/span>/i);
    const store = storeMatch ? decodeHtmlEntities(storeMatch[1].trim()) : null;

    if (!title || !price) continue;

    items.push({
      title,
      price,
      originalPrice: null,
      store,
      image: img ? absUrl(img) : null,
      url: href ? absUrl(href) : null,
      source: "Prisjakt"
    });
  }

  // sort by price
  items.sort((a, b) => a.price - b.price);
  return items;
}

async function searchPrisjaktPublic({ query, limit = 12 }) {
  const url = `${BASE}/search?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PrisBot/1.0; +https://localhost)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Prisjakt public search error ${res.status}: ${text.slice(0, 200)}`);
  }

  const html = await res.text();

  // 1) NEXT_DATA path
  const nextData = extractNextData(html);
  if (nextData) {
    const candidates = [];
    collectCandidates(nextData, candidates);
    const mapped = candidates.map(mapNextDataCandidate).filter(Boolean);

    // Deduplicate by url/title+price
    const seen = new Set();
    const deduped = [];
    for (const it of mapped) {
      const k = it.url || `${it.title}|${it.price}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(it);
      if (deduped.length >= limit) break;
    }
    if (deduped.length) {
      deduped.sort((a, b) => a.price - b.price);
      return deduped.slice(0, limit);
    }
  }

  // 2) HTML card parsing fallback
  const parsed = parseProductGridCards(html, limit);
  return parsed.slice(0, limit);
}

/**
 * Backwards-compatible export used by routes.
 * Previously returned [] if not configured; now falls back to public scraping.
 */
async function searchPrisjaktIfConfigured(args) {
  const query = (args && (args.query || args.q)) ? String(args.query || args.q) : "";
  const limit = args && args.limit ? args.limit : 12;
  if (!query || !String(query).trim()) return [];

  // Try partner API if configured, else public.
  if (hasPrisjaktConfig()) {
    try {
      const r = await searchPrisjaktPartner({ query, limit });
      if (r && r.length) return r;
    } catch (e) {
      console.warn("Prisjakt partner API failed, falling back to public search:", e.message);
    }
  }

  try {
    return await searchPrisjaktPublic({ query, limit });
  } catch (e) {
    console.warn("Prisjakt public search failed:", e.message);
    return [];
  }
}

/**
 * Main function expected by the API route.
 * "Smart" = try partner API if configured, otherwise fall back to public search.
 *
 * NOTE: Earlier patches introduced a route that calls `searchPrisjaktSmart`,
 * but the client only exported `searchPrisjaktIfConfigured`. This caused:
 *   "searchPrisjaktSmart is not a function" (HTTP 500)
 */
async function searchPrisjaktSmart(args) {
  // Keep behavior: if partner API is configured, use it, else fall back to public.
  return searchPrisjaktIfConfigured(args);
}

module.exports = {
  searchPrisjaktSmart,
  searchPrisjaktIfConfigured,
  // Exported for debugging / potential future UI use.
  searchPrisjaktPublic,
};
