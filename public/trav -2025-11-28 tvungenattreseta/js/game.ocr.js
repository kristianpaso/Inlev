// game.ocr.js (minimal)
import { Store } from './trav.storage.js';
export function initOCR(gameId, toolbar){
  toolbar.insertAdjacentHTML('beforeend', `<button id="btnOCR" class="btn">Läs kuponger (OCR)</button>`);
  const dlg=document.createElement('dialog'); dlg.id='dlgOCR'; dlg.innerHTML=`<form method="dialog" class="card">
  <header class="card-header"><b>OCR</b></header>
  <div class="card-body"><textarea id="ocrText" rows="8" class="textarea mono" placeholder="avd: 1 4 6"></textarea></div>
  <footer class="card-footer"><button class="btn" value="cancel">Stäng</button><button class="btn btn-primary" id="saveOCR" value="default">Spara</button></footer>
  </form>`; document.body.appendChild(dlg);
  document.getElementById('btnOCR').onclick=()=>dlg.showModal();
  dlg.querySelector('#saveOCR').onclick=(e)=>{e.preventDefault();
    const raw = dlg.querySelector('#ocrText').value; const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const avd=[]; lines.forEach(ln=>{const m=ln.match(/^(\d+)\s*:\s*(.+)$/)||ln.match(/^avd[:\s]+(\d+)\s+(.+)$/i); if(m){ const i=+m[1]-1; avd[i]=m[2].split(/\s+/).map(n=>+n).filter(Boolean);} });
    const list = Store.get(gameId,'coupons',[]); list.push({avd}); Store.set(gameId,'coupons',list); dlg.close();
    document.dispatchEvent(new CustomEvent('trav:coupons-changed',{detail:{gameId}}));
  };
}
