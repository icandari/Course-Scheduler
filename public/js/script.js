// Minimal JS for UI 1 (searchable dropdowns + distinct Holokai validation)

const state = {
  datasets: { majors: [], minors: [] },
  selected: { major: null, minor1: null, minor2: null }, // { id, name, holokai }
  scheduleGenerated: false,
  // Elective selection wizard
  courseDataCache: null,            // detailed course data fetched once on entering wizard
  electiveSections: [],             // flattened list of elective sections to complete
  electiveIndex: 0,                 // current wizard index
  chosenElectives: {},              // sectionId -> Set(classId)
  classIndex: null                  // Map of classId -> class object (for prereq/coreq credit lookups)
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
// Planner mode: 'credits' (default) | 'semester'
const MODE_KEY = 'holokai:mode';
function saveMode(mode){ try{ localStorage.setItem(MODE_KEY, mode); }catch{} }
function loadMode(){ try{ return localStorage.getItem(MODE_KEY) || 'credits'; }catch{ return 'credits'; } }

// --- Mode toggle helpers (top-level so we can use them after mounting constraints UI) ---
function setModeActive(which){
  const modeSemester = document.getElementById('mode-semester');
  const modeCredits = document.getElementById('mode-credits');
  if (!modeSemester || !modeCredits) return;
  if (which === 'semester') {
    modeSemester.classList.add('active'); modeSemester.setAttribute('aria-pressed','true');
    modeCredits.classList.remove('active'); modeCredits.setAttribute('aria-pressed','false');
  } else {
    modeCredits.classList.add('active'); modeCredits.setAttribute('aria-pressed','true');
    modeSemester.classList.remove('active'); modeSemester.setAttribute('aria-pressed','false');
  }
}

function setConstraintsModeUI(which){
  const showEl = (el, show) => { if (!el) return; el.style.display = show ? '' : 'none'; };
  const eilField = document.getElementById('eil-level')?.closest('.field');
  const startField = document.getElementById('start-sem')?.closest('.field');
  const maxRow = document.getElementById('max-fw')?.closest('.fields-row');
  const maxMajorField = document.getElementById('max-major')?.closest('.field');
  const fyToggleField = document.getElementById('limit-year1')?.closest('.field');
  const fyRow = document.getElementById('max-fw-y1')?.closest('.fields-row');
  const creditsMode = which !== 'semester';
  // Always show these
  showEl(eilField, true);
  showEl(startField, true);
  showEl(fyToggleField, true);
  // Show/hide the rest based on mode
  showEl(maxRow, creditsMode);
  showEl(maxMajorField, creditsMode);
  showEl(fyRow, creditsMode);
}

function wireModeToggle(){
  const modeSemester = document.getElementById('mode-semester');
  const modeCredits = document.getElementById('mode-credits');
  if (!modeSemester || !modeCredits) return; // Not mounted yet
  if (modeSemester._wired || modeCredits._wired) {
    // Still apply UI with current mode in case of re-entry
    const current = loadMode();
    setModeActive(current);
    setConstraintsModeUI(current);
    return;
  }
  const current = loadMode();
  setModeActive(current);
  setConstraintsModeUI(current);
  modeSemester.addEventListener('click', () => { saveMode('semester'); setModeActive('semester'); setConstraintsModeUI('semester'); });
  modeCredits.addEventListener('click', () => { saveMode('credits'); setModeActive('credits'); setConstraintsModeUI('credits'); });
  modeSemester._wired = true; modeCredits._wired = true;
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

// Map a holokai string to a color class and readable label
function holokaiMeta(holokai) {
  const h = (holokai || '').toLowerCase();
  if (h.includes('arts') || h.includes('humanities')) return { dot: 'red', label: 'Arts & Humanities' };
  if (h.includes('professional')) return { dot: 'silver', label: 'Professional Studies' };
  if (h.includes('math') || h.includes('science')) return { dot: 'gold', label: 'Math & Sciences' };
  return { dot: 'gray', label: 'Uncategorized' };
}

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
        // If we're on the constraints screen, reset and re-run electives wizard immediately
        if (isConstraintsVisible()) {
          resetAndStartElectivesFlow();
        }
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

// Helper: is constraints UI currently visible?
function isConstraintsVisible() {
  const el = document.getElementById('constraints-ui');
  if (!el) return false;
  // If not explicitly hidden
  return el.style.display !== 'none' && !!el.offsetParent;
}

// Helper: reset wizard state and start fresh (used when course selection changes)
function resetAndStartElectivesFlow() {
  // Invalidate any cached data and choices
  state.courseDataCache = null;
  state.electiveSections = [];
  state.electiveIndex = 0;
  state.chosenElectives = {};
  // Update sidebar Generate button to disabled until new wizard completes
  const genBtn = document.getElementById('next-btn-constraints');
  if (genBtn) {
    genBtn.textContent = 'Generate';
    genBtn.disabled = true;
    genBtn.onclick = () => {};
  }
  // Kick off
  startElectivesFlow();
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
      // If constraints are visible, reset the electives picker flow
      if (isConstraintsVisible()) {
        resetAndStartElectivesFlow();
      }
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

  // Wire the mode toggle now that constraints UI is mounted
  wireModeToggle();

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

  // Immediately start the electives picker since courses are chosen
  state.scheduleGenerated = false;
  resetAndStartElectivesFlow();

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

  ddInstances.major = mountDropdown({
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

  // If Constraints UI is already visible on load (returning user), wire toggle now
  wireModeToggle();
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

  // Do not wire a static handler for Generate here; startElectivesFlow manages it

    // Hook up export button when constraints UI present
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        alert('Export coming soon.');
      });
    }
  } catch (e) {
    console.error(e);
    alert('Unable to load course lists.');
  }
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

// ---------------------- Payload helpers: flatten to classes ----------------------
function normalizeIdArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(x => (x && typeof x === 'object' ? x.id : x))
    .filter(v => v !== null && v !== undefined)
    .map(v => Number(v))
    .filter(v => !Number.isNaN(v));
}

