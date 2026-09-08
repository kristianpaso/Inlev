// public/trav/js/api.js

const params = new URLSearchParams(window.location.search);
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiTarget = params.get('api');
const LOCAL_API_ROOT = 'http://localhost:4000/api/trav';
const RENDER_API_ROOT = 'https://trav-api.onrender.com/api/trav';
const API_ROOTS =
  apiTarget === 'local'
    ? [LOCAL_API_ROOT]
    : apiTarget === 'render'
      ? [RENDER_API_ROOT]
      : isLocalHost
        ? [LOCAL_API_ROOT, RENDER_API_ROOT]
        : [LOCAL_API_ROOT, RENDER_API_ROOT];

let activeApiRoot = API_ROOTS[0];

async function fetchApi(endpoint, options = {}) {
  const path = String(endpoint).startsWith('http')
    ? String(endpoint).replace(LOCAL_API_ROOT, '').replace(RENDER_API_ROOT, '')
    : String(endpoint);
  let lastError = null;

  for (const root of [activeApiRoot, ...API_ROOTS].filter((value, index, values) => values.indexOf(value) === index)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const requestOptions = { ...options };
      if (!requestOptions.signal) requestOptions.signal = controller.signal;
      const response = await fetch(`${root}${path}`, requestOptions);
      if (response.ok || response.status < 500 || apiTarget === 'local' || root === RENDER_API_ROOT) {
        activeApiRoot = root;
        return response;
      }
      lastError = new Error(`Trav API svarade med ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Trav API kunde inte nås');
}

const API_GAMES = '/games';
const API_TRACKS = '/tracks';
const API_ANALYSES = '/analyses';
const API_ATG_LINKS = `${API_GAMES}/atg-links`;

export async function getGames() {
  const res = await fetchApi(API_GAMES);
  if (!res.ok) throw new Error('Kunde inte hämta spel');
  const games = await res.json();
  if (Array.isArray(games) && games.length === 0 && activeApiRoot === LOCAL_API_ROOT && apiTarget !== 'local') {
    const renderRes = await fetch(`${RENDER_API_ROOT}${API_GAMES}`);
    if (renderRes.ok) {
      activeApiRoot = RENDER_API_ROOT;
      return renderRes.json();
    }
  }
  return games;
}

export async function createGame(gameData) {
  const res = await fetchApi(API_GAMES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gameData),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte skapa spel');
  }
  return res.json();
}

export async function deleteGame(id) {
  const res = await fetchApi(`${API_GAMES}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Kunde inte ta bort spel');
  return res.json();
}

// 🔹 NY: uppdatera ett spel
export async function updateGame(id, gameData) {
  const res = await fetchApi(`${API_GAMES}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gameData),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte uppdatera spel');
  }

  return res.json();
}

// 🔹 NY: hämta ett specifikt spel
export async function getGame(id) {
  const res = await fetchApi(`${API_GAMES}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Kunde inte hämta spelet');
  return res.json();
}

// 🔹 Skapa kupong för ett spel
export async function createCoupon(gameId, couponData) {
  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/coupons`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(couponData),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte skapa kupong.');
  }

  return res.json(); // returnerar nya kupongen
}

// 🔹 Ta bort kupong
export async function deleteCoupon(gameId, couponId) {
  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/coupons/${encodeURIComponent(
      couponId
    )}`,
    {
      method: 'DELETE',
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte ta bort kupong.');
  }

  return res.json();
}


// ✅ Sätt kupong aktiv/inaktiv
export async function updateCouponActive(gameId, couponId, active) {
  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/coupons/${encodeURIComponent(couponId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: Boolean(active) }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte uppdatera kupong.');
  }

  return res.json();
}

// ✅ Sätt kupongläge: active | waiting | inactive
export async function updateCouponStatus(gameId, couponId, status) {
  const allowed = ['active', 'waiting', 'inactive'];
  const next = allowed.includes(String(status)) ? String(status) : 'waiting';

  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/coupons/${encodeURIComponent(couponId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte uppdatera kupong.');
  }

  return res.json();
}


// ✅ Uppdatera kupongens innehåll (namn / val / insatsnivå)
//    OBS: samma PATCH-endpoint som status/active använder.
export async function updateCouponContent(gameId, couponId, payload) {
  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/coupons/${encodeURIComponent(couponId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || 'Kunde inte uppdatera kupongen.');
  }

  return res.json();
}

// ---- BANOR ----

export async function getTracks() {
  const res = await fetchApi(API_TRACKS);
  if (!res.ok) {
    throw new Error('Kunde inte hämta banor.');
  }
  const tracks = await res.json();
  if (Array.isArray(tracks) && tracks.length === 0 && activeApiRoot === LOCAL_API_ROOT && apiTarget !== 'local') {
    const renderRes = await fetch(`${RENDER_API_ROOT}${API_TRACKS}`);
    if (renderRes.ok) {
      activeApiRoot = RENDER_API_ROOT;
      return renderRes.json();
    }
  }
  return tracks;
}

export async function createTrack(payload) {
  const res = await fetchApi(API_TRACKS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Kunde inte skapa bana.');
  }

  return res.json();
}

export async function updateTrack(id, payload) {
  const res = await fetchApi(`${API_TRACKS}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Kunde inte uppdatera bana.');
  }

  return res.json();
}

export async function deleteTrack(id) {
  const res = await fetchApi(`${API_TRACKS}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Kunde inte ta bort bana.');
  }

  // 204 No Content – inget att returnera
}

export async function importAtgCoupon(gameId, url, status = null) {
  const res = await fetchApi(`${API_GAMES}/${encodeURIComponent(gameId)}/import/atg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Kunde inte importera ATG-kupong');
  return data;
}

export async function getAtgLinks() {
  const res = await fetchApi(API_ATG_LINKS);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data.error || 'Kunde inte hämta ATG-länkar');
  return data;
}

export async function saveAtgLink(payload) {
  const res = await fetchApi(API_ATG_LINKS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Kunde inte spara ATG-länk');
  return data;
}

export async function deleteAtgLink(linkId) {
  const res = await fetchApi(`${API_ATG_LINKS}/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Kunde inte ta bort ATG-länk');
  return data;
}


export async function fetchWinners(gameId, payload = null) {
  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/results/fetch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || 'Kunde inte hämta vinnare.');
  }
  return res.json();
}

// Hämta stallsnack/intervju från ATG och låt servern parsa + matcha mot avdelning/hästar.
// Servern sparar resultatet på spelet och returnerar en map som UI kan använda direkt.
// Endpoint: POST /api/trav/games/:id/stallsnack/fetch  { url }
export async function fetchStallsnack(gameId, url) {
  if (!gameId) throw new Error('Saknar gameId för stallsnack.');
  if (!url) throw new Error('Saknar URL för stallsnack.');

  const res = await fetchApi(
    `${API_GAMES}/${encodeURIComponent(gameId)}/stallsnack/fetch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || 'Kunde inte hämta stallsnack.');
  }

  return res.json();
}




// ------------------ Analyses ------------------
export async function getAnalyses() {
  const res = await fetchApi(API_ANALYSES);
  if (!res.ok) throw new Error('Kunde inte hämta analyser');
  return res.json();
}

export async function createAnalysis(data) {
  const res = await fetchApi(API_ANALYSES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte skapa analys');
  }
  return res.json();
}

export async function updateAnalysis(id, data) {
  const res = await fetchApi(`${API_ANALYSES}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte uppdatera analys');
  }
  return res.json();
}

export async function deleteAnalysis(id) {
  const res = await fetchApi(`${API_ANALYSES}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Kunde inte ta bort analys');
  }
  return res.json();
}
