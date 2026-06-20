// ══════════════════════════════════════════════════════════════════════════
// PAYOUT-REPORT.JS
// ══════════════════════════════════════════════════════════════════════════

const cases=[];
const caseOrgMap={};
let teamMembers=[]; // populated live by loadTeamMembersForPayout() — no more hardcoded names

// ── LOAD REAL TEAM MEMBERS (replaces hardcoded Anand R / Priya S / Karthik M / Divya L) ──
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

function calcPayout(){
  const member=document.getElementById('payout-member').value;
  const filtered=member==='all'?cases:cases.filter(c=>c.member===member);
  const disbursed=filtered.filter(c=>c.status==='Disbursed'||c.status==='Sanctioned');
  const total=disbursed.reduce((s,c)=>s+c.payout,0);
  const totalLoan=disbursed.reduce((s,c)=>s+c.loan,0);

  document.getElementById('payout-result').innerHTML=`
    <div class="card-title">Payout Summary</div>
    <div class="g2" style="margin-bottom:14px">
      <div class="kpi" style="padding:14px 16px"><div class="kpi-label">Disbursed/Sanctioned</div><div class="kpi-value" style="font-size:24px">${disbursed.length}</div></div>
      <div class="kpi" style="padding:14px 16px;border-color:var(--green-border)"><div class="kpi-label">Total Payout</div><div class="kpi-value" style="font-size:20px;color:var(--green-text)">${fmt(total)}</div></div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Loan book: <strong style="color:var(--text)">${fmt(totalLoan)}</strong></div>
    ${teamMembers.map(m=>{
      const mCases=disbursed.filter(c=>c.member===m.name);
      const mPay=mCases.reduce((s,c)=>s+c.payout,0);
      if(member!=='all'&&m.name!==member)return '';
      if(mCases.length===0)return '';
      return `<div class="payout-row">
        <div class="avatar" style="background:${m.color};width:22px;height:22px;font-size:9px">${initials(m.name)}</div>
        <div class="payout-bank">${m.name} · ${mCases.length} files</div>
        <div class="payout-amt">${fmt(mPay)}</div>
      </div>`;
    }).join('')}
    <div style="margin-top:14px;display:flex;gap:7px">
      <button class="btn btn-primary btn-sm"><i class="ti ti-download" style="font-size:12px"></i> Download statement</button>
      <button class="btn btn-sm"><i class="ti ti-brand-whatsapp" style="font-size:12px"></i> Send via WhatsApp</button>
    </div>
  `;

  document.getElementById('payout-tbody').innerHTML=disbursed.map(c=>{
    let pddCell = '<span style="font-size:11px;color:var(--muted2)">—</span>';
    if (c.status === 'Disbursed') {
      pddCell = c.pddApproved
        ? '<span class="badge badge-green" style="font-size:10px"><i class="ti ti-check" style="font-size:9px"></i> Cleared</span>'
        : '<span class="badge badge-amber" style="font-size:10px"><i class="ti ti-lock" style="font-size:9px"></i> PDD Hold</span>';
    }
    return `<tr>
    <td style="font-family:'DM Mono',monospace;font-size:11px">${c.id}</td>
    <td style="font-weight:500">${c.cust}</td>
    <td>${c.bank}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(c.loan)}</td>
    <td>${c.member}</td>
    <td style="font-family:'DM Mono',monospace;color:var(--green-text);font-weight:600">${fmt(c.payout)}</td>
    <td style="font-family:'DM Mono',monospace;color:var(--muted)">${fmt(Math.round(c.payout*0.6))}</td>
    <td>${pddCell}</td>
    <td><span class="badge ${statusColor(c.status)}">${c.status}</span></td>
  </tr>`;
  }).join('');
}

async function loadLiveCases(user) {
  try {
    // Query the view which already has created_by_name and reporting_to_name
    let q = db.from('cases_with_names')
      .select('id,cust_name,car_model,preferred_bank_name,preferred_bank_id,pdd_approved,loan_amount,status,cibil_score,submitted_at,created_at,payout_amount,created_by,bm_id,cust_mobile,curr_pincode,perm_pincode,inc_net_monthly,emp_type,created_by_name,creator_role,reporting_to_name')
      .neq('status','Draft')
      .order('created_at',{ascending:false});

    if (user.role==='bm') q = q.or('created_by.eq.'+user.id+',bm_id.eq.'+user.id);
    else if (user.role==='rm') q = q.eq('created_by',user.id);

    let { data:liveCases, error } = await q;

    // If preferred_bank_id and/or pdd_approved aren't exposed on this view, retry
    // without them rather than failing the entire cases load — PDD seeding falls
    // back to universal requirements and approval state defaults to false in that case.
    if (error && /preferred_bank_id|pdd_approved/i.test(error.message||'')) {
      console.warn('preferred_bank_id/pdd_approved not available on cases_with_names view, retrying without them:', error.message);
      let q2 = db.from('cases_with_names')
        .select('id,cust_name,car_model,preferred_bank_name,loan_amount,status,cibil_score,submitted_at,created_at,payout_amount,created_by,bm_id,cust_mobile,curr_pincode,perm_pincode,inc_net_monthly,emp_type,created_by_name,creator_role,reporting_to_name')
        .neq('status','Draft')
        .order('created_at',{ascending:false});
      if (user.role==='bm') q2 = q2.or('created_by.eq.'+user.id+',bm_id.eq.'+user.id);
      else if (user.role==='rm') q2 = q2.eq('created_by',user.id);
      const retry = await q2;
      liveCases = retry.data;
      error = retry.error;
    }

    if (error) { console.error('Cases fetch error:', error.message); return; }
    if (!liveCases||!liveCases.length) return;

    const mapped = liveCases.map(c => {
      return {
        id: c.id,
        date: (c.submitted_at||c.created_at||'').slice(0,10),
        cust: c.cust_name||'—',
        car: c.car_model||'—',
        bank: c.preferred_bank_name||'—',
        bankId: c.preferred_bank_id||null,
        pddApproved: c.pdd_approved||false,
        bmId: c.bm_id||null,
        loan: c.loan_amount||0,
        member: c.created_by_name||'—',
        bm: c.reporting_to_name||'—',
        createdByName: c.created_by_name||'—',
        reportsToName: c.reporting_to_name||'—',
        cibil: c.cibil_score||0,
        status: c.status,
        payout: c.payout_amount||0,
        mobile: c.cust_mobile||'',
        pincode: c.curr_pincode||c.perm_pincode||'',
        income: c.inc_net_monthly||0,
        emp: c.emp_type||'',
        isLive: true,
        _raw: c
      };
    });

    // Replace cases array with live only
    cases.length = 0;
    mapped.forEach(c => cases.push(c));

    // Update caseOrgMap
    mapped.forEach(c => { caseOrgMap[c.id] = { bm: c.createdByName, rm: c.reportsToName }; });

    // Update nav badge
    notifyBadgeCount('cases', cases.length);

    // Re-render
    if (typeof applyDashFilters === 'function') applyDashFilters();
    if (typeof renderAllCases === 'function' && document.getElementById('all-cases-tbody')) renderAllCases();

    console.log('Live cases loaded:', mapped.length);
  } catch(e) { console.error('loadLiveCases error:', e.message); }
}

function populateMonthOptions(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(`<option>${d.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</option>`);
  }
  sel.innerHTML = opts.join('');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  populateMonthOptions('report-month-select');
  await loadTeamMembersForPayout();
  await loadLiveCases(user);
});
loadIdentity();
