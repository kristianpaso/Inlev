const { useEffect, useMemo, useRef, useState } = React;

function apiBase() {
  return (window.BK && window.BK.API_BASE) ? String(window.BK.API_BASE).replace(/\/$/, '') : '';
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const data = ct.indexOf('application/json') >= 0 ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : (typeof data === 'string' ? data : 'Request failed');
    throw new Error(msg);
  }
  return data;
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const data = ct.indexOf('application/json') >= 0 ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : (typeof data === 'string' ? data : 'Request failed');
    throw new Error(msg);
  }
  return data;
}


function timeOfDayFromHour(h) {
  if (h >= 5 && h < 10) return 'morgon';
  if (h >= 10 && h < 16) return 'dag';
  if (h >= 16 && h < 22) return 'kvall';
  return 'natt';
}

function windCategoryFromSpeed(ms) {
  if (ms == null || Number.isNaN(ms)) return null;
  if (ms < 4) return 'svag';
  if (ms < 8) return 'medel';
  return 'hard';
}

function formatWindDir(deg) {
  if (deg == null || Number.isNaN(deg)) return '';
  const dirs = ['N','NO','O','SO','S','SV','V','NV'];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return String(Math.round(deg)) + '° (' + dirs[idx] + ')';
}

function WindArrow(props) {
  const deg = (props && props.deg != null) ? props.deg : 0;
  const d = Number.isFinite(deg) ? deg : 0;
  return (
    <span title={'Vindriktning ' + Math.round(d) + '°'} style={{display:'inline-flex', alignItems:'center'}}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{transform:'rotate(' + d + 'deg)'}}>
        <path d="M12 3l4 7h-3v11h-2V10H8l4-7Z" fill="currentColor" opacity="0.95"/>
      </svg>
    </span>
  );
}

function IconFish() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M12 6c-1.2 1.7-2 3.8-2 6s.8 4.3 2 6" stroke="currentColor" strokeWidth="1.6" opacity=".7"/>
      <path d="M21 9l2-2m-2 8l2 2" stroke="currentColor" strokeWidth="1.6" opacity=".6"/>
      <circle cx="16.5" cy="11" r="1" fill="currentColor"/>
    </svg>
  );
}

// --- Zoner (lokalt) ---
function areaKeyFromLatLon(lat, lon) {
  const ok = (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon));
  const a = ok ? (lat.toFixed(2) + '_' + lon.toFixed(2)) : 'unknown';
  return 'bk_area_' + a;
}

function loadZones(areaKey) {
  try {
    const raw = localStorage.getItem('BK_ZONES_' + areaKey) || '[]';
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveZones(areaKey, zones) {
  localStorage.setItem('BK_ZONES_' + areaKey, JSON.stringify(zones || []));
}

function prettyZoneType(t) {
  const map = {
    kant: 'Kant',
    plata: 'Platå',
    djup: 'Djuphåla',
    vindkant: 'Vindkant',
    sund: 'Sund/Inlopp',
    vass: 'Vass/Struktur',
    land: 'Landspot'
  };
  return map[t] || t;
}

function defaultRadiusForType(t) {
  switch (t) {
    case 'kant': return 160;
    case 'plata': return 180;
    case 'djup': return 140;
    case 'vindkant': return 220;
    case 'sund': return 160;
    case 'vass': return 140;
    case 'land': return 90;
    default: return 150;
  }
}

function ZoneModal(props) {
  const open = !!(props && props.open);
  const onClose = props.onClose || function(){};
  const onCreate = props.onCreate || function(){};
  const pendingPoint = props.pendingPoint;

  const [type, setType] = useState('kant');
  const [radius, setRadius] = useState(160);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setType('kant');
      setRadius(160);
      setName('');
    }
  }, [open]);

  useEffect(() => {
    if (open) setRadius(defaultRadiusForType(type));
  }, [type, open]);

  if (!open) return null;

  const canSave = pendingPoint && Number.isFinite(pendingPoint.lat) && Number.isFinite(pendingPoint.lon);

  return (
    <div className="modalBack" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="head">
          <div>
            <h3>Skapa zon</h3>
            <div className="muted" style={{fontSize:12, marginTop:4}}>
              1) Klicka i kartan där zonen ska vara. 2) Välj typ & radie. 3) Spara.
            </div>
          </div>
          <button className="btn" onClick={onClose}>Stäng</button>
        </div>
        <div className="body">
          <div className="row">
            <div className="field">
              <label>Typ</label>
              <select value={type} onChange={(e)=>setType(e.target.value)}>
                <option value="kant">Kant (grunt → djupt)</option>
                <option value="plata">Platå / grundflak</option>
                <option value="djup">Djuphåla</option>
                <option value="vindkant">Vindkant (vindutsatt sida)</option>
                <option value="sund">Sund / in- & utlopp</option>
                <option value="vass">Vass / struktur</option>
                <option value="land">Landspot (brygga/stenkant)</option>
              </select>
            </div>
            <div className="field">
              <label>Radie (meter)</label>
              <input type="number" min="40" max="600" value={radius} onChange={(e)=>setRadius(Number(e.target.value)||0)} />
            </div>
            <div className="field">
              <label>Namn (valfritt)</label>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="t.ex. Udden, Kant 6m" />
            </div>
            <div className="field">
              <label>Position</label>
              <input value={canSave ? (pendingPoint.lat.toFixed(5) + ', ' + pendingPoint.lon.toFixed(5)) : 'Klicka i kartan...'} readOnly />
            </div>
          </div>

          <div className="hr"></div>

          <div className="actions">
            <button className="btn primary" disabled={!canSave} onClick={()=>{
              if (!canSave) return;
              onCreate({
                id: Math.random().toString(16).slice(2),
                type: type,
                radius: radius,
                name: String(name || '').trim(),
                lat: pendingPoint.lat,
                lon: pendingPoint.lon,
                createdAt: Date.now()
              });
              onClose();
            }}>
              Spara zon
            </button>
            <div className="muted" style={{alignSelf:'center'}}>
              Tipset: zoner är stora → du slipper spot-drama men hittar rätt område.
            </div>
          </div>
        </div>
        <div className="headerActions">
          <button className="iconBtn" title="Donation" onClick={() => setShowDonate(!showDonate)}>💛</button>
        </div>
      </div>



      <CatchModal
        open={catchOpen}
        onClose={()=>setCatchOpen(false)}
        onSave={async (p)=>{ try { setLoading(true); await saveCatch(p); } catch(e){ setToast(String((e&&e.message)?e.message:e)); } finally { setLoading(false);} }}
        onUseWeather={getPlaceAndWeather}
        hasWeather={!!wx}
        defaultSpecies={species}
      />
      <LureCheckModal
        open={lureOpen}
        onClose={()=>setLureOpen(false)}
        onCheck={async (p)=>{ try { setLoading(true); await checkLure(p); setToast('Bete-koll klar.'); setLureOpen(false);} catch(e){ setToast(String((e&&e.message)?e.message:e)); } finally { setLoading(false);} }}
        onUseWeather={getPlaceAndWeather}
        hasWeather={!!wx}
      />


    </div>
  );
}

