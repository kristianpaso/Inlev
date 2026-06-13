// public/trav/js/race-sim.js
// Simulering: oval bana, autostart/voltstart, två-wide pack, drafting, ytterspårs-metrar, upplopps-"kicker".
// Förenklad modell – stöd, inte facit.

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function normalize01(v, min, max){
  if (v == null || !Number.isFinite(v)) return 0.5;
  if (max === min) return 0.5;
  return clamp((v - min) / (max - min), 0, 1);
}
function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng){
  // Box–Muller (approx normalfördelad varians)
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function parseLineColumns(line){
  if (!line) return [];
  if (String(line).includes('\t')) return String(line).split('\t').map(s => s.trim());
  return String(line).split(/\s{2,}/).map(s => s.trim());
}
function findColIndex(cols, pred){
  const u = cols.map(c => String(c||'').toUpperCase());
  for (let i=0;i<u.length;i++){ if (pred(u[i])) return i; }
  return -1;
}
function parsePercentValue(v){
  const m = String(v||'').match(/(-?\d+)\s*%/);
  return m ? Number(m[1]) : null;
}
function parseOddsValue(v){
  const s = String(v||'').replace(',', '.').replace(/[^\d.]/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseMoneyValue(v){
  const s = String(v||'').replace(/\s/g,'').replace(/[^\d]/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseRecordToSecPerKm(v){
  // I trav-tabeller står ofta "16,4M" som 1:16,4 (dvs 76.4 sek/km)
  const s = String(v||'').replace(',', '.');
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const x = Number(m[1]);
  if (!Number.isFinite(x)) return null;
  // typiskt 13-25 -> tolka som 1:xx.x
  if (x < 40) return 60 + x;
  return x; // fallback om någon gång redan är full sek/km
}
function keywordScore(text, rules){
  const t = String(text||'').toLowerCase();
  let sc = 0;
  for (const r of rules){
    if (t.includes(String(r.k).toLowerCase())) sc += r.w;
  }
  return sc;
}
function parseTrackMeters(v){
  const m = String(v||'').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return Number(String(m[1]).replace(',','.'));
}

function readSimGeoFromTrack(track){
  const texts = [];
  if (track?.infoText) texts.push(String(track.infoText));
  if (Array.isArray(track?.comments)){
    for (const c of track.comments){
      if (c?.comment) texts.push(String(c.comment));
    }
  }
  const rx = /SIM_GEO\s*[:=]\s*(\{[^\n\r]+\})/i;
  for (const t of texts){
    const m = String(t).match(rx);
    if (!m) continue;
    try{
      const obj = JSON.parse(m[1]);
      if (obj && typeof obj === 'object') return obj;
    }catch(_e){}
  }
  return null;
}


function laneBias(lane){
  // Du gav: bäst 1,6,7. Sämre 4,5. 12 sämst.
  if (!lane) return 0;
  if (lane === 12) return -0.30;
  if (lane === 1) return 0.14;
  if (lane === 6 || lane === 7) return 0.10;
  if (lane === 4 || lane === 5) return -0.10;
  return 0;
}

function getTrackGeometry(track, canvas, padOverride){
  const totalLen = parseTrackMeters(track?.length) || 1000;
  const widthM = parseTrackMeters(track?.width) || 23;

  const cw = canvas.width, ch = canvas.height;
  const pad = (typeof padOverride === 'number' ? padOverride : 70);

  // "Stadium-oval": 2 rakor + 2 kurvor (halvcirklar).
  // Vi väljer en raklängd som känns rimlig på en 1000m-bana,
  // och låter radien räknas fram så att total längd ≈ totalLen.
  const simGeo = readSimGeoFromTrack(track);

  let straightM = clamp(totalLen * 0.30, 180, 420);
  let Rm = Math.max(50, (totalLen - 2*straightM) / (2*Math.PI));

  // Om ban-analys finns: använd aspect (bredd/höjd) för att få en mer "rätt" oval i bilden.
  // aspect ≈ (straight + 2R) / (2R) i vår stadium-modell.
  if (simGeo && Number.isFinite(Number(simGeo.aspect))){
    const ratio = clamp(Number(simGeo.aspect), 1.25, 2.45);
    const denom = (2*(2*(ratio-1) + Math.PI));
    const r2 = denom > 0 ? (totalLen / denom) : Rm;
    if (Number.isFinite(r2) && r2 > 30){
      Rm = r2;
      straightM = clamp(2*Rm*(ratio-1), 120, totalLen*0.45);
    }
  }

  // Skala så att banan får plats både i bredd och höjd.
  const maxW = cw - pad*2;
  const maxH = ch - pad*2;
  const pxPerM_w = maxW / (straightM + 2*Rm);
  const pxPerM_h = maxH / (2*Rm);
  const pxPerM = Math.max(0.18, Math.min(pxPerM_w, pxPerM_h));

  const straight = straightM;
  const turnLen = Math.PI * Rm;

  const centerX = cw/2;
  const centerY = ch/2 + 6;

  // ~10 "synliga" spår (räcker för vår grafik)
  const lanePx = (widthM * pxPerM) / 10.0 * 1.25; // bredare bana visuellt

  return {
    totalLen,
    straight,
    Rm,
    turnLen,
    widthM,
    pxPerM,
    centerX,
    centerY,
    ovalW: (straight + 2*Rm),
    ovalH: (2*Rm),
    lanePx,
    pad,
  };
}

// meters -> xy på en stabil oval som alltid går vänster varv.
// (Vänster varv = svänger vänster i kurvorna.)
// Vi använder en kontinuerlig oval-parametrisering för att slippa "hoppa" och att någon häst ser ut att gå baklänges.
function mapMetersToXY(rawMeters, laneFloat, geom){
  const { totalLen, straight, Rm, pxPerM, centerX, centerY, lanePx } = geom;

  // wrap runt banan (rawMeters kan vara > varvlängd vid 2–3 varv)
  const s0 = ((rawMeters % totalLen) + totalLen) % totalLen;

  // 🔁 Vi vänder riktningen visuellt så "upploppet" känns vänster→höger på skärmen.
  // (Samma finishS=0 som innan, bara omvänd traversal.)
  const s = (totalLen - s0) % totalLen;

  const straightPx = straight * pxPerM;
  const Rpx = Rm * pxPerM;

  // Stadium-oval i "världskoordinater" (utan rotation).
  // S=0 ligger vid nedre högra hörnet (MÅL-markör i vår graf).
  let x0 = centerX, y0 = centerY;
  let nx = 0, ny = 1; // utåt-normal för spår-offset

  const seg1 = straight;          // nedre raka
  const seg2 = Math.PI * Rm;      // vänsterkurva
  const seg3 = straight;          // övre raka
  const seg4 = Math.PI * Rm;      // högerkurva

  if (s < seg1){
    // Nedre raka: höger -> vänster (i basgeometrin). (Efter s-inversion blir känslan vänster→höger för täten.)
    const u = s * pxPerM;
    x0 = centerX + straightPx/2 - u;
    y0 = centerY + Rpx;
    nx = 0; ny = 1; // utåt = nedåt
  } else if (s < seg1 + seg2){
    // Vänsterkurva: botten -> topp
    const u = (s - seg1) / seg2; // 0..1
    const phi = (Math.PI/2) - u * Math.PI; // +90° -> -90°
    const cx = centerX - straightPx/2;
    const cy = centerY;
    x0 = cx + Rpx * Math.cos(phi);
    y0 = cy + Rpx * Math.sin(phi);
    const vx = x0 - cx, vy = y0 - cy;
    const l = Math.hypot(vx, vy) || 1;
    nx = vx/l; ny = vy/l; // utåt = radiellt från kurvcentrum
  } else if (s < seg1 + seg2 + seg3){
    // Övre raka: vänster -> höger
    const u = (s - (seg1 + seg2)) * pxPerM;
    x0 = centerX - straightPx/2 + u;
    y0 = centerY - Rpx;
    nx = 0; ny = -1; // utåt = uppåt
  } else {
    // Högerkurva: topp -> botten
    const u = (s - (seg1 + seg2 + seg3)) / seg4; // 0..1
    const phi = (-Math.PI/2) + u * Math.PI; // -90° -> +90°
    const cx = centerX + straightPx/2;
    const cy = centerY;
    x0 = cx + Rpx * Math.cos(phi);
    y0 = cy + Rpx * Math.sin(phi);
    const vx = x0 - cx, vy = y0 - cy;
    const l = Math.hypot(vx, vy) || 1;
    nx = vx/l; ny = vy/l;
  }

  // laneFloat ~ 1..6 (1 inner, högre = längre ut)
  const lf = clamp(laneFloat ?? 1, 1, 6);
  const laneOffset = (lf - 1) * lanePx; // px

  // Offset utåt från banans mittlinje (korrekt normal: raka = vertikal, kurva = radiell)
  const x = x0 + nx * laneOffset;
  const y = y0 + ny * laneOffset;

  return { x, y };
}


function classifyStartType(horses, baseDist){
  const dset = new Set(horses.map(h => h.dist).filter(d => Number.isFinite(d)));
  if (dset.size > 1) return 'volt';
  // om någon har tillägg i modellen
  const anyHandicap = horses.some(h => (h._sim?.handicapM||0) > 0);
  if (anyHandicap) return 'volt';
  return 'auto';
}

function buildSimHorses(division, headerColumns){
  const idxHorse = findColIndex(headerColumns, u => u.includes('HÄST'));
  const idxDist  = findColIndex(headerColumns, u => u.includes('DISTANS'));
  const idxV     = findColIndex(headerColumns, u => u.includes('V85%'));
  const idxWin   = findColIndex(headerColumns, u => u.includes('SEGER%'));
  const idxPlace = findColIndex(headerColumns, u => u.includes('PLATS%'));
  const idxOdds  = findColIndex(headerColumns, u => u.includes('P-ODDS'));
  const idxRec   = findColIndex(headerColumns, u => u.includes('REKORD'));
  const idxKrStart = findColIndex(headerColumns, u => u.includes('KR/START'));
  const idxTips  = findColIndex(headerColumns, u => u.includes('TIPSKOMMENTAR'));

  const horses = (division?.horses || [])
    .slice()
    .filter(h => !h?.scratched)
    .map((h) => {
      const cols = parseLineColumns(h.rawLine || '');
      const nameRaw = cols[idxHorse] || '';
      const name = String(nameRaw).replace(/^\d+\s+/, '').trim() || `#${h.number}`;

      const distSp = cols[idxDist] || '';
      const m = String(distSp).match(/(\d+)\s*:\s*(\d+)/);
      const dist = m ? Number(m[1]) : null;
      const lane = m ? Number(m[2]) : (Number(h.number) || null);

      return {
        number: Number(h.number),
        name,
        dist,
        lane,
        vPct: parsePercentValue(cols[idxV]),
        winPct: parsePercentValue(cols[idxWin]),
        placePct: parsePercentValue(cols[idxPlace]),
        odds: parseOddsValue(cols[idxOdds]),
        krStart: parseMoneyValue(cols[idxKrStart]),
        recSecKm: parseRecordToSecPerKm(cols[idxRec]),
        tips: cols[idxTips] || '',
      };
    });

  const baseDist = horses.reduce((acc, x) => (x.dist != null ? Math.min(acc, x.dist) : acc), Infinity);
  const baseDistance = Number.isFinite(baseDist) ? baseDist : 2140;

  // norm för record
  const recVals = horses.map(h => h.recSecKm).filter(Number.isFinite);
  const recMin = recVals.length ? Math.min(...recVals) : 70;
  const recMax = recVals.length ? Math.max(...recVals) : 90;

  const winVals = horses.map(h => h.winPct).filter(Number.isFinite);
  const winMax = winVals.length ? Math.max(...winVals) : 40;

  const vVals = horses.map(h => h.vPct).filter(Number.isFinite);
  const vMax = vVals.length ? Math.max(...vVals) : 40;

  for (const h of horses){
    const handicapM = (h.dist != null && Number.isFinite(h.dist)) ? Math.max(0, h.dist - baseDistance) : 0;

    const speedScore = normalize01((h.recSecKm != null ? (recMax - h.recSecKm) : null), 0, (recMax - recMin) || 1);
    const winScore = normalize01(h.winPct, 0, winMax || 1);
    const vScore = normalize01(h.vPct, 0, vMax || 1);
    const oddsScore = (h.odds != null && Number.isFinite(h.odds))
      ? clamp(1 / Math.sqrt(h.odds), 0, 1)
      : 0.45;

    const gateK = keywordScore(h.tips, [
      { k: 'snabb iväg', w: 0.25 },
      { k: 'öppnar bra', w: 0.20 },
      { k: 'nå ledning', w: 0.18 },
      { k: 'utmanare om ledning', w: 0.14 },
      { k: 'tappstart', w: -0.22 },
      { k: 'riskerar tappstart', w: -0.26 },
      { k: 'inte den snabbaste', w: -0.14 },
    ]);

    const staminaK = keywordScore(h.tips, [
      { k: 'tål grovjobb', w: 0.26 },
      { k: 'grovjobb', w: 0.20 },
      { k: 'rejäl', w: 0.14 },
      { k: 'räds inte jobb', w: 0.20 },
      { k: 'hårt jämnt tempo', w: 0.14 },
    ]);

    const sprintK = keywordScore(h.tips, [
      { k: 'speedig', w: 0.24 },
      { k: 'spurtstark', w: 0.22 },
      { k: 'vasst upplopp', w: 0.22 },
      { k: 'spurt', w: 0.16 },
    ]);

    const reliabilityK = keywordScore(h.tips, [
      { k: 'galopp', w: -0.20 },
      { k: 'borta redan innan start', w: -0.28 },
      { k: 'osäker', w: -0.18 },
      { k: 'håller farten', w: 0.10 },
      { k: 'aldrig varit sämre', w: 0.06 },
    ]);

    const laneB = laneBias(h.lane);

    const strength =
      0.44 * speedScore +
      0.28 * vScore +
      0.16 * winScore +
      0.08 * oddsScore +
      0.04 * clamp(laneB + 0.1, 0, 0.2);

    const baseSec = (h.recSecKm && Number.isFinite(h.recSecKm)) ? h.recSecKm : (76.0 - 6*strength);
    const baseSpeedMS = 1000 / clamp(baseSec, 68, 90);

    h._sim = {
      baseDistance,
      handicapM,
      laneB,
      strength: clamp(strength, 0, 1),
      baseSpeedMS,
      gate: clamp(0.46 + gateK + laneB - (handicapM>0 ? 0.08 : 0), 0.15, 0.95),
      stamina: clamp(0.44 + staminaK + 0.22*winScore, 0.15, 0.95),
      sprint: clamp(0.40 + sprintK + 0.26*speedScore, 0.15, 0.98),
      reliability: clamp(0.78 + reliabilityK, 0.25, 0.95),
    };
  }

  return { horses, baseDistance };
}

function pickStartRows(horses, startType){
  // Autostart: 1-8 fram, 9-15 bak (om finns)
  // Voltstart: behåll lane men handicap ger tillägg
  for (const h of horses){
    let row = 0;
    if (startType === 'auto'){
      row = (h.lane != null && h.lane >= 9) ? 1 : 0;
    }
    h._sim.row = row;
  }
}

function simulateRace({ horses, distance, startType, env, seed, withTimeline }){
  // Seed 0 ska vara giltigt, så använd nullish-check istället för ||.
  const rng = mulberry32((seed ?? 12345) | 0);

  // väder: snö mjuk bana, vind motvind för ledare
  const wind = clamp(env.wind ?? 0, 0, 20);
  const snow = clamp(env.snowCm ?? 0, 0, 10);
  const temp = env.tempC ?? 0;

  const weatherSlow = 1 - (snow*0.010 + wind*0.0015) - (temp < 0 ? 0.003 : 0);
  const weatherNoise = (snow*0.020 + wind*0.006);

  pickStartRows(horses, startType);

  // "Dagsform" och "klaff" per lopp.
  // Viktigt: lite mer variation behövs för att vinnare-loggen och Sim Kupong
  // inte ska bli identisk varje gång. (Vi håller det ändå viktat mot de bättre.)
  const day = new Map();
  let aggressiveCount = 0;
  for (const h of horses){
    const rel  = h._sim?.reliability ?? 0.8;
    const gate = h._sim?.gate ?? 0.5;
    const spr  = h._sim?.sprint ?? 0.5;

    // Mer stabila hästar varierar mindre.
    // Öka spridningen lite (annars kan det bli "samma" lopp om och om igen).
    const sigma = 0.030 + (1 - rel) * 0.050; // ~3%..8%
    const form = clamp(1 + randn(rng) * sigma, 0.88, 1.12);

    // Trip-luck: lite mer chans invändigt, lite mer risk utvändigt.
    const lane0 = Number.isFinite(h.lane) ? h.lane : h.number;
    const insideBonus = lane0 <= 3 ? 0.010 : (lane0 >= 8 ? -0.010 : 0);
    const trip = clamp(1 + insideBonus + randn(rng) * 0.028, 0.92, 1.08);

    // Aggressivitet (tempo första 500m). Snabbstartare + "ledning" i tips ger oftare tryck.
    const tip = String(h.tips || '').toLowerCase();
    const wantsLead = (tip.includes('ledning') || tip.includes('nå ledning') || tip.includes('spets'));
    const aggr = clamp(0.15 + 0.55*gate + 0.15*spr + (wantsLead ? 0.15 : 0) + (rng()-0.5)*0.15, 0, 1);
    if (aggr > 0.62) aggressiveCount++;

    // "Trafikhändelse" (t.ex. blev fast, fick backa, störning) som kan slå lite i ett fönster.
    // Sällsynt, men ger realism och variation.
    const trafficChance = clamp(0.05 + (1-rel)*0.20 + (lane0 >= 8 ? 0.05 : 0), 0.02, 0.30);
    const traffic = (rng() < trafficChance)
      ? {
          // när (i meter kvar) händelsen inträffar
          atRemain: 220 + rng()*320, // 220..540m kvar
          // hur mycket den tappar i fönstret
          penalty: clamp(1 - (0.02 + rng()*0.04), 0.92, 0.98),
        }
      : null;

    day.set(h.number, { form, trip, aggr, traffic });
  }

  // Tempofaktor: fler aggressiva => hårdare körning => mer trötthet för tät.
  const paceFactor = clamp(1 + Math.max(0, aggressiveCount-1) * 0.035 + (rng()-0.5)*0.04, 1.0, 1.18);

  const state = horses.map(h => {
    const handicap = h._sim.handicapM || 0;
    const rowBehind = (startType === 'auto' && h._sim.row === 1) ? 12 : 0;
    const startBehind = handicap + rowBehind;

    // start-lanes: autostart 1..8/9.., voltstart lane enligt dist&spår
    const lane0 = Number.isFinite(h.lane) ? h.lane : h.number;
    const d = day.get(h.number) || { form: 1, trip: 1, aggr: 0.5, traffic: null };
    return {
      num: h.number,
      lane: clamp(lane0, 1, 12) * 1.0, // float
      covered: -startBehind,           // inner-meter-axis
      speed: h._sim.baseSpeedMS * d.form * (0.86 + 0.22*h._sim.gate),
      fatigue: 0,
      err: false,
      finishedAt: null,
      _form: d.form,
      _trip: d.trip,
      _aggr: d.aggr,
      _traffic: d.traffic,
      _gapTried: false,
    };
  });

  const totalH = state.length;
  const dt = 0.28; // sek / tick (lite långsammare visuellt)
  const maxT = 400; // sek timeout
  const timeline = [];
  let t = 0;

  function getSorted(){
    return state
      .slice()
      .filter(s => !s.err)
      .sort((a,b)=>b.covered-a.covered);
  }

  function nearestAhead(me){
    const sorted = getSorted();
    const idx = sorted.findIndex(s => s.num === me.num);
    if (idx <= 0) return null;
    // leta närmaste framför inom 20m med liknande lane
    for (let j=idx-1; j>=0 && (sorted[idx].covered - sorted[j].covered) < 25; j--){
      const a = sorted[j];
      if (Math.abs(a.lane - me.lane) <= 0.9) return a;
    }
    return null;
  }

  function hasOutsideBlock(me){
    // om man sitter i rygg invändigt och det finns en utvändigt nära -> svårare att gå ut
    const sorted = getSorted();
    const idx = sorted.findIndex(s => s.num === me.num);
    if (idx <= 0) return false;
    const ahead = sorted[idx-1];
    if (!ahead) return false;
    const gap = ahead.covered - me.covered;
    if (gap < 0 || gap > 6) return false;
    // finns någon med lane 2-ish i samma "zon"?
    for (const s of sorted){
      if (s.num === me.num || s.num === ahead.num) continue;
      if (Math.abs(s.covered - me.covered) < 4 && s.lane > 1.8 && s.lane < 2.7) return true;
    }
    return false;
  }

  function settleTwoWide(){
    // efter start: pack i två rader max
    const sorted = getSorted();
    for (let i=0;i<sorted.length;i++){
      const s = sorted[i];
      const rank = i+1;
      let desired = 2;
      if (rank === 1) desired = 1;
      else if (rank <= 6){
        desired = (rank % 2 === 1) ? 1 : 2; // 1,2,1,2,...
      } else desired = 2;
      // smyg mot desired
      s.lane += clamp(desired - s.lane, -0.12, 0.12);
      s.lane = clamp(s.lane, 1, 4);
    }
  }

  function lateMoves(){
    // sista 350m: bakre hästar går ut i spår 3-5 för att speeda
    const sorted = getSorted();
    const leader = sorted[0];
    if (!leader) return;
    for (let i=0;i<sorted.length;i++){
      const s = sorted[i];
      const h = horses.find(x => x.number === s.num);
      const spr = h? h._sim.sprint : 0.5;

      const remain = (s.finishedAt != null) ? 0 : (distance - s.covered);
      if (remain > 360) continue;

      const behind = leader.covered - s.covered;
      if (behind < 0) continue;

      // om man ligger bakom och har bra spurt -> gå ut
      if (behind > 8 && spr > 0.55){
        // mer realistiskt: ofta spår 2–4, inte "alla längst ut"
        const target = 2 + Math.floor(rng()*3); // 2..4
        s.lane += clamp(target - s.lane, -0.18, 0.18);
        s.lane = clamp(s.lane, 1, 6);
      }

      // pocket-problem: om invändigt fast -> ännu större chans att gå ut
      if (s.lane < 1.7 && hasOutsideBlock(s) && remain < 300){
        s.lane += clamp(3.2 - s.lane, -0.20, 0.20);
      }
    }
  }


  function applyMinGap(){
    // Förhindra att hästar hamnar på exakt samma meter i samma spår (modell, inte bara grafik).
    // Detta tar bort "krockar" och att någon blir en stillastående vägg.
    const minGapM = 1.85;
    const laneBuckets = {};
    for (const s of state){
      if (s.err){
        // Ute ur loppet: flytta åt sidan så den inte "är i vägen"
        const outLane = 6.8;
        s.lane += clamp(outLane - s.lane, -0.18, 0.18);
        // bromsa ner tydligt
        s.speed += clamp(0 - s.speed, -0.55, 0.12);
        s.speed = Math.max(0, s.speed);
        // rulla lite framåt om den fortfarande har fart
        const laneScale = 1 + (s.lane - 1) * 0.012;
        const dErr = (s.speed * dt) / laneScale;
        s.covered += Math.max(0, dErr);
        continue;
      }
      const li = clamp(Math.round(s.lane), 1, 4);
      (laneBuckets[li] ||= []).push(s);
    }
    for (const k of Object.keys(laneBuckets)){
      const arr = laneBuckets[k].sort((a,b)=>b.covered-a.covered); // front först
      for (let i=1;i<arr.length;i++){
        const front = arr[i-1];
        const back  = arr[i];
        const desired = front.covered - minGapM;
        if (back.covered > desired){
          back.covered = desired;
          // om man blir "tillbakapressad" – sänk fart lite så modellen inte flippar
          back.speed = Math.min(back.speed, front.speed*0.985);
        }
      }
    }
  }

  function maybeError(h){
    const rel = h._sim.reliability ?? 0.8;
    const baseRisk = 0.045 + (1-rel)*0.18 + weatherNoise*0.10;
    return rng() < clamp(baseRisk, 0.03, 0.22);
  }

  // sim-loop
  const COOL_AFTER_FINISH_M = 85; // rulla efter mål och bromsa (val 2)
  while (t < maxT){
    // bryt om alla i mål / ute
    if (state.every(s => s.err || (s.finishedAt != null && s.covered >= distance + COOL_AFTER_FINISH_M))) break;

    const sorted = getSorted();
    const leader = sorted[0];

    // phases
    const meanCovered = leader ? leader.covered : 0;

    // tidig: stabilisera till två-wide efter ~12s
    if (t > 12 && t < 160) settleTwoWide();
    // upplopp: bredare spår
    lateMoves();

    for (const s of state){
      if (s.err){
        // Ute ur loppet: flytta åt sidan så den inte "är i vägen"
        const outLane = 6.8;
        s.lane += clamp(outLane - s.lane, -0.18, 0.18);
        // bromsa ner tydligt
        s.speed += clamp(0 - s.speed, -0.55, 0.12);
        s.speed = Math.max(0, s.speed);
        // rulla lite framåt om den fortfarande har fart
        const laneScale = 1 + (s.lane - 1) * 0.012;
        const dErr = (s.speed * dt) / laneScale;
        s.covered += Math.max(0, dErr);
        continue;
      }
      const finished = (s.finishedAt != null);
      if (finished && s.covered >= distance + COOL_AFTER_FINISH_M) continue;
      const h = horses.find(x => x.number === s.num);
      if (!h) continue;

      // galopp/strul: oftare i start + vid tempoökning
      if ((t < 20 || distance - s.covered < 420) && maybeError(h) && rng() < 0.12){
        s.err = true;
        s.errAt = t;
        // börja drifta utåt direkt
        s.lane = Math.max(s.lane, 5.6);
        continue;
      }

      const str = h._sim.strength;
      const stam = h._sim.stamina;
      const spr = h._sim.sprint;
      const gate = h._sim.gate;

      const remain = (s.finishedAt != null) ? 0 : (distance - s.covered);

      // target speed utifrån rekord + form
      let target = h._sim.baseSpeedMS;
      target *= (0.96 + 0.10*str);
      target *= (0.98 + 0.06*stam);

      // dagsform
      target *= (s._form || 1);

      // start-acc (tempo kan bli hårdare om flera vill till spets)
      if (t < 10) target *= (0.90 + 0.22*gate);
      if (t < 28) target *= (1 + (paceFactor-1) * (0.35 + 0.65*(s._aggr || 0.5)));

      // upplopps-kick (sista 350m + extra sista 180m)
      if (remain < 360) target *= (1.00 + 0.06*spr);
      if (remain < 180) target *= (1.00 + 0.05*spr);

      // "Klaff"/trip-luck: liten effekt, större när vi närmar oss upploppet
      // (inne/ute, dagsform, små händelser som påverkar sista biten)
      const trip = s._trip ?? 1;
      if (remain < 700){
        const tripW = (remain < 300) ? 0.80 : 0.45;
        target *= (1 + (trip - 1) * tripW);
      }

      // Trafik/strul-fönster: kort period där man tappar fart (blev fast, fick backa, störning).
      const traf = s._traffic;
      if (traf && remain < traf.atRemain && remain > (traf.atRemain - 55)){
        target *= (traf.penalty || 0.96);
      }

      // vind + "slita i spets"
      if (leader && leader.num === s.num){
        target *= (1 - wind*0.0020 - snow*0.0020);
      }

      // drafting: om rygg bakom någon -> lite gratis (minskar fatigue)
      const ahead = nearestAhead(s);
      let draft = 0;
      if (ahead){
        const gap = ahead.covered - s.covered;
        if (gap > 1.0 && gap < 14.0){
          draft = 1 + clamp(wind/12, 0, 0.5); // mer vind => mer nytta
          // starkare drafting på upploppet -> mer "samlad trupp"
          const draftK = (remain < 240) ? 0.018 : 0.010;
          target *= (1 + draftK * draft);
          s.fatigue *= 0.997; // sparar lite
        }
      }

      // ytterspår = fler meter. laneScale sänker progress på inner-axis
      const laneScale = 1 + (s.lane - 1) * 0.012; // spår 5 -> ~+4.8%
      // Efter målgång: fortsätt rulla fram en kort bit (så hästarna inte "stannar" vid linjen)
      if (finished){
        const past = Math.max(0, s.covered - distance);
        const k = clamp(1 - (past / COOL_AFTER_FINISH_M), 0, 1); // 1→0 under "rollout"
        let target2 = h._sim.baseSpeedMS * (0.78 + 0.05*(s._form || 1));
        // tydlig inbromsning efter mål (val 2)
        target2 *= (0.22 + 0.78 * k);
        // väder
        target2 *= clamp(weatherSlow, 0.88, 1.05);
        const minRoll = 3.0;
        target2 = Math.max(minRoll, target2);
        s.speed += clamp(target2 - s.speed, -0.55, 0.18);
        const delta2 = (s.speed * dt) / laneScale;
        s.covered += delta2;
        continue;
      }
      // pocket-block: invändigt fast bakom – ibland får man lucka, ibland blir man kvar.
      // Viktigt att detta inte triggar varje tick (då blir det "samma" utfall och konstigt beteende).
      if (hasOutsideBlock(s) && s.lane < 1.7 && remain > 200){
        if (!s._gapTried && remain < 285 && remain > 140){
          s._gapTried = true;
          const luck = clamp(0.18 + 0.40*spr + 0.12*(trip-1)*10 + (rng()-0.5)*0.18, 0.05, 0.80);
          if (rng() < luck){
            // lucka: smita ut i spår 2-ish
            s.lane += clamp(2.25 - s.lane, -0.22, 0.22);
            target *= 1.006;
          } else {
            // kvar invändigt: tappar lite fart en bit
            target *= 0.972;
          }
        } else {
          // om man fortfarande sitter kvar invändigt på upploppet
          if (remain < 220) target *= 0.988;
        }
      }

      // trötthet
      const effort = (target - h._sim.baseSpeedMS) / Math.max(1e-6, h._sim.baseSpeedMS);
      // tempo förstärker trötthet för tät/utvändigt
      const frontish = leader ? (leader.covered - s.covered) < 10 : false;
      const paceFat = (t < 38 && frontish) ? (paceFactor-1) * 0.012 : 0;
      s.fatigue += clamp(0.0018 + 0.0040*Math.max(0, effort) + (s.lane>2.3 ? 0.0012 : 0) + paceFat, 0, 0.03);
      s.fatigue = clamp(s.fatigue, 0, 0.55);

      // fatigue slows
      target *= (1 - 0.10*s.fatigue);

      // väder
      target *= clamp(weatherSlow + (rng()-0.5)*weatherNoise, 0.88, 1.05);

      // enkel speed-smoothing
      s.speed += clamp(target - s.speed, -0.35, 0.35);

      // progress
      const delta = (s.speed * dt) / laneScale;
      s.covered += delta;

      if (s.covered >= distance && s.finishedAt == null){
        s.finishedAt = t;
      }
    }

    applyMinGap();

    if (withTimeline){
      // spara var 2:a tick för mindre data men mjukt nog
      if (Math.round(t / dt) % 2 === 0){
        const snap = {};
        const lanes = {};
        const flags = {};
        for (const s of state){
          snap[s.num] = s.covered;
          lanes[s.num] = s.lane;
          flags[s.num] = { err: !!s.err, inactive: !!s.err || !!s._doneRolling || !!s._parked || false };
        }
        timeline.push({ t, metersByNum: snap, laneByNum: lanes, flagsByNum: flags });
      }
    }

    t += dt;
  }

  const finish = state
    .filter(s => !s.err)
    .slice()
    .sort((a,b) => {
      // om båda i mål: lägre tid vinner
      if (a.finishedAt != null && b.finishedAt != null) return a.finishedAt - b.finishedAt;
      // annars längre fram
      return b.covered - a.covered;
    })
    .map(s => ({ num: s.num, finishedAt: s.finishedAt, meters: s.covered }));

  return {
    timeline,
    finish,
    meta: {
      startType,
      distance,
      wind, snow, temp,
      leader: finish[0]?.num ?? null,
    }
  };
}

function monteCarloWinners({ horses, distance, startType, env, iterations, seedBase }){
  const iters = iterations || 160;
  const winCount = new Map();
  const top3Count = new Map();

  const base = seedBase || 1000;
  for (let i=0;i<iters;i++){
    const r = simulateRace({ horses, distance, startType, env, seed: base + i*17, withTimeline: false });
    const f = r.finish;
    if (!f.length) continue;

    winCount.set(f[0].num, (winCount.get(f[0].num)||0) + 1);
    for (let k=0;k<Math.min(3, f.length);k++){
      const n = f[k].num;
      top3Count.set(n, (top3Count.get(n)||0) + 1);
    }
  }

  const ranked = horses.map(h => ({
    num: h.number,
    name: h.name,
    winP: (winCount.get(h.number)||0)/iters,
    top3P: (top3Count.get(h.number)||0)/iters
  })).sort((a,b)=>b.winP-a.winP);

  return { ranked, iters };
}

function renderTop3(el, items){
  if (!el) return;
  el.innerHTML = '';
  for (const it of items.slice(0,3)){
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="left">
        <span class="sim-pill">#${it.num}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">${it.name}</span>
      </div>
      <div class="right">
        <b>${Math.round(it.winP*100)}%</b>
        <span style="opacity:.7">(${Math.round(it.top3P*100)}%)</span>
      </div>
    `;
    el.appendChild(row);
  }
}

function renderScenario(el, env, meta, topPick){
  if (!el) return;
  el.textContent =
`Väder: ${env.tempC ?? '-'}°C, vind ${env.wind ?? '-'} m/s, snö ${env.snowCm ?? '-'} cm.
Start: ${meta?.startType || '?'} • Distans: ${meta?.distance || '-'} m.
Modell: stadium-oval (raka + kurvor) + två-wide pack + drafting + ytterspårs-meter + upploppsspår 3–4.
Trolig vinnare: ${topPick ? ('#'+topPick.num+' ('+Math.round(topPick.winP*100)+'%)') : '?' }.`;
}

function seededColor(n){
  const r = mulberry32((n||1)*99991)();
  const g = mulberry32((n||1)*99991+7)();
  const b = mulberry32((n||1)*99991+13)();
  const rr = Math.floor(80 + r*150);
  const gg = Math.floor(80 + g*150);
  const bb = Math.floor(80 + b*150);
  return `rgb(${rr},${gg},${bb})`;
}

function drawTrack(ctx, geom){
  ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
  const { centerX, centerY, ovalW, ovalH } = geom;

  // Mörk bakgrund med lätt vignette för "TV-grafik"-känsla
  const bg = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(ctx.canvas.width, ctx.canvas.height));
  bg.addColorStop(0, 'rgba(255,255,255,0.06)');
  bg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);

  // Bana – ritas genom sampling av mapMetersToXY() så den alltid matchar själva simuleringsbanan.
  // (Detta undviker att kortsidan "går inåt" när bakgrunden inte matchar geometrin.)
  const step = 8; // meter

  // "Asfalt"-band (yttre)
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 20;
  ctx.beginPath();
  for (let s=0; s<=geom.totalLen; s+=step){
    const p = mapMetersToXY(s, 6.6, geom);
    if (s===0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();

  // ytterkant highlight
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (let s=0; s<=geom.totalLen; s+=step){
    const p = mapMetersToXY(s, 6.2, geom);
    if (s===0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();

  // spårlinjer (6 spår)
  for (let lane=1; lane<=6; lane++){
    ctx.strokeStyle = lane===1 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.10)';
    ctx.lineWidth = lane===1 ? 3 : 2;
    ctx.beginPath();
    for (let s=0; s<=geom.totalLen; s+=step){
      const p = mapMetersToXY(s, lane, geom);
      if (s===0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // mål-linje (s=0 i vår bana)
  const pFinishA = mapMetersToXY(0, 1.15, geom);
  const pFinishB = mapMetersToXY(0, 2.45, geom);
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = 'rgba(255,255,255,.90)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pFinishA.x, pFinishA.y);
  ctx.lineTo(pFinishB.x, pFinishB.y);
  ctx.stroke();
  ctx.restore();
  // MÅL-etikett och markering ritas senare i drawTrackWorld()
}

function animateRace({ canvas, sideCanvas = null, miniCanvas = null, horses, track, sampleRun, renderHud = true, sideCamMeters = 300, onProgress = null, onFinish = null }){
  const ctx = canvas.getContext('2d', { alpha:true });
  const sideCtx = sideCanvas ? sideCanvas.getContext('2d', { alpha:true }) : null;
  const miniCtx = miniCanvas ? miniCanvas.getContext('2d', { alpha:true }) : null;
  if (!ctx.roundRect){
    // fallback for older canvas impl
    ctx.roundRect = function(x,y,w,h,r){
      r = Math.min(r, w/2, h/2);
      this.beginPath();
      this.moveTo(x+r, y);
      this.arcTo(x+w, y, x+w, y+h, r);
      this.arcTo(x+w, y+h, x, y+h, r);
      this.arcTo(x, y+h, x, y, r);
      this.arcTo(x, y, x+w, y, r);
      this.closePath();
      return this;
    };
  }

if (sideCtx && !sideCtx.roundRect){
  // fallback för äldre canvas
  sideCtx.roundRect = function(x,y,w,h,r){
    r = Math.min(r, w/2, h/2);
    this.beginPath();
    this.moveTo(x+r, y);
    this.arcTo(x+w, y, x+w, y+h, r);
    this.arcTo(x+w, y+h, x, y+h, r);
    this.arcTo(x, y+h, x, y, r);
    this.arcTo(x, y, x+w, y, r);
    this.closePath();
    return this;
  };
}
  let raf = null;
  let startTs = null;
  let finishedOnce = false;
    let lastFlagsByNum = {};
let followM = null; // kamera-följning (meter längs banan)

  const geom = getTrackGeometry(track||{}, canvas);
  const timeline = sampleRun?.timeline || [];
  const simMeta = sampleRun?.meta || {};
  const durationMs = 22000; // lite långsammare och mer "TV"-känsla

  // ====== Trails (spår) ======
  const trailsByNum = new Map(); // num -> [{x,y}]
  const TRAIL_MAX = 80;

  // ====== Mini-standings (1–5) ======
  const lastRankByNum = new Map(); // num -> rank

  // ====== Kamera (pan/zoom) ======
  const cam = {
    x: geom.centerX,
    y: geom.centerY,
    zoom: 1.10,
    tilt: 0.72,
  };

  function lerp(a,b,t){ return a + (b-a)*t; }

  function pushTrailPoint(num, x, y){
    let arr = trailsByNum.get(num);
    if (!arr){ arr = []; trailsByNum.set(num, arr); }
    arr.push({ x, y });
    if (arr.length > TRAIL_MAX) arr.splice(0, arr.length - TRAIL_MAX);
  }

  function drawBackground(){
    // Mörk bakgrund med vignette (skärm-space)
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);

    const { centerX, centerY } = geom;
    const bg = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(ctx.canvas.width, ctx.canvas.height));
    bg.addColorStop(0, 'rgba(255,255,255,0.05)');
    bg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  // --- Finish på banan (fast position) + SHIFT så att distansens mål hamnar vid finish ---
// Vi vill att MÅL ska ligga på samma plats oavsett distans (som i TV-grafik),
// och därför skiftar vi hästarnas meter->bana så att covered=distance hamnar vid finishS.
  const totalLen = geom.totalLen || 1000;
  const distanceM = simMeta?.distance ?? 2140;

  const finishS = 0; // fast "MÅL"-position i stadium-mappningen
  const distMod = ((distanceM % totalLen) + totalLen) % totalLen;
  const shiftS = ((finishS - distMod) % totalLen + totalLen) % totalLen;

  const marker500S = ((finishS - 500) % totalLen + totalLen) % totalLen;
  const marker200S = ((finishS - 200) % totalLen + totalLen) % totalLen;

;

  function drawTrackWorld(){
    const totalLen = geom.totalLen || 1000;

    // yttre/inner spår (sampel-bana så den matchar mapMetersToXY exakt)
    const lanes = [1,2,3,4,5,6];
    for (let li=0; li<lanes.length; li++){
      const lane = lanes[li];
      const step = 10; // meter
      ctx.beginPath();
      for (let s=0; s<=totalLen; s+=step){
        const p = mapMetersToXY(s, lane, geom);
        if (s===0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();

      if (li === 0){
        ctx.strokeStyle = 'rgba(255,255,255,.18)';
        ctx.lineWidth = 5;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.10)';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
    }

    // Mållinje + markörer (200/500)
    function drawMarkerAtS(s, label, alpha){
      const p = mapMetersToXY(s, 1.15, geom);
      const p2 = mapMetersToXY(s, 2.45, geom);

      // linje över spåren
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // label
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.roundRect(p2.x + 8, p2.y - 10, 46, 20, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '700 11px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p2.x + 14, p2.y);

      ctx.restore();
    }

    // mål (lite tydligare)
    drawMarkerAtS(finishS, 'MÅL', 1);
    drawMarkerAtS(marker500S, '500', 0.85);
    drawMarkerAtS(marker200S, '200', 0.92);
  }

  function drawTrails(){
    for (const h of horses){
      const num = h.number;
      const arr = trailsByNum.get(num);
      if (!arr || arr.length < 2) continue;

      const base = seededColor(num);
      for (let i=1;i<arr.length;i++){
        const a = i / (arr.length - 1);
        ctx.globalAlpha = 0.05 + a * 0.18;
        ctx.strokeStyle = base;
        ctx.lineWidth = 6 - a*3;
        ctx.beginPath();
        ctx.moveTo(arr[i-1].x, arr[i-1].y);
        ctx.lineTo(arr[i].x, arr[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function getFrameIndex(progress01){
    if (!timeline.length) return { i:0, frac:0 };
    const idxF = progress01 * (timeline.length - 1);
    const i = Math.floor(idxF);
    return { i, frac: idxF - i };
  }

  function getInterpolated(progress01){
    if (!timeline.length) return { meters:{}, lanes:{}, simT: 0, flagsByNum: {} };
    const { i, frac } = getFrameIndex(progress01);
    const A = timeline[i];
    const B = timeline[Math.min(i+1, timeline.length-1)];
    const meters = {};
    const lanes = {};
    for (const h of horses){
      const n = (h.number ?? h.num);
      const a = A.metersByNum?.[n] ?? 0;
      const b = B.metersByNum?.[n] ?? a;
      const la = A.laneByNum?.[n] ?? 1;
      const lb = B.laneByNum?.[n] ?? la;
      meters[n] = lerp(a,b,frac);
      lanes[n] = lerp(la,lb,frac);
    }
    const simT = lerp(A.t ?? 0, B.t ?? (A.t ?? 0), frac);
    const flagsByNum = A.flagsByNum || {};
    return { meters, lanes, simT, flagsByNum };
  }


  function eased(u){
    // längre tid på upploppet (sista 20%)
    if (u <= 0.80) return (u/0.80) * 0.70;
    return 0.70 + ((u-0.80)/0.20) * 0.30;
  }

  function computeRanks(metersByNum){
    return horses
      .map(h => ({ num: h.number, m: metersByNum?.[h.number] ?? 0 }))
      .sort((a,b)=>b.m-a.m);
  }

  function drawHUD({ ranks, leaderRemain, simT, analysisName, startType, distance }){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);

    // top-left info
    const pad = 14;
    const boxW = 340;
    const boxH = 88;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.roundRect(pad, pad, boxW, boxH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const trackName = track?.name || track?.code || '';

    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '800 13px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${trackName}${analysisName ? ' • Analys: ' + analysisName : ' • Analys: —'}`, pad+12, pad+10);

    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto';
    const st = startType ? (startType === 'auto' ? 'Autostart' : 'Voltstart') : '';
    const distTxt = distance ? `${distance}m` : '';
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.fillText(`${st}${(st && distTxt) ? ' • ' : ''}${distTxt} • Tid: ${simT.toFixed(1)}s`, pad+12, pad+32);

    const lead = ranks?.[0]?.num;
    const remainTxt = Number.isFinite(leaderRemain) ? `${Math.max(0, Math.round(leaderRemain))}m kvar` : '—';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '800 18px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(lead != null ? `#${lead}  ${remainTxt}` : remainTxt, pad+12, pad+52);

    // 500/200-pill
    function pill(x, y, label, active){
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = active ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)';
      ctx.strokeStyle = active ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, 54, 22, 999);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.75)';
      ctx.font = '800 12px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x+27, y+11);
      ctx.restore();
    }

    const yP = pad + boxH + 10;
    const active500 = Number.isFinite(leaderRemain) ? leaderRemain <= 500 : false;
    const active200 = Number.isFinite(leaderRemain) ? leaderRemain <= 200 : false;
    pill(pad, yP, '500m', active500);
    pill(pad+60, yP, '200m', active200);

    // bottom-left: mini standings 1–5
    const standW = 180;
    const standH = 138;
    const sx = 14;
    const sy = ctx.canvas.height - standH - 14;

    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath();
    ctx.roundRect(sx, sy, standW, standH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.90)';
    ctx.font = '800 12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Placering', sx+12, sy+10);

    const top5 = ranks.slice(0,5);
    ctx.font = '700 12px system-ui, -apple-system, Segoe UI, Roboto';

    for (let i=0;i<top5.length;i++){
      const num = top5[i].num;
      const prevRank = lastRankByNum.get(num);
      const nowRank = i+1;
      let arrow = '•';
      if (prevRank != null){
        if (nowRank < prevRank) arrow = '▲';
        else if (nowRank > prevRank) arrow = '▼';
      }

      const rowY = sy + 34 + i*20;
      // färgboll
      ctx.globalAlpha = 1;
      ctx.fillStyle = seededColor(num);
      ctx.beginPath();
      ctx.arc(sx+18, rowY+8, 5, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillText(`${nowRank}.  #${num}`, sx+30, rowY);

      ctx.fillStyle = 'rgba(255,255,255,.70)';
      ctx.fillText(arrow, sx+140, rowY);
    }

    ctx.restore();
  }

  
function drawSulkyTop(p, n, base, isLead, isSecond){
  const ang = p?.ang ?? 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);

  // shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.ellipse(-2, 10, 18, 7, 0, 0, Math.PI*2);
  ctx.fill();

  // wheels + axle
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 2;
  const wx = -18;
  for (const wy of [-7, 7]){
    ctx.beginPath();
    ctx.arc(wx, wy, 6.2, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    // spokes (lätt animation)
    const spokeAng = (p.spin || 0) + (wx<0 ? 0 : 0.6);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    const sx = Math.cos(spokeAng) * 6;
    const sy = Math.sin(spokeAng) * 6;
    ctx.moveTo(wx - sx, wy - sy);
    ctx.lineTo(wx + sx, wy + sy);
    ctx.moveTo(wx - sy, wy + sx);
    ctx.lineTo(wx + sy, wy - sx);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
  }
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(wx, -7);
  ctx.lineTo(wx, 7);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // shafts (mot hästen)
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wx+6, -6);
  ctx.lineTo(-6, -6);
  ctx.moveTo(wx+6, 6);
  ctx.lineTo(-6, 6);
  ctx.stroke();

  // body (mörk)
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = 'rgba(10,12,16,.78)';
  ctx.beginPath();
  ctx.roundRect(-6, -9, 24, 18, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // saddle cloth
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.roundRect(6, -9, 16, 18, 6);
  ctx.fill();

  // number on cloth
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 14, 0.5);

  // horse head
  ctx.fillStyle = 'rgba(10,12,16,.86)';
  ctx.beginPath();
  ctx.arc(21, -3, 4, 0, Math.PI*2);
  ctx.fill();

  // highlight for lead / second
  if (isLead){
    ctx.strokeStyle = 'rgba(70,255,140,.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-8, -11, 40, 22, 12);
    ctx.stroke();
  } else if (isSecond){
    ctx.strokeStyle = 'rgba(185,120,255,.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-7, -10, 38, 20, 12);
    ctx.stroke();
  }

  // glow
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(8, 0, 26, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}


function drawMiniMap({ metersByNum, lanesByNum, flagsByNum = {} }){
  if (!miniCtx || !miniCanvas) return;
  const w = miniCanvas.width, h = miniCanvas.height;
  miniCtx.save();
  miniCtx.setTransform(1,0,0,1,0,0);
  miniCtx.clearRect(0,0,w,h);

  // bakgrund
  miniCtx.fillStyle = 'rgba(0,0,0,0.22)';
  miniCtx.fillRect(0,0,w,h);

  // liten geom för mini
  const g = getTrackGeometry(track||{}, miniCanvas, 14);
  // enkel oval (ytterkant)
  const step = Math.max(6, Math.floor(g.totalLen/180));
  miniCtx.strokeStyle = 'rgba(255,255,255,0.28)';
  miniCtx.lineWidth = 2;
  miniCtx.beginPath();
  for (let s=0; s<=g.totalLen; s+=step){
    const p = mapMetersToXY(s, 6.2, g);
    if (s===0) miniCtx.moveTo(p.x, p.y);
    else miniCtx.lineTo(p.x, p.y);
  }
  miniCtx.closePath();
  miniCtx.stroke();

  // prickar (hästar)
  for (const h0 of horses){
    const n = (h0.number ?? h0.num);
    const m = metersByNum?.[n] ?? 0;
    const lane = lanesByNum?.[n] ?? (h0._sim?.lane ?? 2.0);
    const p = mapMetersToXY(m, lane, g);
    const f = flagsByNum?.[n] || {};
    const isDQ = !!(f.dq || f.disq || f.gallop || f.gaitChange) || dqStartMsByNum.has(n);
    miniCtx.fillStyle = isDQ ? 'rgba(255,60,60,.95)' : (h0.color || seededColor(n));
    miniCtx.beginPath();
    miniCtx.arc(p.x, p.y, 4.5, 0, Math.PI*2);
    miniCtx.fill();
    if (isDQ){
      miniCtx.strokeStyle = 'rgba(255,255,255,.35)';
      miniCtx.lineWidth = 1.5;
      miniCtx.beginPath();
      miniCtx.arc(p.x, p.y, 6.5, 0, Math.PI*2);
      miniCtx.stroke();
    }
  }

  miniCtx.restore();
}

function drawSideCam({ metersByNum, ranks, distance }){
  if (!sideCtx || !sideCanvas) return;

  const w = sideCanvas.width, h = sideCanvas.height;
  sideCtx.clearRect(0,0,w,h);

  // background
  const g = sideCtx.createLinearGradient(0,0,0,h);
  g.addColorStop(0, 'rgba(0,0,0,.35)');
  g.addColorStop(1, 'rgba(0,0,0,.55)');
  sideCtx.fillStyle = g;
  sideCtx.fillRect(0,0,w,h);

  const pad = 18;
  const finishX = w - pad;
  const top = 26;
  const bot = h - 26;

  // finish pole
  sideCtx.strokeStyle = 'rgba(255,255,255,.92)';
  sideCtx.lineWidth = 3;
  sideCtx.beginPath();
  sideCtx.moveTo(finishX, top);
  sideCtx.lineTo(finishX, bot);
  sideCtx.stroke();

  sideCtx.globalAlpha = 0.9;
  sideCtx.lineWidth = 6;
  for (let y=top; y<bot; y+=18){
    sideCtx.strokeStyle = (Math.floor(y/18)%2===0) ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.85)';
    sideCtx.beginPath();
    sideCtx.moveTo(finishX, y);
    sideCtx.lineTo(finishX, y+10);
    sideCtx.stroke();
  }
  sideCtx.globalAlpha = 1;

  // rails
  sideCtx.strokeStyle = 'rgba(255,255,255,.14)';
  sideCtx.lineWidth = 2;
  sideCtx.beginPath();
  sideCtx.moveTo(pad, top);
  sideCtx.lineTo(finishX, top);
  sideCtx.moveTo(pad, bot);
  sideCtx.lineTo(finishX, bot);
  sideCtx.stroke();

  const safeRanks = Array.isArray(ranks) ? ranks : [];
  const show = safeRanks.slice(0, Math.min(8, safeRanks.length));
  const usableW = (finishX - pad);
  const yStep = (show.length <= 1) ? 0 : ((bot - top) / (show.length - 1));

  for (let i=0;i<show.length;i++){
    const num = show[i].num;
    const m = metersByNum?.[num] ?? 0;
    const remain = distance - m;
    const prog = clamp((sideCamMeters - remain) / sideCamMeters, 0, 1);
    const x = pad + prog * usableW;
    const y = top + i * yStep;
    const col = seededColor(num);

    // shadow
    sideCtx.globalAlpha = 0.22;
    sideCtx.fillStyle = 'rgba(0,0,0,.6)';
    sideCtx.beginPath();
    sideCtx.ellipse(x-8, y+8, 18, 6, 0, 0, Math.PI*2);
    sideCtx.fill();

    // wheels
    sideCtx.globalAlpha = 0.95;
    sideCtx.fillStyle = 'rgba(0,0,0,.55)';
    sideCtx.strokeStyle = 'rgba(255,255,255,.16)';
    sideCtx.lineWidth = 2;
    for (const dy of [-7, 7]){
      sideCtx.beginPath();
      sideCtx.arc(x-18, y+dy, 6, 0, Math.PI*2);
      sideCtx.fill();
      sideCtx.stroke();
    }

    // body
    sideCtx.globalAlpha = 0.96;
    sideCtx.fillStyle = 'rgba(10,12,16,.78)';
    sideCtx.beginPath();
    sideCtx.roundRect(x-6, y-9, 24, 18, 9);
    sideCtx.fill();

    // cloth
    sideCtx.globalAlpha = 0.95;
    sideCtx.fillStyle = col;
    sideCtx.beginPath();
    sideCtx.roundRect(x+6, y-9, 16, 18, 6);
    sideCtx.fill();

    // num
    sideCtx.globalAlpha = 1;
    sideCtx.fillStyle = 'rgba(255,255,255,.95)';
    sideCtx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
    sideCtx.textAlign = 'center';
    sideCtx.textBaseline = 'middle';
    sideCtx.fillText(String(num), x+14, y+0.5);
  }

  sideCtx.fillStyle = 'rgba(255,255,255,.82)';
  sideCtx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
  sideCtx.textAlign = 'right';
  sideCtx.textBaseline = 'bottom';
  sideCtx.fillText('MÅL', finishX-6, top-6);
}


function drawMiniMap({ metersByNum, lanesByNum }){
  if (!miniCtx || !miniCanvas) return;
  // ensure size
  const w = miniCanvas.width || 1;
  const h = miniCanvas.height || 1;
  miniCtx.save();
  miniCtx.setTransform(1,0,0,1,0,0);
  miniCtx.clearRect(0,0,w,h);

  // background
  const g = miniCtx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'rgba(255,255,255,0.05)');
  g.addColorStop(1,'rgba(0,0,0,0.55)');
  miniCtx.fillStyle = g;
  miniCtx.fillRect(0,0,w,h);

  // mini-geom based on mini canvas
  const mg = getTrackGeometry(track||{}, miniCanvas);
  const totalLen = mg.totalLen || 1000;

  // draw lanes (oval) – only here
  const lanes = [1,2,3,4,5,6];
  for (let li=0; li<lanes.length; li++){
    const lane = lanes[li];
    const step = 12;
    miniCtx.beginPath();
    for (let s=0; s<=totalLen; s+=step){
      const p = mapMetersToXY(s, lane, mg);
      if (s===0) miniCtx.moveTo(p.x, p.y);
      else miniCtx.lineTo(p.x, p.y);
    }
    miniCtx.closePath();
    miniCtx.strokeStyle = (li===0) ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.10)';
    miniCtx.lineWidth = (li===0) ? 3 : 1.4;
    miniCtx.stroke();
  }

  // dots
  for (const h0 of horses){
    const n = (h0.number ?? h0.num);
    const m = metersByNum?.[n] ?? 0;
    let lane = lanesByNum?.[n] ?? 1;
    lane = clamp(lane, 1.05, 5.8);
    const pp = mapMetersToXY(m + shiftS, lane, mg);

    miniCtx.globalAlpha = 0.22;
    miniCtx.fillStyle = 'rgba(0,0,0,.85)';
    miniCtx.beginPath();
    miniCtx.ellipse(pp.x, pp.y+4, 9, 4, 0, 0, Math.PI*2);
    miniCtx.fill();

    miniCtx.globalAlpha = 0.98;
    miniCtx.fillStyle = seededColor(n);
    miniCtx.beginPath();
    miniCtx.arc(pp.x, pp.y, 6.5, 0, Math.PI*2);
    miniCtx.fill();

    miniCtx.globalAlpha = 1;
    miniCtx.fillStyle = 'rgba(255,255,255,.95)';
    miniCtx.font = '700 9px system-ui, -apple-system, Segoe UI, Roboto';
    miniCtx.textAlign = 'center';
    miniCtx.textBaseline = 'middle';
    miniCtx.fillText(String(n), pp.x, pp.y+0.5);
  }

  miniCtx.restore();
}

