import { escapeHtml, formatCompetitionDate } from "./format.js";

export function createCompetitionCardHelpers({
  competitionMetricLabel,
  competitionSpeciesLabel,
  competitions,
  currentAccount,
  isCompetitionMember
}) {
  function competitionCardMarkup(competition, options = {}) {
    const days = Number(competition.daysLeft);
    const ending = Number.isFinite(days) ? `Avslutas om ${days} dagar` : "Aktiv t\u00e4vling";
    const joined = isCompetitionMember(competition);
    const owner = competition.createdBy && competition.createdBy === currentAccount()?.id;
    const homeOnly = options.home;
    const daysBadge = Number.isFinite(days) ? `<span class="competition-days-badge">${days} dagar</span>` : "";
    const participationAction = joined
      ? `<button class="secondary-button competition-leave-button" type="button" data-competition-action="leave" data-competition-id="${escapeHtml(competition.id)}">L\u00e4mna</button>`
      : `<button class="secondary-button competition-join-button" type="button" data-competition-action="join" data-competition-id="${escapeHtml(competition.id)}">Delta</button>`;
    const action = owner
      ? `${participationAction}<button class="secondary-button competition-delete-button" type="button" data-competition-action="delete" data-competition-id="${escapeHtml(competition.id)}">Ta bort</button>`
      : participationAction;
    const details = homeOnly
      ? `<small class="home-competition-species">${escapeHtml(competitionMetricLabel(competition))} \u00b7 ${escapeHtml(competitionSpeciesLabel(competition))}</small>`
      : `<p>${escapeHtml(competition.description || "M\u00e4t och j\u00e4mf\u00f6r dina f\u00e5ngster.")}</p><small>${ending} \u00b7 Skapad ${formatCompetitionDate(competition.createdAt)}</small><small class="competition-rule-summary">${escapeHtml(competitionMetricLabel(competition))} \u00b7 ${escapeHtml(competitionSpeciesLabel(competition))}</small>`;
    return `<article class="competition-card${homeOnly ? " competition-card-home" : ""}" data-competition-id="${escapeHtml(competition.id)}"${homeOnly ? ' role="button" tabindex="0"' : ""}><div class="competition-card-main"><span class="competition-emblem" aria-hidden="true">\u2605</span><div><h3>${escapeHtml(competition.name)}${daysBadge}${owner ? '<span class="competition-title-star" aria-label="Skapad av dig">\u2605</span>' : ""}</h3>${details}${owner ? '<span class="competition-owner-label">Din t\u00e4vling</span>' : ""}</div></div>${homeOnly ? "" : `<div class="competition-card-actions">${action}</div>`}</article>`;
  }

  function competitionCard(competition, options) {
    return `<div class="competition-card-shell" data-competition-shell-id="${escapeHtml(competition.id)}">${competitionCardMarkup(competition, options)}</div>`;
  }

  function decorateCompetitionCards(target) {
    target.querySelectorAll(".competition-card").forEach((card) => {
      const competition = competitions().find((item) => item.id === card.dataset.competitionId);
      const title = card.querySelector("h3");
      const days = Number(competition?.daysLeft);
      if (!title || !Number.isFinite(days) || title.querySelector(".competition-days-badge")) return;
      title.insertAdjacentHTML("beforeend", `<span class="competition-days-badge"><b>${days}</b> dagar</span>`);
    });
  }

  return { competitionCard, competitionCardMarkup, decorateCompetitionCards };
}
