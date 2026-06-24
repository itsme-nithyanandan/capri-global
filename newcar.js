// ══════════════════════════════════════════════════════════════════════════
// NEWCAR.JS — All Files, Drafts, Assigned, PDD for the New Car product
// ══════════════════════════════════════════════════════════════════════════

// ── INTERNAL TAB SWITCHING (All Files / Drafts / Assigned / PDD) ─────────────
const NC_TAB_MAP = { allfiles: 'cases', drafts: 'drafts', assigned: 'assigned', pdd: 'pdd' };

function showNewCarTab(urlTab) {
  const tab = NC_TAB_MAP[urlTab] || 'cases';
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('on'));
  const pane = document.getElementById('tab-' + tab);
  if (pane) pane.classList.add('on');

  if (tab === 'drafts') loadDrafts();
  if (tab === 'pdd') loadPDDQueue();

  // Reflect in URL so reload/deep-link keeps the right tab open
  const url = new URL(window.location);
  url.searchParams.set('tab', urlTab);
  window.history.replaceState({}, '', url);
}

// ── NEW CASE / EDIT CASE FORM OVERLAY ──────────────────────────────────────────
function openFormPage() {
  document.getElementById('form-iframe').src = 'capri_customer_form.html?embedded=1&t=' + Date.now();
  document.getElementById('form-fullpage').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeFormPage() {
  document.getElementById('form-fullpage').classList.remove('open');
  document.body.style.overflow = '';
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;

  // Open the tab requested via ?tab= (defaults to All Files)
  const requestedTab = new URLSearchParams(window.location.search).get('tab') || 'allfiles';
  showNewCarTab(requestedTab);

  await loadOrgHierarchy();
  await loadLiveCases(user);
});
loadIdentity();

// ── CORE DATA ─────────────────────────────────────────────────────────────────
const cases=[];
window.cases = cases; // expose globally — top-level const does NOT auto-attach to window
const caseOrgMap={}; // legacy — always empty, kept for renderAllCases fallback compatibility

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

    // Populate the All Files BM filter dropdown with real names
    const bmSel = document.getElementById('cases-bm-filter');
    if (bmSel) {
      bmSel.innerHTML = '<option value="">All BMs</option>'
        + orgHierarchy.map(o => `<option>${o.bm.name}</option>`).join('');
    }
  } catch(e) {
    console.error('loadOrgHierarchy failed:', e.message);
  }
}

const docTypeMeta = {
  pan:     {label:'PAN',      icon:'ti-id',             color:'#1E40AF'},
  aadhaar: {label:'Aadhaar',  icon:'ti-id-badge-2',     color:'#0F766E'},
  dl:      {label:'DL',       icon:'ti-car',            color:'#7C3AED'},
  salary:  {label:'Salary',   icon:'ti-cash',           color:'#1A4F3A'},
  bank:    {label:'Bank Stmt',icon:'ti-building-bank',  color:'#5B21B6'},
  form16:  {label:'Form 16',  icon:'ti-file-invoice',   color:'#B45309'},
  cic:     {label:'CIBIL',    icon:'ti-chart-bar',      color:'#B21C1C'},
  itr:     {label:'ITR',      icon:'ti-receipt-2',      color:'#8B4A0C'},
  invoice: {label:'Invoice',  icon:'ti-file-text',      color:'#0E7490'},
  other:   {label:'Other',    icon:'ti-file',           color:'#6B6760'},
};

// ── ALL FILES TAB ─────────────────────────────────────────────────────────────
function renderAllCases(data){
  const d=data||cases;
  // Update loan total
  const loanTotal = d.reduce((sum,c) => sum + (parseFloat(c.loan)||0), 0);
  const loanTotalEl = document.getElementById('cases-loan-total');
  if (loanTotalEl) loanTotalEl.textContent = fmt(loanTotal);
  document.getElementById('cases-count').textContent=`${d.length} case${d.length!==1?'s':''}`;
  document.getElementById('all-cases-tbody').innerHTML=d.length===0
    ?`<tr><td colspan="12"><div class="empty-state" style="padding:28px"><i class="ti ti-search-off"></i><span>No cases match your filters</span></div></td></tr>`
    :d.map(c=>{
      const org=caseOrgMap[c.id]||{bm:'—',rm:'—'};
      return `<tr>
      <td data-label="Case ID"><span style="font-family:'DM Mono',monospace;font-size:11px">${c.id}</span></td>
      <td data-label="Date" style="font-size:11px;color:var(--muted)">${fmtDate(c.date)}</td>
      <td data-label="Customer" style="font-weight:500">${c.cust}</td>
      <td data-label="Car" style="font-size:12px;color:var(--muted)">${c.car}</td>
      <td data-label="Bank" style="font-size:12.5px">${c.bank}</td>
      <td data-label="Loan (₹)" style="font-family:'DM Mono',monospace;font-size:12px">${fmt(c.loan)}</td>
      <td data-label="Created By" style="font-size:12px;font-weight:500">${c.createdByName||org.bm||'—'}</td>
      <td data-label="Reporting To" style="font-size:12px;color:var(--muted)">${c.reportsToName||org.rm||'—'}</td>
      <td data-label="CIBIL" style="font-family:'DM Mono',monospace;font-size:12px;color:${cibilColor(c.cibil)}">${c.cibil}</td>
      <td data-label="Status"><span class="badge ${statusColor(c.status)}">${c.status}</span></td>
      <td data-label="Payout" style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green-text);font-weight:600">${c.payout>0?fmt(c.payout):'—'}</td>
      <td data-label="Action" style="white-space:nowrap">
        <button class="btn btn-sm" onclick="openCaseDetailModal('${c.id}')"><i class="ti ti-eye" style="font-size:11px"></i> View</button>
        ${c.status !== 'Disbursed' ? `<button class="btn btn-sm" style="margin-left:4px" onclick="openCaseActionMenu(event,'${c.id}')"><i class="ti ti-edit" style="font-size:11px"></i> Edit</button>` : ''}
      </td>
    </tr>`;
    }).join('');

  // Mobile cards — deliberately just the fields that matter at a glance
  // (Case ID, Customer, Loan, Bank, Status); every action the table offers
  // stays available as a full-width button, nothing is dropped.
  const mlist = document.getElementById('all-cases-mlist');
  if (mlist) {
    mlist.innerHTML = d.length===0
      ? `<div class="mlist-empty"><i class="ti ti-search-off"></i><span>No cases match your filters</span></div>`
      : d.map(c => `
      <div class="mlist-card">
        <div class="mlist-top">
          <span class="mlist-id">${c.id}</span>
          <span class="badge ${statusColor(c.status)}">${c.status}</span>
        </div>
        <div class="mlist-title">${c.cust} <span style="color:var(--muted);font-weight:400;font-size:13px">· ${c.car}</span></div>
        <div class="mlist-meta" style="justify-content:space-between">
          <span><b>${fmt(c.loan)}</b></span>
          <span><b>${c.bank}</b></span>
        </div>
        <div class="mlist-actions">
          <button class="btn btn-sm" onclick="openCaseDetailModal('${c.id}')"><i class="ti ti-eye" style="font-size:11px"></i> View</button>
          ${c.status !== 'Disbursed' ? `<button class="btn btn-sm" onclick="openCaseActionMenu(event,'${c.id}')"><i class="ti ti-edit" style="font-size:11px"></i> Edit</button>` : ''}
        </div>
      </div>`).join('');
  }
}

function filterCases(){
  const search =(document.getElementById('cases-search')?.value||'').toLowerCase();
  const bm     = document.getElementById('cases-bm-filter')?.value||'';
  const rm     = document.getElementById('cases-rm-filter')?.value||'';
  const status = document.getElementById('cases-status-filter')?.value||'';
  const bank   = document.getElementById('cases-bank-filter')?.value||'';
  const from   = document.getElementById('cases-date-from')?.value||'';
  const to     = document.getElementById('cases-date-to')?.value||'';
  const filtered=cases.filter(c=>{
    const org=caseOrgMap[c.id]||{};
    // BM filter: show cases created by that BM + cases created by RMs under that BM
    if(bm && c.createdByName!==bm && c.reportsToName!==bm) return false;
    if(rm && c.createdByName!==rm) return false;
    if(status && c.status!==status) return false;
    if(bank   && c.bank!==bank)  return false;
    if(from   && c.date<from)    return false;
    if(to     && c.date>to)      return false;
    if(search && !c.cust.toLowerCase().includes(search)&&!c.id.toLowerCase().includes(search)) return false;
    return true;
  });
  renderAllCases(filtered);
}

