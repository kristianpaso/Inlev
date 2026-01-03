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

function laneBias(lane){
  // Du gav: bäst 1,6,7. Sämre 4,5. 12 sämst.
  if (!lane) return 0;
  if (lane === 12) return -0.30;
  if (lane === 1) return 0.14;
  if (lane === 6 || lane === 7) return 0.10;
  if (lane === 4 || lane === 5) return -0.10;
  return 0;
}

function getTrackGeometry(track, canvas){
  const totalLen = parseTrackMeters(track?.length) || 1000;
  const widthM = parseTrackMeters(track?.width) || 23;

  const cw = canvas.width, ch = canvas.height;
  const pad = 70;

  // En oval: två rakor + två kurvor.
  // Vi väljer en rimlig raklängd utifrån totalLen och canvas-bredd
  const ovalW = cw - pad*2;
  const ovalH = Math.min(ch*0.68, ovalW*0.46);

  // approx: 30% av varvet raka, 70% kurvor
  const straight = clamp(totalLen * 0.30, 180, 420);
  const Rm = Math.max(50, (totalLen - 2*straight) / (2*Math.PI));
  const turnLen = Math.PI * Rm;

  const pxPerM = ovalW / (straight + 2*Rm);
  const centerX = cw/2;
  const centerY = ch/2 + 6;

  const lanePx = (widthM * pxPerM) / 10.0; // ~10 "synliga" spår
  return { totalLen, straight, Rm, turnLen, widthM, pxPerM, centerX, centerY, ovalW, ovalH, lanePx, pad };
}

