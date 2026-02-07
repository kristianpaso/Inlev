/* Mythic Explorer – Word Spells (seeded words + items + centered fight)
   - Level 1: 1 word (main attack)
   - Level 2: 2 words (main + DoT)
   - Level 4: 3 words (main + DoT + Buff)
   - Same word differs per player via seed hashing.
   - Can 'chansa' by typing unknown words; fills discovery meter.
*/
(() => {
  const $ = (s) => document.querySelector(s);

  // UI refs
  const ui = {
    level: $("#ui-level"),
    xp: $("#ui-xp"),
    xpmax: $("#ui-xpmax"),
    time: $("#ui-time"),

    // Left-panel base stats
    baseLife: $("#ui-base-life"),
    baseMana: $("#ui-base-mana"),
    baseEnergy: $("#ui-base-energy"),
    baseRegen: $("#ui-base-regen"),
    baseShield: $("#ui-base-shield"),
    hpHud: $("#ui-hp-hud"),
    hpmaxHud: $("#ui-hpmax-hud"),
    manaHud: $("#ui-mana-hud"),
    manamaxHud: $("#ui-manamax-hud"),
    hpbarHud: $("#ui-hpbar-hud"),
    manabarHud: $("#ui-manabar-hud"),
    bestTrainingSide: $("#best-training-side"),
    bestArenaSide: $("#best-arena-side"),
    bestAdventureSide: $("#best-adventure-side"),
    btnSideTraining: $("#btn-side-training"),
    btnSideArena: $("#btn-side-arena"),
    btnSideAdventure: $("#btn-side-adventure"),

    atk: $("#ui-atk"),
    def: $("#ui-def"),
    crit: $("#ui-crit"),
    loot: $("#ui-loot"),

    hpcenter: $("#ui-hpcenter"),
    hpmaxcenter: $("#ui-hpmaxcenter"),
    hpbarcenter: $("#ui-hpbarcenter"),

    enemyName: $("#ui-enemy-name"),
    enemyResist: $("#ui-enemy-resist"),
    ehp: $("#ui-ehp"),
    ehpmax: $("#ui-ehpmax"),
    ehpbar: $("#ui-ehpbar"),

    input: $("#ui-input"),
    attack: $("#btn-attack"),
    battletext: $("#ui-battletext"),

    enemySprite: $("#enemySprite"),
    playerSprite: $("#playerSprite"),

    floatP: $("#float-player"),
    floatE: $("#float-enemy"),

    words: $("#ui-words"),
    equiplist: $("#ui-equiplist"),
    rewards: $("#ui-rewards"),
  panelRewards: $("#panelRewards"),
    discover: $("#ui-discover"),
    discoverGlow: $("#ui-discover-glow"),

    btnNew: $("#btn-new"),
    btnSave: $("#btn-save"),
    btnLoad: $("#btn-load"),
    btnHelp: $("#btn-help"),
    btnInv: $("#btn-inventory"),
    btnInv2: $("#btn-inventory2"),
    btnSave2: $("#btn-save2"),
    leftEquip: $("#ui-left-equip"),
    leftInvCount: $("#ui-left-invcount"),
    btnEquip: $("#btn-equip"),

    modal: $("#modal"),
    modalTitle: $("#modal-title"),
    modalBody: $("#modal-body"),
    modalClose: $("#modal-close"),

    wordModal: $("#wordmodal"),
    wordModalClose: $("#wordmodal-close"),
    newWordName: $("#ui-newword-name"),
    newWordDesc: $("#ui-newword-desc"),
    replaceGrid: $("#ui-replacegrid"),
    btnSkipWord: $("#btn-skipword"),
  
    rightbox: $("#ui-rightbox"),
    journalScene: $("#ui-journal-scene"),
    journalNow: $("#ui-journal-now"),
    journalLog: $("#ui-journal-log"),
    combatLog: $("#ui-combatlog"),

    pvSave0: $("#btn-saveword-0"),
    pvSave1: $("#btn-saveword-1"),
    pvSave2: $("#btn-saveword-2"),
    bestTraining: $("#best-training"),
    bestArena: $("#best-arena"),
    bestAdventure: $("#best-adventure"),
    btnModeTraining: $("#btn-mode-training"),
    btnModeArena: $("#btn-mode-arena"),
    btnModeAdventure: $("#btn-mode-adventure"),
    btnModes: $("#btn-modes"),
    modeMeta: $("#ui-mode-meta"),
    modeScreen: $("#ui-mode-screen"),
    levelupScreen: $("#ui-levelup-screen"),
    levelupSub: $("#ui-levelup-sub"),
    levelupChoices: $("#ui-levelup-choices"),
  };

  
  // === Status/Intent UI helpers (injected to avoid HTML changes) ===
  const _statusUi = { inited:false, pRow:null, eRow:null, intentEl:null };

  function ensureStatusUi(){
    if(_statusUi.inited) return;
    _statusUi.inited = true;
    try{
      const pFrame = document.querySelector(".hpframe.player");
      const eFrame = document.querySelector(".hpframe.enemy");
      if(pFrame && !pFrame.querySelector("#ui-status-player")){
        const row = document.createElement("div");
        row.id = "ui-status-player";
        row.className = "status-row";
        pFrame.appendChild(row);
        _statusUi.pRow = row;
      } else {
        _statusUi.pRow = document.querySelector("#ui-status-player");
      }
      if(eFrame && !eFrame.querySelector("#ui-status-enemy")){
        const row = document.createElement("div");
        row.id = "ui-status-enemy";
        row.className = "status-row";
        eFrame.appendChild(row);
        _statusUi.eRow = row;
      } else {
        _statusUi.eRow = document.querySelector("#ui-status-enemy");
      }
      // Enemy intent badge near name
      if(eFrame){
        const nameEl = eFrame.querySelector(".enemy-name");
        if(nameEl && !nameEl.querySelector("#ui-enemy-intent")){
          const sp = document.createElement("span");
          sp.id = "ui-enemy-intent";
          sp.className = "enemy-intent";
          sp.style.marginLeft = "10px";
          sp.style.fontWeight = "800";
          sp.style.opacity = "0.9";
          nameEl.appendChild(sp);
          _statusUi.intentEl = sp;
        } else {
          _statusUi.intentEl = document.querySelector("#ui-enemy-intent");
        }
      }
    }catch(e){}
  }

  function setStatusRow(el, chips){
    if(!el) return;
    el.innerHTML = chips.map(c=>{
      const cls = "status-chip " + (c.type||"");
      return `<span class="${cls}">${escapeHtml(c.icon||"")} ${escapeHtml(c.text||"")}</span>`;
    }).join("");
  }

  function renderStatusUi(){
    ensureStatusUi();
    const p = state.player;
    const e = state.enemy;
    const pChips = [];
    const eChips = [];

    // Player buffs
    if(p.buff){
      const icon = ({shield:"🛡️", regen:"💚", rarity:"🍀", crit:"🎯", resist:"🧿", leech:"🩸"})[p.buff.kind] || "✨";
      pChips.push({ type:"buff", icon, text:`${p.buff.kind.toUpperCase()} ${p.buff.turns||0}t` });
    }
    if(p.shield>0){
      pChips.push({ type:"buff", icon:"🛡️", text:`SHIELD ${Math.round(p.shield)}` });
    }
    if(p.dot){
      pChips.push({ type:"debuff", icon:p.dot.icon||"☠️", text:`${p.dot.name||"Poison"} ${p.dot.perTurn}×${p.dot.turns}` });
    }

    // Enemy debuffs
    if(e.dot){
      eChips.push({ type:"debuff", icon:e.dot.icon||"☠️", text:`${e.dot.name} ${e.dot.perTurn}×${e.dot.turns}` });
    }
    if(e.guard>0){
      eChips.push({ type:"buff", icon:"🛡️", text:`GUARD` });
    }

    setStatusRow(_statusUi.pRow, pChips);
    setStatusRow(_statusUi.eRow, eChips);

    // Intent
    if(_statusUi.intentEl){
      if(e.intent){
        _statusUi.intentEl.textContent = `${e.intent.icon} ${e.intent.label}`;
      } else {
        _statusUi.intentEl.textContent = "";
      }
    }
  }
const STORAGE = "gameone_wordbattle_v1";

  // helpers
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const irnd = (a,b)=>Math.floor(a + Math.random()*(b-a+1));
  const rnd = (a,b)=>a + Math.random()*(b-a);

  function nowMs(){ return Date.now(); }
  function fmtTime(ms){
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60);
    const ss = String(s%60).padStart(2,"0");
    return `${m}:${ss}`;
  }

  // deterministic hash (FNV-1a 32-bit)
  function hash32(str){
    let h = 0x811c9dc5;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
    }
    return h >>> 0;
  }

  
  function showModeScreen(){
    const best = loadBests();
    if(ui.bestAdventure) ui.bestAdventure.textContent = best.adventure ?? "–";
    if(ui.bestAdventureSide) ui.bestAdventureSide.textContent = best.adventure ?? "–";
    if(ui.bestArena) ui.bestArena.textContent = best.arena ?? "–";
    if(ui.bestArenaSide) ui.bestArenaSide.textContent = best.arena ?? "–";
    if(ui.bestTraining) ui.bestTraining.textContent = best.training ?? "–";
    if(ui.bestTrainingSide) ui.bestTrainingSide.textContent = best.training ?? "–";
    if(ui.modeScreen){
      ui.modeScreen.classList.add("show");
      ui.modeScreen.setAttribute("aria-hidden","false");
    }
  }

  function hideModeScreen(){
    if(ui.modeScreen){
      ui.modeScreen.classList.remove("show");
      ui.modeScreen.setAttribute("aria-hidden","true");
    }
  }

  function setMode(mode){
    state.mode = mode;
    if(mode === MODES.ADVENTURE){
      state.modeRun = { roomsTotal: 10, room: 1, bossesEvery: 5, cleared: 0 };
      state.score = 0;
    } else if(mode === MODES.ARENA){
      state.modeRun = { wave: 1, streak: 0, fightsInWave: 0, bestStreak: 0 };
      state.score = 0;
    } else if(mode === MODES.TRAINING){
      state.modeRun = { startedAt: nowMs(), dmgTotal: 0, casts: 0, dpsBest: 0, windowMs: 30000 };
      state.score = 0;
    } else {
      state.modeRun = null;
      state.score = 0;
    }
  }

  function updateModeMeta(){
    if(!ui.modeMeta) return;
    const mode = state.mode || "";
    const label = MODE_LABEL[mode] || "–";
    let meta = "";
    if(mode === MODES.ADVENTURE && state.modeRun){
      meta = `Rum ${state.modeRun.room}/${state.modeRun.roomsTotal}`;
    } else if(mode === MODES.ARENA && state.modeRun){
      meta = `Våg ${state.modeRun.wave} • Streak ${state.modeRun.streak}`;
    } else if(mode === MODES.TRAINING && state.modeRun){
      const elapsed = Math.max(0, nowMs() - state.modeRun.startedAt);
      const left = Math.max(0, Math.ceil((state.modeRun.windowMs - elapsed)/1000));
      meta = `DPS-test: ${left}s`;
    }
    ui.modeMeta.textContent = `Mode: ${label}${meta?" • "+meta:""}`;
  }

  function startMode(mode){
    setMode(mode);
    state.pendingRewards = null;
    state.nextReady = false;
    state.lastReward = "";
    state.fightEnded = false;
    state.pendingWord = null;
    state.pendingLevelUp = null;
    state.deferredRewards = null;
    if(mode === MODES.TRAINING){
      state.enemy = makeTrainingDummy();
      rollEnemyIntent();
      journalNow(`Träning: skriv ord och se skada. DPS fönster 30 sek.`);
    } else {
      state.enemy = makeModeEnemy();
      rollEnemyIntent();
    }
    hideModeScreen();
    renderAll();
  }

  function finishModeRun(){
    const best = loadBests();
    const mode = state.mode;
    if(mode === MODES.ADVENTURE){
      const score = state.score || 0;
      best.adventure = Math.max(best.adventure || 0, score);
      journalNow(`Äventyr klart! Score: ${score}`);
    } else if(mode === MODES.ARENA){
      const score = state.score || 0;
      best.arena = Math.max(best.arena || 0, score);
      journalNow(`Arena slut! Score: ${score}`);
    } else if(mode === MODES.TRAINING){
      const score = Math.round((state.modeRun?.dpsBest || 0)*10)/10;
      best.training = Math.max(best.training || 0, score);
      journalNow(`Träning klar! Bästa DPS: ${score}`);
    }
    saveBests(best);
    showModeScreen();
  }

  function pick(arr, h){ return arr[h % arr.length]; }

  const ELEMENTS = ["Fire","Ice","Nature","Storm","Light","Mist"];
  const RESIST_ICON = { Fire:"🔥", Ice:"❄️", Nature:"🍃", Storm:"⚡", Light:"✨", Mist:"🌫️" };

  const DOTS = [
    { name:"Burn", icon:"🔥", kind:"burn" },
    { name:"Venom", icon:"🍃", kind:"poison" },
    { name:"Shock", icon:"⚡", kind:"shock" },
    { name:"Chill", icon:"❄️", kind:"chill" },
    { name:"Snare", icon:"🕸️", kind:"snare" },
  ];

  const BUFFS = [
    { name:"Shield", icon:"🛡️", kind:"shield" },
    { name:"Regen", icon:"💚", kind:"regen" },
    { name:"Rarity", icon:"🍀", kind:"rarity" },
    { name:"Crit Up", icon:"🎯", kind:"crit" },
    { name:"Resist", icon:"🧿", kind:"resist" },
      { name:"Leech", icon:"🩸", kind:"leech" },
  ];

  const START_WORDS = [
    "BOLL","ELD","IS","ORM","SKÖLD","LJUS","MÅNE","STORM","GLÖD","SKUGGA","KEDJA","VIND","FROST","GIFT","EKO"
  ];

  const ENEMIES = [
    { id:"mosskuggan",     name:"Mosskuggan",     hp:74, atk:[9,13],  def:3, resist:"Nature", img:"./assets/enemy-mosskuggan.png" },
    { id:"runvaktaren",    name:"Runväktaren",    hp:86, atk:[10,14], def:4, resist:"Light",  img:"./assets/enemy-runvaktaren.png" },
    { id:"stormspriten",   name:"Stormspriten",   hp:70, atk:[11,15], def:2, resist:"Storm",  img:"./assets/enemy-stormspriten.png" },
    { id:"glimmerhjorten", name:"Glimmerhjorten", hp:78, atk:[9,13],  def:3, resist:"Mist",   img:"./assets/enemy-glimmerhjorten.png" },
    { id:"stenriddaren",   name:"Stenriddaren",   hp:92, atk:[10,16], def:5, resist:"Fire",   img:"./assets/enemy-stenriddaren.png" },
  ];

  const MODES = {
    ADVENTURE: "adventure",
    ARENA: "arena",
    TRAINING: "training"
  };

  const MODE_LABEL = {
    [MODES.ADVENTURE]: "Äventyr",
    [MODES.ARENA]: "Arena",
    [MODES.TRAINING]: "Träningspass",
  };

  const BEST_KEY = "gameone_best_v1";
  function loadBests(){
    try{ return JSON.parse(localStorage.getItem(BEST_KEY) || "{}") || {}; }catch(e){ return {}; }
  }
  function saveBests(b){
    try{ localStorage.setItem(BEST_KEY, JSON.stringify(b||{})); }catch(e){}
  }


  const SCENES = [
    "Dimman ligger tät över stigen. Du hör prassel bland löven.",
    "En gammal runsten står lutad i gräset. Luften känns laddad.",
    "Du passerar en porlande bäck och ser glimtar av ljus mellan träden.",
    "Ruinerna vakar tyst. Något rör sig i skuggorna – men inget blod, bara magi.",
    "Ett vindspel klingar svagt. Din kompass snurrar ett ögonblick…",
    "Mossiga stenar och ljung. Spåren är färska – någon har gått här nyss.",
    "Ett svagt sken från en lykta fladdrar i fjärran. Du tar ett steg närmare."
  ];

  const ITEM_POOL = [
  // Weapon
  () => ({ type:"weapon", name:`Sunsteel Sword +${irnd(1,4)}`, icon:"🗡️", atk: irnd(4,9), elem: "Fire", crit: irnd(0,3) }),
  () => ({ type:"weapon", name:`Frostfang Dagger +${irnd(1,4)}`, icon:"🗡️", atk: irnd(3,8), elem: "Ice", crit: irnd(1,4) }),
  () => ({ type:"weapon", name:`Gale Axe +${irnd(1,4)}`, icon:"🪓", atk: irnd(5,10), elem: "Storm", crit: irnd(0,2) }),

  // Helmet
  () => ({ type:"helmet", name:`Traveler's Cap`, icon:"🪖", def: irnd(2,5), hp: irnd(0,8) }),
  () => ({ type:"helmet", name:`Mystic Hood`, icon:"🧙", def: irnd(1,3), mana: irnd(1,3), crit: irnd(0,2) }),

  // Chest
  () => ({ type:"chest", name:`Explorer's Vest`, icon:"🥋", def: irnd(3,6), hp: irnd(8,18) }),
  () => ({ type:"chest", name:`Runed Mail`, icon:"🛡️", def: irnd(4,8), hp: irnd(6,14), resist: pick(ELEMENTS, irnd(0,9999)) }),

  // Offhand
  () => ({ type:"offhand", name:`Iron Buckler`, icon:"🛡️", def: irnd(2,6), hp: irnd(0,10) }),
  () => ({ type:"offhand", name:`Ward Talisman`, icon:"🪬", mana: irnd(1,4), crit: irnd(0,2) }),

  // Hands
  () => ({ type:"hands", name:`Ranger Gloves`, icon:"🧤", atk: irnd(1,4), crit: irnd(0,2) }),
  () => ({ type:"hands", name:`Runewrap Mitts`, icon:"🧤", def: irnd(1,3), mana: irnd(0,2) }),

  // Boots
  () => ({ type:"boots", name:`Trail Boots`, icon:"👢", def: irnd(1,4), hp: irnd(0,6) }),
  () => ({ type:"boots", name:`Swift Greaves`, icon:"👢", def: irnd(2,5), crit: irnd(0,2) }),

  // Trinkets (two slots)
  () => ({ type:"trinket", name:`Lucky Charm`, icon:"✨", crit: irnd(1,3), loot: 0.02 }),
  () => ({ type:"trinket", name:`Ember Pendant`, icon:"🔥", atk: irnd(1,4), elem: "Fire" }),
  () => ({ type:"trinket", name:`Frost Locket`, icon:"❄️", def: irnd(1,4), elem: "Ice" }),

  // Backpack (utility)
  () => ({ type:"backpack", name:`Sturdy Backpack`, icon:"🎒", hp: irnd(4,10), mana: irnd(0,2), loot: 0.03 }),

  // Potion
  () => ({ type:"potion", name:`Healing Potion`, icon:"🧪", heal: irnd(20,50) }),
];


  function newSeed(){
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  }


  function makeTrainingDummy(){
    return {
      id: "training",
      name: "Träningsdocka",
      hp: 999, hpMax: 999,
      atk: [0,0], def: 0,
      resist: "–",
      img: "./assets/enemy-runvaktaren.png",
      dot: null, buffs: [],
      isTraining: true
    };
  }

  function makeModeEnemy(){
    const mode = state.mode;
    if(mode === MODES.TRAINING) return makeTrainingDummy();
    const base = makeEnemy();
    if(mode === MODES.ADVENTURE && state.modeRun){
      const room = state.modeRun.room || 1;
      const isBoss = (room % (state.modeRun.bossesEvery || 5) === 0);
      const scale = 1 + (room-1)*0.08;
      base.hpMax = Math.round(base.hpMax * (isBoss? 1.55 : 1.0) * scale);
      base.hp = base.hpMax;
      base.atk = [Math.round(base.atk[0]*(isBoss?1.3:1.0)*scale), Math.round(base.atk[1]*(isBoss?1.3:1.0)*scale)];
      base.name = isBoss ? `${base.name} (Boss)` : base.name;
      base.isBoss = isBoss;
    }
    if(mode === MODES.ARENA && state.modeRun){
      const wave = state.modeRun.wave || 1;
      const scale = 1 + (wave-1)*0.12;
      base.hpMax = Math.round(base.hpMax * scale);
      base.hp = base.hpMax;
      base.atk = [Math.round(base.atk[0]*scale), Math.round(base.atk[1]*scale)];
    }
    return base;
  }

  function makeEnemy(level = (state.player?.level || 1)){

    const base = { ...ENEMIES[irnd(0, ENEMIES.length-1)] };
    const scale = 1 + Math.min(0.9, (level-1)*0.12);
    const hp = Math.round(base.hp * scale);
    return {
      ...base,
      hpMax: hp,
      hp: hp,
      dot: null,
    };
  }

  // Word meaning depends on role index: 0 attack, 1 dot, 2 buff
  function wordProps(word, role, seed){
    const w = (word||"").trim().toUpperCase().slice(0,12);
    const h = hash32(`${seed}|${role}|${w}`);
    const element = pick(ELEMENTS, h);
    if(role === 0){
      const power = 10 + (h % 13); // 10..22
      return { role, word:w, element, power, icon: RESIST_ICON[element] || "✨" };
    }
    if(role === 1){
      const dot = pick(DOTS, h);
      const perTurn = 2 + (h % 5); // 2..6
      const turns = 3 + ((h>>4) % 3); // 3..5
      return { role, word:w, element, dot, perTurn, turns };
    }
    // role 2
    const buff = pick(BUFFS, h);
    const magnitude = 6 + (h % 10); // 6..15
    const turns = 3 + ((h>>3) % 3); // 3..5
    return { role, word:w, element, buff, magnitude, turns };
  }

  function unlockedSlots(level){
    if(level >= 4) return 3;
    if(level >= 2) return 2;
    return 1;
  }

  function basePlayer(){
  return {
    seed: newSeed(),
    level: 1,
    xp: 0,
    // XP threshold for next level (cumulative)
    xpMax: xpForLevel(2),
    startAt: nowMs(),

    // Base maxima (stats points affect these). Gear adds bonuses on top.
    baseHpMax: 85,
    baseManaMax: 8,

    hpMax: 85,
    hp: 85,
    manaMax: 8,
    mana: 8,

    // base stats (before equipment)
    baseAtk: 20,
    baseDef: 14,
    baseCrit: 0.07,
    lootBonus: 0,

    savedWords: [],
    wordBook: [],
    inventory: [],

    // Equipment slots (Diablo-style)
    equip: {
      weapon: null,
      helmet: null,
      offhand: null,
      hands: null,
      trinket1: null,
      trinket2: null,
      backpack: null,
      boots: null,
      chest: null,
    },

    buff: null,
    shield: 0,
    discovery: 0, // 0..100
  };
}


  
function xpForLevel(level){
  // Cumulative XP required to reach `level` (level 1 starts at 0 XP)
  // L2: 30, L3: 90, L4: 180, ... (30 * (level-1)*level/2)
  const L = Math.max(1, Math.floor(level||1));
  return Math.round(30 * (L - 1) * L / 2);
}
function rollStartWords(p){
    // two random to begin + one locked slot (still filled but not usable until lvl4)
    const a = START_WORDS[irnd(0, START_WORDS.length-1)];
    let b = START_WORDS[irnd(0, START_WORDS.length-1)];
    if(b === a) b = START_WORDS[(START_WORDS.indexOf(a)+3) % START_WORDS.length];
    const c = START_WORDS[irnd(0, START_WORDS.length-1)];
    p.savedWords = [a,b,c];
  }

  function derivedStats(p){
    let atk = p.baseAtk;
    let def = p.baseDef;
    let crit = p.baseCrit;
    let loot = p.lootBonus;

    const eq = Object.values(p.equip || {}).filter(Boolean);
    for(const it of eq){
      atk += (it.atk || 0);
      def += (it.def || 0);
      crit += (it.crit || 0) / 100;
      loot += (it.rarity || 0) / 100;
    }
    // buff effects
    if(p.buff){
      if(p.buff.kind === "crit") crit += 0.05;
      if(p.buff.kind === "rarity") loot += 0.10;
      if(p.buff.kind === "shield") {/* handled as shield points */}
      if(p.buff.kind === "resist") {/* handled by resist element */}
    }
    crit = clamp(crit, 0.02, 0.40);
    loot = clamp(loot, 0, 0.80);

    return { atk, def, crit, loot };
  }

  function save(){
    try{ localStorage.setItem(STORAGE, JSON.stringify(state)); toast("Game saved."); }catch{}
  }
  function load(){
    try{
      const raw = localStorage.getItem(STORAGE);
      if(!raw) return toast("Ingen sparning hittad.");
      const s = JSON.parse(raw);
      state = sanitize(s);
      toast("Game loaded.");
      renderAll();
    }catch{
      toast("Kunde inte ladda.");
    }
  }

  function sanitize(s){
    // Keep schema stable
    const p = s.player || basePlayer();
    if(!p.seed) p.seed = newSeed();
    if(!Array.isArray(p.savedWords) || p.savedWords.length !== 3) rollStartWords(p);
    p.wordBook = Array.isArray(p.wordBook) ? p.wordBook : [];
    p.level = Number(p.level||1);
    p.xp = Number(p.xp||0);
    p.xpMax = Number(p.xpMax||100);
    p.hpMax = Number(p.hpMax||85);
    p.hp = clamp(Number(p.hp||p.hpMax), 0, p.hpMax);
    p.manaMax = Number(p.manaMax||8);
    p.mana = clamp(Number(p.mana||p.manaMax), 0, p.manaMax);
    p.energyMax = Number(p.energyMax||10);
    p.energy = clamp(Number(p.energy||p.energyMax), 0, p.energyMax);
    p.baseAtk = Number(p.baseAtk||20);
    p.baseDef = Number(p.baseDef||14);
    p.baseCrit = Number(p.baseCrit||0.07);
    p.lootBonus = Number(p.lootBonus||0);
    p.discovery = clamp(Number(p.discovery||0), 0, 100);
    p.inventory = Array.isArray(p.inventory)? p.inventory : [];
    p.equip = p.equip || { weapon:null, helm:null, armor:null };
    p.buff = p.buff || null;
    p.shield = Number(p.shield||0);
    p.dot = p.dot || null;
    p.status = Array.isArray(p.status) ? p.status : [];

    const enemy = s.enemy?.id ? s.enemy : makeEnemy(p.level);
    enemy.hpMax = Number(enemy.hpMax||enemy.hp||70);
    enemy.hp = clamp(Number(enemy.hp||enemy.hpMax), 0, enemy.hpMax);
    enemy.dot = enemy.dot || null;
    enemy.guard = Number(enemy.guard||0);
    enemy.intent = enemy.intent || null;
    enemy.status = Array.isArray(enemy.status) ? enemy.status : [];

    return {
      player: p,
      enemy,
      attackSlots: s.attackSlots || null,
      uiAssignWordId: s.uiAssignWordId || null,
      pendingRewards: s.pendingRewards || null,
      pendingWord: s.pendingWord || null,
      turnLock: !!s.turnLock,
      pendingLevelUp: s.pendingLevelUp || null,
      deferredRewards: s.deferredRewards || null,
      mode: s.mode || "",
      modeRun: s.modeRun || null,
      score: s.score || 0,
      fightEnded: !!s.fightEnded,
      lastReward: s.lastReward || "",
      nextReady: !!s.nextReady,
      combatLog: s.combatLog || [],
      combo: Number(s.combo||0),
      comboBest: Number(s.comboBest||0),
      enemyTimerId: s.enemyTimerId || null,
      journal: s.journal || [],
      lastText: s.lastText || "Skriv ett ord och attackera!",
      lastCast: s.lastCast || "",
    };
  }

  let state = sanitize({});

  function newRun(){
    state = sanitize({ player: basePlayer() });
    rollStartWords(state.player);
    state.enemy = makeEnemy(state.player.level);
    state.pendingRewards = null;
    state.pendingWord = null;
    state.turnLock = false;
    state.uiAssignWordId = null;
    state.pendingLevelUp = null;
    state.deferredRewards = null;
    state.combatLog = [];
    state.nextReady = false;
    state.lastReward = "";
    state.fightEnded = false;
    state.journal = [];
    state.sceneText = pick(SCENES, hash32(`${state.player.seed}|scene|0`));
    state.lastText = "Skriv ett ord och attackera!";
    journalPush(state.sceneText);
    journalPush(`En ${state.enemy.name} dyker upp!`);
    state.lastCast = "";
    ensureAttackSlots();
    renderAll();
    toast("Ny run startad.");
  }

  // UI render
  function renderAll(){
    const p = state.player;
    const e = state.enemy;
    // failsafe: if enemy is at 0 HP but rewards not triggered, trigger win
    if(e && e.hp <= 0 && !state.pendingRewards && !state.fightEnded){
      try{ winFight(); } catch(err){ console.error(err); }
    }
    const ds = derivedStats(p);

    ui.level.textContent = p.level;
    ui.xp.textContent = Math.floor(p.xp);
    ui.xpmax.textContent = p.xpMax;

    // Left: base stats overview
    if(ui.baseLife) ui.baseLife.textContent = String(Math.floor(p.hpMax));
    if(ui.baseMana) ui.baseMana.textContent = String(Math.floor(p.manaMax));
    if(ui.baseEnergy) ui.baseEnergy.textContent = String(Math.floor(p.energyMax || 0));
    if(ui.baseRegen){
      let regen = 0;
      if(p.buff && p.buff.kind === "regen") regen = Math.max(1, Math.round((p.buff.magnitude||0)/3));
      ui.baseRegen.textContent = String(regen);
    }
    if(ui.baseShield) ui.baseShield.textContent = String(Math.floor(p.shield || 0));

    // HUD (cinematic layout)
    if(ui.hpHud) ui.hpHud.textContent = Math.floor(p.hp);
    if(ui.hpmaxHud) ui.hpmaxHud.textContent = p.hpMax;
    if(ui.manaHud) ui.manaHud.textContent = Math.floor(p.mana);
    if(ui.manamaxHud) ui.manamaxHud.textContent = p.manaMax;

    ui.hpcenter.textContent = Math.floor(p.hp);
    ui.hpmaxcenter.textContent = p.hpMax;

    ui.atk.textContent = Math.floor(ds.atk);
    ui.def.textContent = Math.floor(ds.def);
    ui.crit.textContent = `${Math.round(ds.crit*100)}%`;
    ui.loot.textContent = `+${Math.round(ds.loot*100)}%`;

    const hpPct = `${clamp((p.hp/p.hpMax)*100,0,100)}%`;
    const mpPct = `${clamp((p.mana/p.manaMax)*100,0,100)}%`;
    ui.hpbarcenter.style.width = hpPct;
    if(ui.hpbarHud) ui.hpbarHud.style.width = hpPct;
    if(ui.manabarHud) ui.manabarHud.style.width = mpPct;

    ui.enemyName.textContent = e.name;
    ui.enemyResist.textContent = `${RESIST_ICON[e.resist] || ""} ${e.resist}`;
    ui.ehp.textContent = Math.floor(e.hp);
    ui.ehpmax.textContent = e.hpMax;
    ui.ehpbar.style.width = `${clamp((e.hp/e.hpMax)*100,0,100)}%`;

    ui.enemySprite.src = (e.img || ui.enemySprite.src);
    ui.playerSprite.src = "./assets/player_f_0.png";

    ui.battletext.textContent = state.lastText;

    renderInventoryLeft();
    renderWords();
    renderEquip();
    renderRewards();
    if(state.pendingLevelUp) renderLevelUp();
    renderDiscovery();
    // spell preview removed from UI
    renderJournal();
    renderCombat();
    renderStatusUi();

    // Disable attack buttons when no word is typed
    const hasWord = ((ui.input && ui.input.value) ? ui.input.value.trim() : "").length > 0;
    if(ui.attack) ui.attack.disabled = !hasWord;
    const dockBtn = document.getElementById("dockAttackBtn");
    if(dockBtn) dockBtn.disabled = !hasWord;
    if(window.__GAMEONE__ && window.__GAMEONE__.onDockRender){ try{ window.__GAMEONE__.onDockRender(); }catch(e){} }
  }

  
  function getCastParts(){
    const raw = (ui.input.value || "").trim().toUpperCase();
    if(!raw) return [];
    return raw.split(/\s+/).filter(Boolean).slice(0,3).map(w => w.replace(/[^A-ZÅÄÖ]/g,"").slice(0,12));
  }

  function estimateMainDamage(main, ds, enemy, p){
    if(!main || !main.word) return null;
    const wordCount = getCastParts().length;
    const weakMode = p.mana < manaCostFor(wordCount);
    let dmg = ds.atk + main.power;
    dmg = Math.round(dmg * calcElementMultiplier(main.element));
    if(p.equip.weapon && p.equip.weapon.elem === main.element) dmg += 4;
    if(weakMode) dmg = Math.max(1, Math.round(dmg * 0.35));
    dmg = Math.max(1, dmg - enemy.def);
    const critChance = Math.round(ds.crit * 100);
    return { dmg, critChance };
  }

  // Spell preview UI removed.
  function renderSpellPreview(){ return; }

  function renderJournal(){
    if(!ui.journalLog) return;
    ui.journalScene.textContent = state.sceneText || "En mystisk vandring fortsätter…";
    ui.journalNow.textContent = state.lastText || "Skriv ett ord och tryck Attack.";
    const items = (state.journal || []).slice().reverse();
    ui.journalLog.innerHTML = items.map(it => `
      <div class="journal-line">
        <div class="t">${escapeHtml(it.t)}</div>
        <div class="m">${escapeHtml(it.m)}</div>
      </div>
    `).join("") || '<div class="muted">Inga händelser ännu.</div>';
  }

  function combatPush(msg){
    if(!msg) return;
    if(!state.combatLog) state.combatLog = [];
    const t = fmtClock(nowMs() - state.player.startAt);
    state.combatLog.push({ t, m: msg });
    if(state.combatLog.length > 24) state.combatLog.shift();
    renderCombat();
  }

  function renderCombat(){
    if(!ui.combatLog) return;
    const items = (state.combatLog || []).slice().reverse();
    ui.combatLog.innerHTML = items.map(it => `
      <div class="cl-line">
        <div class="t">${escapeHtml(it.t)}</div>
        <div class="m">${escapeHtml(it.m)}</div>
      </div>
    `).join("") || '<div class="muted">Inga attacker ännu.</div>';
  }


  function saveTypedWord(role){
    const p = state.player;
    const unlocked = unlockedSlots(p.level);
    if(role >= unlocked){
      toast("Den sloten är låst ännu.");
      return;
    }
    const parts = getCastParts();
    const w = parts[role] || parts[0] || "";
    if(!w){
      toast("Skriv ett ord först.");
      return;
    }
    // keep legacy slots
    p.savedWords[role] = w;

    // add to wordBook (and mark usable immediately)
    const id = ensureWordInBook(w);
    const wb = getWordById(id);
    if(wb) wb.revealed = true;
    ensureAttackSlots();
    // convenience: first save prefers Spark if empty
    if(role === 0 && !state.attackSlots.spark.wordId){
      state.attackSlots.spark.wordId = id;
    }
    toast(`Sparade ${w}.`);
    renderAll();
  }


