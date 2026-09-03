import { $ } from "./dom.js";
import { achievementBadgeImage } from "./assets.js";
import { isBigplusCatch } from "./catch-utils.js";
import { escapeHtml } from "./format.js";
import { API_ROOT } from "../api/config.js";

let managedAchievements = null;

export async function loadManagedAchievements() {
  try {
    const response = await fetch(`${API_ROOT}/achievements`, { credentials: "include" });
    const data = await response.json().catch(() => []);
    managedAchievements = response.ok && Array.isArray(data) && data.length ? data : null;
  } catch {
    managedAchievements = null;
  }
  return managedAchievements;
}

function metricValue(definition, list, options = {}) {
  const measurements = list.map(measurementOf);
  const bigplus = measurements.filter((item) => item.status === "BIGPLUS" || item.isBigplus);
  if (definition.metric === "bigplusCount") return bigplus.length;
  if (definition.metric === "speciesCount") return new Set(bigplus.map((item) => item.speciesName || item.species).filter(Boolean)).size;
  if (definition.metric === "pikeOver100") return bigplus.filter((item) => Number(item.lengthCm || 0) >= 100 && String(item.speciesName || item.species || "").toLowerCase().includes("gädd")).length;
  if (definition.metric === "friendCount") return options.friendIds?.().length || 0;
  if (definition.metric === "competitionWins") return measurements.filter((item) => item.competitionWon).length;
  if (definition.metric === "lengthOver100") return measurements.filter((item) => Number(item.lengthCm || 0) >= 100).length;
  if (definition.metric === "streak") return 0;
  return list.length;
}

function measurementOf(item) {
  return item.measurement || item;
}

function countBigplus(list) {
  return list.filter((item) => {
    const measurement = measurementOf(item);
    return measurement.status === "BIGPLUS" || measurement.isBigplus;
  }).length;
}

function countSpecies(list) {
  return new Set(list.map((item) => {
    const measurement = measurementOf(item);
    return measurement.speciesName || measurement.species;
  }).filter(Boolean)).size;
}

function countLongPike(list) {
  return list.filter((item) => {
    const measurement = measurementOf(item);
    const species = String(measurement.speciesName || measurement.species || "").toLowerCase();
    return Number(measurement.lengthCm || 0) >= 100 && species.includes("g" + "\u00e4dd");
  }).length;
}

function achievementOverview(list) {
  const bigplus = countBigplus(list);
  const species = countSpecies(list);
  const longPike = countLongPike(list);
  return [
    ["F" + "\u00f6rsta Bigplus", bigplus, 1, "F" + "\u00e5 din f" + "\u00f6rsta godk" + "\u00e4nda fisk"],
    ["Artm" + "\u00e4stare", species, 5, "F" + "\u00e5 Bigplus p" + "\u00e5 5 olika arter"],
    ["G" + "\u00e4ddj" + "\u00e4garen", longPike, 3, "F" + "\u00e5 3 g" + "\u00e4ddor " + "\u00f6ver 100 cm"],
    ["Fotom" + "\u00e4stare", list.length, 50, "Ladda upp 50 fiskar"]
  ];
}

export function renderHomeAchievements(list) {
  const target = $("#homeAchievementList");
  if (!target) return;

  const achievements = achievementOverview(list);
  const completed = achievements.filter(([, value, goal]) => value >= goal).length;
  const badgeIcons = [
    ["F\u00e5ngare", "Din f" + "\u00f6rsta Bigplus", "Niv\u00e5 8"],
    ["Artuppt\u00e4ckare", "5 arter f" + "\u00e5ngade", `${countSpecies(list)} arter`],
    ["G\u00e4ddj\u00e4garen", "G" + "\u00e4dda", "90+ cm"],
    ["Verifierad", "F\u00f6rsta verifierade", "Godk\u00e4nd"],
    ["Streak", "7 dagars streak", "7 dagar"],
    ["V\u00e4nskapsm\u00e4rke", "L\u00e4gg till en v\u00e4n", "Community"]
  ];
  const badges = badgeIcons.map(([title, assetName, meta], index) => {
    const icon = `<img src="${achievementBadgeImage(assetName)}" alt="" loading="lazy">`;
    const complete = index < completed;
    const label = complete ? "Uppl" + "\u00e5st badge" : "Ej uppl" + "\u00e5st badge";
    return `<span class="home-badge-icon home-badge-icon-${index + 1}${complete ? " is-complete" : ""}" aria-label="${label}">${icon}<strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span>`;
  }).join("");
  const progress = achievements.length ? Math.round((completed / achievements.length) * 100) : 0;

  target.innerHTML = `<div class="home-achievement-overview"><div class="home-badge-icon-row">${badges}</div><div class="home-achievement-progress-label"><strong>${completed} / ${achievements.length} m\u00e4rken uppl\u00e5sta</strong></div><div class="home-achievement-progress"><i style="width:${progress}%"></i></div></div>`;
}

