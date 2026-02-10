const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'galleri');
const CATCHES_FILE = path.join(DATA_DIR, 'catches.json');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
}

ensureDir(DATA_DIR);
ensureDir(UPLOADS_DIR);

function loadCatches() {
  try {
    const raw = fs.readFileSync(CATCHES_FILE, 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveCatches(arr) {
  fs.writeFileSync(CATCHES_FILE, JSON.stringify(arr || [], null, 2), 'utf-8');
}

function uid(prefix) {
  return String(prefix || 'id') + '_' + Math.random().toString(16).slice(2) + '_' + Date.now();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.jpg';
      cb(null, uid('img') + ext);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});


app.use(express.json({ limit: '1mb' }));

function buildSonarPreset(input){
  const preset = (input && input.preset) ? String(input.preset) : 'allround';
  const env = (input && input.env) ? String(input.env) : 'blandat';
  const depth = (input && input.depth) ? String(input.depth) : 'medel';
  const water = (input && input.water) ? String(input.water) : 'mellan';
  const platform = (input && input.platform) ? String(input.platform) : 'land';

  // Bas
  let out = {
    preset: 'Allround',
    recommended: [
      { k: '2D CHIRP', v: 'Medium CHIRP (allround)' },
      { k: 'DownScan frekvens', v: '455 kHz (räckvidd)' },
      { k: 'SideScan', v: '455 kHz längre räckvidd' },
      { k: 'Känslighet/Gain', v: 'Auto +2' },
      { k: 'Colorline/Contrast', v: '65–75%' },
      { k: 'Noise Rejection', v: 'Medel' },
      { k: 'Surface Clarity', v: 'Medel' },
      { k: 'Ping speed', v: platform === 'bat' ? 'Hög (om båten rör sig)' : 'Medel' },
      { k: 'Scroll speed', v: 'Matcha fart (Auto/Medel)' },
      { k: 'Djup/range', v: depth === 'djupt' ? '0–30 m' : (depth === 'grunt' ? '0–8 m' : '0–15 m') },
    ]
  };

  // Presets
  if (preset === 'structure' || env === 'stenigt'){
    out.preset = 'Struktur / stenigt';
    out.recommended = [
      { k: '2D CHIRP', v: 'Medium CHIRP' },
      { k: 'DownScan frekvens', v: '800 kHz (mer detalj)' },
      { k: 'SideScan', v: '455 kHz (räckvidd)' },
      { k: 'Känslighet/Gain', v: 'Auto +3' },
      { k: 'Colorline/Contrast', v: '70–80% (se hårda kanter)' },
      { k: 'Noise Rejection', v: 'Medel' },
      { k: 'Surface Clarity', v: 'Låg/Medel' },
      { k: 'Ping speed', v: platform === 'bat' ? 'Hög' : 'Medel' },
      { k: 'Scroll speed', v: 'Matcha fart' },
      { k: 'Djup/range', v: depth === 'djupt' ? '0–30 m' : '0–15 m' },
    ];
  }
  if (preset === 'reeds' || env === 'vass'){
    out.preset = 'Mycket vass';
    out.recommended = [
      { k: '2D CHIRP', v: 'Medium CHIRP (se fisk i vass)' },
      { k: 'DownScan frekvens', v: '455 kHz (räckvidd)' },
      { k: 'SideScan', v: '455 kHz' },
      { k: 'Känslighet/Gain', v: 'Auto +2' },
      { k: 'Colorline/Contrast', v: '60–70% (mindre brus)' },
      { k: 'Noise Rejection', v: 'Hög (rensar växtbrus)' },
      { k: 'Surface Clarity', v: 'Medel/Hög' },
      { k: 'Ping speed', v: platform === 'bat' ? 'Hög' : 'Medel' },
      { k: 'Scroll speed', v: 'Medel (inte för snabbt)' },
      { k: 'Djup/range', v: '0–8 m' },
    ];
  }
  if (preset === 'veg' || env === 'vegetation'){
    out.preset = 'Vegetation';
    out.recommended = [
      { k: '2D CHIRP', v: 'Medium CHIRP' },
      { k: 'DownScan frekvens', v: '455 kHz' },
      { k: 'SideScan', v: '455 kHz' },
      { k: 'Känslighet/Gain', v: 'Auto +1' },
      { k: 'Colorline/Contrast', v: '60–70%' },
      { k: 'Noise Rejection', v: 'Hög' },
      { k: 'Surface Clarity', v: 'Hög' },
      { k: 'Ping speed', v: platform === 'bat' ? 'Hög' : 'Medel' },
      { k: 'Scroll speed', v: 'Medel' },
      { k: 'Djup/range', v: depth === 'djupt' ? '0–20 m' : '0–15 m' },
    ];
  }
  if (preset === 'deep' || depth === 'djupt'){
    out.preset = 'Djupt';
    out.recommended = [
      { k: '2D CHIRP', v: 'Low/Medium CHIRP (penetration)' },
      { k: 'DownScan frekvens', v: '455 kHz (räckvidd)' },
      { k: 'SideScan', v: '455 kHz' },
      { k: 'Känslighet/Gain', v: 'Auto +2' },
      { k: 'Noise Rejection', v: 'Medel' },
      { k: 'Surface Clarity', v: 'Medel' },
      { k: 'Ping speed', v: 'Medel/Hög' },
      { k: 'Scroll speed', v: 'Matcha fart' },
      { k: 'Djup/range', v: '0–40 m' },
    ];
  }
  if (preset === 'shallow' || depth === 'grunt'){
    out.preset = 'Grunt';
    out.recommended = [
      { k: '2D CHIRP', v: 'Medium/High CHIRP' },
      { k: 'DownScan frekvens', v: '800 kHz (detalj)' },
      { k: 'SideScan', v: '800/455 (om finns)' },
      { k: 'Känslighet/Gain', v: 'Auto +1' },
      { k: 'Noise Rejection', v: water === 'grumlig' ? 'Hög' : 'Medel' },
      { k: 'Surface Clarity', v: 'Hög' },
      { k: 'Ping speed', v: platform === 'bat' ? 'Hög' : 'Medel' },
      { k: 'Scroll speed', v: 'Medel' },
      { k: 'Djup/range', v: '0–8 m' },
    ];
  }

  return out;
}


// CORS: allow local Netlify dev + Netlify prod domain.
// You can add more allowed origins via env BK_ALLOWED_ORIGINS (comma separated).
const DEFAULT_ALLOWED = [
  'http://localhost:8888',
  'http://127.0.0.1:8888',
  'https://sage-vacherin-aa5cd3.netlify.app'
];

function getAllowedOrigins() {
  const extra = (process.env.BK_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED, ...extra])];
}

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: function(origin, cb) {
    // allow non-browser calls (no origin) + allowed list
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: ' + origin));
  }
}));

