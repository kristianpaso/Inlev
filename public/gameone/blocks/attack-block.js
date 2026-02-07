(function(){
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(txt != null) e.textContent = txt;
    return e;
  };

  const api = () => window.__GAMEONE__ || null;

  const ELEM_ICON = {
    Fire:"🔥", Nature:"🌿", Storm:"⚡", Mist:"🌫️", Light:"✨",
    Physical:"🗡️", Mystic:"🔮", Mythic:"👑", "—":"❔"
  };
  const MANA_ICON = "💧";
  const elemIcon = (e)=> ELEM_ICON[e] || "❔";

  function ensureDockRoot(){
    let root = document.querySelector(".attack-dock");
    if(root) return root;

    root = el("div","attack-dock");
    root.innerHTML = `
      <div class="attack-row" id="attackRow"></div>

      <div class="dock-tools">
        <button class="tool-btn" id="btnSavedWords">Sparade ord</button>

        <div class="latest-wrap" id="latestWrap" style="display:none">
          <div class="latest-chip" id="latestChip"></div>
          <button class="tool-plus" id="btnQuickAdd" title="Lägg till på Arc/Burst">+</button>
          <div class="quick-choose" id="quickChoose" style="display:none">
            <button class="qc" data-slot="arc">Arc</button>
            <button class="qc" data-slot="burst">Burst</button>
          </div>
        </div>
      </div>

      <div class="dock-bottom">
        <div>
          <input id="dockInput" placeholder="t.ex. BURK eller BURK GIFT SKÖLD" autocomplete="off" />
        </div>
        <div class="dock-action">
          <button id="dockAttackBtn">Attack!</button>
          <button id="dockRestBtn" class="rest">Vila</button>
        </div>
      </div>

      <div class="word-modal hidden" id="wordModal" aria-hidden="true">
        <div class="wm-card">
          <div class="wm-head">
            <div class="wm-title">Sparade ord</div>
            <button class="wm-close" id="wmClose">×</button>
          </div>
          <div class="wm-sub">Välj ett ord och lägg det på <b>Arc</b> eller <b>Burst</b>.</div>
          <div class="wm-list" id="wmList"></div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function openModal(){
    const modal = document.getElementById("wordModal");
    if(!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
  }

  function closeModal(){
    const modal = document.getElementById("wordModal");
    if(!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
  }

  function renderModal(){
    const A = api();
    if(!A || !A.state) return;
    const st = A.state;
    const p = st.player || {};
    const list = document.getElementById("wmList");
    if(!list) return;
    list.innerHTML = "";

    const words = (p.wordBook || []).slice(0).reverse(); // newest first
    for(const w of words){
      const row = el("div","wm-row");
      const left = el("div","wm-left");
      left.appendChild(el("div","wm-name", A.wordName(w)));

      const subTxt = `${A.wordElement(w)} • ATK ${A.baseWordAtk(w)} • Tier ${A.wordTier(w)}` + (w.revealed ? "" : " • ?");
      left.appendChild(el("div","wm-subtxt", subTxt));

      const right = el("div","wm-right");
      const bTap = el("button","wm-btn","Tap");
      const bArc = el("button","wm-btn","Arc");
      const bBurst = el("button","wm-btn","Burst");

      bTap.addEventListener("click", ()=>{
        A.assignWordToSlot(w.id, "tap");
        closeModal();
        A.onDockRender && A.onDockRender();
      });
      
      bArc.addEventListener("click", ()=>{
        A.assignWordToSlot(w.id, "arc");
        closeModal();
        A.onDockRender && A.onDockRender();
      });
      bBurst.addEventListener("click", ()=>{
        A.assignWordToSlot(w.id, "burst");
        closeModal();
        A.onDockRender && A.onDockRender();
      });

      right.appendChild(bArc);
      right.appendChild(bBurst);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  function render(){
    const A = api();
    if(!A || !A.state) return;

    ensureDockRoot();
    A.ensureAttackSlots();

    const st = A.state;
    const p = st.player || {};
    const enemy = st.enemy || {};
    const enemyResist = enemy.resist || enemy.elementResist || enemy.elResist || "";

    // hook buttons once
    const savedBtn = document.getElementById("btnSavedWords");
    if(savedBtn && !savedBtn.__bound){
      savedBtn.__bound = true;
      savedBtn.addEventListener("click", ()=>{
        renderModal();
        openModal();
      });
    }

    const wmClose = document.getElementById("wmClose");
    if(wmClose && !wmClose.__bound){
      wmClose.__bound = true;
      wmClose.addEventListener("click", closeModal);
    }

    const modal = document.getElementById("wordModal");
    if(modal && !modal.__bound){
      modal.__bound = true;
      modal.addEventListener("click", (e)=>{
        if(e.target === modal) closeModal();
      });
      document.addEventListener("keydown", (e)=>{
        if(e.key === "Escape") closeModal();
      });
    }

    // latest revealed word chip + quick add
    const latestWrap = document.getElementById("latestWrap");
    const latestChip = document.getElementById("latestChip");
    const btnQuickAdd = document.getElementById("btnQuickAdd");
    const quickChoose = document.getElementById("quickChoose");

    const latestId = st.lastFoundWordId || (st.attackSlots?.spark?.wordId) || null;
    const latestWord = latestId ? A.getWordById(latestId) : null;

    if(latestWrap && latestChip){
      if(latestWord && latestWord.revealed){
        latestWrap.style.display = "";
        latestChip.textContent = `${A.wordName(latestWord)} • ${A.wordElement(latestWord)} • ATK ${A.baseWordAtk(latestWord)} • Tier ${A.wordTier(latestWord)}`;
      }else{
        latestWrap.style.display = "none";
      }
    }

    if(btnQuickAdd && !btnQuickAdd.__bound){
      btnQuickAdd.__bound = true;
      btnQuickAdd.addEventListener("click", ()=>{
        if(!latestWord) return;
        // toggle small chooser
        if(quickChoose){
          quickChoose.style.display = (quickChoose.style.display === "none" || !quickChoose.style.display) ? "flex" : "none";
        }
      });
    }

    if(quickChoose && !quickChoose.__bound){
      quickChoose.__bound = true;
      quickChoose.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-slot]");
        if(!btn) return;
        if(!latestWord) return;
        const slot = btn.getAttribute("data-slot");
        A.assignWordToSlot(latestWord.id, slot);
        quickChoose.style.display = "none";
        A.onDockRender && A.onDockRender();
      });
      document.addEventListener("click", (e)=>{
        if(!quickChoose) return;
        if(e.target === btnQuickAdd) return;
        if(btnQuickAdd && btnQuickAdd.contains(e.target)) return;
        if(quickChoose.contains(e.target)) return;
        quickChoose.style.display = "none";
      });
    }

    // Attack buttons row
    const row = document.getElementById("attackRow");
    row.innerHTML = "";

    const slots = st.attackSlots;
    const order = ["tap","spark","arc","burst","nova","bigplus"];

    for(const key of order){
      const s = slots[key];
      const btn = el("div","attack-btn");
      const isLocked = !s.unlocked;
      const isCd = s.cooldown > 0;
      if(isLocked) btn.classList.add("locked");
      if(isCd) btn.classList.add("cooldown");

      const w = A.getWordById(s.wordId);
      const wEl = w ? A.wordElement(w) : null;

      if(!isLocked && !isCd && w && enemyResist && A.isEffective(wEl, enemyResist)){
        btn.classList.add("effective");
      }

      
      // Preview values for a more "game-like" card
      let manaCost = 0;
      if(key === "spark") manaCost = 1;
      if(key === "nova") manaCost = 3;
      if(key === "bigplus") manaCost = 10;

      const lvl = (p.level || 1);

      let dmgPreview = 0;
      let elem = "Physical";
      let titleLine = s.label;
      let wordLine = "";
      let subLine = "";

      if(isLocked){
        subLine = "🔒 Låst";
      }else if(key === "tap"){
        // Tap can optionally have a word, but it is always BASIC (no element/tier shown).
        const wTap = A.getWordById(s.wordId);
        dmgPreview = wTap ? Math.round(A.baseWordAtk(wTap) + (p.baseAtk||0)) : (5 + lvl);
        elem = "Physical";
        wordLine = wTap ? A.wordName(wTap) : "";
        subLine = wTap ? "Basic • endast skada (inga tiers/element)" : "Basic • ingen mana";
      
}else if(key === "spark"){
        dmgPreview = 5 + lvl;
        elem = "Mystic";
        // Spark must never preview the revealed word on the button.
        wordLine = "";
        subLine = "Avslöjar ett nytt ord (sparas som snabbord)";
      
}else if(key === "arc"){
        if(w){
          dmgPreview = Math.round(A.baseWordAtk(w) + (A.wordTier(w)-1)*2);
          elem = A.wordElement(w);
          wordLine = A.wordName(w);
          subLine = `${A.wordElement(w)} • ATK ${A.baseWordAtk(w)} • Tier ${A.wordTier(w)} • +1 mana`;
        }else{
          dmgPreview = 0;
          elem = "—";
          subLine = "Slotta ett ord (Sparade ord)";
        }
      }else if(key === "burst"){
        if(w){
          dmgPreview = Math.round(A.baseWordAtk(w) * 1.25 + (A.wordTier(w)-1)*2);
          elem = A.wordElement(w);
          wordLine = A.wordName(w);
          subLine = `${A.wordElement(w)} • ATK ${A.baseWordAtk(w)} • Tier ${A.wordTier(w)} • +1 mana`;
        }else{
          dmgPreview = 0;
          elem = "—";
          subLine = "Slotta ett ord (Sparade ord)";
        }
      }else if(key === "nova"){
        dmgPreview = 10 + lvl;
        elem = "Mystic";
        subLine = "AOE burst • kostar mana";
      }else if(key === "bigplus"){
        dmgPreview = 20 + lvl;
        elem = "Mythic";
        subLine = "Massiv attack • dyr mana";
      }

      // If a slotted word is effective vs enemy resist, keep highlight.
      const icon = elemIcon(elem);

      btn.innerHTML = `
        <div class="ab-head">
          <div class="ab-title">
            <div class="ab-name">${titleLine}</div>
            <div class="ab-rounds">${s.rounds||0}r</div>
          </div>
          <div class="ab-elem" title="${elem}">${icon}</div>
        </div>

        <div class="ab-body">
          ${wordLine ? `<div class="ab-word">${wordLine}</div>` : ``}
          <div class="ab-sub">${subLine}</div>
        </div>

        <div class="ab-foot">
          <div class="ab-stat dmg">
            <div class="lab">DMG</div>
            <div class="val">${dmgPreview ? dmgPreview : "—"}</div>
          </div>
          <div class="ab-stat mana" title="Mana cost">
            <div class="lab">${MANA_ICON}</div>
            <div class="val">${manaCost}</div>
          </div>
        </div>
      `;

      if(isCd){
        btn.appendChild(el("div","badge", `CD ${s.cooldown}`));
      }else if(isLocked){
        btn.appendChild(el("div","badge","🔒"));
      }

      btn.addEventListener("click", ()=>{
        if(isLocked || isCd) return;
        A.castFromSlot(key);
      });

      row.appendChild(btn);

    }

    // Input + buttons
    const inp = document.getElementById("dockInput");
    const attackBtn = document.getElementById("dockAttackBtn");
    const restBtn = document.getElementById("dockRestBtn");

    if(attackBtn){
      attackBtn.disabled = !(((A.ui && A.ui.input && A.ui.input.value) ? A.ui.input.value : "").trim().length);
    }

    if(inp && A.ui?.input){
      if(!inp.__sync){
        inp.__sync = true;
        inp.value = A.ui.input.value || "";
        inp.addEventListener("input", ()=>{ A.ui.input.value = inp.value; if(attackBtn) attackBtn.disabled = !(inp.value||"").trim(); });
        A.ui.input.addEventListener("input", ()=>{ inp.value = A.ui.input.value; if(attackBtn) attackBtn.disabled = !(inp.value||"").trim(); });
      }
    }

    if(attackBtn && !attackBtn.__bound){
      attackBtn.__bound = true;
      attackBtn.addEventListener("click", ()=> A.playerCastFromInput && A.playerCastFromInput());
    }
    if(restBtn && !restBtn.__bound){
      restBtn.__bound = true;
      restBtn.addEventListener("click", ()=> A.restTurn && A.restTurn());
    }
  }

  window.AttackBlock = {
    mount(){ ensureDockRoot(); },
    render
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    ensureDockRoot();
    const t = setInterval(()=>{
      const A = api();
      if(A && A.state){
        clearInterval(t);
        render();
        A.onDockRender = render;
      }
    }, 50);
  });
})();
