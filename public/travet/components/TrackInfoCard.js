const esc = (value) => String(value ?? '–')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const value = (number, suffix = '') => number == null ? '–' : `${esc(number)}${suffix}`;

export function renderTrackInfoCard(track) {
  const turns = track?.turns || {};
  const widths = Object.fromEntries((track?.start_widths || []).map((item) => [Number(item.distance_m), item.width_m]));
  return `<article class="track-info-card">
    <div class="track-info-card-title"><div><span class="eyebrow">BANPROFIL</span><h2 id="track-modal-title">${esc(track?.name)}</h2></div><span class="track-abbr">${esc(track?.abbr)}</span></div>
    <div class="track-info-grid">
      <div><span>Banalängd</span><strong>${value(track?.length_m, ' m')}</strong></div>
      <div><span>Upplopp</span><strong>${value(track?.homestretch_m, ' m')}</strong></div>
      <div><span>Bredd 2140</span><strong>${value(widths[2140], ' m')}</strong></div>
      <div><span>Bredd 1640</span><strong>${value(widths[1640], ' m')}</strong></div>
      <div><span>Open stretch</span><strong>${track?.open_stretch?.enabled ? `${esc(track.open_stretch.lanes)} spår` : 'Nej'}</strong></div>
      <div><span>Vinklad vinge</span><strong>${track?.angled_starting_gate ? 'Ja' : 'Nej'}</strong></div>
      <div><span>Kurvradie 1</span><strong>${value(turns.radius_turn1_m, ' m')}</strong></div>
      <div><span>Kurvradie 2</span><strong>${value(turns.radius_turn2_m, ' m')}</strong></div>
      <div><span>Dosering 1</span><strong>${value(turns.banking_turn1_pct, ' %')}</strong></div>
      <div><span>Dosering 2</span><strong>${value(turns.banking_turn2_pct, ' %')}</strong></div>
    </div>
    <p class="track-info-note">Banfakta är kontext för analysen och avgör inte ensam spik eller gardering.</p>
  </article>`;
}
