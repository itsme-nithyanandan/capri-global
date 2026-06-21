// ══════════════════════════════════════════════════════════════════════════
// PAYOUT-REPORT.JS — "Payout" module
//
// Payout amount = disbursed amount × the bank's payout config, full stop.
// Only Disbursed cases are shown — payout isn't real until disbursal happens.
//
//   flat_pct        → disbursed_amount × payout_pct (the bank's "team" %)
//   fixed_per_file  → a flat ₹ amount per file, regardless of loan size
//   slab            → looked up from bank_payout_slabs by disbursed amount
// ══════════════════════════════════════════════════════════════════════════

const cases = [];
let teamMembers = [];
let banksById = {};          // bankId -> { name, payout_type, payout_pct, fixed_payout }
let payoutSlabsByBank = {};  // bankId -> [{ loan_from, loan_to, payout_pct }]

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

async function loadBanksForPayout() {
  try {
    const { data, error } = await db.from('banks').select('id,name,payout_type,payout_pct,fixed_payout').eq('active', true);
    if (error) throw error;
    banksById = {};
    (data || []).forEach(b => { banksById[b.id] = b; });
  } catch(e) {
    console.error('loadBanksForPayout failed:', e.message);
  }

  try {
    const { data, error } = await db.from('bank_payout_slabs').select('bank_id,loan_from,loan_to,payout_pct').eq('active', true);
    if (error) throw error;
    payoutSlabsByBank = {};
    (data || []).forEach(s => {
      if (!payoutSlabsByBank[s.bank_id]) payoutSlabsByBank[s.bank_id] = [];
      payoutSlabsByBank[s.bank_id].push(s);
    });
  } catch(e) {
    console.error('loadPayoutSlabsForPayout failed:', e.message);
  }
}

// Resolves the payout % label and the actual payout amount for one case,
// based on its bank's configured payout_type.
function computePayoutForCase(c) {
  const disbursedAmt = c.disbursedAmount || c.loan || 0;
  const bank = c.bankId ? banksById[c.bankId] : null;

  if (!bank) return { disbursedAmt, pctLabel: 'No bank set', amount: 0 };

  if (bank.payout_type === 'fixed_per_file') {
    const amt = parseFloat(bank.fixed_payout) || 0;
    return { disbursedAmt, pctLabel: 'Fixed ' + fmt(amt), amount: amt };
  }

  if (bank.payout_type === 'slab') {
    const slabs = payoutSlabsByBank[c.bankId] || [];
    const match = slabs.find(s => disbursedAmt >= parseFloat(s.loan_from) && disbursedAmt <= parseFloat(s.loan_to));
    if (!match) return { disbursedAmt, pctLabel: 'No matching slab', amount: 0 };
    const pct = parseFloat(match.payout_pct) || 0;
    return { disbursedAmt, pctLabel: pct + '%', amount: disbursedAmt * pct / 100 };
  }

  // flat_pct (default/fallback)
  const pct = parseFloat(bank.payout_pct) || 0;
  return { disbursedAmt, pctLabel: pct + '%', amount: disbursedAmt * pct / 100 };
}

// Cases only count toward payout once disbursed, PDD-approved, and tied to
// a bank that's still marked Active in Bank Management — an inactive bank
// won't be in banksById at all, since loadBanksForPayout() only fetches
// active ones.
function getFilteredPayoutRows() {
  const q      = (document.getElementById('payout-search')?.value || '').toLowerCase().trim();
  const period = document.getElementById('payout-period')?.value || '';
  const member = document.getElementById('payout-member')?.value || 'all';

  let rows = cases.filter(c => c.status === 'Disbursed' && c.pddApproved && c.bankId && banksById[c.bankId]);

  if (member !== 'all') rows = rows.filter(c => c.member === member);
  if (period) rows = rows.filter(c => (c.disbursedDate || '').startsWith(period));
  if (q) rows = rows.filter(c => c.id.toLowerCase().includes(q) || (c.cust || '').toLowerCase().includes(q));
  return rows;
}

