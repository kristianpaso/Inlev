
(function(){
  'use strict';
  const MAX_AVD=7, MAX_H=15;
  const KEY='trav.calib.v2';
  const DEFAULT = { numX:null, nameX1:null, nameX2:null, drvX1:null, drvX2:null, yTol:2.4, nameDY:-8 };

  function $(id){ return document.getElementById(id); }
  function setStatus(msg, cls){ const s=$('status'); if(!s) return; s.textContent=msg; s.className='mini '+(cls||''); }
  function loadScript(url){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=url; s.onload=()=>res(true); s.onerror=()=>rej(url); document.head.appendChild(s); }); }

  async function ensurePdfJs(){
    try{ await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; return true; }catch(_){ return false; }
  }

  function getCalib(){ try{ return {...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY)||'{}'))}; }catch(_){ return {...DEFAULT}; } }
  function setCalib(c){ localStorage.setItem(KEY, JSON.stringify(c)); paintCalibJSON(); }
  function paintCalibJSON(){ const c=getCalib(); $('calibJson').textContent = JSON.stringify(c, null, 2); ['f_numX','f_nameX1','f_nameX2','f_drvX1','f_drvX2','f_yTol','f_nameDY'].forEach(id=>{ const el=$(id); if(el){ const k=id.replace('f_',''); el.value = c[k] ?? ''; } }); }

  // Tabs
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn=$('parsePdf'); if(btn) btn.addEventListener('click', onBuild);
    $('tabPreview').onclick = ()=>{ $('previewPane').style.display='block'; $('calibPane').style.display='none'; };
    $('tabCalib').onclick = ()=>{ $('previewPane').style.display='none'; $('calibPane').style.display='block'; };
    $('loadPg').onclick = loadOnePageForCalib;
    $('saveCalib').onclick = ()=>{
      const c=getCalib();
      c.numX = toNum('f_numX'); c.nameX1 = toNum('f_nameX1'); c.nameX2 = toNum('f_nameX2');
      c.drvX1 = toNum('f_drvX1'); c.drvX2 = toNum('f_drvX2');
      c.yTol = parseFloat($('f_yTol').value)||2.4; c.nameDY = parseFloat($('f_nameDY').value)||-8;
      setCalib(c); setStatus('Kalibrering sparad.','ok');
    };
    $('resetCalib').onclick = ()=>{ localStorage.removeItem(KEY); paintCalibJSON(); setStatus('Återställd.','ok'); };
    paintCalibJSON();
  });
  function toNum(id){ const v=parseFloat($(id).value); return Number.isFinite(v)?v:null; }

  // ===== Canvas kalibrering (viewport space) =====
  async function loadOnePageForCalib(){
    const f=$('pdfFile').files && $('pdfFile').files[0]; if(!f){ setStatus('Välj en PDF först.','warn'); return; }
    const ok=await ensurePdfJs(); if(!ok){ setStatus('Kunde inte ladda PDF.js','err'); return; }
    const data=await f.arrayBuffer(); const pdf=await pdfjsLib.getDocument({data}).promise;
    const page=await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas=$('calibCanvas'); const ctx=canvas.getContext('2d');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const clicks=[];
    canvas.onclick = (e)=>{
      const r=canvas.getBoundingClientRect(); const x = (e.clientX-r.left); const y = (e.clientY-r.top);
      clicks.push({x,y}); const c=getCalib();
      if(clicks.length===1) c.numX = Math.round(x);
      if(clicks.length===2) c.nameX1 = Math.round(x);
      if(clicks.length===3) c.nameX2 = Math.round(x);
      if(clicks.length===4) c.drvX1 = Math.round(x);
      if(clicks.length===5) c.drvX2 = Math.round(x);
      setCalib(c);
      ctx.strokeStyle='rgba(106,163,255,0.85)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    };
    setStatus('Klicka 1–5 vertikala linjer (nrX, namn x1/x2, kusk x1/x2).','ok');
  }

  // ===== Förhandsvisning / Parser =====
  const TITLE=/\b[A-ZÅÄÖ][a-zåäö]+ [A-ZÅÄÖ][a-zåäö]+/;
  const UPPER=/^[A-ZÅÄÖ.’'()\-& ]+$/; // inkluderar typografiskt ’
  const HAS_LETTER=/[A-ZÅÄÖ]/;
  const NUM=/^(?:[1-9]|1[0-5])$/;

  async function onBuild(){
    const host=$('host'); host.innerHTML=''; setStatus('Startar …','ok');
    const ok=await ensurePdfJs(); if(!ok){ setStatus('Kunde inte ladda PDF.js','err'); return; }
    const f=$('pdfFile').files && $('pdfFile').files[0]; if(!f){ setStatus('Välj en PDF först.','warn'); return; }
    const data=await f.arrayBuffer(); const pdf=await pdfjsLib.getDocument({data}).promise;

    const cards=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const viewport=page.getViewport({ scale: 1.2 }); // samma skala som kalibrering
      const content=await page.getTextContent();
      const items = content.items.map(i=>{
        const tr = pdfjsLib.Util.transform(viewport.transform, i.transform);
        return { str:i.str, x:tr[4], y:tr[5], fs:Math.abs(tr[3])||Math.abs(tr[0]) };
      }).sort((a,b)=>b.y-a.y || a.x-b.x);

      const parsed = parseWithCalibratedZones(items);
      if(parsed && parsed.horses && parsed.horses.length){ parsed.page=p; cards.push(parsed); }
    }
    if(!cards.length){ setStatus('Hittade inga avdelningar (kalibrera först om PDF-layouten är ny).','warn'); return; }
    setStatus(`Hittade ${cards.length} avdelning(ar).`,'ok');
    for(const c of cards){ host.appendChild(renderCard(c)); }
  }

  function parseWithCalibratedZones(items){
    const cal=getCalib();
    // Avdelning = största siffra i toppband (vänsterhalvan)
    const maxY=Math.max(...items.map(i=>i.y)), minY=Math.min(...items.map(i=>i.y));
    const cutoff = maxY - (maxY-minY)*0.18;
    const headNums = items.filter(i=>/^\d{1,2}$/.test(i.str) && i.y>=cutoff && i.x < (Math.min(...items.map(t=>t.x)) + (Math.max(...items.map(t=>t.x)) - Math.min(...items.map(t=>t.x))) * 0.5));
    headNums.sort((a,b)=>b.fs-a.fs || a.x-b.x);
    const avd = headNums.length? Number(headNums[0].str) : null;

    // Meta
    const headText = items.filter(i=>i.y>=cutoff-20).map(i=>i.str).join(' ');
    const mStart=headText.match(/START\s+(\d{1,2}[.:]\d{2})/i);
    const start=mStart?mStart[1].replace('.',':'):null;
    const distItem = items.find(i=>/\b\d{3,4}\s*M\b/i.test(i.str));
    let dist='', starttyp=''; if(distItem){ const right=items.filter(j=>Math.abs(j.y-distItem.y)<6 && j.x>distItem.x); const st=right.find(r=>/Auto|Autostart|Volt/i.test(r.str)); dist=distItem.str.replace(/\s+/g,' ').trim(); starttyp=st?(st.str.match(/Autostart|Volt/i)||[''])[0]:''; }
    const distText=[dist,starttyp].filter(Boolean).join(' ');
    const mLopp=headText.match(/LOPP\s+(\d+)/i); const lopp=mLopp?Number(mLopp[1]):null;

    // Nummerkolumn
    let numX = cal.numX;
    if(numX==null){
      const cand=items.filter(i=>NUM.test(i.str) && i.fs>=14);
      const xs=cand.map(n=>n.x).sort((a,b)=>a-b);
      numX = xs.length ? xs[Math.floor(xs.length/2)] : null;
    }
    if(numX==null) return null;
    const nums=items.filter(i=>NUM.test(i.str) && Math.abs(i.x-numX)<6).sort((a,b)=>Number(a.str)-Number(b.str)).slice(0,15);

    const horses=[];
    for(const n of nums){
      const ny=n.y, nx=n.x;
      const x1 = cal.nameX1 ?? (nx-230), x2 = cal.nameX2 ?? (nx-8);
      const yTol = cal.yTol ?? 2.4, nameDY = cal.nameDY ?? -8;

      // Ta kandidater i ett vertikalt band kring (ny + nameDY)
      const candidates = items.filter(i=> i.x>x1 && i.x<x2 && i.y>ny-30 && i.y<ny+12);
      // Grupp efter y, välj linjen närmast targetY = ny + nameDY
      const targetY = ny + nameDY;
      let best=null, bestDist=1e9, bestCount=0;
      for(const it of candidates){
        const line = candidates.filter(k=>Math.abs(k.y - it.y) < yTol);
        const tokens = line.filter(t=>UPPER.test(t.str) && HAS_LETTER.test(t.str));
        if(!tokens.length) continue;
        const y=line[0].y;
        const dist = Math.abs(y - targetY);
        const count = tokens.length;
        if(dist < bestDist - 0.1 || (Math.abs(dist-bestDist)<0.1 && count>bestCount)){
          best={y, tokens: tokens.sort((a,b)=>a.x-b.x)}; bestDist=dist; bestCount=count;
        }
      }
      const namn = best ? best.tokens.map(t=>t.str).join(' ').replace(/\s+/g,' ').trim() : '';

      // Kusk på samma linje till höger
      const dx1 = cal.drvX1 ?? (nx+8), dx2 = cal.drvX2 ?? (nx+270);
      const driverBand = items.filter(i=> i.x>dx1 && i.x<dx2 && Math.abs(i.y - (best?best.y:ny)) < yTol).sort((a,b)=>a.x-b.x);
      let kusk=''; for(const t of driverBand){ const m=t.str.match(TITLE); if(m){ kusk=m[0]; break; } }

      if(namn){ horses.push({nr:Number(n.str), namn, kusk}); }
      if(horses.length>=MAX_H) break;
    }

    if(!horses.length) return null;
    return { avd, dist:distText, starttid:start, lopp, horses };
  }

  // ===== UI =====
  function renderCard(d){
    const el=document.createElement('div'); el.className='card';
    const meta=[ d.lopp!=null?`Lopp ${d.lopp}`:null, d.starttid?`Start ${d.starttid}`:null, d.dist||null ].filter(Boolean).join(' • ');
    el.innerHTML = `<h3 style="margin:0 0 8px">Avdelning ${d.avd ?? '?'}</h3>
      <div class="mini" style="margin-bottom:10px">${meta}</div>
      <div class="table">
        <div class="trow thead"><div>Nr</div><div>Häst</div><div>Kusk</div></div>
        ${d.horses.map(h=>`<div class="trow"><div>${h.nr}</div><div>${escapeHtml(h.namn)}</div><div>${escapeHtml(h.kusk||'')}</div></div>`).join('')}
      </div>`;
    return el;
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"\\'":'&#39;'}[m])); }
})();
