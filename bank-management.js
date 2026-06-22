// ══════════════════════════════════════════════════════════════════════════
// BANK-MANAGEMENT.JS
// ══════════════════════════════════════════════════════════════════════════

let banks=[]; // populated live by loadBanks()

const typeBadge={
  'PVT Bank':  'badge-blue',
  'PSU Bank':  'badge-gold',
  'NBFC':      'badge-purple',
  'HFC':       'badge-blue',
  'Co-op Bank':'badge-gold',
};


async function loadBanks() {
  const loading = document.getElementById('banks-loading');
  const empty   = document.getElementById('banks-empty');
  const table   = document.getElementById('banks-table');
  if (loading) loading.style.display = 'block';
  if (empty)   empty.style.display   = 'none';
  if (table)   table.style.display   = 'none';

  try {
    const { data: bankRows, error: bErr } = await db.from('banks').select('*').order('name');
    if (bErr) { console.error('Banks fetch error:', bErr.message); if(loading) loading.style.display='none'; return; }

    const { data: rateSlabs, error: rErr } = await db.from('bank_rate_slabs').select('*').eq('active', true).order('score_min', { ascending: false });
    if (rErr) console.error('Rate slabs fetch error:', rErr.message);

    const { data: payoutSlabs, error: pErr } = await db.from('bank_payout_slabs').select('*').eq('active', true).order('loan_from');
    if (pErr) console.error('Payout slabs fetch error:', pErr.message);

    // Group slabs by bank_id
    const slabsByBank = {};
    (rateSlabs||[]).forEach(s => { (slabsByBank[s.bank_id] = slabsByBank[s.bank_id]||[]).push(s); });
    const payoutSlabsByBank = {};
    (payoutSlabs||[]).forEach(s => { (payoutSlabsByBank[s.bank_id] = payoutSlabsByBank[s.bank_id]||[]).push(s); });

    banks = (bankRows||[]).map(b => ({
      id: b.id,
      name: b.name,
      type: b.type || 'Bank',
      minCibil: b.min_cibil ?? '—',
      foir: b.max_foir_pct ?? '—',
      ltv: b.max_ltv_pct ?? '—',
      payoutType: b.payout_type,
      payoutPct: b.payout_pct,
      dsaPayoutPct: b.dsa_payout_pct,
      fixedPayout: b.fixed_payout,
      active: b.active !== false,
      slabs: (slabsByBank[b.id]||[]).map(s => {
        const rateVal = s.rate_type === 'floating' ? s.floating_rate : s.fixed_rate;
        const typeLabel = { fixed: 'Fixed', floating: 'Floating', ev: 'EV' }[s.rate_type] || '';
        return {
          label: s.slab_label || (s.score_min + '–' + s.score_max),
          roi: rateVal != null ? rateVal+'%' : '—',
          rateType: s.rate_type || 'fixed',
          typeLabel
        };
      }),
      payoutSlabs: payoutSlabsByBank[b.id] || []
    }));

    if (loading) loading.style.display = 'none';
    if (!banks.length) { if (empty) empty.style.display = 'block'; return; }
    if (table) table.style.display = '';
    renderBanks();
    console.log('Banks loaded:', banks.length);
  } catch(e) {
    if (loading) loading.style.display = 'none';
    console.error('loadBanks failed:', e.message);
  }
}

function resetBankFilters() {
  const searchEl = document.getElementById('banks-search');
  const typeEl   = document.getElementById('banks-type-filter');
  const statusEl = document.getElementById('banks-status-filter');
  if (searchEl) searchEl.value = '';
  if (typeEl) typeEl.value = '';
  if (statusEl) statusEl.value = '';
  renderBanks();
}