app.get('/health', (req, res) => {
  res.json({ ok: true, name: 'beteknepet-backend', time: new Date().toISOString() });
});

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function norm(s) {
  return String(s || '').toLowerCase();
}


function buildSonar(input) {
  const species = norm(input.species);
  const platform = norm(input.platform);
  const water = norm(input.water);
  const depth = norm(input.depth);
  const wind = norm(input.wind);

  // General heuristics for typical recreational echo sounders (Lowrance/Garmin/Humminbird style).
  // Keep it simple + actionable.

  // Frequency suggestions
  const downscanFreq = (water === 'klar') ? '800 kHz (mer detalj)' : '455 kHz (mer räckvidd)';
  const chirp = 'Medium CHIRP (allround)';
  const sideScan = (platform === 'bat') ? ((water === 'klar') ? '800 kHz kort räckvidd' : '455 kHz längre räckvidd') : 'Av (land)';

  // Sensitivity / gain
  let sensitivity = 'Auto +2';
  if (water === 'grumlig') sensitivity = 'Auto +3 (mer eko)';
  if (water === 'klar') sensitivity = 'Auto +1 (mindre brus)';

  // Colorline / contrast
  let colorline = '65–72%';
  if (water === 'klar') colorline = '60–68% (tydligare bågar)';
  if (water === 'grumlig') colorline = '68–75% (separation i brus)';

  // Noise rejection / surface clarity
  const noiseReject = (water === 'klar') ? 'Låg/Medel' : 'Medel/Hög';
  const surfaceClarity = (wind === 'hard') ? 'Hög' : 'Medel';

  // Ping speed / scroll speed
  const ping = (platform === 'bat') ? 'Hög (om båten rör sig)' : 'Medel';
  const scroll = (platform === 'bat') ? 'Matcha fart (Auto/Medel)' : 'Låg/Medel';

  // Range settings by target depth
  let range = 'Auto + 0–12 m';
  if (depth === 'grunt') range = '0–8 m (tight range)';
  if (depth === 'medel') range = '0–15 m';
  if (depth === 'djupt') range = '0–25 m (eller Auto)';

  // Fish-specific notes
  const tips = [];
  if (species === 'gos') {
    tips.push('Gös: kör ofta tight range + tydlig botten. Leta betesfisk “moln” nära kant/djup.');
    tips.push('Separation: höj colorline tills botten blir skarp, men inte “blöder” upp i vattnet.');
  } else if (species === 'gadda') {
    tips.push('Gädda: leta struktur, vasskanter och betesfisk. DownScan visar vegetation bra.');
    tips.push('Om mycket växt: höj noise rejection ett steg och använd 455 kHz för stabil bild.');
  } else {
    tips.push('Abborre: leta stim/betesfisk. Högre frekvens (800) ger finare detaljer på små ekon.');
    tips.push('Byt mellan 2D och DownScan: 2D för bågar, DownScan för struktur och stim.');
  }

  // Simple “preset” labels
  const preset = (species === 'gos')
    ? 'Bottenfokus'
    : (species === 'gadda' ? 'Struktur/vass' : 'Stim & detalj');

  return {
    preset,
    recommended: [
      { k: '2D CHIRP', v: chirp },
      { k: 'DownScan frekvens', v: downscanFreq },
      { k: 'SideScan', v: sideScan },
      { k: 'Känslighet/Gain', v: sensitivity },
      { k: 'Colorline/Contrast', v: colorline },
      { k: 'Noise Rejection', v: noiseReject },
      { k: 'Surface Clarity', v: surfaceClarity },
      { k: 'Ping speed', v: ping },
      { k: 'Scroll speed', v: scroll },
      { k: 'Djup/range', v: range }
    ],
    quickChecks: [
      'Botten ska vara en tydlig linje. Är den tjock/”fluffig” → sänk känslighet eller colorline lite.',
      'Ser du mycket prickar/brus → höj Noise Rejection ett steg och sänk känslighet 1 steg.',
      'Tappar du botten i fart → höj ping/scroll (eller sätt Auto).'
    ],
    tips
  };
}

