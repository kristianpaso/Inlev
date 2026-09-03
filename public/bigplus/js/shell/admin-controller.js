import { fetchWithApiFallback } from "./api-fetch.js";
import { escapeHtml } from "./format.js";

const FALLBACK_SPECIES = [
  { id: "pike", name: "Gädda", minCm: 40, factor: 0.000008 },
  { id: "perch", name: "Abborre", minCm: 20, factor: 0.0000155 },
  { id: "zander", name: "Gös", minCm: 45, factor: 0.0000092 },
  { id: "trout", name: "Öring", minCm: 35, factor: 0.0000105 },
  { id: "salmon", name: "Lax", minCm: 60, factor: 0.0000112 },
  { id: "char", name: "Röding", minCm: 35, factor: 0.00001 },
  { id: "cod", name: "Torsk", minCm: 35, factor: 0.0000095 },
  { id: "other", name: "Annan art", minCm: 0, factor: 0.00001 }
];

const FALLBACK_ACHIEVEMENTS = [
  { id: "first_bigplus", title: "Första Bigplus", description: "Få din första godkända fisk.", metric: "bigplusCount", target: 1, points: 40, visible: true },
  { id: "species_master", title: "Artmästare", description: "Få Bigplus på fem olika arter.", metric: "speciesCount", target: 5, points: 100, visible: true },
  { id: "pike_owner", title: "Gäddägaren", description: "Få tre gäddor över 100 cm.", metric: "pikeOver100", target: 3, points: 200, visible: true }
];

const METRICS = [
  ["bigplusCount", "Antal Bigplus"],
  ["speciesCount", "Olika arter"],
  ["pikeOver100", "Gäddor över 100 cm"],
  ["catchCount", "Antal fångster"],
  ["friendCount", "Antal vänner"],
  ["lengthOver100", "Fiskar över 100 cm"],
  ["streak", "Dagar i följd"]
];

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formValue(form, name) {
  return form.elements.namedItem(name)?.value ?? "";
}

