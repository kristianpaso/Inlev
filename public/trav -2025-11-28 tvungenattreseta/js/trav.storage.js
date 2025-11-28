// Per-spel lagring i localStorage (helt separerat per ?game=id)
const KEY = (gameId, suf) => `trav:${gameId}:${suf}`;

export const TravStore = {
  load(gameId) {
    const meta    = JSON.parse(localStorage.getItem(KEY(gameId,'meta'))    || '{}');
    const horses  = JSON.parse(localStorage.getItem(KEY(gameId,'horses'))  || '[]'); // array per avd
    const picks   = JSON.parse(localStorage.getItem(KEY(gameId,'picks'))   || '{}'); // { avd: [1,5,8] }
    const coupons = JSON.parse(localStorage.getItem(KEY(gameId,'coupons')) || '[]'); // [{id, parts:[[...],[...],...]}]
    return { meta, horses, picks, coupons };
  },
  save(gameId, data) {
    if (data.meta     !== undefined) localStorage.setItem(KEY(gameId,'meta'),     JSON.stringify(data.meta));
    if (data.horses   !== undefined) localStorage.setItem(KEY(gameId,'horses'),   JSON.stringify(data.horses));
    if (data.picks    !== undefined) localStorage.setItem(KEY(gameId,'picks'),    JSON.stringify(data.picks));
    if (data.coupons  !== undefined) localStorage.setItem(KEY(gameId,'coupons'),  JSON.stringify(data.coupons));
  }
};
