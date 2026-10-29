/* ═══════════════════════════════════════════════
   PAPER TRACK  —  app.js
   ═══════════════════════════════════════════════ */

const SUBJECTS = ['Science', 'Math', 'SST', 'English', 'Hindi'];
const TOTAL_MARKS = 80;

const SUBJECT_COLORS = {
  Science: '#6c63ff',
  Math: '#48cfad',
  SST: '#f7b731',
  English: '#fd9644',
  Hindi: '#fc5c65',
};

// Chart.js instances
let trendChart = null;
let radarChart = null;
let barChart = null;
let doughnutChart = null;

// All trend data cached for filter
let allTrendData = [];

// Pending delete ID
let pendingDeleteId = null;

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initForm();
  initFilters();
  initDeleteModal();
  loadDashboard();
});

// ══════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════
function initTheme() {
  const toggle = document.getElementById('themeToggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.add('theme-light');
    toggle.checked = true;
  } else if (saved === 'dark') {
    document.body.classList.add('theme-dark');
    toggle.checked = false;
  } else {
    // Auto — follow system
    toggle.checked = !prefersDark;
  }

  toggle.addEventListener('change', () => {
    document.body.classList.remove('theme-light', 'theme-dark');
    if (toggle.checked) {
      document.body.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.add('theme-dark');
      localStorage.setItem('theme', 'dark');
    }
    // Redraw charts so they pick up new CSS vars
    setTimeout(loadDashboard, 50);
  });
}

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════
function initNav() {
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));

  document.getElementById(`nav-${tab}`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'records') loadRecords();
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'ai') loadAllAiModules(false);
}

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════
async function loadDashboard() {
  try {
    const res = await fetch('/api/metrics');
    const data = await res.json();
    allTrendData = data.trend || [];

    populateStats(data);
    renderTrendChart(allTrendData, 'all');
    renderRadarChart(data.subjectAvg);
    renderBarChart(data.subjectAvg);
    renderDoughnutChart(data.byPaperType);
    renderProgressBars(data.subjectAvg);
    renderRecentTable(data.recent);
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function populateStats(data) {
  document.getElementById('statTotalVal').textContent = data.totalAttempts ?? '0';

  const avgMarks = data.subjectAvg.length
    ? (data.subjectAvg.reduce((s, r) => s + parseFloat(r.avg_marks), 0) / data.subjectAvg.length).toFixed(1)
    : '—';
  document.getElementById('statAvgVal').textContent = avgMarks === '—' ? '—' : `${avgMarks}`;

  if (data.best) {
    document.getElementById('statBestVal').textContent = `${data.best.marks_obtained}`;
    document.getElementById('statBestDetail').textContent =
      `${data.best.subject} · ${data.best.paper_type} · ${fmtDate(data.best.date_attempted)}`;
  }
  if (data.worst) {
    document.getElementById('statWorstVal').textContent = `${data.worst.marks_obtained}`;
    document.getElementById('statWorstDetail').textContent =
      `${data.worst.subject} · ${data.worst.paper_type} · ${fmtDate(data.worst.date_attempted)}`;
  }
}

// ── Trend Chart ──
function renderTrendChart(trendData, subjectFilter) {
  const filtered = subjectFilter === 'all'
    ? trendData
    : trendData.filter(r => r.subject === subjectFilter);

  const ctx = document.getElementById('trendChart').getContext('2d');

  // Convert date string to Date object for proper time axis sorting
  function toDate(d) {
    if (!d) return new Date();
    return new Date(d);
  }

  if (subjectFilter === 'all') {
    // One dataset per subject
    const datasets = SUBJECTS.map(subj => {
      const subjData = filtered.filter(r => r.subject === subj);
      // Sort by date within each subject
      subjData.sort((a, b) => toDate(a.date_attempted) - toDate(b.date_attempted));
      return {
        label: subj,
        data: subjData.map(r => ({ x: toDate(r.date_attempted), y: parseFloat(r.marks_obtained) })),
        borderColor: SUBJECT_COLORS[subj],
        backgroundColor: SUBJECT_COLORS[subj] + '33',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: false,
      };
    }).filter(d => d.data.length > 0);

    renderChart(trendChart, 'trendChart', {
      type: 'line',
      data: { datasets },
      options: trendOptions(),
    });
  } else {
    // Sort by date
    filtered.sort((a, b) => toDate(a.date_attempted) - toDate(b.date_attempted));
    const datasets = [{
      label: subjectFilter,
      data: filtered.map(r => ({ x: toDate(r.date_attempted), y: parseFloat(r.marks_obtained) })),
      borderColor: SUBJECT_COLORS[subjectFilter],
      backgroundColor: SUBJECT_COLORS[subjectFilter] + '33',
      borderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.4,
      fill: true,
    }];

    renderChart(trendChart, 'trendChart', {
      type: 'line',
      data: { datasets },
      options: trendOptions(),
    });
  }
}

function trendOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: getCssVar('--text'), font: { family: 'Inter' } } },
      tooltip: {
        backgroundColor: getCssVar('--surface'),
        titleColor: getCssVar('--text'),
        bodyColor: getCssVar('--text-muted'),
        borderColor: getCssVar('--border'),
        borderWidth: 1,
        callbacks: {
          title: function (items) {
            if (items.length && items[0].raw && items[0].raw.x) {
              return fmtDate(items[0].raw.x);
            }
            return '';
          }
        }
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'day',
          displayFormats: { day: 'd MMM yyyy' },
          tooltipFormat: 'd MMM yyyy',
        },
        ticks: { color: getCssVar('--text-muted'), maxTicksLimit: 8, font: { size: 11 } },
        grid: { color: getCssVar('--chart-grid') },
      },
      y: {
        min: 0,
        max: TOTAL_MARKS,
        ticks: { color: getCssVar('--text-muted'), font: { size: 11 } },
        grid: { color: getCssVar('--chart-grid') },
      },
    },
  };
}

