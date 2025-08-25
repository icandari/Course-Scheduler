// Minimal JS for UI 1 (searchable dropdowns + distinct Holokai validation)

const state = {
  datasets: { majors: [], minors: [] },
<<<<<<< HEAD
  selected: { major: null, minor1: null, minor2: null }, // { id, name, holokai }
  scheduleGenerated: false
};

// --- Persistence helpers ---
const STORAGE_KEYS = {
  selected: 'holokai:selected',
  step: 'holokai:step' // 'holokai' | 'constraints'
};

function saveSelectedToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.selected, JSON.stringify(state.selected));
  } catch {}
}

function loadSelectedFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selected);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      // Only keep whitelisted fields to avoid stale data
      ['major', 'minor1', 'minor2'].forEach(k => {
        const v = parsed[k];
        if (v && typeof v === 'object' && (v.id || v.name)) {
          state.selected[k] = { id: v.id ?? null, name: v.name ?? '', holokai: v.holokai ?? '' };
        }
      });
    }
  } catch {}
}

function saveStepToStorage(step) {
  try { localStorage.setItem(STORAGE_KEYS.step, step); } catch {}
}

function loadStepFromStorage() {
  try { return localStorage.getItem(STORAGE_KEYS.step) || 'holokai'; } catch { return 'holokai'; }
}

// Keep search inputs in sync with current selection (both Holokai step and Constraints re-selectors)
function syncInputsFromState() {
  const map = [
    { key: 'major', ids: ['major-input', 'c-major-input'] },
    { key: 'minor1', ids: ['minor1-input', 'c-minor1-input'] },
    { key: 'minor2', ids: ['minor2-input', 'c-minor2-input'] }
  ];
  map.forEach(({ key, ids }) => {
    const val = state.selected[key]?.name || '';
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
  });
}

=======
  selected: { major: null, minor1: null, minor2: null } // { id, name, holokai }
};

>>>>>>> 9897865 (new ui)
// Map a holokai string to a color class and readable label
function holokaiMeta(holokai) {
  const h = (holokai || '').toLowerCase();
  if (h.includes('arts') || h.includes('humanities')) return { dot: 'red', label: 'Arts & Humanities' };
  if (h.includes('professional')) return { dot: 'silver', label: 'Professional Studies' };
  if (h.includes('math') || h.includes('science')) return { dot: 'gold', label: 'Math & Sciences' };
  return { dot: 'gray', label: 'Uncategorized' };
}
<<<<<<< HEAD

// --- Searchable dropdown component ---
function mountDropdown({ inputEl, listEl, options, type }) {
  let open = false;

  const renderList = (query = '') => {
    const q = query.trim().toLowerCase();
    listEl.innerHTML = '';
    const filtered = !q ? options : options.filter(o => o.course_name.toLowerCase().includes(q));
    const taken = new Set(
      ['major', 'minor1', 'minor2']
        .map(k => state.selected[k]?.holokai)
        .filter(Boolean)
    );

    filtered.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'sd-item';
      const { dot, label } = holokaiMeta(opt.holokai);
      item.innerHTML = `<span class="dot ${dot}"></span><span>${opt.course_name}</span>`;

      // Incompatibility: minors cannot match selected major or the other minor's holokai
      const isMinor = type !== 'major';
      const conflict = isMinor && (
        (state.selected.major && opt.holokai === state.selected.major.holokai) ||
        (type === 'minor2' && state.selected.minor1 && opt.holokai === state.selected.minor1.holokai) ||
        (type === 'minor1' && state.selected.minor2 && opt.holokai === state.selected.minor2.holokai)
      );

      if (conflict) item.classList.add('disabled');

      item.addEventListener('click', () => {
        if (item.classList.contains('disabled')) return;
        state.selected[type] = { id: opt.id, name: opt.course_name, holokai: opt.holokai };
        // Show the selected value in all relevant search bars per new requirement
        syncInputsFromState();
        saveSelectedToStorage();
        close();
        updatePreview(type);
        updateNextButton();
        // Re-render lists for other dropdowns to reflect incompatibilities
        refreshAllLists();
      });

      listEl.appendChild(item);
    });

    listEl.style.display = 'block';
    open = true;
  };

  const close = () => {
    listEl.style.display = 'none';
    open = false;
  };

  // Always open with full list on focus/click so users can see options immediately
  inputEl.addEventListener('focus', () => renderList(''));
  inputEl.addEventListener('input', e => renderList(e.target.value));
  inputEl.addEventListener('click', e => {
    if (!open) renderList('');
    e.stopPropagation();
  });

  document.addEventListener('click', close);

  return { refresh: () => open && renderList(inputEl.value), close };
}

