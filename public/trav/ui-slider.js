// ui-slider.js — kompakt häst/kusk, villkorsstyrd padding för strukna/tomma rader,
// direkt kupong-render, och uppdaterad design
(function () {
  if (window.__TRAV_SLIDER__) return; window.__TRAV_SLIDER__ = true;

  // ---------- helpers ----------
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn, false);
  const read  = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const safe  = (fn) => { try { return fn(); } catch (e) { console.error('[trav]', e); } };

  // ---------- keys / system ----------
  const gameId = safe(() => new URL(location.href).searchParams.get('game') || 'GAME-DEFAULT') || 'GAME-DEFAULT';
  const K = {
    INFO:    id => 'ts:info:'    + id,
    COUPONS: id => 'ts:coupons:' + id,
    MINE:    id => 'ts:mine:'    + id,
    FORM:    id => 'ts:form:'    + id,
    PRICE:   id => 'ts:price:'   + id,
  };

  // ---------- form / price ----------
  const FORM_PRICE = { V64:1, V65:1, GS75:1, V75:0.5, V86:0.5, V85:0.5 };
  const getForm = () => read(K.FORM(gameId), 'V64');
  const setForm = (f) => { write(K.FORM(gameId), f); write(K.PRICE(gameId), (FORM_PRICE[f] != null ? FORM_PRICE[f] : 1)); };
  if (!localStorage.getItem(K.PRICE(gameId))) setForm(getForm());
  const price = () => read(K.PRICE(gameId), 1);

  // ---------- state ----------
  let legs    = read(K.INFO(gameId), null);
  let coupons = read(K.COUPONS(gameId), []);
  let mine    = read(K.MINE(gameId), []);
  let curLeg  = 1;

  // ---------- styles ----------
  (function injectCss(){
    if ($('style[data-ts-core]')) return;
    const st = document.createElement('style'); st.setAttribute('data-ts-core','1');
    st.textContent =
      '#trav-toolbar{display:flex;gap:8px;justify-content:flex-end;margin:8px 0}' +
      '#trav-toolbar .btn{border:1px solid #2a3a52;border-radius:10px;padding:6px 10px;background:#0f1724;color:#e6edf7;cursor:pointer}' +
      '#trav-toolbar .btn.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}' +

      '#trav-slider-host{--row:44px;--line:#28384f;--bg:#0f1724;--text:#e6edf7;--accent:#1f6feb;white-space:normal;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,"Helvetica Neue",Arial,sans-serif;margin-bottom:12px}' +
      '#trav-slider-host .ts-head{display:flex;flex-direction:column;gap:10px;margin:8px 0 12px}' +
      '#trav-slider-host .ts-title{font-weight:800;color:var(--text);display:flex;gap:10px;align-items:center;justify-content:center}' +
      '#trav-slider-host .ts-nav{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}' +
      '#trav-slider-host .ts-nav .ts-dot{min-width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:#111c2b;color:#e6edf7;font-weight:800;cursor:pointer}' +
      '#trav-slider-host .ts-nav .ts-dot.active{background:#d88715;color:#fff;border-color:#a96a16}' +

      '#trav-slider-host .ts-grid{display:grid;grid-template-columns:120px minmax(420px,1fr) 130px;gap:12px;align-items:start}' +
      '#trav-slider-host .ts-col{background:var(--bg);border:1px dashed #223146;border-radius:12px;padding:8px;align-content:start;font-size:26px}' +
      '#trav-slider-host .ts-col h4{margin:0 0 6px 0;font-size:13px;letter-spacing:.02em;color:#b9c5d9;text-transform:uppercase;font-weight:700}' +

      '#trav-slider-host .ts-sq{height:var(--row);display:flex;align-items:center;justify-content:center;border:2px solid var(--line);border-radius:12px;background:#111c2b;color:#e6edf7;font-weight:800;cursor:pointer;user-select:none;margin-bottom:6px}' +
      '#trav-slider-host .ts-sq.red{background:#b23c3c;color:#fff;border-color:#a83838}' +
      '#trav-slider-host .ts-sq.active{outline:2px solid #2aa198;background:#2aa198}' +
      '#trav-slider-host .ts-sq.disabled{color:#ffffff;background:#656565}' +

      /* mitten-tabell + kompakt häst/kusk */
      '#trav-slider-host .horse-table{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:14px}' +
      '#trav-slider-host .horse-table th{font-size:12px;text-transform:uppercase;color:#b9c5d9;text-align:left;padding:0 10px;white-space:nowrap}' +
      '#trav-slider-host .horse-table td{background:#111c2b;border:1px solid #223146;color:#e6edf7;padding:8px 10px;vertical-align:middle}' +
      '#trav-slider-host .horse-table td:first-child{border-top-left-radius:12px;border-bottom-left-radius:12px;font-weight:900}' +
      '#trav-slider-host .horse-table td:last-child{border-top-right-radius:12px;border-bottom-right-radius:12px;text-align:center;min-width:70px}' +
      '#trav-slider-host .hk-line{display:flex;gap:10px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:3px}' +
      '#trav-slider-host .hk-name{font-weight:900}' +
      '#trav-slider-host .hk-driver{opacity:.85}' +

      '#trav-slider-host .summary{margin-top:12px}' +
      '#trav-slider-host .leg-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:8px}' +
      '#trav-slider-host .leg{background:#111c2b;border:1px solid #223146;border-radius:8px;padding:7px 0;text-align:center;font-weight:800;color:#e6edf7}' +

      '#couponGrid .coupon-card{border:1px solid #223146;border-radius:12px;padding:10px;margin:8px;background:#0f1724;color:#e6edf7}' +
      '#couponGrid .coupon-lines{margin-top:8px;font-family:ui-monospace,Consolas,Menlo,monospace;white-space:pre-wrap;line-height:1.35;opacity:.95}' +
      '#couponGrid .coupon-price{margin-top:6px;opacity:.8}' +

      'dialog.modal{border:none;border-radius:12px;background:#0f1724;color:#e6edf7;width:min(820px,calc(100% - 32px));max-height:85vh;padding:0;overflow:auto}' +
      'dialog.modal::backdrop{background:rgba(0,0,0,.55)}' +
      'dialog.modal .card-header{padding:12px 16px;font-weight:800;border-bottom:1px solid #223146}' +
      'dialog.modal .card-body{padding:14px 16px}' +
      'dialog.modal .card-footer{padding:12px 16px;border-top:1px solid #223146;display:flex;gap:8px;justify-content:flex-end}' +
      '#dlgManual .pill{border:1px solid #2a3a52;border-radius:16px;padding:4px 10px;background:#0f1724;color:#e6edf7}' +
      '#dlgManual .pill.active{background:#1f6feb;border-color:#1f6feb;color:#fff}';
    document.head.appendChild(st);
  })();

  // ---------- mount ----------
  function ensureHostAndToolbar(){
    const sec = $('.section') || document.body;
    const oh=$('.section .section-header'); if(oh) oh.style.display='none';
    const avd=$('#avdList');               if(avd) avd.style.display='none';
    const st =$('#stickySummary');         if(st)  st.style.display='none';

    if(!$('#trav-toolbar')){
      const tb=document.createElement('div'); tb.id='trav-toolbar';
      tb.innerHTML='<button id="btnOpenManualTS" class="btn primary">Lägg kupong manuellt</button>';
      sec.insertBefore(tb, sec.firstChild);
      on($('#btnOpenManualTS',tb),'click', openManualDialog);
    }
    if(!$('#trav-slider-host')){
      const host=document.createElement('div'); host.id='trav-slider-host';
      host.innerHTML =
        '<div class="ts-head"><div class="ts-title"><span>Avdelning</span> <span id="tsLegPos">1</span><span id="tsLegTotal">/ 0</span><span id="tsPrice" style="margin-left:10px;opacity:.9"></span></div><div class="ts-nav" id="tsNav"></div></div>' +
        '<div class="ts-grid">' +
          '<div class="ts-col" id="colPop"><h4>Populärt</h4></div>' +
          '<div class="ts-col" id="colInfo"><h4>Hästar</h4><table class="horse-table"><thead><tr>' +
            '<th>Häst/Kusk</th><th>V64%</th><th>Trend%</th><th>Distans & spår</th><th>Starter i år</th><th>Vagn</th><th>V-odds</th>' +
          '</tr></thead><tbody id="horseTBody"></tbody></table></div>' +
          '<div class="ts-col" id="colMine"><h4>Min kupong</h4></div>' +
        '</div><div class="summary" id="sumRow"></div>';
      sec.insertBefore(host, $('#trav-toolbar').nextSibling);
    }
  }
  const refs = () => { const h=$('#trav-slider-host'); return { nav:$('#tsNav',h), pos:$('#tsLegPos',h), tot:$('#tsLegTotal',h), price:$('#tsPrice',h), pop:$('#colPop',h), tbody:$('#horseTBody',h), mine:$('#colMine',h), sum:$('#sumRow',h) }; };

  function ensureMine(){ if(!legs) return; if(!Array.isArray(mine)) mine=[]; while(mine.length<legs.length) mine.push([]); write(K.MINE(gameId), mine); }

  // ---------- slider ----------
  function buildNav(r){
    const nav=r.nav; if(!nav||!legs) return; nav.innerHTML='';
    for(let i=1;i<=legs.length;i++){
      const b=document.createElement('button'); b.className='ts-dot'; b.textContent=String(i);
      b.onclick=()=> setLeg(i);
      if(i===curLeg) b.classList.add('active');
      nav.appendChild(b);
    }
  }
  function setLeg(n){
    if(!legs||!legs.length) return;
    const r=refs(); curLeg=clamp(n,1,legs.length);
    if(r.pos) r.pos.textContent=String(curLeg);
    if(r.tot) r.tot.textContent='/ '+legs.length;
    renderLeg(r); renderSummary(r);
  }

  function renderLeg(r){
    r=r||refs(); if(!legs||!legs.length) return; ensureMine(); buildNav(r);

    const leg=legs[curLeg-1];
    const mapByNum={}, nums=[]; let maxNum=1;
    for(const h of leg.horses){ mapByNum[h.num]=h; if(h.num>maxNum) maxNum=h.num; }
    for(let i=1;i<=maxNum;i++) nums.push(i);

    // populärt från kuponger
    const cnt={}, max={v:0};
    for(const c of coupons){
      const arr=(c.legs||[])[curLeg-1]||[];
      for(const n of arr){ cnt[n]=(cnt[n]||0)+1; if(cnt[n]>max.v) max.v=cnt[n]; }
    }

    // vänster (populärt)
    const pop=$('#colPop');
    if(pop){
      pop.innerHTML='<h4>Populärt</h4>';
      nums.forEach((n,idx)=>{
        const d=document.createElement('div'); d.className='ts-sq';
        if (idx===0) d.style.marginTop='34px';   // linjering med tabellens första rad
        const v=cnt[n]||0; if(v===max.v&&max.v>0) d.classList.add('red'); if(v===0) d.classList.add('disabled');
        d.textContent=String(n);
        pop.appendChild(d);
      });
    }

    // mitten (tabell) — visa ENDAST "Hästnamn — Kusk" (ingen siffra här)
    if(r.tbody){
      r.tbody.innerHTML='';
      nums.forEach(n=>{
        const h=mapByNum[n];
        const tr=document.createElement('tr');

        const tdName=document.createElement('td');
        const line=document.createElement('div'); line.className='hk-line';
        // Lägg extra padding bara när häst saknas eller markerats struken
        if (!h || h.scratched) { line.style.padding = '14px'; }
        const spanName=document.createElement('span');  spanName.className='hk-name';   spanName.textContent=h?(h.name||''):'';
        const spanDriver=document.createElement('span'); spanDriver.className='hk-driver'; spanDriver.textContent=h&&h.driver?('— '+h.driver):'';
        line.appendChild(spanName); line.appendChild(spanDriver);
        tdName.appendChild(line);

        const tdPct   = document.createElement('td'); tdPct.textContent   = (h&&h.pct   != null ? String(h.pct)   : '');
        const tdTrend = document.createElement('td'); tdTrend.textContent = (h&&h.trend != null ? String(h.trend) : '');
        const tdDist  = document.createElement('td'); tdDist.textContent  = (h&&h.dist  || '');
        const tdStart = document.createElement('td'); tdStart.textContent = (h&&h.starts|| '');
        const tdVagn  = document.createElement('td'); tdVagn.textContent  = (h&&h.vagn  || '');
        const tdOdds  = document.createElement('td'); tdOdds.textContent  = (h&&h.vodds || '');

        tr.appendChild(tdName); tr.appendChild(tdPct); tr.appendChild(tdTrend);
        tr.appendChild(tdDist); tr.appendChild(tdStart); tr.appendChild(tdVagn); tr.appendChild(tdOdds);
        r.tbody.appendChild(tr);
      });
    }

    // höger (min kupong)
    const mineWrap=r.mine;
    if(mineWrap){
      mineWrap.innerHTML='<h4>Min kupong</h4>';
      const set=new Set(mine[curLeg-1]||[]);
      nums.forEach((nn,idx)=>{
        const pill=document.createElement('div'); pill.className='ts-sq'+(set.has(nn)?' active':''); pill.textContent=String(nn);
        if (idx===0) pill.style.marginTop='34px'; // linjering
        pill.onclick=()=>{
          const arr=new Set(mine[curLeg-1]||[]);
          if(arr.has(nn)) arr.delete(nn); else arr.add(nn);
          mine[curLeg-1]=Array.from(arr).sort((a,b)=>a-b);
          write(K.MINE(gameId),mine);
          renderSummary(r); renderLeg(r);
        };
        mineWrap.appendChild(pill);
      });
    }
  }

  function renderSummary(r){
    r=r||refs(); if(!legs||!legs.length||!r.sum) return; r.sum.innerHTML='';
    const counts=[]; for(let i=0;i<mine.length;i++) counts.push((mine[i]&&mine[i].length)?mine[i].length:0);
    while(counts.length<legs.length) counts.push(0);
    const row=document.createElement('div'); row.className='leg-row';
    counts.forEach((c,i)=>{
      const cell=document.createElement('div'); cell.className='leg';
      cell.innerHTML = `<div>Avd ${i+1}</div><div style="opacity:.9">${c}</div>`;
      row.appendChild(cell);
    });
    r.sum.appendChild(row);
    let rows=1; counts.forEach(c => rows *= Math.max(c,1));
    if(r.price) r.price.textContent='Pris: '+String(price()).replace('.',',')+' kr';
    const tot=document.createElement('div'); tot.className='coupon-price';
    tot.textContent='= '+(rows*price()).toLocaleString('sv-SE')+' kr';
    r.sum.appendChild(tot);
  }

  // ---------- kuponglista ----------
  const couponPrice = c => {
    const L=(c.legs&&c.legs.length)||0; if(!L) return 0;
    let rows=1; for(let i=0;i<L;i++){ const len=(c.legs[i]?c.legs[i].length:0); rows*=Math.max(len,1); }
    return rows*price();
  };
  const linesForCoupon = c => {
    const L=(c.legs&&c.legs.length)||0, out=[];
    for(let i=0;i<L;i++){ const arr=c.legs[i]||[]; out.push(`Avd ${i+1}: ${arr.length?arr.join(' '):'—'}`); }
    return out.join('\n');
  };

  function renderCouponGrid(){
    const grid=$('#couponGrid'); if(!grid) return;
    grid.innerHTML='';
    for(let i=0;i<coupons.length;i++){
      const c=coupons[i]||{name:'Kupong '+(i+1), legs:[]};
      const card=document.createElement('div'); card.className='coupon-card';
      const title=document.createElement('b'); title.textContent=c.name||('Kupong '+(i+1)); card.appendChild(title);
      const lines=document.createElement('div'); lines.className='coupon-lines'; lines.textContent=linesForCoupon(c); card.appendChild(lines);
      const p=document.createElement('div'); p.className='coupon-price'; p.textContent='Pris: '+couponPrice(c).toLocaleString('sv-SE')+' kr'; card.appendChild(p);
      const del=document.createElement('button');
      del.className='btn'; del.style.cssText='margin-top:8px;background:#b23c3c;border:1px solid #b23c3c;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;';
      del.textContent='Ta bort';
      del.onclick=()=>{ coupons.splice(i,1); write(K.COUPONS(gameId),coupons); renderCouponGrid(); renderLeg(); renderSummary(); };
      card.appendChild(del);
      grid.appendChild(card);
    }
  }

  // Engångs-observer för att fånga när #couponGrid dyker upp (render direkt)
  function renderCouponGridWhenReady(){
    const grid=$('#couponGrid');
    if (grid) { renderCouponGrid(); return; }
    const obs = new MutationObserver(() => {
      const g = $('#couponGrid');
      if (g) { obs.disconnect(); renderCouponGrid(); }
    });
    obs.observe(document.body, { childList:true, subtree:true });
    setTimeout(()=>obs.disconnect(), 5000);
  }

  const persistCouponsAndRefresh = () => { write(K.COUPONS(gameId), coupons); renderCouponGrid(); };

  // ---------- manuell dialog ----------
  function getManualDialog(){
    let dlg=$('#dlgManual');
    if(!dlg){
      dlg=document.createElement('dialog'); dlg.id='dlgManual'; dlg.className='modal';
      dlg.innerHTML='<form method="dialog" class="card"><header class="card-header">Lägg kupong manuellt</header><div class="card-body" id="manualBlocks"></div><footer class="card-footer"><button type="button" class="btn" id="btnManualClose">Stäng</button><button type="button" class="btn primary" id="btnManualSave">Spara kupong</button></footer></form>';
      document.body.appendChild(dlg);
      on($('#btnManualClose',dlg),'click',()=>{ if(dlg.open) dlg.close(); });
    }
    if(dlg.className.indexOf('modal')===-1) dlg.classList.add('modal');
    return dlg;
  }

  function buildPillUI(dlg){
    const body = $('#manual1blocks',dlg) || $('#manualBlocks',dlg) || $('.card-body',dlg) || dlg;
    body.innerHTML='';
    if(!legs||!legs.length){ body.innerHTML='<div>Inga avdelningar inlästa ännu.</div>'; return; }

    // egna selections per öppning – kuponger kopieras inte längre
    const selections = Array.from({length: legs.length}, () => ({}));

    for(let l=0;l<legs.length;l++){
      const leg=legs[l];
      const wrap=document.createElement('div'); wrap.className='mt';
      const label=document.createElement('label'); label.style.color='#e6edf7'; label.textContent='AVD '+(l+1)+' — välj hästar';
      const grid=document.createElement('div'); grid.style.display='grid'; grid.style.gridTemplateColumns='repeat(auto-fit,minmax(44px,1fr))'; grid.style.gap='6px';
      let maxNum=1; for(const h of leg.horses) if(h.num>maxNum) maxNum=h.num;
      for(let n=1;n<=maxNum;n++){
        const btn=document.createElement('button'); btn.type='button'; btn.className='pill'; btn.textContent=String(n);
        btn.onclick=()=>{ const s=selections[l]; s[n]=!s[n]; btn.classList.toggle('active', !!s[n]); };
        grid.appendChild(btn);
      }
      wrap.appendChild(label); wrap.appendChild(grid); body.appendChild(wrap);
    }

    const save=$('#btnManualSave',dlg);
    save.onclick = (e)=>{
      e.preventDefault&&e.preventDefault();
      const arr=[];
      for(let i=0;i<selections.length;i++){
        const s=selections[i];
        const nums=Object.keys(s).filter(k=>s[k]).map(Number).sort((a,b)=>a-b);
        arr.push(nums);
      }
      coupons.push({ name:'Kupong ' + (coupons.length+1), legs:arr });
      persistCouponsAndRefresh();
      if(dlg.open) dlg.close();
    };
  }

  function openManualDialog(){
    const dlg=getManualDialog();
    try{ if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','open'); }catch{ dlg.setAttribute('open','open'); }
    setTimeout(()=> buildPillUI(dlg), 0);
  }

  // ---------- PASTE-ALL: TAB-parser (HÄST/KUSK/V64%/TREND%/DISTANS & SPÅR/STARTER I ÅR/VAGN/V-ODDS) ----------
  function wirePasteAll(){
    const ta=$('#fldAllPaste'); if(!ta) return;
    on(ta,'input',()=>{
      const raw=ta.value; if(!raw || !raw.trim()) return;
      const rows = raw.split(/\r?\n/).map(s => (s||'').trim()).filter(Boolean);

      const out=[]; let lastNum=0, idx=1, cur={idx, horses:[]};

      for (const line of rows) {
        if (/^HÄST(\t| )+KUSK/i.test(line)) continue; // hoppa rubrik

        const cols = line.split('\t');
        let num, name, driver='', pct='', trend='', dist='', starts='', vagn='', vodds='';

        if (cols.length >= 8) {
          const m = (cols[0]||'').match(/^(\d{1,2})\s+(.*)$/);
          if (!m) continue;
          num   = +m[1];
          name  = m[2] || '';

          driver = (cols[1]||'').trim();
          pct    = (cols[2]||'').trim();
          trend  = (cols[3]||'').trim();
          dist   = (cols[4]||'').trim();
          starts = (cols[5]||'').trim();
          vagn   = (cols[6]||'').trim();
          vodds  = (cols[7]||'').trim();
        } else {
          const m = line.match(/^(\d{1,2})\s+(.*)$/);
          if (!m) continue;
          num = +m[1];
          let rest = m[2];
          const pm = rest.match(/\s(\d{1,2})\%\s*$/);
          if (pm) { pct = pm[1]+'%'; rest = rest.replace(pm[0],'').trim(); }
          const dash = rest.indexOf(' — ');
          if (dash >= 0) { driver = rest.slice(dash+3).trim(); rest = rest.slice(0,dash).trim(); }
          name = rest;
        }

        if (lastNum && num < lastNum) { out.push(cur); idx++; cur={idx, horses:[]}; }
        lastNum = num;

        const scratched = /struken/i.test(line);
        cur.horses.push({ num, name, driver, pct, trend, dist, starts, vagn, vodds, scratched });
      }

      if (cur.horses.length) out.push(cur);
      if (!out.length) return;

      legs = out; write(K.INFO(gameId), legs);
      mine = Array.from({ length: legs.length }, () => []);
      write(K.MINE(gameId), mine);
      curLeg = 1; setLeg(1);
      renderCouponGrid();
    });
  }

  // ---------- init ----------
  function init(){
    ensureHostAndToolbar();

    if (legs && legs.length){
      if(!Array.isArray(mine) || mine.length!==legs.length){
        mine = Array.from({ length: legs.length }, () => []);
        write(K.MINE(gameId), mine);
      }
      setLeg(1);
    } else {
      const r=refs(); if(r.price) r.price.textContent='';
    }

    renderCouponGridWhenReady(); // kuponger direkt
    wirePasteAll();

    const pills=$('#formPills');
    if (pills){
      on(pills,'click',e=>{
        const btn=e.target && e.target.closest ? e.target.closest('button[data-form]') : null;
        if(!btn) return; e.preventDefault&&e.preventDefault();
        $$('#formPills button[data-form]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active'); setForm(btn.getAttribute('data-form'));
        renderSummary(); renderCouponGrid();
      });
      const cur=getForm(); const act=pills.querySelector('button[data-form="'+cur+'"]'); if(act) act.classList.add('active');
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => safe(init), { once:true });
  } else {
    safe(init);
  }
})();
