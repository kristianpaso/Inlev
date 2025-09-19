
const USERS_KEY='users.json', SESS_KEY='sessions.json', CONF='schema_config.json', ENTRIES='schema_entries.json';
async function getStore(){
  if (process.env.LOCAL_BLOBS==='1' || process.env.NETLIFY_DEV==='true'){
    const fs = await import('node:fs');
    const path = (n)=>`.data/${n}`;
    return { async get(k,{type}={}){ try{const raw=fs.readFileSync(path(k),'utf8'); return type==='json'?JSON.parse(raw):raw }catch{ return null } },
             async setJSON(k,v){ fs.mkdirSync('.data',{recursive:true}); fs.writeFileSync(path(k), JSON.stringify(v)); return true; } };
  } else {
    const { getStore } = await import('@netlify/blobs'); return getStore('inlev');
  }
}
function json(status,body,cookie){ const h={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-credentials':'true'}; if(cookie) h['set-cookie']=cookie; return {statusCode:status,headers:h,body:JSON.stringify(body)}; }
function parseCookies(evt){ const s=(evt.headers&&evt.headers.cookie)||''; const out={}; s.split(';').forEach(p=>{const i=p.indexOf('='); if(i>0){ out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); }}); return out; }
function rnd(){ return Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2); }

export async function handler(event){
  const store=await getStore();
  const path=(event.path||'').replace(/^\/.netlify\/functions\/[\w-]+/, '');
  const method=event.httpMethod||'GET';
  const cookies=parseCookies(event);

  // bootstrap admin
  const udb=await (await store.get(USERS_KEY,{type:'json'})||{users:{}});
  if(!udb.users['Admin']){ udb.users['Admin']={hash:'123'}; await store.setJSON(USERS_KEY,udb); }

  async function getSessions(){ return await store.get(SESS_KEY,{type:'json'})||{}; }
  async function saveSessions(S){ await store.setJSON(SESS_KEY,S); }
  async function currentUser(){ const S=await getSessions(); return S[cookies['inlev_sess']]; }

  try{
    // AUTH
    if (path.startsWith('/auth/login') && method==='POST'){
      const b=JSON.parse(event.body||'{}'); const rec=udb.users[b.username];
      if(!rec || rec.hash!==String(b.password)) return json(401,{error:'bad creds'});
      const token=rnd(); const S=await getSessions(); S[token]=b.username; await saveSessions(S);
      return json(200,{ok:true,user:b.username},`inlev_sess=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
    }
    if (path.startsWith('/auth/logout') && method==='POST'){ const S=await getSessions(); delete S[cookies['inlev_sess']]; await saveSessions(S); return json(200,{ok:true},'inlev_sess=; Path=/; Max-Age=0'); }
    if (path.startsWith('/auth/me')){ const u=await currentUser(); if(!u) return json(401,{error:'no'}); return json(200,{user:u}); }

    // USERS (admin)
    if (path.startsWith('/users/')){
      const me=await currentUser(); if(me!=='Admin') return json(403,{error:'admin only'});
      if (path.startsWith('/users/list')) return json(200,{users:Object.keys(udb.users)});
      if (path.startsWith('/users/add') && method==='POST'){ const b=JSON.parse(event.body||'{}'); if(!b.username||!b.password) return json(400,{error:'missing'}); if(udb.users[b.username]) return json(400,{error:'exists'}); udb.users[b.username]={hash:String(b.password)}; await store.setJSON(USERS_KEY,udb); return json(200,{ok:true}); }
      if (path.startsWith('/users/delete') && method==='POST'){ const b=JSON.parse(event.body||'{}'); if(b.username==='Admin') return json(400,{error:'cannot delete Admin'}); delete udb.users[b.username]; await store.setJSON(USERS_KEY,udb); return json(200,{ok:true}); }
    }

    // SCHEMA
    if (path.startsWith('/schema/config')){ if(method==='GET'){ return json(200, await store.get(CONF,{type:'json'})||{areas:[],people:[]}); } if(method==='POST'){ await store.setJSON(CONF, JSON.parse(event.body||'{}')); return json(200,{ok:true}); } }
    if (path.startsWith('/schema/entries')){ if(method==='GET'){ return json(200, await store.get(ENTRIES,{type:'json'})||{items:[]}); } if(method==='POST'){ const d=await store.get(ENTRIES,{type:'json'})||{items:[]}; const b=JSON.parse(event.body||'{}'); const id='e_'+Date.now(); d.items.push({id,...b}); await store.setJSON(ENTRIES,d); return json(200,{ok:true,id}); } }
    if (path.startsWith('/schema/stats')){ const d=await store.get(ENTRIES,{type:'json'})||{items:[]}; const totals={}, perAreas={}; (d.items||[]).forEach(e=>(e.assignments||[]).forEach(a=>{ totals[a.person]=(totals[a.person]||0)+1; (perAreas[a.person]=perAreas[a.person]||{})[a.area]=(perAreas[a.person][a.area]||0)+1; })); return json(200,{totals,perAreas}); }

    return json(404,{error:'not found',path,method});
  }catch(e){ return json(500,{error:String(e),path,method}); }
}
