
(function(global){
  const LS='inleverans_shipments_v1', CUR='inleverans_current';
  function all(){ try{ return JSON.parse(localStorage.getItem(LS)||'{}'); }catch(e){ return {}; } }
  function setAll(x){ localStorage.setItem(LS, JSON.stringify(x)); }
  function uid(){ return String(Date.now()); }

  const InlevApp = {
    list(){ const a=all(); return Object.keys(a).map(id=>({id,name:a[id].meta?.number||id,createdAt:a[id].meta?.start})).sort((x,y)=>(x.createdAt||'').localeCompare(y.createdAt||'')); },
    create(name){ const id=uid(); const a=all(); a[id]={meta:{number:name||id,start:new Date().toISOString()},linked:[],upp:[],kollin:[],upd:{upp:[],kollin:[]},flags:{cleared:{},everIssue:{}}; setAll(a); localStorage.setItem(CUR,id); return id; },
    remove(id){ const a=all(); delete a[id]; setAll(a); if(localStorage.getItem(CUR)===id) localStorage.removeItem(CUR); },
    rename(id,newName){ const a=all(); if(a[id]){ a[id].meta = a[id].meta||{}; a[id].meta.number=newName; setAll(a);} },
    export(id){ const a=all(); const d=a[id]; return d?JSON.stringify(d):''; },
    import(id,json){ const a=all(); a[id]=JSON.parse(json); setAll(a); },
    setCurrent(id){ localStorage.setItem(CUR,id); },
    current(){ return localStorage.getItem(CUR); },
    get(id){ return all()[id]; },
    set(id,data){ const a=all(); a[id]=data; setAll(a); },
  };

  function normNum(v){ const s=String(v||'').replace(/\s+/g,' ').trim(); const m=s.match(/-?\d+/g); return m?Number(m[m.length-1]):0; }

  function parseTSVSmart(raw, skipRows, map){
    const t=String(raw||''), rows=[]; let cell='', row=[], inQ=false;
    for(let i=0;i<t.length;i++){
      const ch=t[i];
      if(ch==='"'){ if(inQ && t[i+1]==='"'){ cell+='"'; i++; } else { inQ=!inQ; } }
      else if(ch==='\t' && !inQ){ row.push(cell); cell=''; }
      else if((ch==='\n'||ch==='\r') && !inQ){
        if(ch==='\r' && t[i+1]==='\n'){} 
        row.push(cell); cell=''; while(row.length && row[row.length-1]==='') row.pop(); if(row.length>0) rows.push(row); row=[]; if(ch==='\r' && t[i+1]==='\n') i++;
      } else { cell+=ch; }
    }
    if(cell.length>0 || row.length>0){ row.push(cell); while(row.length && row[row.length-1]==='') row.pop(); if(row.length>0) rows.push(row); }
    const out=[];
    for(let r=skipRows;r<rows.length;r++){
      const cols=rows[r], obj={};
      for(let c=0;c<map.length;c++){ const key=map[c]; if(!key) continue; obj[key]=(cols[c]||'').trim(); }
      ['aviserad','bestallt','aterstar','levererat','behov','antal'].forEach(k=>{ if(obj[k]!==undefined) obj[k]=normNum(obj[k]); });
      obj._rawCols=cols;
      out.push(obj);
    }
    return out;
  }

  function normalizeLinked(r){
    return {
      order:(r.order||'').trim(),
      position:String(r.position||'').replace(/\s+/g,' ').trim(),
      skuBeskrivning:(r.skuBeskrivning||'').trim(),
      bestallt:normNum(r.bestallt),
      aterstar:normNum(r.aterstar),
      levererat:normNum(r.levererat),
      behov:normNum(r.behov)
    };
  }

  InlevApp.parseLinked=function(raw){
    const MAP=['order','position','skuBeskrivning','bestallt','aterstar','levererat','behov'];
    let out=parseTSVSmart(raw,4,MAP).map(normalizeLinked);
    if(!out || out.length===0){ out=parseTSVSmart(raw,0,MAP).map(normalizeLinked); }
    return out;
  };

  InlevApp.parseUpp=function(raw,skip){
    // Uppackning: order, position, levSKU, SKU, beskrivning, aviserad, levererat, återstår, behov
    const rows = parseTSVSmart(raw,skip||4,['order','position','leverantorsSku','sku','beskrivning','aviserad','levererat','aterstar','behov']);
    // SKU/Beskrivning kan komma klistrade ihop – försök splitta när rad har dubbellinje
    return rows.map(r=>{
      // normalisera SKU/beskrivning ifall det kom i samma cell i 'sku' med newline
      if(r.sku && r.sku.includes('\n') && !r.beskrivning){
        const parts=String(r.sku).split(/\n+/);
        r.sku=(parts[0]||'').trim();
        r.beskrivning=(parts.slice(1).join(' ').trim());
      }
      return r;
    });
  };

  InlevApp.parseKollin=function(raw){
    return parseTSVSmart(raw,0,['hanteringsenhet','artikelbeskrivning','sku','batchnummer','lagerzonsflode','fack','antal']).map(r=>({...r,sista4:String(r.hanteringsenhet||'').slice(-4)}));
  };

  global.InlevApp = InlevApp;
})(window);