function renderWords(){
    const p = state.player;
    ui.words.innerHTML = "";
    const unlocked = unlockedSlots(p.level);

    p.savedWords.forEach((w, i) => {
      const role = i; // 0 attack, 1 dot, 2 buff
      const props = wordProps(w, role, p.seed);
      const locked = i >= unlocked;
      const div = document.createElement("div");
      div.className = "wordchip" + (locked ? " locked" : "");
      let detail = "";
      if(role === 0){
        const est = estimateMainDamage(props, derivedStats(p), state.enemy, p);
        detail = est ? `DMG ${est.dmg} • Crit ${est.critChance}%` : "DMG —";
      }else if(role === 1){
        const mult = calcElementMultiplier(props.element);
        detail = `${props.dot.icon} ${props.dot.name} ${Math.max(1, Math.round(props.perTurn * mult))}×${props.turns}`;
      }else{
        detail = `${props.buff.icon} ${props.buff.name} +${props.magnitude} (${props.turns}t)`;
      }

      div.innerHTML = `
        <div>
          <b>${props.icon || RESIST_ICON[props.element] || "✨"} ${escapeHtml(w)}</b><br/>
          <small>${role===0?"Attack":role===1?"DoT":"Buff"} • ${props.element}</small>
          <br/><small class="muted">${detail}</small>
        </div>
        <div class="muted">${locked ? "🔒" : "▶"}</div>
      `;
      div.addEventListener("click", () => {
        if(locked) return;
        appendWordToInput(w);
      });
      ui.words.appendChild(div);
    });
  }

  