function resolveFromCourseLabel(course) {
  const type = (course?.course_type || '').toLowerCase();
  if (type.includes('religion')) return 'religion';
  if (type.includes('eil')) return 'EIL';
  if (type.includes('major')) return 'major';
  if (type.includes('minor')) return 'minor';
  // Fallback: try to infer from name, else default to 'major'
  const name = (course?.course_name || '').toUpperCase();
  if (name.startsWith('REL ')) return 'religion';
  if (name.includes('EIL') || name.includes('STDEV 100R')) return 'EIL';
  return 'major';
}

function flattenCourseDataToClasses(courseData, selectedElectiveIds) {
  const out = [];
  const seen = new Set();
  const sel = new Set(selectedElectiveIds || []);
  (courseData || []).forEach(course => {
  const fromCourse = (course && course.id === 'additional') ? 'major' : resolveFromCourseLabel(course);
    const sections = Array.isArray(course?.sections) ? course.sections : [];
    sections.forEach(sec => {
      const isElectiveSection = (sec?.is_required === false) && ((sec?.credits_needed_to_take || 0) > 0);
      const classes = Array.isArray(sec?.classes) ? sec.classes : [];
      classes.forEach(cls => {
        if (!cls || cls.id === undefined || cls.id === null) return;
        if (isElectiveSection && !sel.has(cls.id)) return; // only chosen electives
        if (seen.has(cls.id)) return;
        seen.add(cls.id);
        out.push({
          id: cls.id,
          class_number: cls.class_number || '',
          class_name: cls.class_name || '',
          semesters_offered: Array.isArray(cls.semesters_offered) ? cls.semesters_offered : [],
          credits: Number(cls.credits) || 0,
          is_senior_class: !!cls.is_senior_class,
          restrictions: cls.restrictions ?? null,
          prerequisites: normalizeIdArray(cls.prerequisites),
          corequisites: normalizeIdArray(cls.corequisites),
          days_offered: Array.isArray(cls.days_offered) ? cls.days_offered : [],
          times_offered: Array.isArray(cls.times_offered) ? cls.times_offered : [],
          from_course: fromCourse
        });
      });
    });
  });
  return out;
}

// Build a map of sectionId -> parent course object
function buildSectionToCourseMap(courseData) {
  const map = new Map();
  (courseData || []).forEach(course => {
    (course.sections || []).forEach(sec => {
      if (sec && (sec.id || sec.id === 0)) {
        map.set(sec.id, course);
      }
    });
  });
  return map;
}

