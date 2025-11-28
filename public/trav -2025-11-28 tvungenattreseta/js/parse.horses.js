
const DEFAULT_HEADERS=["HÄST","KUSK","V%","TREND%","DISTANS & SPÅR","STARTER I ÅR","VAGN","V-ODDS"];
export function parsePastedHorses(text, formKey="V64"){
  if(!text) return {headers:DEFAULT_HEADERS,divisions:[]};
  const lines=text.replace(/\r/g,"").split(/\n+/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return {headers:DEFAULT_HEADERS,divisions:[]};
  let headers=DEFAULT_HEADERS; let i=0;
  if(!/^\d+\s/.test(lines[0])){ headers=lines[0].split(/\t/).map(s=>s.trim()).filter(Boolean); i=1; }
  const divisions=[]; let cur={index:1,rows:[]}; let firstNo=-1;
  function pushCur(){ if(cur.rows.length) divisions.push(cur); cur={index:divisions.length+1,rows:[]}; firstNo=-1; }
  for(; i<lines.length; i++){
    const cols=lines[i].split(/\t/); if(cols.length<2) continue;
    const noMatch=cols[0].match(/^\d+/); if(!noMatch) continue;
    const no=parseInt(noMatch[0],10);
    if(firstNo<0) firstNo=no; else if(no<firstNo){ pushCur(); firstNo=no; }
    cur.rows.push({
      no,
      name: (cols[0]+" "+(cols[1]||"")).replace(/^\d+\s+/,"").trim(),
      driver:(cols[1]||"").trim(),
      pct:(cols[2]||"").trim(),
      trend:(cols[3]||"").trim(),
      dist:(cols[4]||"").trim(),
      starts:(cols[5]||"").trim(),
      cart:(cols[6]||"").trim(),
      odds:(cols[7]||"").trim(),
    });
  }
  pushCur();
  return {headers, divisions};
}
