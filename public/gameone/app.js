(() => {
  const STORAGE_KEY = "gameone_v01_state";

  const $ = (sel) => document.querySelector(sel);
  const logEl = $("#combatLog");

  const els = {
    playerHpFill: $("#playerHpFill"),
    playerHpText: $("#playerHpText"),
    enemyHpFill: $("#enemyHpFill"),
    enemyHpText: $("#enemyHpText"),
    enemyImg: $("#enemyImg"),
    enemyName: $("#enemyName"),
    arenaMeta: $("#arenaMeta"),
    wordSlots: $("#wordSlots"),
    btnAttack: $("#btnAttack"),
    btnEndTurn: $("#btnEndTurn"),
    playerFloatLayer: $("#playerFloatLayer"),
    enemyFloatLayer: $("#enemyFloatLayer"),

    learnBackdrop: $("#learnBackdrop"),
    newWordName: $("#newWordName"),
    newWordMeta: $("#newWordMeta"),
    replaceGrid: $("#replaceGrid"),
    btnSkipLearn: $("#btnSkipLearn"),
    btnCloseLearn: $("#btnCloseLearn"),

    statStr: $("#statStr"),
    statInt: $("#statInt"),
    statDex: $("#statDex"),
    statLck: $("#statLck"),
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));

  const RARE = new Set(["z", "x", "q", "å", "ä", "ö"]);
  const ELEMENT_KEYWORDS = [
    { element: "eld", keywords: ["eld", "bränn", "flamma", "inferno", "glöd"] },
    { element: "is", keywords: ["is", "frost", "kyla", "snö", "blåis"] },
    { element: "gift", keywords: ["gift", "tox", "orm", "syra", "pest"] },
    { element: "helig", keywords: ["helig", "ljus", "ängel", "rena", "bön"] },
    { element: "el", keywords: ["el", "blixt", "storm", "gnista", "volt", "åska"] },
  ];

  const ENEMIES = [
    { id: "goblin", name: "Goblin", hp: 42, armor: 2, resist: { gift: 0.1, eld: 0.0, is: 0.0, helig: 0.0, el: 0.0 }, img: "./assets/enemy-goblin.svg" },
    { id: "skeleton", name: "Skelett", hp: 48, armor: 3, resist: { gift: 0.4, eld: 0.1, is: 0.0, helig: -0.15, el: 0.1 }, img: "./assets/enemy-skeleton.svg" },
    { id: "slime", name: "Slime", hp: 55, armor: 1, resist: { gift: 0.7, eld: -0.1, is: 0.1, helig: 0.0, el: 0.0 }, img: "./assets/enemy-slime.svg" },
  ];

  const WORD_POOL = [
    "Blixt","Flamma","Frost","Skugga","Ljus","Orkan","Glöd","Snöfall","Syra","Toxin",
    "Bön","Rena","Åska","Gnista","Vålnad","Ärr","Öde","Zigzag","Xylit","Quasar",
    "Bränn","Kyla","Inferno","Blåis","Pest","Ängel","Volt","Storm","Gloria","Vrede"
  ];

  const normalizeWord = (w) => (w || "").trim().toLowerCase();

  function detectElement(word) {
    const w = normalizeWord(word);
    for (const group of ELEMENT_KEYWORDS) {
      for (const k of group.keywords) {
        if (w.includes(k)) return group.element;
      }
    }
    return "neutral";
  }

  function computeWordPower(word) {
    const raw = (word || "").trim().slice(0, 20);
    const w = normalizeWord(raw).replace(/[^a-zåäö]/g, "");
    const len = w.length || 1;
    const uniq = new Set(w.split("")).size;
    let rareCount = 0;
    for (const ch of w) if (RARE.has(ch)) rareCount++;

    const base = Math.min(12, len);
    const uniqueBonus = (uniq / len) * 6;
    const rareBonus = rareCount * 2.2;

    return Math.round(base + uniqueBonus + rareBonus);
  }

  function makeWordObject(name) {
    const element = detectElement(name);
    const power = computeWordPower(name);
    return { name, element, power, usedThisFight: 0, totalUsed: 0 };
  }

  function pickRandomEnemy() {
    const e = ENEMIES[irnd(0, ENEMIES.length - 1)];
    return { ...e, hpCurrent: e.hp, status: { burn: 0, slow: 0, poison: 0, stun: 0 } };
  }

  function saveState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function defaultState() {
    return {
      round: 1,
      selectedSlot: 0,
      player: {
        hpMax: 100,
        hpCurrent: 100,
        stats: { str: 5, int: 5, dex: 5, lck: 5 },
        words: [ makeWordObject("Slag"), makeWordObject("Eld"), makeWordObject("Is") ]
      },
      enemy: pickRandomEnemy(),
      fightId: Date.now()
    };
  }

  let state = loadState() || defaultState();

  function migrateIfNeeded() {
    if (!state.player?.words || state.player.words.length !== 3) {
      state = defaultState();
      return;
    }
    state.player.words = state.player.words.map(w => ({
      name: w.name || "Slag",
      element: w.element || detectElement(w.name || ""),
      power: Number.isFinite(w.power) ? w.power : computeWordPower(w.name || ""),
      usedThisFight: w.usedThisFight || 0,
      totalUsed: w.totalUsed || 0,
    }));
    if (!state.enemy?.id) state.enemy = pickRandomEnemy();
    if (typeof state.selectedSlot !== "number") state.selectedSlot = 0;
    if (typeof state.round !== "number") state.round = 1;
    if (!state.fightId) state.fightId = Date.now();
  }
  migrateIfNeeded();

  function setHpBars() {
    const p = state.player, e = state.enemy;
    const pPct = (p.hpCurrent / p.hpMax) * 100;
    const ePct = (e.hpCurrent / e.hp) * 100;

    els.playerHpFill.style.width = `${clamp(pPct, 0, 100)}%`;
    els.enemyHpFill.style.width = `${clamp(ePct, 0, 100)}%`;
    els.playerHpText.textContent = `${p.hpCurrent} / ${p.hpMax}`;
    els.enemyHpText.textContent = `${Math.max(0, e.hpCurrent)} / ${e.hp}`;

    els.statStr.textContent = p.stats.str;
    els.statInt.textContent = p.stats.int;
    els.statDex.textContent = p.stats.dex;
    els.statLck.textContent = p.stats.lck;
  }

  function setEnemyUI() {
    els.enemyName.textContent = state.enemy.name;
    els.enemyImg.src = state.enemy.img;
    els.enemyImg.alt = state.enemy.name;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function log(html) {
    const div = document.createElement("div");
    div.className = "entry";
    div.innerHTML = html;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearLog(){ logEl.innerHTML = ""; }

  function floatText(layerEl, text, kind="neutral") {
    const el = document.createElement("div");
    el.className = `float-text ${kind}`;
    el.textContent = text;
    const ox = irnd(-38, 38), oy = irnd(-12, 16);
    el.style.left = `calc(50% + ${ox}px)`;
    el.style.top = `calc(50% + ${oy}px)`;
    layerEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function renderWordSlots() {
    els.wordSlots.innerHTML = "";
    state.player.words.forEach((w, i) => {
      const btn = document.createElement("div");
      btn.className = "slot" + (state.selectedSlot === i ? " selected" : "");
      btn.setAttribute("role","button");
      btn.tabIndex = 0;

      btn.innerHTML = `
        <div class="slot-k">${i+1}</div>
        <div class="slot-main">
          <div class="slot-name">${escapeHtml(w.name)}</div>
          <div class="slot-meta">Element: ${escapeHtml(w.element)} • Power: ${w.power}</div>
        </div>
        <div class="tag">${escapeHtml(w.element === "neutral" ? "neutral" : w.element)}</div>
      `;

      const select = () => { state.selectedSlot = i; renderWordSlots(); saveState(state); };
      btn.addEventListener("click", select);
      btn.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(); }
      });

      els.wordSlots.appendChild(btn);
    });
  }

  function startNewFight() {
    state.player.words.forEach(w => w.usedThisFight = 0);
    state.round = 1;
    state.fightId = Date.now();
    state.enemy = pickRandomEnemy();

    clearLog();
    setEnemyUI();
    setHpBars();
    renderWordSlots();

    els.arenaMeta.textContent = `Runda ${state.round}`;
    log(`<b>En ${escapeHtml(state.enemy.name)}</b> hoppar fram!`);
    saveState(state);
  }

  const calcHitChance = () => clamp(0.78 + state.player.stats.dex * 0.015, 0.60, 0.95);
  const calcCritChance = () => clamp(0.06 + state.player.stats.dex * 0.006 + state.player.stats.lck * 0.004, 0.05, 0.30);
  const calcEnemyHitChance = () => clamp(0.72 - state.player.stats.dex * 0.004, 0.55, 0.85);

  function resistMultiplier(element) {
    if (!element || element === "neutral") return 1.0;
    const r = state.enemy.resist?.[element] ?? 0.0;
    return clamp(1.0 - r, 0.55, 1.35);
  }

  function diminishingMultiplier(word) {
    const used = word.usedThisFight || 0;
    return clamp(1.0 - used * 0.12, 0.65, 1.0);
  }

  function applyStatusOnHit(word, didCrit) {
    const e = state.enemy;
    const { int: INT, lck } = state.player.stats;
    const bonus = (lck * 0.004) + (INT * 0.003) + (didCrit ? 0.05 : 0);

    if (word.element === "eld") {
      if (Math.random() < clamp(0.18 + bonus, 0.10, 0.45)) { e.status.burn = Math.max(e.status.burn, 2); log(`🔥 <span class="good">BRÄNN</span> på fienden!`); }
    } else if (word.element === "is") {
      if (Math.random() < clamp(0.16 + bonus, 0.10, 0.40)) { e.status.slow = Math.max(e.status.slow, 2); log(`❄️ Fienden blir <span class="good">SLOW</span>!`); }
    } else if (word.element === "gift") {
      if (Math.random() < clamp(0.20 + bonus, 0.12, 0.48)) { e.status.poison = Math.max(e.status.poison, 3); log(`☠️ Fienden blir <span class="good">FÖRGIFTAD</span>!`); }
    } else if (word.element === "helig" || word.element === "el") {
      if (Math.random() < clamp(0.14 + bonus, 0.08, 0.38)) { e.status.stun = Math.max(e.status.stun, 1); log(`✨ Fienden blir <span class="good">STUNNED</span>!`); }
    }
  }

  function statusTickEnemy() {
    const e = state.enemy;
    let total = 0;

    if (e.status.burn > 0) {
      const d = irnd(2, 4);
      e.hpCurrent -= d; total += d; e.status.burn -= 1;
      log(`🔥 Bränn skadar fienden <span class="good">-${d}</span>`);
      floatText(els.enemyFloatLayer, `-${d}`, "good");
    }
    if (e.status.poison > 0) {
      const d = irnd(2, 5);
      e.hpCurrent -= d; total += d; e.status.poison -= 1;
      log(`☠️ Gift skadar fienden <span class="good">-${d}</span>`);
      floatText(els.enemyFloatLayer, `-${d}`, "good");
    }
    if (total > 0) setHpBars();

    if (e.hpCurrent <= 0) {
      e.hpCurrent = 0; setHpBars(); winFight(); return true;
    }
    return false;
  }

  function enemyTurn() {
    if (state.enemy.hpCurrent <= 0 || state.player.hpCurrent <= 0) return;

    if (statusTickEnemy()) return;

    const e = state.enemy;
    if (e.status.stun > 0) {
      e.status.stun -= 1;
      log(`✨ Fienden är <span class="good">stunned</span> och missar sin tur.`);
      floatText(els.enemyFloatLayer, "STUN", "neutral");
      return;
    }

    const slowed = e.status.slow > 0;
    if (slowed) e.status.slow -= 1;

    const hitChance = calcEnemyHitChance() - (slowed ? 0.10 : 0);
    if (Math.random() >= hitChance) {
      log(`Fienden attackerar… <span class="good">DUCKAR</span>!`);
      floatText(els.playerFloatLayer, "DUCK", "neutral");
      return;
    }

    const base = irnd(6, 11);
    const dmg = Math.max(1, Math.round(base * rnd(0.85, 1.15) * (slowed ? 0.82 : 1.0)));
    state.player.hpCurrent -= dmg;
    log(`Fienden träffar dig för <span class="bad">-${dmg}</span>`);
    floatText(els.playerFloatLayer, `-${dmg}`, "bad");

    if (state.player.hpCurrent <= 0) {
      state.player.hpCurrent = 0;
      setHpBars();
      log(`<b>Du föll.</b> Tryck Attack för att starta en ny fight.`);
      return;
    }
    setHpBars();
  }

  function endPlayerTurn() {
    state.round += 1;
    els.arenaMeta.textContent = `Runda ${state.round}`;
    setTimeout(() => { enemyTurn(); saveState(state); }, 260);
  }

  function playerAttack() {
    if (state.player.hpCurrent <= 0) { startNewFight(); return; }
    if (state.enemy.hpCurrent <= 0) return;

    const word = state.player.words[state.selectedSlot];
    word.usedThisFight = (word.usedThisFight || 0) + 1;
    word.totalUsed = (word.totalUsed || 0) + 1;

    if (Math.random() >= calcHitChance()) {
      log(`Du använder <b>${escapeHtml(word.name)}</b>… <span class="bad">MISS</span>!`);
      floatText(els.enemyFloatLayer, "MISS", "bad");
      endPlayerTurn();
      saveState(state);
      return;
    }

    const didCrit = Math.random() < calcCritChance();
    const { str, int: INT, lck } = state.player.stats;

    const base = word.power;
    const statBonus = (str * 0.7) + (INT * 0.6);
    const critMult = didCrit ? (1.65 + lck * 0.01) : 1.0;
    const dim = diminishingMultiplier(word);
    const elem = resistMultiplier(word.element);
    const armor = state.enemy.armor || 0;

    let dmg = Math.round((base + statBonus) * rnd(0.85, 1.15) * critMult * dim * elem - armor);
    dmg = Math.max(1, dmg);

    state.enemy.hpCurrent -= dmg;

    const elemText = word.element !== "neutral" ? ` <span class="muted">(${escapeHtml(word.element)})</span>` : "";
    const critText = didCrit ? ` <span class="good">CRIT!</span>` : "";
    log(`Du använder <b>${escapeHtml(word.name)}</b>${elemText} och gör <span class="good">-${dmg}</span>${critText}`);
    floatText(els.enemyFloatLayer, `-${dmg}`, "good");
    if (didCrit) floatText(els.enemyFloatLayer, "CRIT!", "neutral");

    applyStatusOnHit(word, didCrit);
    setHpBars();

    if (state.enemy.hpCurrent <= 0) {
      state.enemy.hpCurrent = 0;
      setHpBars();
      winFight();
      saveState(state);
      return;
    }

    endPlayerTurn();
    saveState(state);
  }

  function waitTurn() {
    if (state.player.hpCurrent <= 0 || state.enemy.hpCurrent <= 0) return;
    log(`Du väntar… <span class="muted">samlar kraft</span>.`);
    floatText(els.playerFloatLayer, "…", "neutral");
    endPlayerTurn();
    saveState(state);
  }

  function rollNewWord() {
    const pick = WORD_POOL[irnd(0, WORD_POOL.length - 1)];
    const w = makeWordObject(pick);
    const { int: INT, lck } = state.player.stats;
    const bonus = Math.random() < clamp(0.10 + INT*0.01 + lck*0.005, 0.10, 0.40) ? 1 : 0;
    if (bonus) w.power += irnd(1, 3);
    return w;
  }

  function openLearnModal(newWord) {
    state.pendingNewWord = newWord;
    els.newWordName.textContent = newWord.name;
    els.newWordMeta.textContent = `Element: ${newWord.element} • Power: ${newWord.power}`;

    els.replaceGrid.innerHTML = "";
    state.player.words.forEach((old, i) => {
      const btn = document.createElement("button");
      btn.className = "replace-btn";
      btn.innerHTML = `Byt ut Slot ${i+1}: <b>${escapeHtml(old.name)}</b>
        <small>Nu: ${escapeHtml(old.element)} • ${old.power}</small>`;
      btn.addEventListener("click", () => { replaceWord(i, newWord); closeLearnModal(true); });
      els.replaceGrid.appendChild(btn);
    });

    els.learnBackdrop.classList.remove("hidden");
    els.btnAttack.disabled = true;
    els.btnEndTurn.disabled = true;
  }

  function closeLearnModal(startNextFight) {
    els.learnBackdrop.classList.add("hidden");
    els.btnAttack.disabled = false;
    els.btnEndTurn.disabled = false;
    delete state.pendingNewWord;
    saveState(state);
    if (startNextFight) setTimeout(startNewFight, 250);
  }

  function replaceWord(slotIndex, newWord) {
    state.player.words[slotIndex] = { ...newWord, usedThisFight: 0, totalUsed: 0 };
    state.selectedSlot = clamp(state.selectedSlot, 0, 2);
    log(`Du lär dig <b>${escapeHtml(newWord.name)}</b> och sparar den i Slot ${slotIndex+1}.`);
    renderWordSlots();
    saveState(state);
  }

  function winFight() {
    log(`<b>${escapeHtml(state.enemy.name)}</b> besegrad! <span class="good">Du vinner.</span>`);
    floatText(els.enemyFloatLayer, "KO", "neutral");
    openLearnModal(rollNewWord());
  }

  els.btnAttack.addEventListener("click", () => playerAttack());
  els.btnEndTurn.addEventListener("click", () => waitTurn());
  els.btnSkipLearn.addEventListener("click", () => { if (state.pendingNewWord) log(`Du skippade <b>${escapeHtml(state.pendingNewWord.name)}</b>.`); closeLearnModal(true); });
  els.btnCloseLearn.addEventListener("click", () => closeLearnModal(true));
  els.learnBackdrop.addEventListener("click", (ev) => { if (ev.target === els.learnBackdrop) closeLearnModal(true); });

  window.addEventListener("keydown", (ev) => {
    const modalOpen = !els.learnBackdrop.classList.contains("hidden");
    if (modalOpen) {
      if (ev.key === "Escape") closeLearnModal(true);
      return;
    }
    if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
      state.selectedSlot = Number(ev.key) - 1;
      renderWordSlots();
      saveState(state);
      return;
    }
    if (ev.key === "Enter") { ev.preventDefault(); playerAttack(); return; }
    if (ev.key.toLowerCase() === "v") { waitTurn(); return; }
    if ((ev.key === "r" || ev.key === "R") && ev.shiftKey) { state = defaultState(); migrateIfNeeded(); startNewFight(); }
  });

  function boot() {
    setEnemyUI();
    setHpBars();
    renderWordSlots();
    clearLog();
    log(`<b>Fight start!</b> Du möter <b>${escapeHtml(state.enemy.name)}</b>.`);
    els.arenaMeta.textContent = `Runda ${state.round}`;
  }

  boot();
})();