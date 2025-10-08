
import { getStore, json, parseCookies } from './_util.mjs';
const USERS_KEY='users.json', SESS_KEY='sessions.json';

async function currentUser(store, cookies){
  const S=await store.get(SESS_KEY,{type:'json'})||{}; const token=cookies['inlev_sess']; const u=token&&S[token]; return u||null;
}
export async function handler(event){
  const store=await getStore();
  const path=(event.path||'').replace(/^\/.netlify\/functions\/[\w-]+/, ''); const method=event.httpMethod||'GET'; const cookies=parseCookies(event);
  const me=await currentUser(store,cookies); if(me!=='Admin') return json(403,{error:'admin only'});

  if (path.endsWith('/list')){
    const db=await store.get(USERS_KEY,{type:'json'})||{users:{}}; return json(200,{users:Object.keys(db.users)});
  }
  if (path.endsWith('/add') && method==='POST'){
    const b=JSON.parse(event.body||'{}'); const db=await store.get(USERS_KEY,{type:'json'})||{users:{}};
    if(!b.username||!b.password) return json(400,{error:'missing'});
    if(db.users[b.username]) return json(400,{error:'exists'});
    db.users[b.username]={hash:String(b.password)}; await store.setJSON(USERS_KEY,db); return json(200,{ok:true});
  }
  if (path.endsWith('/delete') && method==='POST'){
    const b=JSON.parse(event.body||'{}'); const db=await store.get(USERS_KEY,{type:'json'})||{users:{}};
    if(b.username==='Admin') return json(400,{error:'cannot delete Admin'});
    delete db.users[b.username]; await store.setJSON(USERS_KEY,db); return json(200,{ok:true});
  }
  return json(404,{error:'not found',path,method});
}
