import { mountSiteChrome } from "./shell/site-chrome.js?v=20260908-header-icons-1";
import { setAppLoading } from "./shell/loading.js";

mountSiteChrome();
setAppLoading(true, "Laddar Tävlingar...");
await import("./app-shell.js?v=20260908-tavlingar-route-2");
