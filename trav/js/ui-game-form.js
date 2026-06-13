// public/trav/js/ui-game-form.js

// onSubmit kommer få: (gameData, mode, existingGame)
// mode = "create" eller "edit"
export function initGameForm({ onSubmit, onCancel }) {
  const panel = document.getElementById('game-form-panel');
  const form = document.getElementById('game-form');
  const errorEl = document.getElementById('game-form-error');

  const btnNewGame = document.getElementById('btn-new-game');
  const btnCancel = document.getElementById('btn-cancel-game');
  const titleEl = document.getElementById('game-form-title');
  const saveBtn = document.getElementById('btn-save-game');

  let mode = 'create';        // "create" eller "edit"
  let currentGame = null;     // spel som redigeras (vid edit)

  function setMode(newMode, game = null) {
    mode = newMode;
    currentGame = game;

    if (mode === 'create') {
      titleEl.textContent = 'Skapa nytt spel';
      saveBtn.textContent = 'Spara spel';
    } else {
      titleEl.textContent = 'Redigera spel';
      saveBtn.textContent = 'Uppdatera spel';
    }
  }

  function fillFormFromGame(game) {
    form.title.value = game.title || '';
    form.date.value = game.date || '';
    form.track.value = game.track || '';
    form.gameType.value = game.gameType || '';
    form.horseText.value = game.horseText || '';
  }

  function openCreateForm() {
    form.reset();
    errorEl.hidden = true;
    setMode('create', null);
    panel.hidden = false;

    // sätt dagens datum om tomt
    const dateInput = document.getElementById('game-date');
    if (dateInput && !dateInput.value) {
      const today = new Date().toISOString().slice(0, 10);
      dateInput.value = today;
    }

    document.getElementById('game-title').focus();
  }

  function openEditForm(game) {
    if (!game) return;
    errorEl.hidden = true;
    setMode('edit', game);
    fillFormFromGame(game);
    panel.hidden = false;
    document.getElementById('game-title').focus();
  }

  function closeForm() {
    panel.hidden = true;
    currentGame = null;
    setMode('create', null); // återställ till create-läge
  }

  // Knapp i topbaren: "Skapa spel"
  btnNewGame.addEventListener('click', () => {
    openCreateForm();
  });

  btnCancel.addEventListener('click', () => {
    closeForm();
    if (onCancel) onCancel();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    try {
      const gameData = {
        title: form.title.value.trim(),
        date: form.date.value,
        track: form.track.value.trim(),
        gameType: form.gameType.value,
        horseText: form.horseText.value,
      };

      if (!gameData.title || !gameData.date || !gameData.track || !gameData.gameType) {
        throw new Error('Fyll i rubrik, datum, bana och spelform.');
      }

      await onSubmit(gameData, mode, currentGame);
      closeForm();
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || 'Något gick fel.';
      errorEl.hidden = false;
    }
  });

  return {
    openCreateForm,
    openEditForm,
    closeForm,
  };
}