function buildPlan(input) {
  const species = norm(input.species);
  const platform = norm(input.platform);
  const timeofday = norm(input.timeofday);
  const wind = norm(input.wind);
  const water = norm(input.water);
  const goal = norm(input.goal);
  const depth = norm(input.depth);

  // Depth focus logic (simple MVP).
  let focusDepth = '3-8m';
  if (species === 'gadda') {
    focusDepth = (timeofday === 'morgon' || timeofday === 'kvall') ? '0.5-3m + kanter' : '1-5m + kanter';
  } else if (species === 'gos') {
    focusDepth = (timeofday === 'kvall' || timeofday === 'natt') ? '4-10m (kanter/platå)' : '6-12m (kanter/djup)';
  } else if (species === 'abborre') {
    focusDepth = (wind === 'hard') ? '2-6m (vindutsatt kant)' : '1-5m (kanter/struktur)';
  }
  if (depth === 'grunt') focusDepth = '0-3m (start)';
  if (depth === 'djupt') focusDepth = '8m+ (start)';

  const zoneCommon = [
    'Kant mellan grunt och djup (leta overgangar, inte exakt spot).',
    'Grundflak nar djup (matfabrik).',
    'In-/utlopp eller smal passage om sjokartan visar det.'
  ];

  const zoneLand = [
    'Udden/standkanten som far vind (syre + mat).',
    'Brygga/stenkant med djup intill.',
    'Vasskant med fri vattenyta bredvid.'
  ];

  const zoneBoat = [
    'Trolla/langs kant i jamn fart (om tillatet).',
    'Drifta over platå och jobba ner i kanten.',
    'Sok betesfisk/eko: stanna dar du ser liv.'
  ];

  const lures = {
    gadda: [
      'Spinnerbait / chatterbait (vibration + flash). Bra i grumligt/vind. Exempel: chartreuse/svart, nickelblad.',
      'Jerkbait / glidebait (klart vatten, grunt/kant). Exempel: naturliga "baitfish"-färger; pauser 1–3 sek.',
      'Shadjigg 12–18cm (kant/djupare). Exempel: paddel-tail som känns i spöet; variera fart tills du får kontakt.'
    ],
    gos: [
      'Jigg 8–12cm på skalle (bottenkontakt). Exempel: chartreuse/svart i grumligt, natur i klart. Lyft–paus–känn botten.',
      'Verticaljigg / dropshot (båt). Exempel: 7–10cm jigg/larv; små skakningar och långa pauser.',
      'Wobbler nattetid (grunt över platå). Exempel: mörk siluett (svart/mörkblå) med rassel; långsam invevning.'
    ],
    abborre: [
      'Nedjigg / microjigg 5–8cm (kant/sten). Exempel: motorolja/abborre-mönster i klart; chartreuse i grumligt.',
      'Dropshot (om de är tröga). Exempel: liten mask/larv, stilla 3–6 sek mellan skak.',
      'Spinnare/inline (för snabb kontakt). Exempel: silver/guld blad; öka fart i vind.'
    ]
  };

  const tempo = [];
  if (species === 'gos') {
    tempo.push('Langsamt: bottenkontakt, 2-3 lyft, paus 2-5 sek.');
    tempo.push('Jobba 10-15 kast per djup-niva innan du flyttar 50-100m.');
  } else if (species === 'gadda') {
    tempo.push('Medel till snabbt: svep 10-20m, byt vinkel, byt tempo.');
    tempo.push('Pausar: langre stopp i kallt vatten, kortare i varmt.');
  } else {
    tempo.push('Blanda: 5 kast snabbt (sok), sen 5 kast langsamt (truga).');
    tempo.push('Om du far foljare: sakta ner och byt till mindre bete.');
  }

  const why = (goal === 'forsta')
    ? 'MVP-planen prioriterar tydliga zoner och beten som snabbt ger napp-svar.'
    : 'MVP-planen maximerar kontakt: fler kast i hog-procent zoner med snabb felsokning.';

  const zones = [];
  zones.push(...zoneCommon);
  zones.push(...(platform === 'bat' ? zoneBoat : zoneLand));

  // Adjust by wind/water.
  if (wind === 'hard') zones.unshift('Vindutsatt sida: borja dar (mer syre + mat).');
  if (water === 'klar') zones.unshift('Klarvatten: håll lite avstånd och fiska mer diskret. Exempel: naturliga färger (silver/abborre), längre kast, tunnare lina/fluorocarbon-tafs.');
  if (water === 'grumlig') zones.unshift('Grumligt: välj bete som syns/känns (vibration/ljud). Exempel färg: svart, chartreuse, firetiger. Exempel beten: spinnerbait, chatterbait, crankbait med rassel, paddeltail-jigg.');

  const lureList = (lures[species] || []).slice();
  if (water === 'klar' && species === 'gadda') lureList.unshift('Naturliga färger + längre kast (klart vatten). Exempel: silver/grå/grön, "roach"/abborre-mönster.');
  if (water === 'grumlig') lureList.unshift('Kontrastfärg (svart, chartreuse) + vibration. Exempel: spinnerbait/chatterbait, mörk jigg med paddel, crankbait med rassel.');
  const sonar = buildSonar(input);

  return {
    id: Math.random().toString(16).slice(2),
    zones: zones.slice(0, 5),
    lures: lureList.slice(0, 4),
    tempo,
    focusDepth,
    why,
    sonar
  };
}

