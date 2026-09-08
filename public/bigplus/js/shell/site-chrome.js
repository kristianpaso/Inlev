import { renderFooter } from "./footer.js";
import { inferActiveView, renderHeader, renderMobileNavigation } from "./header.js?v=20260908-header-icons-1";

export function mountSiteChrome() {
  const activeView = inferActiveView();
  const headerMount = document.getElementById("siteHeaderMount");
  const mobileNavMount = document.getElementById("mobileBottomNavMount");
  const footerMount = document.getElementById("siteFooterMount");
  if (headerMount) headerMount.innerHTML = renderHeader({ activeView });
  if (mobileNavMount) mobileNavMount.innerHTML = renderMobileNavigation({ activeView });
  if (footerMount) footerMount.innerHTML = renderFooter();
}
