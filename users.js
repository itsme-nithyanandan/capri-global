// ══════════════════════════════════════════════════════════════════════════
// USERS.JS — User management, roles, and tab access control
// ══════════════════════════════════════════════════════════════════════════

// ── ROLE ACCESS CONFIG ─────────────────────────────────────────────────────────
const accessConfig = {
  dashboard: { city_head:true, bm:true, rm:true },
  cases:     { city_head:true, bm:true, rm:true },
  team:      { city_head:true, bm:true, rm:false },
  members:   { city_head:true, bm:true, rm:false },
  rto:       { city_head:true, bm:true, rm:false },
  payout:    { city_head:true, bm:true, rm:false },
  reports:   { city_head:true, bm:true, rm:false },
  banks:     { city_head:true, bm:false, rm:false },
  branches:  { city_head:true, bm:true, rm:false },
  ai:        { city_head:true, bm:false, rm:false },
  settings:  { city_head:true, bm:false, rm:false },
};

function renderAccessTable() {
  const tbody = document.getElementById('access-table-body');
  if (!tbody) return;
  tbody.innerHTML = Object.entries(accessConfig).map(([tab, roles]) => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 14px;font-size:12px;font-weight:600;color:var(--text)">${tabLabels[tab]||tab}</td>
      <td style="text-align:center;padding:10px 14px">
        <i class="ti ti-check" style="color:var(--accent);font-size:16px;font-weight:700" title="Always enabled"></i>
      </td>
      <td style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${roles['bm']?'checked':''}
          onchange="accessConfig['${tab}']['bm']=this.checked"
          style="width:16px;height:16px;cursor:pointer;accent-color:#1E40AF">
      </td>
      <td style="text-align:center;padding:10px 14px">
        <input type="checkbox" ${roles['rm']?'checked':''}
          onchange="accessConfig['${tab}']['rm']=this.checked"
          style="width:16px;height:16px;cursor:pointer;accent-color:#5B21B6">
      </td>
    </tr>`).join('');
}

async function saveAccessConfig() {
  try {
    const { error } = await db.from('system_settings')
      .upsert({ key: 'role_access_config', value: JSON.stringify(accessConfig) }, { onConflict: 'key' });
    if (error) throw error;
    showUsersFlash('Access config saved');
  } catch(e) {
    // Fallback to localStorage
    localStorage.setItem('capri_access_config', JSON.stringify(accessConfig));
    showUsersFlash('Saved locally');
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

function showUsersFlash(msg, isError=false) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${isError?'#B91C1C':'#1A4F3A'};color:white;padding:10px 20px;border-radius:30px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.2)`;
  f.textContent = msg;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2800);
}

