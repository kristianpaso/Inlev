const ICONS = {
  home: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5v9.75c0 .7.55 1.25 1.25 1.25h10.5c.7 0 1.25-.55 1.25-1.25V9.5"/><path d="M9.5 20.5v-5h5v5"/></svg>',
  catches: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c3.2-4.8 8.8-6.2 15.8-4.3L21 5l.6 4.4c1.1.8 1.6 1.7 1.6 2.6s-.5 1.8-1.6 2.6L21 19l-2.2-2.7C11.8 18.2 6.2 16.8 3 12Z" fill="currentColor" fill-opacity=".16"/><path d="M3 12c3.2-4.8 8.8-6.2 15.8-4.3L21 5l.6 4.4c1.1.8 1.6 1.7 1.6 2.6s-.5 1.8-1.6 2.6L21 19l-2.2-2.7C11.8 18.2 6.2 16.8 3 12Z"/><circle cx="17" cy="10.3" r=".9" fill="currentColor" stroke="none"/><path d="m8.4 8.2 1.5 3.8-1.5 3.8M13 7.5l1.2 4.5-1.2 4.5"/></svg>',
  weather: '<svg class="nav-icon weather-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18.5h9.7a3.6 3.6 0 0 0 .5-7.2A5.4 5.4 0 0 0 7 9.8a4.35 4.35 0 0 0 .2 8.7Z" fill="currentColor" fill-opacity=".16"/><path d="M7.2 18.5h9.7a3.6 3.6 0 0 0 .5-7.2A5.4 5.4 0 0 0 7 9.8a4.35 4.35 0 0 0 .2 8.7Z"/><path d="M9 21c-.5.7-.5 1.2 0 1.7M14 21c-.5.7-.5 1.2 0 1.7"/></svg>',
  measure: '<svg class="nav-icon measure-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v13h-15z"/><path d="M8 5.5v3M11 5.5v2M14 5.5v3M17 5.5v2"/><path d="M8 18.5v-3M11 18.5v-2M14 18.5v-3M17 18.5v-2"/></svg>',
  competitions: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.5h9v5.2a4.5 4.5 0 0 1-9 0V4.5Z" fill="currentColor" fill-opacity=".16"/><path d="M7.5 4.5h9v5.2a4.5 4.5 0 0 1-9 0V4.5ZM5 5h2.5v2.2A3.8 3.8 0 0 1 5 5ZM19 5h-2.5v2.2A3.8 3.8 0 0 0 19 5ZM12 14.2v3.3M8.5 20.5h7M9.5 17.5h5"/></svg>',
  duels: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 4 15 15M19 4 4 19M7.5 6.5l-2 2M17.5 17.5l2-2M17.5 6.5l2 2M7.5 17.5l-2-2"/></svg>',
  profile: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="currentColor" fill-opacity=".16"/><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
  workspace: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M9.5 4.5v15M14.5 4.5v15M4.5 9.5h15M4.5 14.5h15"/></svg>',
  journal: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" fill="currentColor" fill-opacity=".16"/><path d="M6 4.5h12v15H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2ZM8 8h6M8 12h8M8 16h5"/></svg>'
};

const NAV_ITEMS = [
  { view: "home", label: "Hem", icon: ICONS.home },
  { view: "catches", label: "Fångster", icon: ICONS.catches },
  { view: "weather", label: "Väder", icon: ICONS.weather },
  { view: "measure", label: "Mät", icon: ICONS.measure },
  { view: "competitions", label: "Tävlingar", icon: ICONS.competitions },
  { view: "duels", label: "Duellen", icon: ICONS.duels },
  { view: "profile", label: "Profil", icon: ICONS.profile },
  { view: "workspace", label: "Workspace", icon: ICONS.workspace, admin: true },
  { view: "journal", label: "Fisketurer", icon: ICONS.journal }
];

const MOBILE_NAV_ITEMS = [
  { view: "home", label: "Hem", icon: ICONS.home },
  { view: "catches", label: "Fångster", icon: ICONS.catches },
  { view: "duels", label: "Duellen", icon: ICONS.duels },
  { view: "weather", label: "Väder", icon: ICONS.weather },
  { view: "measure", label: "Mät", icon: ICONS.measure },
  { view: "profile", label: "Profil", icon: ICONS.profile },
  { view: "workspace", label: "Workspace", icon: ICONS.workspace, admin: true }
];