function drawWorld({ metersByNum, lanesByNum, flagsByNum, ranks, leaderRemain }){
  // HUVUDVY = “kamera” som alltid visar ledaren (som upplopp-view), ingen oval här.
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  const safeRanks = Array.isArray(ranks) ? ranks : [];
  const leadNum = safeRanks?.[0]?.num;
  const leadM = (leadNum != null) ? (metersByNum?.[leadNum] ?? 0) : 0;

  // mjuk kamera: följ ledaren men med easing
  if (followM == null) followM = leadM;
  followM = followM + (leadM - followM) * 0.14;
  const camM = followM;

  // view window (meters)
  const isStretch = Number.isFinite(leaderRemain) && leaderRemain <= 300;

  // view window (meters) – mer zoom än tidigare
  const backM = isStretch ? 360 : 520;   // hur långt bak vi ser (zoomar ut mer)
  const frontM = isStretch ? 260 : 380;  // hur långt fram vi ser (zoomar ut mer)
  const spanM = backM + frontM;

  // px per meter – lite mindre än tidigare (zoomar ut). Vid upplopp (<=300m) zoomar vi in lite.
  let pxPerM = (w * 0.68) / spanM;
  if (isStretch) pxPerM *= 1.12; // lätt extra zoom på upploppet

  const leaderX = w * 0.62;
  const midY = h * 0.60;

  // lanes
  const laneGap = 36; // bredare spår visuellt
  const laneCount = 6;
  const top = midY - laneGap * (laneCount-1)/2;

  // draw “straight” lanes (camera view)
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  // 2.5D-känsla: lätt tilt genom att komprimera Y runt mitten
  ctx.translate(0, midY);
  ctx.scale(1, 0.88);
  ctx.translate(0, -midY);

  // subtle fog layer for TV feel
  const fog = ctx.createLinearGradient(0,0,w,0);
  fog.addColorStop(0,'rgba(0,0,0,.55)');
  fog.addColorStop(0.30,'rgba(0,0,0,.15)');
  fog.addColorStop(0.70,'rgba(0,0,0,.12)');
  fog.addColorStop(1,'rgba(0,0,0,.50)');

  // lane lines
  for (let i=0;i<laneCount;i++){
    const y = top + i*laneGap;
    ctx.strokeStyle = (i==0) ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.10)';
    ctx.lineWidth = (i==0) ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // finish marker (if we know distance)
  if (simMeta.distance != null && Number.isFinite(leaderRemain)){
    const finishX = leaderX + (leaderRemain) * pxPerM;
    if (finishX > 20 && finishX < w-20){
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(finishX, top-18);
      ctx.lineTo(finishX, top + laneGap*(laneCount-1) + 18);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.roundRect(finishX-24, top-40, 48, 20, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '800 11px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText('MÅL', finishX, top-30);
      ctx.restore();
    }
  }

  // horses in camera coordinates
  // draw back-to-front for depth
  const order = safeRanks.slice().reverse();
  const placed = []; // simple de-overlap in screen coords
  for (const r of order){
    const n = r.num;
    const f = flagsByNum?.[n];
    if (f?.inactive) continue;
    const m = metersByNum?.[n] ?? 0;
    const dm = m - camM;
    if (dm < -backM || dm > frontM) continue;
    let lane = lanesByNum?.[n] ?? 1;
    lane = clamp(lane, 1.05, 5.8);
    let y = top + (lane-1) * laneGap;
    const x = leaderX + dm * pxPerM;

    // De-overlap: if two sulkies end up on (almost) the same spot, push in Y.
    // (Keeps the “pack” readable without breaking lane logic too much.)
    for (let tries=0; tries<6; tries++){
      let bumped = false;
      for (const p0 of placed){
        const dx = Math.abs(x - p0.x);
        const dy = Math.abs(y - p0.y);
        if (dx < 34 && dy < 22){
          y += (y <= p0.y ? -14 : 14);
          bumped = true;
        }
      }
      if (!bumped) break;
    }
    const minY = top - 14;
    const maxY = top + laneGap*(laneCount-1) + 14;
    y = clamp(y, minY, maxY);
    placed.push({ x, y });

    const isLead = (n === leadNum);
    const isSecond = (safeRanks?.[1]?.num === n);

    // use the same “TV sulky” icon (like sidecam) but larger
    const col = seededColor(n);

    // shadow
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    ctx.beginPath();
    ctx.ellipse(x-10, y+10, 22, 7, 0, 0, Math.PI*2);
    ctx.fill();

    // wheels (animated)
    const spin = (m/10) % (Math.PI*2);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 2;
    for (const dy of [-8, 8]){
      ctx.beginPath();
      ctx.arc(x-22, y+dy, 7, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      // spokes
      ctx.save();
      ctx.translate(x-22, y+dy);
      ctx.rotate(spin);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6,0); ctx.lineTo(6,0);
      ctx.moveTo(0,-6); ctx.lineTo(0,6);
      ctx.stroke();
      ctx.restore();
    }

    // body
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(10,12,16,.78)';
    ctx.beginPath();
    ctx.roundRect(x-6, y-11, 30, 22, 10);
    ctx.fill();

    // cloth (number plate)
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(x+10, y-11, 18, 22, 7);
    ctx.fill();

    // highlight lead/second
    if (isLead || isSecond){
      ctx.globalAlpha = isLead ? 0.92 : 0.55;
      ctx.strokeStyle = isLead ? 'rgba(120,220,255,.85)' : 'rgba(255,255,255,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x-10, y-15, 50, 30, 12);
      ctx.stroke();
    }

    // number
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = 'bold 13px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x+19, y+0.5);
  }

  // overlay fog
  ctx.globalAlpha = 1;
  ctx.fillStyle = fog;
  ctx.fillRect(0,0,w,h);

  ctx.restore();
}


  function frame(ts){
    if (!startTs) startTs = ts;
    const tms = ts - startTs;
    let u = clamp(tms / durationMs, 0, 1);
    // SLOWMO_FINISH: lite långsammare sista biten för spänning
    const slowStart = 0.78;
    if (u > slowStart){
      u = slowStart + (u - slowStart) * 0.55;
    }
    const p = eased(u);

    drawBackground();

    const { meters, lanes, simT, flagsByNum = {} } = getInterpolated(p);
    lastFlagsByNum = flagsByNum || {};
    const ranks = computeRanks(meters);

    // uppdatera rank-historik för pilar
    for (let i=0;i<Math.min(12, ranks.length);i++){
      lastRankByNum.set(ranks[i].num, i+1);
    }

    // leader remain
    const distance = simMeta.distance ?? null;
    const leadCovered = ranks?.[0]?.m ?? 0;
    const leaderRemain = (distance != null) ? (distance - leadCovered) : null;

    drawWorld({ metersByNum: meters, lanesByNum: lanes, flagsByNum, ranks, leaderRemain });

    // Mini-oval (karta) nere i hörnet
    drawMiniMap({ metersByNum: meters, lanesByNum: lanes, flagsByNum });

    if (typeof onProgress === 'function'){
      try{ onProgress({ leaderRemain, ranks, simT }); }catch{}
    }

    if (renderHud){
      drawHUD({
        ranks,
        leaderRemain,
        simT,
        analysisName: simMeta.analysisName || simMeta.analysis || '',
        startType: simMeta.startType,
        distance: simMeta.distance,
      });
    }

    if (u < 1){
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
      if (!finishedOnce){
        finishedOnce = true;
        if (typeof onFinish === 'function'){
          try{
            const isDQNum = (n)=> {
  const f = lastFlagsByNum?.[n] || {};
  return !!(f.dq || f.disq || f.gallop || f.gaitChange) || dqStartMsByNum.has(n);
};
const winnerNum = (ranks || []).find(r => !isDQNum(r.num))?.num ?? (ranks?.[0]?.num ?? null);
            const winnerHorse = horses.find(h => (h.number ?? h.num) === winnerNum) || null;
            onFinish({ winnerNum, winnerHorse, ranks });
          }catch{}
        }
      }
    }
  }

  function start(){ raf = requestAnimationFrame(frame); }
  function stop(){ if (raf) cancelAnimationFrame(raf); raf = null; }

  start();
  return {
    stop,
    replay: () => {
      stop();
      startTs = null;
      trailsByNum.clear();
      finishedOnce = false;
      lastRankByNum.clear();
      cam.x = geom.centerX;
      cam.y = geom.centerY;
      cam.zoom = 1.10;
      start();
    }
  };
}


