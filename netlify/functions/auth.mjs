import { createClient } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const ACCESS_TTL_S = 15*60;          // 15 min
const REFRESH_TTL_S = 7*24*60*60;    // 7 dagar
const USERS_KEY = 'users.json';

function json(status, body, cookies = []){
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };
  return {
    statusCode: status,
    body: JSON.stringify(body),
    multiValueHeaders: cookies.length ? { 'Set-Cookie': cookies } : undefined,
    headers
  };
}
function setCookie(name, value, opts={}){
  const parts = [`${name}=${value}`];
  const maxAge = opts.maxAge ?? null;
  parts.push('Path=/');
  parts.push('Secure');
  parts.push('SameSite=Lax');
  if(maxAge !== null){ parts.push(`Max-Age=${Math.floor(maxAge/1000)}`); }
  if(opts.httpOnly !== false){ parts.push('HttpOnly'); }
  return parts.join('; ');
}
function clearCookie(name){
  return setCookie(name, '', { maxAge: 0 });
}

function getPathSuffix(event){
  const base = '/.netlify/functions/auth';
  if(event.path.startsWith(base)){
    return event.path.slice(base.length) || '/';
  }
  return '/';
}

async function loadUsers(client){
  const { body } = await client.get(USERS_KEY, { type:'json' });
  if(!body){ return []; }
  return body.users || [];
}
async function saveUsers(client, users){
  await client.set(USERS_KEY, { users }, { addRandomSuffix:false, contentType:'application/json' });
}

function signAccess(user, secret){
  const payload = { sub:String(user.id), email:user.email, role:user.role };
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TTL_S });
}
function signRefresh(user, secret){
  const payload = { sub:String(user.id), tv:Number(user.tokenVersion||0) };
  return jwt.sign(payload, secret, { expiresIn: REFRESH_TTL_S });
}
function parseAccess(event, secret){
  const c = event.multiValueHeaders?.cookie || event.headers?.cookie || '';
  const cookies = Object.fromEntries(String(c).split('; ').filter(Boolean).map(x=>x.split('=')));
  const t = cookies['inlev_access']; if(!t) return null;
  try{ return jwt.verify(t, secret); }catch(_){ return null; }
}
function parseRefresh(event, secret){
  const c = event.multiValueHeaders?.cookie || event.headers?.cookie || '';
  const cookies = Object.fromEntries(String(c).split('; ').filter(Boolean).map(x=>x.split('=')));
  const t = cookies['inlev_refresh']; if(!t) return null;
  try{ return jwt.verify(t, secret); }catch(_){ return null; }
}

function ok(body={}, cookies=[]){ return json(200, body, cookies); }
function noauth(){ return json(401, { error:'unauthenticated' }); }
function bad(msg){ return json(400, { error: msg || 'bad_request' }); }
function forb(msg){ return json(403, { error: msg || 'forbidden' }); }

function hasValidCsrf(event){
  const hdr = event.headers['x-csrf-token'] || event.headers['X-CSRF-Token'];
  const c = event.multiValueHeaders?.cookie || event.headers?.cookie || '';
  const cookies = Object.fromEntries(String(c).split('; ').filter(Boolean).map(x=>x.split('=')));
  return hdr && cookies['inlev_csrf'] && hdr === cookies['inlev_csrf'];
}

function ensureAdmin(event, JWT_SECRET){
  const payload = parseAccess(event, JWT_SECRET);
  if(!payload) return null;
  if(String(payload.role||'').toLowerCase() !== 'admin') return false;
  return payload;
}

