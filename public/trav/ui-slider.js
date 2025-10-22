// Trav UI Slider v2.14
(() => {
  const q  = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const clamp = (n,a,b)=> Math.max(a, Math.min(b,n));
  let current = 1;

  const parseRow = (str) => (!str ? [] : str.split(/[^0-9]+/).map(s=>parseInt(s,10)).filter(n=>Number.isFinite(n)&&n>=1));
  const saveLS = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
  const readLS = (k)=>{ try{ const v=localStorage.getItem(k); return v? JSON.parse(v):null; }catch{ return null; } };

  // ---------- Paste full list ----------
  function findPasteTextarea(){
    const all = qa('textarea');
    for(const ta of all){
      const label = (ta.previousElementSibling && ta.previousElementSibling.textContent) || "";
      if(/klistra in hel lista|alla avdelningar/i.test(label) || /klistra in|alla avdelningar/i.test(ta.placeholder||"")) return ta;
    }
    return document.getElementById('pasteAll') || document.getElementById('fullList') || null;
  }
  function parsePastedList(txt){
    const out = { legs: 0, data: {} };
    if(!txt) return out;
    const lines = txt.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return out;
    if(/^HÄST/i.test(lines[0]) || /KUSK/i.test(lines[0])) lines.shift();
    let d=1; out.data[d]={}; let seen=false;
    for(const raw of lines){
      let nr,name,kusk,percent;
      if(raw.includes('\t')){
        const cols = raw.split('\t').map(c=>c.trim()).filter(Boolean);
        if(cols.length>=3){
          const first=cols[0]; const m=first.match(/^(\d{1,2})\s+(.+)$/);
          if(m){ nr=parseInt(m[1],10); name=m[2].trim(); kusk=cols[1]; percent=cols[2]; }
          else { nr=parseInt(cols[0],10); name=cols[1]; kusk=cols[2]; percent=cols[3]; }
        }
      }else{
        const m = raw.match(/^(\d{1,2})\s+(.+?)\s+([A-Za-zÅÄÖåäöÉéÜüÖö.\-\' ]+?)\s+(\d+)\s*%$/);
        if(m){ nr=parseInt(m[1],10); name=m[2].trim(); kusk=m[3].trim(); percent=m[4]+'%'; }
      }
      if(nr==null||!name||!kusk) continue;
      if(nr===1 && seen){ d+=1; out.data[d] = {}; }
      seen = true;
      const pct = percent ? parseInt(String(percent).replace('%',''),10) : 0;
      out.data[d][nr] = { name, kusk, percent: pct };
    }
    out.legs = d;
    return out;
  }
  function bindPaste(){
    const ta = findPasteTextarea(); if(!ta || ta._pasteBound) return; ta._pasteBound=true;
    let lastSig=""; let timer=null;
    const apply = () => {
      timer=null;
      const txt = ta.value;
      const sig = txt.length + ":" + (txt.match(/\n/g)||[]).length;
      if(sig===lastSig) return;
      lastSig = sig;
      const parsed = parsePastedList(txt);
      if(parsed.legs){
        window.__horseData = parsed.data;
        saveLS('horseData', parsed.data);
        saveLS('horseLegs', parsed.legs);
        const legsInput = q('#legs'); if(legsInput && String(legsInput.value)!==String(parsed.legs)) legsInput.value=String(parsed.legs);

        // NEW: rebuild slider if leg count changed or slides not present
        const slides = q('#slides');
        const existing = slides ? slides.children.length : 0;
        if(!slides || existing !== parsed.legs){
          ensureSlider(parsed.legs);
          buildSlides(parsed.legs);
        }
        current = clamp(current, 1, parsed.legs);
        goTo(current); // will render slide with new data
      }
    };
    const deb = ()=>{ if(timer) clearTimeout(timer); timer=setTimeout(apply,80); };
    ta.addEventListener('input', deb); ta.addEventListener('change', deb);
    if(ta.value.trim()) deb();
  }

  // ---------- Coupons & popularity ----------
  function findCoupons(){
    const sets=[];
    qa('.coupon-card').forEach(card=>{ const inputs=qa('input[type="text"]', card); if(inputs.length) sets.push({inputs}); });
    if(!sets.length){
      const inputs = qa('.coupon-grid input[type="text"], .coupon input[type="text"], .kupong input[type="text"]');
      if(inputs.length) sets.push({inputs});
    }
    return sets;
  }
  function computePopularity(legs){
    const pop={}; const totals={}; for(let d=1; d<=legs; d++){ pop[d]={}; totals[d]=0; }
    const sets=findCoupons();
    sets.forEach(s=>{
      s.inputs.forEach((inp,i)=>{
        if(i>=legs) return;
        if(!inp._popBound){ inp.addEventListener('input', ()=>goTo(current)); inp._popBound=true; }
        const nums = parseRow(inp.value);
        nums.forEach(h=> pop[i+1][h] = (pop[i+1][h]||0)+1 );
        totals[i+1] += nums.length;
      });
    });
    return {pop, totals};
  }

  // ---------- My ticket sync ----------
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

  // ---------- Helpers ----------
  function horseList(d){
    const data = (window.__horseData && window.__horseData[d]) || null;
    if(!data){ return []; }
    return Object.keys(data).map(n=>parseInt(n,10)).filter(Number.isFinite).sort((a,b)=>a-b);
  }
  function getLegs(){
    const legsInput=q('#legs');
    const ls = readLS('horseLegs');
    if(legsInput && legsInput.value) return clamp(parseInt(legsInput.value,10)||6, 1, 20);
    if(ls) return ls;
    if(window.__horseData) return Object.keys(window.__horseData).length || 6;
    return 6;
  }
  function getStake(){ const s=q('#stake'); return s? Math.max(0.01, parseFloat(s.value||'0.5')):0.5; }

  // ---------- Slider ----------
  function ensureSlider(legs){
    let host=q('#trav-slider-host');
    if(!host){
      host=document.createElement('section'); host.id='trav-slider-host'; host.className='card';
      host.innerHTML=`
        <div class="division-head">
          <div class="title">
            <h2>Avdelning <span id="divIndex">1</span> / <span id="divCount">${legs}</span></h2>
            <span class="badge">Pris: <span id="price">1</span> kr</span>
          </div>
          <div class="nav" id="sliderNav">
            <button id="prevBtn" class="tab" title="Föregående">&larr;</button>
            <div id="dots" class="dots"></div>
            <button id="nextBtn" class="tab" title="Nästa">&rarr;</button>
          </div>
        </div>
        <div class="carousel" id="carousel"><div class="slides" id="slides"></div></div>
        <section class="summary card inner">
          <div class="summary-grid" id="summaryGrid"></div>
          <div class="summary-price">Pris: <strong id="summaryPrice">1</strong> kr</div>
        </section>`;

      // Hide only old avdelningslist if present
      const legacy = document.querySelector('.section .avd-list');
      if(legacy){ const sec = legacy.closest('.section'); if(sec) sec.style.display='none'; }

      const couponRow = q('.coupon-row') || q('#couponGrid')?.parentElement || q('.coupons');
      const main = q('main.container') || document.body;
      if(couponRow && couponRow.parentElement){ couponRow.parentElement.insertBefore(host, couponRow.nextSibling); } else { main.appendChild(host); }
    }else{
      // update count
      const c=q('#divCount'); if(c) c.textContent=String(legs);
    }
    return host;
  }

  function buildSlides(legs){
    const slides=q('#slides'); const dots=q('#dots'); slides.innerHTML=''; dots.innerHTML='';
    for(let d=1; d<=legs; d++){
      const slide=document.createElement('div'); slide.className='slide'; slide.dataset.div=d;
      slide.innerHTML=`
        <div class="slide-grid three-cols" id="grid-${d}">
          <div class="popular-col" id="popular-${d}"></div>
          <div class="info-col" id="info-${d}"></div>
          <div class="mine-col" id="mine-${d}"></div>
        </div>`;
      slides.appendChild(slide);
      const dot=document.createElement('button'); dot.className='dot'; dot.addEventListener('click',()=>goTo(d)); dots.appendChild(dot);
    }
  }

  function renderSlide(d, meta){
    const list = horseList(d);
    const data = (window.__horseData && window.__horseData[d]) || {};
    const map = meta.pop[d] || {};

    // popular (only max>0)
    let maxCount = 0;
    list.forEach(h=>{ maxCount = Math.max(maxCount, map[h]||0); });

    const left = q('#popular-'+d); left.innerHTML='';
    list.forEach(h=>{
      const cnt = map[h]||0;
      const isTop = (maxCount>0) && (cnt===maxCount);
      const sq=document.createElement('div'); sq.className='sq'+(isTop?' red':'');
      sq.textContent=String(h);
      left.appendChild(sq);
    });

    const mid = q('#info-'+d); mid.innerHTML='';
    const total = meta.totals[d] || 0;
    list.forEach(h=>{
      const row=document.createElement('div'); row.className='info-row';
      const info=data[h] || {name:`Häst ${h}`, kusk:'Kusk', percent:0};
      const pct = total ? Math.round(((map[h]||0)/Math.max(total,1))*100) : info.percent;
      const main=document.createElement('div'); main.className='main'; main.innerHTML = `<span class="horse">${info.name}</span> <span class="driver">${info.kusk}</span>`;
      const perc=document.createElement('div'); perc.className='perc'; perc.textContent = `${pct}%`;
      row.appendChild(main); row.appendChild(perc);
      mid.appendChild(row);
    });

    const right = q('#mine-'+d); right.innerHTML='';
    const set = mySet(d);
    [...set].forEach(x=>{ if(!list.includes(x)) set.delete(x); });
    list.forEach(h=>{
      const btn=document.createElement('button'); btn.className='sq'+(set.has(h)?' blue':''); btn.textContent=String(h);
      btn.addEventListener('click',()=>{ const s=mySet(d); if(s.has(h)) s.delete(h); else s.add(h); goTo(current); });
      right.appendChild(btn);
    });
  }

  function renderSummary(legs){
    const grid=q('#summaryGrid'); if(!grid) return;
    grid.innerHTML=''; let rows=1;
    for(let d=1; d<=legs; d++){
      const picks=[...mySet(d)].sort((a,b)=>a-b);
      const div=document.createElement('div'); div.className='summary-item';
      div.innerHTML=`<h4>Avd ${d}:</h4><div>${picks.length? picks.join(' '): '—'}</div>`;
      grid.appendChild(div);
      rows *= Math.max(picks.length,1);
    }
    const price=rows*getStake();
    const p1=q('#price'); if(p1) p1.textContent=price.toLocaleString('sv-SE');
    const p2=q('#summaryPrice'); if(p2) p2.textContent=price.toLocaleString('sv-SE');
  }

  function goTo(n){
    const legs=getLegs();
    current=clamp(n,1,legs);
    const slides=q('#slides'); const idx=q('#divIndex'); const dots=qa('.dot');
    if(slides) slides.style.transform=`translateX(-${(current-1)*100}%)`;
    if(idx) idx.textContent=String(current);
    dots.forEach((d,i)=> d.classList.toggle('active', (i+1)===current));
    const meta=computePopularity(legs);
    renderSlide(current, meta);
    renderSummary(legs);
    // sync hidden
    const ins=ensureHiddenSync(legs);
    ins.forEach((inp,idx)=>{
      const set = mySet(idx+1);
      const str=[...set].sort((a,b)=>a-b).join(' ');
      if(inp.value!==str){ inp.value=str; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); }
      window.__myTicketArray = window.__myTicketArray || []; window.__myTicketArray[idx]=str;
    });
  }

  function bindNav(){
    const prev=q('#prevBtn'); const next=q('#nextBtn');
    if(prev && !prev._bound){ prev._bound=true; prev.addEventListener('click',()=>goTo(current-1)); }
    if(next && !next._bound){ next._bound=true; next.addEventListener('click',()=>goTo(current+1)); }
    if(!window._navKeyBound){
      window._navKeyBound=true;
      window.addEventListener('keydown',e=>{ if(e.key==='ArrowLeft') goTo(current-1); if(e.key==='ArrowRight') goTo(current+1); });
    }
    const car=q('#carousel'); if(car && !car._touchBound){
      car._touchBound=true;
      let start=null, drag=false;
      car.addEventListener('touchstart',e=>{ start=e.touches[0].clientX; drag=true; });
      car.addEventListener('touchend',e=>{ if(!drag) return; drag=false; const dx=e.changedTouches[0].clientX-start; if(Math.abs(dx)>40){ if(dx<0) goTo(current+1); else goTo(current-1);} });
    }
  }

  function ensureStyles(){
    if(q('#trav-slider-styles')) return;
    const css = `
    .division-head{display:flex;flex-direction:column;gap:8px;align-items:center;margin-bottom:12px}
    .division-head .title{display:flex;align-items:center;gap:12px;justify-content:center;text-align:center}
    .nav{display:flex;align-items:center;gap:10px;justify-content:center}
    .tab{background:#162233;border:1px solid #26364d;border-radius:10px;color:#d8e6f5;padding:8px 10px;cursor:pointer}
    .carousel{position:relative;overflow:hidden;border-radius:12px;border:1px dashed #223146}
    .slides{display:flex;transition:transform .25s ease;will-change:transform}
    .slide{min-width:100%;padding:12px}
    .slide-grid{display:grid;grid-template-columns:80px 1fr 80px;gap:12px}
    .popular-col,.mine-col{padding:8px;border:1px dashed #223146;border-radius:12px;display:grid;grid-auto-rows:46px;gap:8px;align-content:start}
    .info-col{padding:8px;border:1px dashed #223146;border-radius:12px}
    .info-row{display:grid;grid-template-columns:1fr 60px;align-items:center;padding:6px 8px;border-bottom:1px solid #1d2735;height:46px}
    .info-row:last-child{border-bottom:0}
    .info-row .horse{font-weight:700}
    .info-row .driver{opacity:.8;margin-left:6px}
    .info-row .perc{justify-self:end;opacity:.9}
    .sq{height:46px;display:flex;align-items:center;justify-content:center;border:3px solid #101417;border-radius:8px;background:#0b121a;color:#e6eef7;font-weight:700;box-shadow:inset 0 -2px 0 rgba(255,255,255,.06),0 2px 0 rgba(0,0,0,.5)}
    .sq.red{background:#b71c1c;border-color:#8c1111}.sq.blue{background:#0ea5b4;border-color:#0a7e8b}
    .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .summary-item{padding:10px;border:1px solid #1f2a38;border-radius:12px;background:#0b121a}
    .summary-item h4{margin:0 0 6px 0;font-size:12px;opacity:.8}
    .summary-price{text-align:right;margin-top:8px}
    .dots{display:flex;gap:6px;align-items:center;margin:0 8px}
    .dot{width:10px;height:10px;border-radius:50%;background:#203045;border:1px solid #2f4360;cursor:pointer}
    .dot.active{background:#2a66f3}
    @media (max-width: 640px){
      .slide-grid{grid-template-columns:60px 1fr 60px;gap:8px}
      .popular-col,.mine-col{grid-auto-rows:40px}
      .sq{height:40px;border-width:2px}
      .info-row{grid-template-columns:1fr 54px;height:40px}
    }`;
    const style=document.createElement('style'); style.id='trav-slider-styles'; style.textContent=css; document.head.appendChild(style);
  }

  function renderAll(){
    ensureStyles();
    if(!window.__horseData){
      const saved=readLS('horseData'); if(saved){ window.__horseData=saved; }
    }
    const legs=getLegs();
    ensureSlider(legs);
    buildSlides(legs);
    bindNav();
    bindPaste();
    goTo(current||1);
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', renderAll); } else { renderAll(); }
})();