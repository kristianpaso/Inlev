(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const GAMES_KEY='trav.games.v7';
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const ensure=a=>Array.isArray(a)?a:[ ];
const uid=()=>Date.now()+''+Math.floor(Math.random()*1e6);

function getGames(){return ensure(load(GAMES_KEY,[]))}
function setGames(L){save(GAMES_KEY,ensure(L))}
function getGame(id){return getGames().find(g=>g.id===id)}
function setGame(id, fn){ const L=getGames(); const i=L.findIndex(x=>x.id===id); if(i<0) return;
  L[i]=typeof fn==='function'?fn(L[i]):fn; setGames(L);
}

const normalize = (text)=> (text||'')
  .replace(/[Il]/g,'1').replace(/O/g,'0')
  .replace(/[•·\-–—]/g,' ').replace(/[,;]/g,' ')
  .replace(/\s+/g,' ').trim();

function splitRunsToNumbers(s){
  s=normalize(s);
  const runs=(s.match(/\d+/g)||[]);
  const out=[];
  for(const r of runs){
    let i=0;
    while(i<r.length){
      if(i+1<r.length){
        const two=parseInt(r.slice(i,i+2),10);
        if(two>=10 && two<=15){ out.push(two); i+=2; continue; }
      }
      out.push(parseInt(r[i],10)); i++;
    }
  }
  return out;
}

// ---------- Överblick
function renderOverview(){
  $('#title').textContent='Trav – Överblick'; 
  $('#view-overview').classList.remove('hidden'); 
  $('#view-game').classList.add('hidden');
  const host=$('#games'); host.innerHTML='';
  const L=getGames();
  if(!L.length){ host.innerHTML='<div class=mini>Inga spelsystem ännu. Klicka “Skapa spelsystem”.</div>'; return; }
  L.forEach(g=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML='<div class="row" style="justify-content:space-between"><div><b>'+g.name+
      '</b> <span class="pill">'+g.form+'</span> <span class="mini">('+g.divisions.length+' avd)</span></div>\
      <div class="row"><button class="btn" data-v="'+g.id+'">Överblick</button>\
      <button class="btn" data-e="'+g.id+'">Redigera</button>\
      <button class="btn danger" data-d="'+g.id+'">Ta bort</button></div></div>';
    host.appendChild(card);
    card.querySelector('[data-v]').onclick=()=>openGame(g.id);
    card.querySelector('[data-e]').onclick=()=>editGame(g.id);
    card.querySelector('[data-d]').onclick=()=>{ setGames(getGames().filter(x=>x.id!==g.id)); renderOverview(); };
  });
}
$('#btnNew').onclick=()=>openCreate();
$('#btnBack').onclick=renderOverview;

function openCreate(existing=null){
  const box=document.createElement('div'); box.className='card';
  Object.assign(box.style,{position:'fixed',top:'0',left:'0',right:'0',bottom:'0',margin:'auto',maxWidth:'980px',maxHeight:'92vh',overflow:'auto',zIndex:60});
  const form0=existing?.form||'V64';
  let header='<div class="row" style="justify-content:space-between;position:sticky;top:0;background:#0f172a;border-bottom:1px solid #223050;padding-bottom:6px">';
  header+='<input id="gname" class="name" placeholder="Spelnamn" style="width:260px" value="'+(existing?.name||'')+'">';
  header+='<div class="row"><select id="gform" class="name"><option'+(form0==='V64'?' selected':'')+'>V64</option><option'+(form0==='V65'?' selected':'')+'>V65</option><option'+(form0==='V75'?' selected':'')+'>V75</option><option'+(form0==='V85'?' selected':'')+'>V85</option><option'+(form0==='V86'?' selected':'')+'>V86</option></select>';
  header+='<button id="gsave" class="btn">'+(existing?'Uppdatera':'Skapa')+'</button><button id="gclose" class="btn secondary">Stäng</button></div></div>';
  box.innerHTML=header+'<div id="gcontent"></div>'; document.body.appendChild(box);
  const content=box.querySelector('#gcontent');

  function renderHorseFields(avd,n){ const host=box.querySelector('#hwrap-'+avd); let h=''; const form=box.querySelector('#gform')?.value||'V64';
    for(let i=1;i<=n;i++){
      const rec=(existing?.info?.[avd+'-'+i])||{};
      h+='<div class="row" style="margin:6px 0"><span class="pill">Häst '+i+'</span>\
      <input class="name" placeholder="Hästens namn" data-f="name" data-k="'+avd+'-'+i+'" style="width:220px" value="'+(rec.name||'')+'">\
      <input class="name" placeholder="Kusk" data-f="driver" data-k="'+avd+'-'+i+'" style="width:180px" value="'+(rec.driver||'')+'">\
      <input class="name" placeholder="'+form+' %" data-f="percent" data-k="'+avd+'-'+i+'" style="width:120px" value="'+(rec.percent||'')+'">\
      <input class="name" placeholder="Kommentar" data-f="note" data-k="'+avd+'-'+i+'" style="width:280px" value="'+(rec.note||'')+'"></div>';
    }
    host.innerHTML=h;
  }
  function draw(form){
    const divs={V64:6,V65:6,V75:7,V85:8,V86:8}[form]||6; let inner='';
    for(let a=1;a<=divs;a++){
      const prevCount = existing?.divisions?.find(d=>d.avd===a)?.horses?.length || 15;
      inner+='<div class="card" style="margin:8px 0"><div class="row"><b>AVD '+a+
        '</b><label class="mini">Antal hästar: <input type="number" min="1" max="15" value="'+prevCount+'" data-count="'+a+'" class="name" style="width:80px"></label></div>\
        <details style="margin:4px 0"><summary class="mini">Klistra in lista (Häst/Kusk/% – 3 rader per häst)</summary>\
        <textarea class="ta" data-paste="'+a+'" placeholder="1 Häst\nKusk\n62%\n2 Häst\nKusk\n0%\n..."></textarea>\
        <div class="row" style="margin-top:6px"><button class="btn secondary" data-pastebtn="'+a+'">Klistra in i AVD '+a+'</button></div>\
        </details><div id="hwrap-'+a+'"></div></div>';
    }
    content.innerHTML=inner;
    for(let a=1;a<=divs;a++){ const cnt=+content.querySelector('[data-count="'+a+'"]').value||15; renderHorseFields(a,cnt); }
    content.querySelectorAll('[data-count]').forEach(inp=>inp.onchange=()=>renderHorseFields(+inp.dataset.count, Math.max(1,Math.min(15,+inp.value||1))));
    content.querySelectorAll('[data-pastebtn]').forEach(btn=>btn.onclick=()=>{
      const avd=+btn.dataset.pastebtn; const ta=content.querySelector('[data-paste="'+avd+'"]');
      const data=parseHorseBlock(ta.value); const maxNum=Math.max(0,...Object.keys(data).map(n=>+n)); const countInput=content.querySelector('[data-count="'+avd+'"]');
      if(maxNum>(+countInput.value||15)){ countInput.value=maxNum; renderHorseFields(avd,maxNum); }
      Object.entries(data).forEach(([num,rec])=>{ ['name','driver','percent'].forEach(f=>{ const el=content.querySelector('[data-k="'+avd+'-'+num+'"][data-f="'+f+'"]'); if(el) el.value=rec[f]||''; }); });
    });
  }
  box.querySelector('#gform').onchange=e=>draw(e.target.value);
  box.querySelector('#gclose').onclick=()=>document.body.removeChild(box);
  box.querySelector('#gsave').onclick=()=>{
    const name=(box.querySelector('#gname').value||'').trim()||'Spel';
    const form=box.querySelector('#gform').value;
    const divs={V64:6,V65:6,V75:7,V85:8,V86:8}[form]||6; const divisions=[]; const info={};
    for(let a=1;a<=divs;a++){
      const count=+box.querySelector('[data-count="'+a+'"]').value||15;
      const horses=Array.from({length:count},(_,i)=>i+1); divisions.push({avd:a, horses});
      for(let h=1;h<=count;h++){ const rec={}; ['name','driver','percent','note'].forEach(f=>{ const el=box.querySelector('[data-k="'+a+'-'+h+'"][data-f="'+f+'"]'); rec[f]=el?el.value:'' }); info[a+'-'+h]=rec; }
    }
    const base={id:existing?.id||uid(), name, form, divisions, info, coupons:existing?.coupons||[], my:existing?.my||Array.from({length:divs},()=>[]), tags:existing?.tags||[]};
    const L=getGames(); const i=L.findIndex(x=>x.id===base.id); if(i<0) L.push(base); else L[i]=base; setGames(L); document.body.removeChild(box); renderOverview();
  };
  draw(form0);
}
function editGame(id){ const g=getGame(id); if(!g) return; openCreate(g); }
function parseHorseBlock(txt){
  const lines=(txt||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean); const out={}; let i=0;
  while(i<lines.length){
    const m=lines[i].match(/^(\d{1,2})\s+(.+)$/); if(!m){ i++; continue; }
    const num=+m[1]; const name=m[2].trim(); const driver=(lines[i+1]||'').trim();
    const pm=(lines[i+2]||'').match(/(\d{1,3})(?:[\.,](\d+))?%/); const percent=pm?(pm[1]+(pm[2]?','+pm[2]:'')):''; 
    out[num]={name,driver,percent}; i+=3;
  }
  return out;
}

