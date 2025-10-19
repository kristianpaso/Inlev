// app.js — Trav UI v5.7.0
// - Fix: defensiv init av meta.avds (hindrar 'reading avds')
// - OCR: bildförhandsvisning + klistra-in-text + enkel kalibreringsvy med regex-test
// - Importerade kuponger + Populär-kupong
// - Avdelningsvy: Populär-lista i vänsterkolumn
// - Prisguide (50–400 kr) under summering
(function(){
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const LS_KEY='games';
  const TYPES={V64:6,V75:7,GS75:7,V86:8};
  const DEFAULT_TYPE='V64'; const MAXH=12;

  // ---------- storage helpers ----------
  const read  = ()=>{ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch(_){ return {}; } };
  const write = (db)=>localStorage.setItem(LS_KEY, JSON.stringify(db));
  const gid   = ()=>$('#gameId')?.value || null;
  const getGame=(id=gid())=> read()[id] || null;
  function upsertGame(obj){ const db=read(); db[obj.id]=obj; write(db); return obj; }
  function updateGame(id, updater){
    const db=read(); const prev=db[id]||{id,meta:{}};
    const next=(typeof updater==='function')?updater(prev):updater;
    db[id]=next; write(db); return next;
  }
  function ensureHorses(meta){
    const avd=meta.avds||6;
    meta.horses = meta.horses && meta.horses.length===avd ? meta.horses : Array.from({length:avd},()=>({}));
    return meta;
  }
  function ensureGameIdFromUrl(){
    const q=new URLSearchParams(location.search); const id=q.get('game'); if(!id) return null;
    let hidden=$('#gameId'); if(!hidden){ hidden=document.createElement('input'); hidden.type='hidden'; hidden.id='gameId'; document.body.appendChild(hidden); }
    hidden.value=id; return id;
  }

  // ---------- ÖVERBLICK ----------
  function renderOverview(){
    if(location.search.includes('game=')) return; // endast på överblick
    const host=document.createElement('section'); host.id='trv-overview';
    host.innerHTML=`
      <style>
        .ov{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#e5e7eb;margin:12px 0}
        .grid{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
        @media (min-width:1100px){.grid{grid-template-columns:repeat(3,1fr)}}
        @media (min-width:1400px){.grid{grid-template-columns:repeat(4,1fr)}}
        .card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px}
        .title{font-weight:800;margin-bottom:6px}
        .muted{opacity:.8;font-size:.9rem}
        .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        .btn{background:#38bdf8;color:#001826;border:0;border-radius:10px;padding:.45rem .8rem;font-weight:700;cursor:pointer}
        .btn.ghost{background:#0b1220;color:#e5e7eb;border:1px solid #334155}
        .head{display:flex;align-items:center;gap:8px;margin:12px 0}
      </style>
      <div class="ov">
        <div class="head">
          <button class="btn" data-action="create-game">Skapa spelsystem</button>
          <span class="muted">Startvyn listar alla spelsystem. Klicka ”Överblick”.</span>
        </div>
        <div id="ov-grid" class="grid"></div>
      </div>`;
    (document.querySelector('main')||document.body).appendChild(host);
    const grid=$('#ov-grid',host);
    const db=read();
    grid.innerHTML = Object.values(db).sort((a,b)=> (b.meta?.createdAt||'').localeCompare(a.meta?.createdAt||''))
      .map(g=>`<div class="card">
        <div class="title">${g.meta?.name||g.id}</div>
        <div class="muted">Typ: ${g.meta?.type||'V64'} • Avd: ${g.meta?.avds||6}</div>
        <div class="row">
          <a class="btn" href="index.html?game=${encodeURIComponent(g.id)}">Öppna</a>
          <button class="btn ghost" data-del="${g.id}">Ta bort</button>
        </div>
      </div>`).join('') || '<div class="muted">Inga sparade spelsystem ännu.</div>';
    grid.addEventListener('click',e=>{
      const b=e.target.closest('[data-del]'); if(!b) return;
      const id=b.dataset.del; const db=read(); delete db[id]; write(db); host.remove(); renderOverview();
    });
  }

  // ---------- Skapa spelsystem ----------
  function openCreateModal(){
    if($('#createGameModal')) return;
    const wrap=document.createElement('div'); wrap.id='createGameModal';
    wrap.innerHTML=`<style>
      .cg-back{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:9999}
      .cg{width:min(820px,94vw);background:#0f172a;border:1px solid #334155;border-radius:14px;padding:16px;color:#e5e7eb;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif}
      .row{display:grid;grid-template-columns:160px 1fr;gap:12px;margin:8px 0}
      .col{display:flex;gap:8px;flex-wrap:wrap}
      .pill{padding:.35rem .6rem;border:1px solid #94a3b8;border-radius:999px;cursor:pointer;color:#e2e8f0}
      .pill.on{background:#38bdf8;border-color:#38bdf8;color:#0b1220}
      .grid2{display:grid;gap:8px;grid-template-columns:1fr 1fr}
      .btn{background:#38bdf8;color:#001a22;border:0;padding:.6rem 1rem;border-radius:10px;font-weight:700;cursor:pointer}
      .btn.ghost{background:#0b1220;color:#e5e7eb;border:1px solid #334155}
      input[type=text],input[type=datetime-local]{background:#0b1220;border:1px solid #334155;border-radius:8px;padding:.5rem;color:#e5e7eb;width:100%}
    </style>
    <div class="cg-back"><div class="cg">
      <h2 style="margin:0 0 8px 0">Skapa spelsystem</h2>
      <div class="row"><div>Spelform</div>
        <div class="col" id="cg-types">${Object.keys(TYPES).map(t=>`<span class="pill" data-type="${t}">${t}</span>`).join('')}</div>
      </div>
      <div class="grid2">
        <div class="row"><div>Omgångsnamn</div><div><input id="cg-name" type="text" placeholder="t.ex. Halmstad fredag"></div></div>
        <div class="row"><div>Starttid</div><div><input id="cg-dt" type="datetime-local"></div></div>
      </div>
      <div class="row"><div>Förifyll hästar</div><div><label><input id="cg-prefill" type="checkbox" checked> Lägg in 1–12 tomma namn</label></div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button class="btn ghost" id="cg-cancel">Avbryt</button>
        <button class="btn" id="cg-create">Skapa</button>
      </div>
    </div></div>`;
    document.body.appendChild(wrap);
    const box=$('#cg-types',wrap);
    function sel(t){ $$('.pill',box).forEach(p=>p.classList.toggle('on',p.dataset.type===t)); wrap.dataset.sel=t; }
    sel(DEFAULT_TYPE);
    box.addEventListener('click',e=>{const p=e.target.closest('.pill'); if(p) sel(p.dataset.type)});
    $('#cg-cancel',wrap).onclick=()=>wrap.remove();
    $('#cg-create',wrap).onclick=()=>{
      const t=wrap.dataset.sel||DEFAULT_TYPE;
      const id = `${t}-${new Date().toISOString().slice(0,10)}-${Math.floor(Math.random()*100000)}`;
      const avd=TYPES[t]; const pre=$('#cg-prefill',wrap).checked;
      const meta={type:t,avds:avd,name:$('#cg-name',wrap).value||'',start:$('#cg-dt',wrap).value||'',createdAt:new Date().toISOString()};
      ensureHorses(meta);
      if(pre){ meta.horses = Array.from({length:avd},()=>{const o={}; for(let h=1;h<=12;h++) o[h]={name:'',driver:'',pct:''}; return o;}); }
      upsertGame({id,meta,coupons:[]});
      location.href=`index.html?game=${encodeURIComponent(id)}`;
    };
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-action="create-game"],#createGameBtn'); if(!btn) return;
    if(!location.search.includes('game=')){ e.preventDefault(); openCreateModal(); }
  },{capture:true});

  // ---------- GAME VIEW ----------
  function mountGame(){
    const id = ensureGameIdFromUrl(); if(!id) return;
    let g=getGame(id);
    if(!g){
      g=upsertGame({id, meta:{type:DEFAULT_TYPE,avds:6,createdAt:new Date().toISOString()}, coupons:[]});
    }
    g.meta = g.meta || {type:DEFAULT_TYPE,avds:6};
    g.meta.avds = g.meta.avds || TYPES[g.meta.type] || 6;
    ensureHorses(g.meta);
    upsertGame(g);

    const host=document.createElement('section'); host.id='trv-game';
    host.innerHTML=`
      <style>
        .ui{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#e5e7eb;margin:12px 0}
        .grid{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
        @media (min-width:1300px){.grid{grid-template-columns:repeat(3,1fr)}}
        @media (min-width:1650px){.grid{grid-template-columns:repeat(4,1fr)}}
        .card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px}
        .title{font-weight:800;margin-bottom:6px}
        .muted{opacity:.8;font-size:.9rem}
        .btn{background:#38bdf8;color:#001826;border:0;border-radius:10px;padding:.45rem .8rem;font-weight:700;cursor:pointer}
        .btn.ghost{background:#0b1220;color:#e5e7eb;border:1px solid #334155}
        .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        .a-card{margin:10px 0;padding:10px;border:1px solid #263142;border-radius:10px;background:#0b1220}
        .row3{display:grid;grid-template-columns:160px 1fr 46px;gap:10px;align-items:center;margin:8px 0}
        .num{width:36px;height:36px;border:3px solid #e5e7eb;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800}
        .mine{cursor:pointer;border-color:#94a3b8}
        .mine.on{background:#38bdf8;border-color:#38bdf8;color:#001926}
        .inp{background:#0b1220;border:1px solid #334155;border-radius:8px;padding:.45rem;color:#e5e7eb;width:100%}
        .small{font-size:.85rem;opacity:.9}
        .pop{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
        .pill{display:inline-block;padding:.15rem .45rem;border-radius:999px;background:#1f2937;margin:0 4px 4px 0}
        .sticky{position:sticky;bottom:0;background:#0e1422;border-top:1px solid #263142;padding:10px;border-radius:12px 12px 0 0;margin-top:10px}
        .sum{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
        @media (max-width:900px){.sum{grid-template-columns:repeat(3,1fr)}}
        textarea.t{width:100%;min-height:120px;background:#0b1220;border:1px solid #334155;border-radius:10px;color:#e5e7eb;padding:.6rem}
      </style>
      <div class="ui">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <a class="btn ghost" href="index.html">Till överblick</a>
          <button class="btn ghost" id="editGame">Redigera spelform</button>
        </div>
        <div class="grid" id="couponGrid"></div>
        <div class="card">
          <div class="title">Avdelning 1–${g.meta.avds}</div>
          <div id="divBox"></div>
          <div class="sticky">
            <div id="summary" class="sum"></div>
            <div class="row" style="justify-content:space-between;align-items:center">
              <div id="priceGuide" class="small"></div>
              <div style="text-align:right"><span id="price" style="font-weight:800">Pris: 0 kr</span></div>
            </div>
          </div>
        </div>
      </div>`;
    (document.querySelector('main')||document.body).appendChild(host);
    $('#editGame',host).onclick=()=>openCreateModal();

    // ----- Helpers -----
    const game = ()=>getGame(id);
    function couponUid(){ return 'c'+Math.random().toString(36).slice(2,9); }
    function addCoupon(name, rows){
      updateGame(id, p=>{
        const c={ uid:couponUid(), gameId:id, name:name||('Kupong '+(p.coupons?.length+1||1)), rows };
        return {...p, coupons:[...(p.coupons||[]), c]};
      });
      renderCoupons(); renderDivs();
    }
    function countsByAvd(){
      const list=(game()?.coupons||[]).filter(c=>c && c.gameId===id);
      const avd=game().meta.avds; const arr=Array.from({length:avd},()=>({}));
      list.forEach(c=>c.rows?.forEach(r=> r.horses.forEach(h=> arr[r.avd-1][h]=(arr[r.avd-1][h]||0)+1 )));
      return arr;
    }

    // ----- Importerade / OCR / Kalibrera / Populär -----
    function renderCoupons(){
      const grid=$('#couponGrid',host);
      const list=(game()?.coupons||[]).filter(c=>c && c.gameId===id);
      const rows=list.map(c=>{
        const lines=(c.rows||[]).sort((a,b)=>a.avd-b.avd).map(r=>`<div class="small">Avd ${r.avd}: ${r.horses.join(' ')}</div>`).join('');
        return `<div class="card"><div class="title">${c.name||'Kupong'}</div>${lines||'<div class="muted small">Tom</div>'}<div class="row"><button class="btn ghost" data-del="${c.uid}">Ta bort</button></div></div>`;
      });
      const ctl=`<div class="card">
        <div class="title">Importerade kuponger / OCR / Manuell</div>
        <div class="row"><input id="cName" type="text" placeholder="Kupongnamn (valfritt)" style="flex:1" class="inp"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btnMan">Lägg kupong manuellt</button>
          <button class="btn" id="btnOCR">Klistra in OCR-text</button>
          <button class="btn ghost" id="btnCal">Kalibrera OCR</button>
          <button class="btn" id="btnPopular">Skapa populär kupong</button>
        </div>
        <div id="extra"></div>
      </div>`;
      grid.innerHTML = ctl + rows.join('');
      grid.onclick=(e)=>{
        const del=e.target.closest('[data-del]'); if(del){ const uid=del.dataset.del; updateGame(id,p=>({...p,coupons:(p.coupons||[]).filter(x=>x.uid!==uid)})); renderCoupons(); renderDivs(); }
      };
      $('#btnMan',grid).onclick=()=>openManual();
      $('#btnOCR',grid).onclick=()=>openOCR();
      $('#btnCal',grid).onclick=()=>openCal();
      $('#btnPopular',grid).onclick=()=>createPopular();
    }
    function openManual(){
      const box=$('#extra',host); const avd=game().meta.avds;
      const inputs = Array.from({length:avd},(_,i)=>`<div class="row"><div class="muted">Avd ${i+1}</div><input class="inpMan inp" data-a="${i+1}" placeholder="t.ex. 1 4 6 7"></div>`).join('');
      box.innerHTML = `<div class="card" style="margin-top:10px"><div class="title">Manuell kupong</div>${inputs}<div class="row"><button class="btn" id="saveMan">Spara kupong</button><button class="btn ghost" id="cancelMan">Stäng</button></div></div>`;
      $('#cancelMan',box).onclick=()=>box.innerHTML='';
      $('#saveMan',box).onclick=()=>{
        const rows = $$('.inpMan',box).map(i=>({avd:+i.dataset.a, horses: (i.value||'').trim().split(/\s+/).filter(Boolean)})).filter(r=>r.horses.length);
        if(rows.length) addCoupon($('#cName')?.value || 'Manuell', rows);
        box.innerHTML='';
      };
    }
    function openOCR(){
      const box=$('#extra',host);
      box.innerHTML = `<div class="card" style="margin-top:10px">
        <div class="title">Klistra in OCR-text</div>
        <textarea id="ocrText" class="t" placeholder="Klistra in råtext... en rad per avdelning ex: '1: 2 4 6'"></textarea>
        <div class="row"><button class="btn" id="parseText">Läs text</button><button class="btn ghost" id="cancelO">Stäng</button></div>
      </div>`;
      $('#cancelO',box).onclick=()=>box.innerHTML='';
      $('#parseText',box).onclick=()=>{
        const src=$('#ocrText').value||'';
        const rows = src.split(/\r?\n/).map(line=>{
          const m=line.match(/^\s*([1-9])\s*:\s*([0-9\s]+)\s*$/);
          if(!m) return null;
          return { avd:+m[1], horses: m[2].trim().split(/\s+/).filter(Boolean) };
        }).filter(Boolean);
        if(rows.length) addCoupon($('#cName')?.value || 'OCR', rows);
        box.innerHTML='';
      };
    }
    function openCal(){
      const box=$('#extra',host);
      box.innerHTML = `<div class="card" style="margin-top:10px">
        <div class="title">Kalibrera OCR (förhandsvisning)</div>
        <div class="row"><input id="imgFile" type="file" accept="image/*" class="inp"><span class="small muted">(visar bara bilden – ingen OCR-motor körs)</span></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
          <div><img id="imgPrev" style="max-width:360px;border:1px solid #334155;border-radius:8px;display:none"/></div>
          <div style="flex:1;min-width:260px">
            <div class="small muted">Regex eller /regex/flagor</div>
            <input id="rx" class="inp" type="text" value="^\\s*([1-9])\\s*:\\s*([0-9\\s]+)\\s*$">
            <textarea id="rxSample" class="t" placeholder="Testa din OCR-råtext här..."></textarea>
            <div class="row"><button class="btn" id="testRx">Testa</button><button class="btn ghost" id="closeRx">Stäng</button></div>
            <div id="rxResult" class="small" style="margin-top:6px"></div>
          </div>
        </div>
      </div>`;
      $('#closeRx',box).onclick=()=>box.innerHTML='';
      $('#imgFile',box).onchange=(e)=>{
        const f=e.target.files?.[0]; if(!f) return;
        const url=URL.createObjectURL(f); const img=$('#imgPrev',box); img.src=url; img.style.display='block';
      };
      $('#testRx',box).onclick=()=>{
        let pat = ($('#rx').value||'').trim(), flags='', body=pat;
        const mm = pat.match(/^\/(.+)\/([gimsuy]*)$/); if(mm){ body=mm[1]; flags=mm[2]; }
        let re; try{ re=new RegExp(body,flags); }catch(e){ $('#rxResult',box).innerHTML='<span style="color:#fca5a5">Fel i regex: '+e.message+'</span>'; return; }
        const out=[]; ($('#rxSample').value||'').split(/\r?\n/).forEach(line=>{ const m=re.exec(line); if(m){ out.push({avd:+m[1],horses:(m[2]||'').trim().split(/\s+/).filter(Boolean)}); } });
        $('#rxResult',box).innerHTML = out.length? out.map(r=>`Avd ${r.avd}: ${r.horses.join(' ')}`).join('<br>') : '<i>Inget matchat</i>';
      };
    }
    function createPopular(){
      const avd=game().meta.avds; const cnt=countsByAvd();
      const rows = cnt.map((map,i)=>{
        const sorted=Object.entries(map).sort((a,b)=>b[1]-a[1] || (+a[0])-(+b[0])).map(([h])=>h);
        return {avd:i+1, horses:sorted.slice(0, Math.max(1, Math.min(sorted.length, 10)))};
      });
      addCoupon('Populär kupong', rows);
    }

    // ----- Avdelningsrender -----
    function renderDivs(){
      const avd=game().meta.avds; const box=$('#divBox',host);
      const popular = countsByAvd();
      box.innerHTML='';
      for(let a=1;a<=avd;a++){
        const pop = Object.entries(popular[a-1]).sort((x,y)=>y[1]-x[1] || (+x[0])-(+y[0])).slice(0,6).map(([h,c])=>`${h}(${c})`).join(' ');
        const head = `<div class="small">Populära: ${pop||'—'}</div>`;
        const rows=[];
        for(let h=1;h<=12;h++){
          const rec=((game().meta.horses?.[a-1]||{})[h])||{name:'',driver:'',pct:''};
          rows.push(`<div class="row3">
            <div>
              <div class="num">${h}</div>
              ${h===1?head:''}
            </div>
            <div>
              <input class="inp" data-a="${a}" data-h="${h}" data-k="name" placeholder="Hästnamn" value="${(rec.name||'').replace(/"/g,'&quot;')}">
              <input class="inp" data-a="${a}" data-h="${h}" data-k="driver" placeholder="Kusk" value="${(rec.driver||'').replace(/"/g,'&quot;')}">
            </div>
            <div style="text-align:right"><div class="num mine" data-a="${a}" data-h="${h}">${h}</div></div>
          </div>`);
        }
        const node=document.createElement('div'); node.className='a-card';
        node.innerHTML=`<div class="title">Avdelning ${a}</div>${rows.join('')}`;
        box.appendChild(node);
      }
      box.onclick=(e)=>{ const t=e.target.closest('.mine'); if(!t) return; t.classList.toggle('on'); updateSummary(); };
      box.addEventListener('input',e=>{
        const i=e.target.closest('.inp'); if(!i) return;
        updateGame(id, prev=>{
          const meta=ensureHorses(prev.meta||{type:DEFAULT_TYPE,avds:6});
          meta.horses[i.dataset.a-1][i.dataset.h] = meta.horses[i.dataset.a-1][i.dataset.h]||{name:'',driver:'',pct:''};
          meta.horses[i.dataset.a-1][i.dataset.h][i.dataset.k] = i.value;
          return {...prev, meta};
        });
      });
      updateSummary();
    }

    // ----- Pris + Guide -----
    function currentPickCounts(){
      const avd=game().meta.avds; const arr=[];
      for(let a=1;a<=avd;a++){ const n=$$(`.mine.on[data-a="${a}"]`,host).length; arr.push(n||0); }
      return arr;
    }
    function updateSummary(){
      const avd=game().meta.avds; const sum=$('#summary',host); const priceEl=$('#price',host);
      let price=1; sum.innerHTML='';
      for(let a=1;a<=avd;a++){
        const picked=$$(`.mine.on[data-a="${a}"]`,host).map(x=>+x.dataset.h).sort((x,y)=>x-y);
        const col=document.createElement('div');
        col.innerHTML=`<div class="small">Avd ${a}:</div><div>${picked.map(n=>`<span class="pill">${n}</span>`).join('')||'<span class="muted">—</span>'}</div>`;
        sum.appendChild(col); price*=Math.max(1,picked.length);
      }
      priceEl.textContent=`Pris: ${price} kr`;
      renderPriceGuide();
    }
    function renderPriceGuide(){
      const base = currentPickCounts(); // ex [1,3,2,0,0,1]
      const avd=game().meta.avds;
      const slots = base.map(v=>Math.max(1,v)); // 0 betyder 1 rad
      const MIN=50, MAX=400;
      const choices = Array.from({length:avd},(_,i)=>{
        const cur = slots[i];
        const list = []; for(let k=1;k<=12;k++) list.push(k);
        list.sort((a,b)=> Math.abs(a-cur)-Math.abs(b-cur));
        return list;
      });
      const uniq = new Set();
      const out = [];
      function dfs(i, mult, path){
        if(mult>MAX) return;
        if(i===avd){
          if(mult>=MIN && mult<=MAX){
            const key = path.slice().sort((a,b)=>a-b).join('x');
            if(!uniq.has(key)){ uniq.add(key); out.push([key, mult]); }
          }
          return;
        }
        for(const k of choices[i]){
          dfs(i+1, mult*k, path.concat(k));
          if(out.length>60) break;
        }
      }
      dfs(0,1,[]);
      out.sort((a,b)=>a[1]-b[1]);
      $('#priceGuide',host).innerHTML = out.length
        ? '<div class="small">Prisguide (50–400 kr):<br>'+ out.slice(0,36).map(([k,v])=>`${k} = <b>${v} kr</b>`).join(' • ') +'</div>'
        : '<span class="small muted">Prisguide: inga kombinationer 50–400 kr.</span>';
    }

    // init
    renderCoupons();
    renderDivs();
  }

  // boot
  document.addEventListener('DOMContentLoaded', ()=>{
    renderOverview();
    if(location.search.includes('game=')) mountGame();
  });
})();