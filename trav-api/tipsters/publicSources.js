const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { tipsterConfig, canonicalUrl } = require('./parser');

const sourceCache = new Map();
const sourceHealth = new Map();

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function absoluteUrl(href, base) { try { return new URL(href, base).toString(); } catch { return ''; } }
function sourceConfig(sourceId) { return tipsterConfig.sources[sourceId] || {}; }
function sourceRoot(sourceId) { return `https://${sourceConfig(sourceId).domain}/`; }

async function publicFetch(url, sourceId) {
  const config = sourceConfig(sourceId);
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

async function renderedAtgArticle(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    locale: 'sv-SE',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
    viewport: { width: 1365, height: 1100 },
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // ATG visar ofta cookie-dialogen innan innehållet monteras. Utan ett
    // aktivt val blir sidan kvar på en tom/loading-sida i Playwright.
    const consent = page.locator('button').filter({ hasText: 'Tillåt alla' }).first();
    if (await consent.count()) await consent.click({ force: true }).catch(() => {});
    await page.waitForTimeout(5000);
    return await page.evaluate(() => {
      const textOf = (element) => (element?.innerText || element?.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      const hasRaceReference = (text) => /\b(?:V64|V65|V75|V85|V86|GS75)[®\s-]?\d+\b/i.test(text);
      const publicationNode = Array.from(document.querySelectorAll('p,div,section,article'))
        .find((element) => /^Publicerad\s*:/i.test(textOf(element)));
      const publicationRoots = [];
      let current = publicationNode;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const text = textOf(current);
        if (text.length > 500 && /Publicerad\s*:/i.test(text) && /Senast uppdaterad\s*:/i.test(text) && hasRaceReference(text)) publicationRoots.push({ current, text });
      }
      const contentCandidates = Array.from(document.querySelectorAll('[class*="ContentfulComponent"],[class*="ContentfulContentCard"],article,main section'))
        .map((element) => ({ element, text: textOf(element) }))
        .filter(({ text }) => text.length > 500 && /Publicerad\s*:/i.test(text) && /Senast uppdaterad\s*:/i.test(text) && hasRaceReference(text))
        .concat(publicationRoots)
        .sort((left, right) => left.text.length - right.text.length);
      const selected = contentCandidates[0];
      const body = selected?.element?.querySelector('[data-test-id="news-article-body"]');
      const sections = [];
      let pendingImage = '';
      for (const child of Array.from(body?.children || [])) {
        const childText = textOf(child);
        const image = child.querySelector?.('img')?.currentSrc || child.querySelector?.('img')?.src || '';
        if (image) { pendingImage = image; continue; }
        if (child.tagName !== 'P' || !childText || child.querySelector('a')) continue;
        const heading = child.querySelector('b,strong')?.textContent?.replace(/\s+/g, ' ').trim() || childText.split(/\n/)[0].trim();
        sections.push({ heading, text: childText, image: pendingImage });
        pendingImage = '';
      }
      const text = sections.length ? sections.map((section) => section.text).join('\n\n') : '';
      const heading = selected?.element?.querySelector('h1,h2,h3')?.textContent?.replace(/\s+/g, ' ').trim() || document.title || '';
      return { title: heading, text, sections, image: sections.find((section) => section.image)?.image || '', isArticle: Boolean(selected && text) };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

function discoverLinks(html, sourceId) {
  const root = sourceRoot(sourceId);
  const config = sourceConfig(sourceId);
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

function articleToSections(html, sourceId, context = {}) {
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
  const bodyText = textWithBreaks($('body').toArray());
  if (!sections.length) {
    const text = bodyText;
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
  if (!sections.length && sourceId === 'untersteiner' && bodyText) {
    sections.push({ tipster: tipsters[0]?.name || 'Team Untersteiner', text: bodyText });
  }
  if (!sections.length && sourceId === 'stallzet' && bodyText) {
    const date = new Date(`${context.date || ''}T12:00:00`);
    const day = Number.isNaN(date.getTime()) ? null : date.getDate();
    const month = Number.isNaN(date.getTime()) ? null : date.getMonth() + 1;
    const track = String(context.track || '').trim();
    const markerPattern = /\b(\d{1,2})\s*\/\s*(\d{1,2})\s+([^:\n]{2,50}):/gi;
    const markers = [...bodyText.matchAll(markerPattern)];
    const marker = markers.find((item) => (!day || Number(item[1]) === day) && (!month || Number(item[2]) === month) && (!track || item[3].toLowerCase().includes(track.toLowerCase())));
    const start = marker ? marker.index : 0;
    const nextMarker = marker ? markers.find((item) => item.index > start) : null;
    const text = bodyText.slice(start, nextMarker ? nextMarker.index : bodyText.length).trim();
    if (text) sections.push({ tipster: tipsters[0]?.name || 'Daniel Redén', text });
  }
  return [...new Map(sections.filter((section) => section.text).map((section) => [`${section.tipster}:${section.text}`, section])).values()];
}

function pageMetadata(html, url, sourceId) {
  const $ = cheerio.load(html);
  const meta = (name) => $(`meta[property="${name}"],meta[name="${name}"]`).first().attr('content') || '';
  const title = meta('og:title') || $('title').first().text().replace(/\s+/g, ' ').trim();
  return { sourceId, url: canonicalUrl(meta('og:url') || url), title, description: meta('og:description') || meta('description'), image: meta('og:image'), publishedAt: meta('article:published_time') || null };
}

function dateToken(value) {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1].slice(2)}${match[2]}${match[3]}` : '';
}

function sourceSlug(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function atgStallsnackCandidates(game) {
  if (!game?.date || !game?.gameType || !game?.track) return [];
  const token = dateToken(game.date);
  const type = String(game.gameType).toLowerCase();
  const track = sourceSlug(game.track);
  const base = `https://www.atg.se/${game.gameType}/tips/${token}-stallsnack-${type}-${track}`;
  return [`${base}-jackpot`, base, `${base}-express`];
}

async function discoverAtgStallsnack(game) {
  const articles = [];
  for (const url of atgStallsnackCandidates(game)) {
    try {
      const html = await publicFetch(url, 'atg-stallsnack');
      const metadata = pageMetadata(html, url, 'atg-stallsnack');
      if (!/stallsnack/i.test(metadata.title || '') && !/stallsnack/i.test(html)) continue;
      let rendered = null;
      try { rendered = await renderedAtgArticle(url); } catch { /* Metadata räcker om ATG:s rendering inte är tillgänglig. */ }
      // ATG svarar ibland med 200 även för en felaktig/utgången slug och visar
      // då bara tipsindexet. Spara inte den sidan som Stallsnack.
      if (!rendered?.isArticle) continue;
      const articleText = String(rendered.text || '').replace(/\n{3,}/g, '\n\n').trim();
      if (!articleText) continue;
      const sections = Array.isArray(rendered.sections) && rendered.sections.length
        ? rendered.sections.map((section) => ({ tipster: 'ATG Stallsnack', heading: section.heading || '', text: section.text, image: section.image || '' }))
        : (articleText ? [{ tipster: 'ATG Stallsnack', text: articleText }] : []);
      articles.push({
        ...metadata,
        title: (rendered.title || metadata.title || 'Stallsnack från ATG').replace(/®{2,}/g, '®'),
        description: '',
        image: rendered.image || metadata.image || '',
        excerpt: articleText.slice(0, 900),
        isStallsnack: true,
        sections,
      });
      break;
    } catch { /* Försök nästa ATG-slug; ATG har olika suffix för jackpot/express. */ }
  }
  return articles;
}

async function discoverPublicArticles(game = null) {
  const articles = [];
  const health = [];
  const stallsnack = [];
  for (const sourceId of Object.keys(tipsterConfig.sources)) {
    const config = sourceConfig(sourceId);
    const lastDiscovery = sourceCache.get(`${sourceId}:discovery`) || 0;
    if (Date.now() - lastDiscovery < Number(config.discoveryCooldownMinutes || 15) * 60000) { const cachedArticles = sourceCache.get(`${sourceId}:articles`) || []; articles.push(...cachedArticles); if (sourceId === 'atg-stallsnack') stallsnack.push(...cachedArticles.filter((item) => item.isStallsnack)); health.push({ sourceId, status: 'ok', cached: true, discoveredArticles: cachedArticles.length }); continue; }
    sourceCache.set(`${sourceId}:discovery`, Date.now());
    try {
      const root = sourceRoot(sourceId);
      const robots = await publicFetch(`${root}robots.txt`, sourceId).catch(() => '');
      if (/^\s*disallow:\s*\/\s*$/im.test(robots)) { health.push({ sourceId, status: 'blocked', error: 'robots.txt tillåter inte läsning' }); continue; }
      if (sourceId === 'atg-stallsnack') {
        const sourceArticles = await discoverAtgStallsnack(game);
        stallsnack.push(...sourceArticles);
        sourceCache.set(`${sourceId}:articles`, sourceArticles);
        articles.push(...sourceArticles);
        health.push({ sourceId, status: sourceArticles.length ? 'ok' : 'degraded', discoveredArticles: sourceArticles.length, error: sourceArticles.length ? undefined : 'Ingen matchande Stallsnack-artikel hittades' });
        continue;
      }
      const entryUrl = String(config.entryUrl || root);
      const home = await publicFetch(entryUrl, sourceId);
      const links = sourceId === 'stallzet' ? [{ url: entryUrl, title: 'Veckans startkommentarer med Daniel Redén' }] : discoverLinks(home, sourceId).slice(0, 3);
      const sourceArticles = [];
      for (const link of links) {
        try {
          const html = await publicFetch(link.url, sourceId);
          const sections = articleToSections(html, sourceId, game || {});
          const metadata = pageMetadata(html, link.url, sourceId);
          if (sections.length || sourceId === 'stallzet') sourceArticles.push({ ...metadata, title: link.title || metadata.title, description: metadata.description || sections.map((section) => section.text).join('\n\n').slice(0, 900), excerpt: sections.map((section) => section.text).join('\n\n').slice(0, 900), sections });
        } catch (error) { health.push({ sourceId, status: 'degraded', url: link.url, error: error.message }); }
      }
      sourceCache.set(`${sourceId}:articles`, sourceArticles);
      articles.push(...sourceArticles);
      health.push({ sourceId, status: 'ok', discoveredArticles: links.length });
    } catch (error) { health.push({ sourceId, status: 'degraded', error: error.message }); }
  }
  for (const item of health) sourceHealth.set(item.sourceId, item);
  return { articles, health: [...sourceHealth.values()], stallsnack };
}

module.exports = { discoverPublicArticles, discoverAtgStallsnack, sourceHealth };
