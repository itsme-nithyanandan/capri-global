// ══════════════════════════════════════════════════════════════════════════
// USER-CONFIGURATION.JS — Role-based tab/module access control
//
// Row order mirrors the actual sidebar nav in dashboard.html (Overview →
// Products → Info). Users/User Configuration themselves are intentionally
// excluded — they're already hardcoded to City Head (+ BM for Users) in the
// nav markup, and letting this table edit its own gatekeeper page risks
// locking everyone out by mistake.
//
// New Car is currently the only product with real sub-tabs (All Files /
// Drafts / Assigned / PDD), so it's the only row with a sub-module dropdown.
// General Insurance and Credit Card mirror the same nav structure but are
// still "Coming soon" stubs, so there's nothing real to scope access to yet —
// add a `subtabs` block to their MODULE_META entry here once they ship.
// ══════════════════════════════════════════════════════════════════════════

// ── STATIC METADATA — labels + structure, derived from dashboard.html's nav ──
const MODULE_META = {
  dashboard: { label: 'Dashboard' },
  payout:    { label: 'Payout Report' },
  team:      { label: 'Team Performance' },
  push:      { label: 'Push Notification' },
  newcar:    { label: 'New Car', subtabs: {
    allfiles: 'All Files',
    drafts:   'Drafts',
    assigned: 'Assigned',
    pdd:      'PDD',
  }},
  gi:        { label: 'General Insurance' },
  cc:        { label: 'Credit Card' },
  banks:     { label: 'Bank Management' },
  branches:  { label: 'Branch Directory' },
  reports:   { label: 'Reports' },
  ai:        { label: 'AI Settings' },
  settings:  { label: 'System Settings' },
};

// ── MUTABLE PERMISSION STATE — what actually gets saved/loaded ──────────────
const accessConfig = {
  dashboard: { city_head:true, bm:true,  rm:true  },
  payout:    { city_head:true, bm:true,  rm:false },
  team:      { city_head:true, bm:true,  rm:false },
  push:      { city_head:true, bm:true,  rm:true  },
  newcar:    { city_head:true, bm:true,  rm:true,
    subtabs: {
      allfiles: { city_head:true, bm:true, rm:true  },
      drafts:   { city_head:true, bm:true, rm:true  },
      assigned: { city_head:true, bm:true, rm:false },
      pdd:      { city_head:true, bm:true, rm:false },
    }
  },
  gi:        { city_head:true, bm:true,  rm:true  },
  cc:        { city_head:true, bm:true,  rm:true  },
  banks:     { city_head:true, bm:false, rm:false },
  branches:  { city_head:true, bm:true,  rm:true  },
  reports:   { city_head:true, bm:true,  rm:false },
  ai:        { city_head:true, bm:false, rm:false },
  settings:  { city_head:true, bm:false, rm:false },
};

// Tracks which sub-module (if any) is currently selected in each row's
// dropdown — keyed by module key, value is the sub-tab key or '' for
// "module-level" (the default, showing the module's own permissions).
let activeSubSelection = {};

// Resolves which permission object the row's checkboxes should currently
// read/write — the module itself, or whichever sub-tab is selected.
function targetForRow(moduleKey) {
  const sub = activeSubSelection[moduleKey];
  const mod = accessConfig[moduleKey];
  if (sub && mod.subtabs && mod.subtabs[sub]) return mod.subtabs[sub];
  return mod;
}

