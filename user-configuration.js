// ══════════════════════════════════════════════════════════════════════════
// USER-CONFIGURATION.JS — Role-based tab/module access control
//
// Backed by the `role_module_access` table (one row per role + module_key),
// not a JSON blob — this is what shared.js's applyRoleRestrictions() reads
// to actually hide/show nav items, via each nav element's data-module-key.
//
// Row order mirrors the actual sidebar nav in dashboard.html (Overview →
// Products → Info). Users/User Configuration themselves are intentionally
// excluded — they're already hardcoded to City Head (+ BM for Users) in the
// nav markup, and letting this table edit its own gatekeeper page risks
// locking everyone out by mistake.
//
// New Car (and General Insurance / Credit Card, once they ship) are
// configured at the module level only — granting a role access to "New Car"
// grants access to all of its sub-tabs (All Files, Drafts, Assigned, PDD).
// There's no separate per-sub-tab toggle.
// ══════════════════════════════════════════════════════════════════════════

// ── STATIC METADATA — labels, derived from dashboard.html's nav order ───────
const MODULE_META = {
  dashboard: { label: 'Dashboard' },
  payout:    { label: 'Payout Report' },
  team:      { label: 'Team Performance' },
  push:      { label: 'Push Notification' },
  newcar:    { label: 'New Car' },
  gi:        { label: 'General Insurance' },
  cc:        { label: 'Credit Card' },
  banks:     { label: 'Bank Management' },
  branches:  { label: 'Branch Directory' },
  reports:   { label: 'Reports' },
  ai:        { label: 'AI Settings' },
  settings:  { label: 'System Settings' },
};

// ── MUTABLE PERMISSION STATE — defaults shown until loadAccessConfig() pulls
// the real values from role_module_access; also the shape saveAccessConfig()
// writes back from. ───────────────────────────────────────────────────────
const accessConfig = {
  dashboard: { city_head:true, bm:true,  rm:true  },
  payout:    { city_head:true, bm:true,  rm:false },
  team:      { city_head:true, bm:true,  rm:false },
  push:      { city_head:true, bm:true,  rm:true  },
  newcar:    { city_head:true, bm:true,  rm:true  },
  gi:        { city_head:true, bm:true,  rm:true  },
  cc:        { city_head:true, bm:true,  rm:true  },
  banks:     { city_head:true, bm:false, rm:false },
  branches:  { city_head:true, bm:true,  rm:true  },
  reports:   { city_head:true, bm:true,  rm:false },
  ai:        { city_head:true, bm:false, rm:false },
  settings:  { city_head:true, bm:false, rm:false },
};

function renderAccessTable() {
  const tbody = document.getElementById('access-table-body');
  if (!tbody) return;

  tbody.innerHTML = Object.entries(MODULE_META).map(([key, meta]) => {
    const mod = accessConfig[key];
    if (!mod) return '';

    return `
    <tr style="border-bottom:1px solid var(--border)">
      <td data-label="Module / Tab" style="padding:10px 14px;font-size:12px;font-weight:600;color:var(--text)">${meta.label}</td>
      <td data-label="City Head" style="text-align:center;padding:10px 14px">
        <i class="ti ti-check" style="color:var(--accent);font-size:16px;font-weight:700" title="Always enabled"></i>
      </td>
      <td data-label="Branch Manager" style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${mod.bm?'checked':''}
          onchange="accessConfig['${key}']['bm']=this.checked"
          style="width:16px;height:16px;cursor:pointer;accent-color:#1E40AF">
      </td>
      <td data-label="Rel. Manager" style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${mod.rm?'checked':''}
          onchange="accessConfig['${key}']['rm']=this.checked"
          style="width:16px;height:16px;cursor:pointer;accent-color:#5B21B6">
      </td>
    </tr>`;
  }).join('');
}

async function saveAccessConfig() {
  try {
    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    const now = new Date().toISOString();
    const rows = [];
    Object.entries(accessConfig).forEach(([moduleKey, roles]) => {
      ['city_head', 'bm', 'rm'].forEach(role => {
        rows.push({ role, module_key: moduleKey, can_access: !!roles[role], updated_by: uid, updated_at: now });
      });
    });

    const { error } = await db.from('role_module_access')
      .upsert(rows, { onConflict: 'role,module_key' });
    if (error) throw error;

    showConfigFlash('Access config saved');
  } catch(e) {
    console.error('saveAccessConfig failed:', e.message);
    showConfigFlash('Save failed: ' + e.message, true);
  }
}

async function loadAccessConfig() {
  try {
    const { data, error } = await db.from('role_module_access').select('role,module_key,can_access');
    if (error) throw error;

    (data || []).forEach(row => {
      const mod = accessConfig[row.module_key];
      if (mod && row.role in mod) mod[row.role] = row.can_access;
    });
  } catch(e) {
    console.error('loadAccessConfig failed:', e.message);
    showConfigFlash('Could not load saved config — showing defaults', true);
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