// ---------- Spelets sida
function openGame(id){
  const g=getGame(id); if(!g) return renderOverview();
  $('#title').textContent=g.name+' – '+g.form; $('#view-overview').classList.add('hidden'); $('#view-game').classList.remove('hidden');
  $('#gameBadge').textContent=g.form+' · '+g.divisions.length+' AVD';
  $('#btnDeleteGame').onclick=()=>{ setGames(getGames().filter(x=>x.id!==id)); renderOverview(); };
  $('#btnEditGame').onclick=()=>editGame(id);

  const drivers = [...new Set(Object.values(g.info||{}).map(x=>x?.driver).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const sel = $('#driverTag'); sel.innerHTML = '<option value="">Kusk-tagg (välj)</option>'+drivers.map(d=>'<option>'+d+'</option>').join('');

  $('#btnScan').onclick=()=>scanCoupons(g);
  $('#btnManual').onclick=()=>manualCoupon(g);

  renderCoupons(g);
  renderAnalysis(g);
  renderMyCoupon(g);
}

function renderCoupons(g){
  const host=$('#couponList'); host.innerHTML='';
  if(!g.coupons?.length){ host.innerHTML='<div class=mini>Inga kuponger uppladdade ännu.</div>'; return; }
  g.coupons.forEach((c,idx)=>{
    const card=document.createElement('div'); card.className='card';
    let html='<div class="row" style="justify-content:space-between"><div><b>'+(c.name||('Kupong '+(idx+1)))+
      '</b></div><button class="btn danger" data-del="'+c.id+'">Ta bort</button></div><div class="hr"></div>';
    html+='<table><thead><tr><th>AVD</th><th>Hästar</th></tr></thead><tbody>';
    (c.rows||[]).forEach(r=>{ html+='<tr><td>'+r.avd+'</td><td>'+r.horses.join(" ")+'</td></tr>' });
    html+='</tbody></table>';
    card.innerHTML=html; host.appendChild(card);
    card.querySelector('[data-del]').onclick=()=>{ setGame(g.id, s=>({...s, coupons:s.coupons.filter(x=>x.id!==c.id)})); openGame(g.id); };
  });
}

async function scanCoupons(g){
  const files=$('#couponFiles').files; if(!files?.length){ alert('Välj en eller flera bilder.'); return; }
  qs('#scanStatus').textContent='Laddar OCR...';
  const worker=await Tesseract.createWorker();
  const newCoupons=[];
  for(const f of files){
    qs('#scanStatus').textContent='Läser '+f.name+'...';
    const {data:{text}}=await worker.recognize(f);
    const rows=parseCouponText(text,g.divisions.length);
    newCoupons.push({id:uid(), name:(qs('#couponName').value||'').trim(), rows});
  }
  await worker.terminate();
  qs('#scanStatus').textContent='Klart.';
  setGame(g.id, s=>({...s, coupons:[...(s.coupons||[]), ...newCoupons]}));
  openGame(g.id);
}
function normalizeText(t){return (t||'').replace(/\r/g,'\n')}
function parseCouponText(txt, avdCount){
  txt = normalizeText(txt);
  const lines = txt.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const rows=[];
  for(const ln of lines){
    const m=ln.match(/^(\d{1,2})\s+([0-9\s]+)/); 
    if(m){
      const avd=+m[1]; if(avd<1||avd>avdCount) continue;
      const horses = splitRunsToNumbers(m[2]);
      if(horses.length) rows.push({avd,horses:[...new Set(horses)].sort((a,b)=>a-b)});
    }
  }
  const seen=new Set(); const out=[];
  for(const r of rows){ if(!seen.has(r.avd)){ seen.add(r.avd); out.push(r); } }
  return out.sort((a,b)=>a.avd-b.avd);
}
function manualCoupon(g){
  const avd=g.divisions.length; const rows=[];
  for(let a=1;a<=avd;a++){ const input=prompt('AVD '+a+': ange hästar separerade med mellanslag (t.ex. \"1 4 5 6 8 11 12\")',''); if(input===null) return; rows.push({avd:a, horses:splitRunsToNumbers(input)}) }
  setGame(g.id, s=>({...s, coupons:[...(s.coupons||[]), {id:uid(), name:'Manuell', rows}]})); openGame(g.id);
}

function buildPopularity(g){
  const map={}; for(const d of g.divisions){ map[d.avd]=Object.fromEntries(d.horses.map(h=>[h,0])) }
  (g.coupons||[]).forEach(c=>{ (c.rows||[]).forEach(r=>{ (r.horses||[]).forEach(h=>{ if(map[r.avd]&&map[r.avd][h]!=null) map[r.avd][h]++ }) }) })
  return map;
}
function renderAnalysis(g){
  const pop = buildPopularity(g);
  const popularSelections = g.divisions.map(div=>{
    const counts = pop[div.avd]; const max = Math.max(0,...Object.values(counts));
    const best = Object.entries(counts).filter(([,c])=>c===max && c>0).map(([h])=>+h);
    return {avd:div.avd, best, counts};
  });
  drawCouponGrid('popularCoupon', g, popularSelections, {showPopularity:true});
  $('#btnFillPopular').onclick=()=>{
    setGame(g.id, s=>({...s, my: popularSelections.map(x=>x.best.slice()) }));
    renderMyCoupon(getGame(g.id));
  };
}

function renderMyCoupon(g){
  const my = g.my && g.my.length===g.divisions.length ? g.my : Array.from({length:g.divisions.length},()=>[]);
  setGame(g.id, s=>({...s, my}));
  const host = $('#myCoupon'); host.innerHTML='';
  const pop = buildPopularity(g);
  const driversByKey = g.info||{};

  const tagColor = $('#tagColor').value||'#9b87f5';
  const activeTag = $('#driverTag').value||'';
  $('#btnAddTag').onclick=()=>{ if(!activeTag) return; setGame(g.id, s=>({...s, tags:[...new Set([...(s.tags||[]), activeTag])]})); renderMyCoupon(getGame(g.id)); };
  $('#tagPopular').onchange=()=>renderMyCoupon(getGame(g.id));

  const tags = [...new Set(g.tags||[])]; $('#tagList').textContent = tags.length ? 'Aktiva kusk-taggar: '+tags.join(', ') : 'Inga aktiva kusk-taggar.';

  let total=1; g.divisions.forEach((div,idx)=>{ total*=Math.max(1,(my[idx]||[]).length||1) }); $('#price').textContent='Pris: '+total+' kr';

  const opts = {activeTag, tagColor, popMap:pop, showPopularity: $('#tagPopular').checked, driversByKey};
  drawCouponGrid('myCoupon', g, g.divisions.map((div,idx)=>({avd:div.avd, best:my[idx]})), opts, (avd,horse)=>{
    const cur = new Set(my[avd-1]||[]); if(cur.has(horse)) cur.delete(horse); else cur.add(horse);
    my[avd-1]=[...cur].sort((a,b)=>a-b); setGame(g.id, s=>({...s, my})); renderMyCoupon(getGame(g.id));
  });
}

function drawCouponGrid(containerId, g, selections, opts={}, onToggle){
  const root = $('#'+containerId); root.innerHTML='';
  const grid = document.createElement('div'); grid.className='grid'; root.appendChild(grid);
  selections.forEach(sel=>{
    const div = g.divisions.find(d=>d.avd===sel.avd);
    const card = document.createElement('div'); card.className='card'; grid.appendChild(card);
    card.innerHTML='<div class="row" style="justify-content:space-between"><b>AVD '+sel.avd+'</b></div>';
    const wrap = document.createElement('div'); wrap.className='chkgrid'; card.appendChild(wrap);
    const chosen = new Set(sel.best||[]);
    div.horses.forEach(h=>{
      const key=sel.avd+'-'+h; const info=g.info?.[key]||{};
      const meta = [info.name, info.driver, info.percent].filter(Boolean).join(' • ');
      const cell=document.createElement('div'); cell.className='cell'+(chosen.has(h)?' on':'');
      const count = opts.popMap?.[sel.avd]?.[h]||0;
      const isPopular = opts.showPopularity && count && count===Math.max(0,...Object.values(opts.popMap?.[sel.avd]||{}));
      const never = (opts.popMap && (opts.popMap[sel.avd]?.[h]||0)===0);
      if(isPopular) cell.classList.add('pop');
      if(never && containerId==='popularCoupon') cell.classList.add('none');
      const driver=info.driver||'';
      if(opts.activeTag && driver===opts.activeTag) {cell.classList.add('tagged'); cell.style.setProperty('--tag', opts.tagColor||'#9b87f5');}
      if((g.tags||[]).includes(driver)) {cell.classList.add('tagged'); cell.style.setProperty('--tag', opts.tagColor||'#9b87f5');}
      cell.innerHTML = '<span class="num">'+h+'</span><div class="meta">'+(meta||'&nbsp;')+'</div>'+ (count?'<span class="badge">'+count+'</span>':'');
      if(onToggle) cell.onclick=()=>onToggle(sel.avd,h);
      wrap.appendChild(cell);
    });
  });
}

renderOverview();
})();


