// ══════════════════════════════════════════════════════════════════════════
// PAYOUT-REPORT.JS — "Payout" module
//
// Reads from the `payouts` table — records snapshotted once, the moment PDD
// is approved on a case (see snapshotPayoutForCase() in newcar.js). Nothing
// here recomputes the payout amount; that's deliberate, so a later change to
// a bank's payout % never retroactively changes what a past case's payout
// was. This page is purely a viewer + payment-status tracker.
// ══════════════════════════════════════════════════════════════════════════

const payouts = [];
let teamMembers = [];
let currentUserRole = null;

async function loadTeamMembersForPayout() {
  try {
    const { data: members, error } = await db.from('users')
      .select('id,name,role,color,active')
      .eq('active', true)
      .in('role', ['bm','rm']);
    if (error) { console.error('Team members fetch error:', error.message); return; }

    teamMembers = (members || []).map(m => ({ name: m.name, color: m.color || '#1A4F3A', role: m.role }));

    const sel = document.getElementById('payout-member');
    if (sel) {
      sel.innerHTML = '<option value="all">All members</option>' +
        teamMembers.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    }
  } catch(e) {
    console.error('loadTeamMembersForPayout failed:', e.message);
  }
}

async function loadPayouts(user) {
  try {
    let q = db.from('payouts')
      .select('id,case_id,cust_name,bank_name,member_id,member_name,bm_id,disbursed_amount,payout_type,payout_pct,payout_amount,status,paid_at,created_at')
      .order('created_at', { ascending: false });

    if (user.role === 'bm') q = q.or('member_id.eq.' + user.id + ',bm_id.eq.' + user.id);
    else if (user.role === 'rm') q = q.eq('member_id', user.id);

    const { data, error } = await q;
    if (error) { console.error('Payouts fetch error:', error.message); return; }

    payouts.length = 0;
    (data || []).forEach(p => payouts.push(p));

    renderPayoutTable();
    console.log('Payouts loaded:', payouts.length);
  } catch(e) { console.error('loadPayouts error:', e.message); }
}

function getFilteredPayouts() {
  const q      = (document.getElementById('payout-search')?.value || '').toLowerCase().trim();
  const period = document.getElementById('payout-period')?.value || '';
  const member = document.getElementById('payout-member')?.value || 'all';

  let rows = payouts;
  if (member !== 'all') rows = rows.filter(p => p.member_name === member);
  if (period) rows = rows.filter(p => (p.created_at || '').startsWith(period));
  if (q) rows = rows.filter(p => p.case_id.toLowerCase().includes(q) || (p.cust_name || '').toLowerCase().includes(q));
  return rows;
}

const STATUS_BADGE = { pending: 'badge-amber', approved: 'badge-blue', paid: 'badge-green' };

function renderPayoutTable() {
  const rows = getFilteredPayouts();

  document.getElementById('kpi-case-count').textContent      = rows.length;
  document.getElementById('kpi-disbursed-total').textContent = fmt(rows.reduce((s, p) => s + parseFloat(p.disbursed_amount || 0), 0));
  document.getElementById('kpi-payout-total').textContent    = fmt(rows.reduce((s, p) => s + parseFloat(p.payout_amount || 0), 0));

  const tbody = document.getElementById('payout-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state" style="padding:24px"><i class="ti ti-table-off"></i><span>No payouts yet — these appear once a case\'s PDD is approved</span></div></td></tr>';
    return;
  }

  const canManage = currentUserRole === 'bm' || currentUserRole === 'city_head';

  tbody.innerHTML = rows.map(p => {
    const pctLabel = p.payout_type === 'fixed_per_file' ? 'Fixed' : (p.payout_pct != null ? p.payout_pct + '%' : '—');
    const statusBadge = `<span class="badge ${STATUS_BADGE[p.status]||'badge-gray'}">${p.status.charAt(0).toUpperCase()+p.status.slice(1)}</span>`;
    let actionCell = '<span style="font-size:11px;color:var(--muted2)">—</span>';
    if (canManage) {
      if (p.status === 'pending') {
        actionCell = `<button class="btn btn-xs" onclick="markPayoutStatus('${p.id}','approved')">Approve</button>`;
      } else if (p.status === 'approved') {
        actionCell = `<button class="btn btn-xs btn-primary" onclick="markPayoutStatus('${p.id}','paid')">Mark Paid</button>`;
      } else {
        actionCell = `<span style="font-size:11px;color:var(--green-text)"><i class="ti ti-check" style="font-size:10px"></i> ${p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-IN') : 'Paid'}</span>`;
      }
    }
    return `
    <tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${p.case_id}</td>
      <td style="font-weight:500">${p.cust_name || '—'}</td>
      <td>${p.bank_name || '—'}</td>
      <td>${p.member_name || '—'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(p.disbursed_amount)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)">${pctLabel}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:600;color:var(--green-text)">${fmt(p.payout_amount)}</td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap">${actionCell}</td>
    </tr>`;
  }).join('');
}

async function markPayoutStatus(payoutId, newStatus) {
  try {
    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    const payload = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'paid') { payload.paid_at = new Date().toISOString(); payload.paid_by = uid; }

    const { error } = await db.from('payouts').update(payload).eq('id', payoutId);
    if (error) { console.error('markPayoutStatus failed:', error.message); showPayoutFlash('Update failed: ' + error.message, true); return; }

    const p = payouts.find(x => x.id === payoutId);
    if (p) { p.status = newStatus; if (newStatus === 'paid') p.paid_at = payload.paid_at; }

    renderPayoutTable();
    showPayoutFlash('Marked as ' + newStatus);
  } catch(e) {
    console.error('markPayoutStatus error:', e.message);
    showPayoutFlash('Update failed', true);
  }
}

function resetPayoutFilters() {
  document.getElementById('payout-search').value = '';
  document.getElementById('payout-period').value = '';
  document.getElementById('payout-member').value = 'all';
  renderPayoutTable();
}

function exportPayoutCSV() {
  const rows = getFilteredPayouts();
  if (!rows.length) { showPayoutFlash('Nothing to export with current filters', true); return; }

  const header = ['Case ID','Customer','Bank','Member','Disbursed Amount','Payout %','Payout Amount','Status'];
  const lines = [header.join(',')];
  rows.forEach(p => {
    const pctLabel = p.payout_type === 'fixed_per_file' ? 'Fixed' : (p.payout_pct != null ? p.payout_pct + '%' : '—');
    lines.push([
      p.case_id, `"${(p.cust_name||'').replace(/"/g,'""')}"`, `"${(p.bank_name||'').replace(/"/g,'""')}"`,
      `"${(p.member_name||'').replace(/"/g,'""')}"`, p.disbursed_amount, `"${pctLabel}"`, Math.round(p.payout_amount), p.status
    ].join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payout-report-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showPayoutFlash(msg, isError=false) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:${isError?'#B91C1C':'#1A4F3A'};color:white;padding:10px 20px;border-radius:30px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.2)`;
  f.textContent = msg;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2800);
}

function populatePeriodOptions() {
  const sel = document.getElementById('payout-period');
  if (!sel) return;
  const opts = ['<option value="">All time</option>'];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    opts.push(`<option value="${value}">${label}</option>`);
  }
  sel.innerHTML = opts.join('');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  currentUserRole = user.role;
  populatePeriodOptions();
  await loadTeamMembersForPayout();
  await loadPayouts(user);
});
loadIdentity();
