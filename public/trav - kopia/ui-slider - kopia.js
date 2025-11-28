/* Trav slider UI — v3.3
   - Robust division split: new division when horse nr decreases (12 -> 2)
   - Shows 'Struken' rows and overstrikes both name and percent
   - Popularity per division from couponGrid
   - Multi-pick 'Min kupong'; sync to hidden inputs; summary two rows; price per form
   - Numeric slider dots; Light/Dark theme toggle; editable coupon titles
*/
(() => {
  const q  = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const clamp = (n,a,b)=> Math.max(a, Math.min(b,n));
  const parseRow = (str) => (!str ? [] : str.split(/[^0-9]+/).map(s=>parseInt(s,10)).filter(n=>Number.isFinite(n)&&n>=1));
  const saveLS = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
  const readLS = (k)=>{ try{ const v=localStorage.getItem(k); return v? JSON.parse(v):null; }catch{ return null; } };
  let current = 1;

  // ---- Form pills -> antal avdelningar ----
  const FORM_LEGS = { V64:6, V65:6, V75:7, GS75:7, V86:8, V85:6 };
  function wireFormPills(){
    const wrapper = document.getElementById('formPills');
    if(!wrapper || wrapper._wired) return;
    wrapper._wired = true;
    wrapper.addEventListener('click', (e)=>{
      const btn = e.target.closest('.pill');
      if(!btn) return;
      wrapper.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');

      const formName = btn.dataset.form || btn.textContent.trim();
      const hidden = document.querySelector('#dlgGame input[name="form"]') || document.querySelector('input[name="form"]');
      if(hidden) hidden.value = formName;

      const legs = FORM_LEGS[formName] || 6;
      const legsInput = document.getElementById('legs'); if(legsInput) legsInput.value = String(legs);
      saveLS('horseLegs', legs);

      rebuildIfNeeded(legs);
      current = 1; goTo(current);
    });
  }
  new MutationObserver(()=> wireFormPills()).observe(document.documentElement,{subtree:true,childList:true});

  // ---------- PASTE: “Klistra in hel lista (alla avdelningar)” ----------
  function findPasteTextarea(){
    const all = qa('textarea');
    for(const ta of all){
      const label = (ta.previousElementSibling && ta.previousElementSibling.textContent) || "";
      if(/klistra in hel lista|alla avdelningar/i.test(label) || /klistra in|alla avdelningar/i.test(ta.placeholder||"")) return ta;
    }
    return document.getElementById('pasteAll') || document.getElementById('fullList') || null;
  }

  function parseLine(raw){
    let nr,name,kusk,percent;
    if(raw.includes('\t')){
      const cols = raw.split('\t').map(c=>c.trim());
      if(cols.length>=3){
        const m = cols[0].match(/^(\d{1,2})\s+(.+)$/);
        if(m){ nr=parseInt(m[1],10); name=m[2].trim(); kusk=cols[1]; percent=cols[2]; }
        else { nr=parseInt(cols[0],10); name=cols[1]; kusk=cols[2]; percent=cols[3]; }
      }
    }else{
      const m = raw.match(/^(\d{1,2})\s+(.+?)\s+([A-Za-zÅÄÖåäöÉéÜüÖö.\-\' ]+?)\s+(\d+)\s*%$/);
      if(m){ nr=parseInt(m[1],10); name=m[2].trim(); kusk=m[3].trim(); percent=m[4]+'%'; }
    }
    if(nr==null||!name||!kusk) return null;
    const pct = percent ? parseInt(String(percent).replace('%',''),10) : 0;
    return { nr, name, kusk, percent: pct };
  }

  // === Robust delning: ny avdelning när hästnummer sjunker (t.ex. 12 -> 2) ===
  function parsePastedList(txt){
    const out = { legs: 0, data: {} };
    if(!txt) return out;

    const lines = txt.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return out;
    if(/^HÄST/i.test(lines[0]) || /KUSK/i.test(lines[0])) lines.shift();

    const entries = [];
    for(const raw of lines){
      const row = parseLine(raw);
      if(row) entries.push(row);
    }
    if(!entries.length) return out;

    // 1) chunk:a – ny avd när nr sjunker (12 -> 2)
    const divs = [];
    let cur = [];
    let prev = entries[0].nr;
    cur.push(entries[0]);

    for(let i=1;i<entries.length;i++){
      const e = entries[i];
      if(e.nr < prev){             // new division
        divs.push(cur);
        cur = [e];
      }else{
        cur.push(e);
      }
      prev = e.nr;
    }
    if(cur.length) divs.push(cur);

    // 2) bygg data 1..N
    const data = {};
    divs.forEach((chunk, idx) => {
      const d = idx + 1;
      data[d] = {};
      chunk.forEach(e => {
        data[d][e.nr] = { name: e.name, kusk: e.kusk, percent: e.percent };
      });
    });

    out.data = data;
    out.legs = divs.length;
    return out;
  }

  function bindPaste(){
    const ta = findPasteTextarea(); if(!ta || ta._pasteBound) return; ta._pasteBound=true;
    let t=null, lastSig="";
    const apply=()=>{ t=null;
      const txt=ta.value, sig = txt.length+":"+(txt.match(/\n/g)||[]).length;
      if(sig===lastSig) return; lastSig=sig;
      const parsed = parsePastedList(txt);
      if(parsed.legs){
        window.__horseData = parsed.data;
        saveLS('horseData', parsed.data);
        saveLS('horseLegs', parsed.legs);
        const legsInput = q('#legs'); if(legsInput && String(legsInput.value)!==String(parsed.legs)) legsInput.value=String(parsed.legs);
        rebuildIfNeeded(getLegs(true));
        current = clamp(current,1,getLegs(true)); goTo(current);
      }
    };
    const deb=()=>{ if(t) clearTimeout(t); t=setTimeout(apply,120); };
    ta.addEventListener('input',deb); ta.addEventListener('change',deb);
    if(ta.value.trim()) deb();
  }

  // ---------- Hämta kuponger & popularitet ----------
  function parseCouponsFromGrid(legs){
    const host = document.getElementById('couponGrid');
    if(!host) return null;
    const cards = qa('.coupon-card', host);
    if(!cards.length) return null;
    const all=[];
    cards.forEach(card=>{
      const rows = qa('.row', card);
      const perLeg=[];
      rows.forEach((row, idx)=>{
        if(idx>=legs) return;
        const valueDiv = row.querySelector('div:last-of-type');
        const val = valueDiv ? valueDiv.textContent.trim() : '';
        perLeg[idx] = parseRow(val);
      });
      all.push(perLeg);
    });
    return all;
  }
  function legsFromCoupons(){
    const host = document.getElementById('couponGrid');
    if(!host) return 0;
    const first = host.querySelector('.coupon-card');
    if(!first) return 0;
    return first.querySelectorAll('.row').length || 0;
  }
  function findCoupons(legs){
    const grid = parseCouponsFromGrid(legs);
    if(grid) return { type:'grid', data:grid };
    const sets=[];
    const host = document.querySelector('.coupon-row') || document.getElementById('couponGrid')?.parentElement;
    if(host){
      const inputs = qa('input[type="text"]', host);
      if(inputs.length) sets.push({inputs});
    }
    qa('.coupon-card').forEach(card=>{ const inputs=qa('input[type="text"]', card); if(inputs.length) sets.push({inputs}); });
    if(!sets.length){
      const inputs = qa('.coupon-grid input[type="text"], .coupon input[type="text"], .kupong input[type="text"], [data-coupon] input[type="text"]');
      if(inputs.length) sets.push({inputs});
    }
    return { type:'inputs', data:sets };
  }
  function computePopularity(legs){
    const pop={}; const totals={};
    for(let d=1; d<=legs; d++){ pop[d]={}; totals[d]=0; }

    const found = findCoupons(legs);
    if(found.type==='grid'){
      found.data.forEach(card=>{
        for(let i=0;i<Math.min(card.length,legs);i++){
          const arr=card[i]||[];
          arr.forEach(h=>{ if(h>=1) pop[i+1][h]=(pop[i+1][h]||0)+1; });
          totals[i+1]+=arr.length;
        }
      });
    }else{
      found.data.forEach(s=>{
        s.inputs.forEach((inp,i)=>{
          if(i>=legs) return;
          const val=(inp.value||inp.getAttribute('value')||'').trim();
          const arr = parseRow(val);
          arr.forEach(h=>{ if(h>=1) pop[i+1][h]=(pop[i+1][h]||0)+1; });
          totals[i+1]+=arr.length;
        });
      });
    }
    return {pop, totals};
  }

  // ---------- “Min kupong” ----------
  function ensureHiddenSync(legs){
    let host=q('#myTicketSync'); if(!host){ host=document.createElement('div'); host.id='myTicketSync'; host.style.display='none'; document.body.appendChild(host); }
    const inputs=[];
    for(let d=1; d<=legs; d++){
      let inp=q('#myTicketSync input[name="avd'+d+'"]');
      if(!inp){ inp=document.createElement('input'); inp.type='hidden'; inp.name='avd'+d; host.appendChild(inp); }
      inputs.push(inp);
    }
    window.__myTicketArray = window.__myTicketArray || [];
    return inputs;
  }
  function mySet(d){ window.__myTicket=window.__myTicket||{}; return (window.__myTicket[d]||(window.__myTicket[d]=new Set())); }

  // ---------- Hjälpare ----------
  function horseKeys(d){
    const data = (window.__horseData && window.__horseData[d]) || {};
    const nums = Object.keys(data).map(n=>parseInt(n,10)).filter(Number.isFinite);
    if(!nums.length) return Array.from({length:12}, (_,i)=>i+1);
    const max = Math.max(...nums);
    return Array.from({length:max}, (_,i)=>i+1);
  }
  function isScratched(d, num){
    const data = (window.__horseData && window.__horseData[d]) || {};
    return !data[num];
  }
  function getLegs(forceRecalc=false){
    const legsInput=q('#legs');
    const ls = !forceRecalc ? readLS('horseLegs') : null;
    const formLegs = legsInput && legsInput.value ? (parseInt(legsInput.value,10)||0) : 0;
    const dataLegs = window.__horseData ? Object.keys(window.__horseData).length : 0;
    const couponLegs = legsFromCoupons();
    const best = Math.max(formLegs, dataLegs, couponLegs, ls||0, 1);
    return clamp(best, 1, 20);
  }
  // Radpris per spelform
  function getStake(){
    const active = document.querySelector('#formPills .pill.active');
    const fromActive = active ? (active.dataset.form || active.textContent.trim()) : null;
    const fromHidden = (document.querySelector('#dlgGame input[name="form"]') || document.querySelector('input[name="form"]'))?.value;
    const form = (fromActive || fromHidden || '').toUpperCase();
    if(form === 'V85' || form === 'V86') return 0.5;
    const s=q('#stake');
    return s ? Math.max(0.01, parseFloat(s.value||'1')) : 1;
  }

  // ---------- Bygg slider ----------
  function ensureSlider(legs){
    let host=q('#trav-slider-host');
    if(!host){
      host=document.createElement('section'); host.id='trav-slider-host'; host.className='card trav-slider-host';
      host.innerHTML=`
        <div class="ts-head">
          <div class="ts-title">
            <h2>Avdelning <span id="divIndex">1</span> / <span id="divCount">${legs}</span></h2>
            <span class="ts-badge">Pris: <span id="price">1</span> kr</span>
          </div>
          <div class="ts-nav" id="sliderNav">
            <button id="prevBtn" class="ts-btn" title="Föregående">&larr;</button>
            <div id="dots" class="ts-dots"></div>
            <button id="nextBtn" class="ts-btn" title="Nästa">&rarr;</button>
          </div>
        </div>
        <div class="ts-carousel" id="carousel"><div class="ts-slides" id="slides"></div></div>
        <section class="ts-summary card inner">
          <div class="ts-footer">
            <div class="leg-row" id="legNums"></div>
            <div class="leg-row counts" id="legCounts"></div>
            <div class="price-eq">= <strong id="summaryPrice">1</strong> kr</div>
          </div>
        </section>`;
      // Dölj gamla “section”-layouten om den finns
      const legacy = document.querySelector('.section .avd-list'); 
      if(legacy){ const sec=legacy.closest('.section'); if(sec) sec.style.display='none'; }
      // Placera under kupongerna
      const couponRow = q('.coupon-row') || q('#couponGrid')?.parentElement || q('.coupons');
      const main = q('main.container') || document.body;
      if(couponRow && couponRow.parentElement){ couponRow.parentElement.insertBefore(host, couponRow.nextSibling); }
      else { main.appendChild(host); }
    }
    return host;
  }
  function buildSlides(legs){
    const slides=q('#slides'); const dots=q('#dots');
    if(!slides||!dots) return;
    slides.innerHTML=''; dots.innerHTML='';
    for(let d=1; d<=legs; d++){
      const slide=document.createElement('div'); slide.className='ts-slide'; slide.dataset.div=d;
      slide.innerHTML=`
        <div class="ts-grid" id="grid-${d}">
          <div class="ts-col ts-popular" id="popular-${d}"></div>
          <div class="ts-col ts-info"    id="info-${d}"></div>
          <div class="ts-col ts-mine"    id="mine-${d}"></div>
        </div>`;
      slides.appendChild(slide);
      const dot=document.createElement('button'); dot.className='ts-dot ts-dot-num'; dot.textContent=String(d);
      dot.addEventListener('click',()=>goTo(d)); dots.appendChild(dot);
    }
    const divCount=q('#divCount'); if(divCount) divCount.textContent=String(legs);
  }
  function rebuildIfNeeded(legs){
    ensureSlider(legs);
    const slides=q('#slides');
    if(!slides || slides.children.length!==legs){
      buildSlides(legs);
    }else{
      const divCount=q('#divCount'); if(divCount) divCount.textContent=String(legs);
    }
  }

  // ---------- Render ----------
  function renderSlide(d, meta){
    const keys = horseKeys(d);
    const data = (window.__horseData && window.__horseData[d]) || {};
    const pop  = meta.pop[d] || {};

    const maxCount = Math.max(0, ...keys.map(k => pop[k] || 0));

    // Vänster (Populära)
    const left = q('#popular-'+d); if(left) left.innerHTML='';
    keys.forEach(num=>{
      const best = (maxCount>0) && ((pop[num]||0)===maxCount);
      const sq = document.createElement('div');
      const scratched = isScratched(d, num);
      sq.className='ts-sq' + (best?' red':'') + (scratched?' scratched':'');
      sq.textContent=String(num);
      left && left.appendChild(sq);
    });

    // Mitten (Hästinfo)
    const mid=q('#info-'+d); if(mid) mid.innerHTML='';
    keys.forEach(num=>{
      const info = data[num];
      const row = document.createElement('div');
      row.className='ts-info-row' + (info ? '' : ' ts-scratched-row');
      if(info){
        row.innerHTML = `<div class="main"><span class="horse">${info.name}</span> <span class="driver">${info.kusk}</span></div>
                         <div class="perc">${Number(info.percent)||0}%</div>`;
      } else {
        row.innerHTML = `<div class="main"><span class="horse">Struken</span></div>
                         <div class="perc">—</div>`;
      }
      mid && mid.appendChild(row);
    });

    // Höger (Min kupong)
    const right=q('#mine-'+d); if(right) right.innerHTML='';
    const set = mySet(d);
    [...set].forEach(n=>{ if(!keys.includes(n) || isScratched(d,n)) set.delete(n); });
    keys.forEach(num=>{
      const b=document.createElement('button');
      const scratched = isScratched(d, num);
      b.className='ts-sq' + (set.has(num)?' blue':'') + (scratched?' disabled':'');
      b.textContent=String(num);
      if(!scratched){
        b.addEventListener('click', ()=>{
          if(set.has(num)) set.delete(num); else set.add(num);
          renderSlide(d, meta); renderSummary(getLegs(true));
        });
      } else {
        b.setAttribute('aria-disabled','true');
        b.style.opacity = '0.55';
        b.style.cursor = 'not-allowed';
      }
      right && right.appendChild(b);
    });
  }

  function renderSummary(legs){
    const legNums = q('#legNums');
    const legCounts = q('#legCounts');
    if(legNums) legNums.innerHTML='';
    if(legCounts) legCounts.innerHTML='';

    let rows=1;
    for(let d=1; d<=legs; d++){
      const picks=[...mySet(d)].sort((a,b)=>a-b);
      // rad 1: avd-nr
      if(legNums){
        const box=document.createElement('div'); box.className='leg'; box.textContent=String(d);
        legNums.appendChild(box);
      }
      // rad 2: antal valda
      if(legCounts){
        const box=document.createElement('div'); box.className='leg'; box.textContent=String(picks.length||0);
        legCounts.appendChild(box);
      }
      rows *= Math.max(picks.length,1);
    }
    const price=rows*getStake();
    const p1=q('#price'); if(p1) p1.textContent=price.toLocaleString('sv-SE');
    const p2=q('#summaryPrice'); if(p2) p2.textContent=price.toLocaleString('sv-SE');

    // synka till dolda fält + global array
    const ins=ensureHiddenSync(legs);
    ins.forEach((inp,idx)=>{
      const str=[...mySet(idx+1)].sort((a,b)=>a-b).join(' ');
      if(inp.value!==str){ inp.value=str; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); }
      window.__myTicketArray = window.__myTicketArray || []; window.__myTicketArray[idx]=str;
    });
  }

  function goTo(n){
    const legs=getLegs(true);
    current=clamp(n,1,legs);
    const slides=q('#slides'); const idx=q('#divIndex'); const dots=qa('.ts-dot');
    if(slides) slides.style.transform=`translateX(-${(current-1)*100}%)`;
    if(idx) idx.textContent=String(current);
    dots.forEach((d,i)=> d.classList.toggle('active', (i+1)===current));
    const meta=computePopularity(legs);
    renderSlide(current, meta);
    renderSummary(legs);
  }

  // ---------- Snyggare manuella kuponger ----------
  function beautifyCoupons(){
    const grid = q('#couponGrid'); if(!grid) return;
    // titel -> redigerbar + sparas i LS
    grid.querySelectorAll('.coupon-card > b').forEach((h, idx)=>{
      h.classList.add('coupon-title');
      h.contentEditable = "true";
      h.dataset.index = String(idx);
      const names = readLS('couponNames') || {};
      if(names && names[idx]) h.textContent = names[idx];
      if(!h._bound){
        h._bound = true;
        h.addEventListener('blur', ()=>{
          const all = readLS('couponNames') || {};
          all[idx] = (h.textContent || '').trim() || `Kupong ${idx+1}`;
          saveLS('couponNames', all);
        });
      }
    });
    // Visning: “Avd 1: 1 2 3”
    grid.querySelectorAll('.row').forEach(row=>{
      const label = row.querySelector('.badge');
      const val   = row.querySelector('div:last-of-type');
      if(label){
        label.classList.add('badge-plain');
        label.textContent = label.textContent.replace(/AVD\s+(\d+)/i,'Avd $1:');
      }
      if(val) val.classList.add('vals');
    });
  }
  function observeCoupons(){
    const host = document.getElementById('couponGrid'); if(!host) return;
    if(host._obs) return;
    const obs = new MutationObserver(()=>{
      rebuildIfNeeded(getLegs(true));
      goTo(current);
    });
    obs.observe(host, {childList:true, subtree:true, characterData:true});
    host._obs = obs;
  }

  // ---------- Styles + tema ----------
  function ensureStyles(){
    if(q('#trav-slider-styles')) return;
    const css = `
    #trav-slider-host .ts-head{display:flex;flex-direction:column;gap:8px;align-items:center;margin-bottom:12px}
    #trav-slider-host .ts-title{display:flex;align-items:center;gap:12px;justify-content:center;text-align:center}
    #trav-slider-host .ts-nav{display:flex;align-items:center;gap:10px;justify-content:center}
    #trav-slider-host .ts-carousel{position:relative;overflow:hidden;border-radius:12px}
    #trav-slider-host .ts-slides{display:flex;transition:transform .25s ease;will-change:transform}
    #trav-slider-host .ts-slide{min-width:100%;padding:12px}
    #trav-slider-host .ts-grid{display:grid;grid-template-columns:80px 1fr 80px;gap:12px}
    #trav-slider-host .ts-scratched-row .horse,
    #trav-slider-host .ts-scratched-row .perc { text-decoration: line-through; opacity:.8; }
    #trav-slider-host .ts-sq.scratched{opacity:.6; filter:grayscale(0.2);}
    `;
    const style=document.createElement('style'); style.id='trav-slider-styles'; style.textContent=css; document.head.appendChild(style);
  }
  function ensureTheme(){
    if(q('#trav-theme-css')) return;
    const css = `
    :root { --bg:#0b121a; --bg-soft:#111a24; --text:#e6eef7; --muted:#a9b4c2; --line:#1f2a38; --line-strong:#2b3b52;
            --accent:#2a66f3; --accent-700:#1e4cc0; --good:#0ea5b7; --bad:#b71c1c; --shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.25);
            --radius:14px; --radius-sm:10px; --row:64px; }
    .theme-light { --bg:#ffffff; --bg-soft:#f8fafc; --text:#0f172a; --muted:#475569; --line:#e5e7eb; --line-strong:#d1d5db;
                   --accent:#2563eb; --accent-700:#1e40af; --good:#0ea5b7; --bad:#ef4444; --shadow:0 1px 2px rgba(2,6,23,.06), 0 10px 26px rgba(2,6,23,.06); }
    #trav-slider-host.card.trav-slider-host { background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow) }
    #trav-slider-host .ts-badge{ background:var(--bg-soft); color:var(--muted); border:1px solid var(--line); padding:6px 10px; border-radius:999px; font-weight:700 }
    #trav-slider-host .ts-nav .ts-btn{ background:var(--bg-soft); color:var(--text); border:1px solid var(--line); border-radius:var(--radius-sm) }
    #trav-slider-host .ts-dot{ min-width:28px; height:28px; padding:0 6px; border-radius:8px; background:var(--bg-soft); border:1px solid var(--line); color:var(--text); font-weight:800; font-size:13px; line-height:1; display:inline-flex; align-items:center; justify-content:center; cursor:pointer }
    #trav-slider-host .ts-dot.active{ background:var(--accent); border-color:var(--accent-700); color:#fff }
    #trav-slider-host .ts-carousel{ border:1px dashed var(--line); background:var(--bg); border-radius:var(--radius); margin:0 16px 12px 16px }
    #trav-slider-host .ts-col{ background:var(--bg); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow) }
    #trav-slider-host .ts-col.ts-popular,#trav-slider-host .ts-col.ts-mine{ display:grid; grid-auto-rows:var(--row); gap:10px; padding:10px }
    #trav-slider-host .ts-col.ts-info{ display:grid; grid-auto-rows:var(--row); padding:0; overflow:hidden }
    #trav-slider-host .ts-info-row{ display:flex; align-items:center; justify-content:space-between; padding:0 14px; border-bottom:1px solid var(--line) }
    #trav-slider-host .ts-info-row:last-child{ border-bottom:0 }
    #trav-slider-host .horse{ font-weight:800; font-size:20px; color:var(--text) }
    #trav-slider-host .driver{ margin-left:10px; font-size:14px; color:var(--muted) }
    #trav-slider-host .perc{ font-weight:800; min-width:50px; color:var(--muted) }
    #trav-slider-host .ts-sq{ height:var(--row); display:flex; align-items:center; justify-content:center; border:2px solid var(--line); border-radius:12px; background:var(--bg-soft); color:var(--text); font-weight:800; box-shadow:var(--shadow) }
    #trav-slider-host .ts-sq.red { background: color-mix(in oklab, var(--bad) 14%, var(--bg-soft)); color: color-mix(in oklab, var(--bad) 70%, #fff); border-color: color-mix(in oklab, var(--bad) 24%, var(--line)); }
    #trav-slider-host .ts-sq.blue{ background: color-mix(in oklab, var(--good) 18%, var(--bg-soft)); color: color-mix(in oklab, var(--good) 70%, #fff); border-color: color-mix(in oklab, var(--good) 24%, var(--line)); }

    /* Manuella kuponger – rubrik & radlayout “Avd X: …” */
    #couponGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:10px}
    #couponGrid .coupon-card{ background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow) }
    #couponGrid .coupon-card>b.coupon-title{ color:var(--text) }
    #couponGrid .row{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed var(--line)}
    #couponGrid .row:last-child{ border-bottom:0 }
    #couponGrid .row .badge.badge-plain{ background:transparent;border:0;padding:0;flex:0 0 auto;min-width:64px;margin-right:4px;color:var(--muted) }
    #couponGrid .row > div.vals{flex:1 1 auto;display:inline-block;white-space:normal;color:var(--text)}

    /* Summary (två rader + pris) */
    #trav-slider-host .ts-summary { padding:14px }
    #trav-slider-host .ts-footer { display:grid; grid-template-columns: 1fr auto; align-items:end; gap:10px; }
    #trav-slider-host .leg-row { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(34px,auto); gap:8px; }
    #trav-slider-host .leg-row .leg { background:var(--bg-soft); border:1px solid var(--line); border-radius:8px; padding:6px 10px; text-align:center; font-weight:800; color:var(--text) }
    #trav-slider-host .leg-row.counts .leg { background:transparent; border-style:dashed; color:var(--muted) }
    #trav-slider-host .price-eq { align-self:center; font-weight:800; color:var(--text); white-space:nowrap; }

    /* Håll höjd synkad mellan sidor & mitten */
    #trav-slider-host .ts-col.ts-popular,
    #trav-slider-host .ts-col.ts-info,
    #trav-slider-host .ts-col.ts-mine { display:grid; grid-auto-rows: var(--row); align-content:start; }

    @media (max-width:640px){
      #trav-slider-host .ts-grid{ grid-template-columns:60px 1fr 60px }
      :root{ --row:56px }
      #trav-slider-host .horse{ font-size:18px }
    }
    #themeToggle { background:var(--bg-soft); color:var(--text); border:1px solid var(--line); border-radius:999px; padding:6px 10px; font-weight:800; cursor:pointer; box-shadow:var(--shadow) }
    `;
    const style=document.createElement('style'); style.id='trav-theme-css'; style.textContent=css; document.head.appendChild(style);
  }
  function themeCurrent(){ try { return localStorage.getItem('travTheme') || 'light'; } catch { return 'light'; } }
  function applyTheme(t){
    const root=document.documentElement;
    root.classList.remove('theme-light','theme-dark');
    root.classList.add(t==='light' ? 'theme-light' : 'theme-dark');
    try { localStorage.setItem('travTheme', t); } catch {}
    const btn = q('#themeToggle');
    if(btn){ btn.textContent = t==='light' ? '🌙 Mörk' : '☀️ Ljus'; }
  }
  function placeThemeToggle(){
    const host = q('#trav-slider-host .ts-head');
    if(!host || q('#themeToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggle'; btn.type='button'; btn.style.marginLeft='auto';
    btn.addEventListener('click', ()=>{ applyTheme(themeCurrent()==='light'?'dark':'light'); });
    host.appendChild(btn);
    applyTheme(themeCurrent());
  }

  // ---------- Init ----------
  function renderAll(){
    ensureStyles();
    ensureTheme();
    wireFormPills();

    if(!window.__horseData){ const saved=readLS('horseData'); if(saved){ window.__horseData=saved; } }

    const legs=getLegs(true);
    rebuildIfNeeded(legs);
    bindPaste();
    beautifyCoupons();
    observeCoupons();
    goTo(current||1);

    const prev=q('#prevBtn'), next=q('#nextBtn');
    if(prev && !prev._bound){ prev._bound=true; prev.addEventListener('click',()=>goTo(current-1)); }
    if(next && !next._bound){ next._bound=true; next.addEventListener('click',()=>goTo(current+1)); }

    placeThemeToggle();
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', renderAll); } else { renderAll(); }
})();
