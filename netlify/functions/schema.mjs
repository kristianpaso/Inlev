
import { getStore, json } from './_util.mjs';
const CONF='schema_config.json', ENTRIES='schema_entries.json';

export async function handler(event){
  const store=await getStore(); const path=(event.path||'').replace(/^\/.netlify\/functions\/[\w-]+/, ''); const method=event.httpMethod||'GET';

  if (path.endsWith('/config')){
    if (method==='GET'){ const d=await store.get(CONF,{type:'json'})||{areas:[],people:[]}; return json(200,d); }
    if (method==='POST'){ const b=JSON.parse(event.body||'{}'); await store.setJSON(CONF,b); return json(200,{ok:true}); }
  }
  if (path.endsWith('/entries')){
    if (method==='GET'){ const d=await store.get(ENTRIES,{type:'json'})||{items:[]}; return json(200,d); }
    if (method==='POST'){ const d=await store.get(ENTRIES,{type:'json'})||{items:[]}; const b=JSON.parse(event.body||'{}'); const id='e_'+Date.now(); d.items.push({id,...b}); await store.setJSON(ENTRIES,d); return json(200,{ok:true,id}); }
  }
  if (path.endsWith('/stats')){
    const d=await store.get(ENTRIES,{type:'json'})||{items:[]}; const totals={}, perAreas={};
    (d.items||[]).forEach(e=>(e.assignments||[]).forEach(a=>{ totals[a.person]=(totals[a.person]||0)+1; (perAreas[a.person]=perAreas[a.person]||{})[a.area]=(perAreas[a.person][a.area]||0)+1; }));
    return json(200,{totals,perAreas});
  }
  return json(404,{error:'not found',path,method});
}
