<<<<<<< HEAD

/* Statistik app */
(function(){
  const els = {
    file: document.getElementById('fileInput'),
    meta: document.getElementById('fileMeta'),
    sheet: document.getElementById('sheetSelect'),
    idle: document.getElementById('idleMin'),
    btnDemo: document.getElementById('btnDemo'),
    btnExport: document.getElementById('btnExport'),
    kTotal: document.getElementById('kpiTotal'),
    kUsers: document.getElementById('kpiUsers'),
    kHours: document.getElementById('kpiHours'),
    kRate: document.getElementById('kpiRate'),
    day: document.getElementById('dayPicker'),
    topN: document.getElementById('topN'),
    filter: document.getElementById('userFilter'),
    chartCanvas: document.getElementById('mainChart')
  };

  let rows = []; // normalized rows from file
  let byDay = {}; // date -> rows
  let chart;

  function fmt(n){ return (Math.round(n*100)/100).toLocaleString('sv-SE'); }
  function parseDate(s){
    // accepts 'YYYY-MM-DD hh:mm:ss' or Excel date number
    if (typeof s === 'number') {
      // Excel serial date -> JS date
      const utc_days  = Math.floor(s - 25569);
      const utc_value = utc_days * 86400; 
      const date_info = new Date(utc_value * 1000);
      const fractional_day = s - Math.floor(s) + 0.0000001;
      let total_seconds = Math.floor(86400 * fractional_day);
      const seconds = total_seconds % 60; total_seconds -= seconds;
      const hours = Math.floor(total_seconds / (60 * 60));
      const minutes = Math.floor(total_seconds / 60) % 60;
      date_info.setHours(hours, minutes, seconds);
      return date_info;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function ymd(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

  function normalize(ws){
    // Expect columns: UserName, TimeStamp, UpdateCode (each row = 1 plock)
    const range = XLSX.utils.decode_range(ws['!ref']);
    const headers = {};
    const out = [];
    for(let C=range.s.c; C<=range.e.c; C++){
      const cell = ws[XLSX.utils.encode_cell({r:range.s.r, c:C})];
      if(cell) headers[C] = String(cell.v).trim();
    }
    for(let R=range.s.r+1; R<=range.e.r; R++){
      let obj = {};
      for(let C=range.s.c; C<=range.e.c; C++){
        const h = headers[C];
        if(!h) continue;
        const cell = ws[XLSX.utils.encode_cell({r:R, c:C})];
        if(cell) obj[h] = cell.v;
      }
      if(Object.keys(obj).length){
        const d = parseDate(obj.TimeStamp);
        if(!d) continue;
        out.push({
          user: String(obj.UserName || '').trim(),
          ts: d,
          code: String(obj.UpdateCode || '').trim()
        });
      }
    }
    return out.sort((a,b)=>a.ts-b.ts);
  }

  function segmentActiveMinutes(items, idleMin){
    // items are for one user, sorted by ts. Count active time by gaps < idleMin
    if(items.length < 2) return 0;
    let activeMs = 0;
    let start = items[0].ts.getTime();
    for(let i=1;i<items.length;i++){
      const prev = items[i-1].ts.getTime();
      const cur  = items[i].ts.getTime();
      const gapMin = (cur - prev) / 60000;
      if (gapMin >= idleMin){ // stop previous segment at prev
        activeMs += (prev - start);
        start = cur; // new segment
      }
    }
    // close with last timestamp
    activeMs += (items[items.length-1].ts.getTime() - start);
    return activeMs / 3600000; // hours
  }

  function buildByDay(){
    byDay = {};
    for(const r of rows){
      const key = ymd(r.ts);
      (byDay[key] ||= []).push(r);
    }
  }

  function updateSheetSelector(wb){
    els.sheet.innerHTML = '';
    wb.SheetNames.forEach((name,i)=>{
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      els.sheet.appendChild(opt);
    });
  }

  function loadWorksheet(wb){
    const name = els.sheet.value || wb.SheetNames[0];
    const ws = wb.Sheets[name];
    rows = normalize(ws);
    buildByDay();
    // pick latest day
    const days = Object.keys(byDay).sort();
    if(days.length){
      els.day.min = days[0];
      els.day.max = days[days.length-1];
      els.day.value = days[days.length-1];
    }
    render();
  }

  function readFile(file){
    els.meta.textContent = file ? file.name + ' — ' + (file.size/1024/1024).toFixed(2) + ' MB' : '';
    const ext = (file && file.name.split('.').pop().toLowerCase()) || '';
    if(ext === 'csv'){
      const reader = new FileReader();
      reader.onload = (e)=>{
        const text = e.target.result;
        const wb = XLSX.read(text, {type:'string'}); // minimal: let xlsx parse csv
        updateSheetSelector(wb);
        loadWorksheet(wb);
      };
      reader.readAsText(file);
    }else{
      const reader = new FileReader();
      reader.onload = (e)=>{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array'});
        updateSheetSelector(wb);
        loadWorksheet(wb);
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function calcKPIsForDay(day){
    const dayRows = (byDay[day] || []).slice();
    const idle = parseFloat(els.idle.value)||15;
    // group by user
    const byUser = {};
    dayRows.forEach(r => { (byUser[r.user] ||= []).push(r); });
    const users = Object.keys(byUser);
    let total = dayRows.length;
    let activeHours = 0;
    const perUser = users.map(u => {
      const items = byUser[u].sort((a,b)=>a.ts-b.ts);
      const hrs = segmentActiveMinutes(items, idle);
      activeHours += hrs;
      return { user:u, picks: items.length, hours: hrs };
    });
    const rate = activeHours>0 ? total/activeHours : 0;
    return { total, users: users.length, hours: activeHours, rate, perUser };
  }

  function render(){
    if(!els.day.value){ // nothing selected yet
      els.kTotal.textContent = '—';
      els.kUsers.textContent = '—';
      els.kHours.textContent = '—';
      els.kRate.textContent = '—';
      if(chart) chart.destroy();
      return;
    }
    const {total, users, hours, rate, perUser} = calcKPIsForDay(els.day.value);
    els.kTotal.textContent = total.toLocaleString('sv-SE');
    els.kUsers.textContent = users.toLocaleString('sv-SE');
    els.kHours.textContent = fmt(hours);
    els.kRate.textContent  = fmt(rate);

    // Filter + sort
    let list = perUser;
    const q = (els.filter.value || '').trim().toLowerCase();
    if(q) list = list.filter(x => x.user.toLowerCase().includes(q));
    list.sort((a,b)=> b.picks - a.picks);
    const n = parseInt(els.topN.value,10)||0;
    if(n>0) list = list.slice(0,n);

    // Draw
    const labels = list.map(x=>x.user);
    const data = list.map(x=>x.picks);
    if(chart) chart.destroy();
    chart = new Chart(els.chartCanvas.getContext('2d'), {
      type:'bar',
      data: { labels, datasets: [{ label:'Plock', data }]},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{ legend:{ display:false }, tooltip:{ mode:'index', intersect:false } },
        scales:{ x:{ ticks:{ autoSkip:false }}, y:{ beginAtZero:true } }
      }
    });
  }

  // Example data
  function demoData(){
    // 1 day of simple data
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1);
    function mk(u, h, m){ const d=new Date(day); d.setHours(h,m,0,0); return { user:u, ts:d, code:'A' }; }
    rows = [
      mk('Demo',8,0), mk('Demo',8,3), mk('Demo',8,8),
      mk('Anna',8,2), mk('Anna',8,6), mk('Anna',9,40),
      mk('Erik',9,10), mk('Erik',9,15)
    ];
    buildByDay();
    const days = Object.keys(byDay).sort();
    els.day.min = days[0]; els.day.max = days[days.length-1]; els.day.value = days[days.length-1];
    render();
  }

  // Export CSV
  function exportReport(){
    if(!els.day.value){ alert('Ingen rapport att exportera ännu.'); return; }
    const per = calcKPIsForDay(els.day.value).perUser;
    const lines = ['UserName,Picks,ActiveHours'];
    per.forEach(r => lines.push([r.user, r.picks, fmt(r.hours)].join(',')));
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rapport_'+els.day.value+'.csv'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  }

  // Events
  els.file.addEventListener('change', e=>{ const f=e.target.files[0]; if(f) readFile(f); });
  els.sheet.addEventListener('change', ()=>render());
  els.idle.addEventListener('change', ()=>render());
  els.topN.addEventListener('change', ()=>render());
  els.filter.addEventListener('input', ()=>render());
  els.day.addEventListener('change', ()=>render());
  els.btnDemo.addEventListener('click', demoData);
  els.btnExport.addEventListener('click', exportReport);

})();
=======
// Statistik — klientlogik med uppladdning ELLER report.json
let charts = { pph: null, updates: null };
let workbook = null;
let activeRows = []; // rows from selected sheet when using upload
let currentReport = null;


// --- Robust loader for XLSX (handles blocked CDN / CSP) ---
let __xlsxLoading = null;
function ensureXLSX(){
  if (window.XLSX) return Promise.resolve();
  if (__xlsxLoading) return __xlsxLoading;
  const candidates = [
    "/js/vendor/xlsx.full.min.js",
    "/vendor/xlsx.full.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js"
  ];
  __xlsxLoading = new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (window.XLSX) return resolve();
      if (i >= candidates.length) {
        return reject(new Error("Kan inte ladda XLSX-biblioteket (CSP/brandvägg?). Lägg en lokal kopia på /js/vendor/xlsx.full.min.js."));
      }
      const src = candidates[i++];
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => setTimeout(() => window.XLSX ? resolve() : tryNext(), 10);
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  });
  return __xlsxLoading;
}

// --- robust file → workbook loader ---
async function fileToWorkbook(file){
  await ensureXLSX();
  // Try ArrayBuffer first
  let buf = await file.arrayBuffer().catch(()=>null);
  if(buf){
    try{
      return XLSX.read(buf, { type: 'array', cellDates: true });
    }catch(e){
      console.warn('XLSX.read(array) misslyckades, testar binary string...', e);
    }
  }
  // Fallback to binary string
  const reader = new FileReader();
  const data = await new Promise((resolve, reject)=>{
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsBinaryString(file);
  }).catch(()=>null);
  if(!data) throw new Error('Kunde inte läsa filen (varken arraybuffer eller binary).');
  return XLSX.read(data, { type: 'binary', cellDates: true });
}

const ui = {
  file: document.getElementById('fileInput'),
  sheet: document.getElementById('sheetSelect'),
  idle: document.getElementById('idleMinutes'),
  useSample: document.getElementById('useSample'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  fileMeta: document.getElementById('fileMeta'),
  // kpis
  kpiTotalPicks: document.getElementById('kpiTotalPicks'),
  kpiUsers: document.getElementById('kpiUsers'),
  kpiHours: document.getElementById('kpiHours'),
  kpiPPH: document.getElementById('kpiPPH'),
  // table and meta
  userTableBody: document.querySelector('#userTable tbody'),
  meta: document.getElementById('meta'),
  srcName: document.getElementById('srcName'),
  genTime: document.getElementById('genTime'),
,
  userMode: document.getElementById('userMode'),
  userFilter: document.getElementById('userFilter')
};
function setStatus(msg){ const el = document.getElementById('statusMsg'); if(el) el.textContent = msg||''; }


// Events
ui.file.addEventListener('change', onFile);
ui.sheet.addEventListener('change', onSheetChange);
ui.idle.addEventListener('change', () => { if(activeRows.length) rebuildFromActiveRows(); });
ui.useSample.addEventListener('click', loadSample);
ui.exportJsonBtn.addEventListener('click', () => {
  if(!currentReport){ alert('Ingen rapport att exportera ännu.'); return; }
  const b = new Blob([JSON.stringify(currentReport, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'report.json';
  a.click();
});

// Init: load bundled sample
loadSample();

async function loadSample(){
  setStatus('Laddar exempeldata ...');
  try{
    const res = await fetch('./data/report.json', { cache: 'no-cache' });
    if(!res.ok) throw new Error('report.json saknas');
    const report = await res.json();
    currentReport = report;
    renderReport(report);
    setStatus('Exempeldata inläst.');
  }catch(e){
    console.warn('Kunde inte ladda sample report.json:', e);
    const fallback = {
      meta:{source_filename:'sample',generated_utc:new Date().toISOString(),inactivity_threshold_minutes:15},
      global:{total_picks:3,n_users:1,active_seconds:600,active_hours:0.167,picks_per_active_hour:18,updatecode_counts:{A:2,B:1},first_pick:new Date().toISOString(),last_pick:new Date().toISOString()},
      per_user:{Demo:{user:'Demo',total_picks:3,sessions:[{start:new Date().toISOString(),end:new Date().toISOString(),duration_seconds:600,picks:3}],n_sessions:1,active_seconds:600,active_hours:0.167,picks_per_active_hour:18,first_pick:new Date().toISOString(),last_pick:new Date().toISOString(),updatecode_counts:{A:2,B:1}}}
    };
    currentReport = fallback;
    renderReport(fallback,{srcName:'Inbyggd demo'});
    setStatus('Exempeldata saknas i /statistik/data/. Visar inbyggd demo.');
  }
}



async function onFile(e){
  const file = e.target.files?.[0];
  if(!file) return;
  ui.fileMeta.textContent = `${file.name} • ${(file.size/1024/1024).toFixed(2)} MB • Senast ändrad: ${new Date(file.lastModified).toLocaleString()}`;
  setStatus('Läser fil ...');

  const lower = (file.name||'').toLowerCase();
  try{
    if(lower.endsWith('.csv')){
      const text = await file.text();
      activeRows = parseCSV(text);
      if(!activeRows.length){ throw new Error('Hittade inga rader i CSV.'); }
      ui.sheet.innerHTML = `<option>CSV</option>`;
      ui.sheet.value = 'CSV';
      rebuildFromActiveRows();
      setStatus(`CSV inläst (${activeRows.length} rader).`);
      return;
    }
    try{
      await ensureXLSX();
      const buf = await file.arrayBuffer();
      workbook = XLSX.read(buf, { type: 'array', cellDates: true });
      const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
      if(!names.length){
        alert('Kunde läsa filen men hittade inga arbetsblad. Är det en tom fil eller ogiltigt format?');
        return;
      }
      populateSheetSelect(names);
      ui.sheet.value = names[0];
      onSheetChange();
      setStatus(`Fil inläst. Hittade ${names.length} blad.`);
    } catch(e){
      console.warn('XLSX i klienten misslyckades, använder server-parse', e);
      await serverParse(file);
      return;
    }
  }catch(err){
    console.error(err);
    setStatus('Fel vid läsning: ' + (err?.message || err));
    alert('Kunde inte läsa filen. Är det en giltig .xlsx/.xls/.csv?\\n' + (err?.message || err));
  }
}

function populateSheetSelect(names){
  ui.sheet.innerHTML = names.map(n => `<option>${escapeHtml(n)}</option>`).join('');
}

function onSheetChange(){
  const name = ui.sheet.value;
  if(!workbook || !name) return;
  const ws = workbook.Sheets[name];
  if(!ws) return;
  activeRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, cellDates: true });
  rebuildFromActiveRows();
}

function rebuildFromActiveRows(){
  // Normalize columns (case-insensitive mapping)
  const mapped = normalizeRows(activeRows, ['UserName','TimeStamp','UpdateCode']);
  // Filter valid rows
  const rows = mapped.filter(r => r.UserName != null && r.TimeStamp != null);
  // Parse timestamp to Date
  rows.forEach(r => r.TimeStamp = toDate(r.TimeStamp));
  // Sort
  rows.sort((a,b) => a.UserName.localeCompare(b.UserName) || (a.TimeStamp - b.TimeStamp));

  const inactivity = Math.max(1, parseInt(ui.idle.value || '15', 10));
  setStatus(`Bearbetar ${rows.length} rader ...`);
  const report = computeReport(rows, inactivity);
  currentReport = report;
  renderReport(report, {
    srcName: 'Uppladdad fil',
    genTime: new Date().toISOString()
  });
}


// --- CSV fallback (no XLSX required) ---
function detectDelimiter(s){
  const first = s.split(/\r?\n/,1)[0] || "";
  const score = [
    [';', (first.match(/;/g)||[]).length],
    [',', (first.match(/,/g)||[]).length],
    ['\t', (first.match(/\t/g)||[]).length],
  ];
  score.sort((a,b)=>b[1]-a[1]);
  return (score[0][1]>0 ? score[0][0] : ',');
}
function parseCSVLine(line, delim){
  const out = []; let cur = ''; let q = false; let i=0;
  while(i < line.length){
    const ch = line[i];
    if(ch === '"'){
      if(q && line[i+1] === '"'){ cur += '"'; i+=2; continue; }
      q = !q; i++; continue;
    }
    if(!q && ch === delim){ out.push(cur); cur=''; i++; continue; }
    cur += ch; i++;
  }
  out.push(cur);
  return out;
}
function parseCSV(text){
  const delim = detectDelimiter(text);
  const rows = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if(!rows.length) return [];
  const header = parseCSVLine(rows[0], delim).map(h => h.trim());
  const data = [];
  for(let r=1; r<rows.length; r++){
    const cols = parseCSVLine(rows[r], delim);
    const obj = {};
    for(let i=0;i<header.length;i++) obj[header[i]] = cols[i];
    data.push(obj);
  }
  return data;
}


async function serverParse(file){
  const endpoints = ['/api/parse-xlsx', '/.netlify/functions/parse-xlsx'];
  let lastErr = null;
  for (const url of endpoints){
    try{
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type':'application/octet-stream', 'X-Filename': file.name || '' },
        body: file
      });
      if(res.ok){
        const data = await res.json();
        if(data && data.rows){
          activeRows = data.rows;
          const names = data.sheets || (data.sheet ? [data.sheet] : ['Server']);
          populateSheetSelect(names);
          document.getElementById('sheetSelect').value = names[0];
          rebuildFromActiveRows();
          setStatus('Excel lästes via server (' + url + ').');
          return;
        }
      } else {
        lastErr = new Error('HTTP ' + res.status);
      }
    }catch(e){
      lastErr = e;
    }
  }
  throw new Error('Servern kunde inte läsa Excel (' + (lastErr && lastErr.message || lastErr || 'okänd') + ')');
}

// ---- Report computation (same logik som backenden) ----
function computeReport(rows, inactivityMinutes){
  const thresholdMs = inactivityMinutes * 60 * 1000;
  // Group by user
  const byUser = new Map();
  for(const r of rows){
    const u = String(r.UserName ?? '').trim();
    if(!u) continue;
    if(!byUser.has(u)) byUser.set(u, []);
    byUser.get(u).push(r);
  }
  // Sort per user
  for(const [u, list] of byUser){
    list.sort((a,b) => a.TimeStamp - b.TimeStamp);
  }

  const perUser = {};
  let globalActiveSeconds = 0;
  let globalTotalPicks = rows.length;
  let firstPick = null, lastPick = null;

  const updateCountsGlobal = {};

  for(const r of rows){
    const code = String(r.UpdateCode ?? '');
    updateCountsGlobal[code] = (updateCountsGlobal[code] || 0) + 1;
    const t = r.TimeStamp;
    if(!firstPick || t < firstPick) firstPick = t;
    if(!lastPick || t > lastPick) lastPick = t;
  }

  for(const [user, list] of byUser){
    // sessionize
    const sessions = [];
    if(list.length){
      let sessStart = list[0].TimeStamp;
      let prev = list[0].TimeStamp;
      let sessPicks = 1;

      for(let i=1;i<list.length;i++){
        const t = list[i].TimeStamp;
        if((t - prev) >= thresholdMs){
          // close at prev
          const dur = Math.max(0, (prev - sessStart)/1000);
          sessions.push({ start: sessStart.toISOString(), end: prev.toISOString(), duration_seconds: Math.floor(dur), picks: sessPicks });
          // new
          sessStart = t;
          sessPicks = 1;
        }else{
          sessPicks += 1;
        }
        prev = t;
      }
      // close last
      const durLast = Math.max(0, (prev - sessStart)/1000);
      sessions.push({ start: sessStart.toISOString(), end: prev.toISOString(), duration_seconds: Math.floor(durLast), picks: sessPicks });
    }

    const totalActiveSeconds = sessions.reduce((a,s)=>a+(s.duration_seconds||0),0);
    const totalActiveHours = totalActiveSeconds/3600;
    const pph = totalActiveHours>0 ? (list.length/totalActiveHours) : null;

    globalActiveSeconds += totalActiveSeconds;

    perUser[user] = {
      user,
      total_picks: list.length,
      sessions,
      n_sessions: sessions.length,
      active_seconds: totalActiveSeconds,
      active_hours: round(totalActiveHours, 3),
      picks_per_active_hour: pph!=null ? round(pph, 3) : null,
      first_pick: list[0]?.TimeStamp?.toISOString() ?? null,
      last_pick: list[list.length-1]?.TimeStamp?.toISOString() ?? null,
      updatecode_counts: countBy(list.map(r => String(r.UpdateCode ?? ''))),
    };
  }

  const globalActiveHours = globalActiveSeconds/3600;
  const globalPPH = globalActiveHours>0 ? (globalTotalPicks/globalActiveHours) : null;

  return {
    meta: {
      source_filename: '',
      generated_utc: new Date().toISOString(),
      inactivity_threshold_minutes: inactivityMinutes
    },
    global: {
      total_picks: globalTotalPicks,
      n_users: byUser.size,
      active_seconds: globalActiveSeconds,
      active_hours: round(globalActiveHours, 3),
      picks_per_active_hour: globalPPH!=null ? round(globalPPH, 3) : null,
      updatecode_counts: updateCountsGlobal,
      first_pick: firstPick ? firstPick.toISOString() : null,
      last_pick: lastPick ? lastPick.toISOString() : null,
    },
    per_user: perUser,
  };
}

// ---- Rendering ----

function getUserFilterOptions(){
  const mode = ui.userMode?.value || 'top8';
  const q = (ui.userFilter?.value || '').trim().toLowerCase();
  return { mode, q };
}
function renderUsersDaily(){
  if(!Array.isArray(activeRows)) return;
  const { mode, q } = getUserFilterOptions();
  const udDaySet = new Set();
  const totalsByUser = {};
  for(const r of activeRows){
    const t = toDate(r.TimeStamp); if(!t) continue;
    const d = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    const u = (String(r.UserName||'').trim() || 'Okänd');
    if(q && !u.toLowerCase().includes(q)) continue;
    udDaySet.add(d);
    totalsByUser[u] = (totalsByUser[u]||0) + 1;
  }
  const udDayLabels = Array.from(udDaySet).sort();

  let chosenUsers = Object.keys(totalsByUser).sort((a,b)=>totalsByUser[b]-totalsByUser[a]);
  if(mode === 'top8') chosenUsers = chosenUsers.slice(0,8);
  else if(mode === 'top15') chosenUsers = chosenUsers.slice(0,15);
  const useOthers = (mode !== 'alla');
  const udCounts = {}; for(const u of chosenUsers) udCounts[u] = {}; if(useOthers) udCounts['Övriga'] = {};

  for(const r of activeRows){
    const t = toDate(r.TimeStamp); if(!t) continue;
    const d = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    const uRaw = (String(r.UserName||'').trim() || 'Okänd');
    if(q && !uRaw.toLowerCase().includes(q)) continue;
    const u = (useOthers && !chosenUsers.includes(uRaw)) ? 'Övriga' : uRaw;
    udCounts[u] = udCounts[u] || {};
    udCounts[u][d] = (udCounts[u][d]||0) + 1;
  }

  const udSeries = Object.keys(udCounts).map(u => ({ label:u, data: udDayLabels.map(d => udCounts[u][d]||0) }));
  if(udDayLabels.length){
    makeOrUpdateStacked('usersDailyChart', udDayLabels, udSeries, 'Plock per användare per dag', 'usersDaily');
  } else {
    const c = document.getElementById('usersDailyChart'); if(c){ const ctx=c.getContext('2d'); ctx?.clearRect(0,0,c.width,c.height); }
  }
}
function renderReport(report, overrideMeta){
  // Meta
  const meta = report.meta || {};
  document.getElementById('meta').textContent = `Inaktivitetströskel: ${report.meta.inactivity_threshold_minutes} min`;
  document.getElementById('srcName').textContent = overrideMeta?.srcName || (meta.source_filename || 'report.json');
  document.getElementById('genTime').textContent = new Date(overrideMeta?.genTime || meta.generated_utc).toLocaleString();

  // KPIs
  const g = report.global;
  text('kpiTotalPicks', num(g.total_picks));
  renderUsersDaily();
}

  text('kpiUsers', num(g.n_users));
  text('kpiHours', num(g.active_hours));
  text('kpiPPH', g.picks_per_active_hour!=null ? g.picks_per_active_hour.toLocaleString('sv-SE') : '–');

  // Table
  const tbody = ui.userTableBody;
  tbody.innerHTML = '';
  const users = Object.values(report.per_user)
    .sort((a,b) => (b.picks_per_active_hour || -1) - (a.picks_per_active_hour || -1));
  for(const u of users){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(u.user)}</td>
      <td>${num(u.total_picks)}</td>
      <td>${num(u.active_hours)}</td>
      <td>${u.picks_per_active_hour!=null ? u.picks_per_active_hour.toLocaleString('sv-SE') : '–'}</td>
      <td>${num(u.n_sessions)}</td>
      <td>${formatTS(u.first_pick)}</td>
      <td>${formatTS(u.last_pick)}</td>
    `;
    tbody.appendChild(tr);
  }

  // Charts
  const top = users
    .filter(u => u.picks_per_active_hour != null)
    .slice(0, 10);
  makeOrUpdateBar('pphChart',
    top.map(u => u.user),
    top.map(u => u.picks_per_active_hour),
    'Plock / aktiv timme (top 10)',
    'pph');

  const upd = g.updatecode_counts || {};
  const updLabels = Object.keys(upd);
  const updValues = updLabels.map(k => k in upd ? upd[k] : 0);
  makeOrUpdateBar('updateChart', updLabels, updValues, 'Antal per UpdateCode', 'updates');
  // Per dag: räkna plock per datum (lokal tid) över aktiv period
  const dayMap = new Map();
  for(const r of activeRows){
    const t = toDate(r.TimeStamp);
    if(!t) continue;
    const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    dayMap.set(key, (dayMap.get(key)||0) + 1);
  }
  const dayLabels = Array.from(dayMap.keys()).sort();
  const dayValues = dayLabels.map(k => dayMap.get(k));
  if(dayLabels.length){
    makeOrUpdateBar('dailyChart', dayLabels, dayValues, 'Plock per dag', 'daily');
  }

}

function makeOrUpdateBar(canvasId, labels, values, title, key){
  const ctx = document.getElementById(canvasId).getContext('2d');
  if(charts[key]) charts[key].destroy();
  charts[key] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: title, data: values }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title }
      },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 60, minRotation: 0 } },
        y: { beginAtZero: true }
      }
    }
  });

function makeOrUpdateStacked(canvasId, labels, series, title, key){
  const ctx = document.getElementById(canvasId).getContext('2d');
  if(charts[key]) charts[key].destroy();
  const base = ['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#f87171','#22d3ee','#c084fc','#f59e0b','#10b981','#e879f9','#fb7185'];
  const datasets = series.map((s, i) => ({
    label: s.label,
    data: s.data,
    backgroundColor: base[i % base.length],
    borderWidth: 0,
    borderRadius: 4
  }));
  charts[key] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        title: { display: true, text: title }
      },
      scales: {
        x: { stacked: true, ticks: { autoSkip: false, maxRotation: 60, minRotation: 0 } },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });
}
}

// ---- Helpers ----
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function text(id, t){ const el = document.getElementById(id); if(el) el.textContent = t; }
function num(v){ return v != null ? Number(v).toLocaleString('sv-SE') : '–'; }
function esc(s){ return escapeHtml(String(s ?? '')); }
function formatTS(iso){ return iso ? new Date(iso).toLocaleString() : '–'; }
function round(n, d){ const p = Math.pow(10,d); return Math.round(n*p)/p; }

function toDate(v){
  if(v instanceof Date) return v;
  const t = new Date(v);
  if(!isNaN(t.getTime())) return t;
  if(typeof v === 'number'){ // Excel serial
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v*24*3600*1000);
  }
  return new Date(NaN);
}

function normalizeRows(rows, required){
  if(!rows.length) return [];
  const first = rows[0];
  const keys = Object.keys(first);
  const lcMap = {};
  for(const k of keys) lcMap[k.toLowerCase()] = k;

  const map = {};
  for(const need of required){
    const hit = lcMap[need.toLowerCase()];
    if(hit) map[hit] = need;
  }
  // Remap
  return rows.map(r => {
    const obj = {};
    for(const k of Object.keys(r)){
      const newK = map[k] || k; // keep others as is
      obj[newK] = r[k];
    }
    return obj;
  });
}

function countBy(arr){
  const m = {};
  for(const v of arr){ const k = String(v ?? ''); m[k] = (m[k]||0)+1; }
  return m;
}
  ui.userMode?.addEventListener('change', renderUsersDaily);
  ui.userFilter?.addEventListener('input', ()=>{ clearTimeout(window.__udt); window.__udt=setTimeout(renderUsersDaily,200); });

>>>>>>> d8d7a1e89c1ca5c243a59af23b3a3e094fbe6945
