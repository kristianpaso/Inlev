// public/trav/js/api.js

const API_ROOT =
  window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api/trav'
    : 'https://trav-api.onrender.com/api/trav';

const API_GAMES = `${API_ROOT}/games`;
const API_TRACKS = `${API_ROOT}/tracks`;



export async function getGames() {
  const res = await fetch(API_GAMES);
  if (!res.ok) throw new Error('Kunde inte hämta spel');
  return res.json();
}

export async function createGame(gameData) {
  const res = await fetch(API_GAMES, {
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
  const res = await fetch(`${API_GAMES}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Kunde inte ta bort spel');
  return res.json();
}

// 🔹 NY: uppdatera ett spel
export async function updateGame(id, gameData) {
  const res = await fetch(`${API_GAMES}/${encodeURIComponent(id)}`, {
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
  const res = await fetch(`${API_GAMES}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Kunde inte hämta spelet');
  return res.json();
}

// 🔹 Skapa kupong för ett spel
export async function createCoupon(gameId, couponData) {
  const res = await fetch(
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
  const res = await fetch(
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

// ---- BANOR ----

// ---- BANOR ----

export async function getTracks() {
  const res = await fetch(API_TRACKS);
  if (!res.ok) {
    throw new Error('Kunde inte hämta banor.');
  }
  return res.json();
}

export async function createTrack(payload) {
  const res = await fetch(API_TRACKS, {
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
  const res = await fetch(`${API_TRACKS}/${encodeURIComponent(id)}`, {
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
  const res = await fetch(`${API_TRACKS}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Kunde inte ta bort bana.');
  }

  // 204 No Content – inget att returnera
}


