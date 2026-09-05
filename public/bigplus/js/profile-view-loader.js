import { setAppLoading } from "./shell/loading.js";

const isJournalPath = /^\/(?:bigplus\/)?fisketurer\/?$/.test(window.location.pathname);
setAppLoading(true, isJournalPath ? "Laddar Fisketurer..." : "Laddar Profil...");

const profileMount = document.getElementById("profileViewMount");
const profileUrl = "/bigplus/profile-view.html?v=20260903-profile-partial-2";
const appShellPromise = import("./app-shell.js?v=20260905-journal-placement-flow-4");

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
