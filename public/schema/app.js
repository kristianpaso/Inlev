
// app.js — Hotfix 6
// - Area recognition now robust to case mix, diacritics and common OCR typos
// - OpenCV timeout fallback (so OCR always starts) from Hotfix 5

const els = {
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  previewWrap: document.getElementById('previewWrap'),
  preview: document.getElementById('preview'),
  cropCanvas: document.getElementById('cropCanvas') || document.createElement('canvas'),
  cropModeBtn: document.getElementById('cropModeBtn') || {disabled:true,classList:{add(){},remove(){}}},
  applyCropBtn: document.getElementById('applyCropBtn') || {classList:{add(){},remove(){}}},
  cancelCropBtn: document.getElementById('cancelCropBtn') || {classList:{add(){},remove(){}}},
  startBtn: document.getElementById('startOcrBtn'),
  saveBtn: document.getElementById('saveBtn'),
  autoRectify: document.getElementById('autoRectify'),
  status: document.getElementById('status'),
  raw: document.getElementById('rawText'),
  parsed: document.getElementById('parsed'),
};

// Canonical departments exactly as provided
const CANONICAL_AREAS = [
  "OUTBOUND",
  "B2B",
  "KONSOLIDERING",
  "FELSÖK",
  "UTLEVERANS",
  "Inleverans",
  "Extern Inleverans",
  "Retur A.S",
  "Retur Zalando",
  "Komplettering",
  "Påfyllnad",
  "Infackning A.S",
  "Infackning Buffert",
  "Planerade Påfyllnader",
  "Inventering",
  "Övrigt",
  "Upprensning"
];

let CONFIG = {
  areas: CANONICAL_AREAS.slice(),
  people: [
    {name:"Paso",aliases:["Kristian","Kristian Paso"]},
    {name:"Cissi",aliases:["Cecilia"]},
    {name:"Frida",aliases:[]},
    {name:"Roudi",aliases:["Rodi"]},
    {name:"Morsal",aliases:[]},
    {name:"Raziyeh",aliases:[]},
    {name:"Ali",aliases:[]},
    {name:"Arturo",aliases:[]},
    {name:"Haris",aliases:[]},
    {name:"Matilda",aliases:["Mathilda"]},
    {name:"Sanna",aliases:[]},
    {name:"Josef",aliases:[]},
    {name:"Sigurd",aliases:[]},
    {name:"Asma",aliases:[]},
    {name:"Sofia",aliases:[]},
    {name:"Axel",aliases:[]},
    {name:"Ahmad",aliases:[]},
    {name:"Abdi",aliases:[]},
    {name:"Muharem",aliases:[]},
    {name:"Elia",aliases:[]},
    {name:"Samuel",aliases:[]},
    {name:"Nasser",aliases:[]},
    {name:"Vidar",aliases:[]}
  ]
};

let currentFile = null, currentRaw='', currentAssignments=[];

// ---- Upload UX
if (els.dropZone && els.fileInput) {
  els.dropZone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', e => handleFiles(e.target.files));
  ['dragover','dragleave','drop'].forEach(evt => {
    els.dropZone.addEventListener(evt, e => {
      e.preventDefault();
      els.dropZone.style.borderColor = (evt==='dragover')?'var(--accent)':'var(--border)';
      if (evt==='drop') handleFiles(e.dataTransfer.files);
    });
  });
}
function handleFiles(files){
  if (!files || !files[0]) return;
  currentFile = files[0];
  const url = URL.createObjectURL(currentFile);
  els.previewWrap?.classList.remove('hidden');
  if (els.preview) els.preview.src = url;
  if (els.startBtn) els.startBtn.disabled = false;
  if (els.saveBtn) els.saveBtn.disabled = true;
  if (els.status) els.status.textContent = 'Klar att starta OCR…';
  if (els.raw) els.raw.textContent = '';
  if (els.parsed) els.parsed.innerHTML='';
  currentRaw=''; currentAssignments=[];
}