function renderInventoryLeft(){
  const p = state.player;
  if(!ui.leftEquip || !p) return;

  const eq = p.equip || {};
  // Backward compat from older saves
  if(eq.helm && !eq.helmet) eq.helmet = eq.helm;
  if(eq.armor && !eq.chest) eq.chest = eq.armor;

  const slots = [
    { key:"helmet",   area:"helmet",   icon:"🪖", label:"Helmet",   item:eq.helmet },
    { key:"weapon",   area:"weapon",   icon:"🗡️", label:"Weapon",   item:eq.weapon },
    { key:"offhand",  area:"offhand",  icon:"🛡️", label:"Offhand",  item:eq.offhand },
    { key:"chest",    area:"chest",    icon:"🥋", label:"Chest",    item:eq.chest },
    { key:"hands",    area:"hands",    icon:"🧤", label:"Hands",    item:eq.hands },
    { key:"backpack", area:"backpack", icon:"🎒", label:"Backpack", item:eq.backpack },
    { key:"trinket1", area:"trinket1", icon:"✨", label:"Trinket",  item:eq.trinket1 },
    { key:"trinket2", area:"trinket2", icon:"✨", label:"Trinket",  item:eq.trinket2 },
    { key:"boots",    area:"boots",    icon:"👢", label:"Boots",    item:eq.boots },
  ];

  ui.leftEquip.innerHTML = `
    <div class="paperdoll" aria-label="Equipment overview">
      <div class="pd-sil" aria-hidden="true"></div>
      ${slots.map(s=>{
        const it = s.item;
        const name = it ? it.name : "Tomt";
        const sub  = it ? itemDesc(it) : s.label;
        return `
          <button type="button" class="pd-slot" data-slot="${escapeHtml(s.key)}" style="grid-area:${escapeHtml(s.area)}" title="${escapeHtml(sub)}">
            <div class="pd-ico">${s.icon}</div>
            <div class="pd-name">${escapeHtml(name)}</div>
          </button>
        `;
      }).join("")}
    </div>
  `;

  if(ui.leftInvCount) ui.leftInvCount.textContent = String((p.inventory||[]).length);
}
function renderEquip(){
  const p = state.player;
  const eq = p.equip || {};
  if(eq.helm && !eq.helmet) eq.helmet = eq.helm;
  if(eq.armor && !eq.chest) eq.chest = eq.armor;

  const rows = [
    { slot:"helmet",   area:"helmet",   icon:"🪖", label:"Helmet",   item:eq.helmet },
    { slot:"weapon",   area:"weapon",   icon:"🗡️", label:"Weapon",   item:eq.weapon },
    { slot:"offhand",  area:"offhand",  icon:"🛡️", label:"Offhand",  item:eq.offhand },
    { slot:"hands",    area:"hands",    icon:"🧤", label:"Hands",    item:eq.hands },
    { slot:"trinket1", area:"trinket1", icon:"✨", label:"Trinket",  item:eq.trinket1 },
    { slot:"trinket2", area:"trinket2", icon:"✨", label:"Trinket",  item:eq.trinket2 },
    { slot:"backpack", area:"backpack", icon:"🎒", label:"Backpack", item:eq.backpack },
    { slot:"boots",    area:"boots",    icon:"👢", label:"Boots",    item:eq.boots },
    { slot:"chest",    area:"chest",    icon:"🥋", label:"Chest",    item:eq.chest },
  ];

  ui.equiplist.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "equip-grid";
  ui.equiplist.appendChild(grid);

  for(const r of rows){
    const it = r.item;
    const itemName = it ? it.name : "Tomt";
    const itemSub  = it ? itemDesc(it) : r.label;

    const box = document.createElement("div");
    box.className = "equip-slot";
    box.dataset.slot = r.slot;
    box.style.gridArea = r.area;

    box.innerHTML = `
      <div class="equip-ico">${r.icon}</div>
      <div class="equip-txt">
        <b>${escapeHtml(itemName)}</b>
        <small>${escapeHtml(itemSub)}</small>
      </div>
    `;
    grid.appendChild(box);
  }
}

  function renderDiscovery(){
    const p = state.player;
    ui.discover.style.width = `${p.discovery}%`;
    ui.discoverGlow.style.opacity = p.discovery >= 100 ? "0.85" : "0";
  }


  // --- Level Up choices ---
  const UPGRADE_POOL = [
    { id:"hp",      title:"Mer Hälsa",      desc:"Öka max HP och heala lite direkt.", tags:["HP","Säker"], apply:(p)=>{ p.hpMax += 14; p.hp = Math.min(p.hpMax, p.hp + 14); } },
    { id:"mana",    title:"Mer Mana",       desc:"Öka max Mana och få lite mana direkt.", tags:["Mana","Fler casts"], apply:(p)=>{ p.manaMax += 4; p.mana = Math.min(p.manaMax, p.mana + 4); } },
    { id:"power",   title:"Starkare Slag",  desc:"+10% skada på huvud-ord (ord 1).", tags:["Dmg","Build"], apply:(p)=>{ p.bonusDmg = (p.bonusDmg||0) + 0.10; } },
    { id:"dot",     title:"Vassare DoT",    desc:"+20% DoT-skada och +1 tur varaktighet.", tags:["DoT","Synergi"], apply:(p)=>{ p.dotBonus = (p.dotBonus||0) + 0.20; p.dotPlusTurns = (p.dotPlusTurns||0) + 1; } },
    { id:"crit",    title:"Kritisk Träff",  desc:"+6% crit-chans.", tags:["Crit","Spike"], apply:(p)=>{ p.critBonus = (p.critBonus||0) + 0.06; } },
    { id:"shield",  title:"Stjärnsköld",    desc:"Starta varje fight med en liten sköld.", tags:["Def","Arena"], apply:(p)=>{ p.startShield = (p.startShield||0) + 6; } },
  ];

  function pickUpgrades(n=3){
    const pool = UPGRADE_POOL.slice();
    for(let i=pool.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n).map(u => ({ id:u.id, title:u.title, desc:u.desc, tags:u.tags }));
  }

  function showLevelUp(levels=1){
  const gained = Math.max(1, (levels|0));
  const points = gained * 5; // 5 points per level gained
  const p = state.player;

  state.pendingLevelUp = {
    pointsTotal: points,
    pointsLeft: points,
    // base snapshot so we can support minus button safely
    base: {
      life: Number(p.hpMax||85),
      mana: Number(p.manaMax||8),
      energy: Number(p.energyMax||10),
      atk: Number(p.baseAtk||20),
      def: Number(p.baseDef||14),
      crit: Number(Math.round((p.baseCrit||0.07)*100)), // store as %
      regen: Number(p.baseRegen||0),
    },
    alloc: { life:0, mana:0, energy:0, atk:0, def:0, crit:0, regen:0 },
  };

  // Force the level-up screen visible even on mobile/drawer layouts
  if(ui.levelupScreen){
    ui.levelupScreen.style.position = "fixed";
    ui.levelupScreen.style.inset = "0";
    ui.levelupScreen.style.zIndex = "99999";
    ui.levelupScreen.style.display = "flex";
    ui.levelupScreen.style.alignItems = "center";
    ui.levelupScreen.style.justifyContent = "center";
    ui.levelupScreen.classList.add("is-open");
    ui.levelupScreen.setAttribute("aria-hidden","false");
  }
}

