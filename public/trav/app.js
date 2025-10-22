/* Trav app – överblick + spel-vy + kuponger + OCR-stub */
(() => {
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const LS_KEY = 'trav.games';

  let games = loadGames();
  let currentGame = null;

  document.addEventListener('DOMContentLoaded', () => {
    wireOverview();
    wireGameView();
    route();
  });

  /* Router */
  function route(){
    const url = new URL(location.href);
    const id = url.searchParams.get('game');
    if (id){
      const g = games.find(x => x.id === id);
      if (!g){
        url.searchParams.delete('game');
        history.replaceState({}, '', url.toString());
        return showOverview();
      }
      currentGame = g;
      return showGame(g);
    }
    showOverview();
  }
  window.addEventListener('popstate', route);

  /* Storage */
  function loadGames(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); }catch(e){ return []; } }
  function saveGames(){ localStorage.setItem(LS_KEY, JSON.stringify(games)); }

  /* Överblick */
  function wireOverview(){ $('#btnNew').addEventListener('click', () => openCreateDialog()); }
  function showOverview(){
    $('#view-game').classList.add('hidden');
    $('#view-overview').classList.remove('hidden');
    renderOverviewCards();
  }
  function renderOverviewCards(){
    const wrap = $('#games'); wrap.innerHTML='';
    if (!games.length){ wrap.innerHTML = `<div class="muted">Inga spelsystem ännu. Klicka ”Skapa spelsystem”.</div>`; return; }
    games.forEach(g => {
      const el = document.createElement('div');
      el.className = 'game-card';
      el.innerHTML = `
        <div><b>${esc(g.name || g.id)}</b></div>
        <div class="badges">Typ: ${g.form} • Avd: ${g.avd}</div>
        <div class="actions">
          <button class="btn" data-open="${g.id}">Öppna</button>
          <button class="btn btn-danger" data-del="${g.id}">Ta bort</button>
        </div>`;
      el.querySelector('[data-open]').onclick = () => {
        const url = new URL(location.href);
        url.searchParams.set('game', g.id);
        history.pushState({}, '', url.toString());
        route();
      };
      el.querySelector('[data-del]').onclick = () => {
        if (!confirm('Ta bort spelsystemet?')) return;
        games = games.filter(x => x.id !== g.id);
        saveGames(); renderOverviewCards();
      };
      wrap.appendChild(el);
    });
  }

  /* Skapa/Redigera */
  function openCreateDialog(edit){
    const dlg = $('#dlgGame');
    $('#dlgTitle').textContent = edit ? 'Redigera spelsystem' : 'Skapa spelsystem';

    // aktivera form-pill
    $$('#formPills .pill').forEach(p => p.classList.toggle('active', (edit?edit.form:'V64')===p.dataset.form));
    // namn/tid
    $('#fldName').value = edit ? (edit.name||'') : '';
    $('#fldStart').value = edit?.start || '';

    // rita per-avd textrutor
    const avd = formToAvd(getActiveForm());
    const cont = $('#perAvdBlocks'); cont.innerHTML='';
    for (let i=1;i<=avd;i++){
      cont.insertAdjacentHTML('beforeend', `
        <div class="mt">
          <label>Avdelning ${i}</label>
          <textarea data-avd="${i}" class="textarea mono" rows="3"
            placeholder="1 Hästnamn | Kusk | 20%&#10;2 ..."></textarea>
        </div>`);
    }

    // byta form re-render
    $$('#formPills .pill').forEach(b => b.onclick = ()=>{ 
      $$('#formPills .pill').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      openCreateDialog(edit);
    });

    dlg.showModal();
    $('#btnCancel').onclick = ()=>dlg.close();

    $('#btnSaveGame').onclick = (e)=>{
      e.preventDefault();
      const form = getActiveForm();
      const avdCount = formToAvd(form);
      const name = $('#fldName').value.trim();
      const start = $('#fldStart').value;

      // Hästar
      const horses = Array.from({length:avdCount}, _=>[]);
      const useAll = $('#chkPasteAll').checked && $('#fldAllPaste').value.trim();

      if (useAll){
        const txt = $('#fldAllPaste').value.replace(/\r/g,'');
        const lines = txt.split('\n').map(s=>s.trim()).filter(Boolean);
        let cur = 1;
        for (let ln of lines){
          if (/^(HÄST|HAST|HÄST\s+KUSK|HÄST\s)/i.test(ln)) continue;
          const parts = ln.split(/\t+| {2,}/).map(s=>s.trim()).filter(Boolean);
          let num=0, name2='', kusk='', pct='';
          if (parts.length >= 3){ num=parts[0]; name2=parts[1]; kusk=parts[2]; pct=parts[3]||''; }
          else {
            const m = ln.match(/^(\d{1,2})\s+(.+?)\s+([A-Za-zÅÄÖåäö'.\- ]+)\s+([\d.,%]+)?$/);
            if (m){ num=m[1]; name2=m[2]; kusk=m[3]; pct=m[4]||''; }
          }
          num = parseInt(String(num||'0').replace(/\D/g,''),10)||0;
          if (num===1 && horses[cur-1]?.length){ cur++; }
          if (!horses[cur-1]) break;
          horses[cur-1].push({n:num, name:name2||'', kusk:kusk||'', pct:String(pct||'')});
        }
      } else {
        $$('#perAvdBlocks textarea').forEach(t=>{
          const a = +t.dataset.avd;
          t.value.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(ln=>{
            const m = ln.match(/^(\d{1,2})\s*[| ]\s*(.+?)\s*[| ]\s*([A-Za-zÅÄÖåäö'.\- ]+)\s*[| ]\s*([\d.,%]+)?$/);
            if (m) horses[a-1].push({n:+m[1], name:m[2].trim(), kusk:m[3].trim(), pct:(m[4]||'')});
          });
        });
      }

      const payload = edit ? edit : {
        id: makeId(form), form, avd: avdCount, created: Date.now(),
        coupons: [], my: Array.from({length:avdCount}, _=>[]),
        pop: Array.from({length:avdCount}, _=>[]),
        cal: { xAvd:[0,30], xH:[45,220], top:220, rowH:32, rows:6 }
      };
      payload.name = name || payload.id;
      payload.start = start || '';
      payload.horses = horses;

      if (!edit) games.unshift(payload);
      saveGames();
      dlg.close();
      const url = new URL(location.href);
      url.searchParams.set('game', payload.id);
      history.pushState({}, '', url.toString());
      route();
    };
  }

  function getActiveForm(){ const p = $('#formPills .pill.active'); return p ? p.dataset.form : 'V64'; }
  function formToAvd(form){
    switch(form){
      case 'V75': case 'GS75': return 7;
      case 'V86': case 'V85': return 8;
      case 'V64': case 'V65': default: return 6;
    }
  }
  function makeId(form){
    const d = new Date(); const stamp = d.toISOString().slice(0,10);
    return `${form}-${stamp}-${Math.floor(Math.random()*99999)}`;
  }

  /* Spel-vy */
  function wireGameView(){
    $('#btnBack').onclick = ()=>{
      const url = new URL(location.href);
      url.searchParams.delete('game');
      history.pushState({}, '', url.toString());
      route();
    };
    $('#btnDelete').onclick = ()=>{
      if (!currentGame) return;
      if (!confirm('Ta bort spelsystemet?')) return;
      games = games.filter(x=>x.id!==currentGame.id);
      saveGames(); $('#btnBack').click();
    };
    $('#btnEdit').onclick = ()=> currentGame && openCreateDialog(currentGame);

    $('#btnManual').onclick = openManualModal;
    $('#btnOCR').onclick = ()=>{ $('#dlgCal').showModal(); switchTab('txt'); };
    $('#btnCalibrate').onclick = ()=>{ $('#dlgCal').showModal(); switchTab('img'); };

    $$('.tab').forEach(t => t.onclick = ()=>switchTab(t.dataset.tab));
    $('#btnCalTest').onclick = testCalRules;
    $('#btnCalSave').onclick = saveCal;
    $('#calImg').onchange = (e)=>{ const f=e.target.files?.[0]; if(f) $('#calPreview').src = URL.createObjectURL(f); };
  }

  function showGame(g){
    currentGame = g;
    $('#view-overview').classList.add('hidden');
    $('#view-game').classList.remove('hidden');
    $('#gameTitle').textContent = `${g.name||g.id} — ${g.form} (${g.avd} avd)`;
    $('#avdCount').textContent = g.avd;
    renderCoupons();
    renderAvdCards();
    renderSummary();
  }

  /* Kuponger */
  function openManualModal(){
    if (!currentGame) return;
    const wrap = $('#manualBlocks'); wrap.innerHTML='';
    for (let i=1;i<=currentGame.avd;i++){
      wrap.insertAdjacentHTML('beforeend', `
        <div class="mt">
          <label>AVD ${i} — hästar (siffror med mellanslag, t.ex. "1 4 7 11")</label>
          <input class="input mono" data-avd="${i}" placeholder="ex. 1 4 7 11">
        </div>`);
    }
    $('#dlgManual').showModal();
    $('#btnManualSave').onclick = (e)=>{
      e.preventDefault();
      const coupon = { id: ($('#couponName').value.trim() || 'Kupong ' + (currentGame.coupons.length+1)), rows:[] };
      $$('#manualBlocks [data-avd]').forEach(inp=>{
        const nums = String(inp.value||'').trim().split(/\s+/).map(s=>parseInt(s,10)).filter(n=>n>0&&n<=15);
        coupon.rows.push(nums);
      });
      currentGame.coupons.push(coupon);
      saveGames(); $('#dlgManual').close(); renderCoupons();
    };
  }
  function renderCoupons(){
    const grid = $('#couponGrid'); grid.innerHTML='';
    if (!currentGame?.coupons?.length){ grid.innerHTML='<div class="muted" style="padding:12px">Inga importerade kuponger ännu.</div>'; return; }
    currentGame.coupons.forEach((c,idx)=>{
      const el = document.createElement('div');
      el.className='coupon-card';
      el.innerHTML = `<b>${esc(c.id)}</b>` +
        c.rows.map((r,i)=>`<div class="row"><span class="badge">AVD ${i+1}</span> <div>${r.join(' ')||'—'}</div></div>`).join('') +
        `<div class="actions"><button class="btn btn-danger" data-del="${idx}">Ta bort</button></div>`;
      el.querySelector('[data-del]').onclick = ()=>{ currentGame.coupons.splice(idx,1); saveGames(); renderCoupons(); };
      grid.appendChild(el);
    });
  }

  /* Avdelningar */
  function renderAvdCards(){
    const wrap = $('#avdList'); wrap.innerHTML='';
    for (let i=1;i<=currentGame.avd;i++){
      const card = document.createElement('div');
      card.className='avd-card';
      card.innerHTML = `
        <div>
          <div class="col-title">Populära</div>
          <div class="row" id="pop-${i}">${renderPopular(i)}</div>
        </div>
        <div>
          <div class="col-title">Häst information <span class="badge">Avd ${i}</span></div>
          <div class="row">${renderInfo(i)}</div>
        </div>
        <div>
          <div class="col-title">Min kupong</div>
          <div class="row" id="mine-${i}">${renderMine(i)}</div>
        </div>`;
      wrap.appendChild(card);
    }
    $$('#avdList input[type="checkbox"][data-avd]').forEach(ch=>{
      ch.onchange = ()=>{
        const a = +ch.dataset.avd, n = +ch.dataset.n;
        const set = new Set(currentGame.my[a-1]||[]);
        ch.checked ? set.add(n) : set.delete(n);
        currentGame.my[a-1] = Array.from(set).sort((x,y)=>x-y);
        saveGames(); renderSummary();
      };
    });
  }
  function renderPopular(a){
    const rows = currentGame.pop?.[a-1] || [];
    if (!rows.length) return `<div class="muted">—</div>`;
    return rows.map(n=>`<span class="num">${n}</span>`).join(' ');
  }
  function renderMine(a){
    const mine = new Set(currentGame.my?.[a-1]||[]);
    const max = Math.max( (currentGame.horses?.[a-1]||[]).map(h=>h.n).reduce((m,x)=>Math.max(m,x),0), 12 );
    let out=''; const upTo = Math.max(15, max);
    for (let n=1;n<=upTo;n++){
      out += `<label style="display:inline-flex;align-items:center;gap:6px">
        <input type="checkbox" data-avd="${a}" data-n="${n}" ${mine.has(n)?'checked':''}>
        <span class="num">${n}</span></label> `;
    }
    return out;
  }
  function renderInfo(a){
    const list = currentGame.horses?.[a-1] || [];
    if (!list.length) return `<div class="muted">Ingen info</div>`;
    return list.sort((x,y)=>x.n-y.n).map(h=>`
      <div class="box">
        <div><b>${h.n} ${esc(h.name||'')}</b></div>
        <div class="muted">${esc(h.kusk||'')}</div>
        ${h.pct ? `<div class="badge">${esc(h.pct)}</div>` : ''}
      </div>`).join('');
  }

  /* Summering & pris */
  function renderSummary(){
    const wrap = $('#summaryRows'); wrap.innerHTML='';
    let price = 1;
    currentGame.my.forEach((arr,i)=>{
      wrap.insertAdjacentHTML('beforeend', `<div>Avd ${i+1}: ${(arr||[]).join(' ')||'—'}</div>`);
      price *= Math.max(1,(arr||[]).length);
    });
    $('#summaryPrice').textContent = `Pris: ${price} kr`;
    $('#priceLive').innerHTML = `Pris: <b>${price} kr</b>`;
  }

  /* OCR-stub */
  function switchTab(id){
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab===id));
    $$('.tabpage').forEach(p => p.classList.toggle('hidden', p.dataset.tabpage!==id));
  }
  function saveCal(){
    if (!currentGame) return;
    currentGame.cal = {
      xAvd:[num($('#calXAvd1').value,0), num($('#calXAvd2').value,30)],
      xH:[num($('#calXH1').value,45), num($('#calXH2').value,220)],
      top:num($('#calTop').value,220),
      rowH:num($('#calRowH').value,32),
      rows:num($('#calRows').value,6),
      regex:$('#calRegex').value,
      mode:$('#calHorseMode').value
    };
    saveGames(); alert('Regler sparade.');
  }
  function testCalRules(){
    const txt = $('#calRaw').value;
    const rx = new RegExp($('#calRegex').value,'im');
    const out = [];
    txt.split(/\r?\n/).forEach(ln=>{ const m = ln.match(rx); if(m) out.push(`AVD ${m[1]}: ${m[2]}`); });
    $('#calOut').textContent = out.join('\n') || '(Inget matchat)';
  }

  /* Utils */
  function num(v,d){ const n = parseFloat(String(v).replace(',','.')); return isFinite(n)?n:d; }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
