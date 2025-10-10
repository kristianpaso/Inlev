
// /plock page adapter – persistent daily logs + milestones-only speech + polling
(function(){
  const $=(s)=>document.querySelector(s);
  const set=(el,v)=>{ if(el) el.textContent=String(v); };

  const WEEKDAYS = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
  const STORAGE_KEY='PLOCK_HISTORY_V2';

  function dateKey(d){ return d.toISOString().slice(0,10); } // YYYY-MM-DD
  function hourSlot(d){
    const h=d.getHours(); const n=(h+1)%24;
    return `${String(h).padStart(2,'0')}:00-${String(n).padStart(2,'0')}:00`;
  }

  function load(){
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(raw && typeof raw==='object') return raw;
    } catch {}
    return { days:{}, last:{ date:null, count:0 }, voiceOn:true };
  }
  function save(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch{} }

  let state = load();

  // Voice controls
  const chk=$('#voiceOn'); 
  let voiceOn=true;
  if(chk){ chk.checked = !!(state.voiceOn ?? true); voiceOn = chk.checked; chk.addEventListener('change',()=>{ voiceOn=chk.checked; state.voiceOn=voiceOn; save(state); }); }

  function pickSV(){
    try{
      const vs=speechSynthesis.getVoices();
      const sv=vs.find(v=>/sv|swedish/i.test(v.lang));
      return sv||vs[0]||null;
    }catch{ return null; }
  }
  window.speechSynthesis?.addEventListener('voiceschanged', pickSV);

  function speakNumber(n){
    try{
      if(!voiceOn) return;
      const u=new SpeechSynthesisUtterance(String(n));
      const v=pickSV(); if(v) u.voice=v;
      u.lang='sv-SE'; u.rate=1; u.pitch=1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }catch{}
  }

  const MILESTONES = new Set([50,100,125,150,200,225,250,275,300,310,320,330,340,350,360]);

  function ensureDay(iso){
    if(!state.days[iso]) state.days[iso] = { total:0, hours:{} };
  }

  function applyDelta(now, delta, newCount){
    const iso = dateKey(now);
    ensureDay(iso);
    const slot = hourSlot(now);
    const prev = state.days[iso].hours[slot] || 0;
    state.days[iso].hours[slot] = Math.max(0, prev + delta);
    state.days[iso].total = newCount;
    state.last = { date: iso, count: newCount };
    save(state);
  }

  function renderAll(currentStats){
    // KPI
    const c=Number(currentStats.count||0), ek=Number(currentStats.errorCount||0), tr=!!currentStats.tracking, g=Number(currentStats.goal||165);
    set($('#statusText'),`Tracking: ${tr?'PÅ':'AV'} — Plock: ${c}`);
    set($('#kpiCount'), c);
    set($('#totalToday'), (state.days[dateKey(new Date())]?.total ?? 0));
    set($('#errorCount'), ek);
    set($('#badgeValue'), (c>=g)?`+${c}`:String(g-c));

    // Loggar
    const container = $('#daysContainer');
    if(!container) return;
    container.innerHTML='';

    const todayIso = dateKey(new Date());
    const dayKeys = Object.keys(state.days);
    dayKeys.sort((a,b)=> b.localeCompare(a)); // desc

    // Active day first
    if(state.days[todayIso]){
      container.appendChild(renderDay(todayIso));
      container.appendChild(makeSep());
    }

    for(const iso of dayKeys){
      if(iso===todayIso) continue;
      container.appendChild(renderDay(iso));
    }
  }

  function makeSep(){ const d=document.createElement('div'); d.className='sep'; return d; }

  function renderDay(iso){
    const d = new Date(iso+'T00:00:00');
    const dayName = WEEKDAYS[d.getDay()];
    const total = state.days[iso].total || 0;
    const card = document.createElement('div');
    card.className='card';
    const title = document.createElement('div');
    title.className='section-title';
    title.textContent = `${dayName} | ${iso} | Totalt plock: ${total}`;
    card.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'list';
    const hours = state.days[iso].hours || {};
    const keys = Object.keys(hours).sort();
    for(const k of keys){
      const li = document.createElement('li');
      li.textContent = `${k}: ${hours[k]} plock`;
      list.appendChild(li);
    }
    card.appendChild(list);
    return card;
  }

  function onStats(stats){
    const now = new Date();
    const newCount = Number(stats.count||0);
    const prevCount = Number(state.last?.count||0);
    const delta = newCount - prevCount;

    if(delta !== 0){
      applyDelta(now, delta, newCount);
      // Milestones only speech
      if(delta > 0 && MILESTONES.has(newCount)){ speakNumber(newCount); }
    }

    renderAll(stats);
  }

  // Desktop events från extension
  let gotEvent=false;
  window.addEventListener('message',ev=>{const m=ev.data||{}; if(m.type!=='PLOCK_STATS') return; const s=m.data?m.data:m; gotEvent=true; onStats(s);});

  // Netlify polling fallback (mobil)
  const ENDPOINTS=['https://sage-vacherin-aa5cd3.netlify.app/plock/state','https://sage-vacherin-aa5cd3.netlify.app/.netlify/functions/plock-state'];
  async function fetchState(){
    for(const url of ENDPOINTS){
      try{ const r=await fetch(url,{cache:'no-store'}); if(r.ok){ const s=await r.json(); if(s&&typeof s==='object') return {ok:true,url,data:s}; } }catch{}
    } return {ok:false};
  }
  function startPolling(){
    const POLL_MS=1200;
    async function poll(){ const res=await fetchState(); if(res.ok){ window.postMessage({type:'PLOCK_STATS',data:res.data},'*'); } setTimeout(poll,POLL_MS); }
    poll();
  }
  setTimeout(()=>{ if(!gotEvent) startPolling(); }, 2000);

  // Voice init + wake lock (om knappar finns)
  ;(function(){
    const btnInit=document.getElementById('voiceInit');
    const chkAwake=document.getElementById('keepAwake');
    let wakeLock=null;
    function primeTTS(){ try{ const u=new SpeechSynthesisUtterance(''); u.lang='sv-SE'; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch{} }
    btnInit?.addEventListener('click',()=>{ primeTTS(); const u=new SpeechSynthesisUtterance('Röst aktiverad'); const v=pickSV(); if(v) u.voice=v; u.lang='sv-SE'; speechSynthesis.speak(u); });
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ try{ speechSynthesis.resume(); }catch{} } });
    async function requestWakeLock(){ try{ if('wakeLock' in navigator && !wakeLock){ wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>{wakeLock=null;}); } }catch{} }
    async function releaseWakeLock(){ try{ await (wakeLock?.release()); }catch{} finally{ wakeLock=null; } }
    chkAwake?.addEventListener('change',e=>{ if(e.target.checked) requestWakeLock(); else releaseWakeLock(); });
    window.addEventListener('focus',()=>{ if(chkAwake?.checked && !wakeLock) requestWakeLock(); });
  })();

  // Initial render from stored state
  renderAll({count: state.last?.count || 0, errorCount: 0, tracking: false, goal: 165});
})();
