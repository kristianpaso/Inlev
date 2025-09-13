// assets/analys.js
(function(){
  const root = document.getElementById("trav-root");
  if (!root) return;

  const host = root.querySelector("#avdHost");
  const buildBtn = root.querySelector("#buildBtn");
  const seedBtn = root.querySelector("#seedBtn");
  const avdCountEl = root.querySelector("#avdCount");

  buildBtn.addEventListener("click", buildAvdelningar);
  seedBtn.addEventListener("click", () => {
    const txt = `1
Twigs Khaleesi

Ulf Ohlsson
(Ska Ev)
21%
Markera häst nummer 2. Aktuell kostnad för kupongen är 0 kr2
Marisse

Henrik Svensson
(Län Pä)
1%
Markera häst nummer 3. Aktuell kostnad för kupongen är 0 kr3
Make My Trip V.S.

Petter Lundberg
(For Ro)
5%
Markera häst nummer 4. Aktuell kostnad för kupongen är 0 kr4
Isabelline Am

Tomas Pettersson
(Fri KK)
1%
Markera häst nummer 5. Aktuell kostnad för kupongen är 0 kr5
Grazzhopper

Markus B Svedberg
(Sve MB)
18%
Markera häst nummer 6. Aktuell kostnad för kupongen är 0 kr6
Kueen Simoni

Rikard N Skoglund
(Tjo Öy)
9%
Markera häst nummer 7. Aktuell kostnad för kupongen är 0 kr7
Vibora

Magnus A Djuse
(Fra Su)
27%
Markera häst nummer 8. Aktuell kostnad för kupongen är 0 kr8
Who's That Girl

Per Linderoth
(Eri EL)
4%
Markera häst nummer 9. Aktuell kostnad för kupongen är 0 kr9
Rocket Queen

Mats E Djuse
(Nor PG)
3%
Tillägg: 20 meter	
Markera häst nummer 10. Aktuell kostnad för kupongen är 0 kr10
You to Ezme

Olle Alsén
(Blo Te)
0%
Markera häst nummer 11. Aktuell kostnad för kupongen är 0 kr11
Quinan Tooma

Peter G Norman
(Nor PG)
6%
Markera häst nummer 12. Aktuell kostnad för kupongen är 0 kr12
Noocandy

Linus Lönn
(Sve Er)
0%
Markera häst nummer 13. Aktuell kostnad för kupongen är 0 kr13
Elin Avant

Marcus Lilius
(Dju Ma)
3%
Markera häst nummer 14 som är struken. Aktuell kostnad för kupongen är 0 kr14
Havana Heaven

Per Lennartsson
(Elf Jo)
1%
Markera häst nummer 15. Aktuell kostnad för kupongen är 0 kr15
Mary Wadd

Oskar Kylin Blom
(Per Je)
1%`;
    const first = host.querySelector(".avd-block textarea");
    if (first){ first.value = txt; }
  });

  function buildAvdelningar(){
    const n = Math.max(1, Number(avdCountEl.value||1));
    host.innerHTML = "";
    for (let i=1;i<=n;i++){
      host.appendChild(block(i));
    }
  }

  function block(index){
    const wrap = document.createElement("section");
    wrap.className = "avd-block";
    wrap.style.margin = "10px 0";
    wrap.innerHTML = `
      <div class="trav-t-head" style="border-bottom:1px solid var(--border)">
        <div style="grid-column: span 5">
          <strong>AVD ${index}</strong>
        </div>
      </div>
      <div style="padding:12px; display:flex; gap:12px; flex-wrap:wrap">
        <label>Antal hästar
          <input type="number" class="trav-input horses" min="1" value="10" style="width:120px;margin-left:8px">
        </label>
        <button class="trav-btn parse">Parsa text</button>
        <button class="trav-btn trav-ghost clear">Rensa</button>
      </div>
      <div style="padding:12px; display:grid; grid-template-columns:1fr; gap:8px">
        <textarea class="raw trav-input" rows="10" placeholder="Klistra in info för AVD ${index} här…"></textarea>
      </div>
      <div class="trav-table" style="margin:10px 12px 16px">
        <div class="trav-t-head">
          <div>Nr</div><div>Häst</div><div>Kusk</div><div>Procent</div><div class="trav-right">Status</div>
        </div>
        <div class="trav-t-body rows"></div>
      </div>
    `;

    const horsesEl = wrap.querySelector(".horses");
    const rowsEl = wrap.querySelector(".rows");
    const rawEl = wrap.querySelector(".raw");

    wrap.querySelector(".parse").addEventListener("click", () => {
      const max = Math.max(1, Number(horsesEl.value||1));
      const data = parseAvd(rawEl.value || "", max);
      renderRows(rowsEl, data);
    });
    wrap.querySelector(".clear").addEventListener("click", () => {
      rawEl.value = "";
      rowsEl.innerHTML = "";
    });
    return wrap;
  }

  function renderRows(container, lines){
    container.innerHTML = "";
    if (!lines.length){
      const empty = document.createElement("div");
      empty.className = "trav-row";
      empty.innerHTML = `<div style="grid-column: span 5; color:var(--muted)">Inget hittat.</div>`;
      container.appendChild(empty);
      return;
    }
    for (const r of lines){
      const el = document.createElement("div");
      el.className = "trav-row";
      el.innerHTML = `
        <div>${r.nr ?? ""}</div>
        <div>${escapeHtml(r.namn || "")}</div>
        <div>${escapeHtml(r.kusk || "")}</div>
        <div>${r.procent != null ? (r.procent + "%") : ""}</div>
        <div class="trav-right">${r.struken ? "Struken" : (r.tillagg || "")}</div>
      `;
      container.appendChild(el);
    }
  }

  // Parser
  function parseAvd(text, maxHorses){
    // Normalisera radbrytningar och ta bort "Markera häst nummer X ..." bruset
    let t = text
      .replace(/\r/g, "\n")
      .replace(/Markera häst nummer.*?(?=\n\d+|$)/g, "") // ta bort markera-raderna fram till nästa hästnr eller slut
      .replace(/\n{2,}/g, "\n\n") // komprimera tomma block
      .trim();

    // Splitta på mönster: siffra i början av block
    const blocks = t.split(/\n(?=\d+\s*$)/m); // börja nytt block när en rad enbart innehåller ett nummer
    const out = [];
    for (let b of blocks){
      b = b.trim();
      if (!b) continue;

      // Läs första siffran (hästnr)
      const mNr = b.match(/^(\d+)\s*(?:\n|$)/);
      if (!mNr) continue;
      const nr = Number(mNr[1]);
      if (isNaN(nr) || nr<1 || nr>maxHorses) continue;

      // Resten efter numret
      let rest = b.slice(mNr[0].length).trim();

      // Hämta namn (första icke-tomma raden)
      const lines = rest.split("\n").map(s => s.trim());
      const nameLineIdx = lines.findIndex(x => x.length>0);
      const name = nameLineIdx>=0 ? lines[nameLineIdx] : "";

      // Kusk (nästa icke-tomma rad efter namn)
      let kusk = "";
      let idx = nameLineIdx+1;
      while(idx<lines.length && !lines[idx]) idx++;
      if (idx<lines.length){ kusk = lines[idx]; idx++; }

      // Hoppa över ev. parentesrad (stall/kod)
      while(idx<lines.length && /^\(.*\)$/.test(lines[idx])) idx++;

      // Procent (rad med X%)
      let procent = null;
      for (let j=idx;j<lines.length;j++){
        const mp = lines[j].match(/(\d+)\s*%/);
        if (mp){ procent = Number(mp[1]); idx=j+1; break; }
      }

      // Flagga struken
      const struken = /struken/i.test(b);

      // Tillägg (ex "Tillägg: 20 meter")
      let tillagg = "";
      const mt = b.match(/Tillägg\s*:\s*([^\n]+)/i);
      if (mt) tillagg = mt[0].trim();

      out.push({ nr, namn: name, kusk, procent, struken, tillagg });
    }

    // Sortera på nr och returnera
    out.sort((a,b)=>(a.nr||0)-(b.nr||0));
    return out;
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[m])) }

  // bygg initialt
  buildAvdelningar();
})();