// ---- OpenCV helpers with timeout fallback
function waitForCV(timeoutMs=6000){
  return new Promise(resolve=>{
    if (window.__cvReady) return resolve(true);
    const start = Date.now();
    const int = setInterval(()=>{
      if (window.__cvReady){ clearInterval(int); resolve(true); }
      else if (Date.now()-start>timeoutMs){ clearInterval(int); resolve(false); }
    }, 120);
  });
}
function warpLargestQuad(imgEl){
  try{
    const src = cv.imread(imgEl);
    let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
    let edges = new cv.Mat(); cv.Canny(gray, edges, 50, 150);
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5,5));
    cv.dilate(edges, edges, kernel);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best=null, bestArea=0;
    for (let i=0;i<contours.size();i++){
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat(); cv.approxPolyDP(cnt, approx, 0.02*peri, true);
      if (approx.rows===4){
        const area = cv.contourArea(approx);
        if (area>bestArea){ bestArea=area; best=approx; }
      }
    }
    if(!best){ src.delete(); gray.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete(); return null; }
    const pts=[]; for (let i=0;i<4;i++){ pts.push({x:best.intPtr(i,0)[0], y:best.intPtr(i,0)[1]}); }
    pts.sort((a,b)=>a.y-b.y);
    const [t1,t2,b1,b2]=[pts[0],pts[1],pts[2],pts[3]];
    const [tl,tr]=t1.x<t2.x?[t1,t2]:[t2,t1]; const [bl,br]=b1.x<b2.x?[b1,b2]:[b2,b1];
    const widthTop = Math.hypot(tr.x-tl.x, tr.y-tl.y);
    const widthBottom = Math.hypot(br.x-bl.x, br.y-bl.y);
    const heightLeft = Math.hypot(bl.x-tl.x, bl.y-tl.y);
    const heightRight = Math.hypot(br.x-tr.x, br.y-tr.y);
    const W = Math.max(widthTop,widthBottom)|0, H = Math.max(heightLeft,heightRight)|0;
    const srcTri = cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y, tr.x,tr.y, br.x,br.y, bl.x,bl.y]);
    const dstTri = cv.matFromArray(4,1,cv.CV_32FC2,[0,0, W,0, W,H, 0,H]);
    const M = cv.getPerspectiveTransform(srcTri,dstTri);
    const dst = new cv.Mat(); const dsize=new cv.Size(W,H);
    cv.warpPerspective(src,dst,M,dsize,cv.INTER_LINEAR,cv.BORDER_REPLICATE,new cv.Scalar());
    let bin=new cv.Mat(); cv.cvtColor(dst, bin, cv.COLOR_RGBA2GRAY, 0);
    cv.adaptiveThreshold(bin, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 10);
    const canvas=document.createElement('canvas'); canvas.width=bin.cols; canvas.height=bin.rows;
    cv.imshow(canvas, bin);
    const dataURL = canvas.toDataURL('image/png');
    src.delete(); gray.delete(); edges.delete(); kernel.delete(); contours.delete(); hierarchy.delete(); best.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete(); bin.delete();
    return dataURL;
  } catch(e){
    console.warn('warpLargestQuad failed', e); return null;
  }
}

// ---- Parsing helpers
function norm(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }
function normalizeTextLine(s){
  return s.replace(/[“”„]/g,'"').replace(/[’‘]/g,"'").replace(/[—–‐]/g,'-')
          .replace(/\s{2,}/g,' ').trim();
}

function buildAreaLookup(){
  const map={};
  CANONICAL_AREAS.forEach(a => { map[norm(a)] = a; });

  // tolerant keys for common OCR quirks (no dots/accents/spaces)
  const extras = {
    'retur as':'Retur A.S',
    'returas':'Retur A.S',
    'infackning as':'Infackning A.S',
    'externinleverans':'Extern Inleverans',
    'extern inlev':'Extern Inleverans',
    'pafyllnad':'Påfyllnad',
    'pafyllnader':'Planerade Påfyllnader',
    'planerade pafyllnader':'Planerade Påfyllnader',
    'planerade pafylnnader':'Planerade Påfyllnader',
    'felsok':'FELSÖK',
    'konsolidering':'KONSOLIDERING',
    'ovrigt':'Övrigt',
    'outbound':'OUTBOUND',
    'b2b':'B2B',
    'utleverans':'UTLEVERANS',
    'infackning buffert':'Infackning Buffert',
  };
  Object.assign(map, extras);
  return map;
}

function buildPeopleLookup(){
  const map={}; (CONFIG.people||[]).forEach(p=>{
    const aliases=[p.name].concat(p.aliases||[]);
    aliases.forEach(a=> map[norm(a)] = p.name);
  }); return map;
}

function isPortLine(s){ return /port\s*\d+/i.test(s); }