// ===== OCR Calibration & Manual Modal Additions =====
function getOcrRules(){ try{ return JSON.parse(localStorage.getItem('ocrRules')||'{}'); }catch(e){ return {}; } }
const IMG_RULES_KEY='ocrImageRules';
function getImgRules(){ try{ return JSON.parse(localStorage.getItem(IMG_RULES_KEY)||'{}'); }catch(e){ return {}; } }
function setImgRules(r){ localStorage.setItem(IMG_RULES_KEY, JSON.stringify(r||{})); }
let __calib={img:null, w:0, h:0, avd:[50,120], horses:[150,450], reserv:[480,560], yTop:250, rowH:32, rows:6, norm:{O:false,I:false,P:false}};

function switchCalibTab(which){
  const tImg=document.querySelector('#ocrTabImg'); const tText=document.querySelector('#ocrTabText');
  if(!tImg||!tText) return; if(which==='img'){tImg.style.display='block';tText.style.display='none';}else{tImg.style.display='none';tText.style.display='block';}
}
document.addEventListener('click',(e)=>{
  if(e.target&&e.target.id==='tabImg') switchCalibTab('img');
  if(e.target&&e.target.id==='tabText') switchCalibTab('text');
},true);

function setInputsFromState(){ const v=(id,val)=>{const el=document.querySelector('#'+id); if(el) el.value=val;};
  v('xAvd1',Math.round(__calib.avd[0])); v('xAvd2',Math.round(__calib.avd[1]));
  v('xH1',Math.round(__calib.horses[0])); v('xH2',Math.round(__calib.horses[1]));
  v('xR1',Math.round(__calib.reserv[0])); v('xR2',Math.round(__calib.reserv[1]));
  v('yTop',Math.round(__calib.yTop)); v('rowH',Math.round(__calib.rowH)); v('rowsN',Math.round(__calib.rows));
}
function updateStateFromInputs(){ const g=(id)=>parseFloat(document.querySelector('#'+id)?.value||'')||0;
  __calib.avd=[g('xAvd1'),g('xAvd2')]; __calib.horses=[g('xH1'),g('xH2')]; __calib.reserv=[g('xR1'),g('xR2')]; __calib.yTop=g('yTop'); __calib.rowH=g('rowH'); __calib.rows=Math.max(1,Math.round(g('rowsN'))||6);
}
function drawCalib(){ const c=document.querySelector('#calibCanvas'); if(!c) return; const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); if(__calib.img){ctx.drawImage(__calib.img,0,0,__calib.w,__calib.h);} ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2; ctx.strokeRect(10,__calib.yTop,__calib.w-20,__calib.rowH*__calib.rows); ctx.fillStyle='rgba(59,130,246,0.35)'; ctx.fillRect(__calib.avd[0],__calib.yTop,(__calib.avd[1]-__calib.avd[0]),__calib.rowH*__calib.rows); ctx.fillStyle='rgba(34,197,94,0.35)'; ctx.fillRect(__calib.horses[0],__calib.yTop,(__calib.horses[1]-__calib.horses[0]),__calib.rowH*__calib.rows); ctx.fillStyle='rgba(148,163,184,0.30)'; ctx.fillRect(__calib.reserv[0],__calib.yTop,(__calib.reserv[1]-__calib.reserv[0]),__calib.rowH*__calib.rows); }
function loadImageToCanvas(file){ const fr=new FileReader(); fr.onload=()=>{ const img=new Image(); img.onload=()=>{ const c=document.querySelector('#calibCanvas'); const scale=Math.min(1,700/img.width); c.width=Math.floor(img.width*scale); c.height=Math.floor(img.height*scale); __calib.img=img; __calib.w=c.width; __calib.h=c.height; if(!__calib.rowH) __calib.rowH=Math.floor(c.height/12); if(!__calib.rows) __calib.rows=6; if(!__calib.avd) __calib.avd=[Math.floor(c.width*0.06),Math.floor(c.width*0.12)]; if(!__calib.horses) __calib.horses=[Math.floor(c.width*0.20),Math.floor(c.width*0.72)]; if(!__calib.reserv) __calib.reserv=[Math.floor(c.width*0.78),Math.floor(c.width*0.93)]; setInputsFromState(); drawCalib(); }; img.src=fr.result; }; fr.readAsDataURL(file); }
document.addEventListener('change',(e)=>{ if(e.target&&e.target.id==='imgPick'){ const files=Array.from(e.target.files||[]); if(files.length) loadImageToCanvas(files[0]); }},true);
document.addEventListener('click',(e)=>{ if(e.target&&e.target.id==='btnCalib'){ const m=document.querySelector('#ocrCalibModal'); if(m) m.classList.remove('hidden'); const files=document.querySelector('#couponFiles')?.files; if(files&&files.length) loadImageToCanvas(files[0]); else switchCalibTab('img'); document.querySelector('#ocrClose').onclick=()=>m.classList.add('hidden'); document.querySelector('#ocrSave').onclick=()=>{ updateStateFromInputs(); const gid=qs('#gameId')?.value; const g=gid?getGame(gid):null; const scope=g?.form||'V64'; const all=getImgRules(); all[scope]={...__calib}; setImgRules(all); alert('Mall sparad för '+scope); }; document.querySelector('#ocrTest').onclick=async ()=>{ updateStateFromInputs(); const res=await runImageOcr(__calib); qs('#ocrResult').textContent=res.map(r=>`AVD ${r.avd}: ${r.horses.join(' ')}`).join('\\n')||'(Inget matchat)'; }; }},true);
async function runImageOcr(state){ const worker=await Tesseract.createWorker(); const out=[]; const scale=state.scale||1; for(let i=0;i<state.rows;i++){ const y=Math.round((state.yTop+i*state.rowH)/scale); const h=Math.round(state.rowH/scale); const a=await ocrCrop(state.img,Math.round(state.avd[0]/scale),y,Math.round((state.avd[1]-state.avd[0])/scale),h,worker); const htxt=await ocrCrop(state.img,Math.round(state.horses[0]/scale),y,Math.round((state.horses[1]-state.horses[0])/scale),h,worker); const avdNum=parseInt(((a.text||'').match(/\\d+/)||[''])[0],10); const hs=((htxt.text||'').match(/\\d+/g)||[]).map(x=>parseInt(x,10)).filter(n=>!isNaN(n)); if(!isNaN(avdNum)&&hs.length) out.push({avd:avdNum, horses:[...new Set(hs)].sort((a,b)=>a-b)}); } await worker.terminate(); const seen=new Set(),tidy=[]; for(const r of out){ if(!seen.has(r.avd)){ seen.add(r.avd); tidy.push(r);} } return tidy.sort((a,b)=>a.avd-b.avd); }
async function ocrCrop(img,sx,sy,sw,sh,worker){ const c=document.createElement('canvas'); const ctx=c.getContext('2d'); c.width=sw; c.height=sh; ctx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh); const {data:{text}}=await worker.recognize(c.toDataURL()); return {text}; }
// Guarded overrides
(function(){
// ---- tiny DOM helpers (no jQuery) ----
window.qs  = (sel, root=document) => root.querySelector(sel);
window.qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
if (!window.$) window.$ = (sel) => document.querySelector(sel);
 try{ if(typeof parseCouponText==='function'){ const __orig=parseCouponText; parseCouponText=function(txt,avdCount){ try{ const gid=qs('#gameId')?.value; if(gid){ const g=getGame(gid); const r=(getOcrRules()||{})[g?.form]; if(r){ const lineRegex=new RegExp(r.lineRegex||'^(?:AVD\\s*)?(\\d{1,2})[^\\d]*(?:-|:)?\\s*([0-9\\s]+)$','i'); const mode=r.horseMode||'runs'; if(r.avdOverride){ const n=parseInt(r.avdOverride,10); if(n>0) avdCount=n; } const rows=[]; for(const ln of normalizeText(txt).split(/\\n/).map(x=>x.trim()).filter(Boolean)){ const m=ln.match(lineRegex); if(m){ const avd=+m[1]; if(avd<1||avd>avdCount) continue; const hs=(mode==='spaces')?(m[2].trim().split(/\\s+/).map(x=>parseInt(x,10)).filter(n=>!isNaN(n))):splitRunsToNumbers(m[2]); if(hs.length) rows.push({avd,horses:[...new Set(hs)].sort((a,b)=>a-b)}); } } const seen=new Set(),o=[]; for(const r of rows){ if(!seen.has(r.avd)){ seen.add(r.avd); o.push(r);} } return o.sort((a,b)=>a.avd-b.avd); } } }catch(e){} return __orig(txt,avdCount); }; } if(typeof scanCoupons==='function'){ const __origScan=scanCoupons; scanCoupons=async function(g){ const rules=(getImgRules()[g?.form]||null); const files=$('#couponFiles')?.files; if(!rules) return __origScan(g); if(!files?.length){ alert('Välj en eller flera bilder.'); return; } const newCoupons=[]; for(const f of files){ await new Promise(res=>{ const img=new Image(); const fr=new FileReader(); fr.onload=()=>{ img.onload=async ()=>{ const state={...rules,img,scale:1}; const rows=await runImageOcr(state); newCoupons.push({id:uid(), name:(qs('#couponName').value||'').trim(), rows}); res(); }; img.src=fr.result; }; fr.readAsDataURL(f); }); } setGame(g.id,s=>({...s, coupons:[...(s.coupons||[]), ...newCoupons]})); openGame(g.id); }; } }catch(e){} })();

