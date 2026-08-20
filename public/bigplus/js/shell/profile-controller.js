export function createProfileController({
  $,
  accountKey,
  accounts,
  authApiRoot,
  currentAccount,
  getPendingProfilePhoto,
  openAuth,
  setPendingProfilePhoto
}) {
  function renderAccount() {
    const account = currentAccount();
    const name = account?.name || "Logga in";
    const initial = name.trim().charAt(0).toUpperCase() || "B";
    const button = $("#accountButton");
    if (button) button.textContent = account ? name : "Logga in";
    [$("#homeProfileName"), $("#profileName")].forEach((el) => { if (el) el.textContent = name; });
    if ($("#profileHeading")) $("#profileHeading").textContent = "Min niv\u00e5";
    if ($("#homeGreeting")) $("#homeGreeting").textContent = "Hej!";
    if ($("#homeProfileSubtitle")) $("#homeProfileSubtitle").textContent = account ? "F\u00f6lj dina f\u00e5ngster och kl\u00e4ttra i Bigplus." : "Logga in f\u00f6r att se din profil och dina f\u00e5ngster.";
    if ($("#profileEmail")) $("#profileEmail").textContent = account?.email || "Logga in f\u00f6r att f\u00e5 ett eget konto.";
    if ($("#homeProfileLocation")) $("#homeProfileLocation").textContent = account ? account.email : "Logga in f\u00f6r att spara dina f\u00e5ngster.";
    if ($("#profileAccountHint")) $("#profileAccountHint").textContent = account ? "Dina f\u00e5ngster h\u00f6r ihop med ditt Bigplus-konto." : "Dina f\u00e5ngster sparas lokalt p\u00e5 den h\u00e4r enheten.";
    const avatarText = account?.name === "Admin Paso" ? "AP" : initial;
    [$("#homeAvatar"), $("#mobileAccountButton"), $("#desktopAccountButton"), $("#profileAvatar")].forEach((el) => {
      if (!el) return;
      el.textContent = account?.photo ? "" : avatarText;
      el.classList.toggle("has-profile-photo", Boolean(account?.photo));
      el.style.setProperty("background-image", account?.photo ? `url("${account.photo}")` : "none", "important");
      el.style.setProperty("background-size", account?.photo ? "cover" : "", "important");
      el.style.setProperty("background-position", account?.photo ? "center" : "", "important");
      el.style.setProperty("background-repeat", "no-repeat", "important");
    });
    if ($("#profileAuthButton")) $("#profileAuthButton").textContent = $("#profileAuthButton").classList.contains("profile-info-button") ? "S\u00e5 fungerar niv\u00e5er" : (account ? "Redigera konto" : "Logga in");
    if ($("#logoutButton")) $("#logoutButton").hidden = !account;
  }

  function updateSettingsPreview(photo, name) {
    const preview = $("#settingsPhotoPreview");
    if (!preview) return;
    preview.textContent = photo ? "" : (name.trim().slice(0, 2).toUpperCase() || "AP");
    preview.style.backgroundImage = photo ? `url("${photo}")` : "";
    preview.style.backgroundSize = photo ? "cover" : "";
    preview.style.backgroundPosition = photo ? "center" : "";
  }

  function openProfileSettings() {
    const account = currentAccount();
    if (!account) { openAuth("login"); return; }
    $("#profileNameInput").value = account.name || "";
    $("#profileUnitInput").value = localStorage.getItem("bigplus_unit") === "inch" ? "inch" : "cm";
    $("#profileVisibilityInput").checked = account.profileVisibility !== "private";
    setPendingProfilePhoto(account.photo || "");
    const photoInput = $("#profilePhotoInput");
    if (photoInput) { photoInput.value = ""; photoInput.dataset.photo = getPendingProfilePhoto(); }
    $("#profileSettingsMessage").textContent = "";
    updateSettingsPreview(account.photo || "", account.name || "");
    $("#profileSettingsModal").hidden = false;
  }

  async function saveProfile(event) {
    event.preventDefault();
    const account = currentAccount();
    if (!account) return;
    const list = accounts();
    const name = $("#profileNameInput").value.trim();
    const photo = getPendingProfilePhoto() || $("#profilePhotoInput").dataset.photo || account.photo || "";
    const profileVisibility = $("#profileVisibilityInput").checked ? "public" : "private";
    localStorage.setItem("bigplus_unit", $("#profileUnitInput").value === "inch" ? "inch" : "cm");
    const updated = list.map((item) => item.id === account.id ? { ...item, name, photo, profileVisibility } : item);
    localStorage.setItem(accountKey, JSON.stringify(updated));
    let savedRemotely = false;
    try {
      const response = await fetch(`${authApiRoot}/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, photo, profileVisibility })
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.user) {
          const remoteUpdated = accounts().map((item) => item.id === account.id ? data.user : item);
          localStorage.setItem(accountKey, JSON.stringify(remoteUpdated));
        }
        savedRemotely = true;
      }
    } catch {
      savedRemotely = false;
    }
    const message = $("#profileSettingsMessage");
    if (message) message.textContent = savedRemotely ? "Profilen \u00e4r sparad." : "Profilen \u00e4r sparad p\u00e5 den h\u00e4r enheten.";
    $("#profileSettingsModal").hidden = true;
    renderAccount();
    setPendingProfilePhoto(photo);
    window.dispatchEvent(new CustomEvent("bigplus:settings-changed"));
  }

  function closeProfileMenu() {
    const menu = $("#profileMenu");
    if (menu) menu.hidden = true;
  }

  function toggleProfileMenu() {
    const account = currentAccount();
    if (!account) { openAuth("login"); return; }
    const menu = $("#profileMenu");
    if (menu) menu.hidden = !menu.hidden;
  }

  return {
    renderAccount,
    openProfileSettings,
    updateSettingsPreview,
    saveProfile,
    closeProfileMenu,
    toggleProfileMenu
  };
}
