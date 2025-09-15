
import { blobs } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function json(status,obj){ return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}}); }
function parse(path){ return path.replace(/^\/api\//,''); }
function tokenFor(u){ const exp=Math.floor(Date.now()/1000)+3600; const t=jwt.sign({sub:u.username, role:u.role, exp}, SECRET); return {token:t,exp}; }
async function readUsers(){ const store=blobs(); const users = await store.get('users:db',{ type:'json' }); return Array.isArray(users)?users:[]; }
async function writeUsers(list){ const store=blobs(); await store.setJSON('users:db', list); }
async function ensureAdmin(){ const users=await readUsers(); if(!users.find(u=>u.username==='Admin')){ const hash = await bcrypt.hash('test',10); users.push({username:'Admin', role:'admin', pass:hash}); await writeUsers(users); } }

function getUserFromAuth(auth){
  const raw = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if(!raw) return null;
  try{ return jwt.verify(raw, SECRET); }catch(e){ return null; }
}

export default async (req, ctx)=>{
  const url=new URL(req.url);
  const path=parse(url.pathname);

  await ensureAdmin();

  if(req.method==='GET' && path==='auth/health'){ return json(200,{ok:true}); }


  if(req.method==='POST' && path==='auth/login'){
    const body = await req.json().catch(()=>null);
    if(!body) return json(400,{error:'bad json'});
    const {username,password}=body;
    const users = await readUsers();
    const user = users.find(u=>u.username===username);
    if(!user) return json(401,{error:'invalid'});
    const ok = await bcrypt.compare(password, user.pass);
    if(!ok) return json(401,{error:'invalid'});
    const {token,exp}=tokenFor(user);
    return json(200,{token,exp,user:{name:user.username,role:user.role}});
  }

  const me = getUserFromAuth(req.headers.get('authorization')||'');
  if(req.method==='GET' && path==='auth/me'){
    if(!me) return json(401,{error:'unauthorized'});
    return json(200,{user:{name:me.sub,role:me.role}});
  }
  if(!me) return json(401,{error:'unauthorized'});

  if(path==='admin/users'){
    if(me.role!=='admin') return json(403,{error:'forbidden'});
    if(req.method==='GET'){
      const users=await readUsers();
      return json(200, users.map(u=>({username:u.username, role:u.role})));
    }
    if(req.method==='POST'){
      const body = await req.json().catch(()=>null);
      if(!body || !body.username || !body.password || !body.role) return json(400,{error:'bad json'});
      const users=await readUsers();
      if(users.find(u=>u.username===body.username)) return json(409,{error:'exists'});
      const pass = await bcrypt.hash(body.password,10);
      users.push({username:body.username, role:body.role, pass});
      await writeUsers(users);
      return json(200,{ok:true});
    }
  }
  const m = path.match(/^admin\/users\/([^\/]+)$/);
  if(m){
    if(me.role!=='admin') return json(403,{error:'forbidden'});
    const uname=decodeURIComponent(m[1]);
    if(req.method==='PUT'){
      const body = await req.json().catch(()=>null);
      if(!body) return json(400,{error:'bad json'});
      const users=await readUsers();
      const u = users.find(x=>x.username===uname);
      if(!u) return json(404,{error:'not found'});
      if(body.password){ u.pass = await bcrypt.hash(body.password,10); }
      if(body.role){ u.role = body.role; }
      await writeUsers(users);
      return json(200,{ok:true});
    }
  }

  return json(404,{error:'not found', path});
};
