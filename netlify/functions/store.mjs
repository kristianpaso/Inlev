
import { blobs } from '@netlify/blobs';
import jwt from 'jsonwebtoken';

function json(status,obj){ return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}}); }
function getUserFromAuth(auth){
  const raw = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if(!raw) return null;
  try{ return jwt.verify(raw, process.env.JWT_SECRET || 'dev-secret-change-me'); }catch(e){ return null; }
}

export default async (req, ctx)=>{
  const url=new URL(req.url);
  const path=url.pathname.replace(/^\/api\/store\/?/,''); 
  const user=getUserFromAuth(req.headers.get('authorization')||'');
  if(path==='ping') return json(200,{ok:true,user:!!user});
  if(!user) return json(401,{error:'unauthorized'});
  const uid=user.sub || 'Admin'; 
  const store=blobs(); 
  const listKey=`shipments:${uid}:list`;

  async function readList(){ const s=await store.get(listKey,{type:'json'}); return Array.isArray(s)?s:[]; }
  async function writeList(arr){ await store.setJSON(listKey,arr); }

  if(req.method==='GET' && path==='shipments') return json(200,await readList());

  if(req.method==='POST' && path==='shipments'){ 
    const b=await req.json().catch(()=>({})); 
    const name=b?.name||`Sändning ${Date.now()}`; 
    const id=String(Date.now()); 
    const list=await readList(); 
    list.push({id,name,createdAt:new Date().toISOString()}); 
    await writeList(list); 
    await store.setJSON(`shipments:${uid}:data:${id}`,{meta:{number:name,start:new Date().toISOString()},linked:[],upp:[],kollin:[],upd:{upp:[],kollin:[]},flags:{cleared:{},everIssue:{}}}); 
    return json(200,{id}); 
  }

  const m1=path.match(/^shipment\/([^\/]+)$/);
  if(req.method==='GET' && m1){ 
    const id=decodeURIComponent(m1[1]); 
    const data=await store.get(`shipments:${uid}:data:${id}`,{type:'json'}); 
    if(!data) return json(404,{error:'not found'}); 
    return json(200,data); 
  }
  if(req.method==='PUT' && m1){ 
    const id=decodeURIComponent(m1[1]); 
    const data=await req.json().catch(()=>null); 
    if(!data) return json(400,{error:'bad json'}); 
    await store.setJSON(`shipments:${uid}:data:${id}`,data); 
    return json(200,{ok:true}); 
  }
  return json(404,{error:'not found',path});
};