function renderBanks(){
  const searchEl = document.getElementById('banks-search');
  const typeEl   = document.getElementById('banks-type-filter');
  const statusEl = document.getElementById('banks-status-filter');
  const q        = (searchEl?.value || '').toLowerCase();
  const typeF    = typeEl?.value || '';
  const statusF  = statusEl?.value || '';

  const filtered = banks.filter(b => {
    if (q && !b.name.toLowerCase().includes(q)) return false;
    if (typeF && b.type !== typeF) return false;
    if (statusF === 'active' && !b.active) return false;
    if (statusF === 'inactive' && b.active) return false;
    return true;
  });

  const tbody = document.getElementById('banks-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--muted)">No banks match your search</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((b)=>{
    const idx = banks.indexOf(b);
    let payoutDisplay = '—';
    if (b.fixedPayout) payoutDisplay = '₹'+Number(b.fixedPayout).toLocaleString('en-IN')+'/file';
    else if (b.payoutPct) payoutDisplay = b.payoutPct+'%';
    else if (b.dsaPayoutPct) payoutDisplay = b.dsaPayoutPct+'%';

    const hasSlabs = b.slabs && b.slabs.length > 0;
    const topRoi = hasSlabs ? b.slabs[0].roi : '—';

    return `<tr>
    <td data-label="Bank / NBFC" style="font-weight:500">${b.name}</td>
    <td data-label="Type"><span class="badge ${typeBadge[b.type]||'badge-gray'}">${b.type}</span></td>
    <td data-label="Min CIBIL" style="font-family:'DM Mono',monospace;font-size:12.5px">${b.minCibil}</td>
    <td data-label="FOIR %" style="font-family:'DM Mono',monospace;font-size:12.5px">${b.foir}${b.foir!=='—'?'%':''}</td>
    <td data-label="LTV %" style="font-family:'DM Mono',monospace;font-size:12.5px">${b.ltv}${b.ltv!=='—'?'%':''}</td>
    <td data-label="Payout" style="font-family:'DM Mono',monospace;color:var(--green-text);font-weight:500;font-size:12.5px">${payoutDisplay}</td>
    <td data-label="ROI Slab">
      ${hasSlabs
        ? `<button class="btn btn-xs" onclick="showROISlab(event,${idx})" style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent);font-weight:600;border-color:var(--green-border);background:var(--green-bg)">
            ${topRoi} <i class="ti ti-chevron-down" style="font-size:10px"></i>
          </button>`
        : '<span style="color:var(--muted2);font-size:12px">No slabs set</span>'}
    </td>
    <td data-label="Status"><span class="badge ${b.active?'badge-green':'badge-gray'}">${b.active?'Active':'Inactive'}</span></td>
    <td data-label="Action" style="white-space:nowrap">
      <button class="btn btn-sm" onclick="openEditBankModal('${b.id}')">Edit</button>
      <button class="btn btn-sm" style="margin-left:4px" onclick="openEligibilityModal('${b.id}','${b.name.replace(/'/g,"\\'")}')"><i class="ti ti-list-check" style="font-size:11px"></i> Configure</button>
      <button class="btn btn-sm ${b.active?'btn-danger':''}" style="margin-left:4px" onclick="toggleBankActive('${b.id}',${idx})">${b.active?'Deactivate':'Activate'}</button>
    </td>
  </tr>`;
  }).join('');
}

async function toggleBankActive(bankId, idx) {
  const newActive = !banks[idx].active;
  try {
    const { error } = await db.from('banks').update({ active: newActive }).eq('id', bankId);
    if (error) { console.error('Toggle bank active error:', error.message); return; }
    banks[idx].active = newActive;
    renderBanks();
  } catch(e) { console.error('toggleBankActive failed:', e.message); }
}

