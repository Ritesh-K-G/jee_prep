const DB_BASE = "https://jee-prep-464d2-default-rtdb.firebaseio.com";

async function loadDashboard() {
  const res = await fetch(`${DB_BASE}/days.json`);
  const days = await res.json();

  if (!days) return;

  // also fetch chapters mapping to show nicer labels where available
  let chaptersMap = {};
  try {
    const cRes = await fetch(`${DB_BASE}/chapters.json`);
    chaptersMap = await cRes.json();
  } catch (e) {
    console.warn('Could not fetch chapters mapping', e);
  }

  buildScoreChart(days);
  buildSubjectStats(days, chaptersMap);
  buildWeakChapters(days, chaptersMap);

  // New visualizations
  buildSubjectChapterCharts(days, chaptersMap);
  buildChapterTrendUI(days, chaptersMap);
  buildLast7VsOverall(days, chaptersMap);
}

/* ---------------- Modal helper for large charts ---------------- */
function _ensureModal() {
  const modal = document.getElementById('chartModal');
  if (!modal) return null;
  const canvas = modal.querySelector('#modalChartCanvas');
  const titleEl = modal.querySelector('#modalTitle');
  const closeBtn = modal.querySelector('.modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');

  function close() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (modal._chart) { try { modal._chart.destroy(); } catch (e) {} modal._chart = null; }
  }

  // Wire up events once
  if (!modal._inited) {
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    modal._inited = true;
  }

  return { modal, canvas, titleEl, close };
}

/* ---------------- CHAPTER-WISE PER-SUBJECT ---------------- */
function buildSubjectChapterCharts(days, chaptersMap) {
  // Build cleaner per-subject chapter list with inline bars and on-demand trend charts
  // Aggregate accuracies per chapter
  const chapterAgg = {}; // id -> {correct, total}
  Object.values(days).forEach(day => {
    Object.entries(day.chapters || {}).forEach(([id, v]) => {
      if (!chapterAgg[id]) chapterAgg[id] = { correct: 0, total: 0 };
      chapterAgg[id].correct += v.correct;
      chapterAgg[id].total += v.total;
    });
  });

  const bySubject = {};
  Object.entries(chapterAgg).forEach(([id, v]) => {
    const subject = resolveSubjectForId(chaptersMap, id);
    if (!bySubject[subject]) bySubject[subject] = [];
    const name = findChapterName(chaptersMap, id);
    const pct = v.total ? (v.correct / v.total) * 100 : 0;
    bySubject[subject].push({ id, name, pct: Math.round(pct) });
  });

  const container = document.getElementById('chapterCharts');
  container.innerHTML = '';

  Object.entries(bySubject).forEach(([subject, list]) => {
    // subject card
    const card = document.createElement('div');
    card.className = 'card chapter-card';
    const header = document.createElement('h3');
    header.textContent = capitalize(subject);
    card.appendChild(header);

  // dedicated chart area at top of card (hidden until a chapter is selected)
  const chartArea = document.createElement('div');
  chartArea.className = 'chapter-chart-area';
  chartArea.innerHTML = `<div style="height:200px;"><canvas></canvas></div>`;
    card.appendChild(chartArea);

    // list of chapters
    const ul = document.createElement('ul');
    ul.className = 'chapter-list';
    list.sort((a,b)=> a.name.localeCompare(b.name));

    list.forEach(ch => {
      const li = document.createElement('li');
      li.className = 'chapter-row';
      li.innerHTML = `
        <div class="row-left">
          <div class="chapter-name">${ch.name}</div>
        </div>
        <div class="row-right">
          <div class="inline-bar" style="--pct:${ch.pct}"></div>
          <div class="chapter-pct">${ch.pct}%</div>
        </div>
      `;

      // clicking a chapter opens a large modal chart (better visibility)
      li.addEventListener('click', () => {
        const modalCtx = _ensureModal();
        if (!modalCtx) {
          // fallback: if modal isn't available, open inline chart area
          if (chartArea._chart) { try { chartArea._chart.destroy(); } catch (e) {} chartArea._chart = null; }
          // close others
          document.querySelectorAll('.chapter-chart-area.open').forEach(a => { if (a._chart) { try { a._chart.destroy(); } catch(e){} a._chart = null; } a.classList.remove('open'); });
          chartArea.classList.add('open');
          const c = chartArea.querySelector('canvas');
          const chart = drawChapterTrendOnCanvas(c, ch.id, days, chaptersMap);
          chartArea._chart = chart;
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        // Open modal and render large chart
        modalCtx.titleEl.textContent = ch.name;
        modalCtx.modal.classList.add('open');
        modalCtx.modal.setAttribute('aria-hidden', 'false');
        // destroy any previous modal chart
        if (modalCtx.modal._chart) { try { modalCtx.modal._chart.destroy(); } catch (e) {} modalCtx.modal._chart = null; }
        const chart = drawChapterTrendOnCanvas(modalCtx.canvas, ch.id, days, chaptersMap);
        modalCtx.modal._chart = chart;
      });

      ul.appendChild(li);
    });

    card.appendChild(ul);
    container.appendChild(card);
  });
}

function drawChapterTrendOnCanvas(canvas, id, days, chaptersMap) {
  const ctx = canvas.getContext('2d');
  const dates = Object.keys(days).sort();
  const data = dates.map(d => {
    const v = (days[d].chapters || {})[id];
    if (!v) return null;
    return v.total ? Math.round((v.correct / v.total) * 100) : 0;
  });

  // destroy previous chart on same canvas if present
  if (canvas._chart) { try { canvas._chart.destroy(); } catch (e) {} }

  const newChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets: [{ data, borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,0.12)', fill:'origin', tension:0.3, spanGaps:true }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{backgroundColor:'#0b1220'}}, scales:{ x:{ ticks:{ color:'#94a3b8' } }, y:{ ticks:{ color:'#94a3b8' }, beginAtZero:true, max:100 } } }
  });

  canvas._chart = newChart;
  return newChart;
}

