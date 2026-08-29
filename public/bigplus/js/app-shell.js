import { $, $$ } from "./shell/dom.js";
import {
  ACCOUNT_KEY,
  SESSION_KEY
} from "./shell/storage.js";
import { escapeHtml } from "./shell/format.js";
import { renderAchievementPage, renderHomeAchievements, renderHomeNextBadge } from "./shell/achievements.js";
import { renderPersonalBestLists } from "./shell/personal-bests.js";
import { AUTH_API_ROOT } from "./shell/api-root.js";
import { hasLiveFlag, isLive, liveChannel, normalizeLiveChannel, renderLiveStatus, setLive, setLiveChannel } from "./shell/live.js";
import { exposeAppLoading, setAppLoading } from "./shell/loading.js";
import { homeCatchView, setHomeCatchView, updateHomeCatchView } from "./shell/home-catch-view.js";
import { createHomeWidgets } from "./shell/home-widgets.js";
import { createLeaderboardRenderer } from "./shell/leaderboard.js";
import { createCompetitionCardHelpers } from "./shell/competition-cards.js";
import { createCompetitionController } from "./shell/competition-controller.js";
import { renderJournal, saveJournalTrip } from "./shell/journal.js";
import { createCatchDeleteController } from "./shell/catch-delete.js";
import { createCatchShareController } from "./shell/catch-share.js";
import { createCatchViewController } from "./shell/catch-view-controller.js?v=20260816-catches-map-depth-89";
import { createWeatherController } from "./shell/weather-controller.js?v=20260828-weather-map-alignment-1";
import { createMapSharingController } from "./shell/map-sharing.js";
import { createRemoteDataController } from "./shell/remote-data-controller.js";
import { createGroupController } from "./shell/group-controller.js";
import { createProfileController } from "./shell/profile-controller.js";
import { renderProfileLevelDashboard } from "./shell/profile-levels.js?v=20260828-profile-reference-restore-1";
import { createAuthController } from "./shell/auth-controller.js";
import { compressImageFile } from "./shell/image-utils.js";
import { accounts, currentAccount, ensureDemoAccount, ensureMemberCode } from "./shell/account.js";
import { friendIds } from "./shell/friends.js";
import { createFriendController } from "./shell/friend-controller.js";
import { createDuelController } from "./shell/duel-controller.js";
import { favoriteCompetition, setFavoriteCompetition } from "./shell/preferences.js";
import {
  competitionMetricLabel,
  competitionSpeciesLabel
} from "./shell/competition-utils.js";
import {
  calculateBigplusRank,
  completedAchievementCount,
  formatCatch,
  isBigplusCatch,
  recentWindowDelta
} from "./shell/catch-utils.js";
let remoteCatches = null;
let remoteCompetitions = null;
let remoteFriends = null;
let pendingProfilePhoto = "";
let authController = null;
let measureModulePromise = null;

function ensureMeasureModule() {
  if (!measureModulePromise) {
    measureModulePromise = import("./main.js?v=20260830-depth-v8");
  }
  return measureModulePromise;
}

exposeAppLoading();

function catches() {
  // MongoDB is the source of truth for an authenticated account. Do not let
  // old demo records from this browser leak into the member's views.
  if (currentAccount()) return Array.isArray(remoteCatches) ? remoteCatches : [];
  return [];
}
function competitions() {
  return currentAccount() && Array.isArray(remoteCompetitions) ? remoteCompetitions : [];
}
function isCompetitionMember(competition) {
  const accountId = currentAccount()?.id;
  return Boolean(accountId && (competition?.members || []).includes(accountId));
}
function acceptedFriendIds(accountId = currentAccount()?.id) {
  const remote = remoteFriends?.friends?.map((item) => String(item.id || item._id || "")).filter(Boolean) || [];
  return [...new Set([...friendIds(accountId), ...remote])].filter((id) => id !== String(accountId || ""));
}
function memberships() {
  return competitions().filter(isCompetitionMember);
}

const {
  renderHomeActivity,
  renderHomeCompetitionRank,
  renderHomeFriendsOnline,
  renderHomeTournament
} = createHomeWidgets({
  acceptedFriendIds,
  accounts,
  catches,
  competitions,
  currentAccount,
  favoriteCompetition,
  friendIds,
  isCompetitionMember,
  remoteFriends: () => remoteFriends,
  userCatches: catches
});