export function renderHomeNextBadge(list) {
  const target = $("#homeNextBadge");
  if (!target) return;

  const achievementSection = document.querySelector(".home-achievement-section");
  const badgeSection = target.closest(".home-badge-section");
  if (!document.querySelector(".home-dashboard-v2") && achievementSection && badgeSection && achievementSection.nextElementSibling !== badgeSection) achievementSection.after(badgeSection);
  target.closest(".home-badge-section")?.querySelector(".section-heading h2")?.replaceChildren(document.createTextNode("P" + "\u00e5b" + "\u00f6rjade achievements"));

  const definitions = achievementOverview(list);
  const started = definitions.filter((item) => item[1] > 0 && item[1] < item[2]).sort((a, b) => (b[1] / b[2]) - (a[1] / a[2]));
  const notStarted = definitions.filter((item) => item[1] === 0 && item[1] < item[2]);
  const progressItems = [...started, ...notStarted].slice(0, 3);

  target.innerHTML = `<div class="home-progress-achievement-list">${progressItems.map(([name, value, goal, text], index) => {
    const progress = Math.min(100, value / goal * 100);
    const reward = [150, 100, 200][index] || 75;
    return `<article class="home-progress-achievement"><span class="home-progress-icon" aria-hidden="true">${["\u{1F41F}", "\u26A1", "\u{1F3C6}"][index] || "\u2726"}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(text)}</small><span class="achievement-progress"><i style="width:${progress}%"></i></span></span><b>${value} / ${goal}</b><em>Bel\u00f6ning ${reward} XP</em></article>`;
  }).join("")}</div>`;
}

