import { setAppLoading } from "./shell/loading.js";
import { mountSiteChrome } from "./shell/site-chrome.js";

const isJournalPath = /^\/(?:bigplus\/)?fisketurer\/?$/.test(window.location.pathname);
mountSiteChrome();
setAppLoading(true, isJournalPath ? "Laddar Fisketurer..." : "Laddar Profil...");

const profileMount = document.getElementById("profileViewMount");
const profileUrl = "/bigplus/profile-view.html?v=20260908-profile-cards-1";
const appShellPromise = import("./app-shell.js?v=20260908-shared-chrome-1");

if (!isJournalPath) {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    const response = await fetch(profileUrl, { cache: "no-store", signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) throw new Error(`Profile partial failed: ${response.status}`);
    const markup = await response.text();
    if (profileMount) profileMount.outerHTML = markup;
  } catch (error) {
    console.error("Could not load Profile view", error);
  }
}

await appShellPromise;