export async function handler(event, context){
  const suffix = getPathSuffix(event);
  const method = event.httpMethod || 'GET';
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
  const REFRESH_SECRET = process.env.REFRESH_SECRET || 'dev_refresh';
  const client = createClient({ name: 'inlev-auth' });

  // CSRF: double-submit cookie
  if(suffix === '/csrf' && method === 'GET'){
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const c = setCookie('inlev_csrf', token, { httpOnly:false, maxAge: 2*60*60*1000 });
    return json(200, { token }, [c]);
  }

  // GET /me
  if(suffix === '/me' && method === 'GET'){
    const payload = parseAccess(event, JWT_SECRET);
    if(!payload) return noauth();
    return ok({ user:{ id:payload.sub, email:payload.email, role:payload.role } });
  }

  // POST /login
  if(suffix === '/login' && method === 'POST'){
    if(!hasValidCsrf(event)) return forb('CSRF');
    const body = JSON.parse(event.body||'{}');
    const email = String(body.email||'').toLowerCase().trim();
    const password = String(body.password||'');

    const users = await loadUsers(client);
    const u = users.find(x=>x.email===email);
    if(!u) return noauth();
    const okpw = await bcrypt.compare(password, u.passwordHash);
    if(!okpw) return noauth();

    const access = signAccess(u, JWT_SECRET);
    const refresh = signRefresh(u, REFRESH_SECRET);
    const cookies = [
      setCookie('inlev_access', access, { maxAge: 15*60*1000 }),
      setCookie('inlev_refresh', refresh, { maxAge: 7*24*60*60*1000 })
    ];
    return ok({ user:{ id:u.id, email:u.email, role:u.role } }, cookies);
  }

  // POST /logout
  if(suffix === '/logout' && method === 'POST'){
    if(!hasValidCsrf(event)) return forb('CSRF');
    return json(204, {}, [setCookie('inlev_access','',{maxAge:0}), setCookie('inlev_refresh','',{maxAge:0})]);
  }

  // POST /refresh
  if(suffix === '/refresh' && method === 'POST'){
    const payload = parseRefresh(event, REFRESH_SECRET);
    if(!payload) return noauth();
    const users = await loadUsers(client);
    const u = users.find(x=>String(x.id)===String(payload.sub));
    if(!u || Number(u.tokenVersion||0)!==Number(payload.tv||0)) return noauth();
    const access = signAccess(u, JWT_SECRET);
    return json(204, {}, [setCookie('inlev_access', access, { maxAge: 15*60*1000 })]);
  }

  // POST /register-initial
  if(suffix === '/register-initial' && method === 'POST'){
    if(!hasValidCsrf(event)) return forb('CSRF');
    const body = JSON.parse(event.body||'{}');
    const email = String(body.email||'').toLowerCase().trim();
    const password = String(body.password||'');
    if(!email || !password) return bad('missing_fields');
    const users = await loadUsers(client);
    if(users.length>0){
      return forb('initial_only');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const u = { id: String(Date.now()), email, role:'admin', passwordHash, tokenVersion:0, createdAt: new Date().toISOString() };
    await saveUsers(client, [u]);
    const access = signAccess(u, JWT_SECRET);
    const refresh = signRefresh(u, REFRESH_SECRET);
    const cookies = [
      setCookie('inlev_access', access, { maxAge: 15*60*1000 }),
      setCookie('inlev_refresh', refresh, { maxAge: 7*24*60*60*1000 })
    ];
    return ok({ user:{ id:u.id, email:u.email, role:u.role } }, cookies);
  }

  // --- Admin APIs ---
  if(suffix === '/users' && method === 'GET'){
    const adm = ensureAdmin(event, JWT_SECRET);
    if(adm===null) return noauth();
    if(adm===false) return forb('admin_only');
    const users = await loadUsers(client);
    const safe = users.map(x=>({ id:x.id, email:x.email, role:x.role, createdAt:x.createdAt }));
    return ok({ users: safe });
  }

  if(suffix === '/users' && method === 'POST'){
    const adm = ensureAdmin(event, JWT_SECRET);
    if(adm===null) return noauth();
    if(adm===false) return forb('admin_only');
    if(!hasValidCsrf(event)) return forb('CSRF');
    const body = JSON.parse(event.body||'{}');
    const email = String(body.email||'').toLowerCase().trim();
    const password = String(body.password||'');
    const role = String(body.role||'watcher').toLowerCase();
    if(!email || !password) return bad('missing_fields');
    if(!['admin','superuser','watcher'].includes(role)) return bad('invalid_role');
    const users = await loadUsers(client);
    if(users.find(x=>x.email===email)) return bad('email_exists');
    const passwordHash = await bcrypt.hash(password, 12);
    const u = { id:String(Date.now()), email, role, passwordHash, tokenVersion:0, createdAt:new Date().toISOString() };
    users.push(u);
    await saveUsers(client, users);
    return ok({ user:{ id:u.id, email:u.email, role:u.role } });
  }

  if(suffix.startsWith('/users/') && method === 'PATCH'){
    const adm = ensureAdmin(event, JWT_SECRET);
    if(adm===null) return noauth();
    if(adm===false) return forb('admin_only');
    if(!hasValidCsrf(event)) return forb('CSRF');
    const userId = suffix.split('/')[2];
    const body = JSON.parse(event.body||'{}');
    const users = await loadUsers(client);
    const u = users.find(x=>String(x.id)===String(userId));
    if(!u) return bad('not_found');
    if(body.role){
      const r = String(body.role).toLowerCase();
      if(!['admin','superuser','watcher'].includes(r)) return bad('invalid_role');
      u.role = r;
    }
    if(body.password){
      u.passwordHash = await bcrypt.hash(String(body.password), 12);
      u.tokenVersion = Number(u.tokenVersion||0) + 1; // invalidate sessions
    }
    await saveUsers(client, users);
    return ok({ user:{ id:u.id, email:u.email, role:u.role } });
  }

  if(suffix.startsWith('/users/') && method === 'DELETE'){
    const adm = ensureAdmin(event, JWT_SECRET);
    if(adm===null) return noauth();
    if(adm===false) return forb('admin_only');
    if(!hasValidCsrf(event)) return forb('CSRF');
    const userId = suffix.split('/')[2];
    let users = await loadUsers(client);
    const before = users.length;
    users = users.filter(x=>String(x.id)!==String(userId));
    if(users.length===before) return bad('not_found');
    await saveUsers(client, users);
    return json(204, {});
  }

  return json(404, { error:'not_found', path:suffix });
}
