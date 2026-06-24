// ══════════════════════════════════════════════════════════════════════════
// SHELL.JS — logic specific to dashboard.html (the shell), not shared with modules.
// Handles: sidebar navigation, iframe loading, topbar avatar menu, identity-driven
// chrome updates, and the postMessage bridge for module → shell communication.
// ══════════════════════════════════════════════════════════════════════════

const tabTitles = {
  'overview.html':               ['Dashboard', 'Loading…'],
  'payout-report.html':          ['Payout', 'Payout earned on disbursed cases'],
  'team-performance.html':       ['Team Performance', 'Individual targets and actuals'],
  'push-notifications.html':     ['Push Notification', 'Digital lead pipeline'],
  'newcar.html?tab=allfiles':    ['New Car — All Files', 'Complete pipeline view · city head'],
  'newcar.html?tab=drafts':      ['New Car — Drafts', 'Saved cases · resume anytime'],
  'newcar.html?tab=assigned':    ['New Car — Assigned', 'Cases assigned to team members'],
  'newcar.html?tab=pdd':         ['New Car — PDD', 'Post-disbursement document tracker'],
  'general-insurance.html?tab=allfiles': ['General Insurance — All Files', 'Coming soon'],
  'general-insurance.html?tab=drafts':   ['General Insurance — Drafts', 'Coming soon'],
  'general-insurance.html?tab=assigned': ['General Insurance — Assigned', 'Coming soon'],
  'general-insurance.html?tab=pdd':      ['General Insurance — PDD', 'Coming soon'],
  'credit-card.html?tab=allfiles':       ['Credit Card — All Files', 'Coming soon'],
  'credit-card.html?tab=drafts':         ['Credit Card — Drafts', 'Coming soon'],
  'credit-card.html?tab=assigned':       ['Credit Card — Assigned', 'Coming soon'],
  'credit-card.html?tab=pdd':            ['Credit Card — PDD', 'Coming soon'],
  'bank-management.html':        ['Bank Management', 'Add · edit · configure lenders'],
  'branch-directory.html':       ['Branch Directory', 'Empaneled branches + radius settings'],
  'reports.html':                ['Reports', 'Generate and send reports'],
  'users.html':                  ['Users', 'Manage BMs, RMs and access controls'],
  'user-configuration.html':     ['User Configuration', 'Role-based tab and module access'],
  'ai-settings.html':            ['AI Settings', 'Provider · model · budget · toggles'],
  'system-settings.html':        ['System Settings', 'Weights · team · configuration'],
};

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function navTo(moduleUrl, el, groupKey) {
  const frame = document.getElementById('module-frame');
  if (frame) frame.src = moduleUrl;

  // On mobile the sidebar is an overlay drawer — close it after navigating,
  // otherwise it stays open covering the page that was just selected.
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.nav-item, .nav-sub-item').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  // If navigating into a product group's sub-item, make sure that group is open
  // and the top-level group header doesn't also show as "active" simultaneously.
  if (groupKey) {
    document.querySelectorAll('.nav-sub').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.nav-group-header').forEach(h => h.classList.remove('open'));
    const sub = document.getElementById('sub-' + groupKey);
    const hdr = document.querySelector('#grp-' + groupKey + ' .nav-group-header');
    if (sub) sub.classList.add('open');
    if (hdr) hdr.classList.add('open');
  }

  const t = tabTitles[moduleUrl] || ['Dashboard', ''];
  document.getElementById('topbar-title').textContent = t[0];
  document.getElementById('topbar-sub').textContent = t[1];
}

// ── NAV GROUP COLLAPSE/EXPAND ─────────────────────────────────────────────────
function toggleNavGroup(key) {
  const header = document.querySelector('#grp-' + key + ' .nav-group-header');
  const sub = document.getElementById('sub-' + key);
  if (!sub) return;
  const isOpen = sub.classList.contains('open');
  document.querySelectorAll('.nav-sub').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.nav-group-header').forEach(h => h.classList.remove('open'));
  if (!isOpen) {
    sub.classList.add('open');
    if (header) header.classList.add('open');
    // Populate All Files / Drafts / PDD badges the moment the group opens,
    // rather than waiting for each sub-tab to actually be visited at least once.
    if (key === 'newcar') refreshNewCarBadges();
  }
}

function setNavBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