function parseOcr(raw){
  const lines = raw.split(/\r?\n/).map(x=>normalizeTextLine(x)).filter(Boolean);
  const areaL=buildAreaLookup(); const peopleL=buildPeopleLookup();
  let cur=null; const out=[];
  for (let line of lines){
    // ignore port rows
    if (isPortLine(line)) continue;

    const l=norm(line);
    let newArea=null;

    // exact + contains (case/diacritics/space tolerant)
    for (const k in areaL){
      if (l===k || l.startsWith(k) || (' '+l+' ').includes(' '+k+' ')) { newArea=areaL[k]; break; }
    }
    if (newArea){ cur=newArea; continue; }
    if (!cur) continue;

    // try to extract names on this line
    const tokens=line.replace(/Port\s*\d+/ig,'')
                     .split(/[,\|/]+/g)
                     .flatMap(x=>x.split(/\s{2,}/g))
                     .map(x=>x.trim())
                     .filter(Boolean);

    for (let tk of tokens){
      let key=norm(tk.replace(/\./g,''));
      if (!/[a-zåäö]/i.test(key)) continue;
      let person=peopleL[key];
      if (!person){
        // small OCR repairs
        key=key.replace(/rn/g,'m').replace(/ii/g,'n').replace(/0/g,'o').replace(/1/g,'i');
        person=peopleL[key];
      }
      if (person) out.push({area:cur, person});
    }
  }
  // uniq by (area,person)
  const seen=new Set(); const uniq=[]; out.forEach(a=>{const k=a.area+'|'+a.person; if(!seen.has(k)){seen.add(k); uniq.push(a);}});
  return uniq;
}

// ---- OCR flow
async function runOcr(){
  if (!currentFile) return;
  els.status && (els.status.textContent = 'Förbereder bild…');
  try{
    if (els.autoRectify?.checked){
      const ok = await waitForCV(6000);
      if (!ok){
        els.status && (els.status.textContent = 'OpenCV kunde inte laddas, kör OCR utan upprätning…');
      } else {
        const warped = warpLargestQuad(els.preview);
        if (warped){ els.preview.src = warped; }
      }
    }
  }catch(e){ console.warn('Auto-räta upp misslyckades', e); }

  try{
    if (typeof Tesseract === 'undefined'){
      els.status && (els.status.textContent = 'Tesseract.js kunde inte laddas (CSP/CDN?). Prova att ladda om sidan.');
      return;
    }
    els.status && (els.status.textContent='OCR körs…');
    const worker = await Tesseract.createWorker('swe+eng');
    await worker.setParameters({ preserve_interword_spaces:'1', tessedit_pageseg_mode:'6', user_defined_dpi:'300' });
    // upscale 2x for better OCR
    const img = await upscaleImage(els.preview, 2);
    const { data:{ text } } = await worker.recognize(img);
    await worker.terminate();
    currentRaw=text; els.raw && (els.raw.textContent=text);
    currentAssignments=parseOcr(text);
    renderAssignments(currentAssignments);
    els.status && (els.status.textContent='OCR klart. Hittade '+currentAssignments.length+' matchade namn.');
    if (els.saveBtn) els.saveBtn.disabled = currentAssignments.length===0;
  }catch(e){ console.error(e); els.status && (els.status.textContent='Fel vid OCR: '+e.message); }
}
function upscaleImage(imgEl, scale){
  const c=document.createElement('canvas'); c.width=imgEl.naturalWidth*scale; c.height=imgEl.naturalHeight*scale;
  const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
  ctx.drawImage(imgEl, 0,0,c.width,c.height); return c;
}
function renderAssignments(list){
  if (!els.parsed) return;
  const byArea={}; list.forEach(a=> (byArea[a.area]=byArea[a.area]||[]).push(a.person));
  let html='<h4>Sammanställning (denna bild)</h4>';
  if (!list.length){ html+='<div class="badge">Inga matchningar. Beskär tabellen manuellt eller lägg till alias och försök igen.</div>'; }
  else{
    html+='<table><thead><tr><th>Avdelning</th><th>Personer</th></tr></thead><tbody>';
    Object.keys(byArea).sort().forEach(area=>{
      const ppl=[...new Set(byArea[area])];
      html+='<tr><td>'+area+'</td><td>'+ppl.map(p=>'<span class="tag person">'+p+'</span>').join(' ')+'</td></tr>';
    });
    html+='</tbody></table>';
  }
  els.parsed.innerHTML=html;
}

// ---- Local save (no server needed in Netlify)
function getLocalLogs(){ return JSON.parse(localStorage.getItem('schemaLocalLogs')||'[]'); }
function setLocalLogs(arr){ localStorage.setItem('schemaLocalLogs', JSON.stringify(arr)); }
function saveEntry(){
  if (!currentRaw || !currentAssignments.length) return;
  const meta = { filename: currentFile?.name || 'upload', size: currentFile?.size || 0 };
  const entry = { id:'local_'+Date.now(), ts:new Date().toISOString(), rawText: currentRaw, assignments: currentAssignments, meta };
  const arr = getLocalLogs(); arr.push(entry); setLocalLogs(arr);
  if (els.saveBtn) els.saveBtn.disabled=true;
  els.status && (els.status.textContent='Sparat i lokal logg.');
}
els.startBtn && els.startBtn.addEventListener('click', runOcr);
els.saveBtn && els.saveBtn.addEventListener('click', saveEntry);
