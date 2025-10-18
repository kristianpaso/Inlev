// additions.js v2.1 – hard fix for null g.id on manual save + auto render + price guide
(function(){
  if (!window.uid) window.uid = () => 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  function readDB(){ try{ return JSON.parse(localStorage.getItem('games')||'{}'); }catch(_){ return {}; } }
  function writeDB(o){ try{ localStorage.setItem('games', JSON.stringify(o)); }catch(_){ } }
  if (typeof window.getGame !== 'function') window.getGame = (id)=> readDB()[id] || null;
  if (typeof window.setGame !== 'function'){
    window.setGame = (id, updater)=>{
      const db = readDB();
      const prev = db[id] || { id, form:'V64', divisions:Array(6).fill(0).map((_,i)=>({id:i+1})), coupons:[] };
      const next = typeof updater==='function' ? updater(prev) : updater;
      db[id] = next; writeDB(db);
      if (typeof window.openGame === 'function') { try{ setTimeout(()=>openGame(id),0); }catch(_){ } }
      return next;
    };
  }
  function renderImportedFallback(game){
    const mountId = 'importedCoupons';
    let mount = document.getElementById(mountId);
    if(!mount){
      mount = document.createElement('section');
      mount.id = mountId;
      mount.className = 'card';
      mount.style.marginTop='12px';
      mount.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center">
        <div><b>Importerade kuponger</b></div></div><div id="importedBody" class="mini"></div>`;
      (document.querySelector('main')||document.body).appendChild(mount);
    }
    const body = document.getElementById('importedBody'); if(!body) return;
    const rows = (game.coupons||[]).map((c,idx)=>{
      const title = (c.name||'').trim() || `Kupong ${idx+1}`;
      const lines = (c.rows||[]).sort((a,b)=>a.avd-b.avd).map(r=>`AVD ${r.avd}: ${r.horses.join(' ')}`).join('<br>');
      return `<div class="card" style="margin:6px 0">
        <div class="row" style="justify-content:space-between;align-items:center"><div><b>${title}</b></div></div>
        <div class="mini" style="margin-top:6px">${lines||'<i>Tom</i>'}</div></div>`;
    }).join('');
    body.innerHTML = rows || '<span class="ghost mini">Inga importerade kuponger ännu.</span>';
  }
  function wireManualSave(){
    const btn = document.getElementById('manualSave');
    if(!btn || btn.__wired) return; btn.__wired=true;
    btn.addEventListener('click', ()=>{
      const inputId = document.getElementById('gameId')?.value;
      const gid = (inputId && String(inputId).trim()) || (window.currentGameId) || 'DEFAULT';
      let base = getGame(gid);
      if(!base){
        const avdCount = 6;
        base = { id: gid, form:'V64', divisions:Array(avdCount).fill(0).map((_,i)=>({id:i+1})), coupons:[] };
        setGame(gid, base);
      }
      const host = document.getElementById('manualRows'); if(!host) return;
      const name = (document.getElementById('manualName')?.value||'').trim();
      const rows = Array.from(host.querySelectorAll('input')).map(inp=>{
        const avd = parseInt(inp.dataset.avd,10);
        const nums = (inp.value||'').match(/\d+/g)||[];
        const horses = [...new Set(nums.map(n=>parseInt(n,10)).filter(n=>n>=1 && n<=15))].sort((a,b)=>a-b);
        return horses.length ? { avd, horses } : null;
      }).filter(Boolean);
      const coupon = { id: uid(), name, rows, createdAt: Date.now() };
      const game = setGame(gid, s => ({...s, coupons:[...(s.coupons||[]), coupon]}));
      document.getElementById('manualModal')?.classList.add('hidden');
      if (typeof window.renderImportedCoupons === 'function'){
        try{ renderImportedCoupons(game); }catch(_){ renderImportedFallback(game); }
      } else {
        renderImportedFallback(game);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', ()=> setTimeout(wireManualSave, 60));
  document.addEventListener('click', (e)=>{ if(e.target?.id==='btnManual') setTimeout(wireManualSave, 60); }, true);
  function ensurePanel(){
    if (document.getElementById('comboInfoCard')) return;
    const main = document.querySelector('main') || document.body;
    const sec = document.createElement('section');
    sec.id = 'comboInfoCard';
    sec.innerHTML = `
      <style>
        #comboInfoCard{margin-top:12px;border-radius:16px;background:var(--panel,#0b1220);box-shadow:0 10px 30px rgba(0,0,0,.25);padding:12px}
        #comboHead{display:flex;gap:12px;align-items:center;justify-content:space-between}
        #comboTitle{font-weight:700}
        #comboList{font-family:ui-monospace,Consolas,monospace;white-space:pre;max-height:240px;overflow:auto;border:1px solid var(--line,#1f2937);border-radius:12px;padding:8px;background:rgba(0,0,0,.25)}
        .chip{border-radius:999px;padding:.2rem .6rem;background:#1f2937;color:#e5e7eb;margin-left:6px}
        .ghost{opacity:.7}
        #comboControls{display:flex;gap:8px;align-items:center}
        #comboControls input[type="number"]{width:72px}
      </style>
      <div id="comboHead">
        <div id="comboTitle">Prisguide <span class="mini ghost">(50–400 kr)</span></div>
        <div id="comboControls">
          <label class="mini">Max/avd <input id="comboMax" type="number" min="6" max="15" value="10"></label>
          <button id="comboRefresh" class="btn secondary">Uppdatera</button>
        </div>
      </div>
      <div class="mini ghost" style="margin:6px 0 8px">
        Baserad på “Min kupong”. Minimikrav per avdelning respekteras. Om någon avdelning har N valda hästar visas bara kombinationer där minst en avdelning är ≥ N.
      </div>
      <div id="comboList"></div>`;
    main.appendChild(sec);
    sec.querySelector('#comboRefresh').addEventListener('click', renderCombos);
  }
  function selectedCounts(){
    const cards = document.querySelectorAll('.division-card');
    if(cards.length){
      return Array.from(cards).map(c=> c.querySelectorAll('.horse.selected, .choice.selected, .btn.horse.active').length || 1);
    }
    return Array(6).fill(1);
  }
  function renderCombos(){
    ensurePanel();
    const mins = selectedCounts();
    const maxSelected = Math.max(...mins);
    const cap = Math.max(6, Math.min(15, parseInt(document.getElementById('comboMax')?.value||'10',10)));
    const minPrice=50, maxPrice=400;
    const out=[], seen=new Set();
    function dfs(i,last,arr){
      if(i===mins.length){
        const price = arr.reduce((a,b)=>a*b,1);
        const hasMax = arr.some(n=> n>=maxSelected);
        if(price>=minPrice && price<=maxPrice && hasMax){
          const key = arr.join('x'); if(!seen.has(key)){ seen.add(key); out.push({k:key,p:price}); }
        }
        return;
      }
      const start = Math.max(last, mins[i]||1);
      for(let n=start; n<=cap; n++){ dfs(i+1, n, arr.concat(n)); }
    }
    dfs(0,1,[]);
    out.sort((a,b)=> a.p-b.p || a.k.localeCompare(b.k));
    const list = document.getElementById('comboList');
    if(list){
      list.textContent = out.length ? out.map(r=>`${r.k} = ${r.p} kr`).slice(0,300).join('\n')
                                    : 'Inga kombinationer i spannet 50–400 kr.';
      const title = document.getElementById('comboTitle');
      if(title){
        const old = title.querySelector('.chip'); if(old) old.remove();
        const chip = document.createElement('span'); chip.className='chip';
        chip.textContent = `Min: ${mins.join('x')}  •  Krav: ≥ ${maxSelected} i minst en avd`;
        title.appendChild(chip);
      }
    }
  }
  function autoUpdate(){
    const root=document.body;
    root.addEventListener('click', (e)=>{
      const el=e.target;
      if(el && (el.classList?.contains('horse') || el.closest?.('.division-card'))) setTimeout(renderCombos,40);
    }, true);
    const obs=new MutationObserver(()=>renderCombos());
    obs.observe(root,{attributes:true, subtree:true, attributeFilter:['class']});
    document.addEventListener('coupon-changed', renderCombos);
  }
  document.addEventListener('DOMContentLoaded', ()=>{ ensurePanel(); renderCombos(); autoUpdate(); });
  (function(){
    const orig = window.prompt;
    window.prompt = function(message, def){
      try{ if (typeof message === 'string' && /^AVD\s*\d+:/i.test(message)) return null; }catch(_){}
      return orig.call(window, message, def);
    };
  })();
})();