import { mountSlider } from './game.slider.js';

boot();

function boot(){
  route();
  window.addEventListener('popstate', route);
  document.getElementById('btnCreate')?.addEventListener('click', () => {
    seedDemoIfMissing();
    goToGame('DEMO');
  });
}

function route(){
  const url = new URL(window.location.href);
  const game = url.searchParams.get('game');
  const vOverview = document.getElementById('view-overview');
  const vGame = document.getElementById('view-game');
  if (game){
    vOverview.classList.add('hidden');
    vGame.classList.remove('hidden');
    document.getElementById('gameTitle').textContent = game;
    const host = document.getElementById('trav-slider-host');
    host.innerHTML = ''; // reset
    mountSlider(host, game);
  } else {
    vGame.classList.add('hidden');
    vOverview.classList.remove('hidden');
  }
}

export function goToGame(id){
  const url = new URL(window.location.href);
  url.searchParams.set('game', id);
  history.pushState({}, '', url);
  route();
}

function seedDemoIfMissing(){
  if (localStorage.getItem('trav:game:DEMO')) return;
  const data = {
    meta:{ id:'DEMO', title:'Demo-spel', type:'V64', legs:6, unitPrice:1 },
    horses:[
      { leg:1,no:1,name:'Sandsjöns Amazing',driver:'Olle Wäjersten','V64%':5,'TREND%':'-0.74','DISTANS & SPÅR':'2140:1','STARTER I ÅR':'11 1-1-1','VAGN':'Va.','V-ODDS':'26,69' },
      { leg:1,no:2,name:'M.T.Tatanka',driver:'Vincent Eliasson','V64%':1,'TREND%':'+0.10','DISTANS & SPÅR':'2140:2','STARTER I ÅR':'12 1-1-0','VAGN':'Va.','V-ODDS':'27,37' },
      { leg:1,no:3,name:'Candy Celebration',driver:'Fredrik Plassen','V64%':32,'TREND%':'-3.89','DISTANS & SPÅR':'2140:3','STARTER I ÅR':'8 2-0-2','VAGN':'Va.','V-ODDS':'3,01' },
      { leg:1,no:4,name:'Thai Charon',driver:'Filip Lindholm','V64%':1,'TREND%':'+0.05','DISTANS & SPÅR':'2140:4','STARTER I ÅR':'5 1-1-0','VAGN':'Va.','V-ODDS':'32,14' },
      { leg:1,no:5,name:'Weightlessness',driver:'Oskar Florhed','V64%':3,'TREND%':'-0.38','DISTANS & SPÅR':'2140:5','STARTER I ÅR':'7 0-1-0','VAGN':'Va.','V-ODDS':'21,98' },
      { leg:1,no:6,name:'Molte Wibb',driver:'Henrik Kihle','V64%':33,'TREND%':'+0.65','DISTANS & SPÅR':'2140:6','STARTER I ÅR':'11 3-0-1','VAGN':'Va.','V-ODDS':'3,33' },

      { leg:2,no:1,name:'Joker Ima',driver:'Peter G Norman','V64%':3,'TREND%':'+1.15','DISTANS & SPÅR':'2140:1','STARTER I ÅR':'14 2-3-3','VAGN':'Va.','V-ODDS':'19,72' },
      { leg:2,no:2,name:'Urano Unico',driver:'Jorma Kontio','V64%':2,'TREND%':'+0.30','DISTANS & SPÅR':'2140:2','STARTER I ÅR':'17 2-3-2','VAGN':'Va.','V-ODDS':'20,85' },
      { leg:2,no:3,name:'Olle Sting',driver:'Claes Sjöström','V64%':39,'TREND%':'+0.59','DISTANS & SPÅR':'2140:3','STARTER I ÅR':'12 2-4-1','VAGN':'Va.','V-ODDS':'2,78' }
    ],
    coupons:[
      { rows:{ '1':[1], '2':[1,2] } },
      { rows:{ '1':[3], '2':[2] } }
    ],
    mine:{ rows:{ '1':[3], '2':[1] } }
  };
  localStorage.setItem('trav:game:DEMO', JSON.stringify(data));
}