function onCasesBMChange(){
  const bmVal = document.getElementById('cases-bm-filter').value;
  const rmSel = document.getElementById('cases-rm-filter');
  if(!bmVal){
    rmSel.innerHTML='<option value="">— Select BM first —</option>';
    rmSel.disabled=true;
  } else {
    const group=orgHierarchy.find(o=>o.bm.name===bmVal);
    rmSel.innerHTML='<option value="">All RMs</option>'+(group?group.rms.map(r=>`<option>${r.name}</option>`).join(''):'');
    rmSel.disabled=false;
  }
  filterCases();
}

function onCasesPeriodChange(){
  const key=document.getElementById('cases-period-filter').value;
  const wrap=document.getElementById('cases-custom-range');
  if(key==='custom'){wrap.style.display='flex';filterCases();return;}
  wrap.style.display='none';
  const now=new Date();const ymd=d=>d.toISOString().slice(0,10);const today=ymd(now);
  if(key==='today'){
    document.getElementById('cases-date-from').value=today;
    document.getElementById('cases-date-to').value=today;
  } else if(key==='thisweek'){
    const day=now.getDay();const diff=day===0?-6:1-day;
    const mon=new Date(now);mon.setDate(now.getDate()+diff);
    const sun=new Date(mon);sun.setDate(mon.getDate()+6);
    document.getElementById('cases-date-from').value=ymd(mon);
    document.getElementById('cases-date-to').value=ymd(sun);
  } else if(key==='lastweek'){
    const day=now.getDay();const diff=day===0?-6:1-day;
    const thisMon=new Date(now);thisMon.setDate(now.getDate()+diff);
    const lastMon=new Date(thisMon);lastMon.setDate(thisMon.getDate()-7);
    const lastSun=new Date(lastMon);lastSun.setDate(lastMon.getDate()+6);
    document.getElementById('cases-date-from').value=ymd(lastMon);
    document.getElementById('cases-date-to').value=ymd(lastSun);
  } else if(PERIOD_RANGES[key]){
    document.getElementById('cases-date-from').value=PERIOD_RANGES[key].from;
    document.getElementById('cases-date-to').value=PERIOD_RANGES[key].to;
  }
  filterCases();
}

// On mobile, search collapses to just an icon by default so the filter
// button and the case-count/loan-total never get squeezed off-screen.
// Tapping it swaps the row to show the full input instead; desktop is
// unaffected since these toggles only show via the mobile media query.
function expandMobileSearch() {
  document.getElementById('cases-filter-btn').style.display = 'none';
  document.getElementById('cases-search-toggle').style.display = 'none';
  document.getElementById('cases-count-wrap').style.display = 'none';
  const input = document.getElementById('cases-search');
  input.style.setProperty('display', 'block', 'important');
  input.style.maxWidth = 'none';
  document.getElementById('cases-search-close').style.display = 'flex';
  input.focus();
}

function collapseMobileSearch() {
  document.getElementById('cases-filter-btn').style.display = '';
  document.getElementById('cases-search-toggle').style.display = '';
  document.getElementById('cases-count-wrap').style.display = '';
  const input = document.getElementById('cases-search');
  input.style.display = '';
  input.style.maxWidth = '';
  document.getElementById('cases-search-close').style.display = 'none';
  input.value = '';
  filterCases();
}

function toggleCasesFilter() {
  const panel   = document.getElementById('cases-filter-panel');
  const chevron = document.getElementById('cases-filter-chevron');
  const btn     = document.getElementById('cases-filter-btn');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
  if (btn) btn.style.background = open ? 'var(--surface)' : 'var(--surface2)';
}

