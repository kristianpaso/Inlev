import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import { signAccess, signRefresh, hashPassword, verifyPassword, findUserByEmail, findUserById, createUser, countUsers, bumpTokenVersion } from '../auth.js';

export default function authRoutes(env){
  const router = express.Router();

  function setCookie(res, name, value, opts={}){
    const secure = env.COOKIE_SECURE === 'true';
    const common = {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      ...opts
    };
    if(env.COOKIE_DOMAIN){ common.domain = env.COOKIE_DOMAIN; }
    res.cookie(name, value, common);
  }
  function clearCookie(res, name){
    setCookie(res, name, '', { maxAge: 0 });
  }

  // CSRF token via double-submit cookie
  router.get('/csrf', (req,res)=>{
    let token = req.cookies['inlev_csrf'];
    if(!token){
      token = randomBytes(24).toString('hex');
      setCookie(res, 'inlev_csrf', token, { httpOnly:false, sameSite:'lax', maxAge: 2*60*60*1000 });
    }
    res.json({ token });
  });
  function requireCsrf(req,res,next){
    const hdr = req.get('X-CSRF-Token');
    const c = req.cookies['inlev_csrf'];
    if(!hdr || !c || hdr!==c) return res.status(403).json({ error:'CSRF' });
    next();
  }

  function issueTokens(res, user){
    const access = signAccess(user, env.JWT_SECRET);
    const refresh = signRefresh(user, env.REFRESH_SECRET);
    setCookie(res, 'inlev_access', access, { maxAge: 15*60*1000 });
    setCookie(res, 'inlev_refresh', refresh, { maxAge: 7*24*60*60*1000, sameSite:'strict' });
  }
  function parseAccess(req){
    const t = req.cookies['inlev_access'];
    if(!t) return null;
    try{ return jwt.verify(t, env.JWT_SECRET); }catch(_){ return null; }
  }
  function parseRefresh(req){
    const t = req.cookies['inlev_refresh'];
    if(!t) return null;
    try{ return jwt.verify(t, env.REFRESH_SECRET); }catch(_){ return null; }
  }

  router.get('/me', (req,res)=>{
    const payload = parseAccess(req);
    if(!payload) return res.status(401).json({ error:'unauthenticated' });
    const u = findUserById(payload.sub);
    if(!u) return res.status(401).json({ error:'unauthenticated' });
    res.json({ user:{ id:u.id, email:u.email, role:u.role } });
  });

  router.post('/login', requireCsrf, async (req,res)=>{
    const { email, password } = req.body || {};
    const u = findUserByEmail(String(email||'').toLowerCase().trim());
    if(!u) return res.status(401).json({ error:'invalid_credentials' });
    const ok = await verifyPassword(u.password_hash, password||'');
    if(!ok) return res.status(401).json({ error:'invalid_credentials' });
    issueTokens(res, u);
    res.json({ user:{ id:u.id, email:u.email, role:u.role } });
  });

  router.post('/logout', requireCsrf, (req,res)=>{
    clearCookie(res, 'inlev_access');
    clearCookie(res, 'inlev_refresh');
    res.status(204).end();
  });

  router.post('/refresh', (req,res)=>{
    const payload = parseRefresh(req);
    if(!payload) return res.status(401).json({ error:'no_refresh' });
    const u = findUserById(payload.sub);
    if(!u || Number(u.token_version||0)!==Number(payload.tv||0)) return res.status(401).json({ error:'invalid_refresh' });
    issueTokens(res, u);
    res.status(204).end();
  });

  // Registration: first user can self-register as admin; otherwise admin-only (not exposed here)
  router.post('/register-initial', requireCsrf, async (req,res)=>{
    if(countUsers()>0) return res.status(403).json({ error:'initial_only' });
    const { email, password } = req.body||{};
    if(!email || !password) return res.status(400).json({ error:'missing_fields' });
    const hash = await hashPassword(password);
    const u = createUser(String(email).toLowerCase().trim(), hash, 'admin');
    issueTokens(res, u);
    res.json({ user:{ id:u.id, email:u.email, role:u.role } });
  });

  return router;
}
