// ══════════════════════════════════════════════════════════════════════════
// SHELL.JS — logic specific to dashboard.html (the shell), not shared with modules.
// Handles: sidebar navigation, iframe loading, topbar avatar menu, identity-driven
// chrome updates, and the postMessage bridge for module → shell communication.
// ══════════════════════════════════════════════════════════════════════════

const tabTitles = {
  'overview.html':               ['Dashboard', 'Loading…'],
  'payout-report.html':          ['Payout Report', 'Commission calculation per member'],
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
  'ai-settings.html':            ['AI Settings', 'Provider · model · budget · toggles'],
  'system-settings.html':        ['System Settings', 'Weights · team · configuration'],
};

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function navTo(moduleUrl, el, groupKey) {
  const frame = document.getElementById('module-frame');
  if (frame) frame.src = moduleUrl;

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
  }
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

// ── BUILD TOPBAR AVATAR/NOTIFICATIONS UI ──────────────────────────────────────
function buildTopbarRight() {
  const topbarRight = document.getElementById('topbar-right');
  if (!topbarRight) return;
  topbarRight.innerHTML = `
    <div class="icon-btn" title="Search" style="position:relative"><i class="ti ti-search"></i></div>
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
document.addEventListener('capri:identityReady', (e) => {
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

  applyRoleRestrictions(user.role);
});

// ── MODULE → SHELL MESSAGE BRIDGE ─────────────────────────────────────────────
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.source !== 'capri-module') return;

  if (msg.type === 'badge-update') {
    const { navKey, count } = msg.payload || {};
    const badgeMap = { drafts: 'drafts-nav-badge', cases: 'nav-cases-badge' };
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