// Update preview card under each selector
function updatePreview(which) {
  const map = {
    major: document.getElementById('major-preview'),
    minor1: document.getElementById('minor1-preview'),
    minor2: document.getElementById('minor2-preview')
  };
  const sel = state.selected[which];
  const el = map[which];
  if (!el) return;

  if (!sel) {
  el.classList.remove('filled');
  el.classList.add('square');
    el.textContent = 'No course selected';
    return;
  }

  const { dot, label } = holokaiMeta(sel.holokai);
  el.classList.add('filled');
  el.classList.remove('square');
  const imgSrc = sel.image_url || '/assets/defaultcourse.png';
  el.innerHTML = `
    <div class="pv-head">
      <div class="pv-actions">
        <sl-icon-button name="box-arrow-up-right" label="Learn more" class="pv-action pv-learn" style="font-size:18px;"></sl-icon-button>
        <sl-icon-button name="x-lg" label="Clear" class="pv-action pv-dismiss" style="font-size:18px;"></sl-icon-button>
      </div>
      <div class="pv-title">${sel.name}</div>
      <div class="pv-holokai"><span class="dot ${dot}"></span><span>${label}</span></div>
      <div class="pv-credits">124 Credit Hrs</div>
    </div>
    <div class="pv-img"><img src="${imgSrc}" alt="${sel.name}" /></div>
  `;

  // Wire dismiss to clear the selection for this slot
  const dismiss = el.querySelector('.pv-dismiss');
  if (dismiss) {
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selected[which] = null;
  saveSelectedToStorage();
      // Clear the corresponding input boxes
      const inputIds = which === 'major' ? ['major-input','c-major-input']
        : which === 'minor1' ? ['minor1-input','c-minor1-input']
        : ['minor2-input','c-minor2-input'];
      inputIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      // Keep all inputs synced afterwards
      syncInputsFromState();
      updatePreview(which);
      updateNextButton();
      refreshAllLists();
    });
  }

  // Optional: Learn more placeholder
  const learn = el.querySelector('.pv-learn');
  if (learn) {
    learn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Placeholder action; no navigation yet
      alert('Learn more coming soon.');
    });
  }
}

// Enable Next when all three chosen and holokai are distinct
function updateNextButton() {
  const btn = document.getElementById('next-btn');
  const s = state.selected;
  const allPicked = s.major && s.minor1 && s.minor2;
  const uniq = new Set([s.major?.holokai, s.minor1?.holokai, s.minor2?.holokai]).size === 3;
  btn.disabled = !(allPicked && uniq);
}

// Re-render all open lists to update incompatibility styling
let ddInstances = {};
function refreshAllLists() {
  Object.values(ddInstances).forEach(inst => inst.refresh());
}

// Toggle to constraints UI and mount its dropdowns (idempotent)
function showConstraintsUI() {
  // Hide Holokai card & title
  document.getElementById('step-holokai')?.closest('section')?.classList.add('hidden');
  document.getElementById('step-holokai')?.style.setProperty('display','none');
  document.getElementById('holokai-title')?.style.setProperty('display','none');
  // Hide outside Next button when constraints UI is visible
  const outsideNextWrap = document.querySelector('.actions.actions-outside');
  if (outsideNextWrap) outsideNextWrap.style.display = 'none';

  // Show constraints layout
  const constraints = document.getElementById('constraints-ui');
  if (constraints) constraints.style.display = 'grid';

  // Mount sidebar dropdowns using existing datasets (only once)
  if (!ddInstances.cMajor && document.getElementById('c-major-input')) {
    ddInstances.cMajor = mountDropdown({
      inputEl: document.getElementById('c-major-input'),
      listEl: document.getElementById('c-major-list'),
      options: state.datasets.majors,
      type: 'major'
    });
  }
  if (!ddInstances.cMinor1 && document.getElementById('c-minor1-input')) {
    ddInstances.cMinor1 = mountDropdown({
      inputEl: document.getElementById('c-minor1-input'),
      listEl: document.getElementById('c-minor1-list'),
      options: state.datasets.minors,
      type: 'minor1'
    });
  }
  if (!ddInstances.cMinor2 && document.getElementById('c-minor2-input')) {
    ddInstances.cMinor2 = mountDropdown({
      inputEl: document.getElementById('c-minor2-input'),
      listEl: document.getElementById('c-minor2-list'),
      options: state.datasets.minors,
      type: 'minor2'
    });
  }

  // Ensure the re-selector inputs reflect current selection
  syncInputsFromState();

  // Show placeholder until user clicks Generate
  state.scheduleGenerated = false;
  const canvasInit = document.querySelector('.constraints-canvas');
  if (canvasInit) {
    canvasInit.innerHTML = '<div class="canvas-placeholder">Click Generate to see your college plan</div>';
  }

  // Re-render when starting semester changes
  const startSel = document.getElementById('start-sem');
  if (startSel && !startSel._hasScheduleListener) {
    startSel.addEventListener('change', () => {
      if (state.scheduleGenerated) {
  // Re-generate using latest constraints so stats/dates stay accurate
  generateScheduleFromConstraints();
      }
    });
    startSel._hasScheduleListener = true;
  }
}