function renderPayoutTable() {
  const rows = getFilteredPayoutRows();
  const computed = rows.map(c => ({ c, p: computePayoutForCase(c) }));

  const caseCount     = computed.length;
  const disbursedTotal = computed.reduce((s, x) => s + x.p.disbursedAmt, 0);
  const payoutTotal    = computed.reduce((s, x) => s + x.p.amount, 0);

  document.getElementById('kpi-case-count').textContent     = caseCount;
  document.getElementById('kpi-disbursed-total').textContent = fmt(disbursedTotal);
  document.getElementById('kpi-payout-total').textContent    = fmt(payoutTotal);

  const tbody = document.getElementById('payout-tbody');
  if (!computed.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state" style="padding:24px"><i class="ti ti-table-off"></i><span>No payable cases — needs Disbursed + PDD approved + an active bank</span></div></td></tr>';
    return;
  }

  tbody.innerHTML = computed.map(({ c, p }) => `
    <tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${c.id}</td>
      <td style="font-weight:500">${c.cust}</td>
      <td>${c.bank}</td>
      <td>${c.member}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(p.disbursedAmt)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)">${p.pctLabel}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:600;color:var(--green-text)">${fmt(p.amount)}</td>
    </tr>`).join('');
}

function resetPayoutFilters() {
  document.getElementById('payout-search').value = '';
  document.getElementById('payout-period').value = '';
  document.getElementById('payout-member').value = 'all';
  renderPayoutTable();
}

function exportPayoutCSV() {
  const rows = getFilteredPayoutRows();

  const computed = rows.map(c => ({ c, p: computePayoutForCase(c) }));
  if (!computed.length) { showPayoutFlash('Nothing to export with current filters', true); return; }

  const header = ['Case ID','Customer','Bank','Member','Disbursed Amount','Payout %','Payout Amount'];
  const lines = [header.join(',')];
  computed.forEach(({ c, p }) => {
    lines.push([
      c.id, `"${(c.cust||'').replace(/"/g,'""')}"`, `"${(c.bank||'').replace(/"/g,'""')}"`, `"${(c.member||'').replace(/"/g,'""')}"`,
      p.disbursedAmt, `"${p.pctLabel}"`, Math.round(p.amount)
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

async function loadLiveCases(user) {
  try {
    let q = db.from('cases_with_names')
      .select('id,cust_name,car_model,preferred_bank_name,preferred_bank_id,loan_amount,disbursed_amount,disbursed_date,pdd_approved,status,created_by,bm_id,created_by_name,reporting_to_name')
      .eq('status', 'Disbursed')
      .order('disbursed_date', { ascending: false });

    if (user.role === 'bm') q = q.or('created_by.eq.' + user.id + ',bm_id.eq.' + user.id);
    else if (user.role === 'rm') q = q.eq('created_by', user.id);

    let { data: liveCases, error } = await q;

    // If disbursed_amount/disbursed_date/preferred_bank_id aren't exposed on
    // this view (stale view definition), retry without them rather than
    // failing entirely — payout just can't be computed for those cases.
    if (error && /disbursed_amount|disbursed_date|preferred_bank_id|pdd_approved/i.test(error.message || '')) {
      console.warn('Some payout columns not available on cases_with_names view, retrying without them:', error.message);
      let q2 = db.from('cases_with_names')
        .select('id,cust_name,car_model,preferred_bank_name,loan_amount,status,created_by,bm_id,created_by_name,reporting_to_name')
        .eq('status', 'Disbursed')
        .order('created_at', { ascending: false });
      if (user.role === 'bm') q2 = q2.or('created_by.eq.' + user.id + ',bm_id.eq.' + user.id);
      else if (user.role === 'rm') q2 = q2.eq('created_by', user.id);
      const retry = await q2;
      liveCases = retry.data;
      error = retry.error;
    }

    if (error) { console.error('Cases fetch error:', error.message); return; }

    const mapped = (liveCases || []).map(c => ({
      id: c.id,
      cust: c.cust_name || '—',
      bank: c.preferred_bank_name || '—',
      bankId: c.preferred_bank_id || null,
      loan: c.loan_amount || 0,
      disbursedAmount: c.disbursed_amount || null,
      disbursedDate: c.disbursed_date || null,
      pddApproved: c.pdd_approved || false,
      member: c.created_by_name || '—',
      status: c.status,
    }));

    cases.length = 0;
    mapped.forEach(c => cases.push(c));

    notifyBadgeCount('cases', cases.length);
    renderPayoutTable();

    console.log('Disbursed cases loaded:', mapped.length);
  } catch(e) { console.error('loadLiveCases error:', e.message); }
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
  populatePeriodOptions();
  await loadTeamMembersForPayout();
  await loadBanksForPayout();
  await loadLiveCases(user);
});
loadIdentity();
