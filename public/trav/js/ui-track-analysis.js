// public/trav/js/ui-track-analysis.js
// Enkel "ban-analys" för video + anteckningar som sparas på TravTrack.infoText + TravTrack.comments.
// Simuleringen kan läsa SIM_GEO:{...} från kommentarerna (t.ex. aspect) för att rita banan mer korrekt.

function esc(s){ return (s ?? '').toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function upsertSimGeoLine(text, obj){
  const line = `SIM_GEO:${JSON.stringify(obj)}`;
  const rx = /^SIM_GEO\s*[:=].*$/im;
  if (rx.test(text)) return text.replace(rx, line);
  return (text ? (text.trimEnd() + "\n") : "") + line + "\n";
}

export function initTrackAnalysisModal({ updateTrack, onUpdated }){
  let currentTrack = null;
  let localComments = [];
  let editingIndex = -1;

  // minimal styles (självförsörjande)
  const style = document.createElement('style');
  style.textContent = `
  .ta-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:99999;}
  .ta-modal{width:min(980px,94vw);max-height:90vh;overflow:auto;background:#0f1320;border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:16px;color:#e9eefc;}
  .ta-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .ta-col{flex:1 1 320px;min-width:280px}
  .ta-h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}
  .ta-h h2{margin:0;font-size:18px}
  .ta-close{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer}
  .ta-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;margin-top:10px}
  .ta-label{font-size:12px;opacity:.85;margin-bottom:4px}
  .ta-input,.ta-text{width:100%;box-sizing:border-box;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;padding:8px 10px;outline:none}
  .ta-text{min-height:120px;resize:vertical}
  .ta-btn{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}
  .ta-btn.primary{background:rgba(91,140,255,.18);border-color:rgba(91,140,255,.35)}
  .ta-list{display:flex;flex-direction:column;gap:8px;max-height:210px;overflow:auto}
  .ta-item{padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);cursor:pointer}
  .ta-item small{opacity:.75}
  .ta-videoWrap{position:relative;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.10);background:#000}
  .ta-video{width:100%;height:auto;display:block}
  .ta-canvas{position:absolute;inset:0;cursor:crosshair}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'ta-overlay';
  overlay.innerHTML = `
    <div class="ta-modal" role="dialog" aria-modal="true">
      <div class="ta-h">
        <div>
          <h2 id="ta-title">Ban-analys</h2>
          <div style="opacity:.8;font-size:12px" id="ta-sub"></div>
        </div>
        <button class="ta-close" id="ta-close">✕</button>
      </div>

      <div class="ta-row">
        <div class="ta-col ta-card">
          <div class="ta-label">Bana – Info (sparas på banan)</div>
          <textarea class="ta-text" id="ta-info" placeholder="T.ex. generella anteckningar om banan, underlag, kurvor, open stretch..."></textarea>

          <div class="ta-row" style="margin-top:10px;justify-content:flex-end">
            <button class="ta-btn primary" id="ta-save-info">Spara info</button>
          </div>
        </div>

        <div class="ta-col ta-card">
          <div class="ta-label">Kommentarer (för simulering & video-analys)</div>
          <div class="ta-list" id="ta-list"></div>
          <div class="ta-row" style="margin-top:10px;justify-content:flex-end">
            <button class="ta-btn" id="ta-new">Ny kommentar</button>
          </div>
        </div>
      </div>

      <div class="ta-card">
        <div class="ta-row">
          <div class="ta-col">
            <div class="ta-label">Datum</div>
            <input class="ta-input" id="ta-date" placeholder="YYYY-MM-DD">
          </div>
          <div class="ta-col">
            <div class="ta-label">Titel</div>
            <input class="ta-input" id="ta-title2" placeholder="t.ex. Video-kalibrering 1">
          </div>
          <div class="ta-col">
            <div class="ta-label">Grupp</div>
            <input class="ta-input" id="ta-group" placeholder="t.ex. geo">
          </div>
          <div class="ta-col">
            <div class="ta-label">Typ</div>
            <input class="ta-input" id="ta-type" placeholder="t.ex. oval">
          </div>
        </div>

        <div style="margin-top:10px">
          <div class="ta-label">Kommentar (lägg gärna in SIM_GEO här)</div>
          <textarea class="ta-text" id="ta-comment" placeholder="Skriv analys här. Du kan ha en rad: SIM_GEO:{&quot;aspect&quot;:1.85}"></textarea>
        </div>

        <div class="ta-row" style="margin-top:10px;justify-content:flex-end">
          <button class="ta-btn" id="ta-del" style="display:none">Ta bort</button>
          <button class="ta-btn primary" id="ta-save-comment">Spara kommentar</button>
        </div>
      </div>

      <div class="ta-card">
        <div class="ta-label">Video-kalibrering (valfritt)</div>
        <div style="opacity:.8;font-size:12px;margin-bottom:8px">
          Ladda upp en video, pausa på en tydlig bild, och klicka 4 punkter på innerkantens extrempunkter.
          Vi sparar en enkel SIM_GEO med aspect (bredd/höjd) som simuleringen kan använda.
        </div>
        <div class="ta-row" style="align-items:flex-start">
          <div class="ta-col" style="flex:1 1 420px">
            <input type="file" id="ta-videoFile" accept="video/*" class="ta-input">
            <div class="ta-videoWrap" style="margin-top:10px">
              <video id="ta-video" class="ta-video" controls></video>
              <canvas id="ta-canvas" class="ta-canvas"></canvas>
            </div>
          </div>
          <div class="ta-col" style="flex:1 1 280px">
            <div class="ta-card" style="margin-top:0">
              <div class="ta-label">Punkter</div>
              <div id="ta-points" style="font-size:12px;opacity:.85;line-height:1.4"></div>
              <div class="ta-row" style="margin-top:10px;justify-content:flex-end">
                <button class="ta-btn" id="ta-resetPts">Rensa punkter</button>
                <button class="ta-btn primary" id="ta-useGeo">Sätt SIM_GEO</button>
              </div>
              <div style="opacity:.75;font-size:12px;margin-top:8px">
                Tips: klicka vänster, höger, topp, botten (ordning spelar ingen roll – vi tar extrempunkter).
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  const $ = (id) => overlay.querySelector(id);

  const elClose = $('#ta-close');
  const elTitle = $('#ta-title');
  const elSub = $('#ta-sub');
  const elInfo = $('#ta-info');
  const elSaveInfo = $('#ta-save-info');
  const elList = $('#ta-list');
  const elNew = $('#ta-new');

  const elDate = $('#ta-date');
  const elTitle2 = $('#ta-title2');
  const elGroup = $('#ta-group');
  const elType = $('#ta-type');
  const elComment = $('#ta-comment');
  const elSaveComment = $('#ta-save-comment');
  const elDel = $('#ta-del');

  const file = $('#ta-videoFile');
  const video = $('#ta-video');
  const canvas = $('#ta-canvas');
  const ptsBox = $('#ta-points');
  const btnReset = $('#ta-resetPts');
  const btnUse = $('#ta-useGeo');

  let points = [];

  function setVisible(v){
    overlay.style.display = v ? 'flex' : 'none';
  }

  function renderList(){
    elList.innerHTML = '';
    const list = Array.isArray(localComments) ? localComments : [];
    if (!list.length){
      const d = document.createElement('div');
      d.style.opacity = '.75';
      d.style.fontSize = '12px';
      d.textContent = 'Inga kommentarer sparade än.';
      elList.appendChild(d);
      return;
    }
    list.slice().reverse().forEach((c, revIdx) => {
      const idx = list.length - 1 - revIdx;
      const div = document.createElement('div');
      div.className = 'ta-item';
      div.innerHTML = `<div><b>${esc(c.title || '(utan titel)')}</b></div>
        <small>${esc(c.date || '')} ${c.group?(' • '+esc(c.group)):''} ${c.trackType?(' • '+esc(c.trackType)):''}</small>`;
      div.addEventListener('click', () => loadComment(idx));
      elList.appendChild(div);
    });
  }

  function loadComment(idx){
    editingIndex = idx;
    const c = localComments[idx] || {};
    elDate.value = c.date || '';
    elTitle2.value = c.title || '';
    elGroup.value = c.group || '';
    elType.value = c.trackType || '';
    elComment.value = c.comment || '';
    elDel.style.display = 'inline-block';
  }

  function newComment(){
    editingIndex = -1;
    elDate.value = '';
    elTitle2.value = '';
    elGroup.value = '';
    elType.value = '';
    elComment.value = '';
    elDel.style.display = 'none';
  }

  async function saveTrack(partial){
    if (!currentTrack?._id) return;
    const payload = {
      name: currentTrack.name,
      code: currentTrack.code,
      slug: currentTrack.slug,
      length: currentTrack.length,
      width: currentTrack.width,
      homeStretch: currentTrack.homeStretch,
      openStretch: currentTrack.openStretch,
      angledGate: currentTrack.angledGate,
      lat: currentTrack.lat,
      lon: currentTrack.lon,
      infoText: partial.infoText ?? currentTrack.infoText ?? '',
      comments: partial.comments ?? currentTrack.comments ?? [],
      raceAnalyses: currentTrack.raceAnalyses ?? [],
    };
    const updated = await updateTrack(currentTrack._id, payload);
    currentTrack = updated;
    localComments = Array.isArray(updated.comments) ? updated.comments : [];
    onUpdated?.(updated);
    renderList();
  }

  elSaveInfo.addEventListener('click', async () => {
    try{
      await saveTrack({ infoText: elInfo.value });
    }catch(err){
      console.error(err);
      alert('Kunde inte spara info.');
    }
  });

  elNew.addEventListener('click', () => newComment());

  elSaveComment.addEventListener('click', async () => {
    try{
      const c = {
        date: (elDate.value || '').trim(),
        title: (elTitle2.value || '').trim(),
        group: (elGroup.value || '').trim(),
        trackType: (elType.value || '').trim(),
        comment: (elComment.value || '').trim(),
      };
      if (!c.title && !c.comment){
        alert('Skriv minst titel eller kommentar.');
        return;
      }
      const next = Array.isArray(localComments) ? localComments.slice() : [];
      if (editingIndex >= 0) next[editingIndex] = c;
      else next.push(c);
      localComments = next;
      await saveTrack({ comments: next });
      newComment();
    }catch(err){
      console.error(err);
      alert('Kunde inte spara kommentar.');
    }
  });

  elDel.addEventListener('click', async () => {
    if (editingIndex < 0) return;
    if (!confirm('Ta bort kommentaren?')) return;
    try{
      const next = localComments.slice();
      next.splice(editingIndex, 1);
      localComments = next;
      await saveTrack({ comments: next });
      newComment();
    }catch(err){
      console.error(err);
      alert('Kunde inte ta bort.');
    }
  });

  elClose.addEventListener('click', () => setVisible(false));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) setVisible(false);
  });

  // Video handling
  function syncCanvas(){
    const rect = video.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    drawPoints();
  }

  function drawPoints(){
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth = 2;
    for (let i=0;i<points.length;i++){
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(91,140,255,.95)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(91,140,255,.35)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = '12px system-ui';
      ctx.fillText(String(i+1), p.x + 9, p.y - 7);
    }
    ptsBox.innerHTML = points.map((p,i)=>`#${i+1}: (${Math.round(p.x)}, ${Math.round(p.y)})`).join('<br>');
  }

  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    video.src = url;
    video.load();
    points = [];
    setTimeout(syncCanvas, 200);
  });

  video.addEventListener('loadedmetadata', () => {
    setTimeout(syncCanvas, 200);
  });
  window.addEventListener('resize', () => {
    if (overlay.style.display === 'flex') setTimeout(syncCanvas, 120);
  });

  canvas.addEventListener('click', (e) => {
    if (!video.src) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    points.push({x, y});
    if (points.length > 8) points.shift();
    drawPoints();
  });

  btnReset.addEventListener('click', () => {
    points = [];
    drawPoints();
  });

  btnUse.addEventListener('click', () => {
    if (points.length < 4){
      alert('Klicka minst 4 punkter först.');
      return;
    }
    // Extrempunkter
    const left = points.reduce((a,b)=> b.x < a.x ? b : a, points[0]);
    const right = points.reduce((a,b)=> b.x > a.x ? b : a, points[0]);
    const top = points.reduce((a,b)=> b.y < a.y ? b : a, points[0]);
    const bottom = points.reduce((a,b)=> b.y > a.y ? b : a, points[0]);

    const rx = Math.max(1, (right.x - left.x) / 2);
    const ry = Math.max(1, (bottom.y - top.y) / 2);
    const aspect = Number((rx / ry).toFixed(3));

    const geo = { aspect };
    elComment.value = upsertSimGeoLine(elComment.value || '', geo);
    alert(`SIM_GEO satt (aspect=${aspect}). Spara kommentaren för att lagra på banan.`);
  });

  function open(track){
    currentTrack = track;
    localComments = Array.isArray(track?.comments) ? track.comments.slice() : [];
    editingIndex = -1;
    elTitle.textContent = `Ban-analys`;
    elSub.textContent = `${track?.name || ''} (${track?.code || ''})`;
    elInfo.value = track?.infoText || '';
    renderList();
    newComment();
    points = [];
    drawPoints();
    video.removeAttribute('src');
    video.load();
    setVisible(true);
    setTimeout(syncCanvas, 150);
  }

  return { open };
}
