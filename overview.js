// ══════════════════════════════════════════════════════════════════════════
// OVERVIEW.JS — Dashboard KPI landing page
// ══════════════════════════════════════════════════════════════════════════

// ── DATA (loaded fresh by this module) ───────────────────────────────────────
const cases=[];
const caseOrgMap={};

// ── PERIOD PRESETS — fully dynamic based on today's date ─────────────────────
// Indian Financial Year: Apr 1 → Mar 31
function pad2(n){ return String(n).padStart(2,'0'); }
function toISO(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }

function getCurrentFY(){
  const today = new Date();
  const yr    = today.getFullYear();
  const mo    = today.getMonth() + 1; // 1-based
  const fyStart = mo >= 4 ? yr : yr - 1;
  return fyStart;
}

function buildPeriodRanges(){
  const fy  = getCurrentFY();
  const fy2 = fy + 1;
  return {
    fy:  { from: toISO(fy,4,1),  to: toISO(fy2,3,31),  label: `FY ${fy}–${String(fy2).slice(2)} (Full year)` },
    q1:  { from: toISO(fy,4,1),  to: toISO(fy,6,30),   label: `Q1 — Apr–Jun ${fy}` },
    q2:  { from: toISO(fy,7,1),  to: toISO(fy,9,30),   label: `Q2 — Jul–Sep ${fy}` },
    q3:  { from: toISO(fy,10,1), to: toISO(fy,12,31),  label: `Q3 — Oct–Dec ${fy}` },
    q4:  { from: toISO(fy2,1,1), to: toISO(fy2,3,31),  label: `Q4 — Jan–Mar ${fy2}` },
    h1:  { from: toISO(fy,4,1),  to: toISO(fy,9,30),   label: `H1 — Apr–Sep ${fy}` },
    h2:  { from: toISO(fy,10,1), to: toISO(fy2,3,31),  label: `H2 — Oct–Mar ${fy2}` },
  };
}

let PERIOD_RANGES = buildPeriodRanges();

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  await loadOrgHierarchy();
  initOrgFilters();
  initPeriodDropdown();
  await loadLiveCases(user);
});
loadIdentity();

function initPeriodDropdown(){
  PERIOD_RANGES = buildPeriodRanges(); // recompute fresh each time
  const sel = document.getElementById('dash-period-select');

  sel.innerHTML = [
    {value:'',      label: 'Select Period', placeholder:true},
    {value:'today', label: 'Today'},
    {value:'thisweek', label: 'This Week'},
    {value:'lastweek', label: 'Last Week'},
    {value:'',      label: '────────────────', disabled:true},
    {value:'fy',    label: PERIOD_RANGES.fy.label },
    {value:'',      label: '────────────────', disabled:true},
    {value:'q1',    label: PERIOD_RANGES.q1.label },
    {value:'q2',    label: PERIOD_RANGES.q2.label },
    {value:'q3',    label: PERIOD_RANGES.q3.label },
    {value:'q4',    label: PERIOD_RANGES.q4.label },
    {value:'',      label: '────────────────', disabled:true},
    {value:'h1',    label: PERIOD_RANGES.h1.label },
    {value:'h2',    label: PERIOD_RANGES.h2.label },
    {value:'',      label: '────────────────', disabled:true},
    {value:'custom', label: 'Custom Range…' },
  ].map(o=>o.disabled
    ? `<option disabled>${o.label}</option>`
    : o.placeholder
      ? `<option value="" selected disabled>${o.label}</option>`
      : `<option value="${o.value}">${o.label}</option>`
  ).join('');

  // Clear date inputs and hide custom pickers until a period is chosen
  document.getElementById('dash-date-from').value = '';
  document.getElementById('dash-date-to').value   = '';
  document.getElementById('custom-range-wrap').style.display = 'none';
}

