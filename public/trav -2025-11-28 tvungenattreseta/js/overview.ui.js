
import { TravStore } from "./trav.storage.js";
export function renderOverview(host, onOpen, onCreate){
  host.innerHTML = `<header class="pagebar"><h1>Trav — Överblick</h1><button class="btn primary" id="btnNew">Skapa spelsystem</button></header><section id="cards" class="grid-cards"></section>`;
  host.querySelector("#btnNew").onclick=()=>onCreate?.();
  const cards=host.querySelector("#cards"); const all=TravStore.getAll();
  const entries=Object.entries(all);
  cards.innerHTML = entries.map(([id,s])=>`<article class="card gamecard"><h3>${s.meta?.name||id}</h3><div class="small muted">Typ: ${s.meta?.form||"?"} • Avd: ${s.horses?.divisions?.length||"?"}</div><div class="row mt"><button class="btn" data-open="${id}">Öppna</button><button class="btn danger" data-del="${id}">Ta bort</button></div></article>`).join("") || `<div class="muted">Inga spel skapade än.</div>`;
  cards.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>onOpen?.(b.dataset.open));
  cards.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{ if(confirm("Ta bort detta spelsystem?")){ TravStore.remove(b.dataset.del); renderOverview(host,onOpen,onCreate);} });
}

