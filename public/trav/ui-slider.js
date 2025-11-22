// ui-slider.js — per-game state, SPA-aware mounting under <!-- Avdelningar -->,
// star markers for "spik", mobile swipe navigation, live price for "Min kupong".
(function () {
  if (window.__TRAV_SLIDER__) return;
  window.__TRAV_SLIDER__ = true;

  // ---------- helpers ----------
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt||false);
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sget = (k, d) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const sset = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sdel = (k)     => { try { sessionStorage.removeItem(k); } catch {} };
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

  const getGameId = () => new URL(location.href).searchParams.get('game') || null;
  const KEY = (gid, slot) => `trav:${gid||'__nogame__'}:${slot}`;

  // ---------- mount under <!-- Avdelningar --> ----------
  function findAvdComment(root) {
    try {
      const walker = document.createTreeWalker(root || document, NodeFilter.SHOW_COMMENT);
      let n; while ((n = walker.nextNode())) if (/Avdelningar/i.test(n.nodeValue||'')) return n;
    } catch {}
    return null;
  }
  function removeLegacySectionAfter(commentNode) {
    if (!commentNode) return;
    let sib = commentNode.nextSibling;
    while (sib && sib.nodeType !== 1) sib = sib.nextSibling;
    if (sib && sib.nodeType === 1 && sib.classList.contains('section')) sib.remove();
  }
  function ensureHostAtAvd() {
    const game = $('#view-game'); if (!game) return null;
    const avdCmt = findAvdComment(game); if (!avdCmt) return null;

    // Döda gammal <div class="section"> under kommentaren
    removeLegacySectionAfter(avdCmt);

    // Om host finns men ligger fel: flytta om
    const wrong = $('#trav-slider-host');
    if (wrong) {
      let sib = avdCmt.nextSibling; while (sib && sib.nodeType !== 1) sib = sib.nextSibling;
      if (sib !== wrong) wrong.remove();
    }

    let host = $('#trav-slider-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'trav-slider-host';
      host.innerHTML = `
        <div class="ts-head">
          <div class="ts-title">
            <span>Avdelning</span>
            <span id="tsLegPos">1</span><span id="tsLegTotal">/ 0</span>
            <span id="tsPrice" class="ts-price"></span>
          </div>
          <div id="tsSummaryTop"></div>
        </div>
        <div class="ts-grid" id="tsSwipeArea">
          <div class="ts-col" id="colPop"><h4>Populärt</h4></div>
          <div class="ts-col" id="colInfo">
            <h4>Hästar</h4>
            <table class="horse-table">
              <thead><tr>
                <th>Häst/Kusk</th><th>V64%</th><th>Trend%</th><th>Distans & spår</th><th>Starter i år</th><th>Vagn</th><th>V-odds</th>
              </tr></thead>
              <tbody id="horseTBody"></tbody>
            </table>
          </div>
          <div class="ts-col" id="colMine"><h4>Min kupong</h4></div>
        </div>
        <div id="couponGrid" class="coupon-grid"></div>
      `;
      avdCmt.parentNode.insertBefore(host, avdCmt.nextSibling);
    }
    return host;
  }
  function isGameVisible() {
    const game = $('#view-game');
    const overview = $('#view-overview');
    const gameShown = !!game && !game.classList.contains('hidden') && game.offsetParent !== null;
    const overviewHidden = !overview || overview.classList.contains('hidden') || overview.offsetParent === null;
    return gameShown && overviewHidden;
  }

  // ---------- CSS ----------
  (function css(){
    if ($('style[data-ts-core]')) return;
    const st=document.createElement('style'); st.setAttribute('data-ts-core','1');
    st.textContent = `
#trav-slider-host{--row:44px;--bg:#0f1724;--line:#223146;--text:#e6edf7;margin:10px 0 12px}
#trav-slider-host .ts-head{display:flex;flex-direction:column;gap:10px;margin:8px 0 12px}
#trav-slider-host .ts-title{font-weight:800;color:var(--text);display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap}
#trav-slider-host .ts-title .ts-price{margin-left:10px;opacity:.95;padding:2px 10px;border-radius:999px;background:#14324d;border:1px solid #1d4465}
#trav-slider-host .ts-grid{display:grid;grid-template-columns:120px minmax(420px,1fr) 130px;gap:12px;align-items:start}
@media (max-width:960px){ #trav-slider-host .ts-grid{grid-template-columns:84px minmax(240px,1fr) 96px} }
#trav-slider-host .ts-col{background:var(--bg);border:1px dashed var(--line);border-radius:12px;padding:8px;align-content:start}
#trav-slider-host .ts-col h4{margin:0 0 6px 0;font-size:13px;color:#b9c5d9;text-transform:uppercase}
#trav-slider-host .ts-sq{height:var(--row);display:flex;align-items:center;justify-content:center;border:2px solid #28384f;border-radius:12px;background:#111c2b;color:#e6edf7;font-weight:800;cursor:pointer;user-select:none;margin-bottom:6px}
#trav-slider-host .ts-sq.red{background:#b23c3c;color:#fff;border-color:#a83838}
#trav-slider-host .ts-sq.active{outline:2px solid #2aa198;background:#2aa198}
#trav-slider-host .ts-sq.disabled{color:#ffffff;background:#656565}
#trav-slider-host .ts-poprow{position:relative}
#trav-slider-host .ts-stars{position:absolute; left:-18px; top:50%; transform:translateY(-50%); display:flex; gap:2px; pointer-events:none}
#trav-slider-host .ts-stars .star{font-size:11px; line-height:1; color:#ffd84d; text-shadow:0 0 2px #5b4700}
#trav-slider-host .horse-table{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:14px}
#trav-slider-host .horse-table th{font-size:12px;text-transform:uppercase;color:#b9c5d9;text-align:left;padding:0 10px;white-space:nowrap}
#trav-slider-host .horse-table td{background:#111c2b;border:1px solid #223146;color:#e6edf7;padding:8px 10px;vertical-align:middle}
#trav-slider-host .horse-table td:first-child{border-top-left-radius:12px;border-bottom-left-radius:12px;font-weight:900}
#trav-slider-host .horse-table td:last-child{border-top-right-radius:12px;border-bottom-right-radius:12px;text-align:center;min-width:70px}
#trav-slider-host .hk-line{display:flex;gap:10px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:3px}
#trav-slider-host .hk-name{font-weight:900}
#trav-slider-host .hk-driver{opacity:.85}

/* SUMMARY BAR (desktop + mobil) */
#trav-slider-host .ts-sbar{background:#f39a24;border-radius:12px;padding:8px 10px}
#trav-slider-host .ts-sbar .row1{display:flex;gap:8px;justify-content:center;overflow-x:auto;scrollbar-width:none}
#trav-slider-host .ts-sbar .row1::-webkit-scrollbar{display:none}
#trav-slider-host .ts-legbtn{min-width:42px;height:34px;border-radius:8px;border:0;background:#c57929;color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center}
#trav-slider-host .ts-legbtn.active{background:#1976d2}
#trav-slider-host .ts-sbar .row2{display:flex;gap:12px;margin-top:6px;color:#fff;font-weight:900;justify-content:center;flex-wrap:wrap}
#trav-slider-host .ts-sbar .count{min-width:42px;text-align:center;font-size:16px;line-height:1.2}

@media (max-width:640px){
  #trav-slider-host .ts-sbar{padding:10px 12px;border-radius:14px}
  #trav-slider-host .ts-legbtn{min-width:48px;height:38px;border-radius:10px;font-size:16px}
  #trav-slider-host .ts-sbar .count{min-width:48px;font-size:18px}
  #trav-slider-host .ts-title{gap:12px}
  #trav-slider-host .ts-title .ts-price{font-size:16px}
}

#couponGrid .coupon-card{border:1px solid #223146;border-radius:12px;padding:10px;margin:8px;background:#0f1724;color:#e6edf7}
#couponGrid .coupon-lines{margin-top:8px;font-family:ui-monospace,Consolas,Menlo,monospace;white-space:pre-wrap;line-height:1.35;opacity:.95}
#couponGrid .coupon-price{margin-top:6px;opacity:.8}
    `;
    document.head.appendChild(st);
  })();

  // ---------- state (per game) ----------
  let curGameId = null;
  let legs  = null;         // [{horses: [...]}, ...]
  let mine  = [];           // [[1,4,7],[],...]
  let form  = 'V64';
  let priceUnit = 1;
  let coupons = [];
  let curLeg = 1;

  function loadStateFor(gid){
    if (!gid) { legs=null; mine=[]; coupons=[]; return; }
    legs  = jget(KEY(gid,'info'), null);
    // Om inget finns men pending buffert finns (nyskapad), applicera den nu
    if (!legs) {
      const pending = sget('trav:pendingInfo', null);
      if (pending) {
        jset(KEY(gid,'info'), pending);
        legs = pending;
        sdel('trav:pendingInfo');
      }
    }
    mine  = jget(KEY(gid,'mine'), []);
    form  = jget(KEY(gid,'form'),'V64');
    priceUnit = jget(KEY(gid,'price'), (form==='V75'||form==='V86'||form==='V85')?0.5:1);
    coupons = (jget(KEY(gid,'coupons'),[])||[]).filter(c=>c && c.gameId===gid);
    normalizeMine();
  }
  function saveMine(){ if(curGameId) jset(KEY(curGameId,'mine'), mine); }
  function normalizeMine(){
    if (!Array.isArray(legs)) return;
    if (!Array.isArray(mine)) mine=[];
    for(let i=0;i<legs.length;i++) if(!Array.isArray(mine[i])) mine[i]=[];
    mine.length=legs.length;
  }

  // ---------- price for "Min kupong" ----------
  function calcMyPrice(){
    if (!Array.isArray(legs) || !Array.isArray(mine) || legs.length===0) return 0;
    let prod = 1, anyZero=false;
    for (let i=0;i<legs.length;i++){
      const c = (mine[i]||[]).length;
      if (c===0) { anyZero=true; break; }
      prod *= c;
    }
    if (anyZero) return 0;
    return prod * (priceUnit||1);
  }

  // ---------- parser ----------
  function parseAllPaste(text){
    if (!text || !text.trim()) return null;
    const rows=text.replace(/\r/g,'').split('\n').filter(l=>l.trim().length>0);

    const out=[]; let current=null; let lastNum=-Infinity;
    for (const raw of rows){
      const line = raw.trim();
      if (/^HÄST(\s|\t)+KUSK/i.test(line)) continue;

      const cols = raw.indexOf('\t')>-1 ? raw.split('\t') : raw.trim().split(/\s{2,}/);
      if (!cols.length) continue;

      const m = /^(\d+)\s+(.*)$/.exec((cols[0]||'').toString().trim());
      if (!m) continue;

      const num   = parseInt(m[1],10);
      const name  = m[2];
      const driver= (cols[1]||'').toString().trim();
      const pct   = (cols[2]||'').toString().trim().replace('%','');
      const trend = (cols[3]||'').toString().trim().replace('%','');
      const dist  = (cols[4]||'').toString().trim();
      const starts= (cols[5]||'').toString().trim();
      const vagn  = (cols[6]||'').toString().trim();
      const vodds = (cols[7]||'').toString().trim();

      const startsNewLeg = /^1(\s|\t)/.test(line) || (current && isFinite(lastNum) && isFinite(num) && num <= lastNum);
      if (!current || startsNewLeg){ current = { horses: [] }; out.push(current); lastNum = -Infinity; }
      current.horses.push({num,name,driver,pct,trend,dist,starts,vagn,vodds});
      lastNum = num;
    }
    const clean = out.filter(l => (l.horses||[]).length>0);
    return clean.length ? clean : null;
  }

  // ---------- dialogs/hooks ----------
  function getManualDialog(){
    let dlg=$('#dlgManual');
    if(!dlg){
      dlg=document.createElement('dialog'); dlg.id='dlgManual'; dlg.className='modal';
      dlg.innerHTML='<form method="dialog" class="card"><header class="card-header">Lägg kupong manuellt</header><div class="card-body" id="manualBlocks"></div><footer class="card-footer"><button type="button" class="btn" id="btnManualClose">Stäng</button><button type="button" class="btn primary" id="btnManualSave">Spara kupong</button></footer></form>';
      document.body.appendChild(dlg);
      on($('#btnManualClose',dlg),'click',()=>{ if(dlg.open) dlg.close(); });
    }
    return dlg;
  }
  function buildPillUI(dlg){
    const body=$('#manualBlocks',dlg) || $('.card-body',dlg) || dlg;
    body.innerHTML='';
    if(!Array.isArray(legs) || legs.length===0){ body.innerHTML='<div>Inga avdelningar inlästa ännu.</div>'; return; }
    const selections=Array.from({length:legs.length},()=>({}));
    for(let l=0;l<legs.length;l++){
      const leg=legs[l];
      const wrap=document.createElement('div'); wrap.className='mt';
      const label=document.createElement('label'); label.style.color='#e6edf7'; label.textContent='AVD '+(l+1)+' — välj hästar';
      const grid=document.createElement('div'); grid.style.display='grid'; grid.style.gridTemplateColumns='repeat(auto-fit,minmax(44px,1fr))'; grid.style.gap='6px';
      const maxNum=Math.max(...leg.horses.map(h=>h.num));
      for(let n=1;n<=maxNum;n++){
        const btn=document.createElement('button'); btn.type='button'; btn.className='pill'; btn.textContent=String(n);
        btn.onclick=()=>{ const s=selections[l]; s[n]=!s[n]; btn.classList.toggle('active', !!s[n]); };
        grid.appendChild(btn);
      }
      wrap.appendChild(label); wrap.appendChild(grid); body.appendChild(wrap);
    }
    const save=$('#btnManualSave',dlg);
    save.onclick=(e)=>{
      e.preventDefault&&e.preventDefault();
      const arr=[];
      for(let i=0;i<selections.length;i++){
        const s=selections[i]; const nums=Object.keys(s).filter(k=>s[k]).map(Number).sort((a,b)=>a-b);
        arr.push(nums);
      }
      const list=(jget(KEY(curGameId,'coupons'),[])||[]).filter(c=>c && c.gameId===curGameId);
      list.push({ name:'Kupong ' + (list.length+1), legs:arr, gameId:curGameId });
      jset(KEY(curGameId,'coupons'), list);
      coupons=list;
      renderCouponGrid(); renderLeg(); renderSummary(); // pris kan ändras (spik-stjärnor)
      if(dlg.open) dlg.close();
    };
  }
  function openManualDialog(){ const dlg=getManualDialog(); try{ if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','open'); }catch{ dlg.setAttribute('open','open'); } setTimeout(()=>buildPillUI(dlg),0); }

  // manuella-knappen
  (function hookManualBtn(){
    const tryBind=()=>{
      const btn = $$('.btn,button').find(b=>/lägg kupong manuellt/i.test((b.textContent||'')));
      if(btn && !btn.__bound){ btn.__bound=true; on(btn,'click',openManualDialog); }
    };
    const mo=new MutationObserver(tryBind); mo.observe(document.body,{childList:true,subtree:true}); tryBind();
  })();

  // fånga Editera/Skapa -> spara per aktivt game, eller buffra om game saknas ännu
  function hookEditDialog(){
    const mo = new MutationObserver(()=>{
      const dlg = $$('dialog, .modal').find(d => $('#fldAllPaste', d) && $$('.btn,button', d).some(b => /spara/i.test((b.textContent||''))));
      if (!dlg) return;
      const txt = $('#fldAllPaste', dlg);
      const btnSave = $$('.btn,button', dlg).find(b => /spara/i.test((b.textContent||'')));
      if (btnSave.__ts_bound) return;
      btnSave.__ts_bound = true;
      on(btnSave,'click',()=>{
        const parsed = parseAllPaste(txt && txt.value);
        if (!parsed) return;
        const gid = getGameId();
        if (gid) {
          jset(KEY(gid,'info'), parsed);
          legs = parsed;
          mine = Array.from({length:legs.length}, ()=>[]);
          saveMine();
          renderAll(1);
        } else {
          // Skapa nytt spel: buffra tills URL:en byter till nya ?game
          sset('trav:pendingInfo', parsed);
        }
      });
    });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  // ---------- swipe ----------
  function hookSwipe(el){
    if (!el || el.__ts_swipe) return; el.__ts_swipe = true;
    let sx=0, sy=0, moved=false;
    on(el,'touchstart',e=>{ const t=e.changedTouches[0]; sx=t.clientX; sy=t.clientY; moved=false; }, {passive:true});
    on(el,'touchmove',()=>{ moved=true; }, {passive:true});
    on(el,'touchend',e=>{ if(!moved) return; const t=e.changedTouches[0]; const dx=t.clientX-sx, dy=t.clientY-sy; if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)){ if(dx<0) { curLeg=clamp(curLeg+1,1,legs.length); } else { curLeg=clamp(curLeg-1,1,legs.length); } renderAll(); } }, {passive:true});
    on(el,'wheel',e=>{ if(Math.abs(e.deltaX)>Math.abs(e.deltaY) && Math.abs(e.deltaX)>10){ if(e.deltaX>0) { curLeg=clamp(curLeg+1,1,legs.length); } else { curLeg=clamp(curLeg-1,1,legs.length); } renderAll(); } }, {passive:true});
  }

  // ---------- coupons render ----------
  const couponPrice = (c) => {
    const L=(c.legs&&c.legs.length)||0; if(!L) return 0;
    let rows=1; for(let i=0;i<L;i++){ const len=(c.legs[i]?c.legs[i].length:0); rows*=Math.max(len,1); }
    return rows*priceUnit;
  };
  const linesForCoupon = (c) => {
    const L=(c.legs&&c.legs.length)||0, out=[];
    for(let i=0;i<L;i++){ const arr=c.legs[i]||[]; out.push(`Avd ${i+1}: ${arr.length?arr.join(' '):'—'}`); }
    return out.join('\n');
  };
  function renderCouponGrid(){
    const grid=$('#couponGrid'); if(!grid) return;
    grid.innerHTML='';
    const list=(jget(KEY(curGameId,'coupons'),[])||[]).filter(c=>c && c.gameId===curGameId);
    coupons=list;
    list.forEach((c, i)=>{
      const card=document.createElement('div'); card.className='coupon-card';
      const title=document.createElement('b'); title.textContent=c?.name || ('Kupong '+(i+1)); card.appendChild(title);
      const lines=document.createElement('div'); lines.className='coupon-lines'; lines.textContent=linesForCoupon(c||{legs:[]}); card.appendChild(lines);
      const p=document.createElement('div'); p.className='coupon-price'; p.textContent='Pris: '+couponPrice(c||{legs:[]}).toLocaleString('sv-SE')+' kr'; card.appendChild(p);
      const del=document.createElement('button'); del.className='btn'; del.style.cssText='margin-top:8px;background:#b23c3c;border:1px solid #b23c3c;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;'; del.textContent='Ta bort';
      del.onclick=()=>{ const arr=(jget(KEY(curGameId,'coupons'),[])||[]).filter(x=>x && x.gameId===curGameId); arr.splice(i,1); jset(KEY(curGameId,'coupons'),arr); coupons=arr; renderCouponGrid(); renderLeg(); renderSummary(); };
      card.appendChild(del);
      grid.appendChild(card);
    });
  }

  // ---------- rendering ----------
  const refs = () => { const h=$('#trav-slider-host'); return { host:h, pos:$('#tsLegPos',h), tot:$('#tsLegTotal',h), price:$('#tsPrice',h), pop:$('#colPop',h), tbody:$('#horseTBody',h), mine:$('#colMine',h), sumTop:$('#tsSummaryTop',h), swipe:$('#tsSwipeArea',h) }; };

  function renderAll(goLeg){
    const host=ensureHostAtAvd(); if(!host) return;
    hookSwipe($('#tsSwipeArea',host));

    if (!Array.isArray(legs) || legs.length===0){
      const r=refs();
      if (r.tbody) r.tbody.innerHTML='';
      if (r.pop)   r.pop.innerHTML='<h4>Populärt</h4>';
      if (r.mine)  r.mine.innerHTML='<h4>Min kupong</h4>';
      if (r.sumTop) r.sumTop.innerHTML='';
      if (r.tot) r.tot.textContent='/ 0';
      if (r.pos) r.pos.textContent='1';
      if (r.price) r.price.textContent='Pris: 0 kr';
      renderCouponGrid();
      return;
    }

    normalizeMine();
    if (goLeg) curLeg = clamp(goLeg, 1, legs.length);

    const r=refs();
    if(r.pos) r.pos.textContent=String(curLeg);
    if(r.tot) r.tot.textContent='/ '+legs.length;
    if(r.price) r.price.textContent='Pris: '+calcMyPrice().toLocaleString('sv-SE')+' kr';

    renderSummary(r);
    renderLeg(r);
    renderCouponGrid();
  }

  function renderSummary(r){
    r=r||refs();
    const bar=document.createElement('div'); bar.className='ts-sbar';
    const row1=document.createElement('div'); row1.className='row1';
    const row2=document.createElement('div'); row2.className='row2';
    for (let i=0;i<legs.length;i++){
      const b=document.createElement('button'); b.className='ts-legbtn'; b.textContent=String(i+1);
      if(i+1===curLeg) b.classList.add('active');
      b.onclick=()=>{ curLeg=i+1; renderAll(); };
      row1.appendChild(b);
      const c=document.createElement('div'); c.className='count'; c.textContent=String((mine[i]||[]).length||0);
      row2.appendChild(c);
    }
    r.sumTop.innerHTML=''; r.sumTop.appendChild(bar); bar.appendChild(row1); bar.appendChild(row2);
  }

  function renderLeg(r){
    r=r||refs(); const leg = legs[curLeg-1];
    const nums = [...new Set(leg.horses.map(h=>h.num))].sort((a,b)=>a-b);
    const map=new Map(leg.horses.map(h=>[h.num,h]));

    const list=(jget(KEY(curGameId,'coupons'),[])||[]).filter(c=>c && c.gameId===curGameId);
    const cnt={}, mx={v:0};
    const spikStars={}; // n -> count of coupons that spikar this n
    for (const c of list){
      const arr=(c.legs&&c.legs[curLeg-1])||[];
      if (arr.length===1) { const n=arr[0]; spikStars[n]=(spikStars[n]||0)+1; }
      for (const n of arr){ cnt[n]=(cnt[n]||0)+1; if(cnt[n]>mx.v) mx.v=cnt[n]; }
    }

    if (r.pop){
      r.pop.innerHTML='<h4>Populärt</h4>';
      nums.forEach((n,idx)=>{
        const wrap=document.createElement('div'); wrap.className='ts-poprow';
        const stars=document.createElement('div'); stars.className='ts-stars';
        const starCount = spikStars[n]||0;
        for(let i=0;i<starCount;i++){ const s=document.createElement('span'); s.className='star'; s.textContent='★'; stars.appendChild(s); }
        const el=document.createElement('div'); el.className='ts-sq'; el.textContent=String(n);
        if(idx===0){ el.style.marginTop='34px'; }
        const v=cnt[n]||0; if(v===mx.v&&mx.v>0) el.classList.add('red'); if(v===0) el.classList.add('disabled');
        wrap.appendChild(stars); wrap.appendChild(el); r.pop.appendChild(wrap);
      });
    }

    if (r.tbody){
      r.tbody.innerHTML='';
      nums.forEach(n=>{
        const h=map.get(n);
        const tr=document.createElement('tr');

        const tdName=document.createElement('td');
        const line=document.createElement('div'); line.className='hk-line';
        if (!h) line.style.padding='11px'; // struken, håll höjden
        const nm=document.createElement('span'); nm.className='hk-name';   nm.textContent=h?(h.name||''):'';
        const dr=document.createElement('span'); dr.className='hk-driver'; dr.textContent=h&&h.driver?('— '+h.driver):'';
        line.appendChild(nm); line.appendChild(dr); tdName.appendChild(line);

        const tdPct=document.createElement('td'); tdPct.textContent = h&&h.pct||'';
        const tdTr =document.createElement('td'); tdTr.textContent  = h&&h.trend||'';
        const tdDi =document.createElement('td'); tdDi.textContent  = h&&h.dist||'';
        const tdSt =document.createElement('td'); tdSt.textContent  = h&&h.starts||'';
        const tdVa =document.createElement('td'); tdVa.textContent  = h&&h.vagn||'';
        const tdOd =document.createElement('td'); tdOd.textContent  = h&&h.vodds||'';

        tr.appendChild(tdName); tr.appendChild(tdPct); tr.appendChild(tdTr);
        tr.appendChild(tdDi); tr.appendChild(tdSt); tr.appendChild(tdVa); tr.appendChild(tdOd);
        r.tbody.appendChild(tr);
      });
    }

    if (r.mine){
      r.mine.innerHTML='<h4>Min kupong</h4>';
      const sel = new Set(Array.isArray(mine[curLeg-1])?mine[curLeg-1]:[]);
      nums.forEach((n,idx)=>{
        const pill=document.createElement('div'); pill.className='ts-sq'+(sel.has(n)?' active':''); pill.textContent=String(n);
        if(idx===0) pill.style.marginTop='34px';
        pill.onclick=()=>{
          const s=new Set(Array.isArray(mine[curLeg-1])?mine[curLeg-1]:[]);
          if(s.has(n)) s.delete(n); else s.add(n);
          mine[curLeg-1]=Array.from(s).sort((a,b)=>a-b);
          saveMine();
          // uppdatera pris och summering
          const rr=refs(); if(rr.price) rr.price.textContent='Pris: '+calcMyPrice().toLocaleString('sv-SE')+' kr';
          renderSummary(); renderLeg();
        };
        r.mine.appendChild(pill);
      });
    }

    // uppdatera pris i titeln (om man hoppat/scrollat mm)
    const rr=refs(); if(rr.price) rr.price.textContent='Pris: '+calcMyPrice().toLocaleString('sv-SE')+' kr';
  }

  // ---------- SPA/route & visibility ----------
  function syncAndRender(forceLeg1){
    const gid = getGameId();
    if (!gid) { const h=$('#trav-slider-host'); if(h) h.remove(); return; }
    if (gid !== curGameId) { curGameId = gid; loadStateFor(gid); curLeg = 1; }
    if (isGameVisible()) { ensureHostAtAvd(); renderAll(forceLeg1?1:undefined); }
  }

  function mountIfNeeded(){ syncAndRender(true); }

  const gameNode = $('#view-game');
  const overview  = $('#view-overview');
  const mo = new MutationObserver(()=>syncAndRender());
  if (gameNode)  mo.observe(gameNode,  {attributes:true,attributeFilter:['class']});
  if (overview)  mo.observe(overview,  {attributes:true,attributeFilter:['class']});

  const fireRoute = ()=>syncAndRender(true);
  const _ps = history.pushState; history.pushState = function(){ const r=_ps.apply(this,arguments); window.dispatchEvent(new Event('trav:route')); return r; };
  const _rs = history.replaceState; history.replaceState = function(){ const r=_rs.apply(this,arguments); window.dispatchEvent(new Event('trav:route')); return r; };
  on(window,'popstate', fireRoute);
  on(window,'trav:route', fireRoute);

  // cross-tab sync per game
  on(window,'storage',(e)=>{
    const gid=getGameId();
    if (!gid || !e.key || !e.key.startsWith(`trav:${gid}:`)) return;
    if (e.key.endsWith(':info'))    legs    = jget(KEY(gid,'info'), null);
    if (e.key.endsWith(':mine'))    mine    = jget(KEY(gid,'mine'), []);
    if (e.key.endsWith(':coupons')) coupons = (jget(KEY(gid,'coupons'),[])||[]).filter(c=>c && c.gameId===gid);
    renderAll();
  });

  // init
  function init(){
    hookEditDialog();
    syncAndRender(true);
    setTimeout(()=>syncAndRender(true), 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();

})();
