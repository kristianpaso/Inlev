const cheerio = require('cheerio');
const { tipsterConfig, canonicalUrl } = require('./parser');

const sourceCache = new Map();
const sourceHealth = new Map();

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function absoluteUrl(href, base) { try { return new URL(href, base).toString(); } catch { return ''; } }
function sourceRoot(sourceId) { return `https://${tipsterConfig.sources[sourceId].domain}/`; }

async function publicFetch(url, sourceId) {
  const config = tipsterConfig.sources[sourceId];
  const last = sourceCache.get(`${sourceId}:request`) || 0;
  const delay = Math.max(0, Number(config.minimumDelayMs || 3000) - (Date.now() - last));
  if (delay) await wait(delay);
  sourceCache.set(`${sourceId}:request`, Date.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Trav-Tipsters/1.0 (public-source-reader)' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function discoverLinks(html, sourceId) {
  const root = sourceRoot(sourceId);
  const config = tipsterConfig.sources[sourceId];
  const $ = cheerio.load(html);
  const links = [];
  $('a[href]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href'), root);
    const text = `${$(element).text()} ${$(element).attr('aria-label') || ''}`.replace(/\s+/g, ' ').trim();
    if (!url || !url.startsWith(root) || url === root) return;
    const pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
    if (['/andelsspel', '/nyheter', '/travtips', '/v85', '/v86', '/v64', '/v65', '/gs75', '/plus'].includes(pathname)) return;
    const candidate = `${text} ${url}`.toLowerCase();
    const hasHint = (config.articleHints || []).some((hint) => candidate.includes(String(hint).toLowerCase()));
    const hasTipster = tipsterConfig.tipsters.some((tipster) => tipster.primarySource === sourceId && tipster.aliases.some((alias) => candidate.includes(String(alias).toLowerCase())));
    if (hasHint || hasTipster) links.push({ url: canonicalUrl(url), title: text });
  });
  return [...new Map(links.map((item) => [item.url, item])).values()].slice(0, 8);
}

function articleToSections(html, sourceId) {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,footer').remove();
  const sections = [];
  const tipsters = tipsterConfig.tipsters.filter((tipster) => tipster.enabled && tipster.primarySource === sourceId);
  const textWithBreaks = (nodes) => {
    const markup = (Array.isArray(nodes) ? nodes : [nodes]).map((node) => $.html(node)).join('');
    return cheerio.load(markup.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:strong|b)>/gi, '\n')).root().text().replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*/g, '\n').trim();
  };
  const knownHeadings = [];
  $('h1,h2,h3,h4,strong,b').each((_, heading) => {
    const headingText = $(heading).text().replace(/\s+/g, ' ').trim();
    const tipster = tipsters.find((item) => item.aliases.some((alias) => headingText.toLowerCase() === alias.toLowerCase()));
    if (tipster) knownHeadings.push({ node: heading, parent: $(heading).parent()[0], tipster });
  });
  for (const item of knownHeadings) {
    const siblings = $(item.parent).children().toArray();
    const start = siblings.indexOf(item.node);
    const next = knownHeadings.find((candidate) => candidate.parent === item.parent && siblings.indexOf(candidate.node) > start);
    const end = next ? siblings.indexOf(next.node) : siblings.length;
    const text = textWithBreaks(siblings.slice(start + 1, end));
    if (text) sections.push({ tipster: item.tipster.name, text });
  }
  if (!sections.length) {
    const text = textWithBreaks($('body').toArray());
    const occurrences = [];
    for (const tipster of tipsters) {
      for (const alias of tipster.aliases) {
        let from = 0;
        const normalizedText = text.toLowerCase();
        const normalizedAlias = String(alias).toLowerCase();
        while ((from = normalizedText.indexOf(normalizedAlias, from)) >= 0) { occurrences.push({ at: from, tipster }); from += normalizedAlias.length; }
      }
    }
    occurrences.sort((a, b) => a.at - b.at);
    occurrences.forEach((occurrence, index) => {
      const next = occurrences[index + 1]?.at || text.length;
      const part = text.slice(occurrence.at, next).trim();
      if (/\b(?:V64|V65|V75|V85|V86|GS75)[-\s]?\d+/.test(part)) sections.push({ tipster: occurrence.tipster.name, text: part });
    });
  }
  return [...new Map(sections.filter((section) => section.text).map((section) => [`${section.tipster}:${section.text}`, section])).values()];
}

async function discoverPublicArticles() {
  const articles = [];
  const health = [];
  for (const sourceId of Object.keys(tipsterConfig.sources)) {
    const config = tipsterConfig.sources[sourceId];
    const lastDiscovery = sourceCache.get(`${sourceId}:discovery`) || 0;
    if (Date.now() - lastDiscovery < Number(config.discoveryCooldownMinutes || 15) * 60000) { const cachedArticles = sourceCache.get(`${sourceId}:articles`) || []; articles.push(...cachedArticles); health.push({ sourceId, status: 'ok', cached: true, discoveredArticles: cachedArticles.length }); continue; }
    sourceCache.set(`${sourceId}:discovery`, Date.now());
    try {
      const root = sourceRoot(sourceId);
      const robots = await publicFetch(`${root}robots.txt`, sourceId).catch(() => '');
      if (/^\s*disallow:\s*\/\s*$/im.test(robots)) { health.push({ sourceId, status: 'blocked', error: 'robots.txt tillåter inte läsning' }); continue; }
      const home = await publicFetch(root, sourceId);
      const links = discoverLinks(home, sourceId);
      const sourceArticles = [];
      for (const link of links) {
        try {
          const html = await publicFetch(link.url, sourceId);
          const sections = articleToSections(html, sourceId);
          if (sections.length) sourceArticles.push({ sourceId, url: link.url, title: link.title, sections });
        } catch (error) { health.push({ sourceId, status: 'degraded', url: link.url, error: error.message }); }
      }
      sourceCache.set(`${sourceId}:articles`, sourceArticles);
      articles.push(...sourceArticles);
      health.push({ sourceId, status: 'ok', discoveredArticles: links.length });
    } catch (error) { health.push({ sourceId, status: 'degraded', error: error.message }); }
  }
  for (const item of health) sourceHealth.set(item.sourceId, item);
  return { articles, health: [...sourceHealth.values()] };
}

module.exports = { discoverPublicArticles, sourceHealth };