// Queries Supabase directly from the shell (not via the iframe, which may not
// even be loaded yet) so the New Car badges reflect live data as soon as the
// dropdown is opened, independent of which sub-tabs have actually been visited.
async function refreshNewCarBadges() {
  const user = window.currentLoggedInUser;
  if (!user || typeof db === 'undefined') return;

  try {
    let q = db.from('cases_with_names').select('id,status,pdd_approved').neq('status', 'Draft');
    if (user.role === 'bm') q = q.or('created_by.eq.' + user.id + ',bm_id.eq.' + user.id);
    else if (user.role === 'rm') q = q.eq('created_by', user.id);
    const { data: liveCases, error } = await q;
    if (error) { console.error('refreshNewCarBadges cases fetch failed:', error.message); }
    else if (liveCases) {
      setNavBadge('nav-cases-badge', liveCases.length);
      const pddPending = liveCases.filter(c => c.status === 'Disbursed' && !c.pdd_approved).length;
      setNavBadge('pdd-nav-badge', pddPending);
    }
  } catch(e) { console.error('refreshNewCarBadges cases/pdd error:', e.message); }

  try {
    const { data: drafts, error } = await db.from('case_drafts').select('id');
    if (error) { console.error('refreshNewCarBadges drafts fetch failed:', error.message); }
    else if (drafts) setNavBadge('drafts-nav-badge', drafts.length);
  } catch(e) { console.error('refreshNewCarBadges drafts error:', e.message); }
}

// ── MOBILE SIDEBAR ────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

