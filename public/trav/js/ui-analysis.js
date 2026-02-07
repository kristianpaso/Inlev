// public/trav/js/ui-analysis.js
// Analysmodul på trav/index.html: skapa/lista/redigera/ta bort + "Klistra in analys".

function escapeHtml(str){
  return (str ?? '').toString()
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function parsePastedAnalysis(text){
  const getLine = (label) => {
    const r = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'im');
    const m = text.match(r);
    return m ? m[1].trim() : '';
  };

  const name = getLine('Namn');
  const date = getLine('Datum');
  const track = getLine('Bana');
  const trackType = getLine('Typ av bana');
  const group = getLine('Grupp');
  let start = getLine('Start').toLowerCase();
  if (start.includes('volt')) start = 'voltstart';
  else if (start.includes('auto')) start = 'autostart';
  else start = '';

  const distRaw = getLine('Distans');
  const distance = Number((distRaw || '').toString().replace(/[^0-9]/g,'') || 0);

  // Kommentar: allt efter första "Kommentar:" om den finns
  let comment = '';
  const idx = text.toLowerCase().indexOf('kommentar:');
  if (idx >= 0) {
    comment = text.slice(idx + 'kommentar:'.length).trim();
  } else {
    comment = text.trim();
  }

  return { name, date, track, trackType, group, start, distance, comment };
}

