// ══════════════════════════════════════════════════════════════════════════
// SHARED.JS — loaded by every module page (and the dashboard shell)
// Contains: Supabase client, identity/session loading, sidebar UI sync,
// role-based nav restrictions, and common formatting helpers.
//
// Modules should NOT load their own cases/banks/team data inside this file —
// that stays in each module's own script. This file only handles what is
// truly shared: who is logged in, and how the chrome around them looks.
// ══════════════════════════════════════════════════════════════════════════

const SURL = 'https://oceldpcobqzvqrlbbvvl.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZWxkcGNvYnF6dnFybGJidnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTI1ODksImV4cCI6MjA5NTk4ODU4OX0.ntz3DT6gV2LCcR9fNNGrLdDuxkgLLIIINy_L2Y7cDSQ';
const db = window.supabase.createClient(SURL, SKEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storageKey: 'capri_auth', storage: window.localStorage }
});

// ── COMMON FORMATTERS (used across every module) ─────────────────────────────
const fmt = n => n >= 10000000 ? '₹' + (n / 10000000).toFixed(2) + ' Cr' : n >= 100000 ? '₹' + (n / 100000).toFixed(1) + 'L'
  : '₹' + (n).toLocaleString('en-IN');

const initials = name => (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const statusColor = s => ({
  'Disbursed': 'badge-green', 'Sanctioned': 'badge-green',
  'In process': 'badge-amber', 'Draft': 'badge-gray', 'Rejected': 'badge-red', 'Logged In': 'badge-blue'
}[s] || 'badge-gray');

const cibilColor = s => s >= 740 ? 'var(--green-text)' : s >= 700 ? 'var(--amber-text)' : 'var(--red-text)';

function fmtDate(d) {
  if (!d) return '—';
  const parts = d.slice(0, 10).split('-');
  if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
  return d;
}

function showFlash(msg) {
  const f = document.createElement('div');
  f.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1A4F3A;color:white;padding:10px 20px;border-radius:30px;font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2)';
  f.textContent = msg;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2500);
}

// ── PARENT/IFRAME MESSAGING ──────────────────────────────────────────────────
// Modules run inside the shell's iframe. Use these to talk back to the shell
// (e.g. update a nav badge count) without modules needing to know DOM details
// of the shell itself.
function notifyShell(type, payload) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: 'capri-module', type, payload }, '*');
  }
}

// Modules can call this to update their own nav badge in the shell sidebar.
// e.g. notifyBadgeCount('drafts', 3)
function notifyBadgeCount(navKey, count) {
  notifyShell('badge-update', { navKey, count });
}

// ── IDENTITY + SIDEBAR SYNC ───────────────────────────────────────────────────
// Runs once per page load (shell + every module, since every module also
// shows its own copy of the sidebar/topbar chrome... actually no: only the
// SHELL shows the sidebar. Modules only need `window.currentLoggedInUser`
// and role-based behavior, not sidebar DOM updates. See loadIdentity() below.

window._identityReadyPromise = null;

// Call this once at the top of every module's own script. Resolves once
// window.currentLoggedInUser is populated (or redirects to login if no session).
function loadIdentity() {
  if (window._identityReadyPromise) return window._identityReadyPromise;

  window._identityReadyPromise = (async () => {
    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) { window.location.href = 'capri_login.html'; return null; }

      const { data: user } = await db.from('users')
        .select('id,name,role,color,reports_to,city,monthly_target')
        .eq('id', session.user.id)
        .single();
      if (!user) { window.location.href = 'capri_login.html'; return null; }

      window.currentLoggedInUser = user;
      window.userCity = user.city || 'Chennai';
      window.monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      document.dispatchEvent(new CustomEvent('capri:identityReady', { detail: user }));
      return user;
    } catch (e) {
      console.error('loadIdentity failed:', e.message);
      return null;
    }
  })();

  return window._identityReadyPromise;
}

// ── ROLE-BASED VISIBILITY HELPER ──────────────────────────────────────────────
// Modules can call this with a list of CSS selectors to hide for bm/rm roles,
// matching the same restriction pattern used in the shell's sidebar.
function applyRoleRestrictions(role) {
  const hideForBM = ['Bank Management', 'AI Settings', 'System Settings', 'User Configuration'];
  const hideForRM = ['Bank Management', 'AI Settings', 'System Settings', 'User Configuration', 'Users', 'Team Performance', 'Payout Report', 'Reports'];
  const toHide = role === 'bm' ? hideForBM : role === 'rm' ? hideForRM : [];
  if (!toHide.length) return;
  document.querySelectorAll('[data-role-restrict]').forEach(el => {
    if (toHide.some(t => (el.dataset.roleRestrict || '').includes(t))) el.style.display = 'none';
  });
}
