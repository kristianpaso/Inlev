
import { el, $ } from './trav.dom.js';

export function mountGameMenu(target, meta){
  target.innerHTML = '';
  target.append(
    el('div',{id:'gameHeader'},
      el('div',{}, el('a',{href:'./index.html', className:'btn', textContent:'Överblick'}), ' ',
        el('strong',{textContent:`${meta.name || meta.id} — ${meta.type} (${meta.legs} avd)`})
      ),
      el('div',{}, el('button',{id:'btnEdit', className:'btn', textContent:'Redigera spel'}))
    )
  );
}
