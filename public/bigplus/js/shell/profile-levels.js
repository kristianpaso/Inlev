import { $ } from "./dom.js";
import { achievementBadgeImage } from "./assets.js";
import { ensureMemberCode } from "./account.js";
import { isBigplusCatch } from "./catch-utils.js";
import { escapeHtml, photoSource } from "./format.js";
import { friendIds } from "./friends.js";
import { journalTrips } from "./journal.js";

export const PROFILE_LEVELS = [
  { level: 1, title: "Nybörjare", minXp: 0, maxXp: 499, group: "blue" },
  { level: 2, title: "Kastare", minXp: 500, maxXp: 999, group: "green" },
  { level: 3, title: "Fritidsfiskare", minXp: 1000, maxXp: 1799, group: "green" },
  { level: 4, title: "Sjövan", minXp: 1800, maxXp: 2799, group: "green" },
  { level: 5, title: "Artjägare", minXp: 2800, maxXp: 3999, group: "green" },
  { level: 6, title: "Spinnfiskare", minXp: 4000, maxXp: 5799, group: "cyan" },
  { level: 7, title: "Sportfiskare", minXp: 5800, maxXp: 7799, group: "cyan" },
  { level: 8, title: "Sjöutforskare", minXp: 7800, maxXp: 10199, group: "cyan" },
  { level: 9, title: "Metemästare", minXp: 10200, maxXp: 12999, group: "cyan" },
  { level: 10, title: "Ekolodssökare", minXp: 13000, maxXp: 15999, group: "cyan" },
  { level: 11, title: "Rovfiskare", minXp: 16000, maxXp: 19999, group: "purple" },
  { level: 12, title: "Taktiker", minXp: 20000, maxXp: 24499, group: "purple" },
  { level: 13, title: "Skärgårdsfiskare", minXp: 24500, maxXp: 29499, group: "purple" },
  { level: 14, title: "Storfiskjägare", minXp: 29500, maxXp: 34999, group: "purple" },
  { level: 15, title: "Specialist", minXp: 35000, maxXp: 41999, group: "purple" },
  { level: 16, title: "Mästerfiskare", minXp: 42000, maxXp: 48999, group: "bronze" },
  { level: 17, title: "Elitfiskare", minXp: 49000, maxXp: 56999, group: "bronze" },
  { level: 18, title: "Proffsfiskare", minXp: 57000, maxXp: 65999, group: "bronze" },
  { level: 19, title: "Ikon", minXp: 66000, maxXp: 75999, group: "bronze" },
  { level: 20, title: "Legend", minXp: 76000, maxXp: null, group: "legend" }
];