function activeClass(view, activeView) { return view === activeView ? " active" : ""; }
function ariaCurrent(view, activeView) { return view === activeView ? ' aria-current="page"' : ""; }

function renderDesktopNav(activeView) {
  return NAV_ITEMS.map((item) => `<button class="nav-button${item.admin ? " admin-nav-button" : ""}${activeClass(item.view, activeView)}" type="button" data-view="${item.view}"${item.admin ? ' data-workspace-only hidden aria-hidden="true"' : ""}${ariaCurrent(item.view, activeView)}>${item.icon}<span>${item.label}</span></button>`).join("");
}

function renderMobileNav(activeView) {
  return MOBILE_NAV_ITEMS.map((item) => {
    const icon = `<span class="mobile-bottom-nav-icon">${item.icon}</span>`;
    return `<button class="mobile-bottom-nav-button${item.admin ? " admin-mobile-nav-button" : ""}${activeClass(item.view, activeView)}" type="button" data-view="${item.view}"${item.admin ? ' data-workspace-only hidden aria-hidden="true"' : ""}${ariaCurrent(item.view, activeView)}>${icon}<span>${item.label}</span></button>`;
  }).join("");
}

export function inferActiveView() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (/\/profil$/.test(path)) return "profile";
  if (/\/fisketurer$/.test(path)) return "journal";
  if (/\/tavlingar$/.test(path)) return "competitions";
  const requested = new URLSearchParams(window.location.search).get("view");
  return NAV_ITEMS.some((item) => item.view === requested) ? requested : "home";
}

export function renderHeader({ activeView = inferActiveView() } = {}) {
  const logo = "bigplus-header.png";
  return `<section class="site-header" aria-label="Bigplus header">
    <div class="header-app-shell">
      <section class="topbar">
        <div class="brand-header-image"><img src="/bigplus/assets/${logo}" alt="Bigplus Sport Fishing"></div>
        <div class="mobile-app-header">
          <button class="mobile-menu-button" id="mobileMenuButton" type="button" aria-label="Öppna meny" aria-expanded="false"><span></span><span></span><span></span></button>
          <img class="mobile-brand-logo" src="/bigplus/assets/${logo}" alt="Bigplus">
          <div class="mobile-header-actions">
            <button class="mobile-notification-button" type="button" aria-label="Notiser" title="Notiser"><span class="notification-bell" aria-hidden="true"></span><b>3</b></button>
            <button class="avatar-placeholder mobile-account-button" type="button" id="mobileAccountButton" aria-label="Öppna profil">B</button>
          </div>
        </div>
        <div class="desktop-app-controls">
          <label class="desktop-search"><span class="sr-only">Sök</span><input type="search" placeholder="Sök fångster, arter, sjöar..."><span aria-hidden="true"></span></label>
          <button class="desktop-notification" type="button" aria-label="Notiser" title="Notiser"><span class="desktop-bell" aria-hidden="true"></span><b>3</b></button>
          <button class="avatar-placeholder desktop-account-button" type="button" id="desktopAccountButton" aria-label="Öppna profil">B</button>
        </div>
        <nav class="app-nav" aria-label="Huvudmeny">${renderDesktopNav(activeView)}</nav>
        <div class="profile-menu" id="profileMenu" hidden>
          <button type="button" id="profileMenuEdit">Redigera profil</button>
          <button type="button" id="profileMenuLogout">Logga ut</button>
        </div>
        <div class="status-pill" id="connectionStatus" hidden>Redo</div>
      </section>
    </div>
  </section>`;
}

export function renderMobileNavigation({ activeView = inferActiveView() } = {}) {
  return `<nav class="mobile-bottom-nav" aria-label="Mobil navigation">${renderMobileNav(activeView)}</nav>`;
}

export function syncActiveNavigation(activeView) {
  document.querySelectorAll("[data-view]").forEach((button) => {
    if (button.dataset.view === activeView) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}
