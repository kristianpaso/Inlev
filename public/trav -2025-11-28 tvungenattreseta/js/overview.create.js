
(function(){
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);
  const el=(t,c,txt)=>{const n=document.createElement(t); if(c)n.className=c; if(txt!=null)n.textContent=txt; return n;};
  const FORM_LEGS = { V64:6,V65:6,V75:7,GS75:7,V86:8,V85:8 };

  const Store = {
    all(){ try{return JSON.parse(localStorage.getItem('trav.games.v1')||'[]')}catch{return[]} },
    saveGame(game){
      localStorage.setItem('trav.game:'+game.id, JSON.stringify(game));
      const list = this.all().filter(g=>g.id!==game.id);
      list.unshift({ id:game.id, type:game.type, legs:game.legs, name:game.name, start:game.start, createdAt:game.meta.createdAt });
      localStorage.setItem('trav.games.v1', JSON.stringify(list));
    }
  };

  function dialog(){
    const wrap = el('dialog','modal'); wrap.id='dlgCreate'; wrap.open=true;
    wrap.innerHTML = `
      <form id="frmCreate" method="dialog" class="card">
        <header class="card-header"><h3>Skapa spelsystem</h3></header>
        <div class="card-body">
          <div class="row">
            <label>Spelform</label>
            <div class="pillset" id="formPills">
              <button type="button" class="pill active" data-form="V64">V64</button>
              <button type="button" class="pill" data-form="V65">V65</button>
              <button type="button" class="pill" data-form="V75">V75</button>
              <button type="button" class="pill" data-form="GS75">GS75</button>
              <button type="button" class="pill" data-form="V86">V86</button>
              <button type="button" class="pill" data-form="V85">V85</button>
            </div>
          </div>
          <div class="row grid-2">
            <div>
              <label>Omgångsnamn</label>
              <input id="fldName" class="input" placeholder="t.ex. Halmstad fredag">
            </div>
            <div>
              <label>Starttid</label>
              <input id="fldStart" class="input" placeholder="åååå-mm-dd --:--">
            </div>
          </div>
          <details id="secAll" open class="mt">
            <summary>Klistra in hel lista (alla avdelningar)</summary>
            <textarea id="fldAllPaste" class="textarea mono" rows="10"
              placeholder="Klistra in tabell: 1 Namn TAB Kusk TAB 20% ... 1 ... (Ny avdelning när en rad börjar med '1 ')"></textarea>
          </details>
        </div>
        <footer class="card-footer">
          <button type="button" class="btn" id="btnCancel">Avbryt</button>
          <button type="submit" class="btn btn-primary">Spara</button>
        </footer>
      </form>`;

    const css = document.createElement('style');
    css.textContent = `.modal *{color:#fff}
      .pillset{display:flex;gap:.5rem;flex-wrap:wrap}
      .pill{background:#1f2a36;border:1px solid #2b3c52;border-radius:999px;padding:.35rem .7rem}
      .pill.active{background:#0ea5e9;border-color:#0ea5e9;color:#001019}
      .input,.textarea{background:#0c141d;border:1px solid #2b3c52;color:#fff}
      summary{color:#fff}`;
    wrap.appendChild(css);
    document.body.appendChild(wrap);
    return wrap;
  }

  function parseAllPaste(text, legs){
    const lines = (text||'').replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
    if (!lines.length) return {};
    if (!/^\d+/.test(lines[0])) lines.shift();
    const out = {}; let leg=1; let prev=0;
    for (const ln of lines){
      const cols = ln.split('\t');
      const m = cols[0]?.match(/^(\d+)\s*(.*)$/); if (!m) continue;
      const nr = parseInt(m[1],10); const nameRest = m[2]||'';
      if (prev && nr < prev) leg++;
      prev = nr;
      out[leg] = out[leg] || [];
      out[leg].push({
        num: nr,
        name: nameRest.trim(),
        driver: (cols[1]||'').trim(),
        vShare: (cols[2]||'').trim(),
        trend: (cols[3]||'').trim(),
        dist: (cols[4]||'').trim(),
        starts: (cols[5]||'').trim(),
        cart: (cols[6]||'').trim(),
        odds: (cols[7]||'').trim()
      });
      if (leg>=legs) ;
    }
    return out;
  }

  function makeId(type){
    const d=new Date(); const stamp=d.toISOString().slice(0,10);
    const rnd = Math.floor(Math.random()*90000+10000);
    return `${type}-${stamp}-${rnd}`;
  }

  function mount(selector){
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.addEventListener('click', ()=>{
      const dlg = dialog();
      let type='V64';
      dlg.querySelector('#formPills').addEventListener('click', (e)=>{
        const b=e.target.closest('.pill'); if(!b) return;
        dlg.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
        b.classList.add('active'); type=b.dataset.form;
      });
      dlg.querySelector('#btnCancel').onclick = ()=> dlg.remove();
      dlg.querySelector('#frmCreate').onsubmit = (ev)=>{
        ev.preventDefault();
        const legs = FORM_LEGS[type]||6;
        const name = dlg.querySelector('#fldName').value.trim() || type;
        const start = dlg.querySelector('#fldStart').value.trim();
        const horses = parseAllPaste(dlg.querySelector('#fldAllPaste').value, legs);
        const id = makeId(type);
        const game = { id, type, name, start, legs, meta:{createdAt:Date.now()}, horses, my:{}, imported:[] };
        Store.saveGame(game);
        const url = new URL(location.href); url.searchParams.set('game', id);
        location.assign(url.toString());
      };
    });
  }
  window.TravCreate = { mount };
})();
