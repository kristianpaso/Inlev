
// /plock page adapter – mobil-polling robustare: testar båda Netlify-URL:er + statusvisning
(function(){
  const $=(s)=>document.querySelector(s);
  const set=(el,v)=>{ if(el) el.textContent=String(v); };

  const KEY='PLOCK_STATE_V1';
  const dateKey=d=>d.toISOString().slice(0,10);
  const hourLabel=d=>{const h=String(d.getHours()).padStart(2,'0');const n=String((d.getHours()+1)%24).padStart(2,'0');return `${h}:00 - ${n}:00`;};
  const load=()=>{ try{return JSON.parse(localStorage.getItem(KEY))||{today:dateKey(new Date()),total:0,error:0,hours:{},voice:true,lastCount:0};}catch{return {today:dateKey(new Date()),total:0,error:0,hours:{},voice:true,lastCount:0};} };
  const save=(s)=>{try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}};
  let st=load();
  (function(){const t=dateKey(new Date());if(st.today!==t){st={today:t,total:0,error:0,hours:{},voice:st.voice,lastCount:0};save(st);}})();

  // --- statusrad för polling
  let pollEl = document.getElementById('pollStatus');
  if(!pollEl){
    pollEl = document.createElement('div');
    pollEl.id = 'pollStatus';
    pollEl.style.cssText = 'position:fixed;left:8px;bottom:8px;background:#0b1320;color:#9fb3d9;border:1px solid #1e2b44;border-radius:8px;padding:6px 8px;font:12px system-ui;z-index:2147483647;opacity:.85';
    pollEl.textContent = 'Polling: init';
    document.body.appendChild(pollEl);
  }
  function setPollStatus(txt){ pollEl && (pollEl.textContent = 'Polling: ' + txt); }

  const chk=$('#voiceOn'); if(chk){chk.checked=!!st.voice;chk.addEventListener('change',()=>{st.voice=chk.checked;save(st);});}

  function pickSV(){ try{const vs=speechSynthesis.getVoices();const sv=vs.find(v=>/sv|swedish/i.test(v.lang));return sv||vs[0];}catch{return null;} }
  window.speechSynthesis?.addEventListener('voiceschanged', pickSV);

  function speak(txt){
    try{
      if(!st.voice) return;
      const u=new SpeechSynthesisUtterance(String(txt));
      const v=pickSV(); if(v) u.voice=v;
      u.lang='sv-SE'; u.rate=1; u.pitch=1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }catch{}
  }

  function renderLog(){ const list=$('#logList'); if(!list) return; list.innerHTML=''; const keys=Object.keys(st.hours).sort(); for(const k of keys){ const li=document.createElement('li'); li.textContent=`${k} : ${st.hours[k]} plock`; list.appendChild(li);} }
  function renderKPI(stats){
    const c=Number(stats.count||0), ek=Number(stats.errorCount||0), tr=!!stats.tracking, g=Number(stats.goal||165);
    set($('#statusText'),`Tracking: ${tr?'PÅ':'AV'} — Plock: ${c}`);
    set($('#totalToday'),st.total); set($('#errorCount'),st.error); set($('#kpiCount'),c);
    const leftOrPlus=(c>=g)?`+${c}`:String(g-c); set($('#badgeValue'),leftOrPlus);
  }
  function onStats(stats){
    const now=new Date(), lbl=hourLabel(now);
    const c=Number(stats.count||0), ek=Number(stats.errorCount||0);
    const delta=c-(st.lastCount||0);
    if(delta!==0){
      const prev=st.hours[lbl]||0; st.hours[lbl]=Math.max(0,prev+delta);
      st.total=c; st.error=ek; st.lastCount=c; save(st); renderLog(); if(delta>0) speak(c);
    }
    renderKPI(stats);
  }

  // Desktop via extension
  let gotEvent=false;
  window.addEventListener('message',ev=>{const m=ev.data||{}; if(m.type!=='PLOCK_STATS') return; const s=m.data?m.data:m; gotEvent=true; onStats(s);});

  // ---- Netlify polling fallback (mobil) – testa flera endpoints
  const ENDPOINTS = [
    'https://sage-vacherin-aa5cd3.netlify.app/plock/state',
    'https://sage-vacherin-aa5cd3.netlify.app/.netlify/functions/plock-state'
  ];
  async function fetchState(){
    for(const url of ENDPOINTS){
      try{
        const r = await fetch(url, { cache:'no-store' });
        if(r.ok){
          const s = await r.json();
          if(s && typeof s==='object'){ return { ok:true, url, data:s }; }
        }
      }catch(e){}
    }
    return { ok:false };
  }

  function startPolling(){
    const POLL_MS=1200;
    setPollStatus('pågår…');
    async function poll(){
      const res = await fetchState();
      if(res.ok){
        setPollStatus('OK från ' + res.url);
        window.postMessage({ type:'PLOCK_STATS', data: res.data }, '*');
      }else{
        setPollStatus('fel (inget svar)');
      }
      setTimeout(poll, POLL_MS);
    }
    poll();
  }

  setTimeout(()=>{ if(!gotEvent) startPolling(); }, 1800);

  // Manuell testknapp (om den finns i DOM)
  const btn = document.getElementById('forceFetch');
  btn?.addEventListener('click', async ()=>{
    const res = await fetchState();
    if(res.ok){
      setPollStatus('OK manuellt');
      window.postMessage({ type:'PLOCK_STATS', data: res.data }, '*');
      alert('Hämtade state från:\\n' + res.url + '\\ncount=' + (res.data?.count ?? 'N/A'));
    }else{
      alert('Kunde inte hämta state från någon endpoint.');
    }
  });

  // Mobil röst-init + wake-lock (Android) – funkar bara om elementen finns
  (function(){
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

  renderLog(); renderKPI({count:st.lastCount,errorCount:st.error,tracking:false,goal:165});
})();