// Manual modal
function openManualModal(g){ const m=qs('#manualModal'); if(!m) return; m.classList.remove('hidden'); const host=qs('#manualRows'); host.innerHTML=''; const count=(g?.divisions?.length)||6; for(let i=1;i<=count;i++){ const lbl=document.createElement('div'); lbl.textContent='AVD '+i; lbl.className='mini'; const inp=document.createElement('input'); inp.className='name'; inp.placeholder='t.ex. 1 2 5 10-12'; inp.dataset.avd=i; inp.addEventListener('input',manualPreview); host.appendChild(lbl); host.appendChild(inp);} $('#manualClose').onclick=()=>m.classList.add('hidden'); $('#manualSave').onclick=()=>{ const name=(qs('#manualName')?.value||'').trim(); const inputs=[...host.querySelectorAll('input')]; const rows=[]; inputs.forEach(inp=>{ const avd=+inp.dataset.avd; const hs=splitRunsToNumbers(inp.value||''); if(hs.length) rows.push({avd, horses:[...new Set(hs)].sort((a,b)=>a-b)}); }); if(!rows.length){ alert('Fyll i minst en avdelning.'); return; } const gid=qs('#gameId')?.value; const game=gid?getGame(gid):g; const coupon={id:uid(), name, rows}; setGame(game.id,s=>({...s, coupons:[...(s.coupons||[]), coupon]})); openGame(game.id); m.classList.add('hidden'); }; manualPreview(); }
function manualPreview(){ const host=qs('#manualRows'); const out=qs('#manualPreview'); if(!host||!out) return; const rows=[]; host.querySelectorAll('input').forEach(inp=>{ const avd=+inp.dataset.avd; const hs=splitRunsToNumbers(inp.value||''); if(hs.length) rows.push({avd, horses:[...new Set(hs)].sort((a,b)=>a-b)}); }); out.textContent=rows.map(r=>`AVD ${r.avd}: ${r.horses.join(' ')}`).join('\\n')||'(ingen data)'; }
document.addEventListener('click',(e)=>{ if(e.target&&e.target.id==='btnManual'){ const gid=qs('#gameId')?.value; const g=gid?getGame(gid):null; openManualModal(g);} },true);