function findChapterName(chaptersMap, id) {
  // Try direct matches first
  for (const [subject, units] of Object.entries(chaptersMap || {})) {
    for (const [k, name] of Object.entries(units || {})) {
      if (k === id || `${subject}_${k}` === id || id.endsWith(`_${k}`) || k === id.split('_').pop()) return name;
    }
  }
  // fallback: if id contains underscores, return the last segment or replace underscores
  const parts = id.split('_');
  if (parts.length > 1) return parts.slice(1).join(' ').replace(/\b\w/g, c => c.toUpperCase());
  return id.replace(/_/g, ' ');
}

function resolveSubjectForId(chaptersMap, id) {
  // If chaptersMap is present, try to find which subject owns this chapter id
  for (const [subject, units] of Object.entries(chaptersMap || {})) {
    for (const [k] of Object.entries(units || {})) {
      if (k === id || `${subject}_${k}` === id || id.endsWith(`_${k}`) || k === id.split('_').pop()) return subject;
    }
  }
  // fallback to prefix before underscore
  return id.includes('_') ? id.split('_')[0] : id;
}

/* ---------------- CHAPTER TREND (select + chart) ---------------- */
function buildChapterTrendUI(days, chaptersMap) {
  const select = document.getElementById('chapterSelect');
  select.innerHTML = '';

  // build a unique list of chapters from chaptersMap if present, otherwise from days
  const chapterIds = new Set();
  if (chaptersMap && Object.keys(chaptersMap).length) {
    Object.values(chaptersMap).forEach(units => Object.keys(units || {}).forEach(id => chapterIds.add(id)));
  } else {
    Object.values(days).forEach(day => Object.keys(day.chapters || {}).forEach(id => chapterIds.add(id)));
  }

  const ids = Array.from(chapterIds).sort();
  ids.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = findChapterName(chaptersMap, id);
    select.appendChild(opt);
  });

  const ctx = document.getElementById('chapterTrendChart').getContext('2d');
  let chart = null;

  function drawFor(id) {
    // collect dates and accuracy for this chapter
    const dates = Object.keys(days).sort();
    const series = dates.map(d => {
      const v = (days[d].chapters || {})[id];
      if (!v) return null;
      return v.total ? (v.correct / v.total) * 100 : 0;
    });

    const labels = dates;
    const data = series.map(s => s === null ? null : Math.round(s * 10) / 10);

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: findChapterName(chaptersMap, id), data, borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,0.12)', tension:0.32, fill:'origin', spanGaps:true }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{backgroundColor:'#0b1220'}}, scales:{ x:{ ticks:{ color:'#94a3b8' } }, y:{ ticks:{ color:'#94a3b8' }, beginAtZero:true, max:100 } } }
    });
  }

  if (ids.length) {
    select.value = ids[0];
    drawFor(ids[0]);
  }

  select.addEventListener('change', (e) => drawFor(e.target.value));
}

