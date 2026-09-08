/* Autostart Simulation (B2 v2 - force hook)
   Goal: If your page still shows the old simulation, this file now:
   - injects its own CSS so you see a visible "B2" badge
   - captures clicks on simulate buttons and stops old handlers (capture phase + stopImmediatePropagation)
   - patches ALL "division" selects to include 8 if missing
   - provides manual test: window.startAutostartSim(1)
*/
(() => {
  "use strict";

  console.info("[AutostartSim] B2 v2 loaded ✅");

  const INLINE_CSS = `/* Autostart Simulation UI (modal + canvas) */

:root {
  --sim-z: 999999;
  --sim-bg: rgba(0, 0, 0, 0.72);
  --sim-panel: rgba(18, 18, 18, 0.92);
  --sim-border: rgba(255, 255, 255, 0.12);
  --sim-text: rgba(255, 255, 255, 0.92);
  --sim-muted: rgba(255, 255, 255, 0.65);
}

#autostart-sim-modal {
  position: fixed;
  inset: 0;
  z-index: var(--sim-z);
  display: none;
  align-items: center;
  justify-content: center;
  background: var(--sim-bg);
  padding: 14px;
}

#autostart-sim-modal[data-open="1"] {
  display: flex;
}

.autostart-sim-card {
  width: min(1100px, 96vw);
  height: min(720px, 92vh);
  background: var(--sim-panel);
  border: 1px solid var(--sim-border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.55);
  display: grid;
  grid-template-rows: auto 1fr;
}

.autostart-sim-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sim-border);
}

.autostart-sim-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--sim-text);
  letter-spacing: 0.2px;
}

.autostart-sim-title .b2-badge{
  display:inline-block;
  margin-left:8px;
  font-size:11px;
  padding:2px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.22);
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.92);
}

.autostart-sim-sub {
  font-size: 12px;
  color: var(--sim-muted);
  margin-left: 6px;
}

.autostart-sim-spacer {
  flex: 1;
}

.autostart-sim-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.autostart-sim-controls label {
  font-size: 12px;
  color: var(--sim-muted);
  display: flex;
  gap: 8px;
  align-items: center;
}

#autostart-sim-division {
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--sim-border);
  background: rgba(255,255,255,0.06);
  color: var(--sim-text);
  padding: 0 10px;
  outline: none;
}

.autostart-sim-btn {
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--sim-border);
  background: rgba(255,255,255,0.06);
  color: var(--sim-text);
  padding: 0 12px;
  cursor: pointer;
  user-select: none;
}

.autostart-sim-btn:hover {
  background: rgba(255,255,255,0.10);
}

.autostart-sim-close {
  height: 30px;
  width: 38px;
  border-radius: 10px;
  border: 1px solid var(--sim-border);
  background: rgba(255,255,255,0.06);
  color: var(--sim-text);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.autostart-sim-body {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
}

#autostart-sim-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

#autostart-sim-winner {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
  padding: 20px;
}

#autostart-sim-winner[data-show="1"] {
  display: flex;
}

.autostart-sim-winner-card {
  pointer-events: none;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.20);
  border-radius: 18px;
  padding: 18px 20px;
  max-width: 780px;
}

.autostart-sim-winner-title {
  font-size: 18px;
  font-weight: 900;
  color: var(--sim-text);
  margin-bottom: 6px;
}

.autostart-sim-winner-sub {
  font-size: 13px;
  color: var(--sim-muted);
}
`;

  const SIM = {
    raf: 0,
    running: false,
    startTs: 0,
    lastTs: 0,
    horses: [],
    finishOrder: [],
    finished: false,

    trackMeters: 1000,
    raceMeters: 2140,
    precomputed: null,

    modal: null,
    canvas: null,
    ctx: null,
    winnerOverlay: null,
    divisionSelect: null,

    opts: {
      maxDivisions: 8,
      mergeAfterMeters: 160,
      safeGap: 2.8,
      draftRange: 7.5,
      draftBenefit: 0.32,
      leaderPenalty: 0.18,
      laneWidthMeters: 2.0,
      startGridWidthMeters: 10.5,
      startRowGapMeters: 3.5,
      baseSpeedMin: 13.2,
      baseSpeedMax: 15.3
    }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  function nowMs() {
    return performance && performance.now ? performance.now() : Date.now();
  }

  function ensureCssInjected() {
    if (document.getElementById("autostart-sim-inline-css")) return;
    const style = document.createElement("style");
    style.id = "autostart-sim-inline-css";
    style.textContent = INLINE_CSS;
    document.head.appendChild(style);
  }

  function ensureModalUI() {
    ensureCssInjected();
    if (document.getElementById("autostart-sim-modal")) return;

    const modal = document.createElement("div");
    modal.id = "autostart-sim-modal";
    modal.innerHTML = `
      <div class="autostart-sim-card" role="dialog" aria-modal="true" aria-label="Autostart simulering">
        <div class="autostart-sim-header">
          <div class="autostart-sim-title">
            Autostart-simulering <span class="b2-badge">B2</span>
            <span class="autostart-sim-sub">(vänster varv, oval bana)</span>
          </div>
          <div class="autostart-sim-spacer"></div>
          <div class="autostart-sim-controls">
            <label>
              Avdelning
              <select id="autostart-sim-division"></select>
            </label>
            <button class="autostart-sim-btn" id="autostart-sim-restart" type="button">Starta om</button>
            <button class="autostart-sim-close" id="autostart-sim-close" type="button" aria-label="Stäng">×</button>
          </div>
        </div>
        <div class="autostart-sim-body">
          <canvas id="autostart-sim-canvas"></canvas>
          <div id="autostart-sim-winner">
            <div class="autostart-sim-winner-card">
              <div class="autostart-sim-winner-title" id="autostart-sim-winner-title"></div>
              <div class="autostart-sim-winner-sub" id="autostart-sim-winner-sub"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) closeSim();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.getAttribute("data-open") === "1") closeSim();
    });

    modal.querySelector("#autostart-sim-close").addEventListener("click", closeSim);
    modal.querySelector("#autostart-sim-restart").addEventListener("click", () => {
      const div = parseInt(modal.querySelector("#autostart-sim-division").value || "1", 10);
      startSim({ division: div });
    });
  }

  function patchDivisionSelectEl(sel, maxDivisions) {
    if (!sel) return;
    const have = new Set([...sel.options].map(o => parseInt(o.value, 10)).filter(n => Number.isFinite(n)));
    for (let i = 1; i <= maxDivisions; i++) {
      if (!have.has(i)) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = String(i);
        sel.appendChild(opt);
      }
    }
    const opts = [...sel.options].sort((a, b) => (parseInt(a.value, 10) || 0) - (parseInt(b.value, 10) || 0));
    sel.innerHTML = "";
    opts.forEach(o => sel.appendChild(o));
  }

  function patchAllDivisionSelects() {
    const selects = [...document.querySelectorAll("select")];
    for (const sel of selects) {
      const text = (sel.id + " " + sel.name + " " + (sel.getAttribute("aria-label") || "")).toLowerCase();
      const looksLikeDivision =
        text.includes("avd") || text.includes("avdel") || text.includes("division") || text.includes("race");

      const nums = [...sel.options].map(o => parseInt(o.value, 10)).filter(n => Number.isFinite(n));
      const max = nums.length ? Math.max(...nums) : 0;

      if (looksLikeDivision || (nums.length >= 5 && max === 7)) {
        patchDivisionSelectEl(sel, 8);
      }
    }
  }

  function openSim() {
    ensureModalUI();
    SIM.modal = document.getElementById("autostart-sim-modal");
    SIM.canvas = document.getElementById("autostart-sim-canvas");
    SIM.ctx = SIM.canvas.getContext("2d", { alpha: false });
    SIM.winnerOverlay = document.getElementById("autostart-sim-winner");
    SIM.divisionSelect = document.getElementById("autostart-sim-division");

    patchDivisionSelectEl(SIM.divisionSelect, SIM.opts.maxDivisions);

    SIM.modal.setAttribute("data-open", "1");
    resizeCanvas();
  }

  function closeSim() {
    SIM.running = false;
    if (SIM.raf) cancelAnimationFrame(SIM.raf);
    SIM.raf = 0;
    const modal = document.getElementById("autostart-sim-modal");
    if (modal) modal.setAttribute("data-open", "0");
  }

  function resizeCanvas() {
    if (!SIM.canvas) return;
    const rect = SIM.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    SIM.canvas.width = Math.floor(rect.width * dpr);
    SIM.canvas.height = Math.floor(rect.height * dpr);
    SIM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    SIM.precomputed = precomputeEllipse(rect.width, rect.height, SIM.trackMeters);
  }

  window.addEventListener("resize", () => {
    if (document.getElementById("autostart-sim-modal")?.getAttribute("data-open") === "1") resizeCanvas();
  });

  function precomputeEllipse(w, h, trackMeters) {
    const pad = 40;
    const cx = w / 2;
    const cy = h / 2 + 10;
    const rx = Math.max(160, (w - pad * 2) * 0.40);
    const ry = Math.max(120, (h - pad * 2) * 0.34);

    const N = 2048;
    const theta = new Float64Array(N + 1);
    const cum = new Float64Array(N + 1);
    theta[0] = 0;
    cum[0] = 0;

    let total = 0;
    let prevX = cx + rx * Math.cos(0);
    let prevY = cy + ry * Math.sin(0);
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      theta[i] = t;
      const x = cx + rx * Math.cos(t);
      const y = cy + ry * Math.sin(t);
      const ds = Math.hypot(x - prevX, y - prevY);
      total += ds;
      cum[i] = total;
      prevX = x;
      prevY = y;
    }

    const cumMeters = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) cumMeters[i] = (cum[i] / total) * trackMeters;
    return { cx, cy, rx, ry, N, theta, cumMeters, totalMeters: trackMeters };
  }

  function angleFromS(sMeters) {
    const pc = SIM.precomputed;
    const s = ((sMeters % pc.totalMeters) + pc.totalMeters) % pc.totalMeters;

    let lo = 0, hi = pc.N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pc.cumMeters[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i = clamp(lo, 1, pc.N);
    const s0 = pc.cumMeters[i - 1];
    const s1 = pc.cumMeters[i];
    const t0 = pc.theta[i - 1];
    const t1 = pc.theta[i];
    const u = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
    return lerp(t0, t1, u);
  }

  function pointOnEllipse(theta) {
    const pc = SIM.precomputed;
    return { x: pc.cx + pc.rx * Math.cos(theta), y: pc.cy + pc.ry * Math.sin(theta) };
  }

  function radialOut(theta) {
    const pc = SIM.precomputed;
    const vx = pc.rx * Math.cos(theta);
    const vy = pc.ry * Math.sin(theta);
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  function buildDefaultHorses() {
    const horses = [];
    let id = 1;
    for (let row = 0; row < 2; row++) {
      for (let laneStart = 1; laneStart <= 8; laneStart++) {
        const baseSpeed = rand(SIM.opts.baseSpeedMin, SIM.opts.baseSpeedMax);
        horses.push({
          id,
          name: `Häst ${id}`,
          startLane: laneStart,
          row,
          s: 0,
          speed: baseSpeed,
          baseSpeed,
          energy: rand(0.86, 1.00),
          lane: (laneStart <= 4 ? 0 : 1),
          lateral: 0,
          lastLaneChangeMs: 0,
          finished: false,
          finishTimeMs: 0
        });
        id++;
      }
    }
    return horses;
  }

  function initStartPositions(horses) {
    const half = (SIM.opts.startGridWidthMeters / 2);
    const step = SIM.opts.startGridWidthMeters / 7;
    for (const h of horses) {
      const idx = h.startLane - 1;
      h.lateral = (-half + idx * step);
      h.s = -h.row * SIM.opts.startRowGapMeters;
      h.finished = false;
      h.finishTimeMs = 0;
      h.energy = clamp(h.energy, 0.70, 1.0);
      h.speed = h.baseSpeed;
      h.lastLaneChangeMs = 0;
    }
  }

  function desiredLateral(h) {
    const mergeS = SIM.opts.mergeAfterMeters;
    const progress = clamp((h.s + 10) / mergeS, 0, 1);
    const targetLaneOffset = (h.lane === 0 ? -SIM.opts.laneWidthMeters * 0.5 : SIM.opts.laneWidthMeters * 0.5);
    return lerp(h.lateral, targetLaneOffset, progress);
  }

  function laneHasGap(h, targetLane, laneArr) {
    let nearestAhead = null;
    let nearestBehind = null;
    for (const o of laneArr) {
      if (o.finished) continue;
      const ds = o.s - h.s;
      if (ds > 0) {
        if (!nearestAhead || ds < (nearestAhead.s - h.s)) nearestAhead = o;
      } else if (ds < 0) {
        if (!nearestBehind || -ds < (h.s - nearestBehind.s)) nearestBehind = o;
      }
    }
    const safe = SIM.opts.safeGap;
    if (nearestAhead && (nearestAhead.s - h.s) < safe) return false;
    if (nearestBehind && (h.s - nearestBehind.s) < safe) return false;
    return true;
  }

  function updateTactics(dt, msNow) {
    const horses = SIM.horses.slice().sort((a, b) => b.s - a.s);
    const byLane = [[], []];
    for (const h of horses) byLane[h.lane].push(h);
    for (const laneArr of byLane) laneArr.sort((a, b) => b.s - a.s);

    for (const h of horses) {
      if (h.finished) continue;

      const laneArr = byLane[h.lane];
      const idx = laneArr.indexOf(h);
      const ahead = idx > 0 ? laneArr[idx - 1] : null;

      let draft = false;
      let gapAhead = 999;
      if (ahead) {
        gapAhead = ahead.s - h.s;
        if (gapAhead > 0 && gapAhead <= SIM.opts.draftRange) draft = true;
      }

      const energyFactor = lerp(0.82, 1.05, h.energy);
      let targetSpeed = h.baseSpeed * energyFactor;

      if (ahead && gapAhead < 2.2) targetSpeed = Math.min(targetSpeed, ahead.speed * 0.99);
      targetSpeed += rand(-0.18, 0.18);

      if (h.s > 30 && msNow - h.lastLaneChangeMs > 900) {
        if (ahead && gapAhead < 4.5) {
          const otherLane = h.lane === 0 ? 1 : 0;
          if (laneHasGap(h, otherLane, byLane[otherLane])) {
            h.lane = otherLane;
            h.lastLaneChangeMs = msNow;
          }
        }
      }

      const isLeader = !ahead;
      const drainBase = 0.00055 * (targetSpeed * targetSpeed);
      const drain = drainBase * (isLeader ? (1 + SIM.opts.leaderPenalty) : 1) * (draft ? (1 - SIM.opts.draftBenefit) : 1);
      h.energy = clamp(h.energy - drain * dt, 0.05, 1.0);

      const accel = 2.2;
      const dv = clamp(targetSpeed - h.speed, -accel * dt, accel * dt);
      h.speed += dv;

      const latTarget = desiredLateral(h);
      h.lateral = lerp(h.lateral, latTarget, clamp(dt * 2.1, 0, 1));

      if (ahead && gapAhead < 1.6) h.s = ahead.s - 1.6;
    }
  }

  function step(dt, msNow) {
    updateTactics(dt, msNow);
    for (const h of SIM.horses) {
      if (h.finished) continue;
      h.s += h.speed * dt;
      if (h.s >= SIM.raceMeters) {
        h.finished = true;
        h.finishTimeMs = msNow - SIM.startTs;
        SIM.finishOrder.push(h);
      }
    }
    if (!SIM.finished && SIM.finishOrder.length > 0) {
      SIM.finished = true;
      SIM.running = false;
      showWinner(SIM.finishOrder[0]);
    }
  }

  function draw(msNow) {
    const ctx = SIM.ctx;
    if (!ctx || !SIM.precomputed) return;

    const rect = SIM.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, w, h);

    const pc = SIM.precomputed;
    ctx.save();
    ctx.translate(0.5, 0.5);

    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.ellipse(pc.cx, pc.cy, pc.rx + 28, pc.ry + 22, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(pc.cx, pc.cy, pc.rx - 28, pc.ry - 22, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.ellipse(pc.cx, pc.cy, pc.rx, pc.ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    const p0 = pointOnEllipse(0);
    const r0 = radialOut(0);
    const lx1 = p0.x + (-r0.y) * 38;
    const ly1 = p0.y + ( r0.x) * 38;
    const lx2 = p0.x + ( r0.y) * 38;
    const ly2 = p0.y + (-r0.x) * 38;

    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(lx1, ly1);
    ctx.lineTo(lx2, ly2);
    ctx.stroke();

    const horses = SIM.horses.slice().sort((a, b) => b.s - a.s);
    for (const horse of horses) {
      const theta = angleFromS(horse.s);
      const base = pointOnEllipse(theta);
      const out = radialOut(theta);

      const pxPerMeter = Math.min(pc.rx, pc.ry) / (SIM.trackMeters * 0.19);
      const ox = out.x * horse.lateral * pxPerMeter;
      const oy = out.y * horse.lateral * pxPerMeter;

      const x = base.x + ox;
      const y = base.y + oy;

      const size = 8;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.font = "bold 10px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(horse.id), x, y + 0.5);
    }

    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const leader = horses[0];
    const tSec = SIM.startTs ? (msNow - SIM.startTs) / 1000 : 0;
    const div = SIM.divisionSelect ? (SIM.divisionSelect.value || "1") : "1";
    ctx.fillText(`Avdelning: ${div}  •  Tid: ${tSec.toFixed(1)}s  •  Distans: ${SIM.raceMeters} m`, 14, 12);
    if (leader) ctx.fillText(`Ledare: ${leader.name} (#${leader.id})`, 14, 30);

    ctx.restore();
  }

  function showWinner(h) {
    const title = document.getElementById("autostart-sim-winner-title");
    const sub = document.getElementById("autostart-sim-winner-sub");
    if (title) title.textContent = `Vinnare: ${h.name} (#${h.id})  ✅ B2`;
    if (sub) sub.textContent = `Måltid: ${(h.finishTimeMs / 1000).toFixed(2)}s`;
    if (SIM.winnerOverlay) SIM.winnerOverlay.setAttribute("data-show", "1");
  }

  function hideWinner() {
    if (SIM.winnerOverlay) SIM.winnerOverlay.setAttribute("data-show", "0");
  }

  function loop(ts) {
    if (!SIM.running && !SIM.finished) return;
    const msNow = ts;
    if (!SIM.lastTs) SIM.lastTs = msNow;
    const dt = clamp((msNow - SIM.lastTs) / 1000, 0, 0.045);
    SIM.lastTs = msNow;

    if (SIM.running) step(dt, msNow);
    draw(msNow);
    SIM.raf = requestAnimationFrame(loop);
  }

  function getDivisionData(division) {
    const d = window.TRAV_SIM_DATA?.divisions?.[String(division)];
    if (d) return d;
    return { raceMeters: 2140, horses: buildDefaultHorses().map(h => ({ id: h.id, name: h.name, startLane: h.startLane, row: h.row })) };
  }

  function buildHorsesFromDivision(division) {
    const data = getDivisionData(division);
    const horsesIn = Array.isArray(data?.horses) ? data.horses : [];
    const fallback = buildDefaultHorses();
    const horses = [];

    for (let i = 0; i < 16; i++) {
      const src = horsesIn[i];
      const fb = fallback[i];
      const baseSpeed = rand(SIM.opts.baseSpeedMin, SIM.opts.baseSpeedMax);
      horses.push({
        id: src?.id ?? fb.id,
        name: src?.name ?? fb.name,
        startLane: clamp(src?.startLane ?? fb.startLane, 1, 8),
        row: clamp(src?.row ?? fb.row, 0, 1),
        s: 0,
        speed: baseSpeed,
        baseSpeed,
        energy: rand(0.86, 1.00),
        lane: ((src?.startLane ?? fb.startLane) <= 4 ? 0 : 1),
        lateral: 0,
        lastLaneChangeMs: 0,
        finished: false,
        finishTimeMs: 0
      });
    }

    SIM.raceMeters = clamp(Number(data?.raceMeters ?? 2140), 500, 10000);
    return horses;
  }

  function startSim({ division = 1 } = {}) {
    openSim();
    hideWinner();

    patchDivisionSelectEl(SIM.divisionSelect, SIM.opts.maxDivisions);
    if (SIM.divisionSelect) SIM.divisionSelect.value = String(division);

    SIM.horses = buildHorsesFromDivision(division);
    initStartPositions(SIM.horses);
    SIM.finishOrder = [];
    SIM.finished = false;

    SIM.running = true;
    SIM.startTs = nowMs();
    SIM.lastTs = 0;

    if (SIM.raf) cancelAnimationFrame(SIM.raf);
    SIM.raf = requestAnimationFrame(loop);
  }

  function looksLikeSimTrigger(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (!["button","a","div","span"].includes(tag)) return false;

    const id = (el.id || "").toLowerCase();
    const cls = (el.className || "").toString().toLowerCase();
    const txt = (el.textContent || "").toLowerCase();
    const dataAction = (el.getAttribute && (el.getAttribute("data-action") || "")).toLowerCase();

    if (id.includes("simul") || id.includes("simulate") || id === "btn-simulate") return true;
    if (dataAction === "simulate") return true;
    if (cls.includes("simul") || cls.includes("simulate")) return true;
    if (txt.includes("simul")) return true;
    return false;
  }

  function captureClickHijack() {
    document.addEventListener("click", (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      const candidates = (path.length ? path : [e.target]).slice(0, 6);
      const hit = candidates.find(looksLikeSimTrigger) || null;
      if (!hit) return;

      let currentDiv =
        Number(window.TRAV_CURRENT_DIVISION) ||
        Number(document.querySelector("[data-current-division]")?.getAttribute("data-current-division")) ||
        Number(document.querySelector("#division")?.value) ||
        Number(document.querySelector("#avdelning")?.value) ||
        1;

      currentDiv = clamp(currentDiv, 1, SIM.opts.maxDivisions);

      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      startSim({ division: currentDiv });
    }, true);
  }

  function bindDivisionChangeInsideModal() {
    const sel = document.getElementById("autostart-sim-division");
    if (!sel || sel.__autostartBound) return;
    sel.__autostartBound = true;
    sel.addEventListener("change", () => {
      const div = parseInt(sel.value || "1", 10);
      startSim({ division: div });
    });
  }

  function init() {
    ensureModalUI();
    patchAllDivisionSelects();
    captureClickHijack();
    bindDivisionChangeInsideModal();

    let tries = 0;
    const t = setInterval(() => {
      patchAllDivisionSelects();
      bindDivisionChangeInsideModal();
      tries++;
      if (tries > 25) clearInterval(t);
    }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.startAutostartSim = (division = 1) => startSim({ division });
  window.closeAutostartSim = closeSim;
})();
