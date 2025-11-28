// game.manual.js (minimal)
import { Store } from './trav.storage.js';
export function initManual(gameId, toolbar){
  toolbar.insertAdjacentHTML('beforeend', `<button id="btnManual" class="btn">Lägg kupong manuellt</button>`);
  const dlg = document.createElement('dialog'); dlg.id='dlgManual'; dlg.innerHTML=`<form method="dialog" class="card">
    <header class="card-header"><b>Lägg kupong manuellt</b></header>
    <div class="card-body" id="manualBody"></div>
    <footer class="card-footer"><button class="btn" value="cancel">Stäng</button><button class="btn btn-primary" id="saveManual" value="default">Spara</button></footer>
  </form>`; document.body.appendChild(dlg);
  const divs = (Store.get(gameId,'meta',{})?.divisions)||6;
  const body = dlg.querySelector('#manualBody');
  body.innerHTML = Array.from({length:divs},(_,i)=>`<div>Avd ${i+1}: <input data-i="${i}" placeholder="t.ex. 1 3 7" class="input"></div>`).join('');
  document.getElementById('btnManual').onclick=()=>dlg.showModal();
  dlg.querySelector('#saveManual').onclick = (e)=>{e.preventDefault();
    const avd = []; body.querySelectorAll('input').forEach(inp=>{ const i=+inp.dataset.i; avd[i]=(inp.value.trim().split(/\s+/).map(n=>+n).filter(Boolean)); });
    const list = Store.get(gameId,'coupons',[]); list.push({avd}); Store.set(gameId,'coupons',list); dlg.close();
    document.dispatchEvent(new CustomEvent('trav:coupons-changed',{detail:{gameId}}));
  };
}
