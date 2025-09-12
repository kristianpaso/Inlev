export function token(){ return localStorage.getItem('inleverans_token')||''; }
export function ensureAuth(){ if(!token()){ location.href='/login.html'; return false;} return true;}
export function logout(){ localStorage.removeItem('inleverans_token'); location.href='/login.html'; }
