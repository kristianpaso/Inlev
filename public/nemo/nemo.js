const local = ["localhost", "127.0.0.1"].includes(location.hostname);
const API = `${local ? "http://127.0.0.1:4100" : (window.NEMO_RENDER_API_ROOT || "https://nemo-api.onrender.com")}/api/nemo`;
const SEED_DEPARTMENTS = ["Plock AS Normal","Plock AS Marketplaces","Fadder","Returhantering","B2B","Inventering","Inleverans Automatisk","Infackning Buffert","Komplettering","TL","Utleverans","Infackning AS","Plock AS - Norge","Påfyllning Buffert","Externa"];
const SEED_PEOPLE = ["Ali","Asma","Sigurd","Roudi","Haris","Mathilda","Frida","Belissa","Cecilia","Paso","Morsal","Raziyeh","Nasser","Sofia","Axel","Ahmad Y","Ahmad J"];
const $ = (selector) => document.querySelector(selector);
const state = { departments: [], people: [], day: { assignments: {} }, selectedDate: "", period: "week", rankingMode: "person", selectedPersonId: "", summary: null };
let token = sessionStorage.getItem("nemoToken") || "";
let toastTimer;

function dayString(date = new Date()) { const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return shifted.toISOString().slice(0, 10); }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || `API-fel (${response.status})`); error.status = response.status; throw error; }
  return body;
}
function notify(message) { const el = $("#toast"); el.textContent = message; el.classList.add("visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("visible"), 2400); }
function setStatus(message, error = false) { const el = $("#saveStatus"); el.textContent = message; el.classList.toggle("error", error); }
async function requireSession() {
  const session = await api("/session");
  if (!session.required) return;
  if (token) { try { await api("/bootstrap"); return; } catch { token = ""; sessionStorage.removeItem("nemoToken"); } }
  while (!token) {
    const password = window.prompt("Ange Nemo-lösenordet för att öppna arbetsöversikten:");
    if (password === null) throw new Error("Inloggning avbröts.");
    try {
      const result = await api("/login", { method: "POST", body: JSON.stringify({ password }) });
      token = result.token;
      sessionStorage.setItem("nemoToken", token);
    } catch (error) {
      if (error.status !== 401) throw error;
      window.alert(error.message);
    }
  }
}
async function loadBootstrap() {
  const result = await api("/bootstrap");
  state.departments = result.departments || [];
  state.people = result.people || [];
  if (!state.departments.length && result.seedRequired) {
    const seeded = await api("/bootstrap/seed", { method: "POST", body: JSON.stringify({ departments: SEED_DEPARTMENTS, people: SEED_PEOPLE }) });
    state.departments = seeded.departments;
    state.people = seeded.people;
  }
}
async function loadDay(date = state.selectedDate) {
  state.selectedDate = date;
  $("#workDate").value = date;
  $("#periodDate").value ||= date;
  $("#todayLabel").textContent = new Date(`${date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  const result = await api(`/days/${encodeURIComponent(date)}`);
  state.day = result.day || { date, assignments: {} };
  state.day.assignments ||= {};
  renderDepartments();
  setStatus(state.day.updatedAt ? `Senast sparad ${new Date(state.day.updatedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}` : "Inte sparad ännu");
}
function renderDepartments() {
  const root = $("#departmentGrid");
  if (!state.departments.length) { root.innerHTML = '<div class="empty-overview card">Lägg till en avdelning för att börja registrera placeringar.</div>'; return; }
  root.innerHTML = state.departments.map((department) => {
    const assigned = state.day.assignments[department.id] || [];
    const candidates = state.people.filter((person) => person.active !== false && !assigned.some((item) => item.personId === person.id));
    candidates.sort((a, b) => Number((b.competencies || []).includes(department.id)) - Number((a.competencies || []).includes(department.id)));
    const options = candidates.map((person) => `<option value="${escapeHTML(person.id)}">${escapeHTML(person.name)}</option>`).join("");
    const chips = assigned.length ? assigned.map((person) => `<span class="person-chip">${escapeHTML(person.name)}<button class="remove-person" type="button" aria-label="Ta bort ${escapeHTML(person.name)} från ${escapeHTML(department.name)}" data-remove-person="${escapeHTML(person.personId)}" data-department="${escapeHTML(department.id)}">×</button></span>`).join("") : '<span class="empty-state">Ingen placerad ännu</span>';
    return `<article class="department-card"><header class="department-head"><h3>${escapeHTML(department.name)}</h3><span class="people-count">${assigned.length}</span></header><div class="assigned-list">${chips}</div><div class="assign-row"><select class="assign-select" aria-label="Välj person för ${escapeHTML(department.name)}" data-select-department="${escapeHTML(department.id)}"><option value="">＋ Välj person…</option>${options}</select></div></article>`;
  }).join("");
}
async function saveDay() {
  const button = $("#saveButton"); button.disabled = true; button.textContent = "Sparar…"; setStatus("");
  try { const result = await api(`/days/${encodeURIComponent(state.selectedDate)}`, { method: "PUT", body: JSON.stringify({ assignments: state.day.assignments }) }); state.day = result.day; await loadBootstrap(); renderDepartments(); setStatus(`Sparad ${new Date(state.day.updatedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`); notify("Dagens placeringar är sparade."); }
  catch (error) { setStatus(error.message, true); }
  finally { button.disabled = false; button.textContent = "Spara dagen"; }
}
function rangeFor(period, dateValue) {
  const date = new Date(`${dateValue}T12:00:00`); let from; let to;
  if (period === "week") { const day = (date.getDay() + 6) % 7; from = new Date(date); from.setDate(date.getDate() - day); to = new Date(from); to.setDate(from.getDate() + 6); }
  else { from = new Date(date.getFullYear(), date.getMonth(), 1); to = new Date(date.getFullYear(), date.getMonth() + 1, 0); }
  return { from: dayString(from), to: dayString(to) };
}
function displayDate(date) { return new Date(`${date}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }); }
async function loadSummary() {
  const { from, to } = rangeFor(state.period, $("#periodDate").value || state.selectedDate);
  const result = await api(`/summary?from=${from}&to=${to}`); state.summary = result;
  $("#periodLabel").textContent = state.period === "week" ? `Vecka ${result.weekNumber} · ${displayDate(from)}–${displayDate(to)} ${from.slice(0,4)}` : `${new Date(`${from}T12:00:00`).toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}`;
  $("#summaryCards").innerHTML = `<article class="summary-card card"><div class="summary-label">Registrerade pass</div><div class="summary-value">${result.totalAssignments}</div><div class="summary-caption">placeringar totalt</div></article><article class="summary-card card"><div class="summary-label">Personal i perioden</div><div class="summary-value">${result.peopleCount}</div><div class="summary-caption">unika personer</div></article><article class="summary-card card"><div class="summary-label">Registrerade dagar</div><div class="summary-value">${result.daysCount}</div><div class="summary-caption">dagar med sparad planering</div></article>`;
  renderLeaderboard();
  const departments = [...(result.departments || [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sv"));
  $("#departmentSummary").innerHTML = departments.length ? departments.map((department, index) => `<div class="department-summary-card"><strong><span class="department-rank">${index + 1}</span>${escapeHTML(department.name)}</strong><span>${department.count} placeringar · ${department.people.length ? department.people.map(escapeHTML).join(", ") : "ingen registrerad"}</span></div>`).join("") : '<div class="empty-overview">Inga avdelningar registrerade.</div>';
}
function renderLeaderboard() {
  if (!state.summary) return;
  const personMode = state.rankingMode === "person";
  $("#leaderboardTitle").textContent = personMode ? "Topplista · person" : "Topplista · avdelning";
  $("#leaderboardDescription").textContent = personMode ? "Flest registrerade placeringar först. Välj en person för avdelningsfördelningen." : "Avdelningen med flest placeringar visas först.";
  const list = personMode
    ? [...(state.summary.people || [])]
    : [...(state.summary.departments || [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sv"));
  const max = Math.max(1, ...list.map((item) => item.count));
  if (personMode && list.length && !list.some((person) => person.id === state.selectedPersonId)) state.selectedPersonId = list[0].id;
  $("#leaderboard").innerHTML = list.length ? list.map((item, index) => {
    const rank = index + 1;
    const selected = personMode && item.id === state.selectedPersonId;
    return `<button class="leader-row ${item.count === max ? "top" : ""} ${selected ? "selected" : ""}" type="button" ${personMode ? `data-select-person="${escapeHTML(item.id)}"` : ""}><span class="rank">${rank}</span><span class="leader-name">${escapeHTML(item.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(item.count ? 5 : 0, Math.round(item.count / max * 100))}%"></span></span><span class="leader-count">${item.count} <span>placeringar</span></span></button>`;
  }).join("") : '<div class="empty-overview">Inga registrerade placeringar i perioden.</div>';
  const breakdown = $("#personBreakdown");
  if (!personMode) { breakdown.innerHTML = ""; return; }
  const person = list.find((item) => item.id === state.selectedPersonId);
  if (!person) { breakdown.innerHTML = ""; return; }
  const departmentCounts = person.departmentCounts || {};
  const departments = state.summary.departments || [];
  breakdown.innerHTML = `<div class="breakdown-heading">${escapeHTML(person.name)}<span>${person.count} placeringar totalt</span></div><div class="breakdown-list">${departments.map((department) => `<div class="breakdown-item"><span>${escapeHTML(department.name)}</span><strong>${departmentCounts[department.id] || 0}</strong></div>`).join("")}</div>`;
}
function renderCompetence() {
  const query = $("#competenceSearch").value.trim().toLocaleLowerCase("sv-SE");
  const departmentsById = new Map(state.departments.map((department) => [department.id, department.name]));
  const people = state.people.map((person) => ({ ...person, competencyNames: (person.competencies || []).map((id) => departmentsById.get(id)).filter(Boolean) }))
    .filter((person) => !query || person.name.toLocaleLowerCase("sv-SE").includes(query) || person.competencyNames.some((name) => name.toLocaleLowerCase("sv-SE").includes(query)));
  const registeredPairs = state.people.reduce((total, person) => total + (person.competencies || []).filter((id) => departmentsById.has(id)).length, 0);
  $("#competenceStats").innerHTML = `<div class="competence-stat"><strong>${people.length}</strong> personer</div><div class="competence-stat"><strong>${registeredPairs}</strong> registrerade kompetenser</div>`;
  $("#competenceGrid").innerHTML = people.length ? people.map((person) => `<article class="competence-person"><strong class="competence-person-name">${escapeHTML(person.name)}</strong><div class="competence-tags">${person.competencyNames.length ? person.competencyNames.map((name) => `<span class="competence-tag">${escapeHTML(name)}</span>`).join("") : '<span class="competence-tag none">Ingen registrerad kompetens</span>'}</div></article>`).join("") : '<div class="competence-empty">Ingen person eller avdelning matchar sökningen.</div>';
}
function openNameDialog(kind) {
  const isPerson = kind === "person"; $("#nameEyebrow").textContent = isPerson ? "PERSONAL" : "AVDELNINGAR"; $("#nameTitle").textContent = isPerson ? "Lägg till person" : "Lägg till avdelning"; $("#nameLabel").firstChild.textContent = isPerson ? "Personens namn" : "Avdelningens namn"; $("#nameInput").value = ""; $("#nameDialog").dataset.kind = kind; $("#nameDialog").showModal(); setTimeout(() => $("#nameInput").focus(), 40);
}
function renderManagers() {
  $("#peopleList").innerHTML = state.people.map((person) => { const competencies = (person.competencies || []).map((id) => state.departments.find((department) => department.id === id)?.name).filter(Boolean); return `<div class="manager-row"><span>${escapeHTML(person.name)}<small class="manager-details">Kompetens: ${competencies.length ? competencies.map(escapeHTML).join(" · ") : "inte registrerad ännu"}</small></span><button type="button" data-archive-person="${escapeHTML(person.id)}">${person.active === false ? "Borttagen" : "Ta bort"}</button></div>`; }).join("") || '<div class="empty-state">Ingen personal tillagd.</div>';
  $("#departmentsList").innerHTML = state.departments.map((department) => `<div class="manager-row"><span>${escapeHTML(department.name)}${department.active === false ? " · arkiverad" : ""}</span><button type="button" data-archive-department="${escapeHTML(department.id)}">${department.active === false ? "Borttagen" : "Ta bort"}</button></div>`).join("") || '<div class="empty-state">Ingen avdelning tillagd.</div>';
}
async function refreshLists() { await loadBootstrap(); renderDepartments(); renderManagers(); if (!$("#overviewView").hidden) await loadSummary(); if (!$("#competenceView").hidden) renderCompetence(); }
async function archive(kind, id) {
  const label = kind === "people" ? "personen" : "avdelningen";
  if (!window.confirm(`Ta bort ${label} från aktiva listan? Tidigare registreringar sparas.`)) return;
  await api(`/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }); await refreshLists(); notify("Posten har tagits bort från listan.");
}
function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => {
    const view = button.dataset.tab; $("#dayView").hidden = view !== "day"; $("#overviewView").hidden = view !== "overview"; $("#competenceView").hidden = view !== "competence";
    document.querySelectorAll("[data-tab]").forEach((tab) => { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
    if (view === "overview") await loadSummary();
    if (view === "competence") renderCompetence();
  }));
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", async () => { state.period = button.dataset.period; document.querySelectorAll("[data-period]").forEach((tab) => tab.classList.toggle("active", tab === button)); await loadSummary(); }));
  document.querySelectorAll("[data-ranking]").forEach((button) => button.addEventListener("click", () => { state.rankingMode = button.dataset.ranking; document.querySelectorAll("[data-ranking]").forEach((tab) => tab.classList.toggle("active", tab === button)); renderLeaderboard(); }));
  $("#workDate").addEventListener("change", (event) => loadDay(event.target.value).catch((error) => setStatus(error.message, true)));
  $("#periodDate").addEventListener("change", () => loadSummary().catch((error) => notify(error.message)));
  $("#competenceSearch").addEventListener("input", renderCompetence);
  $("#saveButton").addEventListener("click", saveDay);
  $("#addDepartmentButton").addEventListener("click", () => openNameDialog("department"));
  $("#manageAddDepartmentButton").addEventListener("click", () => openNameDialog("department"));
  $("#addPersonButton").addEventListener("click", () => openNameDialog("person"));
  $("#manageButton").addEventListener("click", () => { renderManagers(); $("#manageDialog").showModal(); });
  $("#nameForm").addEventListener("submit", async (event) => { event.preventDefault(); const kind = $("#nameDialog").dataset.kind; const name = $("#nameInput").value.trim(); if (!name) return; try { await api(`/${kind === "person" ? "people" : "departments"}`, { method: "POST", body: JSON.stringify({ name }) }); $("#nameDialog").close(); await refreshLists(); notify(kind === "person" ? "Person tillagd." : "Avdelning tillagd."); } catch (error) { notify(error.message); } });
  $("#closeNameDialog").addEventListener("click", () => $("#nameDialog").close()); $("#cancelNameButton").addEventListener("click", () => $("#nameDialog").close());
  $("#departmentGrid").addEventListener("change", (event) => {
    const select = event.target.closest("[data-select-department]");
    if (!select?.value) return;
    const departmentId = select.dataset.selectDepartment; const person = state.people.find((item) => item.id === select.value);
    if (!person) return;
    const assigned = state.day.assignments[departmentId] ||= [];
    if (!assigned.some((item) => item.personId === person.id)) assigned.push({ personId: person.id, name: person.name });
    renderDepartments();
  });
  $("#leaderboard").addEventListener("click", (event) => { const row = event.target.closest("[data-select-person]"); if (!row) return; state.selectedPersonId = row.dataset.selectPerson; renderLeaderboard(); });
  $("#departmentGrid").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-person]");
    if (remove) { const { department: departmentId, removePerson: personId } = remove.dataset; state.day.assignments[departmentId] = (state.day.assignments[departmentId] || []).filter((person) => person.personId !== personId); renderDepartments(); }
  });
  $("#peopleList").addEventListener("click", (event) => { const button = event.target.closest("[data-archive-person]"); if (button) archive("people", button.dataset.archivePerson).catch((error) => notify(error.message)); });
  $("#departmentsList").addEventListener("click", (event) => { const button = event.target.closest("[data-archive-department]"); if (button) archive("departments", button.dataset.archiveDepartment).catch((error) => notify(error.message)); });
}
async function start() {
  bindEvents(); state.selectedDate = dayString(); $("#workDate").value = state.selectedDate; $("#periodDate").value = state.selectedDate;
  try { await requireSession(); await loadBootstrap(); await loadDay(); }
  catch (error) { $("#departmentGrid").innerHTML = `<div class="empty-overview card">${escapeHTML(error.message)}<br><br>Kontrollera att Nemo API är igång på port 4100.</div>`; setStatus(error.message, true); }
}
start();
