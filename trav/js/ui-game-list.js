// public/trav/js/ui-game-list.js

function parseGameDate(game) {
  const raw = (game && (game.date || game.createdAt)) || '';
  // Om "YYYY-MM-DD" -> tolkas som lokal dag (00:00)
  const m = typeof raw === 'string' ? raw.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(game) {
  const d = parseGameDate(game);
  if (!d) return (game.date || '');
  return d.toLocaleDateString('sv-SE');
}

function normalizeType(gameType) {
  const t = (gameType || '').toString().toUpperCase().trim();
  if (t.includes('GS75')) return 'GS75';
  if (t.includes('V86')) return 'V86';
  if (t.includes('V85')) return 'V85';
  if (t.includes('V65')) return 'V65';
  if (t.includes('V64')) return 'V64';
  return t || 'V85';
}

function setArchivedToggleState() {
  const archivedEl = document.getElementById('games-archived');
  const btn = document.getElementById('btn-toggle-archived');
  if (!archivedEl || !btn) return;

  const key = 'trav_archived_hidden';
  const hidden = localStorage.getItem(key) === '1';

  archivedEl.style.display = hidden ? 'none' : '';
  btn.textContent = hidden ? 'Visa' : 'Dölj';

  btn.onclick = () => {
    const nowHidden = archivedEl.style.display !== 'none';
    archivedEl.style.display = nowHidden ? 'none' : '';
    btn.textContent = nowHidden ? 'Visa' : 'Dölj';
    localStorage.setItem(key, nowHidden ? '1' : '0');
  };
}

function buildGameCard(game, { onDelete, onOverview, onEdit }) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.type = normalizeType(game.gameType);

  const main = document.createElement('div');
  main.className = 'game-main';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.alignItems = 'center';
  topRow.style.gap = '10px';
  topRow.style.flexWrap = 'wrap';

  const title = document.createElement('h3');
  title.className = 'game-title';
  title.textContent = game.title || '(utan rubrik)';

  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = normalizeType(game.gameType);

  topRow.appendChild(title);
  topRow.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'game-meta';
  meta.innerHTML = `
    <span>${formatDate(game)}</span>
    <span>${game.track || ''}</span>
    <span>${normalizeType(game.gameType)}</span>
  `;

  main.appendChild(topRow);
  main.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'game-actions';

  const btnOverview = document.createElement('button');
  btnOverview.className = 'btn';
  btnOverview.textContent = 'Överblick';
  btnOverview.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onOverview) onOverview(game);
  });

  const btnEdit = document.createElement('button');
  btnEdit.className = 'btn';
  btnEdit.textContent = 'Redigera';
  btnEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onEdit) onEdit(game);
  });

  const btnDelete = document.createElement('button');
  btnDelete.className = 'btn danger';
  btnDelete.textContent = 'Ta bort';
  btnDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    const yes = window.confirm(
      `Är du säker på att du vill ta bort spelet:\n\n"${game.title}"?\n\nDetta går inte att ångra.`
    );
    if (yes && onDelete) onDelete(game);
  });

  actions.appendChild(btnOverview);
  actions.appendChild(btnEdit);
  actions.appendChild(btnDelete);

  card.appendChild(main);
  card.appendChild(actions);

  return card;
}

export function renderGameList(games, { onDelete, onOverview, onEdit }) {
  const emptyEl = document.getElementById('game-list-empty');
  const countEl = document.getElementById('game-count');

  // Nya containers (Aktiva/Avslutade)
  const splitWrap = document.getElementById('games-split');
  const activeEl = document.getElementById('games-active');
  const archivedEl = document.getElementById('games-archived');
  const countActive = document.getElementById('count-active');
  const countArchived = document.getElementById('count-archived');

  const hasSplit = !!(splitWrap && activeEl && archivedEl && countActive && countArchived);

  // Fallback till gamla listan om split-markup saknas
  const listEl = document.getElementById('game-list');

  if (!games || games.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (countEl) countEl.textContent = '0 spel';
    if (splitWrap) splitWrap.hidden = true;
    if (listEl) listEl.innerHTML = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (countEl) countEl.textContent = `${games.length} spel`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = [];
  const archived = [];

  for (const g of games) {
    const dt = parseGameDate(g);
    if (!dt) {
      active.push(g);
    } else if (dt < today) {
      archived.push(g);
    } else {
      active.push(g);
    }
  }

  // Sortering: aktiva (närmast först), avslutade (senaste först)
  active.sort((a, b) => {
    const da = parseGameDate(a) || today;
    const db = parseGameDate(b) || today;
    return da - db;
  });
  archived.sort((a, b) => {
    const da = parseGameDate(a) || today;
    const db = parseGameDate(b) || today;
    return db - da;
  });

  if (hasSplit) {
    splitWrap.hidden = false;

    activeEl.innerHTML = '';
    archivedEl.innerHTML = '';

    countActive.textContent = active.length;
    countArchived.textContent = archived.length;

    active.forEach((g) => activeEl.appendChild(buildGameCard(g, { onDelete, onOverview, onEdit })));
    archived.forEach((g) => archivedEl.appendChild(buildGameCard(g, { onDelete, onOverview, onEdit })));

    setArchivedToggleState();

    // Ta bort gamla listan om den råkar finnas kvar
    if (listEl) listEl.innerHTML = '';
    return;
  }

  // --- Fallback: gammal rendering (om du råkar ha en äldre index.html) ---
  if (!listEl) return;
  listEl.innerHTML = '';

  games.forEach((game) => {
    const li = document.createElement('li');
    li.className = 'game-card';
    li.dataset.type = normalizeType(game.gameType);

    const main = document.createElement('div');
    main.className = 'game-main';

    const title = document.createElement('h3');
    title.className = 'game-title';
    title.textContent = game.title;

    const meta = document.createElement('div');
    meta.className = 'game-meta';
    meta.innerHTML = `
      <span>${formatDate(game)}</span>
      <span>${game.track}</span>
      <span>${normalizeType(game.gameType)}</span>
    `;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'game-actions';

    const btnOverview = document.createElement('button');
    btnOverview.className = 'btn';
    btnOverview.textContent = 'Överblick';
    btnOverview.addEventListener('click', () => onOverview && onOverview(game));

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn';
    btnEdit.textContent = 'Redigera';
    btnEdit.addEventListener('click', () => onEdit && onEdit(game));

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