function MapZones(props) {
  const loc = props.loc;
  const windDir = props.windDir;
  const zones = props.zones || [];
  const onPickLocation = props.onPickLocation || function(){};

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const windMarkerRef = useRef(null);
  const zoneLayersRef = useRef([]);

  // init
  useEffect(() => {
    if (!window.L) return;
    if (mapRef.current) return;

    const L = window.L;
    const map = L.map(mapEl.current, { zoomControl: true });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    map.setView([59.33, 18.07], 6);

    map.on('click', function(e){
      onPickLocation({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // center on loc
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      map.setView([loc.lat, loc.lon], 12, { animate: true });
    }
  }, [loc ? loc.lat : 0, loc ? loc.lon : 0]);

  // user marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const L = window.L;

    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      if (!markerRef.current) {
        markerRef.current = L.circleMarker([loc.lat, loc.lon], { radius: 6, weight: 2, opacity: 0.9, fillOpacity: 0.6 }).addTo(map);
      } else {
        markerRef.current.setLatLng([loc.lat, loc.lon]);
      }
    }
  }, [loc ? loc.lat : 0, loc ? loc.lon : 0]);

  // wind marker (triangle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const L = window.L;

    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && windDir != null) {
      const d = Number.isFinite(windDir) ? windDir : 0;
      const html = '<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:16px solid rgba(56,189,248,.95);transform: rotate(' + d + 'deg);filter: drop-shadow(0 4px 8px rgba(0,0,0,.35));"></div>';
      const icon = L.divIcon({ className:'', html: html, iconSize:[16,16], iconAnchor:[8,8] });

      if (!windMarkerRef.current) {
        windMarkerRef.current = L.marker([loc.lat, loc.lon], { icon: icon }).addTo(map);
      } else {
        windMarkerRef.current.setLatLng([loc.lat, loc.lon]);
        windMarkerRef.current.setIcon(icon);
      }
    }
  }, [loc ? loc.lat : 0, loc ? loc.lon : 0, windDir]);

  // zones render
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const L = window.L;

    // clear old
    for (let i=0;i<zoneLayersRef.current.length;i++){
      try { map.removeLayer(zoneLayersRef.current[i]); } catch(e){}
    }
    zoneLayersRef.current = [];

    for (let i=0;i<zones.length;i++){
      const z = zones[i];
      if (!z || !Number.isFinite(z.lat) || !Number.isFinite(z.lon)) continue;
      const c = L.circle([z.lat, z.lon], { radius: Number(z.radius)||150, weight: 2, opacity: 0.9, fillOpacity: 0.08 }).addTo(map);
      c.bindTooltip((z.name ? z.name : prettyZoneType(z.type)) + ' • ' + Math.round(Number(z.radius)||150) + 'm');
      zoneLayersRef.current.push(c);
    }
  }, [zones.length]);

  return <div className="mapWrap" ref={mapEl} aria-label="Karta" />;
}