export function initAnalysisUI({
  getAnalyses,
  createAnalysis,
  updateAnalysis,
  deleteAnalysis,
}){
  const btnCreate = document.getElementById('btn-new-analysis');
  const panel = document.getElementById('analysis-panel');
  const listEl = document.getElementById('analysis-list');
  const countEl = document.getElementById('analysis-count');

  const modal = document.getElementById('analysis-modal');
  const btnClose = document.getElementById('analysis-modal-close');
  const btnSave = document.getElementById('btn-save-analysis');
  const btnPaste = document.getElementById('btn-paste-analysis');
  const btnClear = document.getElementById('btn-clear-analysis');

  const fName = document.getElementById('a-name');
  const fDate = document.getElementById('a-date');
  const fTrack = document.getElementById('a-track');
  const fTrackType = document.getElementById('a-trackType');
  const fGroup = document.getElementById('a-group');
  const fStart = document.getElementById('a-start');
  const fDistance = document.getElementById('a-distance');
  const fComment = document.getElementById('a-comment');
  const fRaceInfo = document.getElementById('a-raceInfo');
  const fOtherInfo = document.getElementById('a-otherInfo');

  function _extractSection(comment, label){
    const txt = (comment ?? '').toString();
    // matchar t.ex. "Lopp info:\n..." fram till nästa rubrik eller slut
    const labels = ['Lopp info','Övrig info','Analys'];
    const other = labels.filter(l => l.toLowerCase() !== label.toLowerCase()).map(l => l.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp(`(?:^|\\n)${safeLabel}:\\s*\\n([\\s\\S]*?)(?=\\n\\n(?:${other}):|$)`, 'i');
    const m = txt.match(re);
    return m ? (m[1] ?? '').trim() : '';
  }

  let cache = [];
  let editingId = null;

  function openModal(item){
    editingId = item?._id || null;
    if (modal) modal.hidden = false;

    fName.value = item?.name || '';
    fDate.value = (item?.date || '').slice(0,10) || '';
    fTrack.value = item?.track || '';
    fTrackType.value = item?.trackType || '';
    fGroup.value = item?.group || '';
    fStart.value = item?.start || '';
    fDistance.value = item?.distance ? String(item.distance) : '';
    const _c = item?.comment || '';
    if (fRaceInfo) fRaceInfo.value = _extractSection(_c, 'Lopp info');
    if (fOtherInfo) fOtherInfo.value = _extractSection(_c, 'Övrig info');
    const _a = _extractSection(_c, 'Analys');
    // Om kommentaren inte är sektionerad: visa allt i Analys-fältet
    fComment.value = (_a || (fRaceInfo?.value || fOtherInfo?.value) ? _a : _c);
  }
  function closeModal(){
    if (modal) modal.hidden = true;
    editingId = null;
  }
  function clearFields(){
    fName.value = '';
    fDate.value = '';
    fTrack.value = '';
    fTrackType.value = '';
    fGroup.value = '';
    fStart.value = '';
    fDistance.value = '';
    if (fRaceInfo) fRaceInfo.value = '';
    if (fOtherInfo) fOtherInfo.value = '';
    fComment.value = '';
  }

  function render(){
    if (countEl) countEl.textContent = `${cache.length} analyser`;
    if (!listEl) return;
    listEl.innerHTML = '';

    for (const a of cache){
      const div = document.createElement('div');
      div.className = 'analysis-card';

      const tags = [
        a.track ? `<span class="analysis-tag">${escapeHtml(a.track)}</span>` : '',
        a.trackType ? `<span class="analysis-tag">${escapeHtml(a.trackType)}</span>` : '',
        a.start ? `<span class="analysis-tag">${escapeHtml(a.start)}</span>` : '',
        a.distance ? `<span class="analysis-tag">${a.distance}m</span>` : '',
      ].filter(Boolean).join(' ');

      div.innerHTML = `
        <div class="analysis-top">
          <div class="analysis-title">${escapeHtml(a.name || '')}</div>
          <div class="analysis-actions">
            <button class="btn small" data-act="edit">Redigera</button>
            <button class="btn small danger" data-act="del">Ta bort</button>
          </div>
        </div>
        <div class="analysis-meta">
          ${tags}
          ${a.group ? `<div class="analysis-group">${escapeHtml(a.group)}</div>` : ''}
          ${a.date ? `<div class="analysis-date">${escapeHtml(a.date)}</div>` : ''}
        </div>
        <div class="analysis-snippet">${escapeHtml((a.comment||'').slice(0,220))}${(a.comment||'').length>220?'…':''}</div>
      `;

      div.addEventListener('click', async (e)=>{
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'edit') openModal(a);
        if (act === 'del'){
          if (confirm('Ta bort analys?')) {
            await deleteAnalysis(a._id);
            await refresh();
          }
        }
      });

      listEl.appendChild(div);
    }
  }

  async function refresh(){
    cache = await getAnalyses();
    render();
  }

  // Exponera cache globalt så overview.js kan använda den direkt utan extra fetch
  window.__TRAV_ANALYSES__ = () => cache.slice();

  btnCreate?.addEventListener('click', () => {
    if (panel && panel.hidden) panel.hidden = false;
    openModal(null);
  });
  btnClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });

  btnClear?.addEventListener('click', clearFields);

  btnPaste?.addEventListener('click', ()=>{
    const pasted = prompt('Klistra in hela analysblocket här (Namn/Datum/Bana/Typ/Grupp/Start/Distans/Kommentar):');
    if (!pasted) return;
    const p = parsePastedAnalysis(pasted);
    fName.value = p.name || fName.value;
    fDate.value = p.date || fDate.value;
    fTrack.value = p.track || fTrack.value;
    fTrackType.value = p.trackType || fTrackType.value;
    fGroup.value = p.group || fGroup.value;
    fStart.value = p.start || fStart.value;
    fDistance.value = p.distance ? String(p.distance) : fDistance.value;
    fComment.value = p.comment || fComment.value;
  });

  btnSave?.addEventListener('click', async ()=>{
    const raceInfo = (fRaceInfo?.value || '').trim();
    const otherInfo = (fOtherInfo?.value || '').trim();
    const analysisText = (fComment.value || '').trim();
    const parts = [];
    if (raceInfo) parts.push(`Lopp info:\n${raceInfo}`);
    if (otherInfo) parts.push(`Övrig info:\n${otherInfo}`);
    if (analysisText) parts.push(`Analys:\n${analysisText}`);
    const packedComment = parts.length ? parts.join('\n\n') : analysisText;

    const body = {
      name: fName.value.trim(),
      date: fDate.value || '',
      track: fTrack.value.trim(),
      trackType: fTrackType.value.trim(),
      group: fGroup.value.trim(),
      start: fStart.value || '',
      distance: Number((fDistance.value||'').replace(/[^0-9]/g,'') || 0),
      comment: packedComment,
    };
    if (!body.name || !body.track){
      alert('Fyll minst i Namn + Bana.');
      return;
    }
    if (editingId){
      await updateAnalysis(editingId, body);
    } else {
      await createAnalysis(body);
    }
    await refresh();
    closeModal();
  });

  refresh().catch(e => console.warn('Kunde inte ladda analyser', e));

  return { refresh };
}