// ── USERS LIST ────────────────────────────────────────────────────────────────
async function loadUsersTab() {
  const container = document.getElementById('users-list-container');
  if (!container) return;
  try {
    const { data: users, error } = await db.from('users')
      .select('id,name,email,phone,role,reports_to,monthly_target,ai_access,active')
      .order('role').order('name');

    if (error) throw error;

    // Group by role
    const groups = { city_head:[], bm:[], rm:[] };
    users.forEach(u => { if(groups[u.role]) groups[u.role].push(u); });

    const roleLabel = { city_head:'City Head', bm:'Branch Managers', rm:'Relationship Managers' };
    const roleColor = { city_head:'var(--accent)', bm:'#1E40AF', rm:'#5B21B6' };
    const roleBadge = { city_head:'badge-green', bm:'badge-blue', rm:'badge-purple' };

    const reportsToMap = {};
    users.forEach(u => { reportsToMap[u.id] = u.name; });
    const allMembers = [...groups.city_head, ...groups.bm, ...groups.rm];
    
    container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:var(--surface2);border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Name</th>
          <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Role</th>
          <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Email</th>
          <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Phone</th>
          <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Reports To</th>
          <th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Status</th>
          <th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Action</th>
        </tr>
      </thead>
      <tbody>
        ${allMembers.map(u => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px 14px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:32px;height:32px;border-radius:50%;background:${roleColor[u.role]};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0">
                ${u.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <span style="font-weight:600">${u.name}</span>
            </div>
          </td>
          <td style="padding:10px 14px"><span class="badge ${roleBadge[u.role]}">${roleLabel[u.role]}</span></td>
          <td style="padding:10px 14px;color:var(--muted);font-size:12px">${u.email}</td>
          <td style="padding:10px 14px;color:var(--muted);font-size:12px">${u.phone||'—'}</td>
          <td style="padding:10px 14px;font-size:12px">${u.reports_to&&reportsToMap[u.reports_to]?reportsToMap[u.reports_to]:'—'}</td>
          <td style="padding:10px 14px;text-align:center">
            <span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'Active':'Inactive'}</span>
          </td>
          <td style="padding:10px 14px;text-align:center;white-space:nowrap">
            <button class="btn btn-sm" onclick="openEditUserModal('${u.id}')"><i class="ti ti-edit" style="font-size:12px"></i> Edit</button>
            <button class="btn btn-sm" onclick="toggleUserActive('${u.id}',${u.active})" style="margin-left:4px">
              <i class="ti ti-${u.active?'user-off':'user-check'}" style="font-size:12px"></i> ${u.active?'Deactivate':'Activate'}
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
    renderAccessTable();
  } catch(e) {
    container.innerHTML = `<div style="color:var(--red-text);padding:20px">Error loading users: ${e.message}</div>`;
  }
}

// ── USER MODAL (Add/Edit) ─────────────────────────────────────────────────────
let editingUserId = null;

async function openUserModal() {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('um-name').value = '';
  document.getElementById('um-email').value = '';
  document.getElementById('um-phone').value = '';
  document.getElementById('um-role').value = '';
  const pwEl = document.getElementById('um-password');
  if (pwEl) pwEl.value = '';
  document.getElementById('um-password-wrap').style.display = 'block';
  document.getElementById('um-reports-wrap').style.display = 'none';
  document.getElementById('um-error').style.display = 'none';
  document.getElementById('um-save-btn').textContent = 'Create user';
  document.getElementById('user-modal-overlay').style.display = 'flex';
}

async function openEditUserModal(userId) {
  editingUserId = userId;
  const { data: u } = await db.from('users').select('*').eq('id', userId).single();
  if (!u) return;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('um-name').value = u.name;
  document.getElementById('um-email').value = u.email;
  document.getElementById('um-phone').value = u.phone || '';
  document.getElementById('um-role').value = u.role;
  document.getElementById('um-password-wrap').style.display = 'none';
  document.getElementById('um-error').style.display = 'none';
  document.getElementById('um-save-btn').textContent = 'Save changes';
  await onUserRoleChange(u.reports_to);
  document.getElementById('user-modal-overlay').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('user-modal-overlay').style.display = 'none';
}

async function onUserRoleChange(selectedReportsTo) {
  const role = document.getElementById('um-role').value;
  const wrap = document.getElementById('um-reports-wrap');
  const sel = document.getElementById('um-reports-to');
  if (role === 'rm' || role === 'bm') {
    wrap.style.display = 'block';
    const targetRole = role === 'rm' ? 'bm' : 'city_head';
    const { data: managers } = await db.from('users').select('id,name').eq('role', targetRole);
    sel.innerHTML = '<option value="">Select manager</option>' +
      (managers||[]).map(m => `<option value="${m.id}" ${selectedReportsTo===m.id?'selected':''}>${m.name}</option>`).join('');
  } else {
    wrap.style.display = 'none';
  }
}

async function saveUser() {
  const btn = document.getElementById('um-save-btn');
  const errEl = document.getElementById('um-error');
  const name = document.getElementById('um-name').value.trim();
  const email = document.getElementById('um-email').value.trim();
  const phone = document.getElementById('um-phone').value.trim();
  const role = document.getElementById('um-role').value;
  const reportsTo = document.getElementById('um-reports-to').value || null;

  if (!name || !email || !role) {
    errEl.textContent = 'Name, email and role are required';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';
  errEl.style.display = 'none';

  try {
    if (editingUserId) {
      // Edit existing user
      const { error } = await db.from('users').update({
        name, email, phone: phone||null, role, reports_to: reportsTo
      }).eq('id', editingUserId);
      if (error) throw error;
      showUsersFlash('User updated successfully');
    } else {
      const password = document.getElementById('um-password').value;
      if (!password || password.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create user';
        return;
      }

      // Step 1: Create auth user via Admin API using service role key
      const adminRes = await fetch('https://oceldpcobqzvqrlbbvvl.supabase.co/auth/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZWxkcGNvYnF6dnFybGJidnZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxMjU4OSwiZXhwIjoyMDk1OTg4NTg5fQ.j2uqXCRShoeG9fRdyX-9a6-SNrCsv9ZvvQTV7LNXjc8',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZWxkcGNvYnF6dnFybGJidnZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxMjU4OSwiZXhwIjoyMDk1OTg4NTg5fQ.j2uqXCRShoeG9fRdyX-9a6-SNrCsv9ZvvQTV7LNXjc8'
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true
        })
      });

      const adminData = await adminRes.json();
      if (!adminRes.ok) {
        throw new Error(adminData.message || adminData.msg || 'Failed to create auth user');
      }

      const authUid = adminData.id;

      // Step 2: Insert into users table with the auth UID
      const { error } = await db.from('users').insert({
        id: authUid,
        name, email, phone: phone||null, role, reports_to: reportsTo,
        monthly_target: role==='city_head'?0:8,
        ai_access: true, active: true
      });
      if (error) throw error;
      showUsersFlash('User created — ' + name + ' can now log in');
    }
    closeUserModal();
    await loadUsersTab();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = editingUserId ? 'Save changes' : 'Create user';
}

async function toggleUserActive(userId, currentActive) {
  await db.from('users').update({ active: !currentActive }).eq('id', userId);
  showUsersFlash(currentActive ? 'User deactivated' : 'User activated');
  await loadUsersTab();
}


// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  renderAccessTable();
  await loadAccessConfig();
  renderAccessTable();
  await loadUsersTab();
});
loadIdentity();