function buildNoBites(input) {
  const species = norm(input.species);
  const platform = norm(input.platform);
  const water = norm(input.water);
  const timeofday = norm(input.timeofday);

  const steps = [];
  steps.push('1) Byt 1 sak i taget (djup, fart ELLER storlek).');
  if (species === 'gos') {
    steps.push('2) Ga 2-3m djupare och fiska langsammare i 20 min.');
    steps.push('3) Kortare jigg (6-8cm) eller dropshot om de bara nyper.');
    steps.push('4) Hitta betesfisk: ar det tomt pa ekot, flytta 200-400m.');
  } else if (species === 'gadda') {
    steps.push('2) Byt fran grunt till kant (eller tvartom) och byt vinkel.');
    steps.push('3) Mindre bete om du ser foljare; storre om du inte har kontakt.');
    steps.push('4) Om vattnet ar grumligt: mer vibration. Om klart: mer diskret.');
  } else {
    steps.push('2) Byt till mindre bete och jobba sakta pa botten/struktur.');
    steps.push('3) Korta kast runt sten/kanter, variera pausen.');
    steps.push('4) Om ingen kontakt: byt plats 100-200m (abborre ar klumpvis).');
  }

  if (platform === 'land') steps.push('5) Flytta till en ny kant/udde (max 10 min promenad).');
  else steps.push('5) Drifta 5-10 min och gor 10 kast per stopp.');

  if (timeofday === 'natt') steps.push('Bonus: korta sektioner grunt over platå (gös kan ga upp).');
  if (water === 'klar') steps.push('Bonus: langre tafs, tunnare lina, mindre bete.');
  if (water === 'grumlig') steps.push('Bonus: kontrastfarg + skrammel/vibration.');

  return {
    steps,
    note: 'Nar du far ett napp: stanna i samma zon och upprepa exakt samma tempo 10 kast till.'
  };
}


