
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getUsers, setUsers } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function sign(user){
  const exp = Math.floor(Date.now()/1000) + 3600; // 1h
  const token = jwt.sign({ sub: user.username, role: user.role, exp }, SECRET);
  return { token, exp };
}

function authenticate(req, res, next){
  const h = req.headers.authorization || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!raw) return res.status(401).json({error:'unauthorized'});
  try{
    const me = jwt.verify(raw, SECRET);
    req.user = me;
    next();
  }catch(e){
    res.status(401).json({error:'unauthorized'});
  }
}

function requireAdmin(req,res,next){
  if(req.user?.role !== 'admin') return res.status(403).json({error:'forbidden'});
  next();
}

async function login(req,res){
  const {username, password} = req.body||{};
  const users = getUsers();
  const user = users.find(u=>u.username===username);
  if(!user) return res.status(401).json({error:'invalid'});
  const ok = await bcrypt.compare(password, user.pass);
  if(!ok) return res.status(401).json({error:'invalid'});
  const {token,exp} = sign(user);
  res.json({ token, exp, user: { name: user.username, role: user.role } });
}

function listUsers(req,res){
  const users=getUsers();
  res.json(users.map(u=>({username:u.username, role:u.role})));
}
async function createUser(req,res){
  const {username,password,role} = req.body||{};
  if(!username || !password || !role) return res.status(400).json({error:'bad json'});
  const users=getUsers();
  if(users.find(u=>u.username===username)) return res.status(409).json({error:'exists'});
  const hash = await bcrypt.hash(password,10);
  users.push({username, role, pass: hash});
  setUsers(users);
  res.json({ok:true});
}
async function updateUser(req,res){
  const uname=req.params.username;
  const {password, role} = req.body||{};
  const users=getUsers();
  const u = users.find(x=>x.username===uname);
  if(!u) return res.status(404).json({error:'not found'});
  if(password){ u.pass = await bcrypt.hash(password,10); }
  if(role){ u.role = role; }
  setUsers(users);
  res.json({ok:true});
}

module.exports = { authenticate, requireAdmin, login, listUsers, createUser, updateUser };