function getHistoryKey(game, track, divisionIndex){
  const date = game?.date ? String(game.date).slice(0,10) : 'nodate';
  const code = game?.code || game?.gameCode || 'nogame';
  const trackSlug = track?.slug || track?.code || track?.name || 'notrack';
  return `trav:simwins:${code}:${date}:${trackSlug}:A${divisionIndex+1}`;
}

function readHistory(key){
  try{
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function writeHistory(key, arr){
  try{ localStorage.setItem(key, JSON.stringify(arr)); }catch{}
}
function initRaceSim({
  getDivision,
  getDivisions,
  getHeaderColumns,
  getTrack,
  getGame,
  setCurrentIndex,
  getStakeLevel,
  createCouponFromSim,
}){
  const btnOpenOne = document.getElementById('btn-simulate-division');
  const btnOpenAll = document.getElementById('btn-simulate-all');

  const overlay = document.getElementById('sim-overlay');
  const btnClose = document.getElementById('btn-sim-close');
  const btnRun = document.getElementById('btn-sim-run');
  const btnReplay = document.getElementById('btn-sim-replay');

const tabsEl = document.getElementById('sim-div-tabs');
const wrapOne = document.getElementById('sim-one-wrap');
const wrapAll = document.getElementById('sim-all-wrap');

const sideCamWrap = null;
const sideCamLabel = null;
const sideCanvas = null;
const winnerWrap = document.getElementById('sim-winner');
const winnerNumEl = document.getElementById('sim-winner-num');
const winnerNameEl = document.getElementById('sim-winner-name');

const stakeEl = document.getElementById('sim-stake');
const winEl = document.getElementById('sim-win');


  const titleEl = document.getElementById('sim-title');
  const subtitleEl = document.getElementById('sim-subtitle');

  const inputTemp = document.getElementById('sim-temp');
  const inputWind = document.getElementById('sim-wind');
  const inputSnow = document.getElementById('sim-snow');
  const inputSeed = document.getElementById('sim-seed');
  const inputIters = document.getElementById('sim-iters');

  const settingsWrap = document.getElementById('sim-settings');
  if (settingsWrap && settingsWrap.hidden) { settingsWrap.style.display = 'none'; }

  const btnSettingsToggle = document.getElementById('btn-sim-settings-toggle');

  const btnSimCoupon = document.getElementById('btn-sim-coupon');

  const top3El = document.getElementById('sim-top3');
  const pos51El = document.getElementById('sim-pos-5to1');
  const logEl = document.getElementById('sim-log');
  const canvas = document.getElementById('sim-canvas');
  const miniCanvas = document.getElementById('sim-mini-canvas');

  const histEl = document.getElementById('sim-history');
  const histMetaEl = document.getElementById('sim-history-meta');
  const btnClearHist = document.getElementById('btn-sim-clear-history');

  const allResultsEl = document.getElementById('sim-all-results');

  let currentAnim = null;
  let lastRun = null;
  let lastHorses = null;
  let seedNonce = 0;

  function getIters(){
    const raw = inputIters ? Number(String(inputIters.value).replace(',','.')) : 40;
    return clamp(Number.isFinite(raw) ? raw : 40, 10, 200);
  }

  function getSeedBase(){
    // OBS: Number('') === 0, så vi måste hantera tomt fält explicit.
    const rawStr = inputSeed ? String(inputSeed.value || '').trim() : '';
    const raw = rawStr ? Number(rawStr.replace(',','.')) : NaN;
    // Om användaren anger seed vill vi fortfarande kunna få variation mellan klick
    // (annars blir "Sim Kupong" identisk varje gång). Därför blandar vi in en nonce.
    if (Number.isFinite(raw)){
      seedNonce = (seedNonce + 1) >>> 0;
      return (Math.floor(raw) + Math.imul(seedNonce, 2654435761)) >>> 0;
    }
    // Auto-seed: använd crypto om möjligt + nonce så flera klick samma millisekund ändå blir olika.
    let r = 0;
    try{
      const u = new Uint32Array(1);
      (window.crypto || globalThis.crypto)?.getRandomValues?.(u);
      r = u[0] >>> 0;
    }catch{}
    seedNonce = (seedNonce + 1) >>> 0;
    return ((Date.now() >>> 0) ^ r ^ Math.imul(seedNonce, 2654435761)) >>> 0;
  }

  function getEffectiveRadPris(){
    const game = getGame?.() || {};
    const up = String(game?.gameType || '').toUpperCase();
    if (up !== 'V85') return 1.0;
    const lvl = (getStakeLevel?.() || 'original');
    switch (lvl){
      case '30': return 0.15;
      case '50': return 0.25;
      case '70': return 0.35;
      case 'original':
      default: return 0.5;
    }
  }

  function envFromInputs(){
    return {
      tempC: inputTemp ? Number(String(inputTemp.value).replace(',','.')) : null,
      wind: inputWind ? Number(String(inputWind.value).replace(',','.')) : null,
      snowCm: inputSnow ? Number(String(inputSnow.value).replace(',','.')) : null
    };
  }

let uiMode = 'one'; // 'one' | 'all'

function setTab(which){
  uiMode = (which === 'all') ? 'all' : 'one';
  const one = uiMode === 'one';
  if (wrapOne) wrapOne.hidden = !one;
  if (wrapAll) wrapAll.hidden = one;

  // active class on tabs
  if (tabsEl){
    const divisions = getDivisions?.() || [];
    const div = getDivision?.();
    const currentIndex = Math.max(0, divisions.indexOf(div));
    for (const b of tabsEl.querySelectorAll('.sim-div-tab')){
      const mode = b.dataset.mode || 'one';
      const idxStr = b.dataset.index;
      const idx = (idxStr != null) ? Number(idxStr) : null;
      const active = (uiMode === 'all' && mode === 'all') || (uiMode === 'one' && mode === 'one' && idx === currentIndex);
      b.classList.toggle('active', !!active);
    }
  }
}

function resizeCanvas(){
  if (canvas){
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(520, Math.floor(rect.width));
    canvas.height = Math.max(360, Math.floor(rect.height));
  }
  if (miniCanvas){
    const r3 = miniCanvas.getBoundingClientRect();
    miniCanvas.width = Math.max(220, Math.floor(r3.width));
    miniCanvas.height = Math.max(150, Math.floor(r3.height));
  }
  if (sideCanvas){
    const r2 = sideCanvas.getBoundingClientRect();
    sideCanvas.width = Math.max(320, Math.floor(r2.width));
    sideCanvas.height = Math.max(120, Math.floor(r2.height));
  }
}

  function renderHistoryForDiv(divIndex){
    if (!histEl || !histMetaEl) return;
    const game = getGame?.() || {};
    const track = getTrack?.() || {};
    const key = getHistoryKey(game, track, divIndex);

    const arr = readHistory(key);
    histEl.innerHTML = '';

    const last = arr.slice(-24);
    for (const it of last){
      const chip = document.createElement('div');
      chip.className = 'sim-win-chip';
      chip.textContent = `#${it.winner}`;
      histEl.appendChild(chip);
    }
    histMetaEl.textContent = arr.length
      ? `Totalt körda: ${arr.length} • Senast: #${arr[arr.length-1].winner}`
      : `Ingen logg ännu. Kör simulering så sparas vinnaren.`;

    // Optional chaining kan inte användas på vänster sida i en assignment.
    // ("btnClearHist?.onclick = ..." ger SyntaxError.)
    if (btnClearHist){
      btnClearHist.onclick = () => {
        writeHistory(key, []);
        renderHistoryForDiv(divIndex);
      };
    }
  }


function buildTabs(){
  if (!tabsEl) return;
  const divisions = getDivisions?.() || [];
  tabsEl.innerHTML = '';

  const mk = (label, mode, index=null) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sim-div-tab';
    b.textContent = label;
    b.dataset.mode = mode;
    if (index != null) b.dataset.index = String(index);
    b.addEventListener('click', () => {
      // Byt vy utan att auto-starta simuleringen
      if (mode === 'all'){
        setTab('all');
        if (logEl) logEl.textContent = 'Tryck "Kör" för att simulera alla avdelningar.';
        if (allResultsEl) allResultsEl.innerHTML = '<div style="opacity:.75;">Tryck "Kör" för att simulera alla avdelningar.</div>';
      } else {
        setCurrentIndex?.(index);
        setTab('one');
        renderHistoryForDiv(index);
        if (logEl) logEl.textContent = 'Tryck "Kör" för att starta.';
      }
      // reset overlays
            if (winnerWrap){ winnerWrap.hidden = true; winnerWrap.style.display = 'none'; }
      if (btnReplay) btnReplay.disabled = true;
      lastRun = null;
      lastHorses = null;
      if (currentAnim) currentAnim.stop();
      currentAnim = null;
      resizeCanvas();
      setTab(uiMode);
    });
    return b;
  };

  // "Alla" först
  tabsEl.appendChild(mk('Alla', 'all', null));
  // Avdelningar
  divisions.forEach((_, i) => {
    tabsEl.appendChild(mk('Avd ' + (i+1), 'one', i));
  });

  // sätt aktiv efter nuvarande val
  setTab(uiMode);
}

  function open(which){
    if (!overlay) return;
    overlay.hidden = false;
    // robust: även om CSS saknar [hidden]-regel
    const isEmbed = overlay.classList.contains('sim-embed');
    overlay.style.display = isEmbed ? 'block' : 'flex';

    const track = getTrack?.() || null;
    const game = getGame?.() || null;
    const dateStr = game?.date ? String(game.date).slice(0,10) : '';
    const trackName = track?.name ? String(track.name) : (game?.track || '');

    titleEl.textContent = 'Simulering';
    subtitleEl.textContent = `${trackName ? trackName : ''}${dateStr ? ' • '+dateStr : ''}`;

    buildTabs();

    // reset overlays
        if (winnerWrap){ winnerWrap.hidden = true; winnerWrap.style.display = 'none'; }

    resizeCanvas();
    setTab(which || 'one');

    // Extra: säkerställ korrekt layout första gången (embeddat läge kan ha 0px höjd tills layouten satt sig)
    try{ requestAnimationFrame(()=>resizeCanvas()); }catch{}
    setTimeout(()=>{ try{ resizeCanvas(); }catch{} }, 60);

    // 🔸 Viktigt: starta INTE simuleringen automatiskt.
    // Den ska starta först när användaren trycker "Kör simulering".
    if (top3El) top3El.innerHTML = '';
    if (logEl) logEl.textContent = 'Tryck "Kör simulering" för att starta.';
    if (allResultsEl) allResultsEl.innerHTML = '<div style="opacity:.75">Tryck "Kör simulering" för att simulera alla avdelningar.</div>';
    if (btnReplay) btnReplay.disabled = true;
    lastRun = null;
    lastHorses = null;
    if (currentAnim) currentAnim.stop();
    currentAnim = null;
  }

  function close(){
    if (!overlay) return;
    overlay.hidden = true;
    // robust: säkerställ att rutan verkligen försvinner
    overlay.style.display = 'none';
    if (currentAnim) currentAnim.stop();
    currentAnim = null;
  }

  function runCurrentDivision(){
    const divisions = getDivisions?.() || [];
    const division = getDivision?.();
    const divIndex = divisions.indexOf(division);
    const headerColumns = getHeaderColumns?.() || [];
    const track = getTrack?.() || {};
    if (!division?.horses?.length) return;

    const env = envFromInputs();
    const { horses, baseDistance } = buildSimHorses(division, headerColumns);
    const startType = classifyStartType(horses, baseDistance);

    const seedBase = getSeedBase();
    const seed = seedBase + (divIndex >= 0 ? divIndex*101 : 0);

    // probabilistik
    const itersMc = clamp(getIters()*3, 60, 220);
    const { ranked } = monteCarloWinners({ horses, distance: baseDistance, startType, env, iterations: itersMc, seedBase: seed + 999 });

    renderTop3(top3El, ranked);

    // scenario-text
    renderScenario(logEl, env, { startType, distance: baseDistance }, ranked[0]);

    // en körning för playback
    lastRun = simulateRace({ horses, distance: baseDistance, startType, env, seed, withTimeline: true });
    lastHorses = horses;

    // logga vinnare
    const winner = lastRun.finish?.[0]?.num;
    if (winner != null && divIndex >= 0){
      const game = getGame?.() || {};
      const key = getHistoryKey(game, track, divIndex);
      const arr = readHistory(key);
      arr.push({ ts: Date.now(), winner });
      writeHistory(key, arr);
      renderHistoryForDiv(divIndex);
    } else {
      renderHistoryForDiv(Math.max(0, divIndex));
    }

if (winnerWrap){ winnerWrap.hidden = true; winnerWrap.style.display = 'none'; }

if (currentAnim) currentAnim.stop();
currentAnim = animateRace({
  canvas,
  sideCanvas,
  miniCanvas,
  horses,
  track,
  sampleRun: lastRun,
  renderHud: false,
  sideCamMeters: 300,
  onProgress: ({ leaderRemain, ranks }) => {
    // Ingen upplopp-popup längre. Vi zoomar i TV-vyn inne i drawWorld().
    // Uppdatera lista 5→1 längst ner i mitten.
    if (pos51El && Array.isArray(ranks) && ranks.length){
      const top5 = ranks.slice(0, Math.min(5, ranks.length));
      const items = top5.slice().reverse(); // 5..1
      pos51El.innerHTML = items.map(r => {
        const n = r.num;
        const nm = (r.horse || r.name || '').toString();
        return `<span class="sim-pos-chip"><span class="n">#${n}</span><span class="name">${nm}</span></span>`;
      }).join('');
    }
    // Liten text i loggen vid upplopp
    if (logEl && Number.isFinite(leaderRemain) && leaderRemain <= 300 && leaderRemain >= -5){
      logEl.textContent = `Upplopp! ${Math.max(0, Math.round(leaderRemain))}m kvar`;
    }
  },
  onFinish: ({ winnerNum, winnerHorse }) => {
    if (winnerNumEl) winnerNumEl.textContent = winnerNum != null ? ('#' + winnerNum) : '#';
    if (winnerNameEl) winnerNameEl.textContent = winnerHorse?.name || winnerHorse?.horse || '—';
    if (winnerWrap){
      winnerWrap.hidden = false;
      winnerWrap.style.display = '';
    }
  }
});

    if (btnReplay) btnReplay.disabled = false;
  }

  function runAllDivisions(){
    const divisions = getDivisions?.() || [];
    const headerColumns = getHeaderColumns?.() || [];
    const env = envFromInputs();
    const track = getTrack?.() || {};
    const game = getGame?.() || {};

    if (!allResultsEl) return;
    allResultsEl.innerHTML = '';

    const baseSeed = getSeedBase();
    // "Alla avd" använder användarens inställning (snabbt men justerbart)
    const iters = clamp(getIters(), 10, 120);

    // kör varje avdelning och visa kompakt topp-vinnare + sannolikhet
    divisions.forEach((div, i) => {
      if (!div?.horses?.length) return;

      const { horses, baseDistance } = buildSimHorses(div, headerColumns);
      const startType = classifyStartType(horses, baseDistance);

      const seed = baseSeed + i*101;
      const { ranked, iters: used } = monteCarloWinners({ horses, distance: baseDistance, startType, env, iterations: iters, seedBase: seed });

      const top = ranked[0];
      const card = document.createElement('div');
      card.className = 'sim-all-card';

      const top3txt = ranked.slice(0,3).map(x => `#${x.num} ${Math.round(x.winP*100)}%`).join(' • ');

      card.innerHTML = `
        <div class="sim-all-left">
          <div class="sim-all-title">Avdelning ${i+1}</div>
          <div class="sim-all-sub">${startType === 'auto' ? 'Autostart' : 'Voltstart'} • ${baseDistance}m • ${used} körningar • Top3: ${top3txt}</div>
        </div>
        <div class="sim-all-right">
          <div class="sim-all-win">${top ? (`Vinnare: #${top.num} • ${Math.round(top.winP*100)}%`) : '—'}</div>
          <button class="btn small" type="button" data-play="${i}">Spela upp</button>
        </div>
      `;

      const btn = card.querySelector('button[data-play]');
      btn?.addEventListener('click', () => {
        setCurrentIndex?.(i);
        setTab('one');
        // spela upp denna avdelning i samma modal
        runCurrentDivision();
      });

      allResultsEl.appendChild(card);
    });
  }

  async function buildAndCreateSimCoupon(){
    if (!createCouponFromSim) {
      alert('Sim Kupong: saknar callback för att skapa kupong.');
      return;
    }

    const divisions = getDivisions?.() || [];
    const headerColumns = getHeaderColumns?.() || [];
    const env = envFromInputs();

    // Sim Kupong ska alltid köra 30 ggr per avdelning (som du bad), oavsett UI-fältet.
    const iters = 30;
    const baseSeed = getSeedBase();

    // RNG för att kunna bryta "tie" när flera val är nästan lika bra
    const selectRng = mulberry32((baseSeed ^ 0xA5A5A5A5) >>> 0);

    const radPris = getEffectiveRadPris();
    // Standard: 350 kr (kan ändras i inställningarna)
    const targetInput = document.getElementById('sim-target-price');
    const targetTotal = clamp(Number(String(targetInput?.value ?? '').trim() || 350), 1, 200000);
    const targetRows = Math.max(1, Math.floor(targetTotal / Math.max(0.000001, radPris)));

    // 1) Kör Monte Carlo per avdelning och bygg ranking
    const perDiv = [];
    for (let i=0;i<divisions.length;i++){
      const div = divisions[i];
      if (!div?.horses?.length) continue;
      const { horses, baseDistance } = buildSimHorses(div, headerColumns);
      const startType = classifyStartType(horses, baseDistance);
      const seed = baseSeed + i*101;
      const { ranked } = monteCarloWinners({ horses, distance: baseDistance, startType, env, iterations: iters, seedBase: seed });

      const divIndex = div.index ?? (i+1);
      perDiv.push({ i, divIndex, ranked });

      // liten yield så UI inte "fryser" på svagare datorer
      if (i % 2 === 1) await new Promise(r => setTimeout(r, 0));
    }

    if (!perDiv.length) {
      alert('Sim Kupong: inga avdelningar att simulera.');
      return;
    }

    // 2) Starta med topp-1 i varje avdelning
    const picks = perDiv.map(d => {
      const top = d.ranked?.[0];
      return {
        divIndex: d.divIndex,
        k: 1,
        cov: clamp(top?.winP ?? 0.001, 0.001, 0.999),
      };
    });

    let rows = picks.reduce((p, x) => p * x.k, 1);

    // 3) Greedy: lägg till 2:a/3:e/... i den avdelning som ger bäst "träff per prisökning"
    //    (vi använder log-gain på täckning / log-cost på rader)
    const maxPerDiv = 6;
    while (true){
      const cands = [];

      for (let di=0; di<perDiv.length; di++){
        const d = perDiv[di];
        const p = picks[di];
        const ranked = d.ranked || [];
        if (p.k >= Math.min(maxPerDiv, ranked.length)) continue;

        const newRows = rows * (p.k + 1) / p.k;
        if (newRows > targetRows) continue;

        const next = ranked[p.k]; // (k=1 => index 1 är "2:a hästen")
        const addP = clamp(next?.winP ?? 0, 0, 1);
        if (addP <= 0) continue;

        const newCov = clamp(p.cov + addP, 0.001, 0.999);
        const gain = Math.log(newCov) - Math.log(p.cov);
        const cost = Math.log((p.k + 1) / p.k);
        const score = gain / Math.max(0.000001, cost);

        cands.push({ di, score, newRows, newCov });
      }

      if (!cands.length) break;
      cands.sort((a,b) => b.score - a.score);

      const bestScore = cands[0].score;
      // Om flera kandidater är nästan lika bra (inom 5%) – välj slumpmässigt bland dem.
      const close = cands.filter(c => c.score >= bestScore * 0.95);
      const chosen = close[Math.floor(selectRng() * close.length)];

      const p = picks[chosen.di];
      p.k += 1;
      p.cov = chosen.newCov;
      rows = chosen.newRows;
    }

    // 4) Bygg selections
    const selections = perDiv.map((d, di) => {
      const k = picks[di].k;
      const horses = (d.ranked || []).slice(0, k).map(x => x.num).filter(n => Number.isFinite(n));
      horses.sort((a,b) => a-b);
      return { divisionIndex: d.divIndex, horses };
    });

    const total = rows * radPris;
    const name = `Sim Kupong (${total.toFixed(2).replace('.', ',')} kr)`;

    const payload = {
      name,
      selections,
      source: 'sim',
    };

    // V85: behåll aktuell insatsnivå på kupongen så priset matchar.
    const game = getGame?.() || {};
    if (String(game?.gameType || '').toUpperCase() === 'V85'){
      payload.stakeLevel = (getStakeLevel?.() || 'original');
    }

    await createCouponFromSim(payload);

    // UI-kvitto
    if (logEl){
      const counts = selections.map(s => (s.horses?.length || 0) || 1).join('x');
      logEl.textContent = `Skapade Sim Kupong\n${counts} = ${Math.round(rows)} rader • Radpris: ${radPris.toFixed(2).replace('.', ',')} kr\nTotal: ${total.toFixed(2).replace('.', ',')} kr (≤ ${targetTotal.toFixed(0)} kr)`;
    }
  }

  // binds
  btnOpenOne?.addEventListener('click', () => open('one'));
  btnOpenAll?.addEventListener('click', () => open('all'));

  btnClose?.addEventListener('click', close, true);
  btnRun?.addEventListener('click', () => {
    if (wrapAll && !wrapAll.hidden) runAllDivisions();
    else runCurrentDivision();
  });
  btnReplay?.addEventListener('click', () => currentAnim?.replay?.());

  // klick utanför stänger
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  // ESC stänger
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) close();
  });

  // resize vid fönsterändring
  window.addEventListener('resize', () => {
    if (!overlay || overlay.hidden) return;
    resizeCanvas();
    // 🔸 Rerunna inte simulering vid resize. Om vi har en senaste körning, rendera om den.
    if (wrapAll && !wrapAll.hidden) return;
    if (!lastRun || !lastHorses) return;
    const track = getTrack?.() || {};
    if (currentAnim) currentAnim.stop();
currentAnim = animateRace({
  canvas,
  sideCanvas,
  horses: lastHorses,
  track,
  sampleRun: lastRun,
  renderHud: false,
  sideCamMeters: 300,
  onProgress: ({ leaderRemain }) => {
    const show = Number.isFinite(leaderRemain) && leaderRemain <= 300 && leaderRemain >= -20;
    if (sideCamWrap){
      sideCamWrap.hidden = !show;
      sideCamWrap.style.display = show ? '' : 'none';
    }
    if (sideCamLabel && show){
      sideCamLabel.textContent = `Upplopp • ${Math.max(0, Math.round(leaderRemain))}m kvar`;
    }
  },
  onFinish: ({ winnerNum, winnerHorse }) => {
    if (winnerNumEl) winnerNumEl.textContent = winnerNum != null ? ('#' + winnerNum) : '#';
    if (winnerNameEl) winnerNameEl.textContent = winnerHorse?.name || winnerHorse?.horse || '—';
    if (winnerWrap){
      winnerWrap.hidden = false;
      winnerWrap.style.display = '';
    }
  }
});

  });

  // settings-toggle
btnSettingsToggle?.addEventListener('click', () => {
  if (!settingsWrap) return;

  const nextHidden = !settingsWrap.hidden;
  settingsWrap.hidden = nextHidden;
  settingsWrap.style.display = nextHidden ? 'none' : '';

  if (btnSettingsToggle){
    btnSettingsToggle.setAttribute('aria-pressed', String(!nextHidden));
  }
});

  // Sim Kupong
  btnSimCoupon?.addEventListener('click', async () => {
    const btn = btnSimCoupon;
    if (!btn) return;
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Skapar…';
    try{
      await buildAndCreateSimCoupon();
    }catch(err){
      console.error(err);
      alert(err?.message || 'Kunde inte skapa Sim Kupong.');
    }finally{
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  return { open, close };
}

// Expose for non-module usage (overview.js loader expects window.initRaceSim)
try{ if (typeof window !== 'undefined') window.initRaceSim = initRaceSim; }catch(e){}