// --- Schedule rendering (stats + semester boxes) ---
const TERM_ORDER = ['Spring', 'Fall', 'Winter'];
function parseStartSemester() {
  const sel = document.getElementById('start-sem');
  const raw = (sel?.value || '').trim();
  // Expected format like: "Fall 2024" or "Winter 2025"
  const m = raw.match(/(Spring|Fall|Winter)\s+(\d{4})/i);
  if (!m) return { term: 'Fall', year: new Date().getFullYear() };
  return { term: capitalize(m[1]), year: parseInt(m[2], 10) };
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s; }
function nextTerm(term, year){
  switch(term){
    case 'Spring': return { term: 'Fall', year };
    case 'Fall': return { term: 'Winter', year: year + 1 };
    case 'Winter': return { term: 'Spring', year };
    default: return { term: 'Fall', year };
  }
}

function renderScheduleCanvas(){
  const canvas = document.querySelector('.constraints-canvas');
  if (!canvas) return;

  const start = parseStartSemester();
  // Compute 2 academic years (6 terms) as placeholders
  const years = [[], []];
  let term = start.term, year = start.year;
  for (let i = 0; i < 6; i++){
    const yIndex = Math.floor(i / 3); // 0 or 1
    years[yIndex].push({ term, year });
    const nxt = nextTerm(term, year);
    term = nxt.term; year = nxt.year;
  }

  // Simple stats placeholders
  const totalSemesters = 6;
  const totalCredits = 0; // until real data is supplied
  const electiveNeeded = 0; // placeholder
  // Graduation term/year is last of the generated terms
  const last = years[years.length-1][2];
  const gradLabel = `${last.term} ${last.year}`;

  const statsHtml = `
    <div class="stats-box">
      <div class="stat">
        <div class="label">Graduation Date</div>
        <div class="value">${gradLabel}</div>
      </div>
      <div class="stat">
        <div class="label">Total Semesters</div>
        <div class="value">${totalSemesters}</div>
      </div>
      <div class="stat">
        <div class="label">Total Credits</div>
        <div class="value">${totalCredits}</div>
      </div>
      <div class="stat">
        <div class="label">Elective Credits Needed</div>
        <div class="value">${electiveNeeded}</div>
      </div>
    </div>
  `;

  const yearSections = years.map((terms, idx) => {
    const yearNum = idx + 1;
    const creditsTaken = 0; // placeholder until we fill courses
    const semCards = terms.map(t => `
      <div class="semester-card">
        <div class="sem-header">${t.term} ${t.year}</div>
        <div class="courses">
          <!-- course pills go here -->
        </div>
        <div class="sem-footer">0 Total Credits</div>
      </div>
    `).join('');
    return `
      <section class="year-section">
        <div class="year-header">
          <div class="year-title">Year ${yearNum}</div>
          <div class="year-credits">${creditsTaken} Credits Taken</div>
        </div>
        <div class="semesters-row">${semCards}</div>
      </section>
    `;
  }).join('');

  canvas.innerHTML = `${statsHtml}${yearSections}`;
}

=======