app.post('/api/beteknepet/weather', async (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lon = Number(req.body?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'lat/lon saknas eller är fel.' });
    }

    // Open-Meteo (ingen API-nyckel) - aktuellt väder + vind.
    const url = 'https://api.open-meteo.com/v1/forecast';
    const params = {
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl',
      wind_speed_unit: 'ms',
      timezone: 'auto'
    };

    const r = await axios.get(url, { params, timeout: 8000 });
    const cur = r?.data?.current || {};
    return res.json({
      lat,
      lon,
      temperatureC: cur.temperature_2m ?? null,
      weatherCode: cur.weather_code ?? null,
      windSpeed: cur.wind_speed_10m ?? null,       // m/s
      windDir: cur.wind_direction_10m ?? null,
    pressureHpa: cur.pressure_msl ?? null      // grader
    });
  } catch (e) {
    const msg = e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'weather failed');
    return res.status(502).json({ error: msg });
  }
});

// GET-variant (enklare att testa i webbläsaren)
app.get('/api/beteknepet/weather', async (req, res) => {
  try {
    const lat = Number(req.query?.lat);
    const lon = Number(req.query?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'lat/lon saknas eller är fel.' });
    }

    const url = 'https://api.open-meteo.com/v1/forecast';
    const params = {
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl',
      wind_speed_unit: 'ms',
      timezone: 'auto'
    };

    const r = await axios.get(url, { params, timeout: 8000 });
    const cur = r?.data?.current || {};
    return res.json({
      lat,
      lon,
      temperatureC: cur.temperature_2m ?? null,
      weatherCode: cur.weather_code ?? null,
      windSpeed: cur.wind_speed_10m ?? null,
      windDir: cur.wind_direction_10m ?? null,
    pressureHpa: cur.pressure_msl ?? null
    });
  } catch (e) {
    const msg = e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'weather failed');
    return res.status(502).json({ error: msg });
  }
});



app.post('/api/beteknepet/sonar', (req, res) => {
  try {
    const input = req.body || {};
    const data = buildSonarPreset(input);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: String(e && e.message ? e.message : e) });
  }
});

// GET-variant (fallback)
app.get('/api/beteknepet/sonar', (req, res) => {
  try {
    const input = { ...req.query };
    const data = buildSonarPreset(input);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: String(e && e.message ? e.message : e) });
  }
});


app.post('/api/beteknepet/plan', (req, res) => {
  try {
    const plan = buildPlan(req.body || {});
    res.json(plan);
  } catch (e) {
    res.status(400).json({ error: e.message || 'bad request' });
  }
});

app.post('/api/beteknepet/nobites', (req, res) => {
  try {
    const fix = buildNoBites(req.body || {});
    res.json(fix);
  } catch (e) {
    res.status(400).json({ error: e.message || 'bad request' });
  }
});

const PORT = process.env.PORT || 5005;

// --- Catches (fångster) ---
app.get('/api/beteknepet/catches', (req, res) => {
  const arr = loadCatches();
  // newest first
  arr.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  res.json(arr.slice(0, 200));
});

app.post('/api/beteknepet/catches', upload.single('image'), async (req, res) => {
  try {
    const body = req.body || {};
    const id = uid('catch');
    const createdAt = Date.now();

    const lat = body.lat != null ? Number(body.lat) : null;
    const lon = body.lon != null ? Number(body.lon) : null;
    const location = (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;

    let weather = null;
    // If client sends weather fields, accept them, else fetch if location exists
    if (body.tempC != null || body.windSpeed != null || body.pressureHpa != null) {
      weather = {
        temperatureC: body.tempC != null ? Number(body.tempC) : null,
        windSpeed: body.windSpeed != null ? Number(body.windSpeed) : null,
        windDir: body.windDir != null ? Number(body.windDir) : null,
        pressureHpa: body.pressureHpa != null ? Number(body.pressureHpa) : null
      };
    } else if (location) {
      try {
        const wx = await fetchWeather(location.lat, location.lon);
        weather = {
          temperatureC: wx.temperatureC,
          windSpeed: wx.windSpeed,
          windDir: wx.windDir,
          pressureHpa: wx.pressureHpa
        };
      } catch (e) {
        weather = null;
      }
    }

    const imageUrl = req.file ? ('/beteknepet/galleri/' + req.file.filename) : null;

    const item = {
      id,
      createdAt,
      species: body.species || null,
      lengthCm: body.lengthCm != null ? Number(body.lengthCm) : null,
      weightKg: body.weightKg != null ? Number(body.weightKg) : null,
      notes: body.notes ? String(body.notes) : '',
      imageUrl,
      location,
      weather,
      context: {
        platform: body.platform || null,
        water: body.water || null,
        depth: body.depth || null,
        timeofday: body.timeofday || null,
        wind: body.wind || null
      }
    };

    const arr = loadCatches();
    arr.push(item);
    saveCatches(arr);

    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e.message || 'bad request' });
  }
});

