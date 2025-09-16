
(function(){
  const $ = s=>document.querySelector(s);
  const dayEl = $('#dayPicker'), sheetSel=$('#sheetSel'), idleEl=$('#idle');
  const topNEl = $('#topN'), filterEl=$('#userFilter');
  const kpiTotal=$('#kpiTotal'), kpiUsers=$('#kpiUsers'), kpiHours=$('#kpiHours'), kpiRate=$('#kpiRate');
  let rows=[], byUser={}, chart, day=null;

  function parseTS(s){ return new Date(s); }

  function groupAndCalc(){
    byUser={};
    const idleMin = parseInt(idleEl.value||'15',10);
    const msGap = idleMin*60*1000;
    const dayStr = day ? day.toISOString().slice(0,10) : null;

    for(const r of rows){
      const u = r.UserName || r.username || r.Användare || r['UserName'];
      const t = parseTS(r.TimeStamp || r.tid || r['TimeStamp']);
      if(!u || isNaN(t)) continue;
      if(dayStr && t.toISOString().slice(0,10)!==dayStr) continue;
      const key=u;
      if(!byUser[key]) byUser[key]={count:0, times:[]};
      byUser[key].count += 1;
      byUser[key].times.push(t.getTime());
    }
    let total=0, users=0, hours=0;
    const data=[];
    for(const [u,info] of Object.entries(byUser)){
      total += info.count; users++;
      info.times.sort((a,b)=>a-b);
      let active=0, start=info.times[0], last=info.times[0];
      for(let i=1;i<info.times.length;i++){
        const cur=info.times[i];
        if(cur-last>msGap){ active += (last-start); start=cur; }
        last=cur;
      }
      active += (last-start);
      info.activeHours = active/3600000;
      hours += info.activeHours;
      data.push({user:u, count:info.count, active:info.activeHours, rate: info.activeHours? info.count/info.activeHours: 0});
    }
    const rate = hours? (total/hours): 0;
    kpiTotal.textContent = total;
    kpiUsers.textContent = users;
    kpiHours.textContent = hours.toFixed(3);
    kpiRate.textContent = rate.toFixed(0);

    const q = (filterEl.value||'').toLowerCase();
    let list = data.filter(d=>!q || d.user.toLowerCase().includes(q));
    const choice = topNEl.value;
    if(choice.startsWith('Top')){
      const n=parseInt(choice.split(' ')[1],10);
      list = list.sort((a,b)=>b.count-a.count).slice(0,n);
    } else {
      list = list.sort((a,b)=>b.count-a.count);
    }

    renderChart(list);
    renderTable(data.sort((a,b)=>b.count-a.count));
  }

  function renderChart(list){
    const ctx = document.getElementById('mainChart').getContext('2d');
    const labels=list.map(d=>d.user);
    const vals=list.map(d=>d.count);
    if(chart) chart.destroy();
    chart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Plock', data:vals }]},
      options:{ responsive:true, plugins:{ legend:{display:false} }, scales:{ y:{ beginAtZero:true } } }
    });
  }

  function renderTable(list){
    const el = document.getElementById('userTable');
    el.innerHTML = '<div class="row head" style="gap:8px;font-weight:600"><div style="width:220px">Användare</div><div>Totalt plock</div><div>Aktiva timmar</div><div>Plock/aktiv timme</div></div>';
    for(const d of list){
      const row = document.createElement('div'); row.className='row'; row.style.gap='8px';
      row.innerHTML = `<div style="width:220px">${d.user}</div><div>${d.count}</div><div>${d.active.toFixed(3)}</div><div>${d.rate.toFixed(0)}</div>`;
      el.appendChild(row);
    }
  }

  function parseCSV(text){
    const [head,...lines]=text.trim().split(/\r?\n/);
    const cols=head.split(',').map(s=>s.trim());
    return lines.map(line=>{
      const vals=line.split(','); const o={};
      cols.forEach((c,i)=>o[c]=vals[i]); return o;
    });
  }

  async function handleFile(f){
    const name=f.name.toLowerCase();
    let data=[];
    if(name.endsWith('.csv')){
      data = parseCSV(await f.text());
    } else {
      const buf=await f.arrayBuffer();
      const wb = XLSX.read(buf,{type:'array'});
      sheetSel.innerHTML = wb.SheetNames.map(n=>`<option>${n}</option>`).join('');
      const sheet = wb.SheetNames[0];
      data = XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:null});
    }
    rows=data; groupAndCalc();
  }

  document.getElementById('fileInput').addEventListener('change', e=>{
    const f=e.target.files[0]; if(f) handleFile(f);
  });
  document.getElementById('useDemo').addEventListener('click', ()=>{
    const csv = `UserName,TimeStamp,UpdateCode
Demo,2025-09-15 04:00:00,A
Demo,2025-09-15 04:05:00,A
Demo,2025-09-15 05:40:00,B`;
    rows=parseCSV(csv);
    day = new Date(rows[0].TimeStamp); day.setHours(0,0,0,0);
    dayEl.value = day.toISOString().slice(0,10);
    groupAndCalc();
  });
  document.getElementById('exportCsv').addEventListener('click', ()=>{
    if(!rows.length){ alert('Ingen rapport att exportera ännu.'); return; }
    const lines=['User,Count,ActiveHours,Rate'];
    for(const [u,i] of Object.entries(byUser)){
      lines.push(`${u},${i.count},${i.activeHours||0},${(i.activeHours? i.count/i.activeHours:0).toFixed(0)}`);
    }
    const blob=new Blob([lines.join('\n')],{type:'text/csv'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='rapport.csv'; a.click(); URL.revokeObjectURL(url);
  });

  dayEl.addEventListener('change', ()=>{ day = dayEl.value? new Date(dayEl.value+'T00:00:00'): null; groupAndCalc(); });
  idleEl.addEventListener('change', groupAndCalc);
  topNEl.addEventListener('change', groupAndCalc);
  filterEl.addEventListener('input', groupAndCalc);
})();