// ---- Robust OCR horses parser + improved runImageOcr (appended) ----
function parseOcrHorses(raw, normFlags){
  let t = raw || '';
  if(normFlags && normFlags.O) t = t.replace(/[OØ]/g, '0');
  if(normFlags && normFlags.I) t = t.replace(/[Il]/g, '1');
  t = t.replace(/[.,]/g, ' ').replace(/[–—]/g, '-');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/\b1[\s]*([0-5])\b/g, '1$1'); // 1 3 -> 13
  t = t.replace(/(^|\D)0($|\D)/g, ' '); // drop lone zeros
  let out = [];
  const rangeRe = /(\d+)\s*-\s*(\d+)/g;
  t = t.replace(rangeRe, (m,a,b)=>{
    let s=parseInt(a,10), e=parseInt(b,10);
    if(!isNaN(s)&&!isNaN(e)&&e>=s){
      for(let n=s;n<=e;n++){ if(n>=1&&n<=15) out.push(n); }
    }
    return ' ';
  });
  (t.match(/\d+/g)||[]).forEach(x=>{ const n=parseInt(x,10); if(n>=1&&n<=15) out.push(n); });
  out = [...new Set(out)].sort((a,b)=>a-b);
  return out;
}

const __runImageOcr_prev = typeof runImageOcr==='function' ? runImageOcr : null;
async function runImageOcr(state){
  const scale = state.scale||1;
  const img = state.img;
  const out=[];
  const worker = await Tesseract.createWorker();
  const pad = Math.max(2, Math.round((state.rowH||24) * 0.18));
  const normFlags = state.norm||{};
  const normText=(t)=>{
    let s=t||'';
    if(normFlags.O) s=s.replace(/[OØ]/g,'0');
    if(normFlags.I) s=s.replace(/[Il]/g,'1');
    if(normFlags.P) s=s.replace(/[.,]/g,' ');
    return s;
  }

  for(let i=0;i<state.rows;i++){
    const y = Math.round((state.yTop + i*state.rowH)/scale);
    const h = Math.round((state.rowH + 2*pad)/scale);
    const yCrop = Math.max(0, y - Math.round(pad/scale));

    const avdRes = await ocrCrop(img, Math.round(state.avd[0]/scale), yCrop,
        Math.round((state.avd[1]-state.avd[0])/scale), h, worker);
    const avdStr = normText(avdRes.text||'');
    const avdMatch = (avdStr.match(/\d{1,2}/)||[''])[0];
    const avdNum = parseInt(avdMatch,10);

    const horsesRes = await ocrCrop(img, Math.round(state.horses[0]/scale), yCrop,
        Math.round((state.horses[1]-state.horses[0])/scale), h, worker);
    const horses = parseOcrHorses(normText(horsesRes.text||''), normFlags);

    if(!isNaN(avdNum) && horses.length){
      out.push({avd:avdNum, horses:[...new Set(horses)].sort((a,b)=>a-b)});
    }
  }
  await worker.terminate();
  const seen=new Set(); const tidy=[];
  for(const r of out){ if(!seen.has(r.avd)){ seen.add(r.avd); tidy.push(r);} }
  return tidy.sort((a,b)=>a.avd-b.avd);
}


