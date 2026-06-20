// ══════════════════════════════════════════════════════════════════════════
// USER-CONFIGURATION.JS — Role-based tab/module access control
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

// ── MUTABLE PERMISSION STATE — what actually gets saved/loaded ──────────────
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
      <td style="padding:10px 14px;font-size:12px;font-weight:600;color:var(--text)">${meta.label}</td>
      <td style="text-align:center;padding:10px 14px">
        <i class="ti ti-check" style="color:var(--accent);font-size:16px;font-weight:700" title="Always enabled"></i>
      </td>
      <td style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${mod.bm?'checked':''}
          onchange="accessConfig['${key}']['bm']=this.checked"
          style="width:16px;height:16px;cursor:pointer;accent-color:#1E40AF">
      </td>
      <td style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${mod.rm?'checked':''}
          onchange="accessConfig['${key}']['rm']=this.checked"
          style="width:16px;height:16px;cursor:pointer;accent-color:#5B21B6">
      </td>
    </tr>`;
  }).join('');
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

async function loadAccessConfig() {
  try {
    const { data } = await db.from('system_settings').select('value').eq('key','role_access_config').single();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      Object.keys(saved).forEach(tab => {
        if (accessConfig[tab]) Object.assign(accessConfig[tab], saved[tab]);
      });
    }
  } catch(e) {
    // Try localStorage fallback
    const local = localStorage.getItem('capri_access_config');
    if (local) {
      const saved = JSON.parse(local);
      Object.keys(saved).forEach(tab => {
        if (accessConfig[tab]) Object.assign(accessConfig[tab], saved[tab]);
      });
    }
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
