
const USERS_KEY='users.json', SESS_KEY='sessions.json', CONF='schema_config.json', ENTRIES='schema_entries.json', PROFILES='schema_profiles.json';
async function getStore(){
  if (process.env.LOCAL_BLOBS==='1' || process.env.NETLIFY_DEV==='true'){
    const fs = await import('node:fs'); const p=(n)=>`.data/${n}`;
    return { async get(k,{type}={}){ try{const raw=fs.readFileSync(p(k),'utf8'); return type==='json'?JSON.parse(raw):raw}catch{return null} },
             async setJSON(k,v){ fs.mkdirSync('.data',{recursive:true}); fs.writeFileSync(p(k),JSON.stringify(v)); } };
  } else { const { getStore } = await import('@netlify/blobs'); return getStore('inlev'); }
}
function json(s,b,c){ const h={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-credentials':'true'}; if(c) h['set-cookie']=c; return {statusCode:s,headers:h,body:JSON.stringify(b)}}
function cookies(evt){ const s=(evt.headers&&evt.headers.cookie)||''; const o={}; s.split(';').forEach(p=>{const i=p.indexOf('='); if(i>0)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}); return o; }
function rnd(){ return Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2); }
export async function handler(event){
  const store=await getStore();
  const path=(event.path||'').replace(/^\/\.netlify\/functions\/api/,''); const meth=event.httpMethod||'GET'; const q=Object.fromEntries(new URLSearchParams(event.queryStringParameters||{})); const ck=cookies(event);
  const udb=await (await store.get(USERS_KEY,{type:'json'})||{users:{}}); if(!udb.users['Admin']){ udb.users['Admin']={hash:'123'}; await store.setJSON(USERS_KEY,udb); }
  async function sess(){ return await store.get(SESS_KEY,{type:'json'})||{} } async function saveS(S){ await store.setJSON(SESS_KEY,S) } async function me(){ const S=await sess(); return S[ck.inlev_sess] }
  try{
    if(path.startsWith('/auth/login') && meth==='POST'){ const b=JSON.parse(event.body||'{}'); const rec=udb.users[b.username]; if(!rec||rec.hash!==String(b.password)) return json(401,{error:'bad'});
      const t=rnd(); const S=await sess(); S[t]=b.username; await saveS(S); return json(200,{ok:true,user:b.username},`inlev_sess=${encodeURIComponent(t)}; Path=/; HttpOnly; SameSite=Lax`) }
    if(path.startsWith('/auth/logout') && meth==='POST'){ const S=await sess(); delete S[ck.inlev_sess]; await saveS(S); return json(200,{ok:true},'inlev_sess=; Path=/; Max-Age=0') }
    if(path.startsWith('/auth/me')){ const u=await me(); if(!u) return json(401,{error:'no'}); return json(200,{user:u}) }
    if(path.startsWith('/users/')){ const u=await me(); if(u!=='Admin') return json(403,{error:'admin'});
      if(path.startsWith('/users/list')) return json(200,{users:Object.keys(udb.users)});
      if(path.startsWith('/users/add') && meth==='POST'){ const b=JSON.parse(event.body||'{}'); if(!b.username||!b.password) return json(400,{error:'missing'});
        if(udb.users[b.username]) return json(400,{error:'exists'}); udb.users[b.username]={hash:String(b.password)}; await store.setJSON(USERS_KEY,udb); return json(200,{ok:true}) }
      if(path.startsWith('/users/delete') && meth==='POST'){ const b=JSON.parse(event.body||'{}'); if(b.username==='Admin') return json(400,{error:'no'}); delete udb.users[b.username]; await store.setJSON(USERS_KEY,udb); return json(200,{ok:true}) }
    }
    if(path.startsWith('/schema/config')){
      if(meth==='GET')  return json(200, await store.get(CONF,{type:'json'})||{});
      if(meth==='POST'){ const b=JSON.parse(event.body||'{}'); const cur=await store.get(CONF,{type:'json'})||{}; const nxt=Object.assign(cur,b); await store.setJSON(CONF,nxt); return json(200,{ok:true}) }
    }
    if(path.startsWith('/schema/profiles')){
      const db=await store.get(PROFILES,{type:'json'})||{items:[]};
      if(meth==='GET'){ if(q.name){ const it=db.items.find(x=>x.name===q.name); return json(200,{item:it||null}); } return json(200,db); }
      if(meth==='POST'){ const b=JSON.parse(event.body||'{}'); if(!b.name) return json(400,{error:'name'}); const i=db.items.findIndex(x=>x.name===b.name); if(i>=0) db.items[i]=b; else db.items.push(b); await store.setJSON(PROFILES,db); return json(200,{ok:true}); }
      if(meth==='DELETE'){ const name=q.name; if(!name) return json(400,{error:'name'}); const n={items:db.items.filter(x=>x.name!==name)}; await store.setJSON(PROFILES,n); return json(200,{ok:true}); }
    }
    if(path.startsWith('/schema/entries')){
      if(meth==='GET') return json(200, await store.get('schema_entries.json',{type:'json'})||{items:[]});
      if(meth==='POST'){ const d=await store.get('schema_entries.json',{type:'json'})||{items:[]}; const b=JSON.parse(event.body||'{}'); d.items.push({id:'e_'+Date.now(),...b}); await store.setJSON('schema_entries.json',d); return json(200,{ok:true}) }
    }
    if(path.startsWith('/schema/stats')){ const d=await store.get('schema_entries.json',{type:'json'})||{items:[]}; const totals={}, perAreas={};
      for(const e of d.items||[]){ for(const a of e.assignments||[]){ totals[a.person]=(totals[a.person]||0)+1; (perAreas[a.person]=perAreas[a.person]||{})[a.area]=(perAreas[a.person][a.area]||0)+1; } }
      return json(200,{totals,perAreas}) }
    return json(404,{error:'not found', path})
  }catch(e){ return json(500,{error:String(e)}) }
}