function hideLevelUp(){
  if(ui.levelupScreen){
    ui.levelupScreen.classList.remove("is-open");
    ui.levelupScreen.setAttribute("aria-hidden","true");
  }
}

function renderLevelUp(){
  if(!state.pendingLevelUp || !ui.levelupChoices) return;
  const p = state.player;
  const L = state.pendingLevelUp;

  if(ui.levelupSub){
    ui.levelupSub.textContent = `Du är nu level ${p.level}. Fördela ${L.pointsTotal} poäng. Kvar: ${L.pointsLeft}.`;
  }

  const rows = [
    { key:"life",  label:"Life",       desc:"+5 HP max",     step: 5 },
    { key:"mana",  label:"Mana",       desc:"+1 Mana max",   step: 1 },
    { key:"energy",label:"Energy",     desc:"+2 Energy max", step: 2 },
    { key:"atk",   label:"Attack",     desc:"+1 ATK",        step: 1 },
    { key:"def",   label:"Defense",    desc:"+1 DEF",        step: 1 },
    { key:"crit",  label:"Crit",       desc:"+1% Crit",      step: 1 },
    { key:"regen", label:"Life regen", desc:"+1 Regen",      step: 1 },
  ];

  const rowHtml = (r)=>{
    const a = L.alloc[r.key]||0;
    return `
      <div class="lvlrow">
        <div class="lvlleft">
          <div class="lvllabel">${r.label}</div>
          <div class="lvldesc muted">${r.desc}</div>
        </div>
        <div class="lvlright">
          <button class="btn small lvlbtn" data-k="${r.key}" data-d="-">−</button>
          <div class="lvlval"><b>${a}</b></div>
          <button class="btn small lvlbtn" data-k="${r.key}" data-d="+">+</button>
        </div>
      </div>
    `;
  };

  ui.levelupChoices.innerHTML = `
    <div class="lvlwrap">
      ${rows.map(rowHtml).join("")}
      <div class="lvlactions">
        <button class="btn" id="btn-levelup-confirm" ${L.pointsLeft!==0 ? "disabled":""}>Bekräfta</button>
      </div>
    </div>
  `;

  ui.levelupChoices.querySelectorAll(".lvlbtn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const k = btn.getAttribute("data-k");
      const d = btn.getAttribute("data-d");
      if(!k) return;
      if(d === "+" && L.pointsLeft > 0){
        L.alloc[k] = (L.alloc[k]||0) + 1;
        L.pointsLeft -= 1;
      } else if(d === "-" && (L.alloc[k]||0) > 0){
        L.alloc[k] = (L.alloc[k]||0) - 1;
        L.pointsLeft += 1;
      }
      renderLevelUp();
    });
  });

  const c = ui.levelupChoices.querySelector("#btn-levelup-confirm");
  if(c){
    c.addEventListener("click", ()=>{
      applyLevelUpAlloc();
    });
  }
}

function applyLevelUpAlloc(){
  const p = state.player;
  const L = state.pendingLevelUp;
  if(!p || !L) return;
  if(L.pointsLeft !== 0){
    toast("Fördela alla poäng först.");
    return;
  }

  // Apply allocations
  const hpAdd = (L.alloc.life||0) * 5;
  const manaAdd = (L.alloc.mana||0) * 1;
  const energyAdd = (L.alloc.energy||0) * 2;

  p.hpMax = Math.max(1, Number(p.hpMax||85) + hpAdd);
  p.manaMax = Math.max(0, Number(p.manaMax||8) + manaAdd);
  p.energyMax = Math.max(0, Number(p.energyMax||10) + energyAdd);

  p.baseAtk = Number(p.baseAtk||20) + (L.alloc.atk||0);
  p.baseDef = Number(p.baseDef||14) + (L.alloc.def||0);

  // crit stored as fraction
  p.baseCrit = clamp(Number(p.baseCrit||0.07) + ((L.alloc.crit||0) * 0.01), 0, 0.95);

  // regen stat
  p.baseRegen = Number(p.baseRegen||0) + (L.alloc.regen||0);

  // refill current to new max limits
  p.hp = clamp(p.hp + hpAdd, 0, p.hpMax);
  p.mana = clamp(p.mana + 1, 0, p.manaMax);
  p.energy = clamp(p.energy, 0, p.energyMax);

  state.pendingLevelUp = null;
  hideLevelUp();

  // Now show rewards (only on level-up)
  if(state.deferredRewards && !state.pendingRewards){
    state.pendingRewards = state.deferredRewards;
    state.deferredRewards = null;
    if(ui.panelRewards){
      ui.panelRewards.classList.add("rewards-pop");
      setTimeout(()=>ui.panelRewards && ui.panelRewards.classList.remove("rewards-pop"), 260);
    }
  }

  renderAll();
}