// ===== Late hook: ensure our OCR rules are actually used when scanning =====
(function ensureImageRulesHook(){
  let hooked = false;
  const tryHook = ()=>{
    if(hooked) return;
    if (typeof scanCoupons === 'function') {
      hooked = true;
      const __scanCoupons_orig = scanCoupons;
      scanCoupons = async function(g){
        try{
          const scope = (g && g.form) ? g.form : 'V64';
          const imgRulesAll = (function(){ try { return JSON.parse(localStorage.getItem('ocrImageRules')||'{}'); } catch(e){ return {}; }})();
          const rules = imgRulesAll[scope] || null;
          const files = (document.querySelector('#couponFiles')||{}).files;
          if(rules && files && files.length){
            const newCoupons = [];
            const name = (document.querySelector('#couponName')?.value||'').trim();
            const statusEl = document.querySelector('#scanStatus');
            if(statusEl) statusEl.textContent = 'Läser kuponger (bild‑OCR)...';
            for (const f of files){
              await new Promise(res=>{
                const img = new Image();
                const fr = new FileReader();
                fr.onload = ()=>{ img.onload = async ()=>{
                    const state = {...rules, img, scale: Math.min(1, 700/img.width)};
                    const rows = await runImageOcr(state);
                    newCoupons.push({id:uid(), name, rows});
                    res();
                  }; img.src = fr.result; };
                fr.readAsDataURL(f);
              });
            }
            if(statusEl) statusEl.textContent = 'Klart.';
            setGame(g.id, s=>({...s, coupons:[...(s.coupons||[]), ...newCoupons]}));
            openGame(g.id);
            return;
          }
        }catch(e){ /* fall back to original */ }
        return __scanCoupons_orig(g);
      };
    }
    if (typeof parseCouponText === 'function') {
      if (!parseCouponText.__patchedByImg) {
        const __parseCouponText_orig = parseCouponText;
        parseCouponText = function(txt, avdCount){
          try{
            const gidEl = document.querySelector('#gameId');
            const gid = gidEl ? gidEl.value : null;
            if(gid){
              const g = getGame(gid);
              const rules = (function(){ try { return JSON.parse(localStorage.getItem('ocrRules')||'{}'); } catch(e){ return {}; }})()[g && g.form];
              if(rules){
                const lineRegex = new RegExp(rules.lineRegex || '^(?:AVD\\s*)?(\\d{1,2})[^\\d]*(?:-|:)?\\s*([0-9\\s]+)$', 'i');
                const horseMode = rules.horseMode || 'runs';
                if(rules.avdOverride){ const n = parseInt(rules.avdOverride,10); if(n>0) avdCount=n; }
                const lines = (txt||'').replace(/\\r/g,'\\n').split(/\\n/).map(x=>x.trim()).filter(Boolean);
                const out=[]; const seen=new Set();
                for(const ln of lines){
                  const m = ln.match(lineRegex);
                  if(m){
                    const avd = +m[1];
                    if(avd>=1 && avd<=avdCount){
                      const horses = (horseMode==='spaces')
                        ? (m[2].trim().split(/\\s+/).map(x=>parseInt(x,10)).filter(n=>!isNaN(n)))
                        : splitRunsToNumbers(m[2]);
                      if(horses.length && !seen.has(avd)){
                        seen.add(avd); out.push({avd, horses:[...new Set(horses)].sort((a,b)=>a-b)});
                      }
                    }
                  }
                }
                return out.sort((a,b)=>a.avd-b.avd);
              }
            }
          }catch(e){}
          return __parseCouponText_orig(txt, avdCount);
        };
        parseCouponText.__patchedByImg = true;
      }
    }
  };
  const id = setInterval(()=>{
    tryHook();
    if (hooked && typeof parseCouponText==='function') clearInterval(id);
  }, 60);
  if (document.readyState==='complete' || document.readyState==='interactive'){ setTimeout(tryHook, 0); }
  else document.addEventListener('DOMContentLoaded', tryHook);
})();

