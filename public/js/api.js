import { token } from './auth-guard.js';
export async function api(method, path, body){
  const res = await fetch('/api'+path, {
    method, headers: {'Content-Type':'application/json','Authorization':'Bearer '+token()},
    body: body ? JSON.stringify(body) : undefined
  });
  if(!res.ok){
    let txt = await res.text();
    try{ txt = JSON.parse(txt).error || txt }catch{}
    throw new Error(txt || res.statusText);
  }
  return await res.json();
}
