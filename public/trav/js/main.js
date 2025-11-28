// public/trav/js/main.js

import { getGames, createGame, deleteGame, updateGame } from './api.js';
import { initGameForm } from './ui-game-form.js';
import { renderGameList } from './ui-game-list.js';

let games = [];
let gameFormApi = null;

function rerenderList() {
  renderGameList(games, {
    onDelete: handleDeleteGame,
    onOverview: handleOverviewGame,
    onEdit: handleEditGame,
  });
}

async function loadGames() {
  try {
    games = await getGames();
    rerenderList();
  } catch (err) {
    console.error(err);
    alert('Kunde inte hämta spel från servern. Kontrollera att Trav API är igång.');
  }
}

// onSubmit från formuläret – både skapa & redigera
async function handleSubmitFromForm(gameData, mode, existingGame) {
  if (mode === 'create') {
    const created = await createGame(gameData);
    games.unshift(created); // lägg högst upp
  } else if (mode === 'edit' && existingGame) {
    const updated = await updateGame(existingGame._id, gameData);
    games = games.map((g) => (g._id === updated._id ? updated : g));
  }

  rerenderList();
}

async function handleDeleteGame(game) {
  try {
    await deleteGame(game._id);
    games = games.filter((g) => g._id !== game._id);
    rerenderList();
  } catch (err) {
    console.error(err);
    alert('Kunde inte ta bort spelet.');
  }
}

function handleOverviewGame(game) {
  // Gå till överblickssidan med spel-id i querystring
  window.location.href = `overview.html?id=${encodeURIComponent(game._id)}`;
}

function handleEditGame(game) {
  if (!gameFormApi) return;
  gameFormApi.openEditForm(game);
}

document.addEventListener('DOMContentLoaded', () => {
  gameFormApi = initGameForm({
    onSubmit: handleSubmitFromForm,
    onCancel: () => {},
  });

  // "Skapa bana" – fortfarande bara placeholder
  const btnNewTrack = document.getElementById('btn-new-track');
  if (btnNewTrack) {
    btnNewTrack.addEventListener('click', () => {
      alert('Skapa bana-funktionen bygger vi i ett eget steg.');
    });
  }

  loadGames();
});
