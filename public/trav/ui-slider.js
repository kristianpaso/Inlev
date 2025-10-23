// Trav UI Slider v2.21 – 64px rows, compact coupons, count boxes, editable coupon titles
(() => {
  const q  = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const clamp = (n,a,b)=> Math.max(a, Math.min(b,n));
  let current = 1;
  const parseRow = (str) => (!str ? [] : str.split(/[^0-9]+/).map(s=>parseInt(s,10)).filter(n=>Number.isFinite(n)&&n>=1));
  const saveLS = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };
  const readLS = (k)=>{ try{ const v=localStorage.getItem(k); return v? JSON.parse(v):null; }catch{ return null; } };
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
          const first=cols[0];
          const m=first.match(/^(\d{1,2})\s+(.+)$/);
          if(m){ nr=parseInt(m[1],10); name=m[2].trim(); kusk=cols[1]; percent=cols[2]; }
          else { nr=parseInt(cols[0],10); name=cols[1]; kusk=cols[2]; percent=cols[3]; }
        }
      }else{
        const m = raw.match(/^(\d{1,2})\s+(.+?)\s+([A-Za-zÅÄÖåäöÉéÜüÖö.\-' ]+?)\s+(\d+)\s*%$/);
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
    let lastSig=""; let t=null;
    const apply=()=>{ t=null;
      const txt=ta.value, sig = txt.length+":"+(txt.match(/\n/g)||[]).length;
      if(sig===lastSig) return; lastSig=sig;
      const parsed = parsePastedList(txt);
      if(parsed.legs){
        window.__horseData = parsed.data;
        saveLS('horseData', parsed.data);
        saveLS('horseLegs', parsed.legs);
        const legsInput = q('#legs'); if(legsInput && String(legsInput.value)!==String(parsed.legs)) legsInput.value=String(parsed.legs);
        rebuildIfNeeded(parsed.legs);
        current = clamp(current,1,parsed.legs); goTo(current);
      }
    };
    const deb=()=>{ if(t) clearTimeout(t); t=setTimeout(apply,80); };
    ta.addEventListener('input',deb); ta.addEventListener('change',deb);
    if(ta.value.trim()) deb();
  }
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
    const pop={}; const totals={}; for(let d=1; d<=legs; d++){ pop[d]={}; totals[d]=0; }
    const found = findCoupons(legs);
    if(found.type==='grid'){
      found.data.forEach(card=>{
        for(let i=0;i<Math.min(card.length,legs);i++){
          const arr=card[i]||[];
          arr.forEach(h=> pop[i+1][h]=(pop[i+1][h]||0)+1 );
          totals[i+1]+=arr.length;
        }
      });
    }else{
      found.data.forEach(s=>{
        s.inputs.forEach((inp,i)=>{
          if(i>=legs) return;
          const val=(inp.value||inp.getAttribute('value')||'').trim();
          parseRow(val).forEach(h=> pop[i+1][h]=(pop[i+1][h]||0)+1 );
          totals[i+1]+=parseRow(val).length;
        });
      });
    }
    return {pop, totals};
  }
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
  function horseKeys(d){ const data = (window.__horseData && window.__horseData[d]) || {}; return Object.keys(data).map(n=>parseInt(n,10)).filter(Number.isFinite).sort((a,b)=>a-b); }
  function getLegs(){ const legsInput=q('#legs'); const ls = readLS('horseLegs'); if(legsInput && legsInput.value) return clamp(parseInt(legsInput.value,10)||6, 1, 20); if(ls) return ls; if(window.__horseData) return Object.keys(window.__horseData).length || 6; return 6; }
  function getStake(){ const s=q('#stake'); return s? Math.max(0.01, parseFloat(s.value||'0.5')):0.5; }
  function rebuildIfNeeded(legs){ const slides = q('#slides'); if(!slides || slides.children.length!==legs){ ensureSlider(legs); buildSlides(legs); } else { const c=q('#divCount'); if(c) c.textContent=String(legs);} }
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
          <div class="ts-counts" id="countGrid"></div>
          <div class="ts-summary-grid" id="summaryGrid"></div>
          <div class="ts-summary-price">Pris: <strong id="summaryPrice">1</strong> kr</div>
        </section>`;
      const legacy = document.querySelector('.section .avd-list'); if(legacy){ const sec=legacy.closest('.section'); if(sec) sec.style.display='none'; }
      const couponRow = q('.coupon-row') || q('#couponGrid')?.parentElement || q('.coupons');
      const main = q('main.container') || document.body;
      if(couponRow && couponRow.parentElement){ couponRow.parentElement.insertBefore(host, couponRow.nextSibling); }
      else { main.appendChild(host); }
    }
    return host;
  }
  function buildSlides(legs){ const slides=q('#slides'); const dots=q('#dots'); slides.innerHTML=''; dots.innerHTML=''; for(let d=1; d<=legs; d++){ const slide=document.createElement('div'); slide.className='ts-slide'; slide.dataset.div=d; slide.innerHTML=`<div class="ts-grid" id="grid-${d}"><div class="ts-col ts-popular" id="popular-${d}"></div><div class="ts-col ts-info" id="info-${d}"></div><div class="ts-col ts-mine" id="mine-${d}"></div></div>`; slides.appendChild(slide); const dot=document.createElement('button'); dot.className='ts-dot'; dot.addEventListener('click',()=>goTo(d)); dots.appendChild(dot);} const divCount=q('#divCount'); if(divCount) divCount.textContent=String(legs);} 
  function renderSlide(d, meta){ const keys  = horseKeys(d); const data  = (window.__horseData && window.__horseData[d]) || {}; const pop   = meta.pop[d] || {}; const viewN = keys.map((_,i)=>i+1); const maxCount = Math.max(0, ...keys.map(k=>pop[k]||0)); const left = q('#popular-'+d); left.innerHTML=''; keys.forEach((orig,i)=>{ const best = (maxCount>0) && ((pop[orig]||0)===maxCount); const sq=document.createElement('div'); sq.className='ts-sq'+(best?' red':''); sq.textContent=String(viewN[i]); left.appendChild(sq); }); const mid = q('#info-'+d); mid.innerHTML=''; keys.forEach((orig,i)=>{ const info=data[orig] || {name:`Häst ${viewN[i]}`, kusk:'Kusk', percent:0}; const pct = Number.isFinite(info.percent) ? info.percent : 0; const row=document.createElement('div'); row.className='ts-info-row'; const main=document.createElement('div'); main.className='main'; main.innerHTML = `<span class="horse">${info.name}</span> <span class="driver">${info.kusk}</span>`; const perc=document.createElement('div'); perc.className='perc'; perc.textContent = `${pct}%`; row.appendChild(main); row.appendChild(perc); mid.appendChild(row); }); const right = q('#mine-'+d); right.innerHTML=''; const set = mySet(d); [...set].forEach(x=>{ if(x<1 || x>viewN.length) set.delete(x); }); viewN.forEach(n=>{ const btn=document.createElement('button'); btn.className='ts-sq'+(set.has(n)?' blue':''); btn.textContent=String(n); btn.addEventListener('click',()=>{ const s=mySet(d); if(s.has(n)) s.delete(n); else s.add(n); goTo(current); }); right.appendChild(btn); }); }
  function renderSummary(legs){ const grid=q('#summaryGrid'); if(!grid) return; const counts=q('#countGrid'); grid.innerHTML=''; let rows=1; if(counts){ counts.innerHTML=''; for(let d=1; d<=legs; d++){ const picks=[...mySet(d)].sort((a,b)=>a-b); const box=document.createElement('div'); box.className='count-box'; box.innerHTML = `<span class="lbl">Avd ${d}</span><span>${picks.length} st</span>`; counts.appendChild(box); } } for(let d=1; d<=legs; d++){ const picks=[...mySet(d)].sort((a,b)=>a-b); const div=document.createElement('div'); div.className='ts-summary-item'; div.innerHTML=`<h4>Avd ${d}:</h4><div>${picks.length ? picks.join(' ') : '—'}</div>`; grid.appendChild(div); rows *= Math.max(picks.length,1); } const price=rows*getStake(); const p1=q('#price'); if(p1) p1.textContent=price.toLocaleString('sv-SE'); const p2=q('#summaryPrice'); if(p2) p2.textContent=price.toLocaleString('sv-SE'); }
  function goTo(n){ const legs=getLegs(); current=clamp(n,1,legs); const slides=q('#slides'); const idx=q('#divIndex'); const dots=qa('.ts-dot'); if(slides) slides.style.transform=`translateX(-${(current-1)*100}%)`; if(idx) idx.textContent=String(current); dots.forEach((d,i)=> d.classList.toggle('active', (i+1)===current)); const meta=computePopularity(legs); renderSlide(current, meta); renderSummary(legs); const ins=ensureHiddenSync(legs); ins.forEach((inp,idx)=>{ const str=[...mySet(idx+1)].sort((a,b)=>a-b).join(' '); if(inp.value!==str){ inp.value=str; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); } window.__myTicketArray = window.__myTicketArray || []; window.__myTicketArray[idx]=str; }); }
  function beautifyCoupons(){ const grid = q('#couponGrid'); if(!grid) return; grid.querySelectorAll('.coupon-card > b').forEach((h, idx)=>{ h.classList.add('coupon-title'); h.contentEditable = "true"; h.dataset.index = String(idx); const names = readLS('couponNames') || {}; if(names && names[idx]) h.textContent = names[idx]; if(!h._bound){ h._bound = true; h.addEventListener('blur', ()=>{ const all = readLS('couponNames') || {}; all[idx] = (h.textContent || '').trim() || `Kupong ${idx+1}`; saveLS('couponNames', all); }); } }); grid.querySelectorAll('.row').forEach(row=>{ const label = row.querySelector('.badge'); const val   = row.querySelector('div:last-of-type'); if(label){ label.classList.add('badge-plain'); label.textContent = label.textContent.replace(/AVD\s+(\d+)/i,'Avd $1:'); } if(val) val.classList.add('vals'); }); }
  function ensureStyles(){ if(q('#trav-slider-styles')) return; const css = `
    #trav-slider-host .ts-head{display:flex;flex-direction:column;gap:8px;align-items:center;margin-bottom:12px}
    #trav-slider-host .ts-title{display:flex;align-items:center;gap:12px;justify-content:center;text-align:center}
    #trav-slider-host .ts-nav{display:flex;align-items:center;gap:10px;justify-content:center}
    #trav-slider-host .ts-btn{background:#162233;border:1px solid #26364d;border-radius:10px;color:#d8e6f5;padding:8px 10px;cursor:pointer}
    #trav-slider-host .ts-carousel{position:relative;overflow:hidden;border-radius:12px;border:1px dashed #223146}
    #trav-slider-host .ts-slides{display:flex;transition:transform .25s ease;will-change:transform}
    #trav-slider-host .ts-slide{min-width:100%;padding:12px}
    /* 64px radhöjd */
    #trav-slider-host .ts-grid{display:grid;grid-template-columns:80px 1fr 80px;gap:12px}
    #trav-slider-host .ts-col.ts-popular,#trav-slider-host .ts-col.ts-mine{padding:8px;border:1px dashed #223146;border-radius:12px;display:grid;grid-auto-rows:64px;gap:8px;align-content:start}
    #trav-slider-host .ts-col.ts-info{padding:8px;border:1px dashed #223146;border-radius:12px;display:grid;grid-auto-rows:64px}
    #trav-slider-host .ts-info-row{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:2px solid #1b2433}
    #trav-slider-host .ts-info-row:last-child{border-bottom:0}
    #trav-slider-host .horse{font-weight:800;font-size:20px}
    #trav-slider-host .driver{opacity:.9;margin-left:10px;font-size:14px}
    #trav-slider-host .perc{opacity:.95;font-weight:700;margin-left:12px;min-width:52px;text-align:right}
    #trav-slider-host .ts-sq{height:64px;display:flex;align-items:center;justify-content:center;border:3px solid #101417;border-radius:10px;background:#0b121a;color:#e6eef7;font-weight:800;box-shadow:inset 0 -2px 0 rgba(255,255,255,.06),0 2px 0 rgba(0,0,0,.5)}
    #trav-slider-host .ts-sq.red{background:#b71c1c;border-color:#8c1111} #trav-slider-host .ts-sq.blue{background:#0ea5b4;border-color:#0a7e8b}
    #trav-slider-host .ts-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    #trav-slider-host .ts-summary-item{padding:10px;border:1px solid #1f2a38;border-radius:12px;background:#0b121a}
    #trav-slider-host .ts-summary-item h4{margin:0 0 6px 0;font-size:12px;opacity:.8}
    #trav-slider-host .ts-summary-price{text-align:right;margin-top:8px}
    #trav-slider-host .ts-dots{display:flex;gap:6px;align-items:center;margin:0 8px}
    #trav-slider-host .ts-dot{width:10px;height:10px;border-radius:50%;background:#203045;border:1px solid #2f4360;cursor:pointer}
    #trav-slider-host .ts-dot.active{background:#2a66f3}
    #trav-slider-host .ts-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:10px}
    #trav-slider-host .ts-counts .count-box{padding:10px 12px;border:1px solid #1f2a38;border-radius:12px;background:#0b121a;display:flex;align-items:center;justify-content:space-between;font-weight:700}
    #trav-slider-host .ts-counts .count-box .lbl{opacity:.8;font-weight:600}
    @media (max-width: 640px){
      #trav-slider-host .ts-grid{grid-template-columns:60px 1fr 60px;gap:8px}
      #trav-slider-host .ts-col.ts-popular,#trav-slider-host .ts-col.ts-mine{grid-auto-rows:56px}
      #trav-slider-host .ts-sq{height:56px;border-width:2px}
      #trav-slider-host .ts-col.ts-info{grid-auto-rows:56px}
      #trav-slider-host .horse{font-size:18px}
      #trav-slider-host .perc{min-width:46px}
    }
    #couponGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:10px}
    #couponGrid .coupon-card{background:#0b121a;border:1px solid #1f2a38;border-radius:14px;padding:12px}
    #couponGrid .coupon-card > b.coupon-title{display:block;font-size:16px;margin:2px 0 8px 0;outline:none;cursor:text}
    #couponGrid .row{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed #1f2a38}
    #couponGrid .row:last-child{border-bottom:0}
    #couponGrid .row .badge.badge-plain{background:transparent;border:0;color:#cfd8e3;font-weight:700;padding:0;flex:0 0 auto;min-width:64px;margin-right:4px}
    #couponGrid .row > div.vals{flex:1 1 auto;display:inline-block;white-space:normal}
    `; const style=document.createElement('style'); style.id='trav-slider-styles'; style.textContent=css; document.head.appendChild(style); }
  function renderAll(){ ensureStyles(); wireFormPills(); if(!window.__horseData){ const saved=readLS('horseData'); if(saved){ window.__horseData=saved; } } const legs=getLegs(); rebuildIfNeeded(legs); bindPaste(); beautifyCoupons(); goTo(current||1); const prev=q('#prevBtn'), next=q('#nextBtn'); if(prev && !prev._bound){ prev._bound=true; prev.addEventListener('click',()=>goTo(current-1)); } if(next && !next._bound){ next._bound=true; next.addEventListener('click',()=>goTo(current+1)); } }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', renderAll); } else { renderAll(); }
})();