function setPeriod(key){
  const customWrap = document.getElementById('custom-range-wrap');

  if(key === 'custom'){
    customWrap.style.display = 'flex';
    applyDashFilters();
    return;
  }

  customWrap.style.display = 'none';

  // Dynamic short-range options
  const now   = new Date();
  const ymd   = d => d.toISOString().slice(0,10);
  const today = ymd(now);

  if(key === 'today'){
    document.getElementById('dash-date-from').value = today;
    document.getElementById('dash-date-to').value   = today;
  } else if(key === 'thisweek'){
    // Week starts Monday
    const day   = now.getDay(); // 0=Sun
    const diff  = (day === 0) ? -6 : 1 - day;
    const mon   = new Date(now); mon.setDate(now.getDate() + diff);
    const sun   = new Date(mon); sun.setDate(mon.getDate() + 6);
    document.getElementById('dash-date-from').value = ymd(mon);
    document.getElementById('dash-date-to').value   = ymd(sun);
  } else if(key === 'lastweek'){
    const day   = now.getDay();
    const diff  = (day === 0) ? -6 : 1 - day;
    const thisMon = new Date(now); thisMon.setDate(now.getDate() + diff);
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
    document.getElementById('dash-date-from').value = ymd(lastMon);
    document.getElementById('dash-date-to').value   = ymd(lastSun);
  } else if(key && PERIOD_RANGES[key]){
    document.getElementById('dash-date-from').value = PERIOD_RANGES[key].from;
    document.getElementById('dash-date-to').value   = PERIOD_RANGES[key].to;
  }

  applyDashFilters();
}

let orgHierarchy = []; // populated live by loadOrgHierarchy() — no more hardcoded BM/RM names

async function loadOrgHierarchy() {
  try {
    const { data: members, error } = await db.from('users')
      .select('id,name,role,color,reports_to')
      .eq('active', true)
      .in('role', ['bm','rm']);
    if (error) { console.error('Org hierarchy fetch error:', error.message); return; }

    const bms = (members || []).filter(m => m.role === 'bm');
    orgHierarchy = bms.map(bm => ({
      bm: { name: bm.name, color: bm.color || '#1A4F3A' },
      rms: (members || []).filter(r => r.role === 'rm' && r.reports_to === bm.id)
        .map(r => ({ name: r.name, color: r.color || '#1E40AF' }))
    }));
  } catch(e) {
    console.error('loadOrgHierarchy failed:', e.message);
  }
}

function initOrgFilters(){
  const bmSel = document.getElementById('dash-bm-filter');
  bmSel.innerHTML = '<option value="">All BMs</option>'
    + orgHierarchy.map(o=>`<option value="${o.bm.name}">${o.bm.name}</option>`).join('');
}

function onBMChange(){
  const bmVal  = document.getElementById('dash-bm-filter').value;
  const rmSel  = document.getElementById('dash-rm-filter');
  if(!bmVal){
    rmSel.innerHTML = '<option value="">— Select BM first —</option>';
    rmSel.disabled  = true;
  } else {
    const group = orgHierarchy.find(o=>o.bm.name===bmVal);
    rmSel.innerHTML = '<option value="">All RMs</option>'
      + (group ? group.rms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('') : '');
    rmSel.disabled = false;
  }
  applyDashFilters();
}

function getFilteredCases(){
  const bank = document.getElementById('dash-bank-filter')?.value || '';
  const bm   = document.getElementById('dash-bm-filter')?.value  || '';
  const rm   = document.getElementById('dash-rm-filter')?.value  || '';
  const from = document.getElementById('dash-date-from')?.value  || '';
  const to   = document.getElementById('dash-date-to')?.value    || '';
  return cases.filter(c=>{
    if(bank && c.bank !== bank) return false;
    const org = caseOrgMap[c.id] || {};
    if(bm && org.bm !== bm) return false;
    if(rm && org.rm !== rm) return false;
    if(from && c.date < from) return false;
    if(to   && c.date > to)   return false;
    return true;
  });
}

