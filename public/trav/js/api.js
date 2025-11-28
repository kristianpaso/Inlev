// public/trav/js/api.js

const API_BASE_URL = 'http://localhost:4000/api/trav/games'; // backend-porten

export async function getGames() {
  const res = await fetch(API_BASE_URL);
  if (!res.ok) throw new Error('Kunde inte hämta spel');
  return res.json();
}

export async function createGame(gameData) {
  const res = await fetch(API_BASE_URL, {
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
  const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Kunde inte ta bort spel');
  return res.json();
}

// 🔹 NY: uppdatera ett spel
export async function updateGame(id, gameData) {
  const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(id)}`, {
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
  const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Kunde inte hämta spelet');
  return res.json();
}

// 🔹 Skapa kupong för ett spel
export async function createCoupon(gameId, couponData) {
  const res = await fetch(
    `${API_BASE_URL}/${encodeURIComponent(gameId)}/coupons`,
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
    `${API_BASE_URL}/${encodeURIComponent(gameId)}/coupons/${encodeURIComponent(
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