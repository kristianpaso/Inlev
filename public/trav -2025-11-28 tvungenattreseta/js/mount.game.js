// Minimal router: mountar slidern i spelvyn (ingen demo)
import { mountSlider } from './game.slides.js';

function param(name) { return new URLSearchParams(location.search).get(name); }

export function routeToGame() {
  const host = document.getElementById('trav-slider-host');
  if (!host) { console.warn('Hittade ingen #trav-slider-host'); return; }
  const gameId = param('game');           // ⬅️ kräver ?game=<id>
  if (!gameId) {
    host.innerHTML = '<div style="color:#9fb4cd">Ingen game-id i URL:en (?game=...). Gå in via överblicken.</div>';
    return;
  }
  mountSlider(gameId, host);
}

routeToGame();
