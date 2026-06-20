// ══════════════════════════════════════════════════════════════════════════
// BANK-MANAGEMENT.JS
// ══════════════════════════════════════════════════════════════════════════

let banks=[]; // populated live by loadBanks()

const typeBadge={
  'Bank':    'badge-blue',
  'PSU':     'badge-gold',
  'NBFC':    'badge-purple',
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
      slabs: (slabsByBank[b.id]||[]).map(s => ({
        label: s.slab_label || (s.score_min + '–' + s.score_max),
        roi: s.fixed_rate ? s.fixed_rate+'%' : (s.floating_rate ? s.floating_rate+'%' : '—')
      })),
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

function renderBanks(){
  const searchEl = document.getElementById('banks-search');
  const typeEl   = document.getElementById('banks-type-filter');
  const q        = (searchEl?.value || '').toLowerCase();
  const typeF    = typeEl?.value || '';

  const filtered = banks.filter(b => {
    if (q && !b.name.toLowerCase().includes(q)) return false;
    if (typeF && b.type !== typeF) return false;
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
    else if (b.dsaPayoutPct) payoutDisplay = b.dsaPayoutPct+'%';
    else if (b.payoutPct) payoutDisplay = b.payoutPct+'%';

    const hasSlabs = b.slabs && b.slabs.length > 0;
    const topRoi = hasSlabs ? b.slabs[0].roi : '—';

    return `<tr>
    <td style="font-weight:500">${b.name}</td>
    <td><span class="badge ${typeBadge[b.type]||'badge-gray'}">${b.type}</span></td>
    <td style="font-family:'DM Mono',monospace;font-size:12.5px">${b.minCibil}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12.5px">${b.foir}${b.foir!=='—'?'%':''}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12.5px">${b.ltv}${b.ltv!=='—'?'%':''}</td>
    <td style="font-family:'DM Mono',monospace;color:var(--green-text);font-weight:500;font-size:12.5px">${payoutDisplay}</td>
    <td>
      ${hasSlabs
        ? `<button class="btn btn-xs" onclick="showROISlab(event,${idx})" style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent);font-weight:600;border-color:var(--green-border);background:var(--green-bg)">
            ${topRoi} <i class="ti ti-chevron-down" style="font-size:10px"></i>
          </button>`
        : '<span style="color:var(--muted2);font-size:12px">No slabs set</span>'}
    </td>
    <td><span class="badge ${b.active?'badge-green':'badge-gray'}">${b.active?'Active':'Inactive'}</span></td>
    <td style="white-space:nowrap">
      <button class="btn btn-sm" onclick="openEditBankModal('${b.id}')">Edit</button>
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
    ${b.slabs.map(s=>`<div class="roi-popup-row"><span style="color:var(--muted)">${s.label}</span><span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--accent)">${s.roi}</span></div>`).join('')}
  `;
  const rect=e.target.getBoundingClientRect();
  popup.style.left=(rect.left)+'px';
  popup.style.top=(rect.bottom+6)+'px';
  popup.style.display='block';
  setTimeout(()=>document.addEventListener('click',hideROISlab,{once:true}),10);
}
function hideROISlab(){document.getElementById('roi-popup').style.display='none';}

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
  document.getElementById('bm-type').value = 'Bank';
  document.getElementById('bm-min-cibil').value = 700;
  document.getElementById('bm-min-income').value = 30000;
  document.getElementById('bm-max-foir').value = 55;
  document.getElementById('bm-max-ltv').value = 85;
  document.getElementById('bm-min-tenure').value = 12;
  document.getElementById('bm-max-tenure').value = 84;
  document.getElementById('bm-max-loan').value = '';
  document.getElementById('bm-emp-salaried').checked = true;
  document.getElementById('bm-emp-self').checked = true;
  document.getElementById('bm-emp-prof').checked = true;
  document.getElementById('bm-emp-pension').checked = true;
  document.getElementById('bm-payout-type').value = 'percentage';
  document.getElementById('bm-payout-value').value = '';
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
  document.getElementById('bank-modal-subtitle').textContent = 'Eligibility, payout, and rate slabs';
  document.getElementById('bm-name').value = b.name || '';
  document.getElementById('bm-short-name').value = b.short_name || '';
  document.getElementById('bm-type').value = b.type || 'Bank';
  document.getElementById('bm-min-cibil').value = b.min_cibil ?? '';
  document.getElementById('bm-min-income').value = b.min_income ?? '';
  document.getElementById('bm-max-foir').value = b.max_foir_pct ?? '';
  document.getElementById('bm-max-ltv').value = b.max_ltv_pct ?? '';
  document.getElementById('bm-min-tenure').value = b.min_tenure_mo ?? '';
  document.getElementById('bm-max-tenure').value = b.max_tenure_mo ?? '';
  document.getElementById('bm-max-loan').value = b.max_loan ?? '';

  const empTypes = b.emp_types || [];
  document.getElementById('bm-emp-salaried').checked = empTypes.includes('salaried');
  document.getElementById('bm-emp-self').checked = empTypes.includes('self_employed');
  document.getElementById('bm-emp-prof').checked = empTypes.includes('professional');
  document.getElementById('bm-emp-pension').checked = empTypes.includes('pensioner');

  const payoutType = b.payout_type || (b.fixed_payout ? 'fixed' : b.dsa_payout_pct ? 'dsa_percentage' : 'percentage');
  document.getElementById('bm-payout-type').value = payoutType;
  document.getElementById('bm-payout-value').value =
    payoutType === 'fixed' ? (b.fixed_payout ?? '') :
    payoutType === 'dsa_percentage' ? (b.dsa_payout_pct ?? '') :
    (b.payout_pct ?? '');
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
  const label = document.getElementById('bm-payout-value-label');
  const input = document.getElementById('bm-payout-value');
  if (type === 'fixed') {
    label.textContent = 'Fixed Payout (₹/file)';
    input.placeholder = 'e.g. 5000';
  } else if (type === 'dsa_percentage') {
    label.textContent = 'DSA Payout %';
    input.placeholder = 'e.g. 1.2';
  } else {
    label.textContent = 'Payout %';
    input.placeholder = 'e.g. 1.5';
  }
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

  const empTypes = [];
  if (document.getElementById('bm-emp-salaried').checked) empTypes.push('salaried');
  if (document.getElementById('bm-emp-self').checked) empTypes.push('self_employed');
  if (document.getElementById('bm-emp-prof').checked) empTypes.push('professional');
  if (document.getElementById('bm-emp-pension').checked) empTypes.push('pensioner');

  const payoutType = document.getElementById('bm-payout-type').value;
  const payoutValRaw = document.getElementById('bm-payout-value').value;
  const payoutVal = payoutValRaw !== '' ? parseFloat(payoutValRaw) : null;

  const payload = {
    name,
    short_name: document.getElementById('bm-short-name').value.trim() || null,
    type,
    min_cibil: numOrNull('bm-min-cibil'),
    min_income: numOrNull('bm-min-income'),
    max_foir_pct: numOrNull('bm-max-foir'),
    max_ltv_pct: numOrNull('bm-max-ltv'),
    min_tenure_mo: numOrNull('bm-min-tenure'),
    max_tenure_mo: numOrNull('bm-max-tenure'),
    max_loan: numOrNull('bm-max-loan'),
    emp_types: empTypes,
    payout_type: payoutType,
    payout_pct: payoutType === 'percentage' ? payoutVal : null,
    dsa_payout_pct: payoutType === 'dsa_percentage' ? payoutVal : null,
    fixed_payout: payoutType === 'fixed' ? payoutVal : null,
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
      document.getElementById('bank-modal-subtitle').textContent = 'Eligibility, payout, and rate slabs';
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

  tbody.innerHTML = _roiSlabsCache.map(s => {
    const rate = s.fixed_rate ? s.fixed_rate + '% fixed' : s.floating_rate ? s.floating_rate + '% floating' : '—';
    const tenure = (s.min_tenure_mo || s.max_tenure_mo) ? `${s.min_tenure_mo ?? '—'}–${s.max_tenure_mo ?? '—'} mo` : '—';
    return `<tr>
      <td style="font-weight:500">${s.slab_label}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${s.score_min}–${s.score_max}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent);font-weight:600">${rate}</td>
      <td style="font-size:12px;color:var(--muted)">${tenure}</td>
      <td><span class="badge ${s.active!==false?'badge-green':'badge-gray'}">${s.active!==false?'Active':'Inactive'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-xs" onclick="editROISlab('${s.id}')"><i class="ti ti-edit" style="font-size:11px"></i></button>
        <button class="btn btn-xs btn-danger" style="margin-left:4px" onclick="deleteROISlab('${s.id}')"><i class="ti ti-trash" style="font-size:11px"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function editROISlab(slabId) {
  const s = _roiSlabsCache.find(x => x.id === slabId);
  if (!s) return;
  _editingROISlabId = slabId;
  document.getElementById('roi-label').value = s.slab_label || '';
  document.getElementById('roi-score-min').value = s.score_min ?? '';
  document.getElementById('roi-score-max').value = s.score_max ?? '';
  document.getElementById('roi-fixed-rate').value = s.fixed_rate ?? '';
  document.getElementById('roi-floating-rate').value = s.floating_rate ?? '';
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
  document.getElementById('roi-fixed-rate').value = '';
  document.getElementById('roi-floating-rate').value = '';
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
  const fixedRate = document.getElementById('roi-fixed-rate').value;
  const floatingRate = document.getElementById('roi-floating-rate').value;

  if (!label || scoreMin === '' || scoreMax === '') {
    errEl.textContent = 'Slab label, CIBIL min, and CIBIL max are required';
    errEl.style.display = 'block';
    return;
  }
  if (!fixedRate && !floatingRate) {
    errEl.textContent = 'Enter either a fixed rate or a floating rate';
    errEl.style.display = 'block';
    return;
  }

  const payload = {
    bank_id: _editingBankId,
    slab_label: label,
    score_min: parseInt(scoreMin),
    score_max: parseInt(scoreMax),
    fixed_rate: fixedRate !== '' ? parseFloat(fixedRate) : null,
    floating_rate: floatingRate !== '' ? parseFloat(floatingRate) : null,
    min_tenure_mo: document.getElementById('roi-min-tenure').value !== '' ? parseInt(document.getElementById('roi-min-tenure').value) : null,
    max_tenure_mo: document.getElementById('roi-max-tenure').value !== '' ? parseInt(document.getElementById('roi-max-tenure').value) : null,
    notes: document.getElementById('roi-notes').value.trim() || null,
  };

  try {
    if (_editingROISlabId) {
      const { error } = await db.from('bank_rate_slabs').update(payload).eq('id', _editingROISlabId);
      if (error) throw error;
    } else {
      const { error } = await db.from('bank_rate_slabs').insert({ ...payload, active: true });
      if (error) throw error;
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
      <td style="font-family:'DM Mono',monospace;font-size:12px">₹${Number(s.loan_from).toLocaleString('en-IN')} – ₹${Number(s.loan_to).toLocaleString('en-IN')}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12.5px;color:var(--green-text);font-weight:600">${s.payout_pct}%</td>
      <td><span class="badge ${s.active!==false?'badge-green':'badge-gray'}">${s.active!==false?'Active':'Inactive'}</span></td>
      <td style="white-space:nowrap">
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
