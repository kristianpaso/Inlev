(function(){
  function addButton(container) {
    if (!container) return;
    if (container.querySelector('[data-id="schema-link"]')) return;
    const a = document.createElement('a');
    a.textContent = 'Schema';
    a.href = '/schema/';
    a.setAttribute('data-id','schema-link');
    a.style.marginLeft = '8px';
    a.style.fontWeight = '600';
    a.className = 'btn btn-small project-link';
    container.appendChild(a);
  }
  function tryAllSelectors() {
    const selectors = ['#projectBar', '#projektBar', '.projectBar', '.projektBar', 'nav .projects', 'nav .project-bar'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const links = Array.from(document.querySelectorAll('a')).filter(a => /\/(trav|plock|statistik)\b/.test(a.getAttribute('href')||''));
    if (links.length) return links[0].parentElement;
    return null;
  }
  function init() {
    addButton(tryAllSelectors());
    const obs = new MutationObserver(() => addButton(tryAllSelectors()));
    obs.observe(document.documentElement, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
