// Minimal, robust slider-renderer
export function mountSlider(host, gameId){
  host = normalizeHost(host);
  const data = loadGame(gameId);
  const { meta, horses, coupons, mine } = data;
  const legs = meta?.legs || 6;
  const unitPrice = meta?.unitPrice ?? 1;

  // State
  let currentLeg = 1;
  const picks = JSON.parse(JSON.stringify(mine?.rows || {})); // copy

  // --------- Render scaffolding ---------
  host.innerHTML = `
    <div class="slider-bar">
      <div style="position:relative">
        <div class="price"><b>Pris:</b> <span id="price">0</span> kr</div>
        <div class="tabs" id="tabs"></div>
        <div class="tabCounter" id="tabsCount"></div>
      </div>
    </div>

    <div class="card list-col">
      <div class="hd">POPULÄRT</div>
      <div class="bd" id="popular"></div>
    </div>

    <div class="card" style="position:relative">
      <div class="hd">HÄSTAR</div>
      <div class="bd">
        <table class="tbl" id="horsesTbl">
          <thead>
            <tr>
              <th style="width:48px">#</th>
              <th style="min-width:260px">HÄST/KUSK</th>
              <th>V64%</th>
              <th>TREND%</th>
              <th>DISTANS & SPÅR</th>
              <th>STARTER I ÅR</th>
              <th>VAGN</th>
              <th>V-ODDS</th>
            </tr>
          </thead>
          <tbody id="horsesBody"></tbody>
        </table>
      </div>
    </div>

    <div class="card list-col">
      <div class="hd">MIN KUPONG</div>
      <div class="bd" id="mine"></div>
    </div>
  `;

  // Build tabs
  const tabs = host.querySelector("#tabs");
  const tabsCount = host.querySelector("#tabsCount");
  for (let i=1;i<=legs;i++){
    const b = document.createElement('div');
    b.className = 'tab' + (i===currentLeg?' active':'');
    b.textContent = i;
    b.dataset.leg = i;
    b.onclick = () => setLeg(i);
    tabs.appendChild(b);
  }
  // counters (antal val per leg i MIN kupong)
  refreshLegCounters();

  // initial render
  setLeg(currentLeg);
  refreshPrice();

  // ---- helpers ----
  function setLeg(leg){
    currentLeg = leg;
    tabs.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active', Number(el.dataset.leg)===leg));
    renderPopular();
    renderHorses();
    renderMine();
  }

  function renderPopular(){
    const cont = host.querySelector('#popular');
    cont.innerHTML='';
    for (let i=1;i<=15;i++){
      const kb = document.createElement('div');
      kb.className='item';
      kb.innerHTML = `<div class="kb">${i}</div>`;
      // add star(s) for “spik” från importerade kuponger
      const stars = starCount(currentLeg, i, coupons);
      if (stars>0){
        const s = document.createElement('span');
        s.textContent = '★'.repeat(stars);
        s.style.color = '#f6d55c';
        s.style.marginLeft = '4px';
        kb.firstElementChild.classList.add('star');
        kb.appendChild(s);
      }
      cont.appendChild(kb);
    }
  }

  function renderHorses(){
    const body = host.querySelector('#horsesBody');
    body.innerHTML='';
    const rows = horses.filter(h=>Number(h.leg)===currentLeg)
                       .sort((a,b)=>a.no-b.no);
    if (rows.length===0){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="8" class="muted">Ingen information för denna avdelning.</td>`;
      body.appendChild(tr);
      return;
    }
    rows.forEach(h=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${h.no}</td>
        <td>${esc(h.name)} — <span class="muted">${esc(h.driver||'')}</span></td>
        <td>${esc(h['V64%'] ?? h['V65%'] ?? h['V75%'] ?? h['V86%'] ?? h['V85%'] ?? h['GS75%'] ?? '')}</td>
        <td>${esc(h['TREND%'] ?? '')}</td>
        <td>${esc(h['DISTANS & SPÅR'] ?? '')}</td>
        <td>${esc(h['STARTER I ÅR'] ?? '')}</td>
        <td>${esc(h['VAGN'] ?? '')}</td>
        <td>${esc(h['V-ODDS'] ?? '')}</td>
      `;
      tr.style.cursor='pointer';
      tr.onclick = ()=> togglePick(currentLeg, h.no);
      body.appendChild(tr);
    });
  }

  function renderMine(){
    const cont = host.querySelector('#mine');
    cont.innerHTML='';
    for (let i=1;i<=legs;i++){
      const wrap = document.createElement('div');
      wrap.className='item';
      const val = (picks[String(i)] || []).slice().sort((a,b)=>a-b);
      wrap.innerHTML = `<div class="kb">${i}</div><div>${val.join(', ')||'—'}</div>`;
      cont.appendChild(wrap);
    }
    refreshLegCounters();
  }

  function togglePick(leg, no){
    const key = String(leg);
    const arr = picks[key] || (picks[key]=[]);
    const idx = arr.indexOf(no);
    if (idx>=0) arr.splice(idx,1); else arr.push(no);
    saveMine();
    renderMine();
    refreshPrice();
  }

  function refreshLegCounters(){
    const counts = [];
    for (let i=1;i<=legs;i++){
      counts[i] = (picks[String(i)]||[]).length;
    }
    tabsCount.innerHTML='';
    for (let i=1;i<=legs;i++){
      const s = document.createElement('span');
      s.textContent = counts[i]||0;
      tabsCount.appendChild(s);
    }
  }

  function refreshPrice(){
    // pris = unitPrice * produkt(antal val i varje avdelning, 1 om 0 val)
    let product = 1;
    for (let i=1;i<=legs;i++){
      const n = (picks[String(i)]||[]).length;
      product *= (n||1);
    }
    host.querySelector('#price').textContent = String(product*unitPrice);
  }

  function saveMine(){
    const key = `trav:game:${meta.id}`;
    try {
      const obj = JSON.parse(localStorage.getItem(key)) || {};
      obj.mine = { rows: picks };
      localStorage.setItem(key, JSON.stringify(obj));
    }catch(e){ /* noop */}
  }
}

// ---------- utilities ----------
function loadGame(id){
  const key = `trav:game:${id}`;
  let obj = {};
  try{ obj = JSON.parse(localStorage.getItem(key) || '{}'); }catch{}
  if (!obj.meta){
    // defensiv fallback
    obj.meta = { id:id, title:id, type:'V64', legs:6, unitPrice:1 };
    obj.horses = obj.horses || [];
    obj.coupons = obj.coupons || [];
    obj.mine = obj.mine || { rows:{} };
  }
  return obj;
}

function starCount(leg, no, coupons){
  let c = 0;
  (coupons||[]).forEach(k=>{
    const arr = k?.rows?.[String(leg)] || [];
    if (arr.length===1 && arr[0]===no) c++;
  });
  return c;
}

function normalizeHost(h){
  if (!h){
    const holder = document.getElementById('view-game') || document.body;
    h = document.createElement('div');
    h.id = 'trav-slider-host';
    holder.appendChild(h);
  }
  return h;
}

function esc(v){ return String(v??'').replace(/[&<>"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