function applyDashFilters(){
  const d = getFilteredCases();

  // Active filter count badge
  const bank         = document.getElementById('dash-bank-filter').value;
  const bm           = document.getElementById('dash-bm-filter').value;
  const rm           = document.getElementById('dash-rm-filter').value;
  const activePeriod = document.getElementById('dash-period-select')?.value || '';
  let active = 0;
  if(bank) active++;
  if(bm)   active++;
  if(rm)   active++;
  if(activePeriod && activePeriod !== 'custom') active++;
  const badge = document.getElementById('dash-filter-badge');
  if(active > 0){ badge.style.display='inline-block'; badge.textContent=active+' filter'+(active>1?'s':'')+' active'; }
  else           { badge.style.display='none'; }

  // ── KPI 1: Total Files
  const totalFiles = d.length;
  const totalLoan  = d.reduce((s,c)=>s+c.loan,0);
  document.getElementById('kpi-files').textContent = totalFiles;
  document.getElementById('kpi-files-val').textContent = totalLoan>=10000000
    ? '₹'+( totalLoan/10000000).toFixed(2)+' Cr total value'
    : '₹'+(totalLoan/100000).toFixed(1)+'L total value';

  // ── KPI 2: Logged In
  const loggedIn     = d.filter(c=>c.status==='Logged In');
  const loggedInLoan = loggedIn.reduce((s,c)=>s+c.loan,0);
  const loggedInEl = document.getElementById('kpi-loggedin');
  const loggedInValEl = document.getElementById('kpi-loggedin-val');
  if (loggedInEl) loggedInEl.textContent = loggedIn.length;
  if (loggedInValEl) loggedInValEl.textContent = loggedInLoan>=10000000
    ? '₹'+(loggedInLoan/10000000).toFixed(2)+' Cr pipeline value'
    : '₹'+(loggedInLoan/100000).toFixed(1)+'L pipeline value';

  // ── KPI 3: In Process
  const inProc     = d.filter(c=>c.status==='In process');
  const inProcLoan = inProc.reduce((s,c)=>s+c.loan,0);
  document.getElementById('kpi-inprocess').textContent = inProc.length;
  document.getElementById('kpi-inprocess-val').textContent = inProcLoan>=10000000
    ? '₹'+(inProcLoan/10000000).toFixed(2)+' Cr pipeline value'
    : '₹'+(inProcLoan/100000).toFixed(1)+'L pipeline value';

  // ── KPI 4: Sanctioned (awaiting disbursal)
  const sanc     = d.filter(c=>c.status==='Sanctioned');
  const sancLoan = sanc.reduce((s,c)=>s+c.loan,0);
  document.getElementById('kpi-sanc').textContent = sanc.length;
  document.getElementById('kpi-sanc-val').textContent = sancLoan>=10000000
    ? '₹'+(sancLoan/10000000).toFixed(2)+' Cr pending disbursal'
    : '₹'+(sancLoan/100000).toFixed(1)+'L pending disbursal';
  const sancPct = totalFiles>0 ? Math.round(sanc.length/totalFiles*100) : 0;
  const sancBar = document.getElementById('kpi-sanc-bar');
  if(sancBar) sancBar.style.width = sancPct+'%';

  // ── KPI 4: Disbursements
  const disb     = d.filter(c=>c.status==='Disbursed');
  const disbLoan = disb.reduce((s,c)=>s+c.loan,0);
  document.getElementById('disb-count').textContent = disb.length;
  document.getElementById('disb-amount').textContent = disbLoan>=10000000
    ? '₹'+(disbLoan/10000000).toFixed(2)+' Cr disbursed'
    : '₹'+(disbLoan/100000).toFixed(1)+'L disbursed';

  // ── KPI: PDD Pending — disbursed cases not yet PDD-approved
  const pddPending = disb.filter(c=>!c.pddApproved);
  const pddEl = document.getElementById('kpi-pdd-pending');
  const pddSubEl = document.getElementById('kpi-pdd-pending-sub');
  if (pddEl) pddEl.textContent = pddPending.length;
  if (pddSubEl) pddSubEl.textContent = pddPending.length===0
    ? 'All disbursed cases cleared'
    : pddPending.length+' case'+(pddPending.length!==1?'s':'')+' awaiting documents/approval';

  // ── KPI 5: Rejected
  const rej     = d.filter(c=>c.status==='Rejected');
  const rejLoan = rej.reduce((s,c)=>s+c.loan,0);
  const rejRate = totalFiles>0 ? (rej.length/totalFiles*100).toFixed(1) : '0.0';
  document.getElementById('kpi-rejected').textContent = rej.length;
  document.getElementById('kpi-rejected-val').textContent = rejLoan>=10000000
    ? '₹'+(rejLoan/10000000).toFixed(2)+' Cr declined value'
    : '₹'+(rejLoan/100000).toFixed(1)+'L declined value';
  document.getElementById('kpi-rejected-rate').innerHTML =
    `<i class="ti ti-percentage" style="font-size:11px"></i> ${rejRate}% rejection rate`;

  // ── KPI 6: Payout
  const totalPayout = d.reduce((s,c)=>s+c.payout,0);
  document.getElementById('kpi-payout-val').textContent = totalPayout>=100000
    ? '₹'+(totalPayout/100000).toFixed(2)+'L'
    : '₹'+totalPayout.toLocaleString('en-IN');
  const payoutPct = cases.reduce((s,c)=>s+c.payout,0);
  const ppct = payoutPct>0 ? Math.round(totalPayout/payoutPct*100) : 0;
  const payBar = document.getElementById('kpi-payout-bar');
  if(payBar) payBar.style.width = ppct+'%';

  // Also refresh recent table with filtered data
  renderRecentTableData(d.slice(0,6));
}