// Build classes list strictly from user-selected electives + their prereq/coreq closure.
// Dependencies inherit from_course of the selected elective's parent course.
function buildSelectedElectivesClasses(courseData, chosenElectives) {
  const sectionToCourse = buildSectionToCourseMap(courseData);
  const idx = buildClassIndex(courseData);
  const outMap = new Map(); // id -> class payload

  // Helper to materialize a class payload with a specific from_course label
  const toPayload = (cls, fromCourseLabel) => ({
    id: cls.id,
    class_number: cls.class_number || '',
    class_name: cls.class_name || '',
    semesters_offered: Array.isArray(cls.semesters_offered) ? cls.semesters_offered : [],
    credits: Number(cls.credits) || 0,
    is_senior_class: !!cls.is_senior_class,
    restrictions: cls.restrictions ?? null,
    prerequisites: normalizeIdArray(cls.prerequisites),
    corequisites: normalizeIdArray(cls.corequisites),
    days_offered: Array.isArray(cls.days_offered) ? cls.days_offered : [],
    times_offered: Array.isArray(cls.times_offered) ? cls.times_offered : [],
    from_course: fromCourseLabel
  });

  // DFS over prerequisites and corequisites
  const addWithDeps = (startId, fromCourseLabel) => {
    const stack = [startId];
    const visited = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      const cls = idx.get(id);
      if (!cls) continue;
      if (!outMap.has(id)) outMap.set(id, toPayload(cls, fromCourseLabel));
      const prereqs = normalizeIdArray(cls.prerequisites);
      const coreqs = normalizeIdArray(cls.corequisites);
      [...prereqs, ...coreqs].forEach(depId => {
        if (depId != null && !visited.has(depId)) stack.push(depId);
      });
    }
  };

  // Iterate selected electives by section to derive from_course
  Object.entries(chosenElectives || {}).forEach(([sectionId, set]) => {
    const parentCourse = sectionToCourse.get(isNaN(sectionId) ? sectionId : Number(sectionId));
    const fromCourseLabel = resolveFromCourseLabel(parentCourse);
    const ids = Array.from(set || []);
    ids.forEach(id => addWithDeps(id, fromCourseLabel));
  });

  return Array.from(outMap.values());
}

