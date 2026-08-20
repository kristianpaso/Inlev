export function createGroupController({ $, authApiRoot, currentAccount, escapeHtml, openAuth }) {
  async function loadGroups() {
    const target = $("#groupsList");
    if (!target || !currentAccount()) return;
    try {
      const response = await fetch(`${authApiRoot}/groups`, { credentials: "include" });
      const groups = await response.json();
      if (!response.ok) throw new Error(groups.error || "Kunde inte hamta grupper.");
      target.innerHTML = groups.length ? groups.map((group) => `<article class="group-live-card"><div class="group-live-heading"><div><h3>${escapeHtml(group.name)}</h3><p>${group.memberCount} medlemmar</p></div><strong>Rankning</strong></div><ol class="group-ranking">${group.ranking.slice(0, 10).map((member) => `<li><span>${escapeHtml(member.name)}</span><strong>${member.bigplus} Bigplus</strong><small>${member.bestLengthCm ? `${member.bestLengthCm.toFixed(1)} cm` : "-"}</small></li>`).join("")}</ol></article>`).join("") : `<div class="empty-list"><strong>Inga grupper annu</strong><span>Skapa din forsta grupp.</span></div>`;
    } catch (error) {
      target.innerHTML = `<div class="empty-list"><strong>${escapeHtml(error.message)}</strong><span>Starta om backend om gruppfunktionen inte svarar.</span></div>`;
    }
  }

  async function createGroup() {
    if (!currentAccount()) { openAuth("login"); return; }
    const name = window.prompt("Vad ska gruppen heta?");
    if (!name?.trim()) return;
    try {
      const response = await fetch(`${authApiRoot}/groups`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error || "Kunde inte skapa gruppen.");
        if (response.status === 401) openAuth("login");
        return;
      }
      await loadGroups();
    } catch (error) {
      window.alert(error.message || "Kunde inte ansluta till Bigplus-servern.");
    }
  }

  return {
    loadGroups,
    createGroup
  };
}
