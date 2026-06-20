// ══════════════════════════════════════════════════════════════════════════
// TEAM-PERFORMANCE.JS
// ══════════════════════════════════════════════════════════════════════════

async function loadTeamPerformance(currentUserObj) {
  const kpiWrap    = document.getElementById('team-kpis');
  const detailWrap = document.getElementById('team-detail');
  if (!kpiWrap && !detailWrap) return; // tab markup not present

  try {
    // 1. Get all active team members (BMs + RMs) who report into this org,
    //    or everyone if current user is city_head
    const { data: members, error: uErr } = await db.from('users')
      .select('id,name,role,color,reports_to,monthly_target,active')
      .eq('active', true)
      .in('role', ['bm','rm']);
    if (uErr) { console.error('Team members fetch error:', uErr.message); return; }
    if (!members || !members.length) {
      if (kpiWrap) kpiWrap.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">No team members found.</div>';
      if (detailWrap) detailWrap.innerHTML = '';
      return;
    }

    // 2. Get this month's targets for all of them
    const monthStart = new Date(); monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const { data: targets, error: tErr } = await db.from('team_targets')
      .select('user_id,month,file_target,sanction_target,disbursal_target,loan_amt_target')
      .eq('month', monthStartStr);
    if (tErr) console.error('Targets fetch error:', tErr.message);

    const targetMap = {};
    (targets||[]).forEach(t => { targetMap[t.user_id] = t; });

    // 3. Use already-loaded `cases` array (from loadLiveCases) to count per-member stats
    //    cases[].member holds created_by_name (display name) — match by name since that's
    //    what's available; for exact correctness this assumes unique names across the team.
    const statsByName = {};
    (window.cases||[]).forEach(cs => {
      const name = cs.member;
      if (!name || name === '—') return;
      if (!statsByName[name]) statsByName[name] = { files:0, sanctioned:0, payout:0 };
      statsByName[name].files += 1;
      if (['Sanctioned','Disbursed'].includes(cs.status)) statsByName[name].sanctioned += 1;
      statsByName[name].payout += (cs.payout||0);
    });

    // 4. Build combined member stat objects
    const memberStats = members.map(m => {
      const s = statsByName[m.name] || { files:0, sanctioned:0, payout:0 };
      const tgt = targetMap[m.id] || {};
      const fileTarget = tgt.file_target || m.monthly_target || 8;
      const hitRate = fileTarget > 0 ? Math.round((s.sanctioned / fileTarget) * 100) : 0;
      return {
        id: m.id, name: m.name, role: (m.role||'').toUpperCase(),
        color: m.color || '#1A4F3A',
        files: s.files, sanctioned: s.sanctioned, payout: s.payout,
        fileTarget, hitRate: Math.min(hitRate,100)
      };
    }).sort((a,b) => b.sanctioned - a.sanctioned);

    // 5. Render top KPI strip (top 6 by sanctioned)
    if (kpiWrap) {
      const top6 = memberStats.slice(0,6);
      if (!top6.length) {
        kpiWrap.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">No team activity yet this month.</div>';
      } else {
        kpiWrap.innerHTML = top6.map(m => {
          const ini = m.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
          return `<div class="kpi">
            <div class="kpi-icon" style="background:${m.color}18;color:${m.color}">
              <div style="width:26px;height:26px;border-radius:50%;background:${m.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white">${ini}</div>
            </div>
            <div class="kpi-label">${m.name}</div>
            <div class="kpi-value" style="color:${m.color};font-size:26px">${m.sanctioned}</div>
            <div class="kpi-sub" style="margin-bottom:4px">sanctioned of ${m.files} files</div>
          </div>`;
        }).join('');
      }
    }

    // 6. Render full team detail list
    if (detailWrap) {
      if (!memberStats.length) {
        detailWrap.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">No team members found.</div>';
      } else {
        detailWrap.innerHTML = memberStats.map(m => {
          const ini = m.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
          const rateColor = m.hitRate >= 50 ? 'var(--green-text)' : m.hitRate >= 30 ? 'var(--amber-text)' : 'var(--red-text)';
          const payoutFmt = m.payout >= 100000 ? '₹'+(m.payout/100000).toFixed(2)+'L' : '₹'+m.payout.toLocaleString('en-IN');
          return `<div class="member-row">
            <div class="avatar" style="background:${m.color};width:38px;height:38px;font-size:13px">${ini}</div>
            <div class="member-info" style="flex:1">
              <div class="member-name">${m.name} <span style="font-size:11px;color:var(--muted);font-weight:400">${m.role}</span></div>
              <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:9px">
                <div class="stat-item"><div class="stat-val">${m.files}</div><div class="stat-lbl">Files</div></div>
                <div class="stat-item"><div class="stat-val" style="color:var(--green-text)">${m.sanctioned}</div><div class="stat-lbl">Sanct.</div></div>
                <div class="stat-item"><div class="stat-val">${m.fileTarget}</div><div class="stat-lbl">Target</div></div>
                <div class="stat-item"><div class="stat-val" style="color:${rateColor}">${m.hitRate}%</div><div class="stat-lbl">Hit rate</div></div>
                <div class="stat-item"><div class="stat-val" style="font-size:11.5px;color:var(--purple-text)">${payoutFmt}</div><div class="stat-lbl">Payout</div></div>
              </div>
              <div class="prog-wrap" style="margin-top:8px"><div class="prog-fill" style="width:${m.hitRate}%;background:${m.color}"></div></div>
            </div>
          </div>`;
        }).join('');
      }
    }

    console.log('Team performance loaded:', memberStats.length, 'members');
  } catch(e) { console.error('loadTeamPerformance error:', e.message); }
}


// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('capri:identityReady', async (e) => {
  const user = e.detail;
  if (!user) return;
  await loadTeamPerformance(user);
});
loadIdentity();