// ── AVATAR DROPDOWN ────────────────────────────────────────────────────────────
function toggleAvatarMenu() {
  const dd = document.getElementById('avatar-dropdown');
  if (!dd) return;
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  const wrap = document.getElementById('avatar-menu-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const dd = document.getElementById('avatar-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

function confirmLogout() {
  if (!confirm('Sign out of Capri Global?')) return;
  db.auth.signOut().finally(() => { window.location.href = 'capri_login.html'; });
}

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
function openChangePasswordModal() {
  document.getElementById('cp-old').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-error').style.display = 'none';
  document.getElementById('change-password-modal').classList.add('open');
}

function closeChangePasswordModal() {
  document.getElementById('change-password-modal').classList.remove('open');
}

async function submitChangePassword() {
  const oldPass     = document.getElementById('cp-old').value;
  const newPass     = document.getElementById('cp-new').value;
  const confirmPass = document.getElementById('cp-confirm').value;
  const errEl       = document.getElementById('cp-error');
  const submitBtn   = document.getElementById('cp-submit-btn');
  const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
  const resetBtn = () => { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="ti ti-check" style="font-size:12px"></i> Change password'; };

  errEl.style.display = 'none';
  if (!oldPass || !newPass || !confirmPass) { showErr('All fields are required'); return; }
  if (newPass.length < 6) { showErr('New password must be at least 6 characters'); return; }
  if (newPass !== confirmPass) { showErr('New password and confirmation do not match'); return; }
  if (newPass === oldPass) { showErr('New password must be different from the current password'); return; }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="ti ti-loader-2" style="font-size:12px"></i> Verifying...';

  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session || !session.user || !session.user.email) {
      showErr('Could not verify your session — please sign in again.');
      resetBtn();
      return;
    }
    const email = session.user.email;

    // Re-authenticate with the OLD password to actually verify it's correct
    // — Supabase's updateUser() would otherwise accept any new password for
    // an already-logged-in session without checking the current one at all.
    const { error: verifyErr } = await db.auth.signInWithPassword({ email, password: oldPass });
    if (verifyErr) {
      showErr('Current password is incorrect');
      resetBtn();
      return;
    }

    submitBtn.innerHTML = '<i class="ti ti-loader-2" style="font-size:12px"></i> Updating...';
    const { error: updateErr } = await db.auth.updateUser({ password: newPass });
    if (updateErr) {
      showErr(updateErr.message || 'Could not update password');
      resetBtn();
      return;
    }

    // Done — sign out and send back to login so they sign in fresh with the new password.
    closeChangePasswordModal();
    await db.auth.signOut();
    window.location.href = 'capri_login.html';
  } catch(e) {
    console.error('submitChangePassword failed:', e.message);
    showErr('Something went wrong — please try again.');
    resetBtn();
  }
}

// ── BUILD TOPBAR AVATAR/NOTIFICATIONS UI ──────────────────────────────────────
function buildTopbarRight() {
  const topbarRight = document.getElementById('topbar-right');
  if (!topbarRight) return;
  topbarRight.innerHTML = `
    <div style="position:relative" id="avatar-menu-wrap">
      <button id="topbar-avatar-btn" onclick="toggleAvatarMenu()"
        style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold-light));border:2px solid rgba(200,168,82,.4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#1A1814;cursor:pointer">··</button>
      <div id="avatar-dropdown">
        <div class="av-user">
          <div class="av-circle" id="dropdown-avatar">··</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)" id="dropdown-name">Loading...</div>
            <div style="font-size:11px;color:var(--muted)" id="dropdown-role">—</div>
          </div>
        </div>
        <div class="av-item" onclick="toggleAvatarMenu()"><i class="ti ti-bell" style="font-size:16px;color:var(--muted)"></i> Notifications <span style="margin-left:auto;background:var(--accent);color:white;font-size:10px;padding:2px 7px;border-radius:10px">3</span></div>
        <div class="av-item" onclick="toggleAvatarMenu();openChangePasswordModal()"><i class="ti ti-key" style="font-size:16px;color:var(--muted)"></i> Change password</div>
        <div style="height:1px;background:var(--border)"></div>
        <div class="av-item danger" onclick="confirmLogout()"><i class="ti ti-logout" style="font-size:16px"></i> Sign out</div>
      </div>
    </div>`;

  const topbarLeft = document.querySelector('.topbar-left');
  if (topbarLeft && !topbarLeft.querySelector('.hamburger')) {
    const ham = document.createElement('button');
    ham.className = 'hamburger';
    ham.innerHTML = '<i class="ti ti-menu-2"></i>';
    ham.onclick = toggleSidebar;
    topbarLeft.prepend(ham);
  }
}

// ── IDENTITY-DRIVEN CHROME UPDATES ────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;

  const userCity = window.userCity || 'Chennai';
  const monthLabel = window.monthLabel || '';
  const roleLabelMap = { city_head: userCity + ' · Full access', bm: 'Branch Manager', rm: 'Relationship Manager' };
  const roleBadgeMap = { city_head: 'City Head', bm: 'Branch Mgr', rm: 'Rel. Mgr' };
  const ini = initials(user.name);

  const brandSubEl = document.getElementById('brand-sub');
  if (brandSubEl) brandSubEl.textContent = userCity + ' Operations';

  const badgeEl = document.getElementById('brand-badge');
  if (badgeEl) badgeEl.innerHTML = '<i class="ti ti-shield-check" style="font-size:10px"></i> ' + (roleBadgeMap[user.role] || user.role);

  const dropName = document.getElementById('dropdown-name');
  const dropRole = document.getElementById('dropdown-role');
  const dropAvatar = document.getElementById('dropdown-avatar');
  const topBtn = document.getElementById('topbar-avatar-btn');
  if (dropName) dropName.textContent = user.name;
  if (dropRole) dropRole.textContent = roleLabelMap[user.role] || user.role;
  if (dropAvatar) dropAvatar.textContent = ini;
  if (topBtn) topBtn.textContent = ini;

  // Default topbar-sub for the overview module (other modules set their own via navTo)
  const overviewSub = document.getElementById('topbar-sub');
  if (overviewSub && tabTitles['overview.html']) {
    tabTitles['overview.html'][1] = monthLabel + ' · ' + userCity + ' Operations';
    if (overviewSub.textContent === 'Loading…') overviewSub.textContent = tabTitles['overview.html'][1];
  }

  await applyRoleRestrictions(user.role);
  document.body.classList.remove('nav-pending');
});

// ── MODULE → SHELL MESSAGE BRIDGE ─────────────────────────────────────────────
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.source !== 'capri-module') return;

  if (msg.type === 'badge-update') {
    const { navKey, count } = msg.payload || {};
    const badgeMap = { drafts: 'drafts-nav-badge', cases: 'nav-cases-badge', pdd: 'pdd-nav-badge' };
    const badgeId = badgeMap[navKey];
    if (!badgeId) return;
    const badge = document.getElementById(badgeId);
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  }
});

// ── INIT ──────────────────────────────────────────────────────────────────────
buildTopbarRight();
loadIdentity();

// Safety net: if identity/permissions resolution never completes for any
// reason (auth hiccup, network issue), don't leave every gated nav item
// hidden forever — reveal them after a few seconds as a fallback. Normal
// loads remove nav-pending well before this ever fires.
setTimeout(() => {
  if (document.body.classList.contains('nav-pending')) {
    console.warn('Role restrictions did not resolve in time — revealing nav as a fallback.');
    document.body.classList.remove('nav-pending');
  }
}, 6000);
