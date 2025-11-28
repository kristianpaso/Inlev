// public/trav/js/ui-game-list.js

export function renderGameList(games, { onDelete, onOverview, onEdit }) {
  const listEl = document.getElementById('game-list');
  const emptyEl = document.getElementById('game-list-empty');
  const countEl = document.getElementById('game-count');

  listEl.innerHTML = '';

  if (!games || games.length === 0) {
    emptyEl.style.display = 'block';
    countEl.textContent = '0 spel';
    return;
  }

  emptyEl.style.display = 'none';
  countEl.textContent = `${games.length} spel`;

  games.forEach((game) => {
    const li = document.createElement('li');
    li.className = 'game-card';

    const main = document.createElement('div');
    main.className = 'game-main';

    const title = document.createElement('h3');
    title.className = 'game-title';
    title.textContent = game.title;

    const meta = document.createElement('div');
    meta.className = 'game-meta';

    const date = new Date(game.date || game.createdAt);
    const dateStr = isNaN(date.getTime())
      ? (game.date || '')
      : date.toLocaleDateString('sv-SE');

    meta.innerHTML = `
      <span>${dateStr}</span>
      <span>${game.track}</span>
      <span>${game.gameType}</span>
    `;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'game-actions';

    const btnOverview = document.createElement('button');
    btnOverview.className = 'btn';
    btnOverview.textContent = 'Överblick';
    btnOverview.addEventListener('click', () => {
      if (onOverview) onOverview(game);
      else alert('Överblick-sidan kommer i nästa steg.');
    });

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn';
    btnEdit.textContent = 'Redigera';
    btnEdit.addEventListener('click', () => {
      if (onEdit) onEdit(game);
      else alert('Redigering kommer i ett senare steg.');
    });

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn danger';
    btnDelete.textContent = 'Ta bort';
    btnDelete.addEventListener('click', () => {
      const yes = window.confirm(
        `Är du säker på att du vill ta bort spelet:\n\n"${game.title}"?\n\nDetta går inte att ångra.`
      );
      if (yes && onDelete) onDelete(game);
    });

    actions.appendChild(btnOverview);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    li.appendChild(main);
    li.appendChild(actions);

    listEl.appendChild(li);
  });
}