// ===== Prefill inputs from saved rules on open =====
(function bindCalibOpen(){
  function getScope(){ try { const gid = document.querySelector('#gameId')?.value; return gid ? (getGame(gid)?.form || 'V64') : 'V64'; } catch(e){ return 'V64'; } }
  function openAndPrefill(){
    const scope = getScope();
    const rulesAll = (function(){ try { return JSON.parse(localStorage.getItem('ocrImageRules')||'{}'); } catch(e){ return {}; }})();
    const r = rulesAll[scope];
    if(r){
      window.__calib = Object.assign(window.__calib||{}, r);
      const val=(id,v)=>{ const el=document.getElementById(id); if(el) el.value = Math.round(v); };
      val('xAvd1', r.avd?.[0]); val('xAvd2', r.avd?.[1]);
      val('xH1', r.horses?.[0]); val('xH2', r.horses?.[1]);
      val('xR1', r.reserv?.[0]); val('xR2', r.reserv?.[1]);
      val('yTop', r.yTop); val('rowH', r.rowH); val('rowsN', r.rows);
    }
  }
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='btnCalib'){ setTimeout(openAndPrefill, 30); }
  }, true);
})();

// === Defaults for calibration if nothing saved ===
(function ensureCalibDefaults(){
  const DEF = { avd:[0,30], horses:[45,220], reserv:[480,560], yTop:220, rowH:32, rows:6, norm:{O:false,I:false,P:false} };
  window.__calib = Object.assign(DEF, window.__calib||{});
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='btnCalib'){
      setTimeout(()=>{
        const setVal=(id,v)=>{ const el=document.getElementById(id); if(el) el.value = (v!=null? Math.round(v):''); };
        setVal('xAvd1', __calib.avd[0]); setVal('xAvd2', __calib.avd[1]);
        setVal('xH1', __calib.horses[0]); setVal('xH2', __calib.horses[1]);
        setVal('yTop', __calib.yTop); setVal('rowH', __calib.rowH); setVal('rowsN', __calib.rows);
        if(__calib.img && __calib.w){ drawCalib(); }
      }, 30);
    }
  }, true);
})();
// === Helper: draw parsed labels next to each row ===
function drawRowLabels(rows){
  const canvas = document.getElementById('calibCanvas'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#a7f3d0';
  if(!Array.isArray(rows)) return;
  rows.forEach((r,i)=>{
    const y = __calib.yTop + i*__calib.rowH + 12;
    const label = (r && r.parsed && r.parsed.horses && r.parsed.horses.length) ? r.parsed.horses.join(' ') : '';
    ctx.fillText(label, __calib.horses[1] + 6, y);
  });
}
// === Preprocess with canvas filter ===
function ocrCropWithPreprocess(img, sx, sy, sw, sh, worker){
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  c.width = sw; c.height = sh;
  ctx.filter = 'contrast(160%) brightness(110%)';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.filter = 'none';
  return worker.recognize(c.toDataURL()).then(res=>({text: (res.data && res.data.text) || ''}));
}
// === Detailed OCR ===
async function runImageOcrDetailed(state){
  const scale = state.scale||1;
  const img = state.img;
  const out=[];
  const worker = await Tesseract.createWorker();
  const pad = Math.max(2, Math.round((state.rowH||24) * 0.18));
  const normFlags = state.norm||{};
  const normText=(t)=>{
    let s=t||'';
    if(normFlags.O) s=s.replace(/[OØ]/g,'0');
    if(normFlags.I) s=s.replace(/[Il]/g,'1');
    if(normFlags.P) s=s.replace(/[.,]/g,' ');
    return s;
  }
  for(let i=0;i<state.rows;i++){
    const y = Math.round((state.yTop + i*state.rowH)/scale);
    const h = Math.round((state.rowH + 2*pad)/scale);
    const yCrop = Math.max(0, y - Math.round(pad/scale));
    const avdRes = await ocrCropWithPreprocess(img, Math.round(state.avd[0]/scale), yCrop,
        Math.round((state.avd[1]-state.avd[0])/scale), h, worker);
    const horsesRes = await ocrCropWithPreprocess(img, Math.round(state.horses[0]/scale), yCrop,
        Math.round((state.horses[1]-state.horses[0])/scale), h, worker);
    const avdStr = normText(avdRes.text||''); const horsesStr = normText(horsesRes.text||'');
    const avdMatch = (avdStr.match(/\d{1,2}/)||[''])[0]; const avdNum = parseInt(avdMatch,10);
    const horses = (typeof parseOcrHorses==='function') ? parseOcrHorses(horsesStr, normFlags) : ((horsesStr.match(/\d+/g)||[]).map(x=>+x));
    const row = { index:i+1, raw:{avd:avdStr, horses:horsesStr}, parsed:{ avd: avdNum, horses } };
    out.push(row);
  }
  await worker.terminate();
  const rows=[]; const seen=new Set();
  out.forEach(r=>{ if(!isNaN(r.parsed.avd) && r.parsed.horses.length && !seen.has(r.parsed.avd)){ seen.add(r.parsed.avd); rows.push({avd:r.parsed.avd, horses:[...new Set(r.parsed.horses)].sort((a,b)=>a-b)});} });
  return {debug:out, rows: rows.sort((a,b)=>a.avd-b.avd)};
}


// --- Force default calibration values on modal open ---
(function(){
  const DEF = { avd:[0,30], horses:[45,220], yTop:220, rowH:32, rows:6 };
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='btnCalib'){
      setTimeout(()=>{
        window.__calib = Object.assign({}, DEF, window.__calib||{});
        const setV=(id,v)=>{ const el=document.getElementById(id); if(el) el.value = v; };
        setV('xAvd1', DEF.avd[0]); setV('xAvd2', DEF.avd[1]);
        setV('xH1', DEF.horses[0]); setV('xH2', DEF.horses[1]);
        setV('yTop', DEF.yTop); setV('rowH', DEF.rowH); setV('rowsN', DEF.rows);
        if(typeof drawCalib==='function') drawCalib();
      }, 30);
    }
  }, true);
})();



