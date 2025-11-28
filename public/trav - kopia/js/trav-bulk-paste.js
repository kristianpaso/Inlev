
// js/trav-bulk-paste.js
(function(){
  if(window.TravBulkPaste) return;
  function clean(s){ return (s||'').toString().replace(/\s+/g,' ').trim(); }
  function toPct(x){
    if(x==null) return null;
    let s=String(x).trim().replace('%','').replace(',','.');
    let n=parseFloat(s); return isFinite(n)?n:null;
  }
  function splitLine(line){
    // accept: 1 <name> <kusk> <pct>
    // or 1<tab>name<tab>kusk<tab>xx
    // or 1 Name | Kusk | xx
    let raw=line.trim();
    if(!raw) return null;
    if(/^\D/.test(raw)) return null; // header row (starts with non-digit)
    // tolerate double spaces by converting common separators to tabs
    raw = raw.replace(/\s+\|\s+/g,'\t').replace(/\s{2,}/g,'\t').replace(/;/g,'\t').replace(/,/g,',');
    let parts = raw.split(/\t+/);
    if(parts.length < 3){
      // try last token as pct, first as number, rest name+kusk separated by pipe or last space block
      const m = raw.match(/^(\d+)\s+(.+?)\s+\|\s+(.+?)\s+(\d+[.,]?\d*)\s*$/);
      if(m){ parts=[m[1], m[2], m[3], m[4]]; }
    }
    const nr = parseInt(parts[0],10);
    if(!nr || nr>99) return null;
    const pct = toPct(parts[3] ?? parts[2]);
    let name = clean(parts[1]||'');
    let driver = clean(parts[2]||'');
    if(pct===null && /\d/.test(driver)){
      // maybe swapped
      pct = toPct(driver); driver = '';
    }
    return { nr, name, driver, pct };
  }
  function parseHorseLines(block){
    const lines=String(block||'').split(/\r?\n/);
    const out={};
    for(const l of lines){
      const row = splitLine(l);
      if(!row) continue;
      out[row.nr]= { name: row.name, driver: row.driver, pct: row.pct };
    }
    return out;
  }
  function parseBulkAvdelningar(text, avds){
    const lines=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const legs=[]; let cur={}, expect=1;
    for(const l of lines){
      if(/^[A-ZÅÄÖa-zåäö]/.test(l)) continue; // header
      const row = splitLine(l); if(!row) continue;
      if(row.nr===1 && Object.keys(cur).length){
        legs.push(cur); cur={}; expect=1;
      }
      cur[row.nr] = { name: row.name, driver: row.driver, pct: row.pct };
      expect = row.nr+1;
    }
    if(Object.keys(cur).length) legs.push(cur);
    while(legs.length < (avds||legs.length)) legs.push({});
    return legs;
  }
  window.TravBulkPaste = { parseHorseLines, parseBulkAvdelningar };
})();