function renderRecentTableData(data){
  const rows = (!data||data.length===0)
    ? `<tr><td colspan="7"><div class="empty-state" style="padding:20px"><i class="ti ti-search-off"></i><span>No cases match current filters</span></div></td></tr>`
    : data.map(c=>`<tr onclick="openCase('${c.id}')">
    <td><span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${c.id}</span></td>
    <td style="font-weight:500">${c.cust}</td>
    <td><div style="display:flex;align-items:center;gap:6px">
      <div class="avatar" style="background:${teamMembers.find(m=>m.name===c.member)?.color||'#888'};width:22px;height:22px;font-size:9px">${initials(c.member)}</div>
      <span>${c.member}</span></div></td>
    <td style="font-size:12px">${c.bank}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(c.loan)}</td>
    <td><span class="badge ${statusColor(c.status)}">${c.status}</span></td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green-text);font-weight:600">${c.payout>0?fmt(c.payout):'—'}</td>
  </tr>`).join('');
  const recentTbodyEl = document.getElementById('recent-tbody');
  if (recentTbodyEl) recentTbodyEl.innerHTML = rows;
}

function renderTrendChart(){
  const months=['Dec','Jan','Feb','Mar','Apr','May'];
  const values=[145,162,178,195,213,247];
  const W=420,H=90,pad={t:8,b:28,l:10,r:10};
  const maxV=Math.max(...values);
  const minV=Math.min(...values);
  const range=maxV-minV||1;
  const xs=values.map((_,i)=>pad.l+(i/(values.length-1))*(W-pad.l-pad.r));
  const ys=values.map(v=>pad.t+(1-(v-minV)/range)*(H-pad.t-pad.b));

  const pathD='M'+xs.map((x,i)=>`${x},${ys[i]}`).join(' L');
  const areaD=pathD+` L${xs[xs.length-1]},${H-pad.b} L${xs[0]},${H-pad.b} Z`;

  const html=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:90px">
    <defs>
      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1A4F3A" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#1A4F3A" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#trendGrad)"/>
    <path d="${pathD}" fill="none" stroke="#1A4F3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${xs.map((x,i)=>`
      <circle cx="${x}" cy="${ys[i]}" r="${i===5?4:2.5}" fill="${i===5?'#1A4F3A':'#2E7D52'}" stroke="white" stroke-width="${i===5?'2':'1.5'}"/>
      <text x="${x}" y="${H-4}" text-anchor="middle" fill="#6B6760" font-size="9" font-family="DM Sans">${months[i]}</text>
      ${i===5?`<text x="${x}" y="${ys[i]-9}" text-anchor="middle" fill="#1A4F3A" font-size="9" font-weight="600" font-family="DM Sans">₹${values[i]/100}Cr</text>`:''}
    `).join('')}
  </svg>`;
  const trendWrapEl = document.getElementById('trend-chart-wrap');
  if (trendWrapEl) trendWrapEl.innerHTML=html;
}