// --- Searchable dropdown component ---
function mountDropdown({ inputEl, listEl, options, type }) {
  let open = false;

  const renderList = (query = '') => {
    const q = query.trim().toLowerCase();
    listEl.innerHTML = '';
    const filtered = !q ? options : options.filter(o => o.course_name.toLowerCase().includes(q));
    const taken = new Set(
      ['major', 'minor1', 'minor2']
        .map(k => state.selected[k]?.holokai)
        .filter(Boolean)
    );

    filtered.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'sd-item';
      const { dot, label } = holokaiMeta(opt.holokai);
      item.innerHTML = `<span class="dot ${dot}"></span><span>${opt.course_name}</span>`;

      // Incompatibility: minors cannot match selected major or the other minor's holokai
      const isMinor = type !== 'major';
      const conflict = isMinor && (
        (state.selected.major && opt.holokai === state.selected.major.holokai) ||
        (type === 'minor2' && state.selected.minor1 && opt.holokai === state.selected.minor1.holokai) ||
        (type === 'minor1' && state.selected.minor2 && opt.holokai === state.selected.minor2.holokai)
      );

      if (conflict) item.classList.add('disabled');

      item.addEventListener('click', () => {
        if (item.classList.contains('disabled')) return;
        state.selected[type] = { id: opt.id, name: opt.course_name, holokai: opt.holokai };
        // Clear the search bar per requirement: don't show selection in the input
        inputEl.value = '';
        close();
        updatePreview(type);
        updateNextButton();
        // Re-render lists for other dropdowns to reflect incompatibilities
        refreshAllLists();
      });

      listEl.appendChild(item);
    });

    listEl.style.display = 'block';
    open = true;
  };

  const close = () => {
    listEl.style.display = 'none';
    open = false;
  };

  inputEl.addEventListener('focus', () => renderList(inputEl.value));
  inputEl.addEventListener('input', e => renderList(e.target.value));
  inputEl.addEventListener('click', e => {
    if (!open) renderList(inputEl.value);
    e.stopPropagation();
  });

  document.addEventListener('click', close);

  return { refresh: () => open && renderList(inputEl.value), close };
}

// Update preview card under each selector
function updatePreview(which) {
  const map = {
    major: document.getElementById('major-preview'),
    minor1: document.getElementById('minor1-preview'),
    minor2: document.getElementById('minor2-preview')
  };
  const sel = state.selected[which];
  const el = map[which];
  if (!el) return;

  if (!sel) {
  el.classList.remove('filled');
  el.classList.add('square');
    el.textContent = 'No course selected';
    return;
  }

  const { dot, label } = holokaiMeta(sel.holokai);
  el.classList.add('filled');
  el.classList.remove('square');
  const imgSrc = sel.image_url || '/assets/defaultcourse.png';
  el.innerHTML = `
    <div class="pv-head">
      <div class="pv-actions">
        <sl-icon-button name="box-arrow-up-right" label="Learn more" class="pv-action pv-learn" style="font-size:18px;"></sl-icon-button>
        <sl-icon-button name="x-lg" label="Clear" class="pv-action pv-dismiss" style="font-size:18px;"></sl-icon-button>
      </div>
      <div class="pv-title">${sel.name}</div>
      <div class="pv-holokai"><span class="dot ${dot}"></span><span>${label}</span></div>
      <div class="pv-credits">124 Credit Hrs</div>
    </div>
    <div class="pv-img"><img src="${imgSrc}" alt="${sel.name}" /></div>
  `;

  // Wire dismiss to clear the selection for this slot
  const dismiss = el.querySelector('.pv-dismiss');
  if (dismiss) {
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selected[which] = null;
      updatePreview(which);
      updateNextButton();
      refreshAllLists();
    });
  }

  // Optional: Learn more placeholder
  const learn = el.querySelector('.pv-learn');
  if (learn) {
    learn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Placeholder action; no navigation yet
      alert('Learn more coming soon.');
    });
  }
}

// Enable Next when all three chosen and holokai are distinct
function updateNextButton() {
  const btn = document.getElementById('next-btn');
  const s = state.selected;
  const allPicked = s.major && s.minor1 && s.minor2;
  const uniq = new Set([s.major?.holokai, s.minor1?.holokai, s.minor2?.holokai]).size === 3;
  btn.disabled = !(allPicked && uniq);
}

// Re-render all open lists to update incompatibility styling
let ddInstances = {};
function refreshAllLists() {
  Object.values(ddInstances).forEach(inst => inst.refresh());
}

