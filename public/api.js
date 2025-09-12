
(function(global){
  const API={}; let token=null;
  async function tok(){ try{ return await InlevAuth.getAccessToken(); }catch(e){ return null; } }
  async function ok(){ try{ token=await tok(); const r=await fetch('/api/store/shipments',{headers:hdr()}); return r.ok; }catch(e){ return false; } }
  function hdr(){ const h={'Content-Type':'application/json'}; if(token) h.Authorization='Bearer '+token; return h; }

  API.listShipments = async ()=>{ if(!await ok()) return null; const r=await fetch('/api/store/shipments',{headers:hdr()}); if(!r.ok) return null; return await r.json(); };
  API.createShipment= async(name)=>{ if(!await ok()) return null; const r=await fetch('/api/store/shipments',{method:'POST',headers:hdr(),body:JSON.stringify({name})}); if(!r.ok) return null; return await r.json(); };
  API.getShipment   = async(id)=>{ if(!await ok()) return null; const r=await fetch('/api/store/shipment/'+id,{headers:hdr()}); if(!r.ok) return null; return await r.json(); };
  API.saveShipment  = async(id,data)=>{ if(!await ok()) return false; const r=await fetch('/api/store/shipment/'+id,{method:'PUT',headers:hdr(),body:JSON.stringify(data)}); return r.ok; };

  global.InlevAPI=API;
})(window);
