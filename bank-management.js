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
      <button class="btn btn-sm">Edit</button>
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


// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  await loadBanks();
});
loadIdentity();
