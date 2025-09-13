
(function(){
  if (document.getElementById('inlev-topnav')) return;
  var link = document.createElement('link');
  link.rel='stylesheet'; link.href='/assets/nav.css'; document.head.appendChild(link);
  var hdr = document.createElement('header'); hdr.className='header'; hdr.id='inlev-topnav';
  hdr.innerHTML = '<div class="brand">Inlev</div><nav class="nav">'
    + '<a href="/sandningar.html" id="link-sandningar">Sändningar</a>'
    + '<a href="/trav/" id="link-trav">Trav</a></nav>';
  document.body.insertBefore(hdr, document.body.firstChild);
  var p = location.pathname.replace(/\/$/,'/');
  var t = document.getElementById('link-trav');
  var s = document.getElementById('link-sandningar');
  if (p.startsWith('/trav')) t.classList.add('active'); else s.classList.add('active');
})();