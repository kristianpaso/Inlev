
(async()=>{
  async function me(){ try{ const r=await fetch('/.netlify/functions/api/auth/me',{credentials:'include'}); return r.ok?await r.json():null }catch{ return null } }
  const u=await me();
  const h=document.createElement('div'); h.id='site-header';
  h.innerHTML=`<div class="wrap" style="display:flex;gap:12px;align-items:center;padding:10px 0">
    <strong>Inlev</strong>
    <a href="/plock/">Plock</a><a href="/trav/">Trav</a><a href="/sandningar/">Sandningar</a><a href="/rotation/" style="color:#fff">Rotation</a><a href="/beteknepet/" style="color:#fff">Beteknepet</a><a href="/pris/" style="color:#fff">Pris</a><a href="/gameone/" style="color:#fff">Mythic Explorer</a>
    <a href="/schema/">Schema</a><a href="/statistik/">Statistik</a><a href="/users/">Users</a>
    <span class="spacer"></span>
    <span>Inloggad som: <b>${u?.user||'Gäst'}</b></span>
    ${u ? '<button id="logout" class="danger">Logga ut</button>' : '<a href="/login.html"><button>Logga in</button></a>'}
  </div>`;
  document.body.prepend(h);
  const btn=document.getElementById('logout'); if(btn) btn.onclick=async()=>{ await fetch('/.netlify/functions/api/auth/logout',{method:'POST',credentials:'include'}); location.replace('/login.html'); };
})();