function renderTeamSnapshot(){
  const teamSnapEl = document.getElementById('team-snapshot');
  if (!teamSnapEl) return;
  teamSnapEl.innerHTML=teamMembers.map(m=>{
    const pct=Math.round((m.sanctioned/m.target)*100);
    return `<div class="member-row">
      <div class="avatar" style="background:${m.color}">${initials(m.name)}</div>
      <div class="member-info">
        <div class="member-name">${m.name}</div>
        <div class="prog-wrap" style="margin-top:5px;width:120px"><div class="prog-fill" style="width:${pct}%;background:${m.color}"></div></div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${m.sanctioned}/${m.target} target · ${pct}%</div>
      </div>
      <div class="member-stats">
        <div class="stat-item"><div class="stat-val">${m.files}</div><div class="stat-lbl">Files</div></div>
        <div class="stat-item"><div class="stat-val" style="color:var(--green-text)">${m.sanctioned}</div><div class="stat-lbl">Sanct.</div></div>
      </div>
    </div>`;
  }).join('');
}

function renderBankPayoutList(){
  const byBank={};
  cases.forEach(c=>{if(c.payout>0){byBank[c.bank]=(byBank[c.bank]||0)+c.payout;}});
  const sorted=Object.entries(byBank).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const bankPayoutEl = document.getElementById('bank-payout-list');
  if (bankPayoutEl) bankPayoutEl.innerHTML=sorted.map(([bank,amt],i)=>`
    <div class="payout-row">
      <div style="width:20px;height:20px;border-radius:50%;background:${i===0?'var(--accent)':'var(--border2)'};color:${i===0?'white':'var(--muted)'};font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
      <div class="payout-bank">${bank}</div>
      <div class="sparkline">${Array(5).fill(0).map((_,j)=>`<div class="spark-bar" style="height:${Math.random()*18+5}px;background:${i===0?'var(--accent)':'var(--border)'}"></div>`).join('')}</div>
      <div class="payout-amt">${fmt(amt)}</div>
    </div>
  `).join('');
}

// ── RECENT TABLE WRAPPER ──────────────────────────────────────────────────────
function renderRecentTable(){
  renderRecentTableData(cases.slice(0,6));
}

// ── FILTER PANEL TOGGLE ───────────────────────────────────────────────────────
function toggleDashFilters(){
  const panel=document.getElementById('dash-filter-panel');
  const chevron=document.getElementById('filter-chevron');
  const btn=document.getElementById('filter-toggle-btn');
  if(!panel)return;
  const open=panel.style.display!=='none';
  panel.style.display=open?'none':'block';
  if(chevron)chevron.style.transform=open?'rotate(0deg)':'rotate(180deg)';
  if(btn)btn.style.background=open?'var(--surface)':'var(--surface2)';
}
function resetDashFilters(){
  ['dash-bank-filter','dash-bm-filter','dash-rm-filter','dash-period-select'].forEach(id=>{
    const el=document.getElementById(id); if(el)el.value='';
  });
  const cr=document.getElementById('custom-range-wrap');
  if(cr)cr.style.display='none';
  if(typeof applyDashFilters==='function')applyDashFilters();
}

// ── LOAD LIVE CASES (independent copy — this module has its own iframe scope) ──
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
    // Notify the shell to update the All Files nav badge (lives outside this iframe)
    notifyBadgeCount('cases', cases.length);

    // Re-render
    if (typeof applyDashFilters === 'function') applyDashFilters();
    if (typeof renderAllCases === 'function' && document.getElementById('all-cases-tbody')) renderAllCases();

    console.log('Live cases loaded:', mapped.length);
  } catch(e) { console.error('loadLiveCases error:', e.message); }
}