// ── Radar Chart ──
function renderRadarChart(subjectAvg) {
  const labels = subjectAvg.map(r => r.subject);
  const data = subjectAvg.map(r => parseFloat(r.avg_marks));

  renderChart(radarChart, 'radarChart', {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Marks',
        data,
        backgroundColor: 'rgba(108,99,255,0.18)',
        borderColor: '#6c63ff',
        pointBackgroundColor: labels.map(l => SUBJECT_COLORS[l]),
        borderWidth: 2,
        pointRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: TOTAL_MARKS,
          ticks: { stepSize: 20, color: getCssVar('--text-muted'), backdropColor: 'transparent', font: { size: 10 } },
          grid: { color: getCssVar('--chart-grid') },
          pointLabels: { color: getCssVar('--text'), font: { family: 'Inter', size: 12, weight: '600' } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: getCssVar('--surface'), titleColor: getCssVar('--text'), bodyColor: getCssVar('--text-muted'), borderColor: getCssVar('--border'), borderWidth: 1 },
      },
    },
  });
}

// ── Bar Chart ──
function renderBarChart(subjectAvg) {
  const labels = subjectAvg.map(r => r.subject);
  const data = subjectAvg.map(r => parseFloat(r.avg_marks));
  const colors = labels.map(l => SUBJECT_COLORS[l]);

  renderChart(barChart, 'barChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Marks',
        data,
        backgroundColor: colors.map(c => c + 'bb'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: getCssVar('--surface'), titleColor: getCssVar('--text'), bodyColor: getCssVar('--text-muted'), borderColor: getCssVar('--border'), borderWidth: 1 },
      },
      scales: {
        x: { ticks: { color: getCssVar('--text-muted'), font: { family: 'Inter', weight: '600' } }, grid: { display: false } },
        y: { min: 0, max: TOTAL_MARKS, ticks: { color: getCssVar('--text-muted') }, grid: { color: getCssVar('--chart-grid') } },
      },
    },
  });
}

// ── Doughnut Chart ──
function renderDoughnutChart(byPaperType) {
  const labels = byPaperType.map(r => r.paper_type);
  const data = byPaperType.map(r => parseInt(r.attempts));
  const colors = ['#6c63ff', '#48cfad', '#f7b731', '#fd9644'];

  renderChart(doughnutChart, 'doughnutChart', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length).map(c => c + 'cc'),
        borderColor: colors.slice(0, labels.length),
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: getCssVar('--text'), font: { family: 'Inter', size: 12 }, padding: 14 } },
        tooltip: { backgroundColor: getCssVar('--surface'), titleColor: getCssVar('--text'), bodyColor: getCssVar('--text-muted'), borderColor: getCssVar('--border'), borderWidth: 1 },
      },
      cutout: '65%',
    },
  });
}