function renderAccessTable() {
  const tbody = document.getElementById('access-table-body');
  if (!tbody) return;

  tbody.innerHTML = Object.entries(MODULE_META).map(([key, meta]) => {
    const mod = accessConfig[key];
    if (!mod) return '';
    const target = targetForRow(key);
    const hasSubtabs = !!meta.subtabs;

    const subSelectHtml = hasSubtabs
      ? `<select onchange="onSubModuleChange('${key}', this.value)" style="font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">
          <option value="" ${!activeSubSelection[key] ? 'selected' : ''}>${meta.label} (module)</option>
          ${Object.entries(meta.subtabs).map(([subKey, subLabel]) =>
            `<option value="${subKey}" ${activeSubSelection[key]===subKey?'selected':''}>${subLabel}</option>`
          ).join('')}
        </select>`
      : '<span style="color:var(--muted2);font-size:11px">—</span>';

    return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 14px;font-size:12px;font-weight:600;color:var(--text)">
        ${meta.label}
        ${hasSubtabs ? '<span class="badge badge-blue" style="font-size:9px;margin-left:6px;vertical-align:middle">Has sub-modules</span>' : ''}
      </td>
      <td style="text-align:center;padding:10px 14px">
        <i class="ti ti-check" style="color:var(--accent);font-size:16px;font-weight:700" title="Always enabled"></i>
      </td>
      <td style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${target.bm?'checked':''}
          onchange="onRoleCheckboxChange('${key}','bm',this.checked)"
          style="width:16px;height:16px;cursor:pointer;accent-color:#1E40AF">
      </td>
      <td style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${target.rm?'checked':''}
          onchange="onRoleCheckboxChange('${key}','rm',this.checked)"
          style="width:16px;height:16px;cursor:pointer;accent-color:#5B21B6">
      </td>
      <td style="text-align:center;padding:10px 14px">${subSelectHtml}</td>
    </tr>`;
  }).join('');
}

// Called when a row's sub-module dropdown changes — switches which
// permission object that row's checkboxes are now bound to, and repaints
// so the checkboxes immediately reflect the newly-selected target's state.
function onSubModuleChange(moduleKey, subKey) {
  activeSubSelection[moduleKey] = subKey || null;
  renderAccessTable();
}

// Called from any checkbox — writes straight into whichever permission
// object (module-level or sub-tab-level) is currently active for that row.
function onRoleCheckboxChange(moduleKey, role, checked) {
  const target = targetForRow(moduleKey);
  target[role] = checked;
}

async function saveAccessConfig() {
  try {
    const { error } = await db.from('system_settings')
      .upsert({ key: 'role_access_config', value: JSON.stringify(accessConfig) }, { onConflict: 'key' });
    if (error) throw error;
    showConfigFlash('Access config saved');
  } catch(e) {
    // Fallback to localStorage
    localStorage.setItem('capri_access_config', JSON.stringify(accessConfig));
    showConfigFlash('Saved locally');
  }
}

// Deep-enough merge: copies module-level booleans, and if the saved row has
// a `subtabs` block (currently only New Car), merges each sub-tab's booleans
// too rather than letting Object.assign silently replace the whole nested
// object with whatever shape happened to be saved.
function mergeAccessConfig(saved) {
  Object.keys(saved || {}).forEach(key => {
    const current = accessConfig[key];
    const savedMod = saved[key];
    if (!current || !savedMod) return;

    Object.assign(current, { city_head: savedMod.city_head, bm: savedMod.bm, rm: savedMod.rm });

    if (current.subtabs && savedMod.subtabs) {
      Object.keys(savedMod.subtabs).forEach(subKey => {
        if (current.subtabs[subKey]) Object.assign(current.subtabs[subKey], savedMod.subtabs[subKey]);
      });
    }
  });
}

async function loadAccessConfig() {
  try {
    const { data } = await db.from('system_settings').select('value').eq('key','role_access_config').single();
    if (data?.value) mergeAccessConfig(JSON.parse(data.value));
  } catch(e) {
    // Try localStorage fallback
    try {
      const local = localStorage.getItem('capri_access_config');
      if (local) mergeAccessConfig(JSON.parse(local));
    } catch(e2) { /* ignore — keep defaults */ }
  }
}

function showConfigFlash(msg, isError=false) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${isError?'#B91C1C':'#1A4F3A'};color:white;padding:10px 20px;border-radius:30px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.2)`;
  f.textContent = msg;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2800);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  try {
    renderAccessTable();
    await loadAccessConfig();
    renderAccessTable();
  } catch(err) {
    console.error('Role access table init failed:', err.message);
  }
});
loadIdentity();
