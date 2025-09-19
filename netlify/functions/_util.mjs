
async function getStore(){
  if (process.env.LOCAL_BLOBS==='1' || process.env.NETLIFY_DEV==='true'){
    const fs = await import('node:fs');
    const path = (n)=>`.data/${n}`;
    return {
      async get(key,{type}={}){ try{const raw=fs.readFileSync(path(key),'utf8'); return type==='json'?JSON.parse(raw):raw }catch{ return null } },
      async setJSON(key,data){ fs.mkdirSync('.data',{recursive:true}); fs.writeFileSync(path(key), JSON.stringify(data)); return true; }
    };
  } else {
    const { getStore } = await import('@netlify/blobs'); return getStore('inlev');
  }
}
function json(status,body,cookie){
  const h={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-credentials':'true'};
  if(cookie) h['set-cookie']=cookie;
  return {statusCode:status,headers:h,body:JSON.stringify(body)};
}
function parseCookies(evt){ const s=(evt.headers&&evt.headers.cookie)||''; const out={}; s.split(';').forEach(p=>{const i=p.indexOf('='); if(i>0){ out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); }}); return out; }
function rnd(){ return Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2); }
export { getStore, json, parseCookies, rnd };
