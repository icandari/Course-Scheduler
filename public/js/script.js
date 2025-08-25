// Minimal JS for UI 1 (searchable dropdowns + distinct Holokai validation)

const state = {
  datasets: { majors: [], minors: [] },
  selected: { major: null, minor1: null, minor2: null } // { id, name, holokai }
};

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

    document.getElementById('next-btn').addEventListener('click', () => {
      // For now, just log selections. In the next step we’ll slide to constraints UI.
      console.log('Selections:', state.selected);
      alert('Great! Next step UI coming next.');
    });
  } catch (e) {
    console.error(e);
    alert('Unable to load course lists.');
  }
});