function showROISlab(e,idx){
  e.stopPropagation();
  const popup=document.getElementById('roi-popup');
  const b=banks[idx];
  if (!b || !b.slabs || !b.slabs.length) return;
  popup.innerHTML=`
    <div style="font-weight:600;font-size:12px;margin-bottom:8px;color:var(--text)">${b.name} — ROI Slabs</div>
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">
      <span>CIBIL Range</span><span>Interest Rate</span>
    </div>
    ${b.slabs.map(s=>`<div class="roi-popup-row"><span style="color:var(--muted)">${s.label}</span><span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--accent)">${s.roi}${s.typeLabel?' <span style=\"font-size:9px;color:var(--muted)\">'+s.typeLabel+'</span>':''}</span></div>`).join('')}
  `;
  const rect=e.target.getBoundingClientRect();
  popup.style.left=(rect.left)+'px';
  popup.style.top=(rect.bottom+6)+'px';
  popup.style.display='block';
  setTimeout(()=>document.addEventListener('click',hideROISlab,{once:true}),10);
}
function hideROISlab(){document.getElementById('roi-popup').style.display='none';}

// ══════════════════════════════════════════════════════════════════════════
// ELIGIBILITY BY CATEGORY MODAL (bank_eligibility_categories)
// ══════════════════════════════════════════════════════════════════════════
const ELIG_DEFAULTS = { min_cibil: 700, min_income: 30000, max_foir_pct: 55, max_ltv_pct: 85, min_tenure_mo: 12, max_tenure_mo: 84, active: true };
let _eligBankId = null;
let _eligCache = {};            // emp_type -> { min_cibil, min_income, max_foir_pct, max_ltv_pct, min_tenure_mo, max_tenure_mo, active }
let _currentEligCategory = 'salaried';

async function openEligibilityModal(bankId, bankName) {
  _eligBankId = bankId;
  _currentEligCategory = 'salaried';
  document.getElementById('elig-modal-title').textContent = bankName + ' — Eligibility by Category';

  _eligCache = {
    salaried: { ...ELIG_DEFAULTS },
    self_employed: { ...ELIG_DEFAULTS },
    professional: { ...ELIG_DEFAULTS },
    pensioner: { ...ELIG_DEFAULTS },
  };

  try {
    const { data, error } = await db.from('bank_eligibility_categories').select('*').eq('bank_id', bankId);
    if (error) throw error;
    (data || []).forEach(row => {
      _eligCache[row.emp_type] = {
        min_cibil: row.min_cibil, min_income: row.min_income, max_foir_pct: row.max_foir_pct,
        max_ltv_pct: row.max_ltv_pct, min_tenure_mo: row.min_tenure_mo, max_tenure_mo: row.max_tenure_mo,
        active: row.active !== false
      };
    });
  } catch(e) {
    console.error('openEligibilityModal load failed:', e.message);
  }

  document.querySelectorAll('#elig-cat-tabs .itab').forEach(t => t.classList.remove('active'));
  document.querySelector('#elig-cat-tabs .itab[data-emp="salaried"]').classList.add('active');
  populateEligForm('salaried');
  document.getElementById('elig-error').style.display = 'none';
  document.getElementById('eligibility-modal').style.display = 'flex';
}

function switchEligCategory(empType) {
  // Carry over whatever's currently typed (even if unsaved) so switching
  // tabs back and forth doesn't silently discard in-progress edits.
  captureEligFormIntoCache(_currentEligCategory);

  document.querySelectorAll('#elig-cat-tabs .itab').forEach(t => t.classList.remove('active'));
  document.querySelector(`#elig-cat-tabs .itab[data-emp="${empType}"]`).classList.add('active');
  _currentEligCategory = empType;
  populateEligForm(empType);
  document.getElementById('elig-error').style.display = 'none';
}

function populateEligForm(empType) {
  const c = _eligCache[empType];
  document.getElementById('elig-cat-enabled').checked = c.active !== false;
  document.getElementById('elig-min-cibil').value = c.min_cibil ?? '';
  document.getElementById('elig-min-income').value = c.min_income ?? '';
  document.getElementById('elig-max-foir').value = c.max_foir_pct ?? '';
  document.getElementById('elig-max-ltv').value = c.max_ltv_pct ?? '';
  document.getElementById('elig-min-tenure').value = c.min_tenure_mo ?? '';
  document.getElementById('elig-max-tenure').value = c.max_tenure_mo ?? '';
  onEligEnabledChange();
}

function captureEligFormIntoCache(empType) {
  _eligCache[empType] = {
    active: document.getElementById('elig-cat-enabled').checked,
    min_cibil: numOrNullVal('elig-min-cibil'),
    min_income: numOrNullVal('elig-min-income'),
    max_foir_pct: numOrNullVal('elig-max-foir'),
    max_ltv_pct: numOrNullVal('elig-max-ltv'),
    min_tenure_mo: numOrNullVal('elig-min-tenure'),
    max_tenure_mo: numOrNullVal('elig-max-tenure'),
  };
}

function numOrNullVal(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}

function onEligEnabledChange() {
  const enabled = document.getElementById('elig-cat-enabled').checked;
  document.getElementById('elig-cat-fields').style.opacity = enabled ? '1' : '.4';
  document.querySelectorAll('#elig-cat-fields input').forEach(i => i.disabled = !enabled);
}

function closeEligibilityModal() {
  document.getElementById('eligibility-modal').style.display = 'none';
}

