import { $ } from "./dom.js";
import { escapeHtml, formatCompetitionDate } from "./format.js";
import { fetchWithApiFallback } from "./api-fetch.js";
import {
  competitionAllowsSpecies,
  competitionMetricLabel,
  competitionScore,
  competitionSpeciesLabel,
  formatCompetitionResult,
  formatCompetitionScore
} from "./competition-utils.js";
import { favoriteCompetition } from "./preferences.js";

export function createCompetitionController({
  accounts,
  authApiRoot,
  competitionCard,
  competitions,
  currentAccount,
  decorateCompetitionCards,
  isCompetitionMember,
  loadRemoteCompetitions,
  openAuth,
  renderHomeActivity,
  renderHomeCompetitionRank,
  renderHomeTournament,
  renderLeaderboard
}) {
  function renderCompetitions() {
    const list = competitions().filter((item) => item && item.name);
    const details = $("#competitionDetails");
    const detailsSlot = $("#competitionDetailsSlot");
    const activeDetailsId = details && !details.hidden ? details.dataset.competitionId : "";
    if (details && detailsSlot && details.parentElement !== detailsSlot) detailsSlot.appendChild(details);
    const html = list.length ? list.map(competitionCard).join("") : `<div class="empty-list"><strong>Inga aktiva tävlingar</strong><span>Skapa den första tävlingen.</span></div>`;
    const target = $("#competitionsList");
    if (target) target.innerHTML = html;
    if (target) decorateCompetitionCards(target);
    if (activeDetailsId) renderCompetitionDetails(activeDetailsId);
    const home = $("#homeCompetitionList");
    if (home) {
      const joinedList = list.filter(isCompetitionMember);
      home.hidden = false;
      home.innerHTML = joinedList.length
        ? joinedList.slice(0, 3).map((item) => competitionCard(item, { home: true })).join("")
        : `<div class="empty-list"><strong>Du deltar inte i någon tävling</strong><span>Öppna Tävlingar för att hitta en utmaning.</span></div>`;
      decorateCompetitionCards(home);
    }
    renderHomeCompetitionRank();
    renderHomeTournament();
    renderHomeActivity();
    renderLeaderboard();
  }

  function renderCompetitionDetails(competitionId) {
    const competition = competitions().find((item) => item.id === competitionId);
    const details = $("#competitionDetails");
    const participants = $("#competitionParticipants");
    if (!competition || !details || !participants) return;
    const shell = [...document.querySelectorAll("#competitionsList .competition-card-shell")]
      .find((item) => item.dataset.competitionShellId === competitionId);
    const participantMap = new Map((competition.participants || []).map((participant) => [participant.userId, {
      ...participant,
      catches: (participant.catches || []).filter((item) => competitionAllowsSpecies(competition, item.measurement || item))
    }]));
    const members = [...participantMap.values()].sort((a, b) => Math.max(0, ...b.catches.map((item) => competitionScore(item, competition))) - Math.max(0, ...a.catches.map((item) => competitionScore(item, competition))));
    const title = $("#competitionDetailsTitle");
    if (title) title.textContent = "Deltagare och bästa resultat";
    const meta = $("#competitionDetailsMeta");
    if (meta) meta.textContent = "";
    participants.innerHTML = members.length ? members.map((member) => {
      const account = accounts().find((item) => item.id === member.userId) || { name: member.name, photo: member.photo };
      const best = member.catches.reduce((winner, item) => competitionScore(item, competition) > competitionScore(winner, competition) ? item : winner, null);
      return `<button class="competition-participant" type="button" data-participant-id="${escapeHtml(member.userId)}" data-competition-id="${escapeHtml(competitionId)}"><span class="competition-avatar">${escapeHtml((account?.name || "F").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(account?.name || "Fiskare")}</strong><small>${member.catches.length} fångster</small></span><b>${best ? `${Number(best.measurement.lengthCm || 0).toFixed(1)} cm` : "--"}</b></button>`;
    }).join("") : '<div class="empty-list"><strong>Inga deltagare ännu</strong><span>Registrera en fångst för att synas här.</span></div>';

    const participantsHeading = document.createElement("div");
    participantsHeading.className = "competition-participants-heading";
    const participantsHeadingText = document.createElement("strong");
    participantsHeadingText.textContent = "Deltagare och bästa resultat";
    participantsHeading.append(participantsHeadingText);
    participants.prepend(participantsHeading);

    const detailsHeader = document.createElement("div");
    detailsHeader.className = "competition-details-header";
    const detailsIntro = document.createElement("div");
    const detailsName = document.createElement("strong");
    detailsName.textContent = competition.name;
    const detailsRule = document.createElement("small");
    detailsRule.textContent = `Skapad ${formatCompetitionDate(competition.createdAt)} · ${competitionMetricLabel(competition)} · ${competitionSpeciesLabel(competition)}`;
    detailsIntro.append(detailsName, detailsRule);

    const favoriteButton = document.createElement("button");
    const isFavorite = favoriteCompetition() === competition.id;
    favoriteButton.type = "button";
    favoriteButton.className = `competition-favorite-button${isFavorite ? " is-favorite" : ""}`;
    favoriteButton.dataset.competitionAction = "favorite";
    favoriteButton.dataset.competitionId = competition.id;
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.setAttribute("aria-label", isFavorite ? "Ta bort favorit" : "Markera som favorit");
    favoriteButton.title = isFavorite ? "Ta bort favorit" : "Markera som favorit";
    favoriteButton.textContent = isFavorite ? "★" : "☆";
    participantsHeading.append(favoriteButton);

    participants.querySelectorAll(".competition-participant").forEach((button, index) => {
      const member = members[index];
      const bestValue = member ? Math.max(0, ...member.catches.map((item) => competitionScore(item, competition))) : 0;
      const score = button.querySelector("b");
      const best = member?.catches.reduce((winner, item) => competitionScore(item, competition) > competitionScore(winner, competition) ? item : winner, null);
      if (score) score.textContent = best ? formatCompetitionResult(best, competition) : formatCompetitionScore(bestValue, competition);
    });

    details.hidden = false;
    details.dataset.competitionId = competitionId;
    details.classList.add("competition-details-inline");
    document.querySelectorAll("#competitionsList .competition-card-shell").forEach((item) => item.classList.remove("has-open-details"));
    if (shell) {
      shell.appendChild(details);
      shell.classList.add("has-open-details");
    }
    const participantCatches = $("#participantCatches");
    if (participantCatches) participantCatches.hidden = true;
  }

  function toggleCompetitionDetails(competitionId) {
    const details = $("#competitionDetails");
    if (details && !details.hidden && details.dataset.competitionId === competitionId) {
      details.hidden = true;
      details.removeAttribute("data-competition-id");
      document.querySelectorAll("#competitionsList .competition-card-shell").forEach((item) => {
        if (item.dataset.competitionShellId === competitionId) item.classList.remove("has-open-details");
      });
      return;
    }
    renderCompetitionDetails(competitionId);
  }

  function renderParticipantCatches(competitionId, participantId) {
    const target = $("#participantCatches");
    if (!target) return;
    const competition = competitions().find((item) => item.id === competitionId);
    const participant = competition?.participants?.find((item) => item.userId === participantId);
    const items = participant?.catches || [];
    target.innerHTML = `<h3>Uppladdade bilder</h3>${items.length ? `<div class="participant-photo-grid">${items.map((item) => item.photo ? `<figure><img src="${escapeHtml(item.photo)}" alt="Fångst"><figcaption>${Number(item.measurement?.lengthCm || 0).toFixed(1)} cm</figcaption></figure>` : "").join("")}</div>` : '<p class="hint">Inga bilder uppladdade ännu.</p>'}`;
    target.hidden = false;
  }

  function createCompetition() {
    const panel = $("#competitionCreatePanel");
    if (!panel) return;
    panel.hidden = false;
    $("#competitionNameInput")?.focus();
  }

  async function saveCompetition(event) {
    event.preventDefault();
    const name = $("#competitionNameInput").value.trim();
    if (!name) return;
    const description = $("#competitionDescriptionInput").value.trim() || "Tävla om den längsta fisken.";
    const daysLeft = Math.max(1, Math.min(365, Number($("#competitionDaysInput").value) || 7));
    if (!currentAccount()) { openAuth("login"); return; }
    const joinOnCreate = $("#competitionJoinOnCreate")?.checked !== false;
    const allSpecies = $("#competitionSpeciesAll")?.checked !== false;
    const selectedSpecies = [...new Set([...document.querySelectorAll('input[name="competitionSpecies"]:checked')].map((input) => input.value))];
    if (!allSpecies && !selectedSpecies.length) {
      window.alert("Välj minst en art eller Alla arter.");
      return;
    }
    const selectedMetric = document.querySelector('input[name="competitionMetric"]:checked')?.value;
    const scoringMetric = ["length", "weight", "both"].includes(selectedMetric) ? selectedMetric : "length";
    try {
      const response = await fetchWithApiFallback(`${authApiRoot}/competitions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.slice(0, 80), description: description.slice(0, 140), daysLeft, species: allSpecies ? [] : selectedSpecies, scoringMetric, joinOnCreate }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { window.alert(data.error || `Kunde inte skapa tävlingen (HTTP ${response.status}).`); return; }
      event.currentTarget.reset();
      $("#competitionDaysInput").value = "7";
      $("#competitionCreatePanel").hidden = true;
      await loadRemoteCompetitions();
      window.alert("Tävlingen skapades.");
    } catch (error) {
      console.error("Kunde inte skapa tävlingen", error);
      window.alert(`Kunde inte nå Bigplus-servern på ${authApiRoot}. Kontrollera att backend körs och att du är inloggad på nytt efter en server- eller adressändring.`);
    }
  }

  async function joinCompetition(competitionId) {
    if (!competitionId || !currentAccount()) { openAuth("login"); return; }
    const response = await fetch(`${authApiRoot}/competitions/${encodeURIComponent(competitionId)}/join`, { method: "POST", credentials: "include" });
    if (!response.ok) { const data = await response.json().catch(() => ({})); window.alert(data.error || "Kunde inte delta i tävlingen."); return; }
    await loadRemoteCompetitions();
    renderCompetitionDetails(competitionId);
    window.alert("Du deltar nu i tävlingen.");
  }

  async function leaveCompetition(competitionId) {
    const response = await fetch(`${authApiRoot}/competitions/${encodeURIComponent(competitionId)}/leave`, { method: "POST", credentials: "include" });
    if (!response.ok) { const data = await response.json().catch(() => ({})); window.alert(data.error || "Kunde inte lämna tävlingen."); return; }
    await loadRemoteCompetitions();
    window.alert("Du har lämnat tävlingen.");
  }

  async function deleteCompetition(competitionId) {
    const competition = competitions().find((item) => item.id === competitionId);
    if (!competition || competition.createdBy !== currentAccount()?.id) return;
    if (!window.confirm(`Ta bort tävlingen ${competition.name}?`)) return;
    const response = await fetch(`${authApiRoot}/competitions/${encodeURIComponent(competitionId)}`, { method: "DELETE", credentials: "include" });
    if (!response.ok) { const data = await response.json().catch(() => ({})); window.alert(data.error || "Kunde inte ta bort tävlingen."); return; }
    const details = $("#competitionDetails");
    if (details) details.hidden = true;
    await loadRemoteCompetitions();
  }

  return {
    createCompetition,
    deleteCompetition,
    joinCompetition,
    leaveCompetition,
    renderCompetitionDetails,
    renderCompetitions,
    renderParticipantCatches,
    saveCompetition,
    toggleCompetitionDetails
  };
}
