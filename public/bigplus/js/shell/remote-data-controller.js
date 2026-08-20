export function createRemoteDataController({
  authApiRoot,
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
  setCompetitionIds,
  setRemoteCatches,
  setRemoteCompetitions,
  setRemoteFriends
}) {
  async function loadRemoteCatches() {
    if (!currentAccount()) {
      setRemoteCatches(null);
      clearSharedCatches();
      return;
    }
    try {
      const response = await fetch(`${authApiRoot}/catches`, { credentials: "include" });
      if (!response.ok) {
        setRemoteCatches([]);
        renderCatchLists();
        loadSharedMapData();
        return;
      }
      setRemoteCatches(await response.json());
      renderCatchLists();
      loadSharedMapData();
    } catch {
      setRemoteCatches([]);
      renderCatchLists();
      loadSharedMapData();
    }
  }

  async function loadRemoteFriends() {
    if (!currentAccount()) {
      setRemoteFriends(null);
      renderFriends();
      return;
    }
    try {
      const response = await fetch(`${authApiRoot}/friends`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunde inte hamta vanner.");
      setRemoteFriends({
        friends: Array.isArray(data.friends) ? data.friends : [],
        incoming: Array.isArray(data.incoming) ? data.incoming : [],
        outgoing: Array.isArray(data.outgoing) ? data.outgoing : []
      });
    } catch {
      setRemoteFriends({ friends: [], incoming: [], outgoing: [] });
    }
    renderFriends();
    renderMapSharePanel();
    renderHomeFriendsOnline();
    await ensureRemoteFriendTournaments();
  }

  async function loadRemoteCompetitions() {
    if (!currentAccount()) {
      setRemoteCompetitions(null);
      return;
    }
    let competitions = [];
    try {
      const response = await fetch(`${authApiRoot}/competitions`, { credentials: "include" });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || "Kunde inte hamta tavlingar.");
      competitions = Array.isArray(data) ? data : [];
    } catch {
      competitions = [];
    }
    setRemoteCompetitions(competitions);
    setCompetitionIds(competitions.flatMap((item) => isCompetitionMember(item) ? [item.id] : []));
    renderCompetitions();
  }

  return {
    loadRemoteCatches,
    loadRemoteFriends,
    loadRemoteCompetitions
  };
}
