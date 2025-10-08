/* Rewrite old /insamlare.html links to /sandningar/insamlare.html */
(function(){
  function fix(){
    document.querySelectorAll('a[href$="insamlare.html"], a[href*="insamlare.html?"]').forEach(a=>{
      try{
        var u = new URL(a.getAttribute('href'), location.origin);
        u.pathname = '/sandningar/insamlare.html';
        a.setAttribute('href', u.pathname + u.search + u.hash);
      }catch(e){}
    });
  }
  document.addEventListener('DOMContentLoaded', fix);
})();
