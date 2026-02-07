(() => {
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

  ready(() => {
    const body = document.body;

    // Backdrop
    let overlay = document.querySelector('.drawer-overlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.className = 'drawer-overlay';
      document.body.appendChild(overlay);
    }

    const btnInventory = document.getElementById('btn-inventory') || document.getElementById('btn-inventory2');
    const btnModes = document.getElementById('btn-modes');

    function closeDrawers(){
      body.classList.remove('drawer-left-open','drawer-right-open');
    }

    function toggle(cls){
      // Only use drawers on mobile
      if(!isMobile()) return;
      const isOpen = body.classList.contains(cls);
      closeDrawers();
      if(!isOpen) body.classList.add(cls);
    }

    overlay.addEventListener('click', () => closeDrawers());

    if(btnInventory){
      btnInventory.addEventListener('click', (e) => {
        if(!isMobile()) return; 
        e.preventDefault();
        toggle('drawer-left-open');
      });
    }

    if(btnModes){
      btnModes.addEventListener('click', (e) => {
        if(!isMobile()) return;
        e.preventDefault();
        toggle('drawer-right-open');
      }, true);
    }

    // If resized, ensure drawers don't get stuck
    window.addEventListener('resize', () => {
      if(!isMobile()) closeDrawers();
    });

    // Start with drawers closed on mobile
    if(isMobile()) closeDrawers();
  });
})();