// --- Replace 'Testa regler' to print raw OCR per rad ---
(function(){
  function ensure(){
    const btn = document.querySelector('#ocrTest');
    if(!btn || btn.__patched) return;
    btn.__patched = true;
    btn.onclick = async () => {
      const read=(id)=>parseFloat(document.getElementById(id)?.value||'')||0;
      const st = window.__calib || (window.__calib = {});
      st.avd=[read('xAvd1'), read('xAvd2')];
      st.horses=[read('xH1'), read('xH2')];
      st.yTop=read('yTop'); st.rowH=read('rowH'); st.rows=Math.max(1,read('rowsN')||6);
      if(typeof runImageOcrDetailed!=='function'){ alert('runImageOcrDetailed saknas'); return; }
      const out = await runImageOcrDetailed(st);
      const lines = out.debug.map(r=>`Rad ${r.index} | AVD(txt:"${(r.raw.avd||'').trim()}") -> ${isNaN(r.parsed.avd)?'?':r.parsed.avd} | H(txt:"${(r.raw.horses||'').trim()}") -> ${r.parsed.horses.join(' ')}`);
      const res = document.getElementById('ocrResult'); if(res) res.textContent = lines.join('\\n') || '(Inget matchat)';
      if(typeof drawCalib==='function' && typeof drawRowLabels==='function'){ drawCalib(); drawRowLabels(out.debug); }
    };
  }
  document.addEventListener('click', (e)=>{ if(e.target && e.target.id==='btnCalib'){ setTimeout(ensure, 50); } }, true);
  if(document.readyState==='complete' || document.readyState==='interactive'){ setTimeout(ensure,200); }
  else document.addEventListener('DOMContentLoaded', ()=>setTimeout(ensure,200));
})();

// ===== Manual Coupon Modal (all divisions) =====
function openManualModal(g){
  const m = qs('#manualModal'); if(!m) return; m.classList.remove('hidden');
  const host = qs('#manualRows'); host.innerHTML='';
  const avdCount = (g?.divisions?.length) || 6;
  for(let i=1;i<=avdCount;i++){
    const lbl=document.createElement('div'); lbl.textContent='AVD '+i; lbl.className='mini';
    const inp=document.createElement('input'); inp.className='name'; inp.placeholder='t.ex. 1 2 5 10-12'; inp.dataset.avd=i; inp.style.width='100%';
    inp.addEventListener('input', manualPreview);
    host.appendChild(lbl); host.appendChild(inp);
  }
  qs('#manualClose').onclick=()=>m.classList.add('hidden');
  qs('#manualSave').onclick=()=>{
    const name=(qs('#manualName')?.value||'').trim();
    const inputs=[...host.querySelectorAll('input')];
    const rows=[];
    inputs.forEach(inp=>{
      const avd=parseInt(inp.dataset.avd,10);
      const nums = (inp.value||'').match(/\d+/g)||[];
      const horses=[...new Set(nums.map(x=>parseInt(x,10)).filter(n=>n>=1&&n<=15))].sort((a,b)=>a-b);
      if(horses.length) rows.push({avd, horses});
    });
    if(!rows.length){ alert('Fyll i minst en avdelning.'); return; }
    const gid=qs('#gameId')?.value; const game=gid?getGame(gid):g;
    const coupon={id:uid(), name, rows};
    setGame(game.id, s=>({...s, coupons:[...(s.coupons||[]), coupon]})); openGame(game.id);
    m.classList.add('hidden');
  };
  manualPreview();
}
function manualPreview(){
  const host=qs('#manualRows'); const out=qs('#manualPreview'); if(!host||!out) return;
  const inputs=[...host.querySelectorAll('input')]; const rows=[];
  inputs.forEach(inp=>{ const avd=+inp.dataset.avd; const nums=(inp.value||'').match(/\d+/g)||[]; const hs=[...new Set(nums.map(x=>+x).filter(n=>n>=1&&n<=15))].sort((a,b)=>a-b); if(hs.length) rows.push({avd, horses:hs}); });
  out.textContent = rows.map(r=>`AVD ${r.avd}: ${r.horses.join(' ')}`).join('\n') || '(ingen data)';
}
document.addEventListener('click', (e)=>{ if(e.target && e.target.id==='btnManual'){ const gid=qs('#gameId')?.value; const g=gid?getGame(gid):null; openManualModal(g);} }, true);

// --- Auto-test after saving calibration (safe append) ---
(function(){
  function ensure(){
    const btn = document.querySelector('#ocrSave');
    if(!btn || btn.__autoWired) return;
    btn.__autoWired = true;
    btn.addEventListener('click', async ()=>{
      const v = id => parseFloat((document.querySelector('#'+id)?.value)||'')||0;
      const gid = (document.querySelector('#gameId')||{}).value;
      const g = gid ? getGame(gid) : null;
      const scope = g?.form || 'V64';
      const state = window.__calib || (window.__calib={});
      state.avd=[v('xAvd1'), v('xAvd2')];
      state.horses=[v('xH1'), v('xH2')];
      state.reserv=state.reserv||[480,560];
      state.yTop=v('yTop'); state.rowH=v('rowH'); state.rows=Math.max(1, Math.round(v('rowsN'))||6);
      let rulesAll={}; try{ rulesAll=JSON.parse(localStorage.getItem('ocrImageRules')||'{}'); }catch(e){}
      rulesAll[scope]={...state}; localStorage.setItem('ocrImageRules', JSON.stringify(rulesAll));
      if(typeof drawCalib==='function') drawCalib();
      if(typeof runImageOcrDetailed==='function'){
        const out = await runImageOcrDetailed(state);
        const res = document.querySelector('#ocrResult');
        if(res){
          const lines = out.debug.map(r=>`Rad ${r.index} | AVD(txt:"${(r.raw.avd||'').trim()}") -> ${isNaN(r.parsed.avd)?'?':r.parsed.avd} | H(txt:"${(r.raw.horses||'').trim()}") -> ${r.parsed.horses.join(' ')}`);
          res.textContent = lines.join('\n') || '(Inget matchat)';
        }
        if(typeof drawRowLabels==='function'){ drawRowLabels(out.debug); }
      }
    });
  }
  if (document.readyState!=='loading') setTimeout(ensure, 200); else document.addEventListener('DOMContentLoaded', ()=>setTimeout(ensure,200));
})();
// --- Defaults on calibration modal open ---
(function(){
  const DEF = { avd:[0,30], horses:[45,220], yTop:220, rowH:32, rows:6 };
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='btnCalib'){
      setTimeout(()=>{
        window.__calib = Object.assign({}, DEF, window.__calib||{});
        const setV=(id,v)=>{ const el=document.getElementById(id); if(el) el.value = v; };
        setV('xAvd1', DEF.avd[0]); setV('xAvd2', DEF.avd[1]);
        setV('xH1', DEF.horses[0]); setV('xH2', DEF.horses[1]);
        setV('yTop', DEF.yTop); setV('rowH', DEF.rowH); setV('rowsN', DEF.rows);
        if(typeof drawCalib==='function') drawCalib();
      }, 30);
    }
  }, true);
})();