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
    "https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js",
    "/js/vendor/xlsx.full.min.js",
    "/vendor/xlsx.full.min.js"
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
  try{
    workbook = await fileToWorkbook(file);
    const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    if(!names.length){
      alert('Kunde läsa filen men hittade inga arbetsblad. Är det en tom fil eller ogiltigt format?');
      return;
    }
    populateSheetSelect(names);
    ui.sheet.value = names[0];
    onSheetChange();
    setStatus(`Fil inläst. Hittade ${names.length} blad.`);
  }catch(err){
    console.error(err);
    alert('Kunde inte läsa filen. Är det en giltig .xlsx/.xls/.csv?\n' + err);
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
function renderReport(report, overrideMeta){
  // Meta
  const meta = report.meta || {};
  document.getElementById('meta').textContent = `Inaktivitetströskel: ${report.meta.inactivity_threshold_minutes} min`;
  document.getElementById('srcName').textContent = overrideMeta?.srcName || (meta.source_filename || 'report.json');
  document.getElementById('genTime').textContent = new Date(overrideMeta?.genTime || meta.generated_utc).toLocaleString();

  // KPIs
  const g = report.global;
  text('kpiTotalPicks', num(g.total_picks));
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
