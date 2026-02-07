const express = require("express");
const router = express.Router();

function normalizeForMatch(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractTerms(q) {
  const raw = (q || "").toString();
  const terms = [];

  // Keep quoted phrases as whole terms: "lowrance elite fs 9"
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const t = m[1].trim();
    if (t) terms.push(t);
  }

  // Remaining tokens (outside quotes)
  const rest = raw.replace(re, " ");
  rest
    .split(/\s+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((x) => terms.push(x));

  // Normalize & drop tiny tokens
  return terms
    .map((t) => t.replace(/[.,;:]+$/g, "").trim())
    .filter((t) => t.length >= 2);
}

function strictFilter(results, q) {
  const terms = extractTerms(q).map(normalizeForMatch);
  if (!terms.length) return results;

  return (results || []).filter((r) => {
    const name = normalizeForMatch(r && (r.name || r.title || r.productName));
    if (!name) return false;
    return terms.every((t) => name.includes(t));
  });
}

const { searchPrisjaktSmart } = require("../lib/prisjaktClient");
const { searchGooglePricesIfConfigured } = require("../lib/googlePriceSearch");

// GET /api/pris/search?q=...
// Optional query params:
// - sources=google,prisjakt (default: google,prisjakt)
// - limit=200
router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "Missing query param q", results: [] });

    const market = String(req.query.market || "se").toLowerCase();
    // Frontend paginerar ("Visa fler") och behöver ofta fler än 30 träffar.
    // Vi sätter ett rimligt tak för att undvika onödigt stora svar.
    const limitRaw = Number(req.query.limit || 100);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 200);

    const sourcesRaw = String(req.query.sources || "google,prisjakt").toLowerCase();
    const sources = new Set(sourcesRaw.split(",").map(s => s.trim()).filter(Boolean));

    const tasks = [];
    if (sources.has("prisjakt")) tasks.push(searchPrisjaktSmart({ q, market, limit }));
    if (sources.has("google")) tasks.push(searchGooglePricesIfConfigured({ q, market, limit }));

    const resultsArr = await Promise.all(tasks);
    const merged = [].concat(...resultsArr.filter(Boolean));

    const strict = String(req.query.strict || "") === "1";
    const merged2 = strict ? strictFilter(merged, q) : merged;

    // Dedupe by URL (keep lowest price)
    const byUrl = new Map();
    for (const r of merged2) {
      if (!r || !r.url || r.price == null) continue;
      const key = String(r.url);
      const cur = byUrl.get(key);
      if (!cur || Number(r.price) < Number(cur.price)) byUrl.set(key, r);
    }

    const results = Array.from(byUrl.values()).sort((a, b) => Number(a.price) - Number(b.price));

    // If nothing found, produce helpful error hints
    if (!results.length) {
      const hints = [];
      if (sources.has("google") && !process.env.GOOGLE_CSE_API_KEY) hints.push("Saknar GOOGLE_CSE_API_KEY");
      if (sources.has("google") && !process.env.GOOGLE_CSE_CX) hints.push("Saknar GOOGLE_CSE_CX");
      // Prisjakt no longer requires credentials; public scraping is used.
      return res.json({ ok: true, query: q, market, results: [], hints });
    }

    res.json({ ok: true, query: q, market, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "Server error", results: [] });
  }
});

module.exports = router;