// ── Progress Bars ──
function renderProgressBars(subjectAvg) {
  const container = document.getElementById('progressBars');
  if (!subjectAvg.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No data yet.</p>';
    return;
  }

  container.innerHTML = subjectAvg.map(r => {
    const pct = Math.min(100, (parseFloat(r.avg_marks) / TOTAL_MARKS) * 100);
    const color = SUBJECT_COLORS[r.subject] || '#6c63ff';
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span class="progress-subject">${r.subject}</span>
          <span class="progress-value">${r.avg_marks} / ${TOTAL_MARKS} avg (${r.attempts} attempt${r.attempts > 1 ? 's' : ''})</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:0%;background:${color}" data-target="${pct.toFixed(1)}"></div>
        </div>
      </div>`;
  }).join('');

  // Animate after render
  requestAnimationFrame(() => {
    document.querySelectorAll('.progress-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  });
}

// ── Recent Table ──
function renderRecentTable(recent) {
  const tbody = document.getElementById('recentTableBody');
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No attempts yet.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(r => `
    <tr>
      <td>${fmtDate(r.date_attempted)}</td>
      <td><span class="subject-dot"><span class="dot" style="background:${SUBJECT_COLORS[r.subject]}"></span>${r.subject}</span></td>
      <td><span class="badge ${r.paper_type.toLowerCase().startsWith('educart') ? 'badge-educart' : 'badge-pyq'}">${r.paper_type}</span></td>
      <td>${r.paper_number}</td>
      <td class="${marksClass(r.marks_obtained)}">${r.marks_obtained}</td>
      <td class="${marksClass(r.marks_obtained)}">${r.percentage != null ? r.percentage + '%' : '—'}</td>
    </tr>`).join('');
}

// Helper to create/replace chart
function renderChart(instanceRef, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  return new Chart(canvas, config);
}

// ══════════════════════════════════════════════
// RECORDS
// ══════════════════════════════════════════════
async function loadRecords(filters = {}) {
  const params = new URLSearchParams();
  if (filters.subject) params.set('subject', filters.subject);
  if (filters.paperType) params.set('paper_type', filters.paperType);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);

  try {
    const res = await fetch(`/api/attempts?${params}`);
    const rows = await res.json();
    renderRecordsTable(rows);
  } catch (err) {
    console.error('Records load error:', err);
  }
}

function renderRecordsTable(rows) {
  const tbody = document.getElementById('recordsTableBody');
  const noRecords = document.getElementById('noRecords');

  if (!rows.length) {
    tbody.innerHTML = '';
    noRecords.classList.remove('hidden');
    return;
  }
  noRecords.classList.add('hidden');

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="color:var(--text-muted)">${r.id}</td>
      <td>${fmtDate(r.date_attempted)}</td>
      <td><span class="subject-dot"><span class="dot" style="background:${SUBJECT_COLORS[r.subject]}"></span>${r.subject}</span></td>
      <td><span class="badge ${r.paper_type.toLowerCase().startsWith('educart') ? 'badge-educart' : 'badge-pyq'}">${r.paper_type}</span></td>
      <td>${r.paper_number}</td>
      <td class="${marksClass(r.marks_obtained)}">${r.marks_obtained}</td>
      <td class="${marksClass(r.marks_obtained)}">${r.percentage != null ? r.percentage + '%' : '—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">${r.comments || '—'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon edit" title="Edit" onclick="startEdit(${r.id})">✏️</button>
          <button class="btn-icon delete" title="Delete" onclick="startDelete(${r.id}, '${r.subject} — ${r.paper_type} #${r.paper_number}')">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function initFilters() {
  document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    loadRecords({
      subject: document.getElementById('filterSubject').value,
      paperType: document.getElementById('filterType').value,
      dateFrom: document.getElementById('filterFrom').value,
      dateTo: document.getElementById('filterTo').value,
    });
  });

  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterSubject').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    loadRecords();
  });
}

// ══════════════════════════════════════════════
// FORM — ADD / EDIT
// ══════════════════════════════════════════════
function initForm() {
  const form = document.getElementById('attemptForm');
  const marksInput = document.getElementById('formMarks');
  const typeSelect = document.getElementById('formPaperType');
  const hintEl = document.getElementById('paperNumberHint');
  const preview = document.getElementById('marksPreview');

  // Update paper number hint based on type
  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'Educart Sample Paper') {
      hintEl.textContent = 'Enter a number (e.g. 1, 2, 3…)';
    } else if (typeSelect.value === 'PYQ') {
      hintEl.textContent = 'Enter the paper code (e.g. 30/2/1, 42/4/1)';
    } else {
      hintEl.textContent = '';
    }
  });

  // Live marks preview
  marksInput.addEventListener('input', () => {
    const val = parseFloat(marksInput.value);
    if (!isNaN(val) && val >= 0 && val <= TOTAL_MARKS) {
      const pct = ((val / TOTAL_MARKS) * 100).toFixed(1);
      preview.textContent = `→ ${pct}%`;
      preview.style.color = val >= 60 ? '#26de81' : val >= 40 ? '#f7b731' : '#fc5c65';
    } else {
      preview.textContent = '';
    }
  });

  // Set today's date as default
  document.getElementById('formDate').value = todayISO();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const editId = document.getElementById('editId').value;
    const payload = {
      subject: document.getElementById('formSubject').value,
      paper_type: document.getElementById('formPaperType').value,
      paper_number: document.getElementById('formPaperNumber').value.trim(),
      date_attempted: document.getElementById('formDate').value,
      marks_obtained: parseFloat(document.getElementById('formMarks').value),
      comments: document.getElementById('formComments').value.trim(),
    };

    if (!payload.subject || !payload.paper_type || !payload.paper_number || !payload.date_attempted || isNaN(payload.marks_obtained)) {
      showFormMessage('Please fill in all required fields.', 'error');
      return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.querySelector('#submitBtnText').textContent = 'Saving…';

    try {
      const url = editId ? `/api/attempts/${editId}` : '/api/attempts';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server error');
      }

      showFormMessage(editId ? '✅ Attempt updated successfully!' : '✅ Attempt added successfully!', 'success');
      resetForm();
      // Reload dashboard metrics in background
      loadDashboard();
    } catch (err) {
      showFormMessage(`❌ Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      document.getElementById('submitBtnText').textContent = document.getElementById('editId').value ? 'Update Attempt' : '➕ Add Attempt';
    }
  });

  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
}

