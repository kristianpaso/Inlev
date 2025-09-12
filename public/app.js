(function(global){
  'use strict';

  const LS  = 'inleverans_shipments_v1';
  const CUR = 'inleverans_current';

  function readJSON(key, fallback){
    try { return JSON.parse(localStorage.getItem(key) || ''); }
    catch(e) { return fallback; }
  }
  function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function all(){ return readJSON(LS, {}) || {}; }
  function setAll(x){ writeJSON(LS, x); }
  function uid(){ return Date.now() + '-' + Math.random().toString(36).slice(2,8); }

  const InlevApp = {
    list(){
      const a = all();
      const out = Object.keys(a).map(id => {
        const m = a[id]?.meta || {};
        return { id, name: m.number || id, createdAt: m.createdAt || '' };
      });
      out.sort((x,y) => String(y.createdAt||'').localeCompare(String(x.createdAt||'')));
      return out;
    },
    create(name){
      const id = uid();
      const a = all();
      a[id] = a[id] || { meta:{ number:name||id, createdAt:new Date().toISOString() },
                         data:{ linked:[], upp:[], kollin:[] }, issue:{} };
      setAll(a);
      localStorage.setItem(CUR, id);
      return id;
    },
    remove(id){
      const a = all();
      delete a[id];
      setAll(a);
      if(localStorage.getItem(CUR) === id) localStorage.removeItem(CUR);
    },
    rename(id,newName){
      const a = all();
      if(a[id]){
        a[id].meta = a[id].meta || {};
        a[id].meta.number = newName;
        setAll(a);
      }
    },
    get(id){ return all()[id]; },
    set(id,data){ const a=all(); a[id]=data; setAll(a); },
    setCurrent(id){ localStorage.setItem(CUR,id); },
    current(){ return localStorage.getItem(CUR); }
  };

  // ---------- Robust parsing helpers ----------
  function detectDelimiter(text){
    const s = (text || '').split(/\r?\n/).slice(0, 20).join('\n');
    const counts = { '\t': (s.match(/\t/g)||[]).length, ';': (s.match(/;/g)||[]).length, ',': (s.match(/,/g)||[]).length };
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0] || '\t';
  }
  function parseDelimited(raw, delim){
    const out = [];
    let row = [];
    let cur = '';
    let q = false;
    for(let i=0;i<raw.length;i++){
      const ch = raw[i];
      const nxt = raw[i+1];
      if(ch === '"'){
        if(q && nxt === '"'){ cur += '"'; i++; }
        else { q = !q; }
        continue;
      }
      if(ch === '\r' && !q){ continue; }
      if(ch === '\n' && !q){ row.push(cur); out.push(row); row = []; cur = ''; continue; }
      if(ch === delim && !q){ row.push(cur); cur=''; continue; }
      cur += ch;
    }
    row.push(cur);
    out.push(row);
    return out;
  }
  function toRows(raw){
    // Normalisera konstiga sidbrytningar/form feed
    raw = String(raw||'').replace(/\x0c/g,'\n').replace(/\u2028|\u2029/g,'\n');
    const delim = detectDelimiter(String(raw||''));
    return parseDelimited(String(raw||''), delim);
  }
  function firstInt(s){
    const m = String(s||'').match(/\d+/);
    return m ? Number(m[0]) : 0;
  }
  function lastNumber(s){
    const m = String(s||'').match(/-?\d+(?:[.,]\d+)?/g);
    return m ? Number(m[m.length-1].replace(',', '.')) : 0;
  }

  // ---------- Parsers ----------

  // Länkade rader
  InlevApp.parseLinked = function(raw){
    const rows = toRows(raw);
    const usable = rows.filter(r => r && r.length >= 3 && /\d/.test(r[0]||'') && /^(?:\s*\d{4,}(?:-\d+)?\s*)$/.test(String(r[0]||'').trim()));
    return usable.map(r => {
      const order = String(r[0]||'').trim();
      const position = firstInt(r[1]); // "11724\n0" -> 11724
      const sku = String(r[2]||'').replace(/\s+/g,' ').trim();

      // Plocka första fyra tal efter beskrivningen: beställt, återstår, levererat, behov
      const nums = [];
      for(let i=3;i<r.length && nums.length<4;i++){
        const m = String(r[i]||'').match(/-?\d+(?:[.,]\d+)?/g);
        if(m){
          for(const x of m){
            nums.push(Number(x.replace(',', '.')));
            if(nums.length>=4) break;
          }
        }
      }
      const best = nums[0] ?? 0;
      const ater = nums[1] ?? 0;
      const lev  = nums[2] ?? 0;
      const behov= nums[3] ?? 0;

      return { order, position, skuBeskrivning: sku, aviserad: best, bestallt: ater, levererat: lev, totalt: behov };
    });
  };

  // Uppackning
  
InlevApp.parseUpp = function(raw){
  const rows = toRows(raw);
  const usable = rows.filter(r => r && r.length >= 3 && /\d/.test(r[0]||'') && /^(?:\s*\d{4,}(?:-\d+)?\s*)$/.test(String(r[0]||'').trim()));
  return usable.map(r => {
    const order = String(r[0]||'').trim();
    const position = firstInt(r[1]); // "10\n0" -> 10

    // Hitta kolumn med SKU (kan vara SKU + beskrivning i samma cell)
    let skuIdx = 2;
    for(let i=2;i<Math.min(r.length,7);i++){
      const s = String(r[i]||'');
      if(/[0-9]{4,}-[0-9-]+/.test(s)){ skuIdx = i; break; }
    }
    const skuCell = String(r[skuIdx]||'');
    const parts = skuCell.split(/\n+/);
    const sku = (parts[0]||'').trim();
    let beskriv = parts.slice(1).join(' ').trim();
    if(!beskriv && String(r[skuIdx+1]||'').trim()){
      const nxt = String(r[skuIdx+1]);
      const numericLike = /\d/.test(nxt) && !/[A-Za-z]/.test(nxt);
      if(!numericLike){ beskriv = nxt.replace(/\s+/g,' ').trim(); }
    }

    // Lev.SKU: om finns separat kolumn strax före skuCell med alfanumeriskt/streck, annars '-'
    let levsku = '-';
    for(let j=Math.max(2, skuIdx-2); j<skuIdx; j++){
      const v = String(r[j]||'').trim();
      if(/^[A-Za-z0-9-]{6,}$/.test(v)){ levsku = v; break; }
    }

    // Ta ett tal per cell i ordning: Aviserad, Levererat, Återstår, Behov
    const aviserad = firstInt(r[skuIdx+1]);
    const levererat = firstInt(r[skuIdx+2]);
    const aterstar = firstInt(r[skuIdx+3]);
    const behov = firstInt(r[skuIdx+4]);

    return { order, position, levsku, sku, beskrivning: beskriv, aviserad, levererat, aterstar, behov };
  });
};


  // Kollin
  
InlevApp.parseKollin = function(raw){
  const rows = toRows(raw);
  const usable = rows.filter(r => r && r.length >= 2);

  return usable.map(r => {
    // New schema: Hanteringsenhet, Artikelbeskrivning, SKU, Batchnummer, Lagerzonsflöde, Fack, Antal
    if(r.length >= 7){
      const he   = String(r[0]||'').trim();
      const art  = String(r[1]||'').trim();
      const sku  = String(r[2]||'').trim();
      const bat  = String(r[3]||'').trim();
      const flow = String(r[4]||'').trim();
      const fack = String(r[5]||'').trim();
      const antal= lastNumber(r[6]||'');
      return { hanteringsenhet: he, artikelbeskrivning: art, sku: sku, batchnummer: bat, lagerzonsflode: flow, fack: fack, antal: antal };
    }
    // Fallback to old simple schema
    return {
      hanteringsenhet: String(r[0]||'').trim(),
      artikelbeskrivning: String(r[1]||'').trim(),
      sku: String(r[2]||'').trim(),
      batchnummer: String(r[3]||'').trim(),
      lagerzonsflode: String(r[4]||'').trim(),
      fack: String(r[5]||'').trim(),
      antal: lastNumber(r[6]||r[4]||'')
    };
  });
};


  global.InlevApp = InlevApp;
})(window);