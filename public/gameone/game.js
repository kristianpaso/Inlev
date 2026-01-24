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

    hp: $("#ui-hp"),
    hpmax: $("#ui-hpmax"),
    mana: $("#ui-mana"),
    manamax: $("#ui-manamax"),

    hpbar: $("#ui-hpbar"),
    manabar: $("#ui-manabar"),
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

    spellPreview: $("#ui-spellpreview"),
    pvWord0: $("#pv-word-0"),
    pvElem0: $("#pv-elem-0"),
    pvDmg0: $("#pv-dmg-0"),
    pvSub0: $("#pv-sub-0"),
    pvSave0: $("#btn-saveword-0"),

    pvWord1: $("#pv-word-1"),
    pvElem1: $("#pv-elem-1"),
    pvDmg1: $("#pv-dmg-1"),
    pvSub1: $("#pv-sub-1"),
    pvSave1: $("#btn-saveword-1"),

    pvWord2: $("#pv-word-2"),
    pvElem2: $("#pv-elem-2"),
    pvDmg2: $("#pv-dmg-2"),
    pvSub2: $("#pv-sub-2"),
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
      journalNow(`Träning: skriv ord och se skada. DPS fönster 30 sek.`);
    } else {
      state.enemy = makeModeEnemy();
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
    // weapon
    () => ({ type:"weapon", name:`Sunsteel Sword +${irnd(1,4)}`, icon:"🗡️", atk: irnd(4,9), elem: "Fire", crit: irnd(0,3) }),
    () => ({ type:"weapon", name:`Frostfang Dagger +${irnd(1,4)}`, icon:"🗡️", atk: irnd(3,8), elem: "Ice", crit: irnd(1,4) }),
    () => ({ type:"weapon", name:`Gale Axe +${irnd(1,4)}`, icon:"🪓", atk: irnd(5,10), elem: "Storm", crit: irnd(0,2) }),
    // helm
    () => ({ type:"helm", name:`Traveler's Cap`, icon:"🪖", def: irnd(2,5), hp: irnd(0,8) }),
    () => ({ type:"helm", name:`Mystic Hood`, icon:"🧙", def: irnd(1,3), mana: irnd(1,3), crit: irnd(0,2) }),
    // armor
    () => ({ type:"armor", name:`Explorer's Vest`, icon:"🥋", def: irnd(3,6), hp: irnd(8,18) }),
    () => ({ type:"armor", name:`Runed Mail`, icon:"🛡️", def: irnd(4,8), hp: irnd(6,14), resist: pick(ELEMENTS, irnd(0,9999)) }),
    // potion
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
      xpMax: 100,
      startAt: nowMs(),
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
      inventory: [],
      equip: { weapon:null, helm:null, armor:null },
      buff: null,
      shield: 0,
      discovery: 0, // 0..100
    };
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

    const eq = [p.equip.weapon, p.equip.helm, p.equip.armor].filter(Boolean);
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
    p.level = Number(p.level||1);
    p.xp = Number(p.xp||0);
    p.xpMax = Number(p.xpMax||100);
    p.hpMax = Number(p.hpMax||85);
    p.hp = clamp(Number(p.hp||p.hpMax), 0, p.hpMax);
    p.manaMax = Number(p.manaMax||8);
    p.mana = clamp(Number(p.mana||p.manaMax), 0, p.manaMax);
    p.baseAtk = Number(p.baseAtk||20);
    p.baseDef = Number(p.baseDef||14);
    p.baseCrit = Number(p.baseCrit||0.07);
    p.lootBonus = Number(p.lootBonus||0);
    p.discovery = clamp(Number(p.discovery||0), 0, 100);
    p.inventory = Array.isArray(p.inventory)? p.inventory : [];
    p.equip = p.equip || { weapon:null, helm:null, armor:null };
    p.buff = p.buff || null;
    p.shield = Number(p.shield||0);

    const enemy = s.enemy?.id ? s.enemy : makeEnemy(p.level);
    enemy.hpMax = Number(enemy.hpMax||enemy.hp||70);
    enemy.hp = clamp(Number(enemy.hp||enemy.hpMax), 0, enemy.hpMax);
    enemy.dot = enemy.dot || null;

    return {
      player: p,
      enemy,
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

    ui.hp.textContent = Math.floor(p.hp);
    ui.hpmax.textContent = p.hpMax;
    ui.mana.textContent = Math.floor(p.mana);
    ui.manamax.textContent = p.manaMax;

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

    ui.hpbar.style.width = `${clamp((p.hp/p.hpMax)*100,0,100)}%`;
    ui.hpbarcenter.style.width = `${clamp((p.hp/p.hpMax)*100,0,100)}%`;
    ui.manabar.style.width = `${clamp((p.mana/p.manaMax)*100,0,100)}%`;

    if(ui.hpbarHud) ui.hpbarHud.style.width = ui.hpbar.style.width;
    if(ui.manabarHud) ui.manabarHud.style.width = ui.manabar.style.width;

    ui.enemyName.textContent = e.name;
    ui.enemyResist.textContent = `${RESIST_ICON[e.resist] || ""} ${e.resist}`;
    ui.ehp.textContent = Math.floor(e.hp);
    ui.ehpmax.textContent = e.hpMax;
    ui.ehpbar.style.width = `${clamp((e.hp/e.hpMax)*100,0,100)}%`;

    ui.enemySprite.src = (e.img || ui.enemySprite.src);
    ui.playerSprite.src = "./assets/player_f_0.png";

    ui.battletext.textContent = state.lastText;

    renderWords();
    renderInventoryLeft();
    renderEquip();
    renderRewards();
    if(state.pendingLevelUp) renderLevelUp();
    renderDiscovery();
    renderSpellPreview();
    renderJournal();
    renderCombat();
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

  function renderSpellPreview(){
    const p = state.player;
    const e = state.enemy;
    const ds = derivedStats(p);
    const unlocked = unlockedSlots(p.level);
    const parts = getCastParts();

    // role 0 (attack)
    const w0 = parts[0] || "";
    if(w0){
      const props0 = wordProps(w0, 0, p.seed);
      const est = estimateMainDamage(props0, ds, e, p);
      ui.pvWord0.textContent = props0.word;
      ui.pvElem0.textContent = `${RESIST_ICON[props0.element] || "✨"} ${props0.element}`;
      ui.pvDmg0.textContent = est ? `DMG ${est.dmg} • Crit ${est.critChance}%` : "DMG —";
      const resistNote = (props0.element === e.resist) ? `Motstånd: ${e.resist} (−25%)` : `Svaghet? Testa andra element.`;
      ui.pvSub0.textContent = `${resistNote}`;
      ui.pvSave0.disabled = false;
    }else{
      ui.pvWord0.textContent = "Skriv ett ord…";
      ui.pvElem0.textContent = "—";
      ui.pvDmg0.textContent = "DMG —";
      ui.pvSub0.textContent = "Element och skada visas här.";
      ui.pvSave0.disabled = true;
    }

    // role 1 (dot)
    const card1 = ui.pvSave1.closest(".spcard");
    if(unlocked >= 2){
      card1.classList.remove("locked");
      const w1 = parts[1] || "";
      if(w1){
        const props1 = wordProps(w1, 1, p.seed);
        const mult = calcElementMultiplier(props1.element);
        const per = Math.max(1, Math.round(props1.perTurn * mult));
        ui.pvWord1.textContent = props1.word;
        ui.pvElem1.textContent = `${RESIST_ICON[props1.element] || "✨"} ${props1.element}`;
        ui.pvDmg1.textContent = `${props1.dot.icon} ${props1.dot.name}: ${per}×${props1.turns}`;
        ui.pvSub1.textContent = (props1.element === e.resist) ? `Motstånd: ${e.resist} (DoT sänks)` : "DoT triggar när Attack träffar.";
        ui.pvSave1.disabled = false;
      }else{
        ui.pvWord1.textContent = "Skriv ord 2…";
        ui.pvElem1.textContent = "—";
        ui.pvDmg1.textContent = "DOT —";
        ui.pvSub1.textContent = "Ex: Gift / Bränn / Frost.";
        ui.pvSave1.disabled = true;
      }
    }else{
      card1.classList.add("locked");
      ui.pvWord1.textContent = "Låses upp på Level 2";
      ui.pvElem1.textContent = "—";
      ui.pvDmg1.textContent = "DOT —";
      ui.pvSub1.textContent = "Du får kasta 2 ord på Level 2.";
      ui.pvSave1.disabled = true;
    }

    // role 2 (buff)
    const card2 = ui.pvSave2.closest(".spcard");
    if(unlocked >= 3){
      card2.classList.remove("locked");
      const w2 = parts[2] || "";
      if(w2){
        const props2 = wordProps(w2, 2, p.seed);
        ui.pvWord2.textContent = props2.word;
        ui.pvElem2.textContent = `${RESIST_ICON[props2.element] || "✨"} ${props2.element}`;
        ui.pvDmg2.textContent = `${props2.buff.icon} ${props2.buff.name}: +${props2.magnitude} (${props2.turns}t)`;
        ui.pvSub2.textContent = "Buffen gäller dig (sköld/regen/rarity/resist…).";
        ui.pvSave2.disabled = false;
      }else{
        ui.pvWord2.textContent = "Skriv ord 3…";
        ui.pvElem2.textContent = "—";
        ui.pvDmg2.textContent = "BUFF —";
        ui.pvSub2.textContent = "Ex: Sköld / Regen / Rarity.";
        ui.pvSave2.disabled = true;
      }
    }else{
      card2.classList.add("locked");
      ui.pvWord2.textContent = "Låses upp på Level 4";
      ui.pvElem2.textContent = "—";
      ui.pvDmg2.textContent = "BUFF —";
      ui.pvSub2.textContent = "Du får kasta 3 ord på Level 4.";
      ui.pvSave2.disabled = true;
    }
  }

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
    p.savedWords[role] = w;
    toast(`Sparade ${w} som ${role===0?"Attack":role===1?"DoT":"Buff"}-ord.`);
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


function renderInventoryLeft(){
  const box = document.querySelector("#ui-inv-left");
  const eqBox = document.querySelector("#ui-eq-left");
  if(!box && !eqBox) return;
  const p = state.player || {};
  const inv = (p.inventory || []);
  const eq = (p.equip || {});
  if(eqBox){
    const parts = [];
    const slots = [
      ["weapon","🗡️","Vapen"],
      ["armor","🛡️","Rustning"],
      ["helm","🪖","Hjälm"],
      ["ring","💍","Ring"],
    ];
    for(const [k,ico,label] of slots){
      const it = eq[k];
      parts.push(`<div class="invrow"><div class="ico">${ico}</div><div class="txt"><b>${label}</b><div class="muted">${it? (it.name||it.title||"") : "–"}</div></div></div>`);
    }
    eqBox.innerHTML = parts.join("") || `<div class="muted">Ingen utrustning ännu.</div>`;
  }
  if(box){
    if(!inv.length){
      box.innerHTML = `<div class="muted">Tom ryggsäck.</div>`;
    }else{
      box.innerHTML = inv.slice(0,12).map((it,idx)=>(
        `<button class="invitem" data-idx="${idx}" type="button">
          <span class="ico">${it.icon||"🎒"}</span>
          <span class="name">${it.name||it.title||it.kind||"Item"}</span>
        </button>`
      )).join("");
      // open inventory modal on click
      box.querySelectorAll(".invitem").forEach(btn=>{
        btn.addEventListener("click", ()=>{ try{ openInventory(); }catch(e){} });
      });
    }
  }
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

  function renderEquip(){
    const p = state.player;
    const eq = p.equip;

    const rows = [
      { slot:"weapon", icon:"🗡️", label:"Weapon", item:eq.weapon },
      { slot:"helm", icon:"🪖", label:"Helm", item:eq.helm },
      { slot:"armor", icon:"🥋", label:"Armor", item:eq.armor },
    ];

    ui.equiplist.innerHTML = "";
    for(const r of rows){
      const el = document.createElement("div");
      el.className = "equipitem";
      const it = r.item;
      el.innerHTML = `
        <div class="equipicon">${r.icon}</div>
        <div class="equiptext">
          <b>${escapeHtml(it ? it.name : "Empty")}</b>
          <small>${escapeHtml(it ? itemDesc(it) : "Click rewards to equip items.")}</small>
        </div>
      `;
      ui.equiplist.appendChild(el);
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
    state.pendingLevelUp = { levelsLeft: levels, choices: pickUpgrades(3) };
    if(ui.levelupScreen){
      ui.levelupScreen.classList.add("show");
      ui.levelupScreen.setAttribute("aria-hidden","false");
    }
    renderLevelUp();
  }

  function hideLevelUp(){
    if(ui.levelupScreen){
      ui.levelupScreen.classList.remove("show");
      ui.levelupScreen.setAttribute("aria-hidden","true");
    }
  }

  function renderLevelUp(){
    if(!state.pendingLevelUp || !ui.levelupChoices) return;
    const p = state.player;
    const lvl = p?.level ?? 0;
    if(ui.levelupSub) ui.levelupSub.textContent = `Du är nu level ${lvl}. Välj 1 uppgradering.`;
    ui.levelupChoices.innerHTML = state.pendingLevelUp.choices.map(c => {
      const tags = (c.tags||[]).map(t=>`<span class=\"lu-tag\">${escapeHtml(t)}</span>`).join("");
      return `
        <button class=\"lu-choice\" type=\"button\" data-upg=\"${escapeHtml(c.id)}\">
          <div class=\"lu-title\">${escapeHtml(c.title)}</div>
          <div class=\"lu-desc\">${escapeHtml(c.desc)}</div>
          <div class=\"lu-tagrow\">${tags}</div>
        </button>
      `;
    }).join("");
    ui.levelupChoices.querySelectorAll("[data-upg]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-upg");
        applyUpgrade(id);
      });
    });
  }

  function applyUpgrade(id){
    const p = state.player;
    const u = UPGRADE_POOL.find(x=>x.id===id);
    if(p && u && typeof u.apply === "function"){
      u.apply(p);
      journalPush(`Uppgradering: ${u.title}`);
      combatPush(`UPGRADE: ${u.title}`);
      playSfx("attack");
    }
    state.pendingLevelUp.levelsLeft -= 1;
    if(state.pendingLevelUp.levelsLeft > 0){
      state.pendingLevelUp.choices = pickUpgrades(3);
      renderLevelUp();
      return;
    }
    state.pendingLevelUp = null;
    hideLevelUp();
    if(state.deferredRewards){
      state.pendingRewards = state.deferredRewards;
      state.deferredRewards = null;
      renderAll();
    } else {
      renderAll();
    }
  }

  function renderRewards(){
  // show/hide rewards modal
  if(ui.panelRewards){
    ui.panelRewards.classList.toggle('is-open', !!state.pendingRewards || !!state.nextReady);
  }
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
        return;
      }
      ui.rewards.innerHTML = `<div class="muted">Vinn en strid för att få belöningar.</div>`;
      return;
    }
    for(const r of state.pendingRewards){
      const div = document.createElement("div");
      div.className = "reward";
      div.innerHTML = `
        <div class="rewardicon">${r.icon}</div>
        <div class="rewardtext">
          <b>${escapeHtml(r.title)}</b>
          <small>${escapeHtml(r.desc)}</small>
        </div>
      `;
      div.addEventListener("click", () => claimReward(r));
      ui.rewards.appendChild(div);
    }
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
  try{ renderJournal(); }catch(e){}
  if(ui.journalNow) ui.journalNow.textContent = msg;
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
  el.style.left = `calc(50% + ${ox}px)`;
  el.style.top = `calc(50% + ${oy}px)`;
  layer.appendChild(el);
  setTimeout(()=>el.remove(), 1100);
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
}function itemDesc(it){
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
  function makeRewards(){
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

    return rewards.slice(0,3);
  }

  function claimReward(r){
    const p = state.player;
    if(!state.pendingRewards) return;

    if(r.kind === "word"){
      openWordModal(r.word);
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
    if(it.type === "weapon" && !p.equip.weapon) p.equip.weapon = it;
    if(it.type === "helm" && !p.equip.helm) p.equip.helm = it;
    if(it.type === "armor" && !p.equip.armor) p.equip.armor = it;
    // apply hp/mana bonuses by increasing max and current
    applyEquipDerived();
  }

  function applyEquipDerived(){
    const p = state.player;
    // recompute max hp/mana from equipment bonuses
    let hpBonus=0, manaBonus=0;
    for(const it of [p.equip.weapon, p.equip.helm, p.equip.armor].filter(Boolean)){
      hpBonus += it.hp || 0;
      manaBonus += it.mana || 0;
    }
    const baseHp = 85 + (p.level-1)*6;
    const baseMana = 8 + Math.floor((p.level-1)/2);
    const newHpMax = baseHp + hpBonus;
    const newManaMax = baseMana + manaBonus;

    // keep ratio-ish
    const hpPct = p.hp / p.hpMax;
    const manaPct = p.mana / p.manaMax;

    p.hpMax = newHpMax;
    p.manaMax = newManaMax;

    p.hp = clamp(Math.round(p.hpMax * hpPct), 1, p.hpMax);
    p.mana = clamp(Math.round(p.manaMax * manaPct), 0, p.manaMax);
  }

  // Word Scroll modal
  function openWordModal(word){
    const p = state.player;
    const role = 0; // preview as attack (role 0) since it is the main use
    const props = wordProps(word, role, p.seed);
    state.pendingWord = word;

    ui.newWordName.textContent = word;
    ui.newWordDesc.textContent = `Element: ${props.element} • Power: ${props.power}`;

    ui.replaceGrid.innerHTML = "";
    p.savedWords.forEach((w,i)=>{
      const pr = wordProps(w, i, p.seed);
      const btn = document.createElement("div");
      btn.className = "replacebtn";
      btn.innerHTML = `
        <div><b>Slot ${i+1}: ${escapeHtml(w)}</b><br/><small>${i===0?"Attack":i===1?"DoT":"Buff"} • ${pr.element}</small></div>
        <small>Replace</small>
      `;
      btn.addEventListener("click", ()=> {
        p.savedWords[i] = word;
        state.pendingWord = null;
        closeWordModal();
        toast(`Du lär dig ${word} och sparar den i slot ${i+1}.`);
        state.pendingRewards = null;
        nextFight();
      });
      ui.replaceGrid.appendChild(btn);
    });

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
    e.hp = Math.max(0, e.hp - dmg);
    checkEnemyDead("dot");
    float(ui.floatE, `-${dmg}`, "green", true);
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

  function enemyAttack(){
    const p = state.player;
    const e = state.enemy;
    if(state.mode === MODES.TRAINING) return;
    const ds = derivedStats(p);

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

    // if none typed: use saved word 1
    if(parts.length === 0){
      parts.push(p.savedWords[0]);
      ui.input.value = parts[0];
    }

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
    const savedSet = new Set(p.savedWords.map(w=>w.toUpperCase()));
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
    }, 260);

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
    while(p.xp >= p.xpNext){
      p.xp -= p.xpNext;
      p.level += 1;
      levelsGained += 1;
      p.xpNext = Math.round(p.xpNext * 1.22);
      // small baseline bump each level (choices add the fun)
      p.hpMax += 4;
      p.manaMax += 1;
      p.hp = Math.min(p.hpMax, p.hp + 6);
      p.mana = Math.min(p.manaMax, p.mana + 1);
    }

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
    journalNow(`Fienden är besegrad! Välj en belöning.`);

    // Training: still show rewards (so you can progress), but nextFight will reset dummy + DPS window.

    const rewards = makeRewards();
    state.pendingRewards = null;
    state.deferredRewards = rewards;
    if(levelsGained > 0){
      showLevelUp(levelsGained);
      renderAll();
      return;
    }
    state.pendingRewards = rewards;
    state.deferredRewards = null;
    state.nextReady = false;
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

  ui.input.addEventListener("input", () => {
    // live preview without waiting for Enter
    renderSpellPreview();
  });

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
  
  const btnOpenInv = document.querySelector("#btn-open-inventory");
  if(btnOpenInv) btnOpenInv.addEventListener("click", showInventory);
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
})();