function resetForm() {
  document.getElementById('editId').value = '';
  document.getElementById('attemptForm').reset();
  document.getElementById('formDate').value = todayISO();
  document.getElementById('formTitle').textContent = 'Add New Attempt';
  document.getElementById('formSubtitle').textContent = 'Fill in the details below to log a paper attempt';
  document.getElementById('submitBtnText').textContent = '➕ Add Attempt';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('marksPreview').textContent = '';
  hideFormMessage();
}

async function startEdit(id) {
  try {
    const res = await fetch(`/api/attempts/${id}`);
    const r = await res.json();

    document.getElementById('editId').value = r.id;
    document.getElementById('formSubject').value = r.subject;
    document.getElementById('formPaperType').value = r.paper_type;
    document.getElementById('formPaperNumber').value = r.paper_number;
    document.getElementById('formDate').value = r.date_attempted ? r.date_attempted.substring(0, 10) : '';
    document.getElementById('formMarks').value = r.marks_obtained;
    document.getElementById('formComments').value = r.comments || '';

    document.getElementById('formTitle').textContent = 'Edit Attempt';
    document.getElementById('formSubtitle').textContent = `Editing record #${id}`;
    document.getElementById('submitBtnText').textContent = 'Update Attempt';
    document.getElementById('cancelEditBtn').style.display = 'inline-flex';

    switchTab('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Trigger marks preview
    document.getElementById('formMarks').dispatchEvent(new Event('input'));
  } catch (err) {
    console.error('Edit load error:', err);
  }
}

function showFormMessage(msg, type) {
  const el = document.getElementById('formMessage');
  el.textContent = msg;
  el.className = `form-message ${type}`;
  el.classList.remove('hidden');
  setTimeout(hideFormMessage, 4000);
}

function hideFormMessage() {
  document.getElementById('formMessage').classList.add('hidden');
}

// ══════════════════════════════════════════════
// DELETE MODAL
// ══════════════════════════════════════════════
function initDeleteModal() {
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await fetch(`/api/attempts/${pendingDeleteId}`, { method: 'DELETE' });
      document.getElementById('deleteModal').classList.add('hidden');
      pendingDeleteId = null;
      loadRecords();
      loadDashboard();
    } catch (err) {
      console.error('Delete error:', err);
    }
  });

  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    document.getElementById('deleteModal').classList.add('hidden');
    pendingDeleteId = null;
  });

  document.getElementById('deleteModal').addEventListener('click', e => {
    if (e.target === document.getElementById('deleteModal')) {
      document.getElementById('deleteModal').classList.add('hidden');
      pendingDeleteId = null;
    }
  });
}

