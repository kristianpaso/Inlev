import 'dotenv/config';
import { hashPassword, createUser, countUsers } from './auth.js';

async function main(){
  if(countUsers()>0){
    console.log('Users exist, skipping seed.');
    return;
  }
  const email = process.env.SEED_EMAIL || 'admin@example.com';
  const password = process.env.SEED_PASSWORD || 'ChangeMe!123';
  const hash = await hashPassword(password);
  const u = createUser(email.toLowerCase().trim(), hash, 'admin');
  console.log('Seeded admin:', u.email);
}
main().catch(e=>{ console.error(e); process.exit(1); });