>>>>>>> 9897865 (new ui)
// Init: fetch basic course list and mount dropdowns
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Card-level help for Holokai step
    document.querySelector('#step-holokai .card-help')?.addEventListener('click', (e) => {
      e.stopPropagation();
      alert('Choose your Major and two Minors. Each must be from a different Holokai category. Use the search to filter.');
    });

    const res = await fetch('/api/courses/basic');
    if (!res.ok) throw new Error('Failed to load course list');
    const all = await res.json();

    state.datasets.majors = all
      .filter(c => (c.course_type || '').toLowerCase() === 'major')
      .sort((a,b)=>a.course_name.localeCompare(b.course_name));

    state.datasets.minors = all
      .filter(c => (c.course_type || '').toLowerCase() === 'minor')
      .sort((a,b)=>a.course_name.localeCompare(b.course_name));

<<<<<<< HEAD
  ddInstances.major = mountDropdown({
=======
    ddInstances.major = mountDropdown({
>>>>>>> 9897865 (new ui)
      inputEl: document.getElementById('major-input'),
      listEl: document.getElementById('major-list'),
      options: state.datasets.majors,
      type: 'major'
    });
    ddInstances.minor1 = mountDropdown({
      inputEl: document.getElementById('minor1-input'),
      listEl: document.getElementById('minor1-list'),
      options: state.datasets.minors,
      type: 'minor1'
    });
    ddInstances.minor2 = mountDropdown({
      inputEl: document.getElementById('minor2-input'),
      listEl: document.getElementById('minor2-list'),
      options: state.datasets.minors,
      type: 'minor2'
    });

<<<<<<< HEAD
    // Load persisted selections and step
    loadSelectedFromStorage();
    // Reflect selections in previews and inputs
    ['major','minor1','minor2'].forEach(updatePreview);
    updateNextButton();
    syncInputsFromState();

    const step = loadStepFromStorage();
    if (step === 'constraints') {
      showConstraintsUI();
    } else {
      // Make sure first-step Next is visible if we're on Holokai
      const outsideNextWrap = document.querySelector('.actions.actions-outside');
      if (outsideNextWrap) outsideNextWrap.style.display = '';
    }

    // Wire first-year limit toggle to enable/disable its selects
    const fyToggle = document.getElementById('limit-year1');
    const fySelects = [
      document.getElementById('max-fw-y1'),
      document.getElementById('max-spring-y1')
    ];
    const syncFyEnabled = () => {
      const enabled = !!fyToggle?.checked;
      fySelects.forEach(s => { if (s) s.disabled = !enabled; });
    };
    if (fyToggle) {
      fyToggle.addEventListener('change', syncFyEnabled);
      // Ensure initial state reflects default checked attribute
      syncFyEnabled();
    }

    const outsideNext = document.getElementById('next-btn');
    if (outsideNext) {
      outsideNext.addEventListener('click', () => {
        // Mark step and transition to constraints
        saveStepToStorage('constraints');
        showConstraintsUI();
      });
    }

  // If constraints Next exists (after constraints UI is shown), wire it too
    const insideNext = document.getElementById('next-btn-constraints');
    if (insideNext) {
      insideNext.addEventListener('click', () => {
        generateScheduleFromConstraints();
      });
    }

    // Hook up export button when constraints UI present
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        alert('Export coming soon.');
      });
    }
=======
    document.getElementById('next-btn').addEventListener('click', () => {
      // For now, just log selections. In the next step we’ll slide to constraints UI.
      console.log('Selections:', state.selected);
      alert('Great! Next step UI coming next.');
    });
>>>>>>> 9897865 (new ui)
  } catch (e) {
    console.error(e);
    alert('Unable to load course lists.');
  }
<<<<<<< HEAD
});

// ---------------------- Real schedule generation & rendering ----------------------

// Loading indicator helpers (minimal styling assumed)
function showLoadingIndicator() {
  let el = document.getElementById('loading-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-indicator';
    el.className = 'loading-indicator';
    el.innerHTML = '<div class="spinner"></div><p>Generating your schedule...</p>';
    document.body.appendChild(el);
  } else {
    el.classList.remove('hidden');
  }
}

function hideLoadingIndicator() {
  const el = document.getElementById('loading-indicator');
  if (el) el.classList.add('hidden');
}

