import { $ } from "./dom.js";
import { speciesReferenceImage } from "./assets.js";
import { isBigplusCatch } from "./catch-utils.js";
import { escapeHtml, photoSource } from "./format.js";
import { personalBestKey, personalBests } from "./preferences.js";

const BASE_SPECIES = [
  "Abborre",
  "M\u00f6rt",
  "G\u00e4dda",
  "Braxen",
  "G\u00f6s",
  "Lake",
  "Ruda",
  "Sutare",
  "Id",
  "Bj\u00f6rkna",
  "Nors",
  "G\u00e4rs",
  "Elritsa",
  "St\u00e4m",
  "Lax",
  "\u00d6ring",
  "R\u00f6ding",
  "Sik",
  "Sikl\u00f6ja",
  "\u00c5l"
];

let latestList = [];
let editorBound = false;

function measurementOf(item) {
  return item.measurement || item;
}

function speciesNameOf(item) {
  const measurement = measurementOf(item);
  return measurement.speciesName || measurement.species || "";
}

function buildPersonalBestRows(list, includeEditorRows) {
  const manual = personalBests();
  const species = new Set(BASE_SPECIES);
  list.forEach((item) => {
    const name = speciesNameOf(item);
    if (name) species.add(name);
  });

  return [...species].map((name) => {
    const catchesForSpecies = list.filter((item) => String(speciesNameOf(item)).toLowerCase() === name.toLowerCase());
    const bigplusCatches = catchesForSpecies.filter(isBigplusCatch);
    const capturedBest = Math.max(0, ...bigplusCatches.map((item) => Number(measurementOf(item).lengthCm || 0)));
    const previousBest = Number(manual[name] || 0);
    const bestCatch = bigplusCatches.find((item) => Number(measurementOf(item).lengthCm || 0) === capturedBest);
    return {
      name,
      capturedBest,
      previousBest,
      best: Math.max(capturedBest, previousBest),
      photo: photoSource(bestCatch?.photoDataUrl || bestCatch?.photo),
      speciesPhoto: speciesReferenceImage(name)
    };
  })
    .filter((item) => item.capturedBest > 0 || item.previousBest > 0 || includeEditorRows)
    .sort((a, b) => b.best - a.best || a.name.localeCompare(b.name, "sv"));
}

function bindPersonalBestEditor(editor) {
  if (!editor || editorBound) return;
  editorBound = true;
  editor.addEventListener("change", (event) => {
    const input = event.target.closest("[data-personal-best-species]");
    if (!input) return;
    const values = personalBests();
    const value = Number(input.value);
    if (value > 0) values[input.dataset.personalBestSpecies] = value;
    else delete values[input.dataset.personalBestSpecies];
    localStorage.setItem(personalBestKey(), JSON.stringify(values));
    renderPersonalBestLists(latestList);
  });
}

export function renderPersonalBestLists(list = []) {
  latestList = Array.isArray(list) ? list : [];
  const home = $("#homePersonalBestList");
  const editor = $("#profilePersonalBestList");
  const catchShowcase = $("#catchPersonalBestList");
  if (!home && !editor && !catchShowcase) return;

  const rows = buildPersonalBestRows(latestList, Boolean(editor || catchShowcase));
  if (home) {
    const tableRows = rows.filter((item) => item.capturedBest > 0 || item.previousBest > 0).slice(0, 5);
    home.innerHTML = tableRows.length
      ? `<div class="personal-best-table"><div class="personal-best-table-head"><span>Art</span><span>Livstid</span><span>Bigplus</span></div>${tableRows.map((item) => {
        const image = item.speciesPhoto || speciesReferenceImage(item.name) || item.photo;
        return `<div class="personal-best-table-row"><div class="personal-best-species"><div class="personal-best-thumb"><img src="${image}" alt="${escapeHtml(item.name)}"></div><span class="personal-best-species-name">${escapeHtml(item.name)}</span></div><strong>${item.previousBest ? `${item.previousBest.toFixed(1)} cm` : "-- cm"}</strong><strong>${item.capturedBest ? `${item.capturedBest.toFixed(1)} cm` : "-- cm"}</strong></div>`;
      }).join("")}</div>`
      : `<div class="empty-list"><strong>Inga personb\u00e4sta \u00e4nnu</strong><span>M\u00e4t en fisk eller l\u00e4gg till tidigare resultat i profilen.</span></div>`;
  }

  if (editor) {
    editor.innerHTML = rows.map((item) => {
      const image = item.speciesPhoto || speciesReferenceImage(item.name) || item.photo;
      return `<article class="profile-personal-best-row">
        <div class="profile-personal-best-species">
          <div class="profile-personal-best-thumb">${image ? `<img src="${image}" alt="${escapeHtml(item.name)}">` : "<span>FISK</span>"}</div>
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <div class="profile-personal-best-bigplus"><span>Bigplus</span><strong>${item.capturedBest ? `${item.capturedBest.toFixed(1)} cm` : "-- cm"}</strong></div>
        <label class="profile-personal-best-input"><span>Livstid</span><input type="number" min="0" step="0.1" value="${item.previousBest || ""}" placeholder="-- cm" aria-label="Livstidsrekord f\u00f6r ${escapeHtml(item.name)}" data-personal-best-species="${escapeHtml(item.name)}"></label>
      </article>`;
    }).join("");
    bindPersonalBestEditor(editor);
  }

  if (catchShowcase) {
    const showcaseRows = rows.slice(0, 6);
    catchShowcase.innerHTML = showcaseRows.length
      ? showcaseRows.map((item) => {
        const image = item.speciesPhoto || speciesReferenceImage(item.name) || item.photo;
        const weight = latestList
          .filter((entry) => String(speciesNameOf(entry)).toLowerCase() === item.name.toLowerCase())
          .map((entry) => Number(measurementOf(entry).weightKg?.mid ?? measurementOf(entry).weightKg ?? measurementOf(entry).weight ?? 0))
          .find((value) => value > 0);
        return `<article class="catch-personal-best-card">
          <div class="catch-personal-best-copy"><strong>${escapeHtml(item.name)}</strong><span>🏆 ${item.best ? `${item.best.toFixed(1)} cm` : "-- cm"}</span><small>${weight ? `${weight.toFixed(1)} kg` : "-- kg"}</small></div>
          <img src="${image}" alt="${escapeHtml(item.name)}">
        </article>`;
      }).join("")
      : `<div class="empty-list"><strong>Inga personb\u00e4sta \u00e4nnu</strong><span>M\u00e4t din f\u00f6rsta fisk f\u00f6r att fylla raden.</span></div>`;
  }
}
