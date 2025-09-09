import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import db from './db.js';

const ACCESS_TTL_S = 15*60;   // 15 min
const REFRESH_TTL_S = 7*24*60*60; // 7 dagar

export function signAccess(user, secret){
  const payload = { sub: String(user.id), role: user.role, email: user.email };
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TTL_S });
}
export function signRefresh(user, secret){
  const payload = { sub: String(user.id), tv: user.token_version||0 };
  return jwt.sign(payload, secret, { expiresIn: REFRESH_TTL_S });
}
export async function hashPassword(password){
  return argon2.hash(password, { type: argon2.argon2id });
}
export async function verifyPassword(hash, password){
  try{ return await argon2.verify(hash, password); }catch(_){ return false; }
}
export function findUserByEmail(email){
  return db.prepare('SELECT id,email,role,password_hash,token_version FROM users WHERE email=?').get(email);
}
export function findUserById(id){
  return db.prepare('SELECT id,email,role,password_hash,token_version FROM users WHERE id=?').get(id);
}
export function createUser(email, hash, role){
  const stmt = db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)');
  const info = stmt.run(email, hash, role);
  return findUserById(info.lastInsertRowid);
}
export function countUsers(){
  return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
}
export function bumpTokenVersion(userId){
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id=?').run(userId);
}