function applyUpgrade(){ /* replaced by stat points level-up */ }


  function renderRewards(){
  const open = !!state.pendingRewards || !!state.nextReady;
  if(ui.panelRewards){
    ui.panelRewards.classList.toggle('is-open', open);
    ui.panelRewards.classList.toggle('hidden', !open);
  }

  const buildRowsHtml = (rewards) => rewards.map((r, idx)=>`
    <div class="reward" data-idx="${idx}">
      <div class="rewardicon">${r.icon}</div>
      <div class="rewardtext">
        <b>${escapeHtml(r.title)}</b>
        <small>${escapeHtml(r.desc)}</small>
      </div>
    </div>
  `).join("");

  const wireClicks = (root, rewards) => {
    if(!root) return;
    root.querySelectorAll(".reward").forEach(el=>{
      el.addEventListener("click", ()=>{
        const idx = Number(el.getAttribute("data-idx"));
        const r = rewards[idx];
        if(r) claimReward(r);
      });
    });
  };

  // Sidebar list
  if(ui.rewards){
    ui.rewards.innerHTML = "";
    if(!state.pendingRewards){
      if(state.nextReady){
        ui.rewards.innerHTML = `
          <div class="muted" style="margin-bottom:8px">${escapeHtml(state.lastReward || "Belöning tagen.")}</div>
          <button class="btn small" id="btn-next-fight">Nästa fiende</button>
        `;
        const btn = document.getElementById("btn-next-fight");
        if(btn) btn.addEventListener("click", ()=>{
          if(state.mode === MODES.ADVENTURE && state.modeRun){
            state.modeRun.room += 1;
          }
          state.nextReady = false;
          state.lastReward = "";
          nextFight();
        });
      } else {
        ui.rewards.innerHTML = `<div class="muted">Vinn en strid för att få belöningar.</div>`;
      }
    } else {
      ui.rewards.innerHTML = buildRowsHtml(state.pendingRewards);
      wireClicks(ui.rewards, state.pendingRewards);
    }
  }

  // Popup modal
  if(!ui.panelRewards) return;
  if(!open){
    ui.panelRewards.innerHTML = "";
    return;
  }

  if(state.pendingRewards){
    const rows = buildRowsHtml(state.pendingRewards);
    ui.panelRewards.innerHTML = `
      <div class="modal-card rewards-pop">
        <div class="modal-head">
          <div class="modal-title">VÄLJ BELÖNING</div>
          <button class="iconbtn" id="btn-rewards-close" title="Stäng">✕</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom:10px">Välj en belöning för att fortsätta.</div>
          <div class="rewardslist">${rows}</div>
        </div>
      </div>
    `;
    // Don't allow closing while pending (prevents softlock)
    const closeBtn = document.getElementById("btn-rewards-close");
    if(closeBtn) closeBtn.addEventListener("click", (e)=>{ e.preventDefault(); });
    wireClicks(ui.panelRewards, state.pendingRewards);
    return;
  }

  // Next ready
  ui.panelRewards.innerHTML = `
    <div class="modal-card rewards-pop">
      <div class="modal-head">
        <div class="modal-title">BELÖNING</div>
        <button class="iconbtn" id="btn-rewards-close2" title="Stäng">✕</button>
      </div>
      <div class="modal-body">
        <div class="muted" style="margin-bottom:10px">${escapeHtml(state.lastReward || "Belöning tagen.")}</div>
        <button class="btn" id="btn-next-fight2">Nästa fiende</button>
      </div>
    </div>
  `;
  const btn2 = document.getElementById("btn-next-fight2");
  if(btn2) btn2.addEventListener("click", ()=>{
    if(state.mode === MODES.ADVENTURE && state.modeRun){
      state.modeRun.room += 1;
    }
    state.nextReady = false;
    state.lastReward = "";
    nextFight();
  });
  const close2 = document.getElementById("btn-rewards-close2");
  if(close2) close2.addEventListener("click", ()=>{
    ui.panelRewards.classList.add("hidden");
    ui.panelRewards.classList.remove("is-open");
  });
}

  function toast(text){
    state.lastText = text;
    journalPush(text);
    renderAll();
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }


  function journalPush(msg){
    if(!msg) return;
    if(!state.journal) state.journal = [];
    const t = fmtClock(nowMs() - (state.player?.startAt || nowMs()));
    // avoid stacking identical lines
    if(state.journal.length && state.journal[state.journal.length-1].m === msg) return;
    state.journal.push({ t, m: msg });
    if(state.journal.length > 14) state.journal.shift();
  }

