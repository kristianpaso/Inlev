(function(global){
  const API={}; let token=null;
  async function tok(){ try{ return await InlevAuth.getAccessToken(); }catch(e){ return null; } }
  function hdr(){ const h={'Content-Type':'application/json'}; if(token) h.Authorization='Bearer '+token; return h; }
  async function ok(){
    try{
      token = await tok();
      const r = await fetch('/api/store/ping',{headers:hdr()});
      // if unauthorized or network fails, just report false so UI falls back to local storage
      return r.ok && (await r.json()).ok;
    }catch(e){
      return false;
    }
  }

  API.listShipments = async ()=>{
    if(!await ok()) return null;
    const r=await fetch('/api/store/shipments',{headers:hdr()});
    if(!r.ok) return null; return await r.json();
  };
  API.createShipment= async(name)=>{
    if(!await ok()) return null;
    const r=await fetch('/api/store/shipment',{method:'POST',headers:hdr(),body:JSON.stringify({name})});
    if(!r.ok) return null; return await r.json();
  };
  API.getShipment   = async(id)=>{
    if(!await ok()) return null;
    const r=await fetch('/api/store/shipment/'+encodeURIComponent(id),{headers:hdr()});
    if(!r.ok) return null; return await r.json();
  };
  API.saveShipment  = async(id,data)=>{
    if(!await ok()) return false;
    const r=await fetch('/api/store/shipment/'+encodeURIComponent(id),{method:'PUT',headers:hdr(),body:JSON.stringify(data)});
    return r.ok;
  };
  global.InlevAPI=API;
})(window);