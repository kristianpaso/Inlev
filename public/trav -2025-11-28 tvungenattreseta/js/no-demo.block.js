
/**
 * no-demo.block.js — Förhindrar att demo startar om gamla demofiler råkar ligga kvar.
 *  - stoppar globala start() om de har data-demo-attribut
 *  - gömmer noder med [data-demo]
 */
(function(){
  'use strict';
  // Ta bort alla demo-taggar
  document.querySelectorAll('[data-demo], .demo-only, script[src*="demo"]').forEach(n=>{
    n.remove();
  });
  // Nolla ev. demo-api
  if (window.TravDemo){ try{ window.TravDemo.stop && window.TravDemo.stop(); }catch{} window.TravDemo = undefined; }
  if (window.mountDemo){ window.mountDemo = function(){ /* blocked */ }; }
})();