/* ---------------- LAST 7 DAYS vs OVERALL (by subject) ---------------- */
function buildLast7VsOverall(days, chaptersMap) {
  // compute per-subject totals overall and for last 7 days
  const dateKeys = Object.keys(days).sort();
  const last7 = dateKeys.slice(-7);

  const subjectTotals = {}; // subject -> {correct,total}
  const subjectLast7 = {};

  dateKeys.forEach(d => {
    Object.entries(days[d].chapters || {}).forEach(([id, v]) => {
      const subject = resolveSubjectForId(chaptersMap, id);
      if (!subjectTotals[subject]) subjectTotals[subject] = { correct:0, total:0 };
      subjectTotals[subject].correct += v.correct; subjectTotals[subject].total += v.total;
    });
  });

  last7.forEach(d => {
    Object.entries(days[d].chapters || {}).forEach(([id, v]) => {
      const subject = resolveSubjectForId(chaptersMap, id);
      if (!subjectLast7[subject]) subjectLast7[subject] = { correct:0, total:0 };
      subjectLast7[subject].correct += v.correct; subjectLast7[subject].total += v.total;
    });
  });

  const subjects = Array.from(new Set(Object.keys(subjectTotals).concat(Object.keys(subjectLast7)))).sort();
  const overallPct = subjects.map(s => {
    const t = subjectTotals[s] || {correct:0,total:0};
    return t.total ? Math.round((t.correct / t.total) * 100) : 0;
  });
  const last7Pct = subjects.map(s => {
    const t = subjectLast7[s] || {correct:0,total:0};
    return t.total ? Math.round((t.correct / t.total) * 100) : 0;
  });

  const ctx = document.getElementById('compareChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: subjects.map(capitalize),
      datasets: [
        { label: 'Last 7 days', data: last7Pct, backgroundColor: '#06b6d4' },
        { label: 'Overall', data: overallPct, backgroundColor: '#6366f1' }
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{tooltip:{backgroundColor:'#0b1220'}}, scales:{ y:{ beginAtZero:true, max:100, ticks:{ color:'#94a3b8'} }, x:{ ticks:{ color:'#94a3b8'} } } }
  });
}

/* ---------------- SCORE TREND ---------------- */

function buildScoreChart(days) {
  const labels = Object.keys(days).sort();
  const scores = labels.map(d => days[d].score);

  const canvas = document.getElementById("scoreChart");
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // create a soft vertical gradient for the filled area
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
  grad.addColorStop(0, 'rgba(96,165,250,0.22)');
  grad.addColorStop(1, 'rgba(96,165,250,0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Score',
        data: scores,
        borderColor: '#60a5fa',
        backgroundColor: grad,
        pointBackgroundColor: '#0b1220',
        pointBorderColor: '#60a5fa',
        pointHoverBackgroundColor: '#60a5fa',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 3,
        tension: 0.36,
        fill: 'origin'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b1220',
          titleColor: '#e6eef8',
          bodyColor: '#cbd5e1',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.02)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.02)' },
          ticks: { color: '#94a3b8' }
        }
      },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, bottom: 6, left: 6, right: 6 } }
    }
  });
}

/* ---------------- SUBJECT ACCURACY ---------------- */

function buildSubjectStats(days, chaptersMap) {
  const subjectMap = {};

  Object.values(days).forEach(day => {
    Object.entries(day.chapters || {}).forEach(([id, val]) => {
      const subject = resolveSubjectForId(chaptersMap, id);
      if (!subjectMap[subject]) {
        subjectMap[subject] = { correct: 0, total: 0 };
      }
      subjectMap[subject].correct += val.correct;
      subjectMap[subject].total += val.total;
    });
  });

  const container = document.getElementById("subjectStats");
  container.innerHTML = "";
  // use a grid of small stat cards
  const grid = document.createElement('div');
  grid.className = 'subject-grid';

  Object.entries(subjectMap).forEach(([subject, v]) => {
    const pct = Math.round((v.correct / v.total) * 100) || 0;
    const card = document.createElement('div');
    card.className = 'subject-stat card small';
    const label = (chaptersMap && chaptersMap[subject]) ? capitalize(subject) : capitalize(subject);
    card.innerHTML = `
      <div class="stat-head"><strong>${label}</strong><span class="stat-pct">${pct}%</span></div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
    `;
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

/* ---------------- WEAK CHAPTERS ---------------- */

function buildWeakChapters(days, chaptersMap) {
  const chapterMap = {};

  Object.values(days).forEach(day => {
    Object.entries(day.chapters || {}).forEach(([id, v]) => {
      if (!chapterMap[id]) {
        chapterMap[id] = { correct: 0, total: 0 };
      }
      chapterMap[id].correct += v.correct;
      chapterMap[id].total += v.total;
    });
  });

  const weakest = Object.entries(chapterMap)
    .map(([id, v]) => ({
      id,
      acc: v.correct / v.total
    }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 5);

  const ul = document.getElementById("weakChapters");
  ul.innerHTML = "";
  weakest.forEach(w => {
    const li = document.createElement('li');
    li.className = 'weak-item';
    const pct = (w.acc * 100).toFixed(1);
    li.innerHTML = `
      <span class="weak-name">${findChapterName(chaptersMap, w.id)}</span>
      <span class="badge weak-badge">${pct}%</span>
    `;
    ul.appendChild(li);
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

loadDashboard();