// meters -> xy på en stabil oval som alltid går vänster varv.
// (Vänster varv = svänger vänster i kurvorna.)
// Vi använder en kontinuerlig oval-parametrisering för att slippa "hoppa" och att någon häst ser ut att gå baklänges.
function mapMetersToXY(rawMeters, laneFloat, geom){
  const { totalLen, centerX, centerY, ovalW, ovalH, lanePx } = geom;

  // wrap runt ovalen (rawMeters kan vara negativ i starten pga tillägg/andra raden)
  const s = ((rawMeters % totalLen) + totalLen) % totalLen;

  // laneFloat ~ 1..5 (1 inner, högre = längre ut)
  const lf = clamp(laneFloat ?? 1, 1, 6);
  const laneOffset = (lf - 1) * lanePx * 0.90;

  // Bas-oval (snarlik ATG-diagram).
  const a = (ovalW * 0.42) + laneOffset;
  const b = (ovalH * 0.50) + laneOffset * 0.90;

  // Välj start så att "upploppet" känns vänster→höger (som i din bild)
  // och låt s öka i vänster varv.
  // I skärmkoordinater (y ner) blir vänster varv enklast med minus på theta.
  const startTheta = Math.PI - 0.45;
  const theta = startTheta - (s / totalLen) * (Math.PI * 2);

  let x = centerX + a * Math.cos(theta);
  let y = centerY + b * Math.sin(theta);

  // Liten rotation för att se mer ut som ATG-bilder
  const rot = (-14 * Math.PI) / 180;
  const dx = x - centerX;
  const dy = y - centerY;
  x = centerX + dx * Math.cos(rot) - dy * Math.sin(rot);
  y = centerY + dx * Math.sin(rot) + dy * Math.cos(rot);

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

      const remain = distance - s.covered;
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

  function maybeError(h){
    const rel = h._sim.reliability ?? 0.8;
    const baseRisk = 0.045 + (1-rel)*0.18 + weatherNoise*0.10;
    return rng() < clamp(baseRisk, 0.03, 0.22);
  }

  // sim-loop
  while (t < maxT){
    // bryt om alla i mål / ute
    if (state.every(s => s.err || s.finishedAt != null)) break;

    const sorted = getSorted();
    const leader = sorted[0];

    // phases
    const meanCovered = leader ? leader.covered : 0;

    // tidig: stabilisera till två-wide efter ~12s
    if (t > 12 && t < 160) settleTwoWide();
    // upplopp: bredare spår
    lateMoves();

    for (const s of state){
      if (s.err || s.finishedAt != null) continue;
      const h = horses.find(x => x.number === s.num);
      if (!h) continue;

      // galopp/strul: oftare i start + vid tempoökning
      if ((t < 20 || distance - s.covered < 420) && maybeError(h) && rng() < 0.12){
        s.err = true;
        continue;
      }

      const str = h._sim.strength;
      const stam = h._sim.stamina;
      const spr = h._sim.sprint;
      const gate = h._sim.gate;

      const remain = distance - s.covered;

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

      if (s.covered >= distance){
        s.finishedAt = t;
      }
    }

    if (withTimeline){
      // spara var 2:a tick för mindre data men mjukt nog
      if (Math.round(t / dt) % 2 === 0){
        const snap = {};
        const lanes = {};
        for (const s of state){
          snap[s.num] = s.covered;
          lanes[s.num] = s.lane;
        }
        timeline.push({ t, metersByNum: snap, laneByNum: lanes });
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
Modell: två-wide pack + drafting + ytterspårs-meter + upploppsspår 3–5.
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

  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, ovalW*0.42, ovalH*0.50, 0, 0, Math.PI*2);
  ctx.stroke();

  // inner line
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, ovalW*0.39, ovalH*0.47, 0, 0, Math.PI*2);
  ctx.stroke();

  // markera mål / start på upploppsrakan (vänster del)
  const startP = mapMetersToXY(0, 1, geom);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(startP.x, startP.y - 40);
  ctx.lineTo(startP.x, startP.y + 40);
  ctx.stroke();
}

function animateRace({ canvas, horses, track, sampleRun }){
  const ctx = canvas.getContext('2d', { alpha:true });
  let raf = null;
  let startTs = null;

  const geom = getTrackGeometry(track||{}, canvas);
  const timeline = sampleRun?.timeline || [];
  const durationMs = 22000; // långsammare

  function getFrameIndex(progress01){
    if (!timeline.length) return { i:0, frac:0 };
    const idxF = progress01 * (timeline.length - 1);
    const i = Math.floor(idxF);
    return { i, frac: idxF - i };
  }

  function lerp(a,b,t){ return a + (b-a)*t; }

  function getInterpolated(progress01){
    if (!timeline.length) return { meters:{}, lanes:{} };
    const { i, frac } = getFrameIndex(progress01);
    const A = timeline[i];
    const B = timeline[Math.min(i+1, timeline.length-1)];
    const meters = {};
    const lanes = {};
    for (const h of horses){
      const n = h.number;
      const a = A.metersByNum?.[n] ?? 0;
      const b = B.metersByNum?.[n] ?? a;
      const la = A.laneByNum?.[n] ?? 1;
      const lb = B.laneByNum?.[n] ?? la;
      meters[n] = lerp(a,b,frac);
      lanes[n] = lerp(la,lb,frac);
    }
    return { meters, lanes };
  }

  function drawHorses(metersByNum, lanesByNum){
    for (const h of horses){
      const m = metersByNum?.[h.number] ?? 0;
      const lane = lanesByNum?.[h.number] ?? 1;
      const p = mapMetersToXY(m, lane, geom);

      ctx.fillStyle = seededColor(h.number);
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, -apple-system, Segoe UI, Roboto';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h.number), p.x, p.y);
    }
  }

  function eased(u){
    // längre tid på upploppet (sista 20%)
    if (u <= 0.80) return (u/0.80) * 0.70;
    return 0.70 + ((u-0.80)/0.20) * 0.30;
  }

  function frame(ts){
    if (!startTs) startTs = ts;
    const t = ts - startTs;
    const u = clamp(t / durationMs, 0, 1);
    const p = eased(u);

    drawTrack(ctx, geom);

    const { meters, lanes } = getInterpolated(p);
    drawHorses(meters, lanes);

    if (u < 1){
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
    }
  }

  function start(){ raf = requestAnimationFrame(frame); }
  function stop(){ if (raf) cancelAnimationFrame(raf); raf = null; }

  start();
  return { stop, replay: () => { stop(); startTs = null; start(); } };
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

export function initRaceSim({
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

  const tabOneBtn = document.getElementById('btn-sim-tab-one');
  const tabAllBtn = document.getElementById('btn-sim-tab-all');
  const wrapOne = document.getElementById('sim-one-wrap');
  const wrapAll = document.getElementById('sim-all-wrap');

  const titleEl = document.getElementById('sim-title');
  const subtitleEl = document.getElementById('sim-subtitle');

  const inputTemp = document.getElementById('sim-temp');
  const inputWind = document.getElementById('sim-wind');
  const inputSnow = document.getElementById('sim-snow');
  const inputSeed = document.getElementById('sim-seed');
  const inputIters = document.getElementById('sim-iters');

  const settingsWrap = document.getElementById('sim-settings');
  const btnSettingsToggle = document.getElementById('btn-sim-settings-toggle');

  const btnSimCoupon = document.getElementById('btn-sim-coupon');

  const top3El = document.getElementById('sim-top3');
  const logEl = document.getElementById('sim-log');
  const canvas = document.getElementById('sim-canvas');

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

  function setTab(which){
    if (!wrapOne || !wrapAll) return;
    const one = which === 'one';
    wrapOne.hidden = !one;
    wrapAll.hidden = one;
    tabOneBtn?.classList.toggle('active', one);
    tabAllBtn?.classList.toggle('active', !one);
  }

  function resizeCanvas(){
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(520, Math.floor(rect.width));
    canvas.height = Math.max(360, Math.floor(rect.height));
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

  function open(which){
    if (!overlay) return;
    overlay.hidden = false;
    // robust: även om CSS saknar [hidden]-regel
    overlay.style.display = 'flex';

    const track = getTrack?.() || null;
    const game = getGame?.() || null;
    const dateStr = game?.date ? String(game.date).slice(0,10) : '';
    const trackName = track?.name ? String(track.name) : (game?.track || '');

    titleEl.textContent = 'Simulering';
    subtitleEl.textContent = `${trackName ? trackName : ''}${dateStr ? ' • '+dateStr : ''}`;

    resizeCanvas();
    setTab(which || 'one');

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

    if (currentAnim) currentAnim.stop();
    currentAnim = animateRace({ canvas, horses, track, sampleRun: lastRun });
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

  // tabs
  tabOneBtn?.addEventListener('click', () => setTab('one'));
  tabAllBtn?.addEventListener('click', () => {
    setTab('all');
    if (allResultsEl && !allResultsEl.innerHTML.trim()){
      allResultsEl.innerHTML = '<div style="opacity:.75">Tryck "Kör simulering" för att simulera alla avdelningar.</div>';
    }
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
    currentAnim = animateRace({ canvas, horses: lastHorses, track, sampleRun: lastRun });
  });

  // settings-toggle
  btnSettingsToggle?.addEventListener('click', () => {
    if (!settingsWrap) return;
    settingsWrap.hidden = !settingsWrap.hidden;
    if (btnSettingsToggle){
      btnSettingsToggle.textContent = settingsWrap.hidden ? 'Visa inställningar' : 'Dölj inställningar';
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
