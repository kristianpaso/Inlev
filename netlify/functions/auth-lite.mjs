import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function json(status,obj){ return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}}); }
function parse(path){ return path.replace(/^\/api\//,''); }
function tokenFor(u){ const exp=Math.floor(Date.now()/1000)+3600; const t=jwt.sign({sub:u.username,role:u.role,exp}, SECRET); return {token:t,exp}; }
function getUserFromAuth(auth){
  const raw = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if(!raw) return null;
  try{ const payload = jwt.verify(raw, SECRET); return { username: payload.sub, role: payload.role }; }
  catch(_){ return null; }
}

export default async (req) => {
  const url = new URL(req.url);
  const path = parse(url.pathname.replace(/^.*\/.netlify\/(functions|lambda)\//,''));

  // Health: never fails, no external deps
  if(req.method==='GET' && (path==='auth-lite/health' || path==='health')){
    return json(200,{ok:true});
  }

  if(req.method==='POST' && (path==='auth-lite/login' || path==='login')){
    const body = await req.json().catch(()=>null);
    if(!body) return json(400,{error:'bad json'});
    const {username,password} = body;
    if(username==='Admin' && password==='admin'){
      const {token,exp} = tokenFor({ username:'Admin', role:'admin' });
      return json(200,{token,exp,user:{name:'Admin',role:'admin'}});
    }
    return json(401,{error:'invalid'});
  }

  if(req.method==='GET' && (path==='auth-lite/me' || path==='me')){
    const me = getUserFromAuth(req.headers.get('authorization')||'');
    if(!me) return json(401,{error:'unauthorized'});
    return json(200,{user:{name:me.username, role:me.role}});
  }

  return json(404,{error:'not found', path});
};