function resetCasesFilter() {
  ['cases-bm-filter','cases-rm-filter','cases-status-filter','cases-bank-filter','cases-period-filter','cases-search'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const cr = document.getElementById('cases-custom-range');
  if (cr) cr.style.display = 'none';
  if (typeof filterCases === 'function') filterCases();
}

// ── CASE DETAIL MODAL ─────────────────────────────────────────────────────────
function openCaseDetailModal(id){ window._currentCaseId = id; caseEditMode = false; const editBtn = document.getElementById("detail-edit-btn"); if(editBtn){editBtn.innerHTML='<i class="ti ti-edit" style="font-size:12px"></i> Edit';editBtn.style.background='';}
  const c=cases.find(x=>x.id===id);if(!c)return;
  document.getElementById('cdm-case-id').textContent='Case '+c.id;
  document.getElementById('cdm-case-sub').textContent=c.status+' · '+c.date;
  document.querySelectorAll('.wide-modal .itab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('case-detail-modal').classList.add('open');

  // Fetch the FULL case row (the list view only has a subset of columns) so the
  // Basic Info / Loan tabs can show real data instead of placeholders.
  db.from('cases').select('*').eq('id', id).single().then(({data, error}) => {
    if (error) { console.error('Full case fetch error:', error.message); c._full = null; }
    else { c._full = data; }
    renderCDMTab('basic', c);
  });

  // Render immediately with what we have while the full fetch is in flight
  renderCDMTab('basic',c);
}

function closeCaseDetailModal(){document.getElementById('case-detail-modal').classList.remove('open');}

function switchCDMTab(tab,el){
  document.querySelectorAll('.wide-modal .itab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const id=document.getElementById('cdm-case-id').textContent.replace('Case ','');
  const c=cases.find(x=>x.id===id);
  renderCDMTab(tab,c);
}

function renderCDMTab(tab,c){
  const body=document.getElementById('cdm-body');
  const f = c._full || {}; // full row from `cases` table, may not be loaded yet
  const dash = v => (v===null||v===undefined||v==='') ? '—' : v;
  const fmtDOB = d => {
    if (!d) return '—';
    try {
      let dt;
      if (typeof d === 'string' && d.includes('/')) {
        // Form stores DOB as literal "DD/MM/YYYY" text, not an ISO date.
        const [day, month, year] = d.split('/').map(Number);
        if (!day || !month || !year) return d; // incomplete entry, show as-is
        dt = new Date(year, month - 1, day);
      } else {
        dt = new Date(d); // ISO string or Date object
      }
      if (isNaN(dt.getTime())) return d; // could not parse, show raw value rather than "Invalid Date"
      return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    } catch(e) { return d; }
  };
  const titleCase = s => !s ? '—' : s.replace(/_/g,' ').replace(/\b\w/g, ch => ch.toUpperCase());

  if(tab==='basic'){
    const fullAddr = [f.curr_addr1, f.curr_addr2, f.curr_city, f.curr_state, f.curr_pincode].filter(Boolean).join(', ') || '—';
    body.innerHTML=`
      <div class="g2" style="gap:14px">
        <div>
          <div class="detail-section-title" style="margin-bottom:10px">Personal Details</div>
          ${[
            ['Full Name', dash(f.cust_name || c.cust)],
            ['Date of Birth', fmtDOB(f.cust_dob)],
            ['Gender', dash(f.cust_gender)],
            ['Marital Status', dash(f.cust_marital)],
            ['Dependants', dash(f.cust_dependants)],
            ['Mobile', dash(f.cust_mobile)],
            ['Email', dash(f.cust_email)],
            ['PAN', dash(f.cust_pan)],
            ['Aadhaar', dash(f.cust_aadhaar)],
            ['Address', fullAddr],
          ].map(([k,v])=>`
          <div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>
        <div>
          <div class="detail-section-title" style="margin-bottom:10px">Employment</div>
          ${[
            ['Employment Type', titleCase(f.emp_type)],
            ['Employer', dash(f.emp_company)],
            ['Monthly Income', f.inc_net_monthly ? fmt(f.inc_net_monthly) : '—'],
            ['Experience', dash(f.emp_years)],
          ].map(([k,v])=>`
          <div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>
      </div>`;
  } else if(tab==='loan'){
    const carDisplay = [f.car_make, f.car_model].filter(Boolean).join(' ') || dash(c.car);
    body.innerHTML=`
      <div class="g2" style="gap:14px">
        <div>
          <div class="detail-section-title" style="margin-bottom:10px">Loan Requirement</div>
          ${[
            ['Car Model', carDisplay],
            ['Loan Amount', fmt(f.loan_amount ?? c.loan ?? 0)],
            ['Tenure', f.loan_tenure_months ? (f.loan_tenure_months + ' months') : '—'],
            ['Bank', dash(f.preferred_bank_name || c.bank)],
            ['Down Payment', f.loan_down_payment ? fmt(f.loan_down_payment) : '—'],
          ].map(([k,v])=>`
          <div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>
        <div>
          <div class="detail-section-title" style="margin-bottom:10px">Eligibility</div>
          ${[
            ['CIBIL Score',`<span style="color:${cibilColor(c.cibil)};font-weight:600;font-family:'DM Mono',monospace">${c.cibil||'—'}</span>`],
            ['LTV', f.loan_ltv_pct ? (f.loan_ltv_pct + '%') : '—'],
            ['Submitted to', dash(f.preferred_bank_name || c.bank)],
          ].map(([k,v])=>`
          <div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('')}
        </div>
      </div>`;
  } else if(tab==='docs'){
    body.innerHTML=`<div class="itabs" id="cdm-doc-tabs"></div><div id="cdm-doc-content" style="padding:24px;text-align:center;color:var(--muted);font-size:13px"><i class="ti ti-loader" style="font-size:20px;display:block;margin-bottom:6px;opacity:.4"></i> Loading documents…</div>`;
    loadCaseDocuments(c.id);
  } else if(tab==='audit'){
    body.innerHTML=`<div id="cdm-audit-content" style="padding:24px;text-align:center;color:var(--muted);font-size:13px"><i class="ti ti-loader" style="font-size:20px;display:block;margin-bottom:6px;opacity:.4"></i> Loading audit trail…</div>`;
    loadCaseAuditTrail(c.id);
  }
}

async function loadCaseDocuments(caseId) {
  const tabsEl = document.getElementById('cdm-doc-tabs');
  const contentEl = document.getElementById('cdm-doc-content');
  try {
    const { data, error } = await db.from('documents').select('*').eq('case_id', caseId).order('uploaded_at', {ascending:false});
    if (error) { console.error('Documents fetch error:', error.message); if(contentEl) contentEl.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i><span>Could not load documents</span></div>'; return; }

    const docs = data || [];
    if (!docs.length) {
      if (tabsEl) tabsEl.innerHTML = '';
      if (contentEl) contentEl.innerHTML = '<div class="empty-state"><i class="ti ti-file-off"></i><span>No documents uploaded yet</span></div>';
      return;
    }

    // Group by doc_type
    const grouped = {};
    docs.forEach(d => { (grouped[d.doc_type] = grouped[d.doc_type] || []).push(d); });
    const types = Object.keys(grouped);

    if (tabsEl) {
      tabsEl.innerHTML = types.map((key, i) => {
        const meta = docTypeMeta[key] || docTypeMeta.other;
        return `<div class="itab ${i===0?'active':''}" onclick="renderCDMDocGroup('${key}',this)">${meta.label}
          <span style="font-size:9px;background:var(--accent);color:white;border-radius:8px;padding:1px 5px;margin-left:3px">${grouped[key].length}</span>
        </div>`;
      }).join('');
    }
    window._cdmDocGroups = grouped;
    renderCDMDocGroup(types[0], tabsEl ? tabsEl.querySelector('.itab') : null);
  } catch(e) {
    console.error('loadCaseDocuments failed:', e.message);
    if(contentEl) contentEl.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i><span>Could not load documents</span></div>';
  }
}

function renderCDMDocGroup(key, el) {
  if (el) {
    document.querySelectorAll('#cdm-doc-tabs .itab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
  }
  const content = document.getElementById('cdm-doc-content');
  if (!content) return;
  const docs = (window._cdmDocGroups || {})[key] || [];
  if (!docs.length) { content.innerHTML = '<div class="empty-state"><i class="ti ti-file-off"></i><span>No documents in this category</span></div>'; return; }

  const meta = docTypeMeta[key] || docTypeMeta.other;
  const exts={'pdf':'ti-file-type-pdf','jpg':'ti-photo','jpeg':'ti-photo','png':'ti-photo'};
  content.innerHTML = docs.map(d => {
    const name = d.file_name || d.doc_label || 'Document';
    const ext = name.split('.').pop().toLowerCase();
    const sizeKb = d.file_size_kb;
    const sizeDisplay = sizeKb ? (sizeKb >= 1024 ? (sizeKb/1024).toFixed(1)+' MB' : sizeKb+' KB') : '—';
    const uploadedDate = d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    return `<div class="doc-file-row">
      <div class="doc-file-icon" style="background:${meta.color}15;color:${meta.color}"><i class="ti ${exts[ext]||'ti-file'}"></i></div>
      <div><div class="doc-file-name">${name}</div><div class="doc-file-size">${sizeDisplay} · Uploaded ${uploadedDate}</div></div>
      <div style="margin-left:auto;display:flex;gap:5px">
        <button class="btn btn-xs" onclick="viewDocument('${d.storage_path||''}')"><i class="ti ti-eye" style="font-size:11px"></i></button>
        <button class="btn btn-xs btn-primary" onclick="viewDocument('${d.storage_path||''}')"><i class="ti ti-share" style="font-size:11px"></i></button>
      </div>
    </div>`;
  }).join('');
}

function viewDocument(storagePath) {
  if (!storagePath) { showFlash('File location not available'); return; }
  try {
    const { data } = db.storage.from('Customer_Documets').getPublicUrl(storagePath);
    if (data && data.publicUrl) window.open(data.publicUrl, '_blank');
    else showFlash('Could not open document');
  } catch(e) { console.error('viewDocument failed:', e.message); showFlash('Could not open document'); }
}

async function loadCaseAuditTrail(caseId) {
  const contentEl = document.getElementById('cdm-audit-content');
  try {
    const { data, error } = await db.from('audit_log')
      .select('*, users:user_id(name)')
      .eq('table_name', 'cases')
      .eq('record_id', caseId)
      .order('created_at', {ascending:false});

    if (error) {
      console.error('Audit log fetch error:', error.message);
      if (contentEl) contentEl.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i><span>Could not load audit trail</span></div>';
      return;
    }

    const entries = data || [];
    if (!entries.length) {
      if (contentEl) contentEl.innerHTML = '<div class="empty-state"><i class="ti ti-history-toggle"></i><span>No audit history recorded for this case yet</span></div>';
      return;
    }

    if (contentEl) {
      contentEl.style.padding = '0';
      contentEl.style.textAlign = 'left';
      contentEl.innerHTML = `<div style="position:relative;padding-left:16px;border-left:2px solid var(--border)">
        ${entries.map(e => {
          const dateStr = e.created_at ? new Date(e.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
          const userName = (e.users && e.users.name) || 'System';
          let actionText = e.action || 'Updated';
          if (e.reason) actionText += ' — ' + e.reason;
          return `<div style="position:relative;padding:0 0 16px 16px">
            <div style="position:absolute;left:-21px;top:3px;width:8px;height:8px;border-radius:50%;background:var(--accent);border:2px solid white"></div>
            <div style="font-size:10.5px;color:var(--muted);margin-bottom:2px">${dateStr} · ${userName}</div>
            <div style="font-size:13px;font-weight:500">${actionText}</div>
          </div>`;
        }).join('')}
      </div>`;
    }
  } catch(e) {
    console.error('loadCaseAuditTrail failed:', e.message);
    if (contentEl) contentEl.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i><span>Could not load audit trail</span></div>';
  }
}

// ── EDIT MENU / STATUS CHANGE ─────────────────────────────────────────────────
function openCaseActionMenu(e, caseId) {
  e.stopPropagation();
  _actionMenuCaseId = caseId;
  const menu = document.getElementById('case-action-menu');
  if (!menu) return;
  const rect = e.target.closest('button').getBoundingClientRect();
  menu.style.left = Math.max(8, rect.right - 180) + 'px';

  // Flip upward when there isn't room below — otherwise this clips off the
  // bottom of the screen (or behind the FAB) for rows near the end of a
  // scrolled list. Anchoring by `bottom` instead of `top` when flipped means
  // it self-adjusts to the menu's real height, not an estimate.
  const estimatedHeight = 90;
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < estimatedHeight + 12) {
    menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    menu.style.top = 'auto';
  } else {
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.bottom = 'auto';
  }

  menu.style.display = 'block';
  // Use a slight delay before attaching the outside-click closer so the
  // current click event (which is still bubbling) doesn't immediately close it.
  setTimeout(() => document.addEventListener('click', closeCaseActionMenu, { once: true }), 50);
}

function closeCaseActionMenu() {
  const menu = document.getElementById('case-action-menu');
  if (menu) menu.style.display = 'none';
}

function openStatusChangeModal() {
  closeCaseActionMenu();
  if (!_actionMenuCaseId) return;
  const c = cases.find(x => x.id === _actionMenuCaseId);
  const currentStatus = c ? c.status : null;

  const idEl = document.getElementById('status-change-caseid');
  if (idEl) idEl.textContent = 'Case ' + _actionMenuCaseId + (currentStatus ? ' · Currently ' + currentStatus : '');

  const banner = document.getElementById('status-locked-banner');
  const optsWrap = document.getElementById('status-options-wrap');
  const isDisbursed = currentStatus === 'Disbursed';

  if (banner) banner.style.display = isDisbursed ? 'flex' : 'none';
  if (optsWrap) optsWrap.style.display = isDisbursed ? 'none' : 'flex';

  // Highlight the current status button, and disable it (no point re-selecting same status)
  ['In process','Logged In','Sanctioned','Disbursed','Rejected'].forEach(s => {
    const btn = document.getElementById('status-btn-' + s);
    if (!btn) return;
    if (s === currentStatus) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  });

  document.getElementById('status-change-modal').classList.add('open');
}

function closeStatusChangeModal() {
  document.getElementById('status-change-modal').classList.remove('open');
}

// ── SANCTIONED DETAILS ─────────────────────────────────────────────────────────
function openSanctionedDetailsModal() {
  closeStatusChangeModal();
  document.getElementById('sanc-caseid').textContent = 'Case ' + _actionMenuCaseId;
  document.getElementById('sanc-amount').value = '';
  document.getElementById('sanc-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('sanc-proof-file').value = '';
  document.getElementById('sanc-details-error').style.display = 'none';
  document.getElementById('sanctioned-details-modal').classList.add('open');
}

function closeSanctionedDetailsModal() {
  document.getElementById('sanctioned-details-modal').classList.remove('open');
}

async function submitSanctionedDetails() {
  const caseId = _actionMenuCaseId;
  if (!caseId) return;

  const amount = document.getElementById('sanc-amount').value;
  const date = document.getElementById('sanc-date').value;
  const fileEl = document.getElementById('sanc-proof-file');
  const errEl = document.getElementById('sanc-details-error');

  if (!amount || !date) {
    errEl.textContent = 'Sanctioned amount and date are required';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  closeSanctionedDetailsModal();

  const c = cases.find(x => x.id === caseId);
  const oldStatus = c ? c.status : null;

  try {
    const { error } = await db.from('cases').update({
      status: 'Sanctioned',
      sanctioned_amount: parseFloat(amount),
      sanctioned_date: date,
      updated_at: new Date().toISOString()
    }).eq('id', caseId);

    if (error) { console.error('Sanctioned update error:', error.message); showFlash('Status update failed: ' + error.message); return; }

    if (c) c.status = 'Sanctioned';

    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    try {
      await db.from('audit_log').insert({
        user_id: uid,
        action: 'Status changed: ' + (oldStatus||'—') + ' → Sanctioned (₹' + amount + ')',
        table_name: 'cases',
        record_id: caseId,
        old_value: { status: oldStatus },
        new_value: { status: 'Sanctioned', sanctioned_amount: amount, sanctioned_date: date }
      });
    } catch(auditErr) { console.error('Audit log write failed:', auditErr.message); }

    const file = fileEl.files[0];
    if (file) {
      const ok = await uploadPDDProofDirect(caseId, 'sanction_proof', 'Sanction Proof', file);
      if (!ok) showFlash('Status updated, but the proof upload failed — try again from the PDD tab');
    }

    if (typeof renderAllCases === 'function') renderAllCases();
    showFlash('Status updated — ' + caseId + ' → Sanctioned');
  } catch(e) {
    console.error('submitSanctionedDetails failed:', e.message);
    showFlash('Status update failed');
  }
}

// ── DISBURSEMENT DETAILS ───────────────────────────────────────────────────────
function confirmDisbursement() {
  closeStatusChangeModal();
  document.getElementById('disb-amount').value = '';
  document.getElementById('disb-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('disb-proof-file').value = '';
  document.getElementById('disb-details-error').style.display = 'none';
  document.getElementById('disbursement-confirm-modal').classList.add('open');
}

function closeDisbursementConfirm() {
  document.getElementById('disbursement-confirm-modal').classList.remove('open');
}

async function finalizeDisbursement() {
  const caseId = _actionMenuCaseId;
  if (!caseId) return;

  const amount = document.getElementById('disb-amount').value;
  const date = document.getElementById('disb-date').value;
  const fileEl = document.getElementById('disb-proof-file');
  const errEl = document.getElementById('disb-details-error');

  if (!amount || !date) {
    errEl.textContent = 'Disbursement amount and date are required';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  closeDisbursementConfirm();

  const c = cases.find(x => x.id === caseId);
  const oldStatus = c ? c.status : null;

  try {
    const { error } = await db.from('cases').update({
      status: 'Disbursed',
      disbursed_amount: parseFloat(amount),
      disbursed_date: date,
      updated_at: new Date().toISOString()
    }).eq('id', caseId);

    if (error) { console.error('Disbursement update error:', error.message); showFlash('Status update failed: ' + error.message); return; }

    if (c) c.status = 'Disbursed';

    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    try {
      await db.from('audit_log').insert({
        user_id: uid,
        action: 'Status changed: ' + (oldStatus||'—') + ' → Disbursed (₹' + amount + ')',
        table_name: 'cases',
        record_id: caseId,
        old_value: { status: oldStatus },
        new_value: { status: 'Disbursed', disbursed_amount: amount, disbursed_date: date }
      });
    } catch(auditErr) { console.error('Audit log write failed:', auditErr.message); }

    // Upload disbursal proof BEFORE seeding the PDD checklist, so the seed
    // step's "already exists" check correctly skips re-creating this row.
    const file = fileEl.files[0];
    if (file) {
      const ok = await uploadPDDProofDirect(caseId, 'disbursal_proof', 'Disbursal Proof', file);
      if (!ok) showFlash('Status updated, but the proof upload failed — try again from the PDD tab');
    }

    await seedPDDChecklist(caseId, c ? c.bankId : null);

    if (typeof renderAllCases === 'function') renderAllCases();
    showFlash('Status updated — ' + caseId + ' → Disbursed');
  } catch(e) {
    console.error('finalizeDisbursement failed:', e.message);
    showFlash('Status update failed');
  }
}

// Shared by the Sanctioned/Disbursed flows above and (eventually) anything
// else that needs to drop a proof straight into a case's PDD checklist
// without going through the PDD tab's own upload picker. Checks for an
// existing row first so re-uploading (e.g. before Disbursed has even seeded
// the checklist yet) updates in place instead of creating a duplicate.
async function uploadPDDProofDirect(caseId, docType, docLabel, file) {
  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const friendlyName = buildDocFileName(caseId, docLabel, ext);
    const storagePath = `${caseId}/${friendlyName}`;

    const { error: uploadErr } = await db.storage.from('pdd-documents').upload(storagePath, file, { upsert: true });
    if (uploadErr) { console.error('PDD proof upload error:', uploadErr.message); return false; }

    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    const { data: existing } = await db.from('pdd_documents').select('id').eq('case_id', caseId).eq('doc_type', docType).maybeSingle();

    const rowPayload = {
      case_id: caseId,
      doc_type: docType,
      doc_label: docLabel,
      status: 'Received',
      storage_path: storagePath,
      file_name: friendlyName,
      file_size_kb: Math.round(file.size / 1024),
      uploaded_by: uid,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existing && existing.id) {
      const { error } = await db.from('pdd_documents').update(rowPayload).eq('id', existing.id);
      if (error) { console.error('PDD proof row update error:', error.message); return false; }
    } else {
      const { error } = await db.from('pdd_documents').insert(rowPayload);
      if (error) { console.error('PDD proof row insert error:', error.message); return false; }
    }

    // Keep the in-memory PDD cache in sync in case the PDD tab is/has been loaded
    if (typeof _pddDocsByCase !== 'undefined') {
      if (!_pddDocsByCase[caseId]) _pddDocsByCase[caseId] = [];
      const idx = _pddDocsByCase[caseId].findIndex(d => d.doc_type === docType);
      const merged = { ...rowPayload, id: existing?.id };
      if (idx >= 0) _pddDocsByCase[caseId][idx] = merged; else _pddDocsByCase[caseId].push(merged);
    }

    return true;
  } catch(e) {
    console.error('uploadPDDProofDirect failed:', e.message);
    return false;
  }
}

async function submitStatusChange(newStatus) {
  const caseId = _actionMenuCaseId;
  if (!caseId) return;

  // Safety check: never allow changing a status away from Disbursed, regardless
  // of how this function is invoked (defense in depth beyond the UI lock above).
  const c = cases.find(x => x.id === caseId);
  if (c && c.status === 'Disbursed') {
    showFlash('This case is Disbursed and cannot be changed further.');
    closeStatusChangeModal();
    return;
  }

  closeStatusChangeModal();
  try {
    const oldStatus = c ? c.status : null;

    const { error } = await db.from('cases').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', caseId);
    if (error) {
      console.error('Status update error:', error.message, error);
      showFlash('Status update failed: ' + (error.message || 'unknown error'));
      return;
    }

    // Update in-memory cases array so the table reflects it immediately
    if (c) c.status = newStatus;

    // Write an audit log entry so the Audit Trail tab has real history to show
    try {
      const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
      await db.from('audit_log').insert({
        user_id: uid,
        action: 'Status changed: ' + (oldStatus||'—') + ' → ' + newStatus,
        table_name: 'cases',
        record_id: caseId,
        old_value: { status: oldStatus },
        new_value: { status: newStatus }
      });
    } catch(auditErr) { console.error('Audit log write failed:', auditErr.message); }

    if (typeof renderAllCases === 'function') renderAllCases();
    showFlash('Status updated — ' + caseId + ' → ' + newStatus);
  } catch(e) {
    console.error('submitStatusChange failed:', e.message, e);
    showFlash('Status update failed: ' + (e.message || 'unknown error'));
  }
}

async function seedPDDChecklist(caseId, bankId) {
  try {
    // Fetch universal requirements (bank_id IS NULL) + bank-specific ones for this case's bank
    let reqQuery = db.from('pdd_requirements').select('*').eq('active', true);
    const { data: allReqs, error: reqErr } = await reqQuery;
    if (reqErr) { console.error('PDD requirements fetch error:', reqErr.message); return; }

    const applicable = (allReqs || []).filter(r => r.bank_id === null || r.bank_id === bankId);
    if (!applicable.length) { console.warn('No PDD requirements found to seed for case', caseId); return; }

    // Check which doc_types already exist for this case (avoid duplicate seeding on re-disbursement edge cases)
    const { data: existing } = await db.from('pdd_documents').select('doc_type').eq('case_id', caseId);
    const existingTypes = new Set((existing||[]).map(d => d.doc_type));

    const toInsert = applicable
      .filter(r => !existingTypes.has(r.doc_type))
      .map(r => ({
        case_id: caseId,
        doc_type: r.doc_type,
        doc_label: r.doc_label,
        status: 'Pending'
      }));

    if (!toInsert.length) return; // already fully seeded

    const { error: insErr } = await db.from('pdd_documents').insert(toInsert);
    if (insErr) console.error('PDD seeding insert error:', insErr.message);
    else console.log('PDD checklist seeded for', caseId, '—', toInsert.length, 'documents');
  } catch(e) {
    console.error('seedPDDChecklist failed:', e.message);
  }
}

function openEditFileForm() {
  closeCaseActionMenu();
  const caseId = _actionMenuCaseId;
  if (!caseId) return;
  const iframe = document.getElementById('form-iframe');
  const fullpage = document.getElementById('form-fullpage');
  if (!iframe || !fullpage) return;
  iframe.src = 'capri_customer_form.html?embedded=1&edit=' + encodeURIComponent(caseId);
  fullpage.classList.add('open');
  document.body.style.overflow = 'hidden';
  const title = document.querySelector('.form-topbar-title');
  if (title) title.textContent = 'Edit Case — ' + caseId;
}

// ── LOAD LIVE CASES (from Supabase) ───────────────────────────────────────────
async function loadLiveCases(user) {
  try {
    // Query the view which already has created_by_name and reporting_to_name
    let q = db.from('cases_with_names')
      .select('id,cust_name,car_make,car_model,preferred_bank_name,preferred_bank_id,pdd_approved,loan_amount,status,cibil_score,submitted_at,created_at,payout_amount,created_by,bm_id,cust_mobile,curr_pincode,perm_pincode,inc_net_monthly,emp_type,created_by_name,creator_role,reporting_to_name')
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
        .select('id,cust_name,car_make,car_model,preferred_bank_name,loan_amount,status,cibil_score,submitted_at,created_at,payout_amount,created_by,bm_id,cust_mobile,curr_pincode,perm_pincode,inc_net_monthly,emp_type,created_by_name,creator_role,reporting_to_name')
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
        car: [c.car_make, c.car_model].filter(Boolean).join(' ') || '—',
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

    // Notify the shell to update the All Files nav badge (lives outside this iframe)
    notifyBadgeCount('cases', cases.length);

    // Re-render
    if (typeof renderAllCases === 'function' && document.getElementById('all-cases-tbody')) renderAllCases();
    // PDD queue is filtered from this same `cases` array, but loadPDDQueue() may have
    // already run (and bailed into its empty state) before this data arrived — re-run
    // it now so the PDD tab reflects live cases instead of staying stuck on "empty".
    if (typeof loadPDDQueue === 'function' && document.getElementById('pdd-queue-wrap')) loadPDDQueue();

    console.log('Live cases loaded:', mapped.length);
  } catch(e) { console.error('loadLiveCases error:', e.message); }
}

// ── DRAFTS TAB ─────────────────────────────────────────────────────────────────
let _allDrafts = [];

async function loadDrafts() {
  const loading = document.getElementById('drafts-loading');
  const empty   = document.getElementById('drafts-empty');
  const wrap    = document.getElementById('drafts-table-wrap');
  if(loading) loading.style.display = 'block';
  if(empty)   empty.style.display   = 'none';
  if(wrap)    wrap.style.display    = 'none';
  try {
    const { data, error } = await db.from('case_drafts').select('*').order('last_saved_at',{ascending:false});
    if(loading) loading.style.display = 'none';
    if(error){ console.error('Draft load error:',error.message); return; }
    _allDrafts = data || [];

    // Notify the shell to update the Drafts nav badge (lives outside this iframe)
    notifyBadgeCount('drafts', _allDrafts.length);

    // Stats
    const statTotal = document.getElementById('draft-stat-total');
    const statLast  = document.getElementById('draft-stat-last');
    const statAvg   = document.getElementById('draft-stat-avg');
    if(statTotal) statTotal.textContent = _allDrafts.length;
    if(statLast && _allDrafts.length>0){
      const d=new Date(_allDrafts[0].last_saved_at);
      statLast.textContent = d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    }
    if(statAvg && _allDrafts.length>0){
      const avg=Math.round(_allDrafts.reduce((s,d)=>s+(d.completion_pct||0),0)/_allDrafts.length);
      statAvg.textContent=avg+'%';
    }
    if(_allDrafts.length===0){ if(empty) empty.style.display='block'; return; }
    if(wrap) wrap.style.display='';
    renderDraftsTable(_allDrafts);
  } catch(e){ if(loading) loading.style.display='none'; console.error('loadDrafts:',e); }
}

function filterDrafts(){
  const q=(document.getElementById('draft-search')?.value||'').toLowerCase();
  if(!q){ renderDraftsTable(_allDrafts); return; }
  renderDraftsTable(_allDrafts.filter(d=>{
    const fd=d.form_data||{};
    return (d.case_id||'').toLowerCase().includes(q)||
           (fd.cust_name||'').toLowerCase().includes(q)||
           (fd.cust_mobile||'').toLowerCase().includes(q)||
           (fd.car_model||'').toLowerCase().includes(q);
  }));
}

function renderDraftsTable(drafts){
  const tbody=document.getElementById('drafts-tbody');
  const mlist=document.getElementById('drafts-mlist');
  if(!tbody) return;
  if(!drafts.length){
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--muted)">No drafts match your search</td></tr>';
    if (mlist) mlist.innerHTML='<div class="mlist-empty"><i class="ti ti-pencil-off"></i><span>No drafts match your search</span></div>';
    return;
  }
  tbody.innerHTML=drafts.map(d=>{
    const fd=d.form_data||{};
    const pct=d.completion_pct||0;
    const barColor=pct>=66?'var(--green-text)':pct>=33?'var(--gold)':'var(--amber-text)';
    const savedAt=d.last_saved_at
      ? new Date(d.last_saved_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})+' '+
        new Date(d.last_saved_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})
      : '—';
    const loan=fd.loan_amount?'₹'+(fd.loan_amount>=100000?(fd.loan_amount/100000).toFixed(2)+'L':Number(fd.loan_amount).toLocaleString('en-IN')):'—';
    return `<tr>
      <td data-label="Case ID"><span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:var(--accent)">${d.case_id||'—'}</span></td>
      <td data-label="Customer Name" style="font-weight:500">${fd.cust_name||'<span style="color:var(--muted2);font-style:italic">Not filled</span>'}</td>
      <td data-label="Mobile" style="font-family:'DM Mono',monospace;font-size:12px">${fd.cust_mobile||'—'}</td>
      <td data-label="Car Model">${fd.car_model?(fd.car_model+(fd.car_variant?' · '+fd.car_variant:'')):'—'}</td>
      <td data-label="Loan (₹)" style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600">${loan}</td>
      <td data-label="Progress" style="min-width:120px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:5px;border-radius:3px;background:var(--border);overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .5s"></div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${barColor};min-width:28px">${pct}%</span>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Section ${d.section||1} of 3</div>
      </td>
      <td data-label="Last Saved" style="font-size:12px;color:var(--muted)">${savedAt}</td>
      <td data-label="Actions" style="text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <button class="btn btn-primary btn-xs" onclick="resumeDraft('${d.case_id}',${d.section||1})">
            <i class="ti ti-player-play" style="font-size:11px"></i> Resume
          </button>
          <button class="btn btn-danger btn-xs" onclick="confirmDeleteDraft('${d.case_id}')">
            <i class="ti ti-trash" style="font-size:11px"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const mlist2 = document.getElementById('drafts-mlist');
  if (mlist2) {
    mlist2.innerHTML = drafts.map(d=>{
      const fd=d.form_data||{};
      const pct=d.completion_pct||0;
      const barColor=pct>=66?'var(--green-text)':pct>=33?'var(--gold)':'var(--amber-text)';
      const savedAt=d.last_saved_at
        ? new Date(d.last_saved_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})
        : '—';
      const loan=fd.loan_amount?'₹'+(fd.loan_amount>=100000?(fd.loan_amount/100000).toFixed(2)+'L':Number(fd.loan_amount).toLocaleString('en-IN')):'—';
      const carLabel = [fd.car_make, fd.car_model].filter(Boolean).join(' ') || '—';
      return `
      <div class="mlist-card">
        <div class="mlist-top">
          <span class="mlist-id">${d.case_id||'—'}</span>
          <span style="font-size:11px;font-weight:600;color:${barColor}">${pct}% · Sec ${d.section||1}/3</span>
        </div>
        <div class="mlist-title">${fd.cust_name || '<span style="color:var(--muted2);font-style:italic">Not filled</span>'}</div>
        <div class="mlist-meta">
          <span>Loan: <b>${loan}</b></span>
          <span>Car: <b>${carLabel}</b></span>
          <span>Saved: <b>${savedAt}</b></span>
        </div>
        <div class="mlist-actions">
          <button class="btn btn-primary btn-sm" onclick="resumeDraft('${d.case_id}',${d.section||1})">
            <i class="ti ti-player-play" style="font-size:11px"></i> Resume
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteDraft('${d.case_id}')">
            <i class="ti ti-trash" style="font-size:11px"></i> Delete
          </button>
        </div>
      </div>`;
    }).join('');
  }
}

function resumeDraft(caseId, section){
  const iframe=document.getElementById('form-iframe');
  const fullpage=document.getElementById('form-fullpage');
  if(!iframe||!fullpage) return;
  iframe.src='capri_customer_form.html?embedded=1&resume='+encodeURIComponent(caseId)+'&section='+(section||1);
  fullpage.classList.add('open');
  document.body.style.overflow='hidden';
  const title=document.querySelector('.form-topbar-title');
  if(title) title.textContent='Resume Draft — '+caseId;
}

let _pendingDeleteId=null;
function confirmDeleteDraft(caseId){
  _pendingDeleteId=caseId;
  const overlay=document.getElementById('draft-delete-modal');
  const el=document.getElementById('draft-delete-caseid');
  if(overlay) overlay.style.display='flex';
  if(el) el.textContent=caseId;
}

function closeDraftDeleteModal(){
  _pendingDeleteId=null;
  const overlay=document.getElementById('draft-delete-modal');
  if(overlay) overlay.style.display='none';
}

async function confirmDeleteDraftAction(){
  if(!_pendingDeleteId) return;
  const caseId=_pendingDeleteId;
  closeDraftDeleteModal();
  try{
    await db.from('case_drafts').delete().eq('case_id',caseId);
    await db.from('cases').delete().eq('id',caseId).eq('status','Draft');
    showFlash('Draft deleted — '+caseId);
    loadDrafts();
  } catch(e){ console.error('Delete failed:',e); showFlash('Delete failed — try again'); }
}

// ── PDD TAB ────────────────────────────────────────────────────────────────────
let _allPDDCases = [];
let _pddDocsByCase = {};
let _pddRequirements = [];
let _pddUploadTarget = null;
let _pddApproveTarget = null;
let _pddRevokeTarget = null;

async function loadPDDQueue() {
  const loading = document.getElementById('pdd-loading');
  const empty   = document.getElementById('pdd-empty');
  const wrap    = document.getElementById('pdd-queue-wrap');
  if (loading) loading.style.display = 'block';
  if (empty)   empty.style.display   = 'none';
  if (wrap)    wrap.innerHTML = '';

  try {
    const disbursedCases = cases.filter(c => c.status === 'Disbursed');
    if (loading) loading.style.display = 'none';

    const pendingCount = disbursedCases.filter(c => !c.pddApproved).length;
    notifyBadgeCount('pdd', pendingCount);

    if (!disbursedCases.length) {
      if (empty) empty.style.display = 'block';
      updatePDDStats([]);
      return;
    }

    // Load requirement definitions once (universal + bank-specific)
    const { data: reqs, error: reqErr } = await db.from('pdd_requirements').select('*').eq('active', true);
    if (reqErr) console.error('PDD requirements fetch error:', reqErr.message);
    _pddRequirements = reqs || [];

    // Load all pdd_documents rows for these cases
    const caseIds = disbursedCases.map(c => c.id);
    const { data: docs, error } = await db.from('pdd_documents').select('*').in('case_id', caseIds);
    if (error) { console.error('PDD documents fetch error:', error.message); return; }

    _pddDocsByCase = {};
    (docs||[]).forEach(d => { (_pddDocsByCase[d.case_id] = _pddDocsByCase[d.case_id] || []).push(d); });

    _allPDDCases = disbursedCases;
    updatePDDStats(disbursedCases);
    renderPDDQueue(disbursedCases);
  } catch(e) {
    if (loading) loading.style.display = 'none';
    console.error('loadPDDQueue failed:', e.message);
  }
}

function requiredDocsFor(c) {
  return _pddRequirements
    .filter(r => r.bank_id === null || r.bank_id === c.bankId)
    .sort((a,b) => (a.display_order||0) - (b.display_order||0));
}

function findPDDDoc(caseId, docType) {
  return (_pddDocsByCase[caseId] || []).find(d => d.doc_type === docType) || null;
}

function pddCaseState(c) {
  const reqs = requiredDocsFor(c);
  const uploadedCount = reqs.filter(r => {
    const d = findPDDDoc(c.id, r.doc_type);
    return d && d.storage_path;
  }).length;
  return {
    total: reqs.length,
    uploaded: uploadedCount,
    allUploaded: reqs.length > 0 && uploadedCount === reqs.length,
    approved: !!c.pddApproved
  };
}

function updatePDDStats(disbursedCases) {
  const totalEl = document.getElementById('pdd-stat-total');
  const incEl   = document.getElementById('pdd-stat-incomplete');
  const compEl  = document.getElementById('pdd-stat-complete');
  if (!totalEl) return;

  let approved = 0, awaiting = 0;
  disbursedCases.forEach(c => {
    const st = pddCaseState(c);
    if (st.approved) approved++; else awaiting++;
  });

  totalEl.textContent = disbursedCases.length;
  if (incEl) incEl.textContent = awaiting;
  if (compEl) compEl.textContent = approved;
}

function filterPDDQueue() {
  const q = (document.getElementById('pdd-search')?.value || '').toLowerCase();
  const statusF = document.getElementById('pdd-status-filter')?.value || '';

  const filtered = _allPDDCases.filter(c => {
    if (q && !(c.cust.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))) return false;
    const st = pddCaseState(c);
    if (statusF === 'pending' && st.allUploaded) return false;
    if (statusF === 'ready' && !(st.allUploaded && !st.approved)) return false;
    if (statusF === 'approved' && !st.approved) return false;
    return true;
  });
  renderPDDQueue(filtered);
}

function docCellHTML(c, req) {
  const d = findPDDDoc(c.id, req.doc_type);
  const hasFile = d && d.storage_path;

  if (!hasFile) {
    return `<button class="btn btn-xs" onclick="openPDDUpload('${c.id}','${req.doc_type}','${(req.doc_label||'').replace(/'/g,"\\'")}', ${d ? "'"+d.id+"'" : 'null'})">
      <i class="ti ti-upload" style="font-size:11px"></i> Upload
    </button>`;
  }

  return `<div style="display:flex;gap:5px;justify-content:center">
    <button class="btn btn-xs" onclick="viewPDDFile('${d.storage_path}')" title="${d.file_name||'View file'}"><i class="ti ti-eye" style="font-size:11px"></i></button>
    <button class="btn btn-xs" onclick="openPDDUpload('${c.id}','${req.doc_type}','${(req.doc_label||'').replace(/'/g,"\\'")}','${d.id}')" title="Replace file"><i class="ti ti-edit" style="font-size:11px"></i></button>
  </div>`;
}

function renderPDDQueue(list) {
  const wrap = document.getElementById('pdd-queue-wrap');
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:32px"><i class="ti ti-search-off"></i><span>No cases match your search</span></div>';
    return;
  }

  // Document columns are driven by the union of all required doc types across
  // the visible cases, so the table adapts if a bank has extra requirements.
  // Falls back to the 4 universal defaults if nothing is configured yet.
  const allDocTypesInOrder = [];
  const seen = new Set();
  list.forEach(c => requiredDocsFor(c).forEach(r => {
    if (!seen.has(r.doc_type)) { seen.add(r.doc_type); allDocTypesInOrder.push(r); }
  }));

  const role = (window.currentLoggedInUser && window.currentLoggedInUser.role) || '';
  const canApprove = role === 'bm' || role === 'city_head';

  wrap.innerHTML = `<table class="data-table has-mlist" style="width:100%">
    <thead><tr>
      <th>Case ID</th>
      <th>Customer</th>
      <th>Bank</th>
      <th>Loan (₹)</th>
      ${allDocTypesInOrder.map(r => `<th style="text-align:center">${r.doc_label}</th>`).join('')}
      ${canApprove ? '<th style="text-align:center">Approval</th>' : ''}
    </tr></thead>
    <tbody>
    ${list.map(c => {
      const st = pddCaseState(c);
      const myReqs = requiredDocsFor(c);
      const myReqTypes = new Set(myReqs.map(r=>r.doc_type));

      const docCells = allDocTypesInOrder.map(r => {
        if (!myReqTypes.has(r.doc_type)) return `<td data-label="${r.doc_label}" style="text-align:center;color:var(--muted2);font-size:11px">N/A</td>`;
        return `<td data-label="${r.doc_label}" style="text-align:center">${docCellHTML(c, r)}</td>`;
      }).join('');

      // RM doesn't get an Approval column at all — not even a read-only
      // status. Only BM/City Head have approval authority, so only they see it.
      let approvalTd = '';
      if (canApprove) {
        let approveCell;
        if (st.approved) {
          approveCell = `<div style="display:flex;align-items:center;justify-content:center;gap:6px">
              <span class="badge badge-green"><i class="ti ti-shield-check" style="font-size:10px"></i> Approved</span>
              <button class="btn btn-xs btn-danger" onclick="openPDDRevokeModal('${c.id}')" title="Revoke approval">
                <i class="ti ti-shield-x" style="font-size:11px"></i> Revoke
              </button>
            </div>`;
        } else {
          approveCell = `<button class="btn btn-xs btn-primary" ${st.allUploaded ? '' : 'disabled style="opacity:.4;cursor:not-allowed"'} onclick="${st.allUploaded ? `openPDDApproveModal('${c.id}')` : ''}">
            <i class="ti ti-shield-check" style="font-size:11px"></i> Approve
          </button>`;
        }
        approvalTd = `<td data-label="Approval" style="text-align:center">${approveCell}</td>`;
      }

      return `<tr>
        <td data-label="Case ID"><span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:var(--accent)">${c.id}</span></td>
        <td data-label="Customer" style="font-weight:500">${c.cust}</td>
        <td data-label="Bank">${c.bank}</td>
        <td data-label="Loan (₹)" style="font-family:'DM Mono',monospace;font-size:12px">${fmt(c.loan)}</td>
        ${docCells}
        ${approvalTd}
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  <div class="mlist">
    ${list.map(c => {
      const st = pddCaseState(c);
      const myReqs = requiredDocsFor(c);
      const myReqTypes = new Set(myReqs.map(r=>r.doc_type));

      const docRows = allDocTypesInOrder.map(r => {
        const applicable = myReqTypes.has(r.doc_type);
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
          <span style="font-size:12.5px;color:var(--text)">${r.doc_label}</span>
          ${applicable ? docCellHTML(c, r) : '<span style="color:var(--muted2);font-size:11px">N/A</span>'}
        </div>`;
      }).join('');

      let approveAction = '';
      if (canApprove) {
        if (st.approved) {
          approveAction = `<span class="badge badge-green"><i class="ti ti-shield-check" style="font-size:10px"></i> Approved</span>
             <button class="btn btn-sm btn-danger" onclick="openPDDRevokeModal('${c.id}')"><i class="ti ti-shield-x" style="font-size:11px"></i> Revoke</button>`;
        } else {
          approveAction = `<button class="btn btn-sm btn-primary" ${st.allUploaded ? '' : 'disabled style="opacity:.4;cursor:not-allowed"'} onclick="${st.allUploaded ? `openPDDApproveModal('${c.id}')` : ''}">
            <i class="ti ti-shield-check" style="font-size:11px"></i> Approve
          </button>`;
        }
      }

      return `
      <div class="mlist-card">
        <div class="mlist-top">
          <span class="mlist-id">${c.id}</span>
          ${st.approved ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-amber">Pending</span>'}
        </div>
        <div class="mlist-title">${c.cust}</div>
        <div class="mlist-meta">
          <span>Bank: <b>${c.bank}</b></span>
          <span>Loan: <b>${fmt(c.loan)}</b></span>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:4px">${docRows}</div>
        ${canApprove ? `<div class="mlist-actions" style="align-items:center">${approveAction}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function openPDDUpload(caseId, docType, docLabel, existingDocId) {
  _pddUploadTarget = { caseId, docType, docLabel, existingDocId: existingDocId || null };
  const input = document.getElementById('pdd-file-input');
  if (input) { input.value = ''; input.click(); }
}

// Builds the human-readable file name used both for the Storage object key and
// the `file_name` shown in the UI — e.g. "CPG-167 PAN Card.jpg". Strips
// characters that aren't safe in a Storage path/URL (keeps letters, numbers,
// spaces, hyphens) and collapses extra whitespace.
function buildDocFileName(caseId, docLabel, ext) {
  const safeLabel = (docLabel || 'Document').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${caseId} ${safeLabel}.${ext}`;
}

async function handlePDDFileSelected(event) {
  const file = event.target.files[0];
  if (!file || !_pddUploadTarget) return;

  const { caseId, docType, docLabel, existingDocId } = _pddUploadTarget;
  const MAX_MB = 5;
  if (file.size > MAX_MB * 1024 * 1024) {
    showFlash('File too large — max ' + MAX_MB + 'MB');
    return;
  }

  showFlash('Uploading ' + docLabel + '…');

  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const friendlyName = buildDocFileName(caseId, docLabel, ext);
    const storagePath = `${caseId}/${friendlyName}`;

    const { error: uploadErr } = await db.storage.from('pdd-documents').upload(storagePath, file, { upsert: true });
    if (uploadErr) { console.error('PDD file upload error:', uploadErr.message); showFlash('Upload failed: ' + uploadErr.message); return; }

    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    const rowPayload = {
      case_id: caseId,
      doc_type: docType,
      doc_label: docLabel,
      status: 'Received',
      storage_path: storagePath,
      file_name: friendlyName,
      file_size_kb: Math.round(file.size / 1024),
      uploaded_by: uid,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let savedRow;
    if (existingDocId) {
      const { data, error } = await db.from('pdd_documents').update(rowPayload).eq('id', existingDocId).select().single();
      if (error) { console.error('PDD doc update error:', error.message); showFlash('Save failed: ' + error.message); return; }
      savedRow = data;
    } else {
      const { data, error } = await db.from('pdd_documents').insert(rowPayload).select().single();
      if (error) { console.error('PDD doc insert error:', error.message); showFlash('Save failed: ' + error.message); return; }
      savedRow = data;
    }

    // Update in-memory copy
    if (!_pddDocsByCase[caseId]) _pddDocsByCase[caseId] = [];
    const idx = _pddDocsByCase[caseId].findIndex(d => d.doc_type === docType);
    if (idx >= 0) _pddDocsByCase[caseId][idx] = savedRow; else _pddDocsByCase[caseId].push(savedRow);

    updatePDDStats(_allPDDCases);
    renderPDDQueue(_allPDDCases);
    showFlash(docLabel + ' uploaded');
  } catch(e) {
    console.error('handlePDDFileSelected failed:', e.message);
    showFlash('Upload failed');
  } finally {
    _pddUploadTarget = null;
  }
}

function viewPDDFile(storagePath) {
  if (!storagePath) { showFlash('File not available'); return; }
  try {
    const { data } = db.storage.from('pdd-documents').getPublicUrl(storagePath);
    if (data && data.publicUrl) window.open(data.publicUrl, '_blank');
    else showFlash('Could not open file');
  } catch(e) { console.error('viewPDDFile failed:', e.message); showFlash('Could not open file'); }
}

function openPDDApproveModal(caseId) {
  const role = (window.currentLoggedInUser && window.currentLoggedInUser.role) || '';
  if (role !== 'bm' && role !== 'city_head') {
    showFlash('Only a Branch Manager or City Head can approve PDD.');
    return;
  }
  _pddApproveTarget = caseId;
  const idEl = document.getElementById('pdd-approve-caseid');
  if (idEl) idEl.textContent = 'Case ' + caseId;
  document.getElementById('pdd-approve-modal').classList.add('open');
}

function closePDDApproveModal() {
  document.getElementById('pdd-approve-modal').classList.remove('open');
  _pddApproveTarget = null;
}

async function confirmPDDApproval() {
  const caseId = _pddApproveTarget;
  if (!caseId) return;
  closePDDApproveModal();

  try {
    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    const { error } = await db.from('cases').update({
      pdd_approved: true,
      pdd_approved_by: uid,
      pdd_approved_at: new Date().toISOString()
    }).eq('id', caseId);

    if (error) { console.error('PDD approval error:', error.message); showFlash('Approval failed: ' + error.message); return; }

    // Update in-memory case object
    const c = cases.find(x => x.id === caseId);
    if (c) c.pddApproved = true;

    // Audit log entry
    try {
      await db.from('audit_log').insert({
        user_id: uid,
        action: 'PDD approved — payout cleared',
        table_name: 'cases',
        record_id: caseId
      });
    } catch(auditErr) { console.error('Audit log write failed:', auditErr.message); }

    updatePDDStats(_allPDDCases);
    renderPDDQueue(_allPDDCases);
    showFlash('PDD approved — ' + caseId + ' cleared for payout');

    await snapshotPayoutForCase(caseId);
  } catch(e) {
    console.error('confirmPDDApproval failed:', e.message);
    showFlash('Approval failed');
  }
}

// Locks in a payout record the moment PDD is approved — does a fresh fetch
// of the case/bank/slabs rather than trusting whatever's in the in-memory
// `cases` array, so this is correct even if that array is stale or missing
// fields. Mirrors the same calc logic as payout-report.js's
// computePayoutForCase(), but persisted instead of recomputed on every load.
async function snapshotPayoutForCase(caseId) {
  try {
    const { data: c, error: cErr } = await db.from('cases')
      .select('id,cust_name,disbursed_amount,loan_amount,preferred_bank_id,created_by,bm_id')
      .eq('id', caseId).single();
    if (cErr || !c) { console.error('snapshotPayoutForCase: case fetch failed:', cErr?.message); return; }

    if (!c.preferred_bank_id) { console.warn('snapshotPayoutForCase: no bank set for', caseId, '— skipping'); return; }

    const { data: bank, error: bErr } = await db.from('banks')
      .select('id,name,active,payout_type,payout_pct,fixed_payout')
      .eq('id', c.preferred_bank_id).single();
    if (bErr || !bank) { console.error('snapshotPayoutForCase: bank fetch failed:', bErr?.message); return; }
    if (!bank.active) { console.warn('snapshotPayoutForCase: bank is inactive, skipping payout snapshot for', caseId); return; }

    const disbursedAmt = parseFloat(c.disbursed_amount) || parseFloat(c.loan_amount) || 0;

    let payoutPct = null, payoutAmount = 0;
    if (bank.payout_type === 'fixed_per_file') {
      payoutAmount = parseFloat(bank.fixed_payout) || 0;
    } else if (bank.payout_type === 'slab') {
      const { data: slabs } = await db.from('bank_payout_slabs')
        .select('loan_from,loan_to,payout_pct').eq('bank_id', bank.id).eq('active', true);
      const match = (slabs || []).find(s => disbursedAmt >= parseFloat(s.loan_from) && disbursedAmt <= parseFloat(s.loan_to));
      if (match) { payoutPct = parseFloat(match.payout_pct) || 0; payoutAmount = disbursedAmt * payoutPct / 100; }
    } else {
      payoutPct = parseFloat(bank.payout_pct) || 0;
      payoutAmount = disbursedAmt * payoutPct / 100;
    }

    let memberName = '—';
    if (c.created_by) {
      const { data: member } = await db.from('users').select('name').eq('id', c.created_by).maybeSingle();
      if (member) memberName = member.name;
    }

    const payload = {
      case_id: caseId,
      cust_name: c.cust_name || null,
      bank_id: bank.id,
      bank_name: bank.name,
      member_id: c.created_by || null,
      member_name: memberName,
      bm_id: c.bm_id || null,
      disbursed_amount: disbursedAmt,
      payout_type: bank.payout_type,
      payout_pct: payoutPct,
      payout_amount: payoutAmount,
      status: 'pending',
      updated_at: new Date().toISOString()
    };

    const { error: upsertErr } = await db.from('payouts').upsert(payload, { onConflict: 'case_id' });
    if (upsertErr) console.error('snapshotPayoutForCase: upsert failed:', upsertErr.message);
  } catch(e) {
    console.error('snapshotPayoutForCase failed:', e.message);
  }
}

function openPDDRevokeModal(caseId) {
  const role = (window.currentLoggedInUser && window.currentLoggedInUser.role) || '';
  if (role !== 'bm' && role !== 'city_head') {
    showFlash('Only a Branch Manager or City Head can revoke PDD approval.');
    return;
  }
  _pddRevokeTarget = caseId;
  const idEl = document.getElementById('pdd-revoke-caseid');
  if (idEl) idEl.textContent = 'Case ' + caseId;
  document.getElementById('pdd-revoke-modal').classList.add('open');
}

function closePDDRevokeModal() {
  document.getElementById('pdd-revoke-modal').classList.remove('open');
  _pddRevokeTarget = null;
}

async function confirmPDDRevoke() {
  const caseId = _pddRevokeTarget;
  if (!caseId) return;
  closePDDRevokeModal();

  try {
    const uid = (window.currentLoggedInUser && window.currentLoggedInUser.id) || null;
    const { error } = await db.from('cases').update({
      pdd_approved: false,
      pdd_approved_by: null,
      pdd_approved_at: null
    }).eq('id', caseId);

    if (error) { console.error('PDD revoke error:', error.message); showFlash('Revoke failed: ' + error.message); return; }

    // Update in-memory case object
    const c = cases.find(x => x.id === caseId);
    if (c) c.pddApproved = false;

    // Audit log entry
    try {
      await db.from('audit_log').insert({
        user_id: uid,
        action: 'PDD approval revoked — payout held',
        table_name: 'cases',
        record_id: caseId
      });
    } catch(auditErr) { console.error('Audit log write failed:', auditErr.message); }

    updatePDDStats(_allPDDCases);
    renderPDDQueue(_allPDDCases);
    showFlash('PDD approval revoked — ' + caseId + ' payout held');

    // Clean up the payout snapshot too — but only if it's still "pending".
    // If it's already been approved/paid, leave the record alone; that's
    // real payment history and shouldn't vanish just because PDD got revoked
    // after the fact.
    try {
      const { data: existingPayout } = await db.from('payouts').select('id,status').eq('case_id', caseId).maybeSingle();
      if (existingPayout && existingPayout.status === 'pending') {
        await db.from('payouts').delete().eq('id', existingPayout.id);
      } else if (existingPayout) {
        console.warn('PDD revoked but payout already', existingPayout.status, '— leaving payout record intact for', caseId);
      }
    } catch(payoutCleanupErr) { console.error('Payout cleanup on revoke failed:', payoutCleanupErr.message); }
  } catch(e) {
    console.error('confirmPDDRevoke failed:', e.message);
    showFlash('Revoke failed');
  }
}