const renderLeaderboard = createLeaderboardRenderer({
  acceptedFriendIds,
  accounts,
  catches,
  currentAccount
});

const {
  competitionCard,
  decorateCompetitionCards
} = createCompetitionCardHelpers({
  competitionMetricLabel,
  competitionSpeciesLabel,
  competitions,
  currentAccount,
  isCompetitionMember
});

const {
  createCompetition,
  deleteCompetition,
  joinCompetition,
  leaveCompetition,
  renderCompetitionDetails,
  renderCompetitions,
  renderParticipantCatches,
  saveCompetition,
  toggleCompetitionDetails
} = createCompetitionController({
  accounts,
  authApiRoot: AUTH_API_ROOT,
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
});

const {
  acceptFriendRequest,
  clearFriendSearch,
  denyFriendRequest,
  ensureRemoteFriendTournaments,
  removeFriend,
  renderFriends,
  renderFriendTournaments,
  sendFriendRequest,
  submitFriendSearch
} = createFriendController({
  accounts,
  catches,
  completedAchievementCount,
  currentAccount,
  isBigplusCatch,
  isLive,
  liveChannel,
  renderHomeFriendsOnline,
  renderLiveStatus,
  remoteFriends: () => remoteFriends,
  authApiRoot: AUTH_API_ROOT,
  loadRemoteCompetitions,
  loadRemoteFriends
});
function userCatches() {
  return catches();
}

let catchViewController = null;
function renderCatchDetail(catchId, options = {}) { return catchViewController?.renderCatchDetail(catchId, options); }
function closeCatchDetailPanel() { return catchViewController?.closeCatchDetailPanel(); }
function renderCatchMap() { return catchViewController?.renderCatchMap(); }
function showCurrentLocationOnMap() { return catchViewController?.showCurrentLocationOnMap(); }
function setCatchMapMode(mode) { return catchViewController?.setCatchMapMode(mode); }
function setCatchMapLayer(layer) { return catchViewController?.setCatchMapLayer(layer); }
function zoomToCatchOnMap(catchId) { return catchViewController?.zoomToCatchOnMap(catchId); }
function zoomOutAfterCatchDetail() { return catchViewController?.zoomOutAfterCatchDetail(); }
function renderCatchLists() { return catchViewController?.renderCatchLists(); }

const mapSharingController = createMapSharingController({
  currentAccount,
  openAuth,
  userCatches,
  acceptedFriendIds,
  accounts,
  remoteFriends: () => remoteFriends,
  renderCatchMap
});
const {
  clearSharedCatches,
  createMapShareZone,
  deleteMapShareZone,
  getMapCatchRecords,
  getRemoteMapZones,
  loadSharedMapData,
  renderMapSharePanel,
  setRemoteMapZones,
  toggleMapSharing,
  updateMapShareControls
} = mapSharingController;

function catchRecordById(catchId) {
  return getMapCatchRecords().find((entry) => String(entry.id || entry._id) === String(catchId));
}

const catchDeleteController = createCatchDeleteController({
  getCatchRecordById: catchRecordById,
  getRemoteCatches: () => remoteCatches,
  setRemoteCatches: (next) => { remoteCatches = next; },
  renderCatchLists: () => renderCatchLists()
});
const { openDeleteCatchDialog, closeDeleteCatchDialog, confirmDeleteCatch } = catchDeleteController;

const catchShareController = createCatchShareController({
  currentAccount,
  openAuth,
  catchRecordById,
  loadRemoteFriends,
  remoteFriends: () => remoteFriends,
  acceptedFriendIds,
  accounts,
  remoteMapZones: getRemoteMapZones,
  setRemoteMapZones,
  renderMapSharePanel,
  updateMapShareControls
});
const { shareCatchCoordinates } = catchShareController;

catchViewController = createCatchViewController({
  calculateBigplusRank,
  catchRecordById,
  catches,
  completedAchievementCount,
  currentAccount,
  formatCatch,
  getMapCatchRecords,
  getRemoteMapZones,
  isBigplusCatch,
  openDeleteCatchDialog,
  recentWindowDelta,
  renderHomeAchievements,
  renderHomeActivity,
  renderHomeCompetitionRank,
  renderHomeFriendsOnline,
  renderHomeNextBadge,
  renderProfileLevelDashboard: (list) => renderProfileLevelDashboard(list, {
    acceptedFriendIds,
    accounts,
    currentAccount,
    isLive,
    remoteFriends: () => remoteFriends
  }),
  renderPersonalBestLists,
  setStatChange,
  updateHomeCatchView,
  userCatches
});