// --- Lure check (bete-koll) ---
app.post('/api/beteknepet/lure-check', upload.single('image'), (req, res) => {
  try {
    const body = req.body || {};
    const species = norm(body.species);
    const water = norm(body.water);
    const wind = norm(body.wind);
    const timeofday = norm(body.timeofday);
    const lureType = norm(body.lureType);
    const lureColor = norm(body.lureColor);
    const lureSize = norm(body.lureSize);

    // Simple scoring rules (MVP)
    let score = 0;
    const reasons = [];
    const better = [];

    const isBright = (lureColor === 'bright' || lureColor === 'chartreuse' || lureColor === 'orange');
    const isNatural = (lureColor === 'natural' || lureColor === 'silver' || lureColor === 'brown');
    const isDark = (lureColor === 'dark' || lureColor === 'black');

    const vibTypes = { spinner:1, chatter:1, crank:1, lipless:1, blade:1 };
    const isVib = !!vibTypes[lureType];

    if (water === 'grumlig') {
      if (isBright || isDark) { score += 2; reasons.push('Grumligt: kontrast syns bättre.'); }
      else { score -= 1; reasons.push('Grumligt: naturlig färg kan bli “osynlig”.'); better.push('Testa chartreuse/orange eller svart/silver.'); }
      if (isVib) { score += 2; reasons.push('Vibration/ljud hjälper när sikten är låg.'); }
      else { score -= 1; better.push('Välj spinnerbait, chatterbait eller crank som vibrerar.'); }
    }

    if (water === 'klar') {
      if (isNatural) { score += 2; reasons.push('Klart vatten: naturliga färger ser trovärdiga ut.'); }
      if (isBright) { score -= 1; reasons.push('Klart vatten: för skrikiga färger kan skrämma.'); better.push('Byt till natur/silver/brun.'); }
    }

    if (species === 'gos') {
      if (lureType === 'jigg' || lureType === 'shad') { score += 2; reasons.push('Gös: jigg/shad är standard och funkar ofta.'); }
      if (timeofday === 'kvall' || timeofday === 'natt') { score += 1; reasons.push('Gös är ofta mer aktiv kväll/natt.'); }
      if (lureSize === 'small') { score -= 1; better.push('Testa medium jigg 8–12 cm.'); }
    } else if (species === 'gadda') {
      if (isVib) { score += 1; reasons.push('Gädda reagerar ofta på tryck/vibration.'); }
      if (lureType === 'jerk' || lureType === 'swimbait') { score += 2; reasons.push('Gädda: jerk/swimbait är starka val.'); }
    } else {
      // abborre
      if (lureType === 'jigg' || lureType === 'drop' || lureType === 'spinner') { score += 2; reasons.push('Abborre: små jiggar/spinnare funkar bra.'); }
      if (lureSize === 'large') { score -= 1; better.push('Abborre: testa small/medium.'); }
    }

    if (wind === 'hard') {
      if (isVib) { score += 1; reasons.push('Hård vind: mer stök i vattnet → vibration hjälper.'); }
    }

    let verdict = 'OK';
    if (score >= 3) verdict = 'BRA';
    if (score <= 0) verdict = 'BYT';

    const imageUrl = req.file ? ('/beteknepet/galleri/' + req.file.filename) : null;

    res.json({
      verdict,
      score,
      reasons: reasons.slice(0, 4),
      suggestions: better.slice(0, 4),
      imageUrl
    });
  } catch (e) {
    res.status(400).json({ error: e.message || 'bad request' });
  }
});


app.listen(PORT, () => {
  console.log('BeteKnepet backend running on port', PORT);
});