// Fetch minimal course data + their prerequisite classes similar to oldscript
async function fetchRequiredCourseData(majorId, minor1Id, minor2Id, eilLevel) {
  const courseData = [];
  const includedClassIds = new Set();
  const requiredClassIds = new Set();
  const mainCourseClassIds = new Set();

  const fetchCourse = async (id) => {
    const resp = await fetch(`/api/courses/${id}?fields=essential`);
    if (!resp.ok) throw new Error(`Failed to fetch course ${id}`);
    const data = await resp.json();
    data.sections?.forEach(sec => {
      sec.classes?.forEach(cls => {
        includedClassIds.add(cls.id);
        mainCourseClassIds.add(cls.id);
        if (Array.isArray(cls.prerequisites)) {
          cls.prerequisites.forEach(p => {
            const pid = typeof p === 'object' ? p.id : p;
            if (pid && !includedClassIds.has(pid)) requiredClassIds.add(pid);
          });
        }
        if (Array.isArray(cls.corequisites)) {
          cls.corequisites.forEach(c => {
            const cid = typeof c === 'object' ? c.id : c;
            if (cid && !includedClassIds.has(cid)) requiredClassIds.add(cid);
          });
        }
      });
    });
    return data;
  };

  const fetchClass = async (id) => {
    const resp = await fetch(`/api/classes/${id}?fields=essential`);
    if (!resp.ok) throw new Error(`Failed to fetch class ${id}`);
    return await resp.json();
  };

  if (majorId) courseData.push(await fetchCourse(majorId));
  if (minor1Id) courseData.push(await fetchCourse(minor1Id));
  if (minor2Id) courseData.push(await fetchCourse(minor2Id));

  // Always include religion (course id 2) if present in DB
  try { courseData.push(await fetchCourse(2)); } catch {}

  // Optional: include EIL based on selection; if UI says none, skip
  // Old script mapped "Fluent" to id 7, Level 1/2 to 5/6. Keep conservative: only include when numeric
  if (eilLevel && eilLevel !== 'none') {
    const lvlInt = parseInt(eilLevel, 10);
    if (!Number.isNaN(lvlInt)) {
      try { courseData.push(await fetchCourse(lvlInt)); } catch {}
    }
  }

  // Resolve required prereq/coreq classes in waves
  const additionalClasses = [];
  const processed = new Set([...includedClassIds]);
  while (requiredClassIds.size > 0) {
    const batch = [...requiredClassIds];
    requiredClassIds.clear();
    for (const id of batch) {
      if (processed.has(id) || mainCourseClassIds.has(id)) continue;
      processed.add(id);
      try {
        const c = await fetchClass(id);
        additionalClasses.push(c);
        if (Array.isArray(c.prerequisites)) {
          c.prerequisites.forEach(p => {
            const pid = typeof p === 'object' ? p.id : p;
            if (pid && !processed.has(pid) && !mainCourseClassIds.has(pid)) requiredClassIds.add(pid);
          });
        }
        if (Array.isArray(c.corequisites)) {
          c.corequisites.forEach(co => {
            const cid = typeof co === 'object' ? co.id : co;
            if (cid && !processed.has(cid) && !mainCourseClassIds.has(cid)) requiredClassIds.add(cid);
          });
        }
      } catch {}
    }
  }

  if (additionalClasses.length > 0) {
    courseData.push({
      id: 'additional',
      course_name: 'Additional Prerequisites/Corequisites',
      course_type: 'system',
      sections: [{ id: 'additional-section', section_name: 'Required External Classes', classes: additionalClasses }]
    });
  }

  return courseData;
}

async function buildConstraintsPayload() {
  // Selected IDs from state
  const majorId = state.selected.major?.id || null;
  const minor1Id = state.selected.minor1?.id || null;
  const minor2Id = state.selected.minor2?.id || null;

  if (!majorId || !minor1Id || !minor2Id) {
    throw new Error('Please select a Major and two Minors before generating.');
  }

  // EIL level from UI
  const eilSel = document.getElementById('eil-level');
  const eilLevel = eilSel ? eilSel.value : 'none';

  // Fetch detailed course/class data
  const courseData = await fetchRequiredCourseData(majorId, minor1Id, minor2Id, eilLevel);

  // Constraints
  const startSemester = document.getElementById('start-sem')?.value || '';
  const majorClassLimit = parseInt(document.getElementById('max-major')?.value || '2', 10);
  const fallWinterCredits = parseInt(document.getElementById('max-fw')?.value || '18', 10);
  const springCredits = parseInt(document.getElementById('max-spring')?.value || '15', 10);
  const limitFirstYear = !!document.getElementById('limit-year1')?.checked;
  const firstYearFW = parseInt(document.getElementById('max-fw-y1')?.value || String(fallWinterCredits), 10);
  const firstYearSP = parseInt(document.getElementById('max-spring-y1')?.value || String(springCredits), 10);

  const preferences = {
    startSemester,
    majorClassLimit,
    fallWinterCredits,
    springCredits,
    approach: 'credits-based'
  };
  if (limitFirstYear) {
    preferences.limitFirstYear = true;
    preferences.firstYearLimits = {
      fallWinterCredits: firstYearFW,
      springCredits: firstYearSP
    };
  }

  return { courseData, preferences };
}