async function saveEligibilityCategory() {
  const errEl = document.getElementById('elig-error');
  captureEligFormIntoCache(_currentEligCategory);
  const c = _eligCache[_currentEligCategory];

  const payload = {
    bank_id: _eligBankId,
    emp_type: _currentEligCategory,
    min_cibil: c.min_cibil, min_income: c.min_income, max_foir_pct: c.max_foir_pct,
    max_ltv_pct: c.max_ltv_pct, min_tenure_mo: c.min_tenure_mo, max_tenure_mo: c.max_tenure_mo,
    active: c.active, updated_at: new Date().toISOString()
  };

  try {
    const { error } = await db.from('bank_eligibility_categories').upsert(payload, { onConflict: 'bank_id,emp_type' });
    if (error) throw error;
    errEl.style.display = 'none';
    showBanksFlash(humanEmpLabel(_currentEligCategory) + ' eligibility saved');
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

function humanEmpLabel(empType) {
  return { salaried: 'Salaried', self_employed: 'Self-Employed', professional: 'Professional', pensioner: 'Pensioner' }[empType] || empType;
}

function showBanksFlash(msg, isError=false) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${isError?'#B91C1C':'#1A4F3A'};color:white;padding:10px 20px;border-radius:30px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.2)`;
  f.textContent = msg;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2800);
}

// ══════════════════════════════════════════════════════════════════════════
// BANK ADD/EDIT MODAL
// ══════════════════════════════════════════════════════════════════════════
let _bankModalMode = 'add';   // 'add' | 'edit'
let _editingBankId = null;
let _roiSlabsCache = [];
let _payoutSlabsCache = [];
let _editingROISlabId = null;     // null = currently adding a new slab
let _editingPayoutSlabId = null;  // null = currently adding a new slab

function openAddBankModal() {
  _bankModalMode = 'add';
  _editingBankId = null;
  _roiSlabsCache = [];
  _payoutSlabsCache = [];

  document.getElementById('bank-modal-title').textContent = 'Add New Bank';
  document.getElementById('bank-modal-subtitle').textContent = 'Save bank details first, then configure slabs';
  document.getElementById('bm-name').value = '';
  document.getElementById('bm-short-name').value = '';
  document.getElementById('bm-type').value = 'PVT Bank';
  document.getElementById('bm-payout-type').value = 'flat_pct';
  document.getElementById('bm-payout-pct').value = '';
  document.getElementById('bm-fixed-payout').value = '';
  document.getElementById('bm-notes').value = '';
  onPayoutTypeChange();
  document.getElementById('bm-error').style.display = 'none';
  document.getElementById('bm-save-btn').textContent = 'Create bank';

  // Slabs need a saved bank_id, so lock those tabs until this bank exists.
  setBankModalTabLocked(true);
  switchBankModalTab('details');
  document.getElementById('bank-modal').style.display = 'flex';
}

async function openEditBankModal(bankId) {
  _bankModalMode = 'edit';
  _editingBankId = bankId;

  const { data: b, error } = await db.from('banks').select('*').eq('id', bankId).single();
  if (error || !b) { console.error('Could not load bank:', error?.message); return; }

  document.getElementById('bank-modal-title').textContent = b.name;
  document.getElementById('bank-modal-subtitle').textContent = 'Payout and rate slabs';
  document.getElementById('bm-name').value = b.name || '';
  document.getElementById('bm-short-name').value = b.short_name || '';
  document.getElementById('bm-type').value = b.type || 'PVT Bank';

  const payoutType = b.payout_type || 'flat_pct';
  document.getElementById('bm-payout-type').value = payoutType;
  document.getElementById('bm-payout-pct').value = b.payout_pct ?? '';
  document.getElementById('bm-fixed-payout').value = b.fixed_payout ?? '';
  onPayoutTypeChange();

  document.getElementById('bm-notes').value = b.notes || '';
  document.getElementById('bm-error').style.display = 'none';
  document.getElementById('bm-save-btn').textContent = 'Save changes';

  setBankModalTabLocked(false);
  await Promise.all([loadROISlabsForModal(bankId), loadPayoutSlabsForModal(bankId)]);
  switchBankModalTab('details');
  document.getElementById('bank-modal').style.display = 'flex';
}

function closeBankModal() {
  document.getElementById('bank-modal').style.display = 'none';
}

function setBankModalTabLocked(locked) {
  ['bm-tab-roi', 'bm-tab-payout'].forEach(id => {
    const tab = document.getElementById(id);
    if (!tab) return;
    tab.style.opacity = locked ? '.4' : '';
    tab.style.cursor = locked ? 'not-allowed' : 'pointer';
    tab.onclick = locked ? null : (id === 'bm-tab-roi' ? () => switchBankModalTab('roi') : () => switchBankModalTab('payout'));
  });
  document.getElementById('bm-roi-locked').style.display = locked ? 'block' : 'none';
  document.getElementById('bm-roi-content').style.display = locked ? 'none' : 'block';
  document.getElementById('bm-payout-locked').style.display = locked ? 'block' : 'none';
  document.getElementById('bm-payout-content').style.display = locked ? 'none' : 'block';
}

function switchBankModalTab(tab) {
  document.querySelectorAll('#bank-modal .itab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#bank-modal .itab-pane').forEach(p => p.classList.remove('on'));
  document.getElementById('bm-tab-' + tab).classList.add('active');
  document.getElementById('bm-pane-' + tab).classList.add('on');
}

function onPayoutTypeChange() {
  const type = document.getElementById('bm-payout-type').value;
  document.getElementById('bm-payout-flat-fields').style.display = type === 'flat_pct' ? 'block' : 'none';
  document.getElementById('bm-payout-fixed-fields').style.display = type === 'fixed_per_file' ? 'block' : 'none';
  document.getElementById('bm-payout-slab-note').style.display = type === 'slab' ? 'block' : 'none';
}

async function saveBankDetails() {
  const errEl = document.getElementById('bm-error');
  const btn = document.getElementById('bm-save-btn');
  const name = document.getElementById('bm-name').value.trim();
  const type = document.getElementById('bm-type').value;

  if (!name) {
    errEl.textContent = 'Bank/NBFC name is required';
    errEl.style.display = 'block';
    return;
  }

  const payload = {
    name,
    short_name: document.getElementById('bm-short-name').value.trim() || null,
    type,
    notes: document.getElementById('bm-notes').value.trim() || null,
  };

  btn.disabled = true;
  btn.textContent = 'Saving...';
  errEl.style.display = 'none';

  try {
    if (_bankModalMode === 'edit') {
      const { error } = await db.from('banks').update(payload).eq('id', _editingBankId);
      if (error) throw error;
    } else {
      const { data, error } = await db.from('banks').insert({ ...payload, active: true }).select().single();
      if (error) throw error;
      // Switch into edit mode for this newly-created bank so slabs can now be added
      _bankModalMode = 'edit';
      _editingBankId = data.id;
      document.getElementById('bank-modal-title').textContent = data.name;
      document.getElementById('bank-modal-subtitle').textContent = 'Payout and rate slabs';
      document.getElementById('bm-save-btn').textContent = 'Save changes';
      setBankModalTabLocked(false);
      _roiSlabsCache = [];
      _payoutSlabsCache = [];
      renderROISlabsTable();
      renderPayoutSlabsTable();
    }

    await loadBanks();
    btn.textContent = _bankModalMode === 'edit' ? 'Save changes' : 'Create bank';
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false;
}

function numOrNull(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}

async function savePayoutType() {
  const errEl = document.getElementById('bm-payout-type-error');
  const payoutType = document.getElementById('bm-payout-type').value;

  const payload = {
    payout_type: payoutType,
    payout_pct: payoutType === 'flat_pct' ? numOrNull('bm-payout-pct') : null,
    fixed_payout: payoutType === 'fixed_per_file' ? numOrNull('bm-fixed-payout') : null,
  };

  try {
    const { error } = await db.from('banks').update(payload).eq('id', _editingBankId);
    if (error) throw error;
    errEl.style.display = 'none';
    showBanksFlash('Payout type saved');
    await loadBanks();
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ROI SLABS (bank_rate_slabs)
// ══════════════════════════════════════════════════════════════════════════
async function loadROISlabsForModal(bankId) {
  try {
    const { data, error } = await db.from('bank_rate_slabs').select('*').eq('bank_id', bankId).order('score_min', { ascending: false });
    if (error) throw error;
    _roiSlabsCache = data || [];
  } catch(e) {
    console.error('loadROISlabsForModal failed:', e.message);
    _roiSlabsCache = [];
  }
  renderROISlabsTable();
}

function renderROISlabsTable() {
  const tbody = document.getElementById('roi-slabs-tbody');
  const table = document.getElementById('roi-slabs-table');
  const empty = document.getElementById('roi-slabs-empty');
  if (!tbody) return;

  if (!_roiSlabsCache.length) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = '';
  empty.style.display = 'none';

  const rateTypeBadge = { fixed: 'badge-blue', floating: 'badge-gray', ev: 'badge-green' };
  const rateTypeLabel = { fixed: 'Fixed', floating: 'Floating', ev: 'EV' };

  tbody.innerHTML = _roiSlabsCache.map(s => {
    const rateVal = s.rate_type === 'floating' ? s.floating_rate : s.fixed_rate;
    const rate = rateVal != null
      ? `${rateVal}% <span class="badge ${rateTypeBadge[s.rate_type]||'badge-gray'}" style="margin-left:4px">${rateTypeLabel[s.rate_type]||s.rate_type}</span>`
      : '—';
    const tenure = (s.min_tenure_mo || s.max_tenure_mo) ? `${s.min_tenure_mo ?? '—'}–${s.max_tenure_mo ?? '—'} mo` : '—';
    return `<tr>
      <td data-label="Label" style="font-weight:500">${s.slab_label}</td>
      <td data-label="CIBIL Range" style="font-family:'DM Mono',monospace;font-size:12px">${s.score_min}–${s.score_max}</td>
      <td data-label="Rate" style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent);font-weight:600">${rate}</td>
      <td data-label="Tenure" style="font-size:12px;color:var(--muted)">${tenure}</td>
      <td data-label="Status"><span class="badge ${s.active!==false?'badge-green':'badge-gray'}">${s.active!==false?'Active':'Inactive'}</span></td>
      <td data-label="Action" style="white-space:nowrap">
        <button class="btn btn-xs" onclick="editROISlab('${s.id}')"><i class="ti ti-edit" style="font-size:11px"></i></button>
        <button class="btn btn-xs btn-danger" style="margin-left:4px" onclick="deleteROISlab('${s.id}')"><i class="ti ti-trash" style="font-size:11px"></i></button>
      </td>
    </tr>`;
  }).join('');
}

const RATE_TYPES = ['fixed', 'floating', 'ev'];

function onRateTypeCheckChange() {
  RATE_TYPES.forEach(t => {
    const checked = document.getElementById('roi-check-' + t).checked;
    document.getElementById('roi-rate-' + t + '-wrap').style.display = checked ? 'block' : 'none';
  });
}

function editROISlab(slabId) {
  const s = _roiSlabsCache.find(x => x.id === slabId);
  if (!s) return;
  _editingROISlabId = slabId;
  document.getElementById('roi-label').value = s.slab_label || '';
  document.getElementById('roi-score-min').value = s.score_min ?? '';
  document.getElementById('roi-score-max').value = s.score_max ?? '';

  // Editing an existing row only ever represents one rate_type — check just
  // that one box and fill its value. Checking additional boxes while editing
  // is still allowed (saveROISlab treats the original type as an update and
  // any extra checked types as new rows).
  RATE_TYPES.forEach(t => {
    document.getElementById('roi-check-' + t).checked = (t === s.rate_type);
    document.getElementById('roi-rate-' + t).value = '';
  });
  document.getElementById('roi-rate-' + s.rate_type).value = (s.rate_type === 'floating' ? s.floating_rate : s.fixed_rate) ?? '';
  onRateTypeCheckChange();

  document.getElementById('roi-min-tenure').value = s.min_tenure_mo ?? '';
  document.getElementById('roi-max-tenure').value = s.max_tenure_mo ?? '';
  document.getElementById('roi-notes').value = s.notes || '';
  document.getElementById('bm-roi-form-title').textContent = 'Edit ROI Slab';
  document.getElementById('roi-save-btn').innerHTML = '<i class="ti ti-check" style="font-size:11px"></i> Save changes';
  document.getElementById('roi-cancel-btn').style.display = '';
  document.getElementById('roi-form-error').style.display = 'none';
}

function cancelROISlabEdit() {
  _editingROISlabId = null;
  document.getElementById('roi-label').value = '';
  document.getElementById('roi-score-min').value = '';
  document.getElementById('roi-score-max').value = '';
  RATE_TYPES.forEach(t => {
    document.getElementById('roi-check-' + t).checked = false;
    document.getElementById('roi-rate-' + t).value = '';
  });
  onRateTypeCheckChange();
  document.getElementById('roi-min-tenure').value = '';
  document.getElementById('roi-max-tenure').value = '';
  document.getElementById('roi-notes').value = '';
  document.getElementById('bm-roi-form-title').textContent = 'Add ROI Slab';
  document.getElementById('roi-save-btn').innerHTML = '<i class="ti ti-plus" style="font-size:11px"></i> Add slab';
  document.getElementById('roi-cancel-btn').style.display = 'none';
  document.getElementById('roi-form-error').style.display = 'none';
}

async function saveROISlab() {
  const errEl = document.getElementById('roi-form-error');
  const label = document.getElementById('roi-label').value.trim();
  const scoreMin = document.getElementById('roi-score-min').value;
  const scoreMax = document.getElementById('roi-score-max').value;
  const minTenure = document.getElementById('roi-min-tenure').value !== '' ? parseInt(document.getElementById('roi-min-tenure').value) : null;
  const maxTenure = document.getElementById('roi-max-tenure').value !== '' ? parseInt(document.getElementById('roi-max-tenure').value) : null;
  const notes = document.getElementById('roi-notes').value.trim() || null;

  if (!label || scoreMin === '' || scoreMax === '') {
    errEl.textContent = 'Slab label, CIBIL min, and CIBIL max are required';
    errEl.style.display = 'block';
    return;
  }

  // Collect every checked type that also has a rate value filled in.
  const entries = RATE_TYPES
    .filter(t => document.getElementById('roi-check-' + t).checked)
    .map(t => ({ type: t, value: document.getElementById('roi-rate-' + t).value }))
    .filter(e => e.value !== '');

  if (!entries.length) {
    errEl.textContent = 'Check at least one rate scheme and enter its rate %';
    errEl.style.display = 'block';
    return;
  }

  const basePayload = {
    bank_id: _editingBankId,
    slab_label: label,
    score_min: parseInt(scoreMin),
    score_max: parseInt(scoreMax),
    min_tenure_mo: minTenure,
    max_tenure_mo: maxTenure,
    notes,
  };

  try {
    // If editing, the original row's rate_type gets updated in place; any
    // other checked types are inserted as additional new slab rows sharing
    // the same label/CIBIL range/tenure.
    const editingSlab = _editingROISlabId ? _roiSlabsCache.find(x => x.id === _editingROISlabId) : null;

    for (const entry of entries) {
      const rowPayload = {
        ...basePayload,
        rate_type: entry.type,
        fixed_rate: entry.type !== 'floating' ? parseFloat(entry.value) : null,
        floating_rate: entry.type === 'floating' ? parseFloat(entry.value) : null,
      };

      if (editingSlab && entry.type === editingSlab.rate_type) {
        const { error } = await db.from('bank_rate_slabs').update(rowPayload).eq('id', _editingROISlabId);
        if (error) throw error;
      } else {
        const { error } = await db.from('bank_rate_slabs').insert({ ...rowPayload, active: true });
        if (error) throw error;
      }
    }

    cancelROISlabEdit();
    await loadROISlabsForModal(_editingBankId);
    await loadBanks();
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function deleteROISlab(slabId) {
  try {
    const { error } = await db.from('bank_rate_slabs').delete().eq('id', slabId);
    if (error) throw error;
    await loadROISlabsForModal(_editingBankId);
    await loadBanks();
  } catch(e) { console.error('deleteROISlab failed:', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// PAYOUT SLABS (bank_payout_slabs)
// ══════════════════════════════════════════════════════════════════════════
async function loadPayoutSlabsForModal(bankId) {
  try {
    const { data, error } = await db.from('bank_payout_slabs').select('*').eq('bank_id', bankId).order('loan_from');
    if (error) throw error;
    _payoutSlabsCache = data || [];
  } catch(e) {
    console.error('loadPayoutSlabsForModal failed:', e.message);
    _payoutSlabsCache = [];
  }
  renderPayoutSlabsTable();
}

function renderPayoutSlabsTable() {
  const tbody = document.getElementById('payout-slabs-tbody');
  const table = document.getElementById('payout-slabs-table');
  const empty = document.getElementById('payout-slabs-empty');
  if (!tbody) return;

  if (!_payoutSlabsCache.length) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = _payoutSlabsCache.map(s => `
    <tr>
      <td data-label="Loan Range (₹)" style="font-family:'DM Mono',monospace;font-size:12px">₹${Number(s.loan_from).toLocaleString('en-IN')} – ₹${Number(s.loan_to).toLocaleString('en-IN')}</td>
      <td data-label="Payout %" style="font-family:'DM Mono',monospace;font-size:12.5px;color:var(--green-text);font-weight:600">${s.payout_pct}%</td>
      <td data-label="Status"><span class="badge ${s.active!==false?'badge-green':'badge-gray'}">${s.active!==false?'Active':'Inactive'}</span></td>
      <td data-label="Action" style="white-space:nowrap">
        <button class="btn btn-xs" onclick="editPayoutSlab('${s.id}')"><i class="ti ti-edit" style="font-size:11px"></i></button>
        <button class="btn btn-xs btn-danger" style="margin-left:4px" onclick="deletePayoutSlab('${s.id}')"><i class="ti ti-trash" style="font-size:11px"></i></button>
      </td>
    </tr>`).join('');
}

function editPayoutSlab(slabId) {
  const s = _payoutSlabsCache.find(x => x.id === slabId);
  if (!s) return;
  _editingPayoutSlabId = slabId;
  document.getElementById('payout-loan-from').value = s.loan_from ?? '';
  document.getElementById('payout-loan-to').value = s.loan_to ?? '';
  document.getElementById('payout-pct').value = s.payout_pct ?? '';
  document.getElementById('bm-payout-form-title').textContent = 'Edit Payout Slab';
  document.getElementById('payout-save-btn').innerHTML = '<i class="ti ti-check" style="font-size:11px"></i> Save changes';
  document.getElementById('payout-cancel-btn').style.display = '';
  document.getElementById('payout-form-error').style.display = 'none';
}

function cancelPayoutSlabEdit() {
  _editingPayoutSlabId = null;
  document.getElementById('payout-loan-from').value = '';
  document.getElementById('payout-loan-to').value = '';
  document.getElementById('payout-pct').value = '';
  document.getElementById('bm-payout-form-title').textContent = 'Add Payout Slab';
  document.getElementById('payout-save-btn').innerHTML = '<i class="ti ti-plus" style="font-size:11px"></i> Add slab';
  document.getElementById('payout-cancel-btn').style.display = 'none';
  document.getElementById('payout-form-error').style.display = 'none';
}

async function savePayoutSlab() {
  const errEl = document.getElementById('payout-form-error');
  const loanFrom = document.getElementById('payout-loan-from').value;
  const loanTo = document.getElementById('payout-loan-to').value;
  const pct = document.getElementById('payout-pct').value;

  if (loanFrom === '' || loanTo === '' || pct === '') {
    errEl.textContent = 'Loan from, loan to, and payout % are all required';
    errEl.style.display = 'block';
    return;
  }
  if (parseFloat(loanTo) <= parseFloat(loanFrom)) {
    errEl.textContent = '"Loan To" must be greater than "Loan From"';
    errEl.style.display = 'block';
    return;
  }

  const payload = {
    bank_id: _editingBankId,
    loan_from: parseFloat(loanFrom),
    loan_to: parseFloat(loanTo),
    payout_pct: parseFloat(pct),
  };

  try {
    if (_editingPayoutSlabId) {
      const { error } = await db.from('bank_payout_slabs').update(payload).eq('id', _editingPayoutSlabId);
      if (error) throw error;
    } else {
      const { error } = await db.from('bank_payout_slabs').insert({ ...payload, active: true });
      if (error) throw error;
    }
    cancelPayoutSlabEdit();
    await loadPayoutSlabsForModal(_editingBankId);
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function deletePayoutSlab(slabId) {
  try {
    const { error } = await db.from('bank_payout_slabs').delete().eq('id', slabId);
    if (error) throw error;
    await loadPayoutSlabsForModal(_editingBankId);
  } catch(e) { console.error('deletePayoutSlab failed:', e.message); }
}


// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  await loadBanks();
});
loadIdentity();