function startDelete(id, label) {
  pendingDeleteId = id;
  document.getElementById('deleteModalDesc').textContent = `Delete "${label}"? This cannot be undone.`;
  document.getElementById('deleteModal').classList.remove('hidden');
}

// ══════════════════════════════════════════════
// TREND FILTER
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('trendSubjectFilter').addEventListener('change', e => {
    renderTrendChart(allTrendData, e.target.value);
  });
});

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().substring(0, 10);
}

function marksClass(marks) {
  const m = parseFloat(marks);
  if (m >= 64) return 'marks-high';   // ≥80%
  if (m >= 48) return 'marks-mid';    // ≥60%
  return 'marks-low';
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ══════════════════════════════════════════════
// AI INSIGHTS
// ══════════════════════════════════════════════

const GRADE_CLASS = { A1: 'grade-A1', A2: 'grade-A2', B1: 'grade-B1', B2: 'grade-B2', 'Needs Work': 'grade-NW' };

// ══════════════════════════════════════════════
// SEPARATED AI MODULES (SEPARATE PROMPTS & CARDS)
// ══════════════════════════════════════════════

// ── 1. AI PERFORMANCE COACH ──────────────────
async function loadAiCoach(force = false) {
  const loading = document.getElementById('coachLoading');
  const errorEl = document.getElementById('coachError');
  const noDataEl = document.getElementById('coachNoData');
  const results = document.getElementById('coachResults');
  const btn = document.getElementById('refreshCoachBtn');
  const icon = document.getElementById('refreshCoachIcon');

  loading.classList.remove('hidden');
  errorEl.classList.add('hidden');
  noDataEl.classList.add('hidden');
  results.classList.add('hidden');
  btn.disabled = true;
  icon.textContent = '⏳';

  try {
    const res = await fetch(`/api/ai/coach${force ? '?force=1' : ''}`);
    const data = await res.json();
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';

    if (!res.ok) {
      document.getElementById('coachErrorMsg').textContent = data.message || 'AI coach error.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (data.status === 'no_data') {
      noDataEl.classList.remove('hidden');
      return;
    }

    renderAiCoach(data);
    results.classList.remove('hidden');
    document.getElementById('coachModelBadge').textContent = `${data.model || 'AI'}${data.cached ? ' · cached' : ''}`;
  } catch (err) {
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';
    document.getElementById('coachErrorMsg').textContent = 'Could not connect to the AI server.';
    errorEl.classList.remove('hidden');
  }
}

function renderAiCoach(data) {
  const overall = data.overall || {};
  document.getElementById('aiOverall').innerHTML = `
    <div class="ai-overall-headline">✨ ${overall.headline || ''}</div>
    <div class="ai-overall-grid">
      <div class="ai-overall-item">
        <div class="ai-overall-item-label">🎉 What you're doing well</div>
        <div class="ai-overall-item-value">${overall.praise || '—'}</div>
      </div>
      <div class="ai-overall-item">
        <div class="ai-overall-item-label">📈 Improvement trend</div>
        <div class="ai-overall-item-value">${overall.improvement_trend || '—'}</div>
      </div>
      <div class="ai-overall-item">
        <div class="ai-overall-item-label">🎯 Top priority right now</div>
        <div class="ai-overall-item-value" style="font-weight:600;color:var(--brand-1)">${overall.top_priority || '—'}</div>
      </div>
    </div>`;

  const subjects = data.subjects || {};
  const cards = Object.entries(subjects).map(([subj, s]) => {
    const dotColor = SUBJECT_COLORS[subj] || '#6c63ff';
    const gradeClass = GRADE_CLASS[s.grade] || 'grade-NW';
    const weakChips = (s.weak_spots || []).filter(Boolean).map(w => `<span class="ai-chip chip-weak">⚡ ${w}</span>`).join('');
    const strengthChips = (s.strengths || []).filter(Boolean).map(w => `<span class="ai-chip chip-strength">✓ ${w}</span>`).join('');

    return `
      <div class="ai-subject-card">
        <div class="ai-subject-header">
          <div class="ai-subject-name">
            <span class="dot" style="background:${dotColor};width:10px;height:10px"></span>
            ${subj}
          </div>
          <div class="ai-subject-right">
            <span class="ai-grade-badge ${gradeClass}">${s.grade}</span>
            <span class="ai-trend-emoji">${s.trend_emoji || ''}</span>
          </div>
        </div>
        <p class="ai-subject-summary">${s.summary || ''}</p>
        ${weakChips ? `<div class="ai-chips-label">Weak spots</div><div class="ai-chips">${weakChips}</div>` : ''}
        ${strengthChips ? `<div class="ai-chips-label">Strengths</div><div class="ai-chips">${strengthChips}</div>` : ''}
        ${s.advice ? `<div class="ai-advice">💡 ${s.advice}</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('aiSubjectsGrid').innerHTML = cards || '<p style="color:var(--text-muted)">No subject diagnostics yet.</p>';
  document.getElementById('coachFooter').textContent =
    `Evaluated by ${data.model || 'AI'} · ${data.cached ? 'Cached' : 'Fresh'} · ${new Date().toLocaleTimeString('en-IN')}`;
}

// ── 2. SCORE PREDICTOR ────────────────────────
async function loadAiPredictions(force = false) {
  const loading = document.getElementById('predictorLoading');
  const errorEl = document.getElementById('predictorError');
  const noDataEl = document.getElementById('predictorNoData');
  const results = document.getElementById('predictorResults');
  const btn = document.getElementById('refreshPredictorBtn');
  const icon = document.getElementById('refreshPredictorIcon');

  loading.classList.remove('hidden');
  errorEl.classList.add('hidden');
  noDataEl.classList.add('hidden');
  results.classList.add('hidden');
  btn.disabled = true;
  icon.textContent = '⏳';

  try {
    const res = await fetch(`/api/ai/predictions${force ? '?force=1' : ''}`);
    const data = await res.json();
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';

    if (!res.ok) {
      document.getElementById('predictorErrorMsg').textContent = data.message || 'Error projecting scores.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (data.status === 'no_data') {
      noDataEl.classList.remove('hidden');
      return;
    }

    renderAiPredictions(data);
    results.classList.remove('hidden');
    document.getElementById('predictorModelBadge').textContent = `${data.model || 'AI'}${data.cached ? ' · cached' : ''}`;
  } catch (err) {
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';
    document.getElementById('predictorErrorMsg').textContent = 'Could not connect to the AI server.';
    errorEl.classList.remove('hidden');
  }
}

function renderAiPredictions(data) {
  const overview = document.getElementById('predictorOverview');
  if (data.overall_projected_percentage || data.board_readiness_verdict) {
    overview.style.display = 'flex';
    overview.innerHTML = `
      <div>
        <div class="ai-predictor-overview-label">Projected Board Aggregate</div>
        <div class="ai-predictor-overview-pct">${data.overall_projected_percentage || '—'}</div>
      </div>
      <div class="ai-predictor-overview-verdict">
        <strong>Board Readiness:</strong> ${data.board_readiness_verdict || 'Continue consistent past-paper drills to solidify grade band.'}
      </div>`;
  } else {
    overview.style.display = 'none';
  }

  const predictions = data.predictions || {};
  const predEntries = Object.entries(predictions);
  const grid = document.getElementById('aiScorePredictorGrid');

  if (!predEntries.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No prediction data available.</p>';
    return;
  }

  grid.innerHTML = predEntries.map(([subj, p]) => {
    const dotColor = SUBJECT_COLORS[subj] || '#6c63ff';
    const traj = (p.trajectory || 'Stable').toLowerCase();
    let trajClass = 'stable';
    if (traj.includes('ris') || traj.includes('up') || traj.includes('strong')) trajClass = 'rising';
    else if (traj.includes('push') || traj.includes('inconsistent') || traj.includes('need')) trajClass = 'push';

    const gradeClass = GRADE_CLASS[p.predicted_grade] || 'grade-NW';

    return `
      <div class="ai-predictor-card">
        <div class="ai-predictor-head">
          <span class="ai-predictor-subj">
            <span class="dot" style="background:${dotColor};width:9px;height:9px"></span>
            ${subj}
          </span>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="ai-grade-badge ${gradeClass}">${p.predicted_grade || 'Projected'}</span>
            <span class="ai-trajectory-badge ${trajClass}">${p.trajectory || 'Steady'}</span>
          </div>
        </div>
        <div class="ai-predictor-score-box">
          <span class="ai-predictor-score-label">Projected Board Score</span>
          <span class="ai-predictor-score-val">${p.predicted_score || '—'}</span>
        </div>
        <p class="ai-predictor-analysis">${p.analysis || ''}</p>
        ${p.next_tier_target ? `<div class="ai-predictor-target">🎯 <strong>Next Tier:</strong> ${p.next_tier_target}</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('predictorFooter').textContent =
    `Projected by ${data.model || 'AI'} · ${data.cached ? 'Cached' : 'Fresh'} · ${new Date().toLocaleTimeString('en-IN')}`;
}

// ── 3. MISTAKE PATTERNS ──────────────────────
async function loadAiPatterns(force = false) {
  const loading = document.getElementById('patternsLoading');
  const errorEl = document.getElementById('patternsError');
  const noDataEl = document.getElementById('patternsNoData');
  const results = document.getElementById('patternsResults');
  const btn = document.getElementById('refreshPatternsBtn');
  const icon = document.getElementById('refreshPatternsIcon');

  loading.classList.remove('hidden');
  errorEl.classList.add('hidden');
  noDataEl.classList.add('hidden');
  results.classList.add('hidden');
  btn.disabled = true;
  icon.textContent = '⏳';

  try {
    const res = await fetch(`/api/ai/patterns${force ? '?force=1' : ''}`);
    const data = await res.json();
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';

    if (!res.ok) {
      document.getElementById('patternsErrorMsg').textContent = data.message || 'Pattern analysis error.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (data.status === 'no_data') {
      noDataEl.classList.remove('hidden');
      return;
    }

    renderAiPatterns(data);
    results.classList.remove('hidden');
    document.getElementById('patternsModelBadge').textContent = `${data.model || 'AI'}${data.cached ? ' · cached' : ''}`;
  } catch (err) {
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';
    document.getElementById('patternsErrorMsg').textContent = 'Could not connect to the AI server.';
    errorEl.classList.remove('hidden');
  }
}

function renderAiPatterns(data) {
  const topBanner = document.getElementById('patternsTopBanner');
  if (data.top_blind_spot) {
    topBanner.style.display = 'flex';
    topBanner.innerHTML = `<span>🚨</span><div><strong>#1 Critical Blind Spot:</strong> ${data.top_blind_spot}</div>`;
  } else {
    topBanner.style.display = 'none';
  }

  const patterns = data.patterns || [];
  const grid = document.getElementById('aiMistakePatternsGrid');
  if (!patterns.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No recurring mistake patterns detected yet. Great job!</p>';
    return;
  }

  grid.innerHTML = patterns.map(pat => {
    const dotColor = SUBJECT_COLORS[pat.subject] || '#6c63ff';
    return `
      <div class="ai-pattern-card">
        <div class="ai-pattern-head">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span class="dot" style="background:${dotColor};width:8px;height:8px"></span>
              <span style="font-size:12px;font-weight:700;color:var(--text-muted)">${pat.subject}</span>
            </div>
            <h4 class="ai-pattern-title">${pat.pattern_title}</h4>
          </div>
          <span class="ai-pattern-cat">${pat.category || 'Pattern'}</span>
        </div>
        <div class="ai-pattern-freq">⚠️ ${pat.frequency_note || 'Recurring across attempts'}</div>
        ${pat.remedy ? `<div class="ai-pattern-remedy"><strong>Corrective Drill:</strong> ${pat.remedy}</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('patternsFooter').textContent =
    `Analyzed by ${data.model || 'AI'} · ${data.cached ? 'Cached' : 'Fresh'} · ${new Date().toLocaleTimeString('en-IN')}`;
}

// ── 4. 7-DAY STUDY PLANNER ────────────────────
async function loadAiPlanner(force = false) {
  const loading = document.getElementById('plannerLoading');
  const errorEl = document.getElementById('plannerError');
  const noDataEl = document.getElementById('plannerNoData');
  const results = document.getElementById('plannerResults');
  const btn = document.getElementById('refreshPlannerBtn');
  const icon = document.getElementById('refreshPlannerIcon');

  loading.classList.remove('hidden');
  errorEl.classList.add('hidden');
  noDataEl.classList.add('hidden');
  results.classList.add('hidden');
  btn.disabled = true;
  icon.textContent = '⏳';

  try {
    const res = await fetch(`/api/ai/planner${force ? '?force=1' : ''}`);
    const data = await res.json();
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';

    if (!res.ok) {
      document.getElementById('plannerErrorMsg').textContent = data.message || 'Planner error.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (data.status === 'no_data') {
      noDataEl.classList.remove('hidden');
      return;
    }

    renderAiPlanner(data);
    results.classList.remove('hidden');
    document.getElementById('plannerModelBadge').textContent = `${data.model || 'AI'}${data.cached ? ' · cached' : ''}`;
  } catch (err) {
    loading.classList.add('hidden');
    btn.disabled = false;
    icon.textContent = '🔄';
    document.getElementById('plannerErrorMsg').textContent = 'Could not connect to the AI server.';
    errorEl.classList.remove('hidden');
  }
}

function renderAiPlanner(data) {
  const goalBanner = document.getElementById('plannerGoalBanner');
  if (data.weekly_goal || data.weekly_focus) {
    goalBanner.style.display = 'flex';
    goalBanner.innerHTML = `<span>🎯</span><div><strong>Weekly Target:</strong> ${data.weekly_goal || data.weekly_focus}</div>`;
  } else {
    goalBanner.style.display = 'none';
  }

  const planner = data.planner || data.study_planner || [];
  const grid = document.getElementById('aiStudyPlannerGrid');
  if (!planner.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No study plan generated yet.</p>';
    return;
  }

  grid.innerHTML = planner.map(plan => {
    const dotColor = SUBJECT_COLORS[plan.subject] || '#6c63ff';
    const isHigh = (plan.priority || '').toLowerCase() === 'high';
    const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];

    return `
      <div class="ai-planner-card ${isHigh ? 'priority-high' : 'priority-medium'}">
        <div class="ai-planner-head">
          <span class="ai-planner-day">${plan.day}</span>
          <span class="ai-planner-duration">⏱️ ${plan.duration || '45m'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="dot" style="background:${dotColor};width:8px;height:8px"></span>
          <span style="font-size:12.5px;font-weight:700">${plan.subject}</span>
        </div>
        <div class="ai-planner-focus">🎯 ${plan.focus_topic}</div>
        <ul class="ai-planner-tasklist">
          ${tasks.map(t => `<li>${t}</li>`).join('')}
        </ul>
      </div>`;
  }).join('');

  document.getElementById('plannerFooter').textContent =
    `Generated by ${data.model || 'AI'} · ${data.cached ? 'Cached' : 'Fresh'} · ${new Date().toLocaleTimeString('en-IN')}`;
}

// ── Master Loader ─────────────────────────────
function loadAllAiModules(force = false) {
  loadAiCoach(force);
  loadAiPredictions(force);
  loadAiPatterns(force);
  loadAiPlanner(force);
}

// Wire up event listeners
document.addEventListener('DOMContentLoaded', () => {
  const btnCoach = document.getElementById('refreshCoachBtn');
  const btnPred = document.getElementById('refreshPredictorBtn');
  const btnPat = document.getElementById('refreshPatternsBtn');
  const btnPlan = document.getElementById('refreshPlannerBtn');
  const btnAllAi = document.getElementById('refreshAllAiBtn');

  if (btnCoach) btnCoach.addEventListener('click', () => loadAiCoach(true));
  if (btnPred) btnPred.addEventListener('click', () => loadAiPredictions(true));
  if (btnPat) btnPat.addEventListener('click', () => loadAiPatterns(true));
  if (btnPlan) btnPlan.addEventListener('click', () => loadAiPlanner(true));
  if (btnAllAi) btnAllAi.addEventListener('click', () => loadAllAiModules(true));
});
