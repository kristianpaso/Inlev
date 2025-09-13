(function(){
  const root = document.getElementById("trav-root");
  if (!root) return;
  const STORAGE_KEY = "inlev.trav.races.v1";
  const races = load();
  const rowsEl = root.querySelector("#travRows");
  const emptyEl = root.querySelector("#travEmptyState");
  const searchEl = root.querySelector("#travSearch");
  const chips = Array.from(root.querySelectorAll(".trav-chip"));
  const modal = root.querySelector("#travModal");
  const form = root.querySelector("#travForm");
  const issuesModal = root.querySelector("#travIssues");

  if (races.length === 0) {
    races.push(
      { id: uid(), bana: "Solvalla", datum: nextDate(3), lopp: 1, status: "planerat" },
      { id: uid(), bana: "Jägersro", datum: nextDate(6), lopp: 3, status: "planerat" }
    );
    save();
  }

  let state = { q: "", status: "" };

  root.querySelector("#travBtnNewRace").addEventListener("click", () => openEditor());
  root.querySelector("#travBtnShowIssues").addEventListener("click", () => issuesModal.showModal());
  root.querySelector("#travCsvInput").addEventListener("change", handleCsv);
  searchEl.addEventListener("input", (e)=>{ state.q = e.target.value.trim().toLowerCase(); render(); });
  chips.forEach(ch => ch.addEventListener("click", () => {
    chips.forEach(c => c.classList.remove("trav-chip-active"));
    ch.classList.add("trav-chip-active");
    state.status = ch.dataset.status || "";
    render();
  }));

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      id: fd.get("id") || uid(),
      bana: (fd.get("bana")||"").toString().trim(),
      datum: (fd.get("datum")||"").toString(),
      lopp: Number(fd.get("lopp")||0),
      status: (fd.get("status")||"planerat").toString()
    };
    const existingIdx = races.findIndex(r => r.id === data.id);
    if (existingIdx >= 0) races[existingIdx] = data; else races.unshift(data);
    save();
    modal.close();
    render();
    form.reset();
  });

  function openEditor(race){
    root.querySelector("#travModalTitle").textContent = race ? "Redigera lopp" : "Nytt lopp";
    form.reset();
    form.elements["id"].value = race?.id || "";
    form.elements["bana"].value = race?.bana || "";
    form.elements["datum"].value = race?.datum || today();
    form.elements["lopp"].value = race?.lopp || 1;
    form.elements["status"].value = race?.status || "planerat";
    modal.showModal();
  }

  function render(){
    rowsEl.innerHTML = "";
    const filtered = races
      .filter(r => {
        const matchQ = state.q
          ? (r.bana.toLowerCase().includes(state.q) || r.datum.includes(state.q) || r.status.toLowerCase().includes(state.q))
          : true;
        const matchS = state.status ? r.status === state.status : true;
        return matchQ && matchS;
      })
      .sort((a,b)=> (a.datum + String(a.lopp).padStart(3,"0")).localeCompare(b.datum + String(b.lopp).padStart(3,"0")));

    emptyEl.classList.toggle("trav-hidden", filtered.length !== 0);
    filtered.forEach(r => rowsEl.appendChild(rowEl(r)));
  }

  function rowEl(r){
    const el = document.createElement("div");
    el.className = "trav-row";
    const statusBadge = `<span class="trav-badge ${r.status}">${r.status}</span>`;
    el.innerHTML = `
      <div>${escapeHtml(r.bana)}</div>
      <div>${escapeHtml(r.datum)}</div>
      <div>${Number(r.lopp)}</div>
      <div>${statusBadge}</div>
      <div class="trav-right trav-actions">
        <button data-act="open">Öppna</button>
        <button data-act="edit">Redigera</button>
        <button data-act="del">Ta bort</button>
      </div>`;
    el.querySelector("[data-act='open']").addEventListener("click", ()=> openRace(r.id));
    el.querySelector("[data-act='edit']").addEventListener("click", ()=> openEditor(r));
    el.querySelector("[data-act='del']").addEventListener("click", ()=> {
      if (!confirm("Ta bort detta lopp?")) return;
      const i = races.findIndex(x => x.id === r.id);
      if (i>=0){ races.splice(i,1); save(); render(); }
    });
    return el;
  }

  function openRace(id){
    alert("Öppna lopp: " + id + "\\n(implementera detaljsida senare)");
  }

  function handleCsv(ev){
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result.toString();
      // CSV: bana,datum(YYYY-MM-DD),lopp,status
      const lines = text.split(/\\r?\\n/).map(l=>l.trim()).filter(Boolean);
      const added = [];
      for (const line of lines){
        const [bana, datum, loppStr, status] = line.split(",").map(x => (x||"").trim());
        if (!bana || !datum) continue;
        const obj = { id: uid(), bana, datum, lopp: Number(loppStr||1), status: status||"planerat" };
        races.push(obj);
        added.push(obj);
      }
      save();
      render();
      alert("Importerade " + added.length + " rader.");
    };
    reader.readAsText(file, "utf-8");
    ev.target.value = "";
  }

  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(races)); }
  function load(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]") }catch(e){ return [] }
  }
  function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36) }
  function today(){ return new Date().toISOString().slice(0,10) }
  function nextDate(days){ const d = new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10) }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[m])) }

  render();
})();