export function renderAchievementPage(list, options = {}) {
  const target = $("#achievementGrid");
  if (!target) return;

  const friendIds = options.friendIds || (() => []);
  const memberships = options.memberships || (() => []);
  const bigplus = list.filter(isBigplusCatch);
  const hasSpecies = (name) => bigplus.some((item) => {
    const measurement = measurementOf(item);
    return String(measurement.speciesName || measurement.species || "").toLowerCase() === name.toLowerCase();
  });
  const species = [
    "Abborre", "M" + "\u00f6rt", "G" + "\u00e4dda", "Braxen", "G" + "\u00f6s", "Lake", "Ruda", "Sutare", "Id", "Bj" + "\u00f6rkna",
    "Nors", "G" + "\u00e4rs", "Elritsa", "St" + "\u00e4m", "Lax", "\u00d6ring", "R" + "\u00f6ding", "Sik", "Sikl" + "\u00f6ja", "\u00c5l"
  ];
  const points = [10, 10, 25, 15, 40, 50, 25, 35, 30, 15, 20, 15, 20, 15, 80, 70, 80, 40, 35, 100];
  let badges = species.map((name, index) => ({
    name,
    text: "F" + "\u00e5 en Bigplus p" + "\u00e5 " + name,
    value: hasSpecies(name) ? 1 : 0,
    goal: 1,
    points: points[index],
    icon: "\u25cf"
  }));
  const over = (cm) => list.filter((item) => Number(measurementOf(item).lengthCm || 0) >= cm).length;
  const captureDays = [...new Set(list.map((item) => {
    const timestamp = new Date(item.createdAt || measurementOf(item).createdAt || 0).getTime();
    return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
  }).filter(Boolean))].sort().reverse();
  let streak = 0;
  for (let index = 0; index < captureDays.length; index += 1) {
    const current = new Date(`${captureDays[index]}T00:00:00`);
    const previous = captureDays[index + 1] ? new Date(`${captureDays[index + 1]}T00:00:00`) : null;
    if (index === 0 || (previous && Math.round((current - previous) / 86400000) === 1)) streak += 1;
    else break;
  }

  const speciesCount = new Set(bigplus.map((item) => {
    const measurement = measurementOf(item);
    return measurement.speciesName || measurement.species;
  }).filter(Boolean)).size;

  badges.push(
    { name: "3 dagars streak", text: "Registrera en f\u00e5ngst tre dagar i rad", value: Math.min(streak, 3), goal: 3, points: 20, icon: "*" },
    { name: "7 dagars streak", text: "Registrera en f\u00e5ngst sju dagar i rad", value: Math.min(streak, 7), goal: 7, points: 40, icon: "*" },
    { name: "F\u00f6rsta fisken", text: "Registrera din f\u00f6rsta f\u00e5ngst", value: Math.min(list.length, 1), goal: 1, points: 10, icon: "\u25cf" },
    { name: "F\u00f6rsta \u00f6ver 10 cm", text: "M\u00e4t en fisk \u00f6ver 10 cm", value: Math.min(over(10), 1), goal: 1, points: 10, icon: "\u25b1" },
    { name: "F\u00f6rsta \u00f6ver 25 cm", text: "M\u00e4t en fisk \u00f6ver 25 cm", value: Math.min(over(25), 1), goal: 1, points: 15, icon: "\u25b1" },
    { name: "F\u00f6rsta verifierade", text: "Registrera en godk\u00e4nd f\u00e5ngst", value: Math.min(bigplus.length, 1), goal: 1, points: 20, icon: "\u2713" },
    { name: "Din f\u00f6rsta Bigplus", text: "F\u00e5 din f\u00f6rsta Bigplus", value: Math.min(bigplus.length, 1), goal: 1, points: 40, icon: "+" },
    { name: "5 arter f\u00e5ngade", text: "F\u00e5 Bigplus p\u00e5 5 olika arter", value: speciesCount, goal: 5, points: 30, icon: "\u25cf" },
    { name: "10 arter f\u00e5ngade", text: "F\u00e5 Bigplus p\u00e5 10 olika arter", value: speciesCount, goal: 10, points: 60, icon: "\u25cf" },
    { name: "50 f\u00e5ngster", text: "Registrera 50 f\u00e5ngster", value: list.length, goal: 50, points: 80, icon: "\u25a3" },
    { name: "100 f\u00e5ngster", text: "Registrera 100 f\u00e5ngster", value: list.length, goal: 100, points: 150, icon: "100" },
    { name: "L\u00e4gg till en v\u00e4n", text: "Bli v\u00e4n med en annan fiskare", value: Math.min(friendIds().length, 1), goal: 1, points: 10, icon: "+" },
    { name: "G\u00e5 med i en grupp", text: "Delta i en t\u00e4vling", value: Math.min(memberships().length, 1), goal: 1, points: 15, icon: "\u265f" },
    { name: "Vinn en utmaning", text: "Vinn en t\u00e4vling", value: list.filter((item) => measurementOf(item).competitionWon).length, goal: 1, points: 100, icon: "\u265c" },
    { name: "100-klubben", text: "F\u00e5 en Bigplus \u00f6ver 100 cm", value: bigplus.filter((item) => Number(measurementOf(item).lengthCm || 0) >= 100).length, goal: 1, points: 120, icon: "100" }
  );

  if (managedAchievements?.length) {
    badges = managedAchievements.filter((item) => item.visible !== false).map((item) => ({
      name: item.title,
      text: item.description,
      value: metricValue(item, list, { friendIds }),
      goal: Math.max(1, Number(item.target) || 1),
      points: Math.max(0, Number(item.points) || 0),
      icon: "★",
      image: item.image || ""
    }));
  }

  badges.forEach((item) => {
    const image = item.image || achievementBadgeImage(item.name);
    if (image) item.icon = `<img src="${image}" alt="${escapeHtml(item.name)} badge" loading="lazy">`;
  });
  const completed = badges.filter((item) => item.value >= item.goal).length;
  const rare = badges.filter((item) => item.value >= item.goal && item.points >= 50).length;
  $("#achievementCount")?.replaceChildren(document.createTextNode(String(completed)));
  $("#achievementRareCount")?.replaceChildren(document.createTextNode(String(rare)));
  $("#achievementGoalCount")?.replaceChildren(document.createTextNode(String(completed)));
  target.innerHTML = badges.map((item) => {
    const done = item.value >= item.goal;
    const progress = Math.min(100, item.value / item.goal * 100);
    return `<article class="achievement-card${done ? " is-complete" : ""}"><div class="achievement-badge ${done ? "fish-badge" : "target-badge"}">${item.icon}</div><h2>${escapeHtml(item.name.toUpperCase())}</h2><p>${escapeHtml(item.text)}<br><strong>${Math.min(item.value, item.goal)} / ${item.goal} \u00b7 ${item.points} p</strong></p><span class="achievement-card-progress"><i style="width:${progress}%"></i></span></article>`;
  }).join("");
}
