
/* FIX48: enforce projectBar -> <project>/index.html */
(function(){
  function fix(){
    var bar=document.getElementById('projectBar'); if(!bar) return;
    var map={ 'Sändningar':'sandningar/index.html','Sandningar':'sandningar/index.html','Trav':'trav/index.html','Plock':'plock/index.html','Schema':'schema/index.html','Statistik':'statistik/index.html','Users':'users/index.html' };
    Array.from(bar.querySelectorAll('a')).forEach(a=>{
      var t=(a.textContent||'').trim(); if(!map[t]) return;
      var href=a.getAttribute('href')||'';
      if(!/index\.html$/.test(href)){
        var prefix = href.startsWith('../') ? '../' : (href.startsWith('./') ? './' : '');
        a.setAttribute('href', prefix + map[t]);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', fix);
})();