export function createAdminController({ authApiRoot, currentAccount }) {
  const state = { overview: null, species: FALLBACK_SPECIES, achievements: FALLBACK_ACHIEVEMENTS, message: "" };
  let eventsBound = false;

  function target() { return document.querySelector("#adminView"); }
  function isAdmin() { return currentAccount()?.role === "admin"; }
  function errorMessage(error) { return error?.message || "Kunde inte ansluta till adminservern."; }

  async function request(path, options = {}) {
    const response = await fetchWithApiFallback(`${authApiRoot}${path}`, { credentials: "include", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Serverfel (${response.status})`);
    return data;
  }

  function statCard(label, value, note) {
    return `<article class="admin-stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function renderOverview() {
    const overview = state.overview;
    const stats = overview?.stats;
    const unavailable = "—";
    const statsHtml = [
      statCard("Registrerade användare", stats ? String(stats.users) : unavailable, stats ? "Alla konton" : "Kräver ansluten databas"),
      statCard("Online nu", stats ? String(stats.online) : unavailable, "Aktiva sessioner senaste 15 min"),
      statCard("Sparade fångster", stats ? String(stats.catches) : unavailable, "Totalt i Bigplus"),
      statCard("Fiskarter", stats ? String(stats.species) : String(state.species.length), stats ? "I centrala katalogen" : "Lokala standardvärden"),
      statCard("Achievements", stats ? String(stats.achievements) : String(state.achievements.length), stats ? `${stats.visibleAchievements} visas för medlemmar` : "Lokala standardvärden")
    ].join("");
    const users = overview?.recentUsers || [];
    const usersHtml = users.length ? users.map((user) => `<li><strong>${escapeHtml(user.name || "Namnlös")}</strong><span>${escapeHtml(user.email || "")}</span><small>${escapeHtml(user.role || "user")}</small></li>`).join("") : `<li class="admin-empty-row">${overview ? "Inga användare ännu." : "Användardata visas när databasen är ansluten."}</li>`;
    return `<section class="admin-overview-grid"><div class="admin-stat-grid">${statsHtml}</div><article class="admin-panel admin-status-panel"><div class="admin-panel-heading"><div><p class="eyebrow blue-eyebrow">SYSTEMSTATUS</p><h2>Adminåtkomst</h2></div><span class="admin-status-dot">ADMIN</span></div><p>Du är inloggad som <strong>${escapeHtml(currentAccount()?.name || "administratör")}</strong>. All redigering skyddas av serverns adminroll.</p><small>${overview?.lastUpdated ? `Senast uppdaterad ${new Date(overview.lastUpdated).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}` : "Statistik väntar på backend"}</small></article><article class="admin-panel"><div class="admin-panel-heading"><div><p class="eyebrow blue-eyebrow">SENASTE KONTON</p><h2>Nya medlemmar</h2></div></div><ul class="admin-user-list">${usersHtml}</ul></article></section>`;
  }

  function renderSpecies() {
    const rows = state.species.map((item) => `<form class="admin-edit-row" data-admin-species="${escapeHtml(item.id)}"><label>Art<input name="name" value="${escapeHtml(item.name)}" maxlength="80" required></label><label>Min cm<input name="minCm" type="number" min="0" max="1000" step="0.1" value="${numberValue(item.minCm)}" required></label><label>Viktfaktor<input name="factor" type="number" min="0.0000001" max="1" step="0.0000001" value="${numberValue(item.factor, 0.00001)}" required></label><div class="admin-row-actions"><button class="primary-button compact-button" type="submit">Spara</button><button class="text-button admin-delete-button" type="button" data-admin-delete-species="${escapeHtml(item.id)}">Ta bort</button></div></form>`).join("");
    return `<section class="admin-panel" id="adminSpeciesPanel"><div class="admin-panel-heading"><div><p class="eyebrow blue-eyebrow">CENTRAL KATALOG</p><h2>Fiskarter</h2><p>Ändringar används av registreringen och mätningen.</p></div><span class="admin-count-badge">${state.species.length}</span></div><div class="admin-edit-list">${rows || '<p class="admin-empty-row">Inga arter ännu.</p>'}</div><form class="admin-create-form" id="adminSpeciesForm"><h3>Lägg till art</h3><div class="admin-form-grid"><label>Namn<input name="name" maxlength="80" required placeholder="Till exempel Sik"></label><label>Minsta längd (cm)<input name="minCm" type="number" min="0" max="1000" step="0.1" value="0" required></label><label>Viktfaktor<input name="factor" type="number" min="0.0000001" max="1" step="0.0000001" value="0.00001" required></label></div><button class="secondary-button" type="submit">+ Lägg till art</button></form></section>`;
  }

  function renderAchievements() {
    const rows = state.achievements.map((item) => `<form class="admin-edit-row admin-achievement-row" data-admin-achievement="${escapeHtml(item.id)}"><div class="admin-achievement-title"><label>Rubrik<input name="title" value="${escapeHtml(item.title)}" maxlength="80" required></label><label>Beskrivning<input name="description" value="${escapeHtml(item.description)}" maxlength="180" required></label></div><label>Mätvärde<select name="metric">${METRICS.map(([value, label]) => `<option value="${value}"${item.metric === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label><label>Mål<input name="target" type="number" min="1" max="100000" value="${numberValue(item.target, 1)}" required></label><label>Poäng<input name="points" type="number" min="0" max="100000" value="${numberValue(item.points)}" required></label><label class="admin-check-label"><input name="visible" type="checkbox"${item.visible !== false ? " checked" : ""}> Visa för medlemmar</label><div class="admin-row-actions"><button class="primary-button compact-button" type="submit">Spara</button><button class="text-button admin-delete-button" type="button" data-admin-delete-achievement="${escapeHtml(item.id)}">Ta bort</button></div></form>`).join("");
    const metricOptions = METRICS.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("");
    return `<section class="admin-panel" id="adminAchievementsPanel"><div class="admin-panel-heading"><div><p class="eyebrow blue-eyebrow">CENTRAL PROGRESSION</p><h2>Achievements & uppdrag</h2><p>Välj vad som ska synas och justera mål eller belöning.</p></div><span class="admin-count-badge">${state.achievements.filter((item) => item.visible !== false).length} synliga</span></div><div class="admin-edit-list">${rows || '<p class="admin-empty-row">Inga achievements ännu.</p>'}</div><form class="admin-create-form" id="adminAchievementForm"><h3>Lägg till achievement</h3><div class="admin-form-grid admin-achievement-create-grid"><label>Rubrik<input name="title" maxlength="80" required placeholder="Till exempel 25 fångster"></label><label>Beskrivning<input name="description" maxlength="180" required placeholder="Vad ska medlemmen göra?"></label><label>Mätvärde<select name="metric">${metricOptions}</select></label><label>Mål<input name="target" type="number" min="1" max="100000" value="1" required></label><label>Poäng<input name="points" type="number" min="0" max="100000" value="25" required></label><label class="admin-check-label"><input name="visible" type="checkbox" checked> Visa för medlemmar</label></div><button class="secondary-button" type="submit">+ Lägg till achievement</button></form></section>`;
  }

  function render() {
    const node = target();
    if (!node) return;
    if (!isAdmin()) { node.innerHTML = `<div class="admin-access-denied"><p class="eyebrow blue-eyebrow">BEHÖRIGHET</p><h1>Adminåtkomst krävs</h1><p>Den här sidan är endast tillgänglig för administratörer.</p></div>`; return; }
    node.innerHTML = `<div class="admin-shell"><header class="admin-hero"><div><p class="eyebrow blue-eyebrow">BIGPLUS CONTROL CENTER</p><h1>Admin & backup</h1><p>Styr katalog, achievements och få en snabb överblick över appens data.</p></div><div class="admin-hero-actions"><button class="secondary-button" type="button" id="adminRefreshButton">Uppdatera</button><button class="primary-button" type="button" id="adminBackupButton">Exportera backup</button></div></header>${state.message ? `<p class="admin-feedback" role="status">${escapeHtml(state.message)}</p>` : ""}${renderOverview()}<div class="admin-management-grid">${renderSpecies()}${renderAchievements()}</div></div>`;
  }

  async function load() {
    if (!isAdmin()) return render();
    state.message = "";
    const results = await Promise.allSettled([request("/admin/overview"), request("/admin/species"), request("/admin/achievements")]);
    if (results[0].status === "fulfilled") state.overview = results[0].value;
    else { state.overview = null; state.message = errorMessage(results[0].reason); }
    if (results[1].status === "fulfilled" && Array.isArray(results[1].value)) state.species = results[1].value;
    if (results[2].status === "fulfilled" && Array.isArray(results[2].value)) state.achievements = results[2].value;
    render();
  }

  async function save(path, method, body, success) {
    try {
      await request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      state.message = success;
      await load();
    } catch (error) { state.message = errorMessage(error); render(); }
  }

  async function downloadBackup() {
    try {
      const response = await fetchWithApiFallback(`${authApiRoot}/admin/backup`, { credentials: "include" });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Kunde inte skapa backup."); }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bigplus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      state.message = "Backup exporterad.";
      render();
    } catch (error) { state.message = errorMessage(error); render(); }
  }

  async function handleSubmit(event) {
    const form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    if (form.id === "adminSpeciesForm") return save("/admin/species", "POST", { name: formValue(form, "name"), minCm: formValue(form, "minCm"), factor: formValue(form, "factor") }, "Arten lades till.");
    if (form.dataset.adminSpecies) return save(`/admin/species/${encodeURIComponent(form.dataset.adminSpecies)}`, "PATCH", { name: formValue(form, "name"), minCm: formValue(form, "minCm"), factor: formValue(form, "factor") }, "Arten uppdaterades.");
    if (form.id === "adminAchievementForm") return save("/admin/achievements", "POST", { title: formValue(form, "title"), description: formValue(form, "description"), metric: formValue(form, "metric"), target: formValue(form, "target"), points: formValue(form, "points"), visible: form.elements.visible.checked }, "Achievementet lades till.");
    if (form.dataset.adminAchievement) return save(`/admin/achievements/${encodeURIComponent(form.dataset.adminAchievement)}`, "PATCH", { title: formValue(form, "title"), description: formValue(form, "description"), metric: formValue(form, "metric"), target: formValue(form, "target"), points: formValue(form, "points"), visible: form.elements.visible.checked }, "Achievementet uppdaterades.");
  }

  async function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "adminRefreshButton") return load();
    if (button.id === "adminBackupButton") return downloadBackup();
    const speciesId = button.dataset.adminDeleteSpecies;
    const achievementId = button.dataset.adminDeleteAchievement;
    if (!speciesId && !achievementId) return;
    const label = speciesId ? "art" : "achievement";
    if (!window.confirm(`Ta bort detta ${label}?`)) return;
    try {
      await request(`/admin/${speciesId ? "species" : "achievements"}/${encodeURIComponent(speciesId || achievementId)}`, { method: "DELETE" });
      state.message = `${label[0].toUpperCase()}${label.slice(1)}et togs bort.`;
      await load();
    } catch (error) { state.message = errorMessage(error); render(); }
  }

  function bind() {
    if (eventsBound) return;
    target()?.addEventListener("submit", handleSubmit);
    target()?.addEventListener("click", handleClick);
    eventsBound = true;
  }

  async function open() {
    bind();
    await load();
  }

  return { open, render };
}
