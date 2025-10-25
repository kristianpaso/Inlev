
/* Trav Slider – v3.6
   - Fix: JS crash removed (parsePastedList mistakenly used entries.append)
   - Hook: dialog open polish now runs (opens 'Klistra in hel lista')
   - Ensures CSS injection runs so coupon card styles appear
   - Popularity per avdelning; 'Struken' rows with strikethrough
*/
(() => {
  const q  = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const parseRow = (str) => (!str ? [] : str.split(/[^0-9]+/).map(s=>parseInt(s,10)).filter(n=>Number.isFinite(n)&&n>=1));
  const saveLS = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
  const readLS = (k)=>{ try{ const v=localStorage.getItem(k); return v? JSON.parse(v):null; }catch{ return null; } };

  let CURRENT = 1;
  const FORM_LEGS = { V64:6, V65:6, V75:7, GS75:7, V86:8, V85:6 };

  /* ============ THEME + CSS ============ */
  function injectTheme(){
    if(q('#trav-theme-css')) return;
    const css = `
    :root{ --bg:#0b121a; --bg-soft:#111a24; --text:#e6eef7; --muted:#9fb0c3; --line:#1e2a38; --line-strong:#2a394f;
           --accent:#2a66f3; --accent-700:#1e4cc0; --good:#0ea5b7; --bad:#ef4444; --shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.25);
           --radius:14px; --radius-sm:10px; --row:64px; }
    .theme-light{ --bg:#ffffff; --bg-soft:#f8fafc; --text:#0f172a; --muted:#475569; --line:#e5e7eb; --line-strong:#d1d5db;
                  --accent:#2563eb; --accent-700:#1e40af; --good:#0ea5b7; --bad:#ef4444; --shadow:0 1px 2px rgba(2,6,23,.06), 0 10px 26px rgba(2,6,23,.06) }

    #trav-slider-host.card{ background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); margin-top:16px }
    #trav-slider-host .ts-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px 0}
    #trav-slider-host .ts-title{display:flex;align-items:center;gap:12px}
    #trav-slider-host .ts-badge{ background:var(--bg-soft); color:var(--muted); border:1px solid var(--line); padding:6px 10px; border-radius:999px; font-weight:800 }
    #trav-slider-host .ts-nav{display:flex;gap:8px;align-items:center;justify-content:center;width:100%}
    #trav-slider-host .ts-btn{ background:var(--bg-soft); color:var(--text); border:1px solid var(--line); border-radius:10px; padding:4px 8px }
    #trav-slider-host .ts-dots{display:flex;gap:6px}
    #trav-slider-host .ts-dot{ min-width:28px;height:28px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--line);color:var(--text);font-weight:800;display:flex;align-items:center;justify-content:center }
    #trav-slider-host .ts-dot.active{ background:var(--accent); border-color:var(--accent-700); color:#fff }
    #trav-slider-host .ts-carousel{overflow:hidden;border:1px dashed var(--line);margin:10px;border-radius:12px}
    #trav-slider-host .ts-slides{display:flex;transition:transform .25s ease}
    #trav-slider-host .ts-slide{min-width:100%;padding:10px}
    #trav-slider-host .ts-grid{display:grid;grid-template-columns:90px 1fr 90px;gap:12px}

    /* Popular / Mine columns per your CSS */
    #trav-slider-host .ts-col.ts-popular, #trav-slider-host .ts-col.ts-mine { display:grid; grid-auto-rows:var(--row); gap:0px; padding:0px; background:var(--bg); border:1px solid var(--line); border-radius:12px }

    #trav-slider-host .ts-col.ts-info{display:grid;grid-auto-rows:var(--row);background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden}
    #trav-slider-host .ts-info-row{display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--line)}
    #trav-slider-host .ts-info-row:last-child{border-bottom:0}
    #trav-slider-host .ts-info-row.ts-scratched-row .horse, #trav-slider-host .ts-info-row.ts-scratched-row .perc{ text-decoration: line-through; opacity:.8 }
    #trav-slider-host .horse{font-weight:800;font-size:20px;color:var(--text)}
    #trav-slider-host .driver{margin-left:10px;font-size:14px;color:var(--muted)}
    #trav-slider-host .perc{font-weight:800;min-width:50px;color:var(--muted);text-align:right}

    /* Number squares */
    #trav-slider-host .ts-sq{height:var(--row);display:flex;align-items:center;justify-content:center;border:2px solid var(--line);border-radius:12px;background:var(--bg-soft);color:var(--text);font-weight:800;box-shadow:var(--shadow);font-size:27px}
    #trav-slider-host .ts-sq.red { background: color-mix(in oklab, var(--bad) 79%, var(--bg-soft)); color: color-mix(in oklab, #ffffff 70%, #fff); border-color: color-mix(in oklab, var(--bad) 24%, var(--line)); }
    #trav-slider-host .ts-sq.blue{ background: color-mix(in oklab, #24e8ff 79%, var(--bg-soft)); color: color-mix(in oklab, #ffffff 70%, #fff); border-color: color-mix(in oklab, var(--good) 24%, var(--line)); }
    #trav-slider-host .ts-sq.disabled{opacity:.55;cursor:not-allowed;filter:grayscale(.2)}

    /* Summary under slider: top: leg#, bottom: count */
    #trav-slider-host .ts-summary{padding:12px}
    #trav-slider-host .ts-footer{display:grid;grid-template-columns:1fr auto;align-items:end;gap:10px}
    #trav-slider-host .leg-row{display:grid;gap:8px}
    #trav-slider-host .leg-row .leg{background:var(--bg-soft);border:1px solid var(--line);border-radius:8px;padding:7px 0px;text-align:center;font-weight:800;color:var(--text);font-size:38px}

    #trav-slider-host #themeToggle{margin-left:8px;background:var(--bg-soft);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-weight:800}

    /* Coupon card & badge */
    .coupon-card { background:#fff3b5; border:1px solid #1b283e; border-radius:14px; padding:27px; display:flex; flex-direction:column; gap:6px; color:#000; font-size:28px; width:311px; }
    .badge { color:#000; font-size:18px; font-weight:bold; }

    @media(max-width:700px){ #trav-slider-host .ts-grid{grid-template-columns:70px 1fr 70px}; :root{--row:58px} .horse{font-size:18px} }
    `;
    const el=document.createElement('style'); el.id='trav-theme-css'; el.textContent=css; document.head.appendChild(el);
    document.documentElement.classList.add((localStorage.getItem('travTheme')||'light')==='light'?'theme-light':'theme-dark');
  }

  function injectDialogPolish(){
    if(q('#trav-dialog-polish')) return;
    const css = `
    dialog.modal .card { background: var(--bg, #0b121a); color: var(--text, #e6eef7); border: 1px solid var(--line, #1e2a38); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
    dialog.modal .card .card-header, dialog.modal .card .row label, dialog.modal .card .pillset .pill { color: var(--text, #e6eef7); }
    dialog.modal .card input[type="text"], dialog.modal .card input[type="datetime-local"], dialog.modal .card textarea { background: var(--bg-soft, #111a24); color: var(--text, #e6eef7); border: 1px solid var(--line, #1e2a38); border-radius: 10px; padding: 10px 12px; }
    dialog.modal .card input::placeholder, dialog.modal .card textarea::placeholder { color: var(--muted, #9fb0c3); opacity: .9; }
    dialog.modal .card .pillset { display:flex; gap:8px; flex-wrap:wrap; }
    dialog.modal .card .pillset .pill { background: var(--bg-soft, #111a24); border: 1px solid var(--line, #1e2a38); border-radius: 999px; padding: 6px 12px; font-weight: 800; }
    dialog.modal .card .pillset .pill.active { background: var(--accent, #2a66f3); border-color: var(--accent-700, #1e4cc0); color: #fff; }
    dialog.modal .card details { border: 1px dashed var(--line, #1e2a38); border-radius: 10px; padding: 8px 10px; background: color-mix(in oklab, var(--bg-soft, #111a24) 85%, black 0%); }
    dialog.modal .card details summary { color: var(--text, #e6eef7); font-weight: 800; cursor: pointer; }`;
    const el=document.createElement('style'); el.id='trav-dialog-polish'; el.textContent=css; document.head.appendChild(el);
  }

  function placeThemeToggle(){
    const host=q('#trav-slider-host .ts-head'); if(!host || q('#themeToggle')) return;
    const btn=document.createElement('button'); btn.id='themeToggle'; btn.type='button';
    const apply=(t)=>{ document.documentElement.classList.remove('theme-light','theme-dark'); document.documentElement.classList.add(t==='light'?'theme-light':'theme-dark'); localStorage.setItem('travTheme',t); btn.textContent = t==='light'?'🌙 Mörk':'☀️ Ljus'; };
    btn.addEventListener('click',()=>apply((localStorage.getItem('travTheme')||'light')==='light'?'dark':'light'));
    host.appendChild(btn);
    apply(localStorage.getItem('travTheme')||'light');
  }

  function getStake(){
    const active = document.querySelector('#formPills .pill.active');
    const form = (active ? (active.dataset.form || active.textContent.trim()) : (q('#dlgGame input[name="form"]')?.value||'')).toUpperCase();
    return (form==='V85'||form==='V86') ? 0.5 : 1;
  }

  /* ============ DOM CLEANUP ============ */
  
  function removeLegacySection(){
    qa('div.section').forEach(sec=>{
      const hasCoupons = !!sec.querySelector('#couponGrid, .coupon-grid, .coupon-card');
      const hasSlider  = !!sec.querySelector('#trav-slider-host');
      const looksLikeLegacy = !!sec.querySelector('.avd-card, #avdlist, .avd-list, [data-avd], #stickySummary, .sticky-minicart');
      if (!hasCoupons && !hasSlider && looksLikeLegacy) {
        try { sec.style.display='none'; sec.setAttribute('data-legacy-hidden','1'); } catch {}
      }
    });
  }

  /* ============ PASTE PARSING ============ */
  function findPasteTextarea(){
    const all=qa('textarea');
    for(const ta of all){
      const label=(ta.previousElementSibling && ta.previousElementSibling.textContent)||"";
      if(/klistra in hel lista|alla avdelningar/i.test(label)||/klistra in|alla avdelningar/i.test(ta.placeholder||"")) return ta;
    }
    return null;
  }
  function parseLine(raw){
    let nr,name,kusk,percent;
    if(raw.includes('\t')){
      const cols=raw.split('\t').map(c=>c.trim());
      if(cols.length>=3){
        const m = cols[0].match(/^(\d{1,2})\s+(.+)$/);
        if(m){ nr=parseInt(m[1],10); name=m[2].trim(); kusk=cols[1]; percent=cols[2]; }
        else { nr=parseInt(cols[0],10); name=cols[1]; kusk=cols[2]; percent=cols[3]; }
      }
    }else{
      const m = raw.match(/^(\d{1,2})\s+(.+?)\s+([A-Za-zÅÄÖåäöÉéÜüÖö.\-\' ]+?)\s+(\d+)\s*%$/);
      if(m){ nr=parseInt(m[1],10); name=m[2]; kusk=m[3]; percent=m[4]+'%'; }
    }
    if(nr==null||!name||!kusk) return null;
    const pct = percent ? parseInt(String(percent).replace('%',''),10)||0 : 0;
    return { nr, name:name.trim(), kusk:kusk.trim(), percent:pct };
  }
  function parsePastedList(txt){
    const out={legs:0,data:{}};
    const lines=txt.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return out;
    if(/^HÄST/i.test(lines[0])||/KUSK/i.test(lines[0])) lines.shift();

    const entries=[];
    for(const raw of lines){ const r=parseLine(raw); if(r) entries.push(r); } /* FIXED */
    if(!entries.length) return out;

    /* split to legs: whenever nr goes down -> new leg */
    const chunks=[]; let cur=[entries[0]]; let prev=entries[0].nr;
    for(let i=1;i<entries.length;i++){ const e=entries[i]; if(e.nr<prev){ chunks.push(cur); cur=[e]; }else{ cur.push(e); } prev=e.nr; }
    if(cur.length) chunks.push(cur);

    const data={};
    chunks.forEach((chunk,idx)=>{ const d=idx+1; data[d]={}; chunk.forEach(e=>{ data[d][e.nr]={name:e.name,kusk:e.kusk,percent:e.percent}; }); });
    out.data=data; out.legs=chunks.length; return out;
  }
  function bindPaste(){
    const ta=findPasteTextarea(); if(!ta||ta._bound) return; ta._bound=true;
    let t=null,last=''; const apply=()=>{ t=null;
      const txt=ta.value, sig=txt.length+":"+(txt.match(/\n/g)||[]).length; if(sig===last) return; last=sig;
      const parsed=parsePastedList(txt);
      if(parsed.legs){
        window.__horseData=parsed.data; saveLS('horseData',parsed.data); saveLS('horseLegs',parsed.legs);
        buildOrUpdate(parsed.legs); CURRENT=1; goTo(1);
      }
    };
    const deb=()=>{ if(t) clearTimeout(t); t=setTimeout(apply,150); };
    ta.addEventListener('input',deb); ta.addEventListener('change',deb);
    if(ta.value.trim()) deb();
  }

  /* Open 'Klistra in hel lista' by default */
  function openPasteAllSection(){
    const secAll = document.getElementById('secPasteAll');
    const secNow = document.getElementById('secFillNow');
    if (secAll && !secAll.open) secAll.open = true;
    if (secNow && secNow.open)   secNow.open = false;
    const ta = secAll ? secAll.querySelector('textarea') : null;
    if (ta) setTimeout(()=>ta.focus({preventScroll:true}), 50);
  }
  function hookDialogOpen(){
    const dlg = document.getElementById('dlgGame'); if(!dlg || dlg._openHook) return;
    dlg._openHook = true;
    const mo = new MutationObserver(()=>{ if(dlg.open) openPasteAllSection(); });
    mo.observe(dlg, { attributes:true, attributeFilter:['open'] });
    if (dlg.open) openPasteAllSection();
  }

  /* ============ COUPON POPULARITY ============ */
  
  function parseCouponsFromGrid(legs){
    const host = document.getElementById('couponGrid');
    if (!host) return null;
    const cards = qa('.coupon-card', host);
    if (!cards.length) return null;

    const all = [];
    cards.forEach(card => {
      const per = new Array(legs).fill(0).map(() => []);

      // 1) Primary: explicit row markup
      const rows = qa('.row', card);
      if (rows && rows.length) {
        rows.forEach(row => {
          const badge = row.querySelector('.badge');
          const nums  = row.querySelector('div:last-of-type');
          if (!badge || !nums) return;
          const m = (badge.textContent || '').match(/AVD\s*(\d+)/i);
          if (!m) return;
          const avd = parseInt(m[1], 10);
          if (!Number.isFinite(avd) || avd < 1 || avd > legs) return;
          per[avd - 1] = parseRow(nums.textContent || '');
        });
      } else {
        // 2) Fallback: scan text "AVD X: 2 5 7" lines (like in the screenshot)
        const txt = (card.textContent || '').replace(/\u00a0/g,' ').replace(/Ta bort/gi, '');
        const re = /AVD\s*(\d+)\s*:\s*([0-9 ]+)/gi;
        let m;
        while ((m = re.exec(txt)) !== null) {
          const avd = parseInt(m[1], 10);
          if (!Number.isFinite(avd) || avd < 1 || avd > legs) continue;
          per[avd - 1] = parseRow(m[2] || '');
        }
      }

      all.push(per);
    });

    return all;
  }

  function computePopularity(legs){
    const pop={}, totals={}; for(let d=1; d<=legs; d++){ pop[d]={}; totals[d]=0; }
    const grid=parseCouponsFromGrid(legs);
    if(grid && grid.length){
      grid.forEach(card=>{
        for(let i=0;i<Math.min(card.length,legs);i++){
          const arr=card[i]||[];
          arr.forEach(h=>{ pop[i+1][h]=(pop[i+1][h]||0)+1; });
          totals[i+1]+=arr.length;
        }
      });
    }
    return {pop, totals};
  }

  /* ============ MY TICKET SYNC ============ */
  function mySet(d){ window.__myTicket=window.__myTicket||{}; return (window.__myTicket[d]||(window.__myTicket[d]=new Set())); }
  function ensureHiddenSync(legs){
    let host=q('#myTicketSync'); if(!host){ host=document.createElement('div'); host.id='myTicketSync'; host.style.display='none'; document.body.appendChild(host); }
    const ins=[]; for(let d=1; d<=legs; d++){ let inp=q('#myTicketSync input[name="avd'+d+'"]'); if(!inp){ inp=document.createElement('input'); inp.type='hidden'; inp.name='avd'+d; host.appendChild(inp); } ins.push(inp); }
    window.__myTicketArray = window.__myTicketArray || []; return ins;
  }

  /* ============ BUILD UI ============ */
  function buildSkeleton(legs){
    let host=q('#trav-slider-host');
    if(!host){
      host=document.createElement('section'); host.id='trav-slider-host'; host.className='card';
      host.innerHTML=`
        <div class="ts-head">
          <div class="ts-title">
            <h2>Avdelning <span id="divIndex">1</span> / <span id="divCount">${legs}</span></h2>
            <span class="ts-badge">Pris: <span id="price">1</span> kr</span>
          </div>
          <div class="ts-nav">
            <button id="prevBtn" class="ts-btn">&larr;</button>
            <div id="dots" class="ts-dots"></div>
            <button id="nextBtn" class="ts-btn">&rarr;</button>
          </div>
        </div>
        <div class="ts-carousel"><div class="ts-slides" id="slides"></div></div>
        <section class="ts-summary">
          <div class="ts-footer">
            <div>
              <div class="leg-row" id="legNums"></div>
              <div class="leg-row counts" id="legCounts"></div>
            </div>
            <div class="price-eq">= <strong id="summaryPrice">1</strong> kr</div>
          </div>
        </section>`;
      const after = q('#couponGrid')?.parentElement || q('.coupon-row') || q('main') || document.body;
      (after.parentElement||document.body).insertBefore(host, after.nextSibling);
    }
  }
  function buildSlides(legs){
    const slides=q('#slides'); const dots=q('#dots'); const divCount=q('#divCount');
    slides.innerHTML=''; dots.innerHTML=''; if(divCount) divCount.textContent=String(legs);
    for(let d=1; d<=legs; d++){
      const slide=document.createElement('div'); slide.className='ts-slide'; slide.dataset.div=d;
      slide.innerHTML=`
        <div class="ts-grid" id="grid-${d}">
          <div class="ts-col ts-popular" id="popular-${d}"></div>
          <div class="ts-col ts-info" id="info-${d}"></div>
          <div class="ts-col ts-mine" id="mine-${d}"></div>
        </div>`;
      slides.appendChild(slide);
      const dot=document.createElement('button'); dot.className='ts-dot'; dot.textContent=String(d);
      dot.addEventListener('click',()=>goTo(d)); dots.appendChild(dot);
    }
  }
  function buildOrUpdate(legs){
    injectTheme(); injectDialogPolish(); removeLegacySection(); buildSkeleton(legs);
    const s=q('#slides'); if(!s || s.children.length!==legs){ buildSlides(legs); } q('#divCount').textContent=String(legs);
    const prev=q('#prevBtn'), next=q('#nextBtn');
    if(prev && !prev._bound){ prev._bound=true; prev.addEventListener('click',()=>goTo(CURRENT-1)); }
    if(next && !next._bound){ next._bound=true; next.addEventListener('click',()=>goTo(CURRENT+1)); }
    placeThemeToggle();
  }

  /* ============ RENDER ============ */
  function getLegs(){
    const fromData = window.__horseData ? Object.keys(window.__horseData).length : 0;
    const fromLS = readLS('horseLegs')||0; const best = Math.max(fromData, fromLS, 1);
    return clamp(best, 1, 20);
  }
  function horseKeys(d){
    const data=(window.__horseData && window.__horseData[d])||{}; const nums=Object.keys(data).map(n=>parseInt(n,10)).filter(Number.isFinite);
    if(!nums.length) return Array.from({length:12},(_,i)=>i+1);
    const max=Math.max(...nums); return Array.from({length:max},(_,i)=>i+1);
  }
  function isScratched(d,num){ const data=(window.__horseData && window.__horseData[d])||{}; return !data[num]; }

  function renderSlide(d){
    const legs=getLegs();
    const meta=computePopularity(legs);
    const keys=horseKeys(d); const data=(window.__horseData && window.__horseData[d])||{}; const pop=meta.pop[d]||{};
    const bestCount=Math.max(0,...keys.map(k=>pop[k]||0));

    const left=q('#popular-'+d); left.innerHTML='';
    keys.forEach(num=>{
      const count=pop[num]||0;
      const isBest=(bestCount>0 && count===bestCount);
      const scr=isScratched(d,num);
      const sq=document.createElement('div');
      sq.className='ts-sq'+(isBest?' red':'')+(scr?' disabled':'');
      sq.title = count ? `Vald på ${count} kupong(er)` : 'Ej vald';
      sq.textContent=String(num);
      left.appendChild(sq);
    });

    const mid=q('#info-'+d); mid.innerHTML=''; keys.forEach(num=>{
      const info=data[num]; const row=document.createElement('div'); row.className='ts-info-row'+(info?'':' ts-scratched-row');
      if(info){ row.innerHTML=`<div class="main"><span class="horse">${info.name}</span> <span class="driver">${info.kusk}</span></div><div class="perc">${Number(info.percent)||0}%</div>`; }
      else{ row.innerHTML=`<div class="main"><span class="horse">Struken</span></div><div class="perc">—</div>`; }
      mid.appendChild(row);
    });

    const right=q('#mine-'+d); right.innerHTML=''; const set=mySet(d);
    [...set].forEach(n=>{ if(!keys.includes(n)||isScratched(d,n)) set.delete(n); });
    keys.forEach(num=>{
      const b=document.createElement('button'); const scr=isScratched(d,num);
      b.className='ts-sq'+(set.has(num)?' blue':'')+(scr?' disabled':''); b.textContent=String(num);
      if(!scr) b.addEventListener('click',()=>{ if(set.has(num)) set.delete(num); else set.add(num); renderSlide(d); renderSummary(); });
      right.appendChild(b);
    });
  }

  function renderSummary(){
    const legs=getLegs(); const legNums=q('#legNums'), legCounts=q('#legCounts'); if(!legNums||!legCounts) return;
    const cols=`repeat(${legs}, minmax(34px,auto))`; legNums.style.gridTemplateColumns=cols; legCounts.style.gridTemplateColumns=cols;
    legNums.innerHTML=''; legCounts.innerHTML=''; let rows=1;
    for(let d=1; d<=legs; d++){ const picks=[...mySet(d)].sort((a,b)=>a-b);
      const a=document.createElement('div'); a.className='leg'; a.textContent=String(d); legNums.appendChild(a);
      const b=document.createElement('div'); b.className='leg'; b.textContent=String(picks.length||0); legCounts.appendChild(b);
      rows*=Math.max(picks.length,1);
    }
    const price=rows*getStake(); q('#price').textContent=price.toLocaleString('sv-SE'); q('#summaryPrice').textContent=price.toLocaleString('sv-SE');
    const ins=ensureHiddenSync(legs); ins.forEach((inp,idx)=>{ const str=[...mySet(idx+1)].sort((a,b)=>a-b).join(' ');
      if(inp.value!==str){ inp.value=str; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); }
      window.__myTicketArray[idx]=str;
    });
  }

  function goTo(n){
    const legs=getLegs(); CURRENT=clamp(n,1,legs);
    const slides=q('#slides'); slides.style.transform=`translateX(-${(CURRENT-1)*100}%)`;
    q('#divIndex').textContent=String(CURRENT);
    qa('#dots .ts-dot').forEach((d,i)=>d.classList.toggle('active',(i+1)===CURRENT));
    renderSlide(CURRENT);
    renderSummary();
  }

  /* ============ FORM PILLS ============ */
  function wireFormPills(){
    const wrap=document.getElementById('formPills'); if(!wrap||wrap._wired) return; wrap._wired=true;
    wrap.addEventListener('click',(e)=>{ const btn=e.target.closest('.pill'); if(!btn) return;
      wrap.querySelectorAll('.pill').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      const formName=btn.dataset.form||btn.textContent.trim(); const legs=FORM_LEGS[formName]||6; saveLS('horseLegs',legs);
      buildOrUpdate(legs); CURRENT=1; goTo(1);
    });
  }

  /* ============ INIT ============ */
  function init(){
    injectTheme();
    injectDialogPolish();
    removeLegacySection();
    hookDialogOpen(); /* ensure paste-all opens */
    if(!window.__horseData){ const saved=readLS('horseData'); if(saved) window.__horseData=saved; }
    const legs=Math.max((window.__horseData?Object.keys(window.__horseData).length:0), readLS('horseLegs')||0, 1);
    buildOrUpdate(legs);
    bindPaste();
    wireFormPills();
    goTo(CURRENT||1);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
