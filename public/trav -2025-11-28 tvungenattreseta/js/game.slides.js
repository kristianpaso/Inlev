// Slider UI (klassiska layouten): Populärt (vänster), Hästar (mitten), Min kupong (höger)
import { el, $, $$ } from './trav.dom.js';
import { TravStore } from './trav.storage.js';
import { renderCoupons, spikeStarsFromCoupons } from './game.coupons.js';

export function mountSlider(gameId, host) {
  const persisted = TravStore.load(gameId);
  const meta = persisted.meta || {};
  const avds = meta.avds || 6; // V64 default 6, V86 8, osv.

  const state = { active: 1, avds, counts: {}, price: 1 };
  for (let i = 1; i <= avds; i++) state.counts[i] = (persisted.picks[i] || []).length;
  computePrice();

  host.innerHTML = '';
  const bar  = renderBar();
  const grid = el('div', { class: 'grid' }, renderPopular(), renderHorsesTable(), renderMyCoupon());
  const kupHost = el('div', { class: 'card' },
    el('div', { class: 'section-title' }, 'Importerade kuponger'),
    el('div', { id: 'kupList' })
  );
  host.append(bar, grid, kupHost);

  hydrateDivision();
  renderCoupons(gameId, $('#kupList'), () => renderPopular(true));
  attachSwipe(grid);

  // ---- components ----
  function renderBar() {
    const wrap = el('div', { class: 'ts-bar' }, el('div', {}, 'Avdelning'));
    for (let i = 1; i <= avds; i++) {
      wrap.append(el('button', {
        class: 'ts-pill' + (i === state.active ? ' active' : ''),
        'data-i': i,
        onclick: () => setActive(i)
      }, i));
    }
    const mini = el('div', { class: 'ts-mini' },
      el('div', { class: 'summary', id: 'tsSummary' }),
      el('div', {}, 'Pris: ', el('strong', { id: 'tsPrice' }, `${state.price} kr`))
    );
    wrap.append(mini);
    refreshSummary();
    return wrap;
  }

  function refreshSummary() {
    const n = $('#tsSummary'); n.innerHTML = '';
    for (let i = 1; i <= avds; i++) {
      n.append(el('span', {}, `${i} `), el('strong', {}, (state.counts[i] || 0).toString()), el('span', {}, '  '));
    }
  }

  function renderPopular(refreshOnly = false) {
    let card = $('#tsPopularCard');
    if (refreshOnly && card) { updateStars(); return card; }
    card = el('div', { class: 'card', id: 'tsPopularCard' },
      el('div', { class: 'section-title' }, 'POPULÄRT'),
      el('div', { class: 'pop-list', id: 'tsPopList' },
        ...Array.from({ length: 15 }, (_, i) => el('div', { class: 'pop-item', 'data-h': i + 1 },
          el('div', {}, el('span', { class: 'hnum' }, i + 1)),
          el('div', { class: 'stars' })
        ))
      )
    );
    updateStars();
    return card;
  }

  function updateStars() {
    const spikes = spikeStarsFromCoupons(gameId, state.active);
    $$('#tsPopList .pop-item').forEach(row => {
      const n = parseInt(row.getAttribute('data-h'), 10);
      const c = spikes.get(n) || 0;
      const stars = row.querySelector('.stars');
      stars.innerHTML = '';
      for (let i = 0; i < c; i++) stars.append(el('span', { class: 'star' }, '★'));
    });
  }

  function renderHorsesTable() {
    return el('div', { class: 'card' },
      el('div', { class: 'section-title' }, 'HÄSTAR'),
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {},
          el('th', {}, '#'),
          el('th', {}, 'HÄST/KUSK'),
          el('th', {}, 'V%'),
          el('th', {}, 'TREND%'),
          el('th', {}, 'DISTANS & SPÅR'),
          el('th', {}, 'STARTER I ÅR'),
          el('th', {}, 'VAGN'),
          el('th', {}, 'V-ODDS')
        )),
        el('tbody', { id: 'tsHorsesBody' },
          el('tr', {}, el('td', { colSpan: '8' }, 'Hästinformation renderas här (placeholder).'))
        )
      )
    );
  }

  function renderMyCoupon() {
    return el('div', { class: 'card' },
      el('div', { class: 'section-title' }, 'MIN KUPONG'),
      el('div', { class: 'min-nums', id: 'tsMinNums' },
        ...Array.from({ length: 15 }, (_, i) => el('button', {
          class: 'min-btn', 'data-n': i + 1, onclick: () => togglePick(i + 1)
        }, i + 1))
      )
    );
  }

  // ---- behaviour ----
  function hydrateDivision() {
    const body = $('#tsHorsesBody');
    const horses = (persisted.horses[state.active - 1] || []).slice().sort((a, b) => (a.num || 0) - (b.num || 0));
    if (!horses.length) {
      body.innerHTML = `<tr><td colspan="8">Inga hästar importerade ännu.</td></tr>`;
      return;
    }
    body.innerHTML = '';
    horses.forEach(r => {
      body.append(el('tr', {},
        el('td', {}, el('span', { class: 'hnum' }, r.num || '?')),
        el('td', {}, `${r.horse || ''} — ${r.driver || ''}`),
        el('td', {}, r.perc || ''),   // V%
        el('td', {}, r.trend || ''),  // Trend
        el('td', {}, r.dist || ''),   // Distans & spår
        el('td', {}, r.starts || ''), // Starter i år
        el('td', {}, r.cart || ''),   // Vagn
        el('td', {}, r.odds || '')    // V-odds
      ));
    });
    // apply current picks as active states
    const part = persisted.picks[state.active] || [];
    $$('.min-btn').forEach(b => b.classList.toggle('active', part.includes(parseInt(b.getAttribute('data-n'), 10))));
    updateStars();
  }

  function togglePick(n) {
    const picks = persisted.picks;
    picks[state.active] = picks[state.active] || [];
    const arr = picks[state.active];
    const i = arr.indexOf(n);
    if (i >= 0) arr.splice(i, 1); else arr.push(n);

    TravStore.save(gameId, { picks });
    document.querySelector(`.min-btn[data-n="${n}"]`)?.classList.toggle('active');

    state.counts[state.active] = arr.length;
    computePrice();
    document.getElementById('tsPrice').textContent = `${state.price} kr`;
    refreshSummary();
  }

  function computePrice() {
    let p = 1;
    for (let i = 1; i <= avds; i++) p *= Math.max(1, state.counts[i] || 0);
    state.price = p;
  }

  function setActive(i) {
    state.active = i;
    $$('.ts-pill').forEach(b => b.classList.toggle('active', parseInt(b.getAttribute('data-i'), 10) === i));
    hydrateDivision();
  }

  function attachSwipe(node) {
    let sx = 0, sy = 0, dx = 0, dy = 0, touching = false;
    node.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; touching = true; }, { passive: true });
    node.addEventListener('touchmove',  e => { if (!touching) return; const t = e.touches[0]; dx = t.clientX - sx; dy = t.clientY - sy; }, { passive: true });
    node.addEventListener('touchend',   () => {
      if (!touching) return; touching = false;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) {
        const next = state.active + (dx < 0 ? 1 : -1);
        if (next >= 1 && next <= avds) setActive(next);
      }
      dx = dy = 0;
    }, { passive: true });
  }
}