const weatherController = createWeatherController({
  userCatches
});

const remoteDataController = createRemoteDataController({
  authApiRoot: AUTH_API_ROOT,
  clearSharedCatches,
  currentAccount,
  ensureRemoteFriendTournaments,
  isCompetitionMember,
  loadSharedMapData,
  renderCatchLists,
  renderCompetitions,
  renderFriends,
  renderHomeFriendsOnline,
  renderMapSharePanel,
  setCompetitionIds: (ids) => { window.bigplusCompetitionIds = ids; },
  setRemoteCatches: (next) => { remoteCatches = next; },
  setRemoteCompetitions: (next) => { remoteCompetitions = next; },
  setRemoteFriends: (next) => { remoteFriends = next; }
});

async function loadRemoteCatches() { return remoteDataController.loadRemoteCatches(); }
async function loadRemoteFriends() { return remoteDataController.loadRemoteFriends(); }
async function loadRemoteCompetitions() { return remoteDataController.loadRemoteCompetitions(); }

const groupController = createGroupController({ $, authApiRoot: AUTH_API_ROOT, currentAccount, escapeHtml, openAuth });

const duelController = createDuelController({ authApiRoot: AUTH_API_ROOT, currentAccount });

async function loadGroups() { return groupController.loadGroups(); }
async function createGroup() { return groupController.createGroup(); }

function setStatChange(id, delta, suffix = "denna vecka") {
  const target = $(`#${id}`);
  if (!target) return;
  target.hidden = !delta;
  target.textContent = delta ? `+ +${delta} ${suffix}` : "";
}

const profileController = createProfileController({
  $,
  accountKey: ACCOUNT_KEY,
  accounts,
  authApiRoot: AUTH_API_ROOT,
  currentAccount,
  getPendingProfilePhoto: () => pendingProfilePhoto,
  openAuth,
  setPendingProfilePhoto: (next) => { pendingProfilePhoto = next; }
});

function renderAccount() { return profileController.renderAccount(); }
function openProfileSettings() { return profileController.openProfileSettings(); }
function updateSettingsPreview(photo, name) { return profileController.updateSettingsPreview(photo, name); }
async function saveProfile(event) { return profileController.saveProfile(event); }
function closeProfileMenu() { return profileController.closeProfileMenu(); }
function toggleProfileMenu() { return profileController.toggleProfileMenu(); }

