
import { getStore, json, parseCookies, rnd } from './_util.mjs';
const USERS_KEY='users.json', SESS_KEY='sessions.json';

async function ensureAdmin(store){
  const u=await store.get(USERS_KEY,{type:'json'})||{users:{}};
  if(!u.users['Admin']){ u.users['Admin']={hash:'123'}; await store.setJSON(USERS_KEY,u); }
}
export async function handler(event){
  const store=await getStore(); await ensureAdmin(store);
  const path=(event.path||'').replace(/^\/.netlify\/functions\/[\w-]+/, ''); const method=event.httpMethod||'GET'; const cookies=parseCookies(event);

  async function getSessions(){ return await store.get(SESS_KEY,{type:'json'})||{}; }
  async function saveSessions(S){ await store.setJSON(SESS_KEY,S); }

  if (path.endsWith('/login') && method==='POST'){
    const b=JSON.parse(event.body||'{}'); const db=await store.get(USERS_KEY,{type:'json'})||{users:{}}; const rec=db.users[b.username];
    if(!rec || rec.hash!==String(b.password)) return json(401,{error:'bad creds'});
    const token=rnd(); const S=await getSessions(); S[token]=b.username; await saveSessions(S);
    return json(200,{ok:true,user:b.username},`inlev_sess=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
  }
  if (path.endsWith('/logout') && method==='POST'){
    const token=cookies['inlev_sess']; const S=await getSessions(); if(token){ delete S[token]; await saveSessions(S); }
    return json(200,{ok:true},'inlev_sess=; Path=/; Max-Age=0');
  }
  if (path.endsWith('/me')){
    const token=cookies['inlev_sess']; const S=await getSessions(); const user=token&&S[token]; if(!user) return json(401,{error:'no'});
    return json(200,{user});
  }
  return json(404,{error:'not found',path,method});
}