function CatchModal(props) {
  const open = !!(props && props.open);
  const onClose = props.onClose || function(){};
  const onSave = props.onSave || function(){};
  const onUseWeather = props.onUseWeather || function(){};
  const hasWeather = !!props.hasWeather;

  const [species, setSpecies] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (open) {
      setSpecies(props.defaultSpecies || 'gadda');
      setLengthCm('');
      setWeightKg('');
      setNotes('');
      setFile(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modalBack" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="head">
          <div>
            <h3>Registrera fångst</h3>
            <div className="muted" style={{fontSize:12, marginTop:4}}>
              Ladda upp bild + fyll i snabbt. Plats/väder/lufttryck kopplas automatiskt om du hämtat det.
            </div>
          </div>
          <button className="btn" onClick={onClose}>Stäng</button>
        </div>
        <div className="body">
          <div className="row">
            <div className="field">
              <label>Art</label>
              <select value={species} onChange={(e)=>setSpecies(e.target.value)}>
                <option value="gadda">Gädda</option>
                <option value="gos">Gös</option>
                <option value="abborre">Abborre</option>
              </select>
            </div>
            <div className="field">
              <label>Längd (cm)</label>
              <input value={lengthCm} onChange={(e)=>setLengthCm(e.target.value)} placeholder="t.ex. 65" />
            </div>
            <div className="field">
              <label>Vikt (kg)</label>
              <input value={weightKg} onChange={(e)=>setWeightKg(e.target.value)} placeholder="t.ex. 2.4" />
            </div>
            <div className="field">
              <label>Bild</label>
              <input type="file" accept="image/*" onChange={(e)=>setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
            </div>
            <div className="field">
              <label>Anteckning</label>
              <input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="t.ex. tog vid kanten, 6m" />
            </div>
          </div>

          <div className="actions">
            <button className="btn" onClick={onUseWeather} disabled={hasWeather}>Hämta plats & väder</button>
            <button className="btn primary" onClick={()=>{
              onSave({ species, lengthCm, weightKg, notes, file });
            }}>
              Spara fångst
            </button>
          </div>

          {!hasWeather ? <div className="muted" style={{marginTop:10}}>Tips: tryck “Hämta plats & väder” så sparas vind + lufttryck också.</div> : null}
        </div>
      </div>
    </div>
  );
}

function LureCheckModal(props) {
  const open = !!(props && props.open);
  const onClose = props.onClose || function(){};
  const onCheck = props.onCheck || function(){};
  const onUseWeather = props.onUseWeather || function(){};
  const hasWeather = !!props.hasWeather;

  const [lureType, setLureType] = useState('jigg');
  const [lureColor, setLureColor] = useState('natural');
  const [lureSize, setLureSize] = useState('medium');
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (open) {
      setLureType('jigg');
      setLureColor('natural');
      setLureSize('medium');
      setFile(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modalBack" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="head">
          <div>
            <h3>Kolla bete</h3>
            <div className="muted" style={{fontSize:12, marginTop:4}}>
              Ladda upp bild och välj snabbt typ/färg/storlek. Du får ett tydligt svar.
            </div>
          </div>
          <button className="btn" onClick={onClose}>Stäng</button>
        </div>
        <div className="body">
          <div className="row">
            <div className="field">
              <label>Typ</label>
              <select value={lureType} onChange={(e)=>setLureType(e.target.value)}>
                <option value="jigg">Jigg / Shad</option>
                <option value="wobbler">Wobbler</option>
                <option value="crank">Crankbait</option>
                <option value="spinner">Spinnare</option>
                <option value="spinnerbait">Spinnerbait</option>
                <option value="chatter">Chatterbait</option>
                <option value="jerk">Jerkbait</option>
                <option value="lipless">Lipless</option>
                <option value="blade">Blade bait</option>
                <option value="drop">Drop shot</option>
              </select>
            </div>
            <div className="field">
              <label>Färg</label>
              <select value={lureColor} onChange={(e)=>setLureColor(e.target.value)}>
                <option value="natural">Naturlig (silver/brun/green)</option>
                <option value="bright">Stark (chartreuse/orange)</option>
                <option value="dark">Mörk (svart/mörk)</option>
                <option value="silver">Silver</option>
                <option value="chartreuse">Chartreuse</option>
                <option value="orange">Orange</option>
                <option value="black">Svart</option>
              </select>
            </div>
            <div className="field">
              <label>Storlek</label>
              <select value={lureSize} onChange={(e)=>setLureSize(e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="field">
              <label>Bild</label>
              <input type="file" accept="image/*" onChange={(e)=>setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
            </div>
          </div>

          <div className="actions">
            <button className="btn" onClick={onUseWeather} disabled={hasWeather}>Hämta plats & väder</button>
            <button className="btn primary" onClick={()=>{
              onCheck({ lureType, lureColor, lureSize, file });
            }}>
              Kolla nu
            </button>
          </div>

          {!hasWeather ? <div className="muted" style={{marginTop:10}}>Tips: med plats & väder blir svaret mycket säkrare.</div> : null}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [species, setSpecies] = useState('');
  const [platform, setPlatform] = useState('');
  const [timeofday, setTimeofday] = useState('');
  const [wind, setWind] = useState('');
  const [water, setWater] = useState('');
  const [goal, setGoal] = useState('');
  const [depth, setDepth] = useState('');

  // Startflöde (steg-för-steg)
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [autoFromWeather, setAutoFromWeather] = useState(false);

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [fix, setFix] = useState(null);
  const [sonar, setSonar] = useState(null);
  const [toast, setToast] = useState('');

  const [loc, setLoc] = useState(null);
  const [wx, setWx] = useState(null);
  const [wxLoading, setWxLoading] = useState(false);

  const [catchOpen, setCatchOpen] = useState(false);
  const [lureOpen, setLureOpen] = useState(false);
  const [catches, setCatches] = useState([]);
  const [lureCheck, setLureCheck] = useState(null);
  const [showDonate, setShowDonate] = useState(false);


  function labelSpecies(v){
    if (v === 'gadda') return 'Gädda';
    if (v === 'gos') return 'Gös';
    if (v === 'abborre') return 'Abborre';
    return '—';
  }
  function labelGoal(v){
    if (v === 'forsta') return 'Fånga första fisken';
    if (v === 'mer') return 'Fånga fler idag';
    return '—';
  }
  function labelPlatform(v){
    if (v === 'bat') return 'Båt';
    if (v === 'land') return 'Land';
    return '—';
  }
  function labelTime(v){
    if (v === 'morgon') return 'Morgon';
    if (v === 'dag') return 'Dag';
    if (v === 'kvall') return 'Kväll';
    if (v === 'natt') return 'Natt';
    return '—';
  }
  function labelWind(v){
    if (v === 'svag') return 'Svag';
    if (v === 'medel') return 'Medel';
    if (v === 'hard') return 'Hård';
    return '—';
  }
  function labelWater(v){
    if (v === 'klar') return 'Klart';
    if (v === 'mellan') return 'Mellan';
    if (v === 'grumlig') return 'Grumligt';
    return '—';
  }
  function labelDepth(v){
    if (v === 'grunt') return 'Grunt (0–3m)';
    if (v === 'medel') return 'Medel (3–8m)';
    if (v === 'djupt') return 'Djupt (8m+)';
    return '—';
  }

  const stepsInfo = [
    { idx: 0, title: 'Art', value: species ? labelSpecies(species) : '—' },
    { idx: 1, title: 'Mål', value: goal ? labelGoal(goal) : '—' },
    { idx: 2, title: 'Plats', value: platform ? labelPlatform(platform) : '—' },
    { idx: 3, title: 'Tid', value: autoFromWeather ? 'Auto (plats & väder)' : (timeofday ? labelTime(timeofday) : '—') },
    { idx: 4, title: 'Vind', value: autoFromWeather ? 'Auto (plats & väder)' : (wind ? labelWind(wind) : '—') },
    { idx: 5, title: 'Vatten', value: water ? labelWater(water) : '—' },
    { idx: 6, title: 'Djup', value: depth ? labelDepth(depth) : '—' },
  ];


  const api = useMemo(() => apiBase(), []);

  useEffect(() => {
    if (api) setToast('API: ' + api);
  }, []);

  const request = useMemo(() => ({
    species: species,
    platform: platform,
    timeofday: timeofday,
    wind: wind,
    water: water,
    goal: goal,
    depth: depth,
    location: loc,
    weather: wx
  }), [species, platform, timeofday, wind, water, goal, depth, loc, wx]);

  // Zoner
  const areaKey = useMemo(function(){
    const la = (loc && loc.lat != null) ? loc.lat : 0;
    const lo = (loc && loc.lon != null) ? loc.lon : 0;
    return areaKeyFromLatLon(la, lo);
  }, [loc ? loc.lat : 0, loc ? loc.lon : 0]);

  const [zones, setZones] = useState(function(){ return loadZones(areaKey); });
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [pendingPoint, setPendingPoint] = useState(null);

  useEffect(() => {
    setZones(loadZones(areaKey));
  }, [areaKey]);

  function addZone(z) {
    const next = [z].concat(zones).slice(0, 200);
    setZones(next);
    saveZones(areaKey, next);
  }

  function deleteZone(id) {
    const next = zones.filter(function(z){ return z.id !== id; });
    setZones(next);
    saveZones(areaKey, next);
  }

  function nextStep() { setStep(function(s){ return Math.min(s + 1, 8); }); }
  function prevStep() { setStep(function(s){ return Math.max(s - 1, 0); }); }
  function resetWizard() {
    setStarted(false);
    setStep(0);
    setAutoFromWeather(false);
    reset();
  }

  async function makePlan() {
    if (!species || !goal || !platform || !water || !depth || (!autoFromWeather && (!timeofday || !wind))) {
      setToast('Fyll i alla val först.');
      return;
    }

    setLoading(true);
    setToast('');
    setFix(null);
    try {
      const data = await postJSON(api + '/api/beteknepet/plan', request);
      setPlan(data);
      if (data && data.sonar) setSonar(data.sonar);
      setStarted(false);
      setToast('Plan klar. Testa 30 min, sen tryck "Inget napp" om det behövs.');
    } catch (e) {
      setToast(String((e && e.message) ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  async function noBites() {
    setLoading(true);
    setToast('');
    try {
      const lastPlanId = (plan && plan.id) ? plan.id : null;
      const data = await postJSON(api + '/api/beteknepet/nobites', Object.assign({}, request, { lastPlanId: lastPlanId }));
      setFix(data);
      setToast('Snabbfix klar. Gör exakt detta i 20 min.');
    } catch (e) {
      setToast(String((e && e.message) ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchSonar() {
    setToast('');
    setLoading(true);
    try {
      let data = null;
      try {
        data = await postJSON(api + '/api/beteknepet/sonar', request);
      } catch (e) {
        const msg = String((e && e.message) ? e.message : e);
        if (msg.indexOf('Cannot POST') >= 0 || msg.indexOf('404') >= 0) {
          const qs = new URLSearchParams({
            species: species, platform: platform, timeofday: timeofday, wind: wind, water: water, goal: goal, depth: depth
          });
          const url = api + '/api/beteknepet/sonar?' + qs.toString();
          const r = await fetch(url);
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          const d = ct.indexOf('application/json') >= 0 ? await r.json() : await r.text();
          if (!r.ok) throw new Error(typeof d === 'string' ? d : (d && d.error ? d.error : 'sonar failed'));
          data = d;
        } else {
          throw e;
        }
      }

      setSonar(data);
      setToast('Ekolod-inställningar uppdaterade.');
    } catch (e) {
      const msg = String((e && e.message) ? e.message : e);
      setToast(msg);
    } finally {
      setLoading(false);
    }
  }

  async function getPlaceAndWeather() {
    setToast('');
    setWxLoading(true);
    try {
      if (!navigator.geolocation) throw new Error('Din webbläsare stödjer inte plats.');

      const pos = await new Promise(function(resolve, reject){
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 60000
        });
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const l = { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) };
      setLoc(l);

      // Weather (POST -> GET fallback)
      let data = null;
      try {
        data = await postJSON(api + '/api/beteknepet/weather', l);
      } catch (e) {
        const msg = String((e && e.message) ? e.message : e);
        if (msg.indexOf('Cannot POST') >= 0 || msg.indexOf('404') >= 0) {
          const url = api + '/api/beteknepet/weather?lat=' + encodeURIComponent(l.lat) + '&lon=' + encodeURIComponent(l.lon);
          const r = await fetch(url);
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          const d = ct.indexOf('application/json') >= 0 ? await r.json() : await r.text();
          if (!r.ok) throw new Error(typeof d === 'string' ? d : (d && d.error ? d.error : 'weather failed'));
          data = d;
        } else {
          throw e;
        }
      }

      setWx(data);

      const cat = windCategoryFromSpeed(data ? data.windSpeed : null);
      if (cat) setWind(cat);

      const now = new Date();
      setTimeofday(timeOfDayFromHour(now.getHours()));

      setAutoFromWeather(true);
      setToast('Plats & väder hämtat. Vind & tid är uppdaterade automatiskt.');
      // Hoppa över Tid/Vind-steg (snabbt flöde)
      setStep(5);
    } catch (e) {
      setToast(String((e && e.message) ? e.message : e));
    } finally {
      setWxLoading(false);
    }
  }

  async function loadCatchList() {
    try {
      const r = await fetch(api + '/api/beteknepet/catches');
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const d = ct.indexOf('application/json') >= 0 ? await r.json() : [];
      if (Array.isArray(d)) setCatches(d);
    } catch (e) {}
  }

  async function saveCatch(payload) {
    const fd = new FormData();
    fd.append('species', payload.species || species);
    if (payload.lengthCm) fd.append('lengthCm', payload.lengthCm);
    if (payload.weightKg) fd.append('weightKg', payload.weightKg);
    if (payload.notes) fd.append('notes', payload.notes);
    fd.append('platform', platform);
    fd.append('water', water);
    fd.append('depth', depth);
    fd.append('timeofday', timeofday);
    fd.append('wind', wind);
    if (loc && loc.lat != null && loc.lon != null) { fd.append('lat', loc.lat); fd.append('lon', loc.lon); }
    if (wx) {
      if (wx.temperatureC != null) fd.append('tempC', wx.temperatureC);
      if (wx.windSpeed != null) fd.append('windSpeed', wx.windSpeed);
      if (wx.windDir != null) fd.append('windDir', wx.windDir);
      if (wx.pressureHpa != null) fd.append('pressureHpa', wx.pressureHpa);
    }
    if (payload.file) fd.append('image', payload.file);
    const item = await postForm(api + '/api/beteknepet/catches', fd);
    setToast('Fångst sparad ✅');
    setCatchOpen(false);
    await loadCatchList();
    return item;
  }

  async function checkLure(payload) {
    const fd = new FormData();
    fd.append('species', species);
    fd.append('platform', platform);
    fd.append('timeofday', timeofday);
    fd.append('wind', wind);
    fd.append('water', water);
    fd.append('depth', depth);
    fd.append('lureType', payload.lureType);
    fd.append('lureColor', payload.lureColor);
    fd.append('lureSize', payload.lureSize);
    if (payload.file) fd.append('image', payload.file);
    const r = await postForm(api + '/api/beteknepet/lure-check', fd);
    setLureCheck(r);
    return r;
  }

  function reset() {
    setPlan(null);
    setFix(null);
    setSonar(null);
    setToast('');
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>BeteKnepet</h1>
            <p>Rak på sak coach för sjö i Sverige</p>
          </div>
        </div>
        <div className="pills">
          <div className="pill">Första fisk</div>
          <div className="pill">Mer napp</div>
          <div className="pill">Utan spot-drama</div>
        </div>
      </div>


      {plan ? (
        <div className="grid">
          <div className="card">
            <div className="head">
              <div>
                <h2>Plan</h2>
                <div className="sub">Klar. Inga fält visas nu.</div>
              </div>
              <span className="tag">Resultat</span>
            </div>
            <div className="body">
              <div className="plan">
                <div className="block">
                  <h3>Startzoner (utan pinpoint)</h3>
                  <ul className="list">
                    {plan.zones.map((z,i)=>(<li key={i}>{z}</li>))}
                  </ul>
                </div>
                <div className="block">
                  <h3>Beten</h3>
                  <ul className="list">
                    {plan.lures.map((l,i)=>(<li key={i}>{l}</li>))}
                  </ul>
                </div>
                <div className="block">
                  <h3>Tempo</h3>
                  <ul className="list">
                    {plan.tempo.map((t,i)=>(<li key={i}>{t}</li>))}
                  </ul>
                </div>

                {sonar ? (
                  <div className="block">
                    <h3>Ekolod-inställningar</h3>
                    <div className="muted" style={{marginBottom:8}}>
                      Preset: <b>{sonar.preset}</b>
                    </div>
                    <div className="kv">
                      {sonar.recommended.map((it, i) => (
                        <div className="item" key={i}>
                          <div className="k">{it.k}</div>
                          <div className="v">{it.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="actions" style={{marginTop:12}}>
                      <button className="btn" onClick={fetchSonar} disabled={loading}>Uppdatera ekolod</button>
                    </div>
                  </div>
                ) : (
                  <div className="block">
                    <h3>Ekolod</h3>
                    <div className="muted">Tryck för att få inställningar utifrån din registrering.</div>
                    <div className="actions" style={{marginTop:10}}>
                      <button className="btn" onClick={fetchSonar} disabled={loading}>Ekolod</button>
                    </div>
                  </div>
                )}

                <div className="kv">
                  <div className="item">
                    <div className="k">Fokusdjup</div>
                    <div className="v">{plan.focusDepth}</div>
                  </div>
                  <div className="item">
                    <div className="k">Varför detta</div>
                    <div className="v">{plan.why}</div>
                  </div>
                </div>

                <div className="actions">
                  <button className="btn" onClick={()=>{ setCatchOpen(true); setToast(""); }} disabled={loading}>Registrera fångst</button>
                  <button className="btn" onClick={()=>{ setLureOpen(true); setToast(""); }} disabled={loading}>Kolla bete</button>
                  <button className="btn danger" onClick={noBites} disabled={loading}>
                    {loading ? 'Jobbar...' : 'Inget napp'}
                  </button>
                  <button className="btn primary" onClick={() => { resetWizard(); setStarted(true); setPlan(null); setFix(null); setSonar(null); setLureCheck(null); }}>
                    Registrera ny plan
                  </button>
                </div>

                {fix ? (
                  <div className="block">
                    <h3>Snabbfix (20 min)</h3>
                    <ul className="list">
                      {fix.steps.map((s,i)=>(<li key={i}>{s}</li>))}
                    </ul>
                    <div className="hr"></div>
                    <div className="muted">{fix.note}</div>
                  </div>
                ) : null}
              </div>

              {lureCheck ? (
                <div className="block" style={{marginTop:12}}>
                  <h3>Bete-koll</h3>
                  <div className="kv">
                    <div className="item"><div className="k">Bedömning</div><div className="v"><b>{lureCheck.verdict}</b> (score {lureCheck.score})</div></div>
                  </div>
                  {lureCheck.reasons && lureCheck.reasons.length ? (
                    <ul className="list">
                      {lureCheck.reasons.map((s,i)=>(<li key={i}>{s}</li>))}
                    </ul>
                  ) : null}
                  {lureCheck.suggestions && lureCheck.suggestions.length ? (
                    <div>
                      <div className="muted"><b>Förslag</b></div>
                      <ul className="list">
                        {lureCheck.suggestions.map((s,i)=>(<li key={i}>{s}</li>))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              
              <div className="block" style={{marginTop:12}}>
                <h3>Mina fångster</h3>
                {(!catches || catches.length === 0) ? (
                  <div className="muted">Inga fångster ännu. Tryck <b>Registrera fångst</b> när du fått fisk.</div>
                ) : (
                  <div className="zoneList">
                    {catches.slice(0, 8).map((c) => (
                      <div className="zoneItem" key={c.id}>
                        <div style={{display:'flex', gap:10, alignItems:'center'}}>
                          {c.imageUrl ? (
                            <img src={api + c.imageUrl} alt="Fångst" style={{width:54, height:54, objectFit:'cover', borderRadius:12, border:'1px solid rgba(255,255,255,.14)'}} />
                          ) : (
                            <div style={{width:54, height:54, borderRadius:12, border:'1px solid rgba(255,255,255,.14)', background:'rgba(255,255,255,.04)'}}></div>
                          )}
                          <div>
                            <b>{c.species || 'Fångst'}</b>
                            <div className="zoneMeta">
                              {c.lengthCm ? (Math.round(c.lengthCm) + ' cm') : ''}{c.weightKg ? (' • ' + c.weightKg + ' kg') : ''}
                              {c.weather && c.weather.pressureHpa != null ? (' • ' + Math.round(c.weather.pressureHpa) + ' hPa') : ''}
                              {c.weather && c.weather.windSpeed != null ? (' • ' + (Number(c.weather.windSpeed).toFixed ? Number(c.weather.windSpeed).toFixed(1) : c.weather.windSpeed) + ' m/s') : ''}
                            </div>
                          </div>
                        </div>
                        <div className="muted" style={{maxWidth:280}}>{c.notes}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

{toast ? <div className={"toast" + ((String(toast).toLowerCase().indexOf('fail')>=0 || String(toast).toLowerCase().indexOf('error')>=0) ? " error": "")}>{toast}</div> : null}
            </div>
          </div>
        </div>
      ) : (!started ? (
        <div className="card">
          <div className="head">
            <div>
              <h2>BeteKnepet</h2>
              <div className="sub">Svara på några snabba frågor — sen får du en tydlig plan.</div>
            </div>
            <span className="tag"><IconFish/> BeteKnepet</span>
          </div>
          <div className="body">
            <div className="block">
              <h3>Redo att få napp?</h3>
              <div className="muted">Tryck på start. Du fyller i en sak i taget så det inte blir rörigt.</div>
              <div className="actions" style={{marginTop:12}}>
                <button className="btn primary" onClick={() => { setStarted(true); setStep(0); setToast(''); }}>
                  Registrera
                </button>
                
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid">
          <div className="card">
            <div className="head">
              <div>
                <h2>Registrera (steg {step+1}/7)</h2>
                <div className="sub">En fråga i taget. Plan skapas automatiskt när du är klar.</div>
              </div>
              <span className="tag">Steg-för-steg</span>
            </div>
            <div className="body">
              <div className="stepper">
                <div className={"dot" + (step>=0 ? " on":"")}></div>
                <div className={"dot" + (step>=1 ? " on":"")}></div>
                <div className={"dot" + (step>=2 ? " on":"")}></div>
                <div className={"dot" + (step>=3 ? " on":"")}></div>
                <div className={"dot" + (step>=4 ? " on":"")}></div>
                <div className={"dot" + (step>=5 ? " on":"")}></div>
                <div className={"dot" + (step>=6 ? " on":"")}></div>
                <div className={"dot" + (step>=7 ? " on":"")}></div>
              </div>

              
              
              <div className="wizardLayout">
                <div className="wizardSide">
                  <div className="sideTitle">Dina val</div>
                  {stepsInfo.map((s) => (
                    <button
                      key={s.idx}
                      className={"sideRow " + ((step === s.idx) ? "active" : "")}
                      onClick={() => { if (s.idx <= step) setStep(s.idx); }}
                      type="button"
                    >
                      <div className="sideLabel">{s.title}</div>
                      <div className="sideValue">{s.value}</div>
                      
                    </button>
                  ))}
                  <div className="muted" style={{marginTop:10}}>Klicka på ett steg för att ändra.</div>
                </div>
                <div className="wizardMain">
{step === 0 ? (
                <div className="block">
                  <div className="row">
                    <div className="field">
                      <label className="sr">Välj art</label>
                      <select
                        value={species}
                        onChange={(e)=>{ const v=e.target.value; if(!v) return; setSpecies(v); setStep(1); }}
                      >
                        <option value="" disabled hidden>Välj art</option>
                        <option value="gadda">Gädda</option>
                        <option value="gos">Gös</option>
                        <option value="abborre">Abborre</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="block">
                  <div className="row">
                    <div className="field">
                      <label className="sr">Välj mål</label>
                      <select
                        value={goal}
                        onChange={(e)=>{ const v=e.target.value; if(!v) return; setGoal(v); setStep(2); }}
                      >
                        <option value="" disabled hidden>Välj mål</option>
                        <option value="forsta">Fånga första fisken</option>
                        <option value="mer">Fånga fler idag</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="block">
                  <div className="row">
                    <div className="field">
                      <label className="sr">Land eller båt</label>
                      <select
                        value={platform}
                        onChange={(e)=>{ const v=e.target.value; if(!v) return; setPlatform(v); setStep(3); }}
                      >
                        <option value="" disabled hidden>Land eller båt</option>
                        <option value="land">Land</option>
                        <option value="bat">Båt</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="block">
                  <div className="muted" style={{marginBottom:10}}>
                    Spara tid: tryck <b>Hämta plats & väder</b> så fylls Tid + Vind i automatiskt.
                  </div>

                  <div className="row">
                    <div className="field">
                      <label className="sr">Välj tid</label>
                      <select
                        value={timeofday}
                        onChange={(e)=>{ const v=e.target.value; if(!v) return; setAutoFromWeather(false); setTimeofday(v); setStep(4); }}
                      >
                        <option value="" disabled hidden>Välj tid</option>
                        <option value="morgon">Morgon</option>
                        <option value="dag">Dag</option>
                        <option value="kvall">Kväll</option>
                        <option value="natt">Natt</option>
                      </select>
                    </div>
                  </div>

                  <div className="actions" style={{marginTop:10}}>
                    <button
                      className="btn primary"
                      onClick={async ()=>{ await getPlaceAndWeather(); }}
                      disabled={wxLoading}
                    >
                      {wxLoading ? 'Hämtar...' : 'Hämta plats & väder'}
                    </button>
                  </div>
                </div>
              ) : null}

              {(step === 4 && !autoFromWeather) ? (
                <div className="block">
                  <div className="row">
                    <div className="field">
                      <label className="sr">Välj vind</label>
                      <select
                        value={wind}
                        onChange={(e)=>{ const v=e.target.value; if(!v) return; setWind(v); setStep(5); }}
                      >
                        <option value="" disabled hidden>Välj vind</option>
                        <option value="svag">Svag</option>
                        <option value="medel">Medel</option>
                        <option value="hard">Hård</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="block">
                  <div className="row">
                    <div className="field">
                      <label className="sr">Sikt i vattnet</label>
                      <select
                        value={water}
                        onChange={(e)=>{ const v=e.target.value; if(!v) return; setWater(v); setStep(6); }}
                      >
                        <option value="" disabled hidden>Typ av vatten</option>
                        <option value="klar">Klart</option>
                        <option value="mellan">Mellan</option>
                        <option value="grumlig">Grumligt</option>
                      </select>
                      <div className="muted" style={{marginTop:6}}>
                        Grumligt: välj beten som syns/känns (kontrast + vibration).
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 6 ? (
                <div className="block">
                  <div className="row">
                    <div className="field">
                      <label className="sr">Välj djup</label>
                      <select
                        value={depth}
                        onChange={async (e)=>{ const v=e.target.value; if(!v) return; setDepth(v); await makePlan(); }}
                        disabled={loading}
                      >
                        <option value="" disabled hidden>Välj djup</option>
                        <option value="grunt">Grunt (0–3m)</option>
                        <option value="medel">Medel (3–8m)</option>
                        <option value="djupt">Djupt (8m+)</option>
                      </select>
                      <div className="muted" style={{marginTop:6}}>Väljer du djup skapas planen direkt.</div>
                    </div>
                  </div>
                </div>
              ) : null}



                </div>
              </div>
{toast ? <div className={"toast" + ((String(toast).toLowerCase().indexOf('fail')>=0 || String(toast).toLowerCase().indexOf('error')>=0) ? " error": "")}>{toast}</div> : null}

              <div className="footer">
                <div className="muted">Du kan alltid backa. Inget krångel.</div>
                <div className="muted">v1.1</div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {showDonate ? (<div id="stotta" className="card" style={{marginTop:14}}>
        <div className="head">
          <div>
            <h2>Stötta BeteKnepet</h2>
            <div className="sub">Om appen hjälper dig få napp: swisha en kaffe.</div>
          </div>
          <span className="tag">Donation / Medlemskap</span>
        </div>
        <div className="body">
          <div className="block">
            <h3>Swish</h3>
            <div className="muted">
              Fyll i ert Swish-nummer senare. Just nu är det en placeholder.
            </div>
            <div className="hr"></div>
            <div className="kv">
              <div className="item">
                <div className="k">Swish-nummer</div>
                <div className="v"><b>07X-XXX XX XX</b></div>
              </div>
              <div className="item">
                <div className="k">Förslag</div>
                <div className="v">10 / 20 / 30 kr</div>
              </div>
            </div>
            <div className="hr"></div>
            <div className="muted">
              Tips: be om donation precis när det händer något bra (t.ex. "första fisken loggad").
            </div>
          </div>

          <div className="footer">
            <div className="muted">Backend: Express (Render). Frontend: React (Netlify).</div>
            <div className="muted">Byt API med <code>?api=https://din-render-url</code></div>
          </div>
        </div>
      </div>) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);