const PROFILE_MISSIONS = [
  { id: "welcome", icon: "★", title: "Välkommen till Bigplus", description: "Öppna appen och börja din resa.", xpReward: 20, minimumLevel: 1, target: 1, key: "profileStarted", tags: ["Kan göras hemma"] },
  { id: "profile_ready", icon: "☑", title: "Skapa din profil", description: "Lägg till namn och profilbild.", xpReward: 30, minimumLevel: 1, target: 2, key: "profileFields", tags: ["Kan göras hemma"] },
  { id: "first_catch", icon: "🐟", title: "Min första fångst", description: "Registrera en fisk.", xpReward: 100, minimumLevel: 1, target: 1, key: "totalCatches", tags: ["Kan göras själv"] },
  { id: "catch_photo", icon: "▣", title: "Fånga ögonblicket", description: "Lägg till en bild på en fångst.", xpReward: 40, minimumLevel: 1, target: 1, key: "photoCatches", tags: ["Kan göras själv"] },
  { id: "measure_fish", icon: "↔", title: "Mät din fisk", description: "Spara fiskens längd.", xpReward: 50, minimumLevel: 1, target: 1, key: "measuredCatches", tags: ["Kan göras själv"] },
  { id: "first_trip", icon: "☀", title: "Min första fisketur", description: "Registrera en fisketur, även utan fångst.", xpReward: 60, minimumLevel: 1, target: 1, key: "totalTrips", tags: ["Ingen fångst krävs"] },
  { id: "journal_line", icon: "✎", title: "Skriv din första rad", description: "Skriv en kort journalanteckning.", xpReward: 30, minimumLevel: 1, target: 1, key: "journalNotes", tags: ["Kan göras hemma"] },
  { id: "second_catch", icon: "🎣", title: "Andra fångsten", description: "Registrera totalt två fångster.", xpReward: 60, minimumLevel: 2, target: 2, key: "totalCatches", tags: ["Kan göras själv"] },
  { id: "three_fish", icon: "🐟", title: "Tre fiskar", description: "Registrera totalt tre fångster.", xpReward: 80, minimumLevel: 2, target: 3, key: "totalCatches", tags: ["Kan göras själv"] },
  { id: "two_places", icon: "⌖", title: "Två fiskeplatser", description: "Spara två olika platser.", xpReward: 70, minimumLevel: 2, target: 2, key: "locations", tags: ["Ingen båt krävs"] },
  { id: "two_trips", icon: "", title: "Två fisketurer", description: "Registrera två genomförda turer.", xpReward: 80, minimumLevel: 2, target: 2, key: "totalTrips", tags: ["Ingen fångst krävs"] },
  { id: "second_species", icon: "🐠", title: "Min andra art", description: "Registrera två olika arter.", xpReward: 100, minimumLevel: 3, target: 2, key: "speciesCount", tags: ["Kan göras själv"] },
  { id: "plan_trip", icon: "▤", title: "Planera en fisketur", description: "Skapa din första plan i Fisketurer.", xpReward: 80, minimumLevel: 3, target: 1, key: "plannedTrips", tags: ["Kan göras hemma"] },
  { id: "five_catches", icon: "🐟", title: "Fem fångster", description: "Registrera totalt fem fångster.", xpReward: 120, minimumLevel: 3, target: 5, key: "totalCatches", tags: ["Kan göras själv"] },
  { id: "ten_catches", icon: "🎣", title: "Tio fångster", description: "Registrera totalt tio fångster.", xpReward: 180, minimumLevel: 4, target: 10, key: "totalCatches", tags: ["Kan göras själv"] },
  { id: "four_species", icon: "🐠", title: "Fyra arter", description: "Registrera fyra olika arter.", xpReward: 180, minimumLevel: 5, target: 4, key: "speciesCount", tags: ["Kan göras själv"] },
  { id: "twenty_catches", icon: "🎣", title: "Tjugo fångster", description: "Registrera totalt tjugo fångster.", xpReward: 250, minimumLevel: 6, target: 20, key: "totalCatches", tags: ["Kan göras själv"] },
  { id: "seven_species", icon: "🐠", title: "Sju arter", description: "Registrera sju olika arter.", xpReward: 350, minimumLevel: 6, target: 7, key: "speciesCount", tags: ["Kan göras själv"] }
];

function measurementOf(item) {
  return item.measurement || item;
}

function formatNumber(value) {
  return new Intl.NumberFormat("sv-SE").format(Math.max(0, Math.round(Number(value) || 0)));
}

function formatActivityTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Idag";
  const today = new Date().toISOString().slice(0, 10);
  if (date.toISOString().slice(0, 10) === today) {
    return `Idag ${date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function dateKey(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function statsFor(account, list) {
  const trips = journalTrips();
  const species = new Set();
  const locations = new Set();
  let photoCatches = 0;
  let measuredCatches = 0;
  let totalWeight = 0;
  let topWeight = 0;
  list.forEach((item) => {
    const measurement = measurementOf(item);
    const speciesName = measurement.speciesName || measurement.species;
    if (speciesName) species.add(String(speciesName).toLowerCase());
    if (photoSource(item.photoDataUrl || item.photo)) photoCatches += 1;
    if (Number(measurement.lengthCm || 0) > 0) measuredCatches += 1;
    const weight = Number(measurement.weightKg?.mid ?? measurement.weightKg ?? measurement.weight ?? 0);
    totalWeight += Number.isFinite(weight) ? weight : 0;
    topWeight = Math.max(topWeight, Number.isFinite(weight) ? weight : 0);
    const place = item.location?.name || item.locationName || measurement.locationName || "";
    const lat = item.location?.latitude;
    const lng = item.location?.longitude;
    if (place) locations.add(String(place).toLowerCase());
    else if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) locations.add(`${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`);
  });
  const completedTrips = trips.filter((trip) => trip.date && trip.date < new Date().toISOString().slice(0, 10));
  return {
    profileStarted: account ? 1 : 0,
    profileFields: (account?.name ? 1 : 0) + (account?.photo ? 1 : 0),
    totalCatches: list.length,
    bigplusCatches: list.filter(isBigplusCatch).length,
    photoCatches,
    measuredCatches,
    speciesCount: species.size,
    locations: locations.size,
    totalTrips: Math.max(completedTrips.length, new Set(list.map((item) => dateKey(item.createdAt)).filter(Boolean)).size),
    plannedTrips: trips.length,
    journalNotes: trips.filter((trip) => String(trip.notes || "").trim()).length,
    totalWeight,
    topWeight,
    friendCount: account ? friendIds(account.id).length : 0
  };
}

function completedMissions(account, list) {
  const stats = statsFor(account, list);
  return PROFILE_MISSIONS.map((mission) => {
    const value = Math.min(Number(stats[mission.key] || 0), mission.target);
    return { ...mission, value, completed: value >= mission.target };
  });
}

function xpFromMissions(missions) {
  return missions.reduce((sum, mission) => sum + (mission.completed ? mission.xpReward : 0), 0);
}

function levelForXp(xp) {
  return PROFILE_LEVELS.find((level) => xp >= level.minXp && (level.maxXp === null || xp <= level.maxXp)) || PROFILE_LEVELS[PROFILE_LEVELS.length - 1];
}

function progressForXp(xp) {
  const current = levelForXp(xp);
  const next = PROFILE_LEVELS.find((item) => item.level === current.level + 1) || null;
  const max = current.maxXp ?? current.minXp;
  const span = Math.max(1, (max + 1) - current.minXp);
  const inLevel = Math.max(0, xp - current.minXp);
  return {
    current,
    next,
    percent: current.maxXp === null ? 100 : Math.min(100, Math.round((inLevel / span) * 100)),
    xpToNext: next ? Math.max(0, next.minXp - xp) : 0,
    nextGoal: next ? next.minXp : xp
  };
}

function profileImageMarkup(account, level, size = "xl", id = "") {
  const name = account?.name || "Bigplus";
  const photo = photoSource(account?.photo);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "B";
  const imageStyle = photo ? ` style="background-image:url('${escapeHtml(photo)}')"` : "";
  const photoId = id === "profileRankedAvatar" ? ' id="profileAvatar"' : "";
  return `<span ${id ? `id="${id}"` : ""} class="ranked-avatar ranked-avatar-${size} rank-${escapeHtml(level.group)}" data-level="${level.level}">
    <span class="ranked-avatar-frame"><span${photoId} class="ranked-avatar-photo avatar-placeholder"${imageStyle}>${photo ? "" : escapeHtml(initials)}</span></span>
    <strong>${level.level}</strong>
  </span>`;
}

function levelBadge(level) {
  return `<span class="level-badge level-badge-${escapeHtml(level.group)}"><span>${level.level}</span></span>`;
}

function renderLevelTrack(progress) {
  return PROFILE_LEVELS.map((level) => {
    const state = level.level < progress.current.level ? " is-complete" : level.level === progress.current.level ? " is-current" : "";
    return `<article class="profile-level-node${state}">
      ${levelBadge(level)}
      <div><strong>${escapeHtml(level.title)}</strong><small>${formatNumber(level.minXp)}${level.maxXp ? `-${formatNumber(level.maxXp)} XP` : "+ XP"}</small></div>
    </article>`;
  }).join("");
}

function recommendedMissions(missions, level) {
  const unlocked = missions.filter((mission) => mission.minimumLevel <= level.level && !mission.completed);
  const buckets = [
    unlocked.find((mission) => mission.value === 0 && mission.target <= 2),
    unlocked.find((mission) => mission.tags.includes("Kan göras själv")),
    unlocked.find((mission) => mission.tags.includes("Ingen fångst krävs") || mission.tags.includes("Kan göras hemma")),
    unlocked.sort((a, b) => (b.target - b.value) - (a.target - a.value))[0]
  ].filter(Boolean);
  const picked = [...new Map(buckets.map((item) => [item.id, item])).values()];
  if (picked.length < 4) {
    const pickedIds = new Set(picked.map((item) => item.id));
    missions
      .filter((mission) => !mission.completed && !pickedIds.has(mission.id))
      .sort((a, b) => a.minimumLevel - b.minimumLevel || a.target - b.target)
      .forEach((mission) => {
        if (picked.length < 4) picked.push(mission);
      });
  }
  return picked.slice(0, 4);
}

function missionTone(mission, index = 0) {
  const key = mission.key || "";
  if (key.includes("species")) return "species";
  if (key.includes("trip") || key.includes("journal")) return "trip";
  if (key.includes("location")) return "place";
  if (key.includes("photo")) return "photo";
  return ["catch", "goal", "trip", "place"][index % 4];
}

function renderMissionCard(mission) {
  const percent = Math.min(100, Math.round((mission.value / mission.target) * 100));
  return `<article class="profile-mission-card mission-${missionTone(mission)}">
    <span class="profile-mission-icon">${mission.icon}</span>
    <div class="profile-mission-copy">
      <strong>${escapeHtml(mission.title)}</strong>
      <span class="profile-mini-progress"><i style="width:${percent}%"></i></span>
      <em>${mission.value} / ${mission.target}</em>
    </div>
    <b>+${mission.xpReward} XP</b>
  </article>`;
}

function renderAllMissionRow(mission, index) {
  const percent = Math.min(100, Math.round((mission.value / mission.target) * 100));
  const tags = mission.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `<article class="profile-all-mission-row mission-${missionTone(mission, index)}${mission.completed ? " is-complete" : ""}">
    <span class="profile-mission-icon">${mission.icon}</span>
    <div>
      <strong>${escapeHtml(mission.title)}</strong>
      <small>${escapeHtml(mission.description)}</small>
      <span class="profile-mini-progress"><i style="width:${percent}%"></i></span>
      <em>${mission.value} / ${mission.target} · nivå ${mission.minimumLevel}</em>
      <span class="profile-mission-tags">${tags}</span>
    </div>
    <b>${mission.completed ? "Klar" : `+${mission.xpReward} XP`}</b>
  </article>`;
}

function renderFriendsOnline(account, accounts, options) {
  const target = $("#profileOnlineFriends");
  if (!target || !account) return;
  const ids = typeof options.acceptedFriendIds === "function" ? options.acceptedFriendIds(account.id) : friendIds(account.id);
  const friends = ids.map((id) => accounts().find((item) => String(item.id || item._id) === String(id))).filter(Boolean);
  const rows = friends.slice(0, 5).map((friend) => {
    const online = typeof options.isLive === "function" ? options.isLive(friend.id) : false;
    const friendLevel = levelForXp(0);
    return `<article class="profile-online-friend">
      ${profileImageMarkup(friend, friendLevel, "xs")}
      <span><strong>${escapeHtml(friend.name || "Fiskare")}</strong><small>${online ? "Online" : "Senast aktiv nyligen"}</small></span>
      <i class="${online ? "is-online" : ""}" aria-hidden="true"></i>
    </article>`;
  }).join("");
  target.innerHTML = rows || `<div class="empty-list compact-empty"><strong>Inga vänner online</strong><span>Lägg till vänner för att följa deras LIVE-status.</span></div>`;
}

function renderProfileFriendsPanel(account, accounts, options) {
  const target = $("#profileOnlineFriends");
  if (!target || !account) return;
  const ids = typeof options.acceptedFriendIds === "function" ? options.acceptedFriendIds(account.id) : friendIds(account.id);
  const remoteFriends = typeof options.remoteFriends === "function" ? (options.remoteFriends()?.friends || []) : [];
  const byId = new Map();
  [...accounts(), ...remoteFriends].forEach((friend) => {
    const id = String(friend.id || friend._id || "");
    if (id && id !== String(account.id || account._id || "")) byId.set(id, friend);
  });
  const friends = ids.map((id) => byId.get(String(id))).filter(Boolean);
  const rows = friends.sort((a, b) => {
    const aId = a.id || a._id;
    const bId = b.id || b._id;
    const liveDelta = Number(typeof options.isLive === "function" ? options.isLive(bId) : false) - Number(typeof options.isLive === "function" ? options.isLive(aId) : false);
    return liveDelta || String(a.name || "").localeCompare(String(b.name || ""), "sv");
  }).map((friend) => {
    const friendId = friend.id || friend._id;
    const online = typeof options.isLive === "function" ? options.isLive(friendId) : false;
    const friendLevel = levelForXp(0);
    return `<article class="profile-online-friend">
      ${profileImageMarkup(friend, friendLevel, "xs")}
      <span><strong>${escapeHtml(friend.name || "Fiskare")}</strong><small>${online ? "LIVE just nu" : "Inte LIVE just nu"}</small></span>
      <i class="${online ? "is-online" : ""}" aria-hidden="true"></i>
    </article>`;
  }).join("");
  target.innerHTML = rows || `<div class="empty-list compact-empty"><strong>Inga vänner än</strong><span>Lägg till vänner för att följa deras LIVE-status.</span></div>`;
}

function renderBadgeStrip(stats) {
  const target = $("#profileFeaturedBadges");
  if (!target) return;
  const badges = [
    ["Första fångsten", achievementBadgeImage("Första fisken"), stats.totalCatches >= 1],
    ["Ny art", achievementBadgeImage("5 arter fångade"), stats.speciesCount >= 2],
    ["Morgonfiskare", achievementBadgeImage("Din första Bigplus"), stats.bigplusCatches >= 1],
    ["Planeraren", achievementBadgeImage("Gå med i en grupp"), stats.plannedTrips >= 1],
    ["Streak 7 dagar", achievementBadgeImage("7 dagars streak"), false]
  ];
  target.innerHTML = badges.map(([label, image, unlocked]) => `<article class="profile-featured-badge${unlocked ? " is-unlocked" : ""}">
    <span>${image ? `<img src="${image}" alt="">` : "★"}</span>
    <strong>${escapeHtml(label)}</strong>
  </article>`).join("");
}

export function renderProfileLevelDashboard(list = [], options = {}) {
  const account = options.currentAccount?.();
  const stats = statsFor(account, list);
  const missions = completedMissions(account, list);
  const xp = xpFromMissions(missions);
  const progress = progressForXp(xp);
  const nextMissions = recommendedMissions(missions, progress.current);

  $("#profileRankedAvatar")?.replaceWith(document.createRange().createContextualFragment(profileImageMarkup(account, progress.current, "xl", "profileRankedAvatar")));
  const levelText = `${progress.current.title}`;
  const nextText = progress.next ? `${progress.next.title}` : "Legend";
  const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };

  setText("#profileLevelTitle", levelText);
  setText("#profileLevelNumber", `Nivå ${progress.current.level} av 20`);
  setText("#profileLevelXp", `${formatNumber(xp)} / ${formatNumber(progress.nextGoal)} XP`);
  setText("#profileLevelPercent", `${progress.percent}%`);
  setText("#profileNextLevelTitle", nextText);
  setText("#profileNextLevelNumber", progress.next ? `Nivå ${progress.next.level}` : "Maxnivå");
  setText("#profileXpToNext", progress.next ? `${formatNumber(progress.xpToNext)} XP kvar` : "Legend-XP fortsätter");
  setText("#profileSidebarLevel", levelText);
  setText("#profileSidebarLevelNumber", `Nivå ${progress.current.level}`);
  setText("#profileSidebarCatches", String(stats.totalCatches));
  setText("#profileSidebarTrips", String(stats.totalTrips));
  setText("#profileSidebarSpecies", String(stats.speciesCount));
  setText("#profileSidebarTopWeight", stats.topWeight ? stats.topWeight.toFixed(1).replace(".", ",") : "0");
  setText("#profileSidebarTotalWeight", stats.totalWeight ? `${stats.totalWeight.toFixed(1).replace(".", ",")} kg` : "0 kg");
  setText("#profileMissionCount", `${missions.filter((mission) => mission.completed).length} / ${missions.length}`);
  setText("#profileMemberCode", account ? ensureMemberCode(account) : "#-----");

  const progressBar = $("#profileLevelProgressBar");
  if (progressBar) progressBar.style.width = `${progress.percent}%`;
  const nextBadge = $("#profileNextLevelBadge");
  if (nextBadge) nextBadge.innerHTML = progress.next ? levelBadge(progress.next) : levelBadge(progress.current);
  const levelTrack = $("#profileLevelTrack");
  if (levelTrack) levelTrack.innerHTML = renderLevelTrack(progress);
  const missionsTarget = $("#profileNextMissions");
  if (missionsTarget) missionsTarget.innerHTML = nextMissions.map(renderMissionCard).join("");
  const xpTarget = $("#profileXpWays");
  if (xpTarget) {
    xpTarget.innerHTML = [
      ["Registrera en fångst", "+20 XP"],
      ["Fånga en ny art", "+100 XP"],
      ["Planera en fisketur", "+50 XP"],
      ["Bjud in en vän", "+30 XP"]
    ].map(([label, reward]) => `<article><span>★</span><strong>${escapeHtml(label)}</strong><b>${escapeHtml(reward)}</b></article>`).join("");
  }
  if (xpTarget) {
    xpTarget.innerHTML = [
      ["catch", "🎣", "Registrera en fångst", "+20 XP"],
      ["species", "🐠", "Fånga en ny art", "+100 XP"],
      ["trip", "🗓", "Planera en fisketur", "+50 XP"],
      ["place", "📍", "Slutför uppdrag", "+75-150 XP"]
    ].map(([tone, icon, label, reward]) => `<article class="mission-${tone}"><span>${icon}</span><strong>${escapeHtml(label)}</strong><b>${escapeHtml(reward)}</b></article>`).join("");
  }
  const activityTarget = $("#profileRecentActivity");
  if (activityTarget) {
    const rows = list.slice(0, 4).map((item) => {
      const measurement = measurementOf(item);
      const species = measurement.speciesName || measurement.species || "fångst";
      return `<article><span>🐟</span><strong>Du fångade ${escapeHtml(species)}</strong><b>+20 XP</b></article>`;
    });
    activityTarget.innerHTML = rows.length ? rows.join("") : `<article><span>★</span><strong>Din nivåresa är redo</strong><b>+20 XP</b></article>`;
  }
  if (activityTarget) {
    const rows = list.slice(0, 4).map((item) => {
      const measurement = measurementOf(item);
      const species = measurement.speciesName || measurement.species || "fångst";
      return `<article class="mission-catch"><span>🐟</span><strong>Du fångade ${escapeHtml(species)}</strong><small>${formatActivityTime(item.createdAt)}</small><b>+20 XP</b></article>`;
    });
    const starterRows = [
      `<article class="mission-trip"><span>🗓</span><strong>Du planerade en fisketur</strong><small>Idag</small><b>+50 XP</b></article>`,
      `<article class="mission-goal"><span>🎯</span><strong>Nytt personbästa väntar</strong><small>Redo</small><b>+150 XP</b></article>`
    ];
    activityTarget.innerHTML = (rows.length ? rows : starterRows).join("");
  }
  const allMissionsTarget = $("#profileAllMissions");
  if (allMissionsTarget) {
    const sorted = [...missions].sort((a, b) => Number(a.completed) - Number(b.completed) || a.minimumLevel - b.minimumLevel || a.title.localeCompare(b.title, "sv"));
    allMissionsTarget.innerHTML = sorted.map(renderAllMissionRow).join("");
  }
  const challengeProgress = Math.min(100, Math.round((stats.speciesCount / 5) * 100));
  setText("#profileWeeklyChallengeProgress", `${Math.min(stats.speciesCount, 5)} / 5 arter`);
  const weeklyBar = $("#profileWeeklyChallengeBar");
  if (weeklyBar) weeklyBar.style.width = `${challengeProgress}%`;
  renderProfileFriendsPanel(account, options.accounts || (() => []), options);
  renderBadgeStrip(stats);
}