// Build classes list including:
// - All required classes from selected courses (major/minors/religion/EIL), and
// - User-selected electives with their prereq/coreq closure.
// Dependencies inherit the from_course of the seed (required/elective) that pulled them in.
function buildRequiredAndSelectedClasses(courseData, chosenElectives) {
  const sectionToCourse = buildSectionToCourseMap(courseData);
  const idx = buildClassIndex(courseData);
  const outMap = new Map(); // id -> class payload

  const toPayload = (cls, fromCourseLabel) => ({
    id: cls.id,
    class_number: cls.class_number || '',
    class_name: cls.class_name || '',
    semesters_offered: Array.isArray(cls.semesters_offered) ? cls.semesters_offered : [],
    credits: Number(cls.credits) || 0,
    is_senior_class: !!cls.is_senior_class,
    restrictions: cls.restrictions ?? null,
    prerequisites: normalizeIdArray(cls.prerequisites),
    corequisites: normalizeIdArray(cls.corequisites),
    days_offered: Array.isArray(cls.days_offered) ? cls.days_offered : [],
    times_offered: Array.isArray(cls.times_offered) ? cls.times_offered : [],
    from_course: fromCourseLabel
  });

  const addWithDeps = (startId, fromCourseLabel) => {
    const stack = [startId];
    const visited = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      const cls = idx.get(id);
      if (!cls) continue;
      if (!outMap.has(id)) outMap.set(id, toPayload(cls, fromCourseLabel));
      const prereqs = normalizeIdArray(cls.prerequisites);
      const coreqs = normalizeIdArray(cls.corequisites);
      [...prereqs, ...coreqs].forEach(depId => {
        if (depId != null && !visited.has(depId)) stack.push(depId);
      });
    }
  };

  // 1) Seed with ALL required classes from selected courses
  (courseData || []).forEach(course => {
    const fromCourseLabel = resolveFromCourseLabel(course);
    (course.sections || []).forEach(sec => {
      const isElectiveSection = (sec?.is_required === false) && ((sec?.credits_needed_to_take || 0) > 0);
      if (isElectiveSection) return; // skip electives here; handled below
      (sec.classes || []).forEach(cls => {
        if (cls && (cls.id || cls.id === 0)) addWithDeps(cls.id, fromCourseLabel);
      });
    });
  });

  // 2) Add user-selected electives and their dependency closure, per section
  Object.entries(chosenElectives || {}).forEach(([sectionId, set]) => {
    const parentCourse = sectionToCourse.get(isNaN(sectionId) ? sectionId : Number(sectionId));
    const fromCourseLabel = resolveFromCourseLabel(parentCourse);
    const ids = Array.from(set || []);
    ids.forEach(id => addWithDeps(id, fromCourseLabel));
  });

  return Array.from(outMap.values());
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

  // Include EIL per old mapping: Fluent -> course 7, Level 1 -> 5, Level 2 -> 6
  if (eilLevel) {
    let courseId = null;
    if (eilLevel === 'Fluent') courseId = 7;
    else if (eilLevel === 'EIL Level 1') courseId = 5;
    else if (eilLevel === 'EIL Level 2') courseId = 6;
    if (courseId) {
      try { courseData.push(await fetchCourse(courseId)); } catch {}
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

  // Fetch detailed course/class data (reuse cache if wizard already fetched it)
  const courseData = state.courseDataCache || await fetchRequiredCourseData(majorId, minor1Id, minor2Id, eilLevel);
  state.courseDataCache = courseData;

  // Constraints
  const startSemester = document.getElementById('start-sem')?.value || '';
  const majorClassLimit = parseInt(document.getElementById('max-major')?.value || '2', 10);
  const fallWinterCredits = parseInt(document.getElementById('max-fw')?.value || '18', 10);
  const springCredits = parseInt(document.getElementById('max-spring')?.value || '15', 10);
  const limitFirstYear = !!document.getElementById('limit-year1')?.checked;
  const firstYearFW = parseInt(document.getElementById('max-fw-y1')?.value || String(fallWinterCredits), 10);
  const firstYearSP = parseInt(document.getElementById('max-spring-y1')?.value || String(springCredits), 10);

  const mode = loadMode() === 'semester' ? 'semester-based' : 'credits-based';
  let preferences;
  if (mode === 'semester-based') {
    // Semester-based: only include startSemester, approach, and limitFirstYear boolean
    preferences = {
      startSemester,
      approach: mode,
      limitFirstYear: !!limitFirstYear
    };
  } else {
    // Credits-based: include credit limits and optional firstYearLimits
    preferences = {
      startSemester,
      majorClassLimit,
      fallWinterCredits,
      springCredits,
      approach: mode,
      limitFirstYear: !!limitFirstYear
    };
    if (limitFirstYear) {
      preferences.firstYearLimits = {
        fallWinterCredits: firstYearFW,
        springCredits: firstYearSP
      };
    }
  }

  // Include user-chosen elective class IDs (wizard) if any, for filtering only
  // Only include classes selected in the wizard, plus required prereqs/coreqs.
  const classes = buildRequiredAndSelectedClasses(courseData, state.chosenElectives);

  return { classes, preferences };
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

  const mapCourseTypeToDot = (courseType) => {
    const t = (courseType || '').toLowerCase();
    if (t.includes('major')) return 'gold';
    if (t.includes('minor')) return 'red';
    if (t.includes('religion')) return 'silver';
    if (t.includes('eil')) return 'gray';
    return 'gray';
  };

  const yearSections = chunks.map((terms, idx) => {
    const semCards = terms.map(sem => {
      const semCredits = typeof sem.totalCredits === 'number' ? sem.totalCredits : (sem.classes || []).reduce((s,c)=>s+(c.credits||0),0);
      const items = (sem.classes || []).map(cls => {
        const dot = mapCourseTypeToDot(cls.course_type);
        const num = cls.class_number || '';
        const name = cls.class_name || '';
        const credits = cls.credits || 0;
        return `
          <li class="class-item">
            <div class="class-card">
              <div class="cc-row1">
                <span class="dot ${dot}"></span>
                <span class="class-number">${num}</span>
                <button class="info-btn" aria-label="Details">i</button>
              </div>
              <div class="cc-row2 class-name">${name}</div>
              <div class="cc-row3 class-credits">${credits}cr</div>
            </div>
          </li>
        `;
      }).join('');
      return `
        <div class="semester-card">
          <div class="sem-header">${sem.type} ${sem.year}</div>
          <ul class="classes-list">${items}</ul>
          <div class="sem-footer">${semCredits} Total Credits</div>
        </div>
      `;
    }).join('');
    const yearCredits = terms.reduce((t,sem)=>t+(typeof sem.totalCredits==='number'?sem.totalCredits:(sem.classes||[]).reduce((s,c)=>s+(c.credits||0),0)),0);
    return `
      <section class="year-section">
        <div class="year-header"><div class="year-title">Year ${idx + 1}</div><div class="year-credits">${yearCredits} Credits Taken</div></div>
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

  // Debug: show the exact payload being sent to the backend
  // Note: This logs a plain JS object; expand in DevTools to inspect deeply.
  console.log('Sending payload', payload);

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
  // Debug: show the network response we received
  console.log('Received response', data);
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

// ---------------------- Electives Wizard ----------------------

function findElectiveSections(courseData) {
  const relevantTypes = new Set(['major', 'minor', 'religion']);
  const sections = [];
  (courseData || []).forEach(course => {
    const type = (course.course_type || '').toLowerCase();
    if (!relevantTypes.has(type)) return;
    (course.sections || []).forEach(sec => {
      const isElectiveSection = (sec.is_required === false) && (sec.credits_needed_to_take || 0) > 0 && Array.isArray(sec.classes) && sec.classes.length > 0;
      if (isElectiveSection) {
        sections.push({
          parentCourseId: course.id,
          parentCourseName: course.course_name,
          parentCourseType: course.course_type,
          id: sec.id,
          section_name: sec.section_name,
          credits_needed_to_take: sec.credits_needed_to_take,
          classes: sec.classes
        });
      }
    });
  });
  return sections;
}

function uniformClassCredits(classes) {
  const credits = (classes || []).map(c => Number(c.credits) || 0).filter(Boolean);
  if (!credits.length) return null;
  const first = credits[0];
  return credits.every(c => c === first) ? first : null;
}

function ensureSet(map, key) {
  if (!map[key]) map[key] = new Set();
  return map[key];
}

function renderElectivesWizard() {
  const canvas = document.querySelector('.constraints-canvas');
  if (!canvas) return;
  // While wizard is visible, gray out only the Constraints box (keep Holokai and AI active)
  document.querySelector('.constraints-box')?.classList.add('disabled');
  // Disable only the inputs/selects inside constraints (leave mode toggle clickable)
  disableConstraintsControls(true);

  // If no elective sections, skip directly to schedule generation UI
  if (!state.electiveSections.length) {
    canvas.innerHTML = '<div class="canvas-placeholder">No electives to choose. Click Generate to build your plan.</div>';
    // Also enable the sidebar Generate button if present
    const genBtn = document.getElementById('next-btn-constraints');
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.textContent = 'Generate';
      genBtn.onclick = () => generateScheduleFromConstraints();
    }
  // Re-enable Constraints box
  document.querySelector('.constraints-box')?.classList.remove('disabled');
  disableConstraintsControls(false);
    return;
  }

  const idx = Math.max(0, Math.min(state.electiveIndex, state.electiveSections.length - 1));
  const sec = state.electiveSections[idx];
  const classes = sec.classes || [];
  const needCredits = Number(sec.credits_needed_to_take) || 0;
  const uniform = uniformClassCredits(classes);
  const chooseCount = uniform && needCredits % uniform === 0 ? Math.round(needCredits / uniform) : null;

  // Build class cards
  const chosenSet = ensureSet(state.chosenElectives, sec.id);
  const itemsHtml = classes.map(cls => {
    const id = cls.id;
    const selected = chosenSet.has(id);
    const num = cls.class_number || '';
    const name = cls.class_name || '';
    const credits = Number(cls.credits) || 0;
    return `
      <li class="class-item">
        <div class="class-card selectable ${selected ? 'selected' : ''}" data-class-id="${id}">
          <div class="cc-row1">
            <button class="card-check" aria-pressed="${selected}" aria-label="Select elective"></button>
            <span class="class-number">${num}</span>
            <button class="info-btn" aria-label="Details">i</button>
          </div>
          <div class="cc-row2 class-name">${name}</div>
          <div class="cc-row3 class-credits">${credits}cr</div>
        </div>
      </li>
    `;
  }).join('');

  const headerTitle = `Choose Electives for ${sec.parentCourseName}`;
  const headerSubtitle = needCredits ? `Choose ${needCredits} Credits` : 'Choose electives';
  const isLast = idx === (state.electiveSections.length - 1);

  const html = `
    <div class="electives-panel">
      <div class="elective-toolbar">
        <div class="et-titles">
          <div class="et-title">${headerTitle}</div>
          <div class="et-sub">${sec.section_name} • ${headerSubtitle}</div>
        </div>
        <div class="et-progress">${idx + 1} / ${state.electiveSections.length}</div>
      </div>
      <div class="elective-classes">
        <ul class="classes-list">${itemsHtml}</ul>
      </div>
    </div>
    <div class="wizard-actions below">
      <button class="btn back" id="wiz-back" ${idx === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn next" id="wiz-next" disabled>Next</button>
    </div>
  `;

  canvas.innerHTML = html;

  // Selection logic
  const updateNextEnabled = () => {
    const selectedIds = Array.from(ensureSet(state.chosenElectives, sec.id));
    const nextEl = document.getElementById('wiz-next');
    if (!needCredits) {
      if (nextEl) nextEl.disabled = selectedIds.length === 0;
      return;
    }
    // Calculate selected credits including corequisites
    const { credits } = computeSectionSelectionCredits(sec, selectedIds);
    if (chooseCount) {
      const ok = selectedIds.length >= chooseCount;
      if (nextEl) nextEl.disabled = !ok;
    } else {
      // Allow up to +1 credit over the needCredits
      const allowed = needCredits + 1;
      const ok = credits >= needCredits && credits <= allowed;
      if (nextEl) nextEl.disabled = !ok;
    }
  };

  canvas.querySelectorAll('.class-card.selectable').forEach(card => {
    const cid = Number(card.getAttribute('data-class-id'));
    const toggle = () => {
      const set = ensureSet(state.chosenElectives, sec.id);
      const nextSelected = new Set(set);
      if (nextSelected.has(cid)) {
        nextSelected.delete(cid);
      } else {
        nextSelected.add(cid);
      }
      // Enforce max allowed credits (needCredits + 1), considering corequisites
      if (needCredits) {
        const { credits } = computeSectionSelectionCredits(sec, Array.from(nextSelected));
        const allowed = needCredits + 1;
        if (credits > allowed) {
          // Do not apply the over-selection
          // Optional: flash an inline warning later; for now silently block
          return;
        }
      }
      // Commit the change
      if (set.has(cid)) set.delete(cid); else set.add(cid);
      card.classList.toggle('selected');
      const btn = card.querySelector('.card-check');
      if (btn) btn.setAttribute('aria-pressed', String(set.has(cid)));
      updateNextEnabled();
    };
    card.addEventListener('click', (e) => {
      if (e.target && (e.target.classList.contains('info-btn'))) return; // ignore info click
      toggle();
    });
    const chk = card.querySelector('.card-check');
    if (chk) chk.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  });

  updateNextEnabled();

  // Nav buttons
  const backBtn = document.getElementById('wiz-back');
  const nextBtn = document.getElementById('wiz-next');
  if (backBtn) backBtn.addEventListener('click', () => {
    if (state.electiveIndex > 0) {
      state.electiveIndex -= 1;
      // Moving back means wizard not complete; ensure Generate is disabled again
      const genBtn = document.getElementById('next-btn-constraints');
      if (genBtn) genBtn.disabled = true;
      renderElectivesWizard();
    }
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (state.electiveIndex < state.electiveSections.length - 1) {
      state.electiveIndex += 1;
      renderElectivesWizard();
    } else {
  // Final step: clear the electives list, hide the toolbar, show message, enable sidebar, and enable Generate
      const panel = document.querySelector('.electives-panel');
      const classesWrap = panel ? panel.querySelector('.elective-classes') : null;
      if (classesWrap) {
        classesWrap.innerHTML = '<div class="electives-finish">Elective classes chosen. Next step: Choose constraints and generate schedule</div>';
      }
  const toolbar = panel ? panel.querySelector('.elective-toolbar') : null;
  if (toolbar) toolbar.style.display = 'none';

      // Disable the Next button
      nextBtn.disabled = true;

      // Enable Generate in the sidebar
      const genBtn = document.getElementById('next-btn-constraints');
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.textContent = 'Generate';
        genBtn.onclick = () => generateScheduleFromConstraints();
      }

      // Re-enable Constraints box
  document.querySelector('.constraints-box')?.classList.remove('disabled');
      disableConstraintsControls(false);
    }
  });
}

function disableConstraintsControls(disabled){
  const box = document.querySelector('.constraints-box');
  if (!box) return;
  const controls = box.querySelectorAll('select, input[type="checkbox"], input[type="text"], button');
  controls.forEach(el => {
    // Keep mode toggle buttons active
    if (el.id === 'mode-semester' || el.id === 'mode-credits') return;
    if (el.id === 'export-btn' || el.id === 'next-btn-constraints') return; // sidebar actions handled separately
    el.disabled = !!disabled;
  });
}

async function startElectivesFlow() {
  try {
    // Build or reuse detailed course data (uses current EIL selection too)
    const majorId = state.selected.major?.id || null;
    const minor1Id = state.selected.minor1?.id || null;
    const minor2Id = state.selected.minor2?.id || null;
    if (!majorId || !minor1Id || !minor2Id) {
      alert('Please select a Major and two Minors first.');
      return;
    }
    const eilSel = document.getElementById('eil-level');
    const eilLevel = eilSel ? eilSel.value : 'none';

    // Show a light placeholder while loading sections
    const canvas = document.querySelector('.constraints-canvas');
    if (canvas) canvas.innerHTML = '<div class="canvas-placeholder">Loading electives…</div>';

  state.courseDataCache = await fetchRequiredCourseData(majorId, minor1Id, minor2Id, eilLevel);
  // Build a global class index for credit lookups including corequisites
  state.classIndex = buildClassIndex(state.courseDataCache);
    state.electiveSections = findElectiveSections(state.courseDataCache);
    state.electiveIndex = 0;
    state.chosenElectives = {}; // reset previous choices

    // Change sidebar button to act as Generate but disabled until wizard completes
    const genBtn = document.getElementById('next-btn-constraints');
    if (genBtn) {
      genBtn.textContent = 'Generate';
      genBtn.disabled = true;
      genBtn.onclick = () => {};
    }

    renderElectivesWizard();
  } catch (e) {
    console.error(e);
    alert('Unable to load electives.');
  }
}

// Build a global index of classes by id from all sections and additional classes
function buildClassIndex(courseData) {
  const idx = new Map();
  (courseData || []).forEach(course => {
    (course.sections || []).forEach(sec => {
      (sec.classes || []).forEach(cls => {
        if (cls && (cls.id || cls.id === 0)) idx.set(cls.id, cls);
      });
    });
  });
  return idx;
}

// Compute credits for a set of selected IDs within a section, including required corequisites
function computeSectionSelectionCredits(section, selectedIds) {
  const needCredits = Number(section.credits_needed_to_take) || 0;
  const idx = state.classIndex instanceof Map ? state.classIndex : new Map();
  const visited = new Set();
  const queue = [];
  // Seed with selected IDs
  (selectedIds || []).forEach(id => { if (!visited.has(id)) { visited.add(id); queue.push(id); } });
  // BFS over corequisites
  while (queue.length) {
    const id = queue.shift();
    const cls = idx.get(id);
    if (!cls) continue;
    const coreqs = Array.isArray(cls.corequisites) ? cls.corequisites : [];
    coreqs.forEach(c => {
      const cid = typeof c === 'object' ? c.id : c;
      if (cid != null && !visited.has(cid)) {
        visited.add(cid);
        queue.push(cid);
      }
    });
  }
  // Sum credits (avoid NaN)
  let credits = 0;
  visited.forEach(id => {
    const c = idx.get(id);
    if (c && c.credits != null) credits += Number(c.credits) || 0;
  });
  return { credits, needCredits };
}