function computeTotals(schedule) {
  let totalCredits = 0;
  schedule.forEach(sem => {
    if (typeof sem.totalCredits === 'number') totalCredits += sem.totalCredits;
    else if (Array.isArray(sem.classes)) {
      totalCredits += sem.classes.reduce((s, c) => s + (c.credits || 0), 0);
    }
  });
  const totalSemesters = schedule.length;
  const last = schedule[totalSemesters - 1] || { type: 'N/A', year: '—' };
  const graduationDate = `${last.type} ${last.year}`;
  const electiveNeeded = Math.max(0, 120 - totalCredits);
  return { totalCredits, totalSemesters, graduationDate, electiveNeeded };
}

function renderScheduleInCanvas(schedule) {
  const canvas = document.querySelector('.constraints-canvas');
  if (!canvas) return;

  const { totalCredits, totalSemesters, graduationDate, electiveNeeded } = computeTotals(schedule);

  const statsHtml = `
    <div class="stats-box">
      <div class="stat"><div class="label">Graduation Date</div><div class="value">${graduationDate}</div></div>
      <div class="stat"><div class="label">Total Semesters</div><div class="value">${totalSemesters}</div></div>
      <div class="stat"><div class="label">Total Credits</div><div class="value">${totalCredits}</div></div>
      <div class="stat"><div class="label">Elective Credits Needed</div><div class="value">${electiveNeeded}</div></div>
    </div>
  `;

  // Chunk semesters into rows of 3 and label years sequentially
  const chunks = [];
  for (let i = 0; i < schedule.length; i += 3) {
    chunks.push(schedule.slice(i, i + 3));
  }

  const yearSections = chunks.map((terms, idx) => {
    const semCards = terms.map(sem => {
      const semCredits = typeof sem.totalCredits === 'number' ? sem.totalCredits : (sem.classes || []).reduce((s,c)=>s+(c.credits||0),0);
      const items = (sem.classes || []).map(cls => {
        // Normalize course_type for tag styling
        let courseType = cls.course_type || 'course';
        if (courseType.includes('/')) courseType = courseType.split('/')[0];
        return `<li class="class-item"><span class="class-tag ${courseType}">${courseType}</span><span class="class-number">${cls.class_number || ''}</span><span class="class-name">${cls.class_name || ''}</span><span class="class-credits">${cls.credits || 0} cr</span></li>`;
      }).join('');
      return `
        <div class="semester-card">
          <div class="sem-header">${sem.type} ${sem.year}</div>
          <ul class="classes-list">${items}</ul>
          <div class="sem-footer">${semCredits} Total Credits</div>
        </div>
      `;
    }).join('');
    return `
      <section class="year-section">
        <div class="year-header"><div class="year-title">Year ${idx + 1}</div><div class="year-credits">${terms.reduce((t,sem)=>t+(typeof sem.totalCredits==='number'?sem.totalCredits:(sem.classes||[]).reduce((s,c)=>s+(c.credits||0),0)),0)} Credits Taken</div></div>
        <div class="semesters-row">${semCards}</div>
      </section>
    `;
  }).join('');

  canvas.innerHTML = `${statsHtml}${yearSections}`;
}

async function generateScheduleFromConstraints() {
  try {
    showLoadingIndicator();
    const payload = await buildConstraintsPayload();

    // Abort after 30s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Request failed: ${resp.status}`);
    }
    const data = await resp.json();
    if (!data.schedule || !Array.isArray(data.schedule)) {
      throw new Error('Invalid schedule data');
    }

    state.scheduleGenerated = true;
    renderScheduleInCanvas(data.schedule);
  } catch (err) {
    console.error(err);
    alert(`Failed to generate schedule: ${err.message || err}`);
  } finally {
    hideLoadingIndicator();
  }
}
=======
});
>>>>>>> 9897865 (new ui)