function showView(view) {
  if (!currentAccount()) {
    document.body.classList.add("auth-required");
    openAuth("login");
    return;
  }
  document.body.classList.remove("auth-required");
  if (view === "measure") {
    ensureMeasureModule().catch((error) => {
      console.error("Kunde inte ladda mätverktyget", error);
      setAppLoading(false);
    });
  }
  const authModal = $("#authModal");
  if (authModal) authModal.hidden = true;
  document.body.classList.toggle("measure-active", view === "measure");
  $$('[data-app-view]').forEach((section) => { section.hidden = section.dataset.appView !== view; });
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const measure = $(".workspace");
  if (measure) measure.hidden = view !== "measure";
  if (view === "home" || view === "catches" || view === "profile" || view === "competitions" || view === "achievements" || view === "weather") renderCatchLists();
  if (view === "achievements") renderAchievementPage(userCatches(), { friendIds, memberships });
  if (view === "home" || view === "competitions") renderCompetitions();
  if (view === "journal") renderJournal();
  if (view === "weather") weatherController.renderWeather();
  if (view === "duels") duelController.open();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAuth(mode = "login") { return authController?.openAuth(mode); }
function setAuthMode(mode) { return authController?.setAuthMode(mode); }
function handleAuth(event) { return authController?.handleAuth(event); }

function refreshProfileLevelDashboard() {
  renderProfileLevelDashboard(userCatches(), {
    acceptedFriendIds,
    accounts,
    currentAccount,
    isLive,
    remoteFriends: () => remoteFriends
  });
}

function moveProfileLiveControls() {
  const controls = $("#profileView .profile-live-controls");
  const slot = $("#profileLiveControlSlot") || $("#profileView .profile-heading > div:first-child");
  if (!controls || !slot || controls === slot || controls.parentElement === slot) return;
  slot.appendChild(controls);
}

function bind() {
  moveProfileLiveControls();
  weatherController.bind();
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => {
    document.body.classList.remove("mobile-menu-open");
    $("#mobileMenuButton")?.setAttribute("aria-expanded", "false");
    showView(button.dataset.view);
  }));
  $$('[data-catch-view]').forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.catchView === "grid" ? "grid" : "list";
    setHomeCatchView(mode);
  }));
  $("#mobileMenuButton")?.addEventListener("click", (event) => {
    const open = document.body.classList.toggle("mobile-menu-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
    event.currentTarget.setAttribute("aria-label", open ? "Stäng meny" : "‰ppna meny");
  });
  $("#mobileAccountButton")?.addEventListener("click", toggleProfileMenu);
  $("#desktopAccountButton")?.addEventListener("click", toggleProfileMenu);
  $("#homeAvatar")?.addEventListener("click", toggleProfileMenu);
  $("#profileMenuEdit")?.addEventListener("click", () => { closeProfileMenu(); showView("profile"); openProfileSettings(); });
  $("#profileMenuLogout")?.addEventListener("click", () => { closeProfileMenu(); $("#logoutButton")?.click(); });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#profileMenu, #mobileAccountButton, #desktopAccountButton, #homeAvatar")) closeProfileMenu();
  });
  $$('[data-go-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.goView)));
  $("#journalNewTripButton")?.addEventListener("click", () => { $("#journalPlanner").hidden = false; $("#journalTripTitle")?.focus(); });
  $("#journalAddSpotButton")?.addEventListener("click", () => { $("#journalPlanner").hidden = false; $("#journalTripLocation")?.focus(); });
  $("#journalCancelButton")?.addEventListener("click", () => { $("#journalPlanner").hidden = true; });
  $("#journalTripForm")?.addEventListener("submit", saveJournalTrip);
  $("#createCompetitionButton")?.addEventListener("click", createCompetition);
  $("#competitionForm")?.addEventListener("submit", saveCompetition);
  duelController.bind();
  $("#competitionSpeciesAll")?.addEventListener("change", (event) => {
    document.querySelectorAll('input[name="competitionSpecies"]').forEach((input) => {
      input.disabled = event.target.checked;
    });
  });
  $("#cancelCompetitionButton")?.addEventListener("click", () => { $("#competitionCreatePanel").hidden = true; });
  $("#competitionsList")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-competition-action]");
    if (actionButton?.dataset.competitionAction === "join") joinCompetition(actionButton.dataset.competitionId);
    else if (actionButton?.dataset.competitionAction === "leave") leaveCompetition(actionButton.dataset.competitionId);
    else if (actionButton?.dataset.competitionAction === "delete") deleteCompetition(actionButton.dataset.competitionId);
    else if (actionButton?.dataset.competitionAction === "favorite") {
      const id = actionButton.dataset.competitionId;
      setFavoriteCompetition(favoriteCompetition() === id ? "" : id);
      renderCompetitions();
    }
    else {
      const card = event.target.closest(".competition-card");
      if (card) toggleCompetitionDetails(card.dataset.competitionId);
    }
  });
  $("#competitionDetails")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest('[data-competition-action="favorite"]');
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    const id = actionButton.dataset.competitionId;
    setFavoriteCompetition(favoriteCompetition() === id ? "" : id);
    renderCompetitions();
    renderCompetitionDetails(id);
  });
  $("#homeCompetitionList")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-competition-id]");
    if (card) { showView("competitions"); toggleCompetitionDetails(card.dataset.competitionId); }
  });
  $("#competitionParticipants")?.addEventListener("click", (event) => {
    const participant = event.target.closest(".competition-participant");
    if (participant) renderParticipantCatches(participant.dataset.competitionId, participant.dataset.participantId);
  });
  $("#allCatchList")?.addEventListener("click", (event) => {
    // The inline detail card lives inside the catch list; do not let its
    // buttons or image trigger the parent catch-row handler again.
    if (event.target.closest("#catchDetail")) return;
    const deleteButton = event.target.closest("[data-delete-catch]");
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      openDeleteCatchDialog(deleteButton.dataset.deleteCatch);
      return;
    }
    const row = event.target.closest("[data-catch-id]");
    if (row) {
      if (row.classList.contains("is-selected") && !$("#catchDetail")?.hidden) {
        closeCatchDetailPanel();
        return;
      }
      renderCatchDetail(row.dataset.catchId);
      zoomToCatchOnMap(row.dataset.catchId);
    }
  });
  $("#homeCatchList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-catch-id]");
    if (!row) return;
    showView("catches");
    renderCatchDetail(row.dataset.catchId);
    window.setTimeout(() => zoomToCatchOnMap(row.dataset.catchId), 0);
  });
  $("#allCatchList")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("#catchDetail")) return;
    const row = event.target.closest("[data-catch-id]");
    if (row) {
      event.preventDefault();
      if (row.classList.contains("is-selected") && !$("#catchDetail")?.hidden) {
        closeCatchDetailPanel();
        return;
      }
      renderCatchDetail(row.dataset.catchId);
      zoomToCatchOnMap(row.dataset.catchId);
    }
  });
  $("#showCatchesMap")?.addEventListener("click", () => {
    $("#catchMapPanel").hidden = false;
    renderCatchMap();
  });
  $("#catchPageLatestList")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-catch-id]");
    if (!row) return;
    renderCatchDetail(row.dataset.catchId, { overlay: true });
    window.setTimeout(() => zoomToCatchOnMap(row.dataset.catchId), 0);
  });
  $("#catchPageLatestList")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-catch-id]");
    if (!row) return;
    event.preventDefault();
    renderCatchDetail(row.dataset.catchId, { overlay: true });
    window.setTimeout(() => zoomToCatchOnMap(row.dataset.catchId), 0);
  });
  $("#showCurrentLocationOnMap")?.addEventListener("click", () => showCurrentLocationOnMap());
  document.addEventListener("bigplus:catch-map-mode", (event) => setCatchMapMode(event.detail?.mode));
  document.addEventListener("bigplus:catch-map-layer", (event) => setCatchMapLayer(event.detail?.layer));
  $("#shareMapWithFriends")?.addEventListener("click", async () => {
    const panel = $("#mapSharePanel");
    if (!panel) return;
    if (!panel.hidden && panel.classList.contains("is-open")) {
      panel.hidden = true;
      panel.classList.remove("is-open");
      return;
    }
    const mapPanel = $("#catchMapPanel");
    if (mapPanel && panel.parentElement !== mapPanel) mapPanel.append(panel);
    if (mapPanel) {
      mapPanel.hidden = false;
      renderCatchMap();
    }
    panel.hidden = false;
    panel.classList.add("is-open");
    renderMapSharePanel();
    // Refresh both lists so a newly accepted friend or newly saved catch is available immediately.
    await Promise.all([loadRemoteFriends(), loadSharedMapData()]);
  });
  $("#closeMapSharePanel")?.addEventListener("click", () => {
    const panel = $("#mapSharePanel");
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove("is-open");
  });
  $("#mapShareZoneForm")?.addEventListener("submit", createMapShareZone);
  $("#mapShareZoneList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-map-zone]");
    if (button) deleteMapShareZone(button.dataset.deleteMapZone);
  });
  $("#shareCatchCoordinates")?.addEventListener("click", shareCatchCoordinates);
  $("#deleteCatchCodeInput")?.addEventListener("input", (event) => {
    const value = String(event.target.value || "").trim().toUpperCase();
    event.target.value = value;
    const confirm = $("#confirmDeleteCatch");
    if (confirm) confirm.disabled = value.length !== 5;
    const message = $("#deleteCatchMessage");
    if (message) message.textContent = "";
  });
  $("#closeDeleteCatchModal")?.addEventListener("click", closeDeleteCatchDialog);
  $("#cancelDeleteCatch")?.addEventListener("click", closeDeleteCatchDialog);
  $("#confirmDeleteCatch")?.addEventListener("click", confirmDeleteCatch);
  $("#deleteCatchModal")?.addEventListener("click", (event) => {
    if (event.target.id === "deleteCatchModal") closeDeleteCatchDialog();
  });
  $("#hideCatchesMap")?.addEventListener("click", () => {
    $("#catchMapPanel").hidden = true;
  });
  $("#closeCatchDetail")?.addEventListener("click", () => {
    closeCatchDetailPanel();
  });
  $("#catchDetailImage")?.addEventListener("click", () => {
    const source = $("#catchDetailImage").src;
    if (!source) return;
    const mapPanel = $("#catchMapPanel");
    if (mapPanel) {
      mapPanel.dataset.wasVisibleForLightbox = String(!mapPanel.hidden);
      mapPanel.hidden = true;
    }
    $("#catchLightboxImage").src = source;
    $("#catchImageLightbox").hidden = false;
  });
  const closeCatchImageLightbox = () => {
    $("#catchImageLightbox").hidden = true;
    const mapPanel = $("#catchMapPanel");
    if (mapPanel?.dataset.wasVisibleForLightbox === "true") {
      mapPanel.hidden = false;
      renderCatchMap();
    }
    if (mapPanel) delete mapPanel.dataset.wasVisibleForLightbox;
  };
  $("#closeCatchImage")?.addEventListener("click", closeCatchImageLightbox);
  $("#catchImageLightbox")?.addEventListener("click", (event) => {
    if (event.target.id === "catchImageLightbox") closeCatchImageLightbox();
  });
  $("#closeCompetitionDetails")?.addEventListener("click", () => {
    $("#competitionDetails").hidden = true;
    $("#competitionDetails").removeAttribute("data-competition-id");
  });
  $("#accountButton")?.addEventListener("click", () => currentAccount() ? showView("profile") : openAuth("login"));
  $("#profileAuthButton")?.addEventListener("click", () => currentAccount() ? showView("profile") : openAuth("login"));
  $("#profileSettingsButton")?.addEventListener("click", openProfileSettings);
  const closeProfileMissionModal = () => {
    const modal = $("#profileMissionModal");
    if (modal) modal.hidden = true;
  };
  const openProfileMissionModal = () => {
    refreshProfileLevelDashboard();
    const modal = $("#profileMissionModal");
    if (modal) modal.hidden = false;
  };
  $("#profileShowAllMissions")?.addEventListener("click", openProfileMissionModal);
  $("#profileShowXpMissions")?.addEventListener("click", openProfileMissionModal);
  $("#closeProfileMissionModal")?.addEventListener("click", closeProfileMissionModal);
  $("#profileMissionModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "profileMissionModal") closeProfileMissionModal();
  });
  const closeLiveSettings = () => {
    const modal = $("#liveSettingsModal");
    if (modal) modal.hidden = true;
  };
  const openLiveSettings = () => {
    const account = currentAccount();
    if (!account) return openAuth("login");
    const duration = $("#liveDurationModalSelect");
    const channel = $("#liveChannelInput");
    const message = $("#liveSettingsMessage");
    const title = $("#liveSettingsTitle");
    const intro = $("#liveSettingsModal .auth-intro");
    if (title) title.textContent = "G\u00e5 live";
    if (intro) intro.textContent = "V\u00e4lj hur l\u00e4nge du vill synas f\u00f6r dina v\u00e4nner.";
    if (duration) duration.value = "60";
    if (channel) channel.value = liveChannel(account.id);
    if (message) message.textContent = "";
    const modal = $("#liveSettingsModal");
    if (modal) modal.hidden = false;
  };
  const startLiveFromSettings = () => {
    const account = currentAccount();
    if (!account) return openAuth("login");
    const rawChannel = $("#liveChannelInput")?.value || "";
    const channel = normalizeLiveChannel(rawChannel);
    if (rawChannel.trim() && !channel) {
      const message = $("#liveSettingsMessage");
      if (message) message.textContent = "Ange en giltig http(s)-länk till din stream.";
      return;
    }
    setLiveChannel(account.id, channel);
    setLive(account.id, true, Number($("#liveDurationModalSelect")?.value || 60));
    closeLiveSettings();
    renderLiveStatus(account);
    renderFriends();
    renderHomeFriendsOnline();
    refreshProfileLevelDashboard();
  };
  $("#liveStatusButton")?.addEventListener("click", () => {
    const account = currentAccount();
    if (!account) return openAuth("login");
    if (isLive(account.id)) {
      setLive(account.id, false);
      renderLiveStatus(account);
      renderFriends();
      renderHomeFriendsOnline();
      refreshProfileLevelDashboard();
    } else {
      openLiveSettings();
    }
  });
  $("#closeLiveSettingsButton")?.addEventListener("click", closeLiveSettings);
  $("#confirmLiveButton")?.addEventListener("click", startLiveFromSettings);
  $("#liveSettingsModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "liveSettingsModal") closeLiveSettings();
  });
  window.setInterval(() => {
    const account = currentAccount();
    if (!account) return;
    const wasLive = hasLiveFlag(account.id);
    const active = isLive(account.id);
    renderLiveStatus(account);
    if (wasLive && !active) {
      renderFriends();
      renderHomeFriendsOnline();
    }
  }, 30000);
  $("#friendSearchInput")?.addEventListener("input", clearFriendSearch);
  $("#friendAddForm")?.addEventListener("submit", submitFriendSearch);
  $("#friendSuggestions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-friend-id]");
    if (button) sendFriendRequest(button.dataset.friendId);
  });
  $("#friendList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-accept-friend-request]");
    if (button) acceptFriendRequest(button.dataset.acceptFriendRequest);
    const denyButton = event.target.closest("[data-deny-friend-request]");
    if (denyButton) denyFriendRequest(denyButton.dataset.denyFriendRequest);
    const removeButton = event.target.closest("[data-remove-friend]");
    if (removeButton) removeFriend(removeButton.dataset.removeFriend);
  });
  $("#copyMemberCode")?.addEventListener("click", async () => {
    const code = ensureMemberCode(currentAccount());
    try { await navigator.clipboard.writeText(code); } catch { window.prompt("Kopiera ditt medlemsnummer", code); }
    $("#copyMemberCode").textContent = "Kopierat";
    setTimeout(() => { if ($("#copyMemberCode")) $("#copyMemberCode").textContent = "Kopiera"; }, 1400);
  });
  $("#closeProfileSettingsButton")?.addEventListener("click", () => { $("#profileSettingsModal").hidden = true; });
  $("#profileSettingsModal")?.addEventListener("click", (event) => { if (event.target.id === "profileSettingsModal") event.currentTarget.hidden = true; });
  $("#profileSettingsForm")?.addEventListener("submit", saveProfile);
  $("#profilePhotoInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    compressImageFile(file, { maxEdge: 800, quality: 0.76 }).then((photo) => {
      pendingProfilePhoto = photo;
      event.target.dataset.photo = pendingProfilePhoto;
      updateSettingsPreview(pendingProfilePhoto, $("#profileNameInput").value);
    }).catch(() => {
      event.target.value = "";
    });
  });
  $("#closeAuthButton")?.addEventListener("click", () => openAuth("login"));
  $("#authModal")?.addEventListener("click", (event) => { if (event.target.id === "authModal") openAuth("login"); });
  $$('[data-auth-mode]').forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  $("#authForm")?.addEventListener("submit", handleAuth);
  $("#toggleAuthPassword")?.addEventListener("click", (event) => {
    const input = $("#authPassword");
    if (!input) return;
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    event.currentTarget.textContent = visible ? "+" : "+";
    event.currentTarget.setAttribute("aria-label", visible ? "Dölj lösenord" : "Visa lösenord");
    event.currentTarget.setAttribute("title", visible ? "Dölj lösenord" : "Visa lösenord");
  });
  $("#logoutButton")?.addEventListener("click", async () => { await fetch(`${AUTH_API_ROOT}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {}); remoteCatches = null; remoteFriends = null; localStorage.removeItem(SESSION_KEY); localStorage.removeItem("inlev_user"); renderAccount(); showView("home"); });
  window.addEventListener("bigplus:catch-saved", async (event) => {
    setAppLoading(true, "Laddar din fångst...");
    try {
      renderCatchLists();
      await Promise.all([
        loadRemoteCatches(),
        loadRemoteFriends(),
        loadRemoteCompetitions()
      ]);
      const catchId = event.detail?.catchId;
      showView("catches");
      if (catchId) {
        renderCatchDetail(catchId);
      }
    } finally {
      setAppLoading(false);
    }
  });
  window.addEventListener("storage", () => { renderAccount(); renderCatchLists(); renderFriends(); });
}

authController = createAuthController({
  accountKey: ACCOUNT_KEY,
  authApiRoot: AUTH_API_ROOT,
  currentAccount,
  ensureDemoAccount,
  loadInitialRemoteData: () => loadInitialRemoteData(),
  renderAccount,
  sessionKey: SESSION_KEY,
  showView
});

bind();
renderAccount();
renderFriends();
renderCatchLists();
renderCompetitions();

// Vänta på backendens session innan appen visas. Annars kan ett gammalt
// localStorage-konto öppna appen som en falsk gäst eller låsa fast loginvyn.
async function loadInitialRemoteData() {
  await Promise.all([
    loadRemoteCatches(),
    loadRemoteFriends(),
    loadRemoteCompetitions()
  ]);
  renderAccount();
  renderCatchLists();
  renderFriends();
  renderCompetitions();
}

authController.bootstrap();