function journalNow(msg){
  if(!msg) return;
  state.lastText = msg;
  journalPush(msg);
  try{ renderJournal(); } catch(e){}
}


  function fmtClock(ms){
    const s = Math.floor(ms/1000);
    const mm = String(Math.floor(s/60)).padStart(1,"0");
    const ss = String(s%60).padStart(2,"0");
    return `${mm}:${ss}`;
  }
  function appendWordToInput(word){
    const w = (word||"").trim();
    if(!w) return;
    const cur = ui.input.value.trim();
    ui.input.value = cur ? (cur + " " + w) : w;
    ui.input.focus();
  }

  function float(layer, text, color="red", small=false){
    const el = document.createElement("div");
    el.className = `float ${color}` + (small ? " small" : "");
    el.textContent = text;
    const ox = irnd(-55, 55);
    const oy = irnd(-18, 22);

    layer = layer || ui.arena || document.body;
    layer.appendChild(el);

    el.style.transform = `translate(${ox}px, ${oy}px)`;
    requestAnimationFrame(()=>{
      el.classList.add("show");
      el.style.transform = `translate(${ox}px, ${oy-70}px)`;
      el.style.opacity = "0";
    });
    setTimeout(()=> el.remove(), 900);
  }


  // --- SFX (no external files) ---
  let _audioCtx = null;
  function getAudio(){
    try{
      if(!_audioCtx){ _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      return _audioCtx;
    }catch(e){ return null; }
  }

  function playSfx(type="attack"){
    const ctx = getAudio();
    if(!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(type==="enemy" ? 900 : 1400, t0);
    o.type = type==="enemy" ? "sawtooth" : "triangle";
    const base = (type==="enemy") ? 140 : 220;
    o.frequency.setValueAtTime(base, t0);
    o.frequency.exponentialRampToValueAtTime(base*3.2, t0+0.06);
    o.frequency.exponentialRampToValueAtTime(base*1.4, t0+0.14);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(type==="enemy" ? 0.12 : 0.10, t0+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+0.16);
    o.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    try{ o.start(t0); o.stop(t0+0.18); }catch(e){}
  }
  function itemDesc(it){
    const parts = [];
    if(it.atk) parts.push(`+${it.atk} ATK`);
    if(it.def) parts.push(`+${it.def} DEF`);
    if(it.hp) parts.push(`+${it.hp} HP`);
    if(it.mana) parts.push(`+${it.mana} Mana`);
    if(it.crit) parts.push(`Crit +${it.crit}%`);
    if(it.elem) parts.push(`${it.elem} DMG`);
    if(it.resist) parts.push(`Resist ${it.resist}`);
    if(it.heal) parts.push(`Heal ${it.heal}`);
    return parts.join(" • ") || "—";
  }

  // Rewards
  function makeRewards(count=3){
    const p = state.player;
    const lootBoost = derivedStats(p).loot;
    const rareRoll = Math.random() < (0.10 + lootBoost);
    const hasFullDiscovery = p.discovery >= 100;

    const rewards = [];

    // Word scroll always available
    const word = START_WORDS[irnd(0, START_WORDS.length-1)];
    rewards.push({
      kind:"word",
      icon:"📜",
      title:"New Word Scroll!",
      desc:`Lär ett nytt ord: ${word}`,
      word
    });

    // item reward
    const item = ITEM_POOL[irnd(0, ITEM_POOL.length-1)]();
    rewards.push({
      kind:"item",
      icon:item.icon,
      title: item.type === "potion" ? item.name : `Loot: ${item.name}`,
      desc: itemDesc(item),
      item
    });

    // discovery bonus reward
    if(hasFullDiscovery || rareRoll){
      rewards.push({
        kind:"bonus",
        icon:"✨",
        title:"Rare Reward!",
        desc: hasFullDiscovery ? "Discovery full: extra belöning!" : "Tur: extra belöning!",
        item: ITEM_POOL[irnd(0, ITEM_POOL.length-1)]()
      });
    } else {
      rewards.push({
        kind:"heal",
        icon:"❤️",
        title:"Rest",
        desc:"Heala +18 HP och +2 Mana",
      });
    }

    return rewards.slice(0, Math.max(1, count|0));
  }

  function claimReward(r){
    const p = state.player;
    if(!state.pendingRewards) return;

    if(r.kind === "word"){
      state.pendingRewards = null;
      state.nextReady = true;
      state.lastReward = `Du fick nytt ord: ${r.word?.name || r.word?.title || "Nytt ord"}`;
      renderAll();
      setTimeout(()=>{ openWordModal(r.word); }, 0);
      return;
    }
    if(r.kind === "item" || r.kind === "bonus"){
      const it = r.item;
      if(it.type === "potion"){
        const heal = it.heal || 25;
        p.hp = clamp(p.hp + heal, 0, p.hpMax);
        float(ui.floatP, `+${heal}`, "green", true);
        toast(`Du dricker potion: +${heal} HP`);
      } else {
        p.inventory.push(it);
        // auto-equip if slot empty
        autoEquip(it);
        toast(`Du fick ${it.name}`);
      }
      // if discovery was full, consume it
      if(p.discovery >= 100) p.discovery = 0;
      state.pendingRewards = null;
      state.nextReady = true; state.lastReward = `Du tog belöning: ${r.title}`; renderAll(); return;
      return;
    }
    if(r.kind === "heal"){
      p.hp = clamp(p.hp + 18, 0, p.hpMax);
      p.mana = clamp(p.mana + 2, 0, p.manaMax);
      float(ui.floatP, "+18", "green", true);
      toast("Du vilar och återhämtar dig.");
      if(p.discovery >= 100) p.discovery = 0;
      state.pendingRewards = null;
      state.nextReady = true; state.lastReward = `Du tog belöning: ${r.title}`; renderAll(); return;
      return;
    }
    if(r.kind === "bonus"){
      // handled above
      return;
    }
  }

  function autoEquip(it){
  const p = state.player;
  if(!p) return;
  const eq = p.equip || (p.equip = {});
  if(eq.helm && !eq.helmet) eq.helmet = eq.helm;
  if(eq.armor && !eq.chest) eq.chest = eq.armor;

  const t = it.type;

  if(t === "weapon" && !eq.weapon) eq.weapon = it;
  if((t === "helmet" || t === "helm") && !eq.helmet) eq.helmet = it;
  if(t === "offhand" && !eq.offhand) eq.offhand = it;
  if(t === "hands" && !eq.hands) eq.hands = it;
  if(t === "boots" && !eq.boots) eq.boots = it;
  if((t === "chest" || t === "armor") && !eq.chest) eq.chest = it;
  if(t === "backpack" && !eq.backpack) eq.backpack = it;

  if(t === "trinket"){
    if(!eq.trinket1) eq.trinket1 = it;
    else if(!eq.trinket2) eq.trinket2 = it;
  }

  // apply hp/mana bonuses etc
  applyEquipDerived();
}


  function applyEquipDerived(){
  const p = state.player;
  if(!p) return;

  // Backward compat for older saves
  p.baseHpMax ??= p.hpMax ?? 85;
  p.baseManaMax ??= p.manaMax ?? 8;
  const eq = p.equip || (p.equip = {});
  if(eq.helm && !eq.helmet) eq.helmet = eq.helm;
  if(eq.armor && !eq.chest) eq.chest = eq.armor;

  let hpBonus = 0, manaBonus = 0;
  for(const it of Object.values(eq).filter(Boolean)){
    hpBonus += (it.hp || 0);
    manaBonus += (it.mana || 0);
  }

  const newHpMax = Math.max(1, Math.round((p.baseHpMax || 85) + hpBonus));
  const newManaMax = Math.max(0, Math.round((p.baseManaMax || 8) + manaBonus));

  // Keep current values within new max
  p.hpMax = newHpMax;
  p.manaMax = newManaMax;
  p.hp = clamp(p.hp, 0, p.hpMax);
  p.mana = clamp(p.mana, 0, p.manaMax);
}


  // Word Scroll modal
  function openWordModal(word){
    const p = state.player;

    const props = wordProps(word, 0, p.seed);
    state.pendingWord = word;

    ui.newWordName.textContent = word;
    ui.newWordDesc.textContent = `Element: ${props.element} • ATK: ${props.power} • Tier: ${tierForWord(p.seed, word)}`;

    // Create/ensure word in book
    const id = ensureWordInBook(word);
    // If the player has the word in hand (reward), it is revealed/usable.
    const wb = getWordById(id);
    if(wb) wb.revealed = true;

    ui.replaceGrid.innerHTML = "";

    const addBtn = (slotKey, title, locked=false) => {
      const btn = document.createElement("div");
      btn.className = "replacebtn" + (locked ? " locked" : "");
      const slot = (state.attackSlots && state.attackSlots[slotKey]) ? state.attackSlots[slotKey] : null;
      const sub = locked ? "Låst" : "Placera här";
      btn.innerHTML = `
        <div><b>${escapeHtml(title)}</b><br/><small>${escapeHtml(sub)}</small></div>
        <small>${locked ? "🔒" : "Välj"}</small>
      `;
      if(!locked){
        btn.addEventListener("click", ()=> {
          assignWordToSlot(id, slotKey);
          state.pendingWord = null;
          closeWordModal();
          state.pendingRewards = null;
          nextFight();
        });
      }
      ui.replaceGrid.appendChild(btn);
    };

    ensureAttackSlots();
    addBtn("tap", "Tap");
    addBtn("spark", "Spark");
    addBtn("arc", "Arc", !state.attackSlots.arc.unlocked);
    addBtn("burst", "Burst", !state.attackSlots.burst.unlocked);

    // optional: add to list only
    const keep = document.createElement("div");
    keep.className = "replacebtn";
    keep.innerHTML = `
      <div><b>Lägg i listan</b><br/><small>Spara ordet utan att placera det nu</small></div>
      <small>OK</small>
    `;
    keep.addEventListener("click", ()=>{
      state.pendingWord = null;
      closeWordModal();
      state.pendingRewards = null;
      nextFight();
    });
    ui.replaceGrid.appendChild(keep);

    ui.wordModal.classList.remove("hidden");
  }

  function closeWordModal(){
    ui.wordModal.classList.add("hidden");
  }

  // Inventory modal
  function openModal(title, html){
    ui.modalTitle.textContent = title;
    ui.modalBody.innerHTML = html;
    ui.modal.classList.remove("hidden");
  }
  function closeModal(){ ui.modal.classList.add("hidden"); }

  function showInventory(){
    const p = state.player;
    if(p.inventory.length === 0){
      return openModal("Inventory", `<div class="muted">Inga items ännu.</div>`);
    }
    const rows = p.inventory.map((it, idx) => `
      <div class="reward" data-idx="${idx}">
        <div class="rewardicon">${it.icon || "🎁"}</div>
        <div class="rewardtext">
          <b>${escapeHtml(it.name)}</b>
          <small>${escapeHtml(itemDesc(it))}</small>
        </div>
      </div>
    `).join("");
    openModal("Inventory", rows + `<div class="muted" style="margin-top:10px">Klicka ett item för att equip.</div>`);
    // click to equip
    ui.modalBody.querySelectorAll(".reward").forEach(el=>{
      el.addEventListener("click", ()=>{
        const idx = Number(el.getAttribute("data-idx"));
        const it = p.inventory[idx];
        equipItem(it);
        toast(`Equipped: ${it.name}`);
        renderAll();
      });
    });
  }

  function equipItem(it){
    const p = state.player;
    if(it.type === "weapon") p.equip.weapon = it;
    if(it.type === "helm") p.equip.helm = it;
    if(it.type === "armor") p.equip.armor = it;
    applyEquipDerived();
  }

  function showEquipment(){
    const p = state.player;
    const rows = [
      p.equip.weapon ? `<div><b>Weapon:</b> ${escapeHtml(p.equip.weapon.name)} <span class="muted">(${escapeHtml(itemDesc(p.equip.weapon))})</span></div>` : `<div class="muted">Weapon: Empty</div>`,
      p.equip.helm ? `<div><b>Helm:</b> ${escapeHtml(p.equip.helm.name)} <span class="muted">(${escapeHtml(itemDesc(p.equip.helm))})</span></div>` : `<div class="muted">Helm: Empty</div>`,
      p.equip.armor ? `<div><b>Armor:</b> ${escapeHtml(p.equip.armor.name)} <span class="muted">(${escapeHtml(itemDesc(p.equip.armor))})</span></div>` : `<div class="muted">Armor: Empty</div>`,
    ].join("<div style='height:8px'></div>");
    openModal("Equipment", rows);
  }

  // Combat
  function manaCostFor(wordsUsed){
    return 1 + (wordsUsed-1)*2;
  }


  function checkEnemyDead(reason=""){
    const e = state.enemy;
    if(!e) return false;
    if(e.hp <= 0 && !state.pendingRewards && !state.fightEnded){
      winFight();
      return true;
    }
    return false;
  }

  function applyDotTick(){
    const e = state.enemy;
    if(!e.dot) return 0;
    e.dot.turns -= 1;
    const dmg = e.dot.perTurn;
    // enemy guard reduces incoming damage once
    if(e.guard > 0){
      dmg = Math.max(1, Math.round(dmg * 0.70));
      e.guard = 0;
      float(ui.floatE, "BLOCK", "blue", true);
    }
    e.hp = Math.max(0, e.hp - dmg);
    checkEnemyDead("dot");
    float(ui.floatE, `-${dmg}`, "purple", true);
    toast(`${e.dot.icon} ${e.dot.name} tick: -${dmg}`);
    if(e.dot.turns <= 0) e.dot = null;
    return dmg;
  }

  function applyBuffTick(){
    const p = state.player;
    if(!p.buff) return;
    p.buff.turns -= 1;
    if(p.buff.kind === "regen"){
      const heal = Math.max(1, Math.round(p.buff.magnitude/3));
      p.hp = clamp(p.hp + heal, 0, p.hpMax);
      float(ui.floatP, `+${heal}`, "green", true);
    }
    if(p.buff.turns <= 0){
      p.buff = null;
      toast("Buff faded.");
    }
  }

  
  function rollEnemyIntent(){
    const e = state.enemy;
    if(!e) return null;
    const r = Math.random();
    let intent = null;
    if(r < 0.70){
      intent = { type:"attack", icon:"🗡️", label:"Attack" };
    } else if(r < 0.90){
      intent = { type:"block", icon:"🛡️", label:"Block" };
    } else {
      intent = { type:"poison", icon:"☠️", label:"Poison" };
    }
    e.intent = intent;
    return intent;
  }

  function applyEnemyIntent(){
    const p = state.player;
    const e = state.enemy;
    if(!p || !e) return;
    const intent = e.intent || rollEnemyIntent();
    if(!intent) return;

    if(intent.type === "block"){
      e.guard = 1;
      toast("Fienden förbereder block!");
      float(ui.floatE, "BLOCK", "blue", true);
      // no damage this turn when blocking: treat as a defensive action
      return { didAttack:false };
    }

    if(intent.type === "poison"){
      // Poison strike (small dmg + dot)
      const ds = derivedStats(p);
      let dmg = irnd(e.atk[0], e.atk[1]);
      dmg = Math.max(1, dmg - Math.floor(ds.def/8));
      p.hp = Math.max(0, p.hp - dmg);
      float(ui.floatP, `-${dmg}`, "red");
      const per = Math.max(1, Math.round(2 + (e.level||1)/2));
      p.dot = { name:"Poison", icon:"☠️", perTurn: per, turns: 3 };
      toast(`☠️ Poison: -${per}×3`);
      combatPush(`Fiende: Poison → ${dmg} dmg + DOT`);
      playSfx("enemy");
      return { didAttack:true };
    }

    return { didAttack:true }; // normal attack happens in enemyAttack()
  }

  function tickPlayerDot(){
    const p = state.player;
    if(!p.dot) return;
    p.dot.turns -= 1;
    const dmg = p.dot.perTurn;
    p.hp = Math.max(0, p.hp - dmg);
    float(ui.floatP, `-${dmg}`, "purple", true);
    toast(`${p.dot.icon||"☠️"} ${p.dot.name||"Poison"}: -${dmg}`);
    if(p.dot.turns <= 0) p.dot = null;
  }
function enemyAttack(){
    const p = state.player;
    const e = state.enemy;
    if(state.mode === MODES.TRAINING) return;
    const ds = derivedStats(p);

    // dead/ended guards
    if(!e || e.hp <= 0 || state.fightEnded) return;

    // Execute intent (may block or poison instead of normal attack)
    const intent = e.intent || rollEnemyIntent();
    if(intent){
      if(intent.type === "block"){
        applyEnemyIntent();
        rollEnemyIntent();
        renderAll();
        return;
      }
      if(intent.type === "poison"){
        applyEnemyIntent();
        rollEnemyIntent();
        renderAll();
        return;
      }
    }

    let dmg = irnd(e.atk[0], e.atk[1]);
    dmg = Math.max(1, dmg - Math.floor(ds.def/6));

    // resist buff reduces dmg
    if(p.buff && p.buff.kind === "resist"){
      dmg = Math.max(1, Math.round(dmg * 0.82));
    }

    // shield absorbs
    if(p.shield > 0){
      const block = Math.min(p.shield, dmg);
      p.shield -= block;
      dmg -= block;
      if(block>0) float(ui.floatP, `-${block}`, "blue", true);
    }

    if(dmg>0){
      p.hp = Math.max(0, p.hp - dmg);
      float(ui.floatP, `-${dmg}`, "red");
      toast(`Fienden slår: -${dmg}`);
      combatPush(`Fiende: ${e.name} → ${dmg} dmg`);
      playSfx("enemy");
    } else {
      toast("Din sköld stoppar slaget!");
      combatPush(`Fiende: ${e.name} → BLOCK`);
      float(ui.floatP, "BLOCK", "blue", true);
    }
  }

  function calcElementMultiplier(attackElement){
    const e = state.enemy;
    if(attackElement === e.resist) return 0.75;
    return 1.0;
  }

  function playerCast(){
    const p = state.player;
    const e = state.enemy;

    if(state.pendingRewards){
      toast("Välj en belöning först.");
      return;
    }
    if(state.pendingLevelUp){
      toast("Välj en uppgradering först.");
      return;
    }
    if(state.turnLock){
      return;
    }

    // start of your turn: tick any player DoT
    tickPlayerDot();
    if(p.hp <= 0){
      toast("Du föll!");
      float(ui.floatP, "KO", "red", true);
      return;
    }
    if(state.nextReady){
      toast("Tryck 'Nästa fiende' för att fortsätta.");
      return;
    }
    if(!e) return;

    // If enemy is already dead, trigger rewards and block further casts
    if(e.hp <= 0){
      checkEnemyDead("guard");
      toast("Fienden är besegrad. Välj belöning.");
      return;
    }

    if(p.hp <= 0){
      toast("Du föll. Startar ny fight…");
      nextFight(true);
      return;
    }

    // read words
    const unlocked = unlockedSlots(p.level);
    let raw = (ui.input.value || "").trim().toUpperCase();
    raw = raw.replace(/[^A-ZÅÄÖ\s]/g, "");
    const parts = raw.split(/\s+/).filter(Boolean).slice(0, unlocked);
    // Require at least one typed word
    if(parts.length === 0){
      toast("Skriv ett ord först.");
      return;
    }

    // Keep a snapshot of saved words BEFORE auto-saving (used for discovery)
    const prevSavedSet = new Set((p.savedWords||[]).map(w => String(w||"").toUpperCase()));

    // Auto-save typed words so your latest cast becomes your saved words
    for(let i=0; i<Math.min(parts.length, 3); i++){
      if(parts[i]){
        p.savedWords[i] = parts[i];
        const id = ensureWordInBook(parts[i]);
        const wb = getWordById(id);
        if(wb) wb.revealed = true;
      }
    }
    ensureAttackSlots();

    const cost = manaCostFor(parts.length);
    let weakMode = false;
    if(p.mana < cost){
      weakMode = true;
      toast("Inte nog mana! Svag attack.");
      float(ui.floatP, "NO MANA", "blue", true);
    } else {
      p.mana -= cost;
    }

    // discovery: if any word not in saved set, add discovery
    const savedSet = prevSavedSet;
    for(const w of parts){
      if(!savedSet.has(w)){
        p.discovery = clamp(p.discovery + 18, 0, 100);
      }
    }

    // roles mapping: word1 attack, word2 dot, word3 buff
    const main = wordProps(parts[0], 0, p.seed);
    const dot = (parts[1] ? wordProps(parts[1], 1, p.seed) : null);
    const buff = (parts[2] ? wordProps(parts[2], 2, p.seed) : null);

    const ds = derivedStats(p);

    // damage
    let dmg = ds.atk + main.power;
    dmg = Math.round(dmg * (1 + (p.bonusDmg||0)));
    dmg = Math.round(dmg * calcElementMultiplier(main.element));
    // weapon element bonus
    if(p.equip.weapon && p.equip.weapon.elem === main.element) dmg += 4;

    // weak mode reduces
    if(weakMode) dmg = Math.max(1, Math.round(dmg * 0.35));

    // crit
    const isCrit = Math.random() < ds.crit;
    if(isCrit) dmg = Math.round(dmg * 1.6);

    // apply
    dmg = Math.max(1, dmg - e.def);
    e.hp = Math.max(0, e.hp - dmg);
    state.turnLock = false;
    if(checkEnemyDead("hit")) { renderAll(); return; }
    float(ui.floatE, `${dmg}!`, "red");
    toast(`${main.icon} ${main.word} hits for ${dmg}${isCrit ? " (CRIT!)" : ""}`);

    // apply dot if unlocked and provided and hit
    if(dot && unlocked >= 2){
      // if enemy resist matches dot element, reduce dot
      const mult = calcElementMultiplier(dot.element);
      e.dot = { ...dot.dot, perTurn: Math.max(1, Math.round(dot.perTurn * mult)), turns: dot.turns };
      float(ui.floatE, `${dot.dot.name}`, "green", true);
    }

    // apply buff if unlocked and provided
    if(buff && unlocked >= 3){
      const kind = buff.buff.kind;
      if(kind === "shield"){
        const shield = Math.round(buff.magnitude * 1.6);
        p.shield = Math.max(p.shield, shield);
        p.buff = { kind, magnitude: shield, turns: buff.turns };
        float(ui.floatP, `SHIELD`, "blue", true);
      } else {
        p.buff = { kind, magnitude: buff.magnitude, turns: buff.turns };
        float(ui.floatP, `${buff.buff.name}`, "gold", true);
      }
    }

    // tick DOT immediately (small)
    if(e.dot) { /* DOT ticks on enemy turn */ }

    // win check
    if(checkEnemyDead("hit")) return;

    // enemy turn: dot tick first, then enemy attack
    setTimeout(() => {
      // buffs tick (regen etc) at start of enemy turn
      applyBuffTick();
      applyDotTick();
      if(checkEnemyDead("dot")) return;
      enemyAttack();
      // lose check
      if(p.hp <= 0){
        toast("Du föll!");
        float(ui.floatP, "KO", "red", true);
      }
      renderAll();
    }, 2000);

    state.lastCast = parts.join(" ");
    renderAll();
  }

  function winFight(){
    const p = state.player;
    const e = state.enemy;
    if(!p || !e) return;
    if(state.pendingRewards) return;
    state.fightEnded = true;

    const xpGain = Math.max(4, Math.round(6 + (e.isBoss?6:0)));
    let levelsGained = 0;
    p.xp += xpGain;

    // Cumulative XP: never reset XP on level-up.
    while(p.xp >= xpForLevel((p.level||1) + 1)){
      p.level += 1;
      levelsGained += 1;
      // Small refill on each level gained (stats points handle growth)
      p.hp = Math.min(p.hpMax, p.hp + 10);
      p.mana = Math.min(p.manaMax, p.mana + 2);
    }
    p.xpMax = xpForLevel((p.level||1) + 1);

    if(state.mode === MODES.ADVENTURE && state.modeRun){
      state.modeRun.cleared = (state.modeRun.cleared||0) + 1;
      state.score = state.modeRun.cleared;
    }
    if(state.mode === MODES.ARENA && state.modeRun){
      state.modeRun.streak += 1;
      state.modeRun.fightsInWave += 1;
      state.modeRun.bestStreak = Math.max(state.modeRun.bestStreak||0, state.modeRun.streak);
      if(state.modeRun.fightsInWave >= 3){
        state.modeRun.wave += 1;
        state.modeRun.fightsInWave = 0;
      }
      state.score = state.modeRun.bestStreak;
    }

    combatPush(`Du vinner striden (+${xpGain} XP)`);
    journalNow(`Fienden är besegrad!`);

    // Rewards ONLY when leveling up
    state.pendingRewards = null;
    state.deferredRewards = null;

    if(levelsGained > 0){
      state.deferredRewards = makeRewards(5);
      showLevelUp(levelsGained);
      renderAll();
      return;
    }

    // No level-up: go directly to next fight
    state.nextReady = true;
    state.lastReward = "";
    renderAll();
  }

  function nextFight(){
    state.pendingRewards = null;
    state.pendingWord = null;
    state.fightEnded = false;
    state.nextReady = false;
    state.lastReward = "";

    if(state.mode === MODES.ADVENTURE && state.modeRun){
      if(state.modeRun.room > state.modeRun.roomsTotal){
        finishModeRun();
        return;
      }
      state.enemy = makeModeEnemy();
      journalNow(`Rum ${state.modeRun.room}/${state.modeRun.roomsTotal}${state.enemy.isBoss?" • Boss!":""}`);
    } else if(state.mode === MODES.ARENA && state.modeRun){
      state.enemy = makeModeEnemy();
      journalNow(`Arena • Våg ${state.modeRun.wave} • Streak ${state.modeRun.streak}`);
    } else if(state.mode === MODES.TRAINING && state.modeRun){
      state.enemy = makeTrainingDummy();
      state.modeRun.startedAt = nowMs();
      state.modeRun.dmgTotal = 0;
      state.modeRun.casts = 0;
      journalNow(`Träning: DPS fönster 30 sek.`);
    } else {
      state.enemy = makeEnemy();
    }

    // passive: start shield from upgrades
    const p = state.player;
    if(p && (p.startShield||0) > 0){
      p.shield = Math.max(p.shield||0, p.startShield);
    }
    renderAll();
  }

  // events
  ui.attack.addEventListener("click", playerCast);
  ui.input.addEventListener("keydown", (ev)=>{ if(ev.key==="Enter"){ ev.preventDefault(); playerCast(); }});


  ui.input.addEventListener("input", ()=>{
    const hasWord = (ui.input.value || "").trim().length > 0;
    if(ui.attack) ui.attack.disabled = !hasWord;
    const dockBtn = document.getElementById("dockAttackBtn");
    if(dockBtn) dockBtn.disabled = !hasWord;
  });
  // Spell preview UI removed (save buttons moved to left panel)

  ui.pvSave0.addEventListener("click", () => saveTypedWord(0));
  ui.pvSave1.addEventListener("click", () => saveTypedWord(1));
  ui.pvSave2.addEventListener("click", () => saveTypedWord(2));


  ui.btnNew.addEventListener("click", newRun);
  ui.btnSave.addEventListener("click", save);
  ui.btnSave2.addEventListener("click", save);
  ui.btnLoad.addEventListener("click", load);
  ui.btnHelp.addEventListener("click", () => {
    openModal("Help", `
      <div class="muted" style="font-size:16px; line-height:1.4">
        <b>Så funkar det:</b><br/>
        • Skriv 1 ord och tryck <b>Attack</b>.<br/>
        • På <b>Level 2</b> kan du skriva <b>2 ord</b> (Attack + DoT).<br/>
        • På <b>Level 4</b> kan du skriva <b>3 ord</b> (Attack + DoT + Buff).<br/>
        • Samma ord blir olika för olika spelare (din run har en egen <b>seed</b>).<br/>
        • Chansa på nya ord för att fylla <b>Discovery Meter</b>.<br/>
      </div>
    `);
  });


  // modes (main + sidebar)
  if(ui.btnModes) ui.btnModes.addEventListener("click", showModeScreen);
  if(ui.btnModeAdventure) ui.btnModeAdventure.addEventListener("click", ()=>{ startMode(MODES.ADVENTURE); hideModeScreen(); renderAll(); });
  if(ui.btnModeArena) ui.btnModeArena.addEventListener("click", ()=>{ startMode(MODES.ARENA); hideModeScreen(); renderAll(); });
  if(ui.btnModeTraining) ui.btnModeTraining.addEventListener("click", ()=>{ startMode(MODES.TRAINING); hideModeScreen(); renderAll(); });

  if(ui.btnSideAdventure) ui.btnSideAdventure.addEventListener("click", ()=>{ startMode(MODES.ADVENTURE); hideModeScreen(); renderAll(); });
  if(ui.btnSideArena) ui.btnSideArena.addEventListener("click", ()=>{ startMode(MODES.ARENA); hideModeScreen(); renderAll(); });
  if(ui.btnSideTraining) ui.btnSideTraining.addEventListener("click", ()=>{ startMode(MODES.TRAINING); hideModeScreen(); renderAll(); });

  ui.btnInv.addEventListener("click", showInventory);
  ui.btnInv2.addEventListener("click", showInventory);
  ui.btnEquip.addEventListener("click", showEquipment);

  ui.modalClose.addEventListener("click", closeModal);
  ui.modal.addEventListener("click", (ev)=>{ if(ev.target === ui.modal) closeModal(); });

  ui.wordModalClose.addEventListener("click", () => { closeWordModal(); });
  ui.btnSkipWord.addEventListener("click", () => {
    toast("Du skippade ordet.");
    state.pendingWord = null;
    state.pendingRewards = null;
    closeWordModal();
    state.nextReady = true;
    state.lastReward = "Du skippade ordet.";
    renderAll();
  });
  ui.wordModal.addEventListener("click", (ev)=>{ if(ev.target === ui.wordModal) closeWordModal(); });

  // time ticker
  setInterval(() => {
    ui.time.textContent = fmtTime(nowMs() - state.player.startAt);
  }, 1000);

  // boot
  newRun();

  // =========================
  // Attack Slots (Tap/Spark/Arc/Burst/Nova/Big Plus) + WordBook
  // =========================

  function tierForWord(seed, word){
    const h = hash32(`${seed}|tier|${(word||"").toUpperCase()}`);
    return 1 + (h % 5); // 1..5
  }

  function ensureWordInBook(wordStr){
    const p = state.player;
    if(!p) return null;
    p.wordBook = Array.isArray(p.wordBook) ? p.wordBook : [];
    const name = (wordStr||"").trim().toUpperCase().slice(0,12);
    if(!name) return null;
    let found = p.wordBook.find(w => w && w.name === name);
    if(found) return found.id;

    const props = wordProps(name, 0, p.seed);
    const obj = {
      id: `w_${hash32(`${p.seed}|wb|${name}`)}`,
      name,
      element: props.element,
      attack: props.power,
      tier: tierForWord(p.seed, name),
      revealed: false
    };
    p.wordBook.push(obj);
    return obj.id;
  }

  function ensureWordBookBaseline(){
    const p = state.player;
    if(!p) return;
    p.wordBook = Array.isArray(p.wordBook) ? p.wordBook : [];
    // Ensure start words exist in book
    if(Array.isArray(p.savedWords)){
      for(const w of p.savedWords){
        const id = ensureWordInBook(w);
        // Saved words are already known, so mark them usable immediately.
        const wb = p.wordBook.find(x => x && x.id === id);
        if(wb) wb.revealed = true;
      }

    }
  }

    function generateFoundWordName(){
    const p = state.player;
    if(!p) return "ORD";
    p.wordBook = Array.isArray(p.wordBook) ? p.wordBook : [];
    const consonants = "BCDFGHJKLMNPRSTV";
    const vowels = "AEIOU";
    const mk = () => {
      const len = irnd(3, 6);
      let s = "";
      for(let i=0;i<len;i++){
        const useV = (i % 2 === 1);
        const src = useV ? vowels : consonants;
        s += src.charAt(irnd(0, src.length-1));
      }
      return s;
    };
    for(let tries=0; tries<40; tries++){
      const name = mk();
      if(!p.wordBook.find(w=>w && w.name === name)) return name;
    }
    const base = (START_WORDS && START_WORDS.length) ? START_WORDS[irnd(0, START_WORDS.length-1)].toUpperCase() : "ORD";
    return (base + String(irnd(0,9))).slice(0,12);
  }


function ensureAttackSlots(){
    if(!state.attackSlots){
      state.attackSlots = {
        tap:     { key:"tap", label:"Tap", rounds:0, unlocked:true,  cooldown:0, wordId:null },
        spark:   { key:"spark", label:"Spark", rounds:1, unlocked:true, cooldown:0, wordId:null },
        arc:     { key:"arc", label:"Arc", rounds:2, unlocked:true, cooldown:0, wordId:null },
        burst:   { key:"burst", label:"Burst", rounds:3, unlocked:true, cooldown:0, wordId:null },
        nova:    { key:"nova", label:"Nova", rounds:6, unlocked:false, cooldown:0, wordId:null },
        bigplus: { key:"bigplus", label:"Big Plus", rounds:10, unlocked:false, cooldown:0, wordId:null },
      };
    }

    // baseline: put first start word into Spark if empty
    ensureWordBookBaseline();
    const p2 = state.player;
    if(p2 && !state.attackSlots.spark.wordId){
      const first = (p2.wordBook && p2.wordBook[0]) ? p2.wordBook[0].id : null;
      state.attackSlots.spark.wordId = first;
    }
    if(state.attackSlots.arc.unlocked && !state.attackSlots.arc.wordId && state.player.wordBook?.[1]){
      state.attackSlots.arc.wordId = state.player.wordBook[1].id;
    }
    if(state.attackSlots.burst.unlocked && !state.attackSlots.burst.wordId && state.player.wordBook?.[2]){
      state.attackSlots.burst.wordId = state.player.wordBook[2].id;
    }
  }

  function getWordById(id){
    const p = state.player;
    if(!p || !id) return null;
    return (p.wordBook || []).find(w => w && w.id === id) || null;
  }
  function wordName(w){ return (w?.name || "").toUpperCase(); }
  function wordElement(w){ return w?.element || "—"; }
  function baseWordAtk(w){ return Number(w?.attack || 0); }
  function wordTier(w){ return Number(w?.tier || 1); }

  const ADV = { Fire:"Nature", Nature:"Storm", Storm:"Mist", Mist:"Light", Light:"Fire" };
  function isEffective(attElem, enemyResist){
    if(!attElem || !enemyResist) return false;
    return ADV[attElem] === enemyResist;
  }

  function tickCooldowns(){
    ensureAttackSlots();
    const s = state.attackSlots;
    for(const k in s){
      if(s[k].cooldown > 0) s[k].cooldown -= 1;
    }
  }

  function setCooldown(slot){
    if(slot.rounds <= 0){ slot.cooldown = 0; return; }
    slot.cooldown = slot.rounds + 1; // makes (1 round) skip next turn
  }

  function assignWordToSlot(wordId, slotKey){
  ensureAttackSlots();
  // Saved words can be assigned to Tap (basic), Arc or Burst
  if(slotKey !== "tap" && slotKey !== "arc" && slotKey !== "burst"){
    toast("Sparade ord kan läggas på Tap, Arc eller Burst.");
    return false;
  }
  const slot = state.attackSlots[slotKey];
  if(!slot) return false;
  if(!slot.unlocked){
    toast("Den attacken är låst ännu.");
    return false;
  }
  slot.wordId = wordId;
  // If you can place it in a slot, you already "know" it.
  const wb = getWordById(wordId);
  if(wb) wb.revealed = true;
  toast(`Satt ${getWordById(wordId)?.name || "ord"} på ${slot.label}.`);
  renderAll();
  return true;
}

  function castFromSlot(slotKey){
    const p = state.player;
    const e = state.enemy;
    ensureAttackSlots();

    if(state.pendingRewards){ toast("Välj en belöning först."); return; }
    if(state.pendingLevelUp){ toast("Välj en uppgradering först."); return; }
    if(state.nextReady){ toast("Tryck 'Nästa fiende' för att fortsätta."); return; }
    if(!e) return;

    // start of player turn: tick cooldowns + player DoT
    tickCooldowns();
    tickPlayerDot();
    if(p.hp <= 0){ toast("Du föll!"); float(ui.floatP, "KO", "red", true); return; }

    const slot = state.attackSlots[slotKey];
    if(!slot){ return; }
    if(!slot.unlocked){ toast("Den attacken är låst ännu."); return; }
    if(slot.cooldown > 0){ toast(`${slot.label} är på cooldown (${slot.cooldown}).`); return; }

    // guard dead enemy
    if(e.hp <= 0){
      checkEnemyDead("guard-slot");
      toast("Fienden är besegrad. Välj belöning.");
      return;
    }

    const lvl = p.level || 1;

    // Mana cost rules
    let cost = 0;
    if(slotKey === "spark") cost = 1;
    if(slotKey === "nova") cost = 3;
    if(slotKey === "bigplus") cost = 10;

    if(cost > 0 && p.mana < cost){
      toast("Inte tillräckligt med mana.");
      return;
    }

    // Word requirements
    const w = getWordById(slot.wordId);
    // Arc/Burst require a slotted (revealed) word
    if(slotKey === "arc" || slotKey === "burst" || slotKey === "nova" || slotKey === "bigplus"){
      if(!w){ toast("Välj ett sparat ord och slotta det på attacken först."); return; }
    if((slotKey === "arc" || slotKey === "burst") && !w.revealed){
        toast("Ordet måste avslöjas (Spark) först.");
        return;
      }
    }
    
    // apply mana cost
    if(cost > 0){ p.mana = Math.max(0, p.mana - cost); }

    // compute dmg
    let dmg = 0;
    let elem = null;

    if(slotKey === "tap"){
      // Tap can optionally use a slotted word, but it is ALWAYS basic:
      // only base word damage + player ATK (no element, no tiers)
      const base = w ? baseWordAtk(w) : (5 + lvl);
      dmg = Math.round(base + (p.baseAtk || 0));
      elem = "Physical";
    } else if(slotKey === "spark"){
      dmg = 5 + lvl;
      // Spark finds a new word. The word is saved as "latest/quick", but Spark button must never preview it.
      const foundName = generateFoundWordName();
      const foundId = ensureWordInBook(foundName);
      const found = getWordById(foundId);
      if(found){
        found.revealed = true;
        state.lastFoundWordId = found.id; // quick-slot source
        // Do NOT attach the word to the Spark slot (prevents showing it on the button)
        state.attackSlots.spark.wordId = null;
        elem = "Mystic";
        toast(`✨ Avslöjade ett nytt ord!`);
      } else {
        elem = "Mystic";
      }
    } else if(slotKey === "arc" || slotKey === "burst"){
      const tier = clamp(wordTier(w), 1, 4);
      const base = baseWordAtk(w);
      dmg = slotKey === "burst"
        ? Math.round(base * 1.25 + (tier-1)*2)
        : Math.round(base + (tier-1)*2);
      elem = wordElement(w);

      // Arc/Burst: mana gain on cast
      p.mana = Math.min(p.manaMax, p.mana + 1);

      // Tier 2+: crit enabled
      const ds = derivedStats(p);
      let isCrit = false;
      if(tier >= 2){
        isCrit = Math.random() < (ds.crit || 0);
        if(isCrit) dmg = Math.round(dmg * 1.6);
      }

      // Apply def later with the main flow. After damage is applied, add tier effects:
      slot.__tier = tier;
      slot.__isCrit = isCrit;
    } else if(slotKey === "nova"){
      dmg = w ? Math.round(baseWordAtk(w) * 1.6 + 10) : (10 + lvl);
      elem = w ? wordElement(w) : "Mystic";
    } else if(slotKey === "bigplus"){
      dmg = w ? Math.round(baseWordAtk(w) * 2.0 + 20) : (20 + lvl);
      elem = w ? wordElement(w) : "Mythic";
    }// Resist reduces damage slightly (simple rule)
    if(elem && e.resist && elem === e.resist){
      dmg = Math.max(1, Math.round(dmg * 0.78));
    }

    // apply def
    dmg = Math.max(1, dmg - (e.def || 0));
    // enemy guard reduces incoming damage once
    if(e.guard > 0){
      dmg = Math.max(1, Math.round(dmg * 0.70));
      e.guard = 0;
      float(ui.floatE, "BLOCK", "blue", true);
    }
    e.hp = Math.max(0, e.hp - dmg);

    combatPush(`${slot.label} träffar för ${dmg} dmg`);
    float(ui.floatE, `-${dmg}`, "red", true);
    // Tier effects for Arc/Burst (based on word tier)
    if(slotKey === "arc" || slotKey === "burst"){
      const tier = slot.__tier || 1;

      // Crit reaction (visual) handled by UI layer; keep a marker for combat log
      if(slot.__isCrit){
        combatPush("CRIT!");
      }

      // Tier 3+: apply DoT from the same word (role 1)
      if(tier >= 3){
        const props = wordProps(wordName(w), 1, p.seed);
        const mult = (elem && e.resist && elem === e.resist) ? 0.78 : 1;
        e.dot = {
          name: props.dot.name,
          icon: props.dot.icon,
          element: props.element,
          perTurn: Math.max(1, Math.round(props.perTurn * mult)),
          turns: props.turns
        };
        toast(`${props.dot.icon} DoT: ${e.dot.perTurn}×${e.dot.turns}`);
      }

      // Tier 4: Leech heals you for 10% of damage dealt
      if(tier >= 4){
        const heal = Math.max(1, Math.round(dmg * 0.10));
        p.hp = clamp(p.hp + heal, 0, p.hpMax);
        float(ui.floatP, `+${heal}`, "green", true);
        toast(`💚 Leech: +${heal} HP`);
      }

      // cleanup temp markers
      delete slot.__tier;
      delete slot.__isCrit;
    }


    // set cooldown
    setCooldown(slot);

    if(checkEnemyDead("slot")) { renderAll(); return; }

    // enemy retaliates after a delay (not in training)
    if(state.mode !== MODES.TRAINING){
      const enemyRef = state.enemy;
      setTimeout(()=>{
        // Guard: enemy might have died, fight might have ended, or a reward/level-up modal might be open.
        if(!enemyRef || enemyRef.hp <= 0) return;
        if(state.fightEnded || state.pendingRewards || state.pendingLevelUp) return;
        // enemy turn start: buffs + DoT tick, then attack
        applyBuffTick();
        applyDotTick();
        if(state.enemy && state.enemy.hp > 0){
          enemyAttack();
        }
        renderAll();
      }, 2000);
    }
    renderAll();
  }

  
  function restTurn(){
    const p = state.player;
    const e = state.enemy;
    if(state.pendingRewards){ toast("Välj en belöning först."); return; }
    if(state.pendingLevelUp){ toast("Välj en uppgradering först."); return; }
    if(state.nextReady){ toast("Tryck 'Nästa fiende' för att fortsätta."); return; }
    if(!e) return;

    // start of player turn: tick cooldowns
    tickCooldowns();

    if(e.hp <= 0){
      checkEnemyDead("rest-guard");
      toast("Fienden är besegrad. Välj belöning.");
      return;
    }

    combatPush("Du vilar… fienden får en gratis attack.");
    enemyAttack();

    if(p.hp > 0){
      const beforeHp = p.hp;
      const beforeMana = p.mana;
      p.hp = Math.min(p.hpMax, p.hp + 30);
      p.mana = Math.min(p.manaMax, p.mana + 10);
      const gainedHp = p.hp - beforeHp;
      const gainedMana = p.mana - beforeMana;
      toast(`Du vaknar: +${gainedHp} HP, +${gainedMana} mana`);
      combatPush(`Vila: +${gainedHp} HP, +${gainedMana} mana`);
      float(ui.floatP, `+${gainedHp}`, "green", true);
    }

    renderAll();
  }

function playerCastFromInput(){
    // uses existing typed casting system
    try{ playerCast(); }catch(e){ console.error(e); toast("Något gick fel i cast."); }
  }

  // Expose API for blocks
  window.__GAMEONE__ = window.__GAMEONE__ || {};
  window.__GAMEONE__.state = state;
  window.__GAMEONE__.ui = ui;
  window.__GAMEONE__.ensureAttackSlots = ensureAttackSlots;
  window.__GAMEONE__.getWordById = getWordById;
  window.__GAMEONE__.wordName = wordName;
  window.__GAMEONE__.wordElement = wordElement;
  window.__GAMEONE__.baseWordAtk = baseWordAtk;
  window.__GAMEONE__.wordTier = wordTier;
  window.__GAMEONE__.isEffective = isEffective;
  window.__GAMEONE__.assignWordToSlot = assignWordToSlot;
  window.__GAMEONE__.castFromSlot = castFromSlot;
  window.__GAMEONE__.playerCastFromInput = playerCastFromInput;
  window.__GAMEONE__.restTurn = restTurn;

})();