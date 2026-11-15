/* Standalone Admin console (admin.html) — full-page version of the panel.
   Gated to the admin account; every mutation still goes through the
   server-side Edge Function, which independently enforces authorization. */
(function(){
  const $=id=>document.getElementById(id);
  let tab='overview';
  let users=[];

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* Access gate: must be signed in as the admin — by EITHER the admin
     username OR the configured admin email. (The Edge Function applies the
     same check server-side on every action.) */
  async function gate(){
    let payload;
    try{ payload=await loadSession(); }catch(e){ payload={cloud:false}; }
    const isAdmin=!!(payload.cloud && ((payload.username===ADMIN_USER)
      || (ADMIN_EMAIL&&payload.email===ADMIN_EMAIL)));
    if(!isAdmin){
      const who=!payload.cloud ? 'You are <b>not signed in</b>.'
        : `Signed in as @${esc(payload.username||'—')}${payload.email?` (${esc(payload.email)})`:''}`;
      $('admBody').innerHTML=`<div class="auth-local" style="max-width:480px;margin:70px auto">
        <div class="auth-local-icon">🔐</div>
        <p style="line-height:1.75">${who}<br>You must be signed in <b>as the admin account</b>
          (<span class="hl">${esc(ADMIN_USER)}</span>, or the email set in
          <span class="hl">ADMIN_EMAIL</span> in <span class="hl">js/config.js</span>)
          to access this console. The server-side Edge Function enforces the
          same check on every action.</p>
        <button type="button" class="btn primary block" id="admGoLogin">Go to login →</button>
      </div>`;
      $('admGoLogin').addEventListener('click',()=>location.href='index.html');
      return false;
    }
    $('admUser').textContent='@'+payload.username;
    return true;
  }

  const fail=msg=>{ $('admBody').innerHTML=`<div style="color:var(--red);padding:22px;text-align:center">${esc(msg)}</div>`; };

  /* ---------- Overview (public scores) ---------- */
  async function loadOverview(){
    let rows=[];
    try{ rows=(await DB.leaderboard())||[]; }catch(e){}
    const tot=rows.length;
    const pts=rows.reduce((a,r)=>a+(r.points||0),0);
    const solved=rows.filter(r=>r.solved_count>0).length;
    $('admBody').innerHTML=`
      <h2 style="margin:0 0 4px">Overview</h2>
      <div class="adm-dim" style="margin-bottom:18px">Public leaderboard snapshot (read-only). Full control lives in Players.</div>
      <div class="ad-stats">
        <div class="ad-stat"><b>${tot}</b><span>players on board</span></div>
        <div class="ad-stat"><b>${pts.toLocaleString()}</b><span>total points</span></div>
        <div class="ad-stat"><b>${tot?Math.round(pts/tot):0}</b><span>average points</span></div>
        <div class="ad-stat"><b>${solved}</b><span>solved ≥1</span></div>
      </div>`;
  }

  /* ---------- Players roster ---------- */
  function rowHTML(u){
    return `<tr>
      <td class="ad-p">
        <div class="ad-name">${esc(u.username||'—')}</div>
        <div class="adm-dim">${esc(u.email)}</div>
      </td>
      <td>${u.points}</td>
      <td>${u.solvedCount}</td>
      <td>${u.banned?'<span style="color:var(--red)">banned</span>':'<span style="color:var(--green)">ok</span>'}</td>
      <td class="ad-act">
        <button class="btn ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="pass" title="Set new password">🔑</button>
        <button class="btn ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="wipe" title="Reset progress &amp; score">🧹</button>
        <button class="btn ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="ban" title="${u.banned?'Unban':'Ban'}">${u.banned?'✅':'🚫'}</button>
        <button class="btn danger ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="del" title="Delete user permanently">🗑️</button>
      </td>
    </tr>`;
  }

  function renderTable(filter){
    filter=(filter||'').trim().toLowerCase();
    const list=users.filter(u=>!filter
      || (u.username&&u.username.toLowerCase().includes(filter))
      || (u.email&&u.email.toLowerCase().includes(filter)));
    const body=$('admBody');
    body.innerHTML=`
      <div class="ad-head">
        <h2 style="margin:0">Players</h2>
        <div class="ad-tools">
          <input id="admSearch" class="ad-search" placeholder="Filter by username or email…" aria-label="Filter players">
          <button type="button" class="btn" id="admRefresh">↻ Refresh</button>
        </div>
      </div>
      ${list.length
        ? `<table class="ad-table"><thead><tr>
             <th>Player</th><th>Pts</th><th>Solved</th><th>Status</th><th class="ad-act">Actions</th>
           </tr></thead><tbody>${list.map(rowHTML).join('')}</tbody></table>`
        : `<div class="adm-dim" style="padding:26px;text-align:center">No matching users.</div>`}`;
    $('admSearch').addEventListener('input',e=>renderTable(e.target.value));
    $('admRefresh').addEventListener('click',loadPlayers);
    body.querySelectorAll('.ad-act[data-u]').forEach(b=>b.addEventListener('click',()=>act(b)));
  }

  async function loadPlayers(){
    let res;
    try{ res=await adminApi('list'); }
    catch(e){ fail(e.message); return; }
    users=res.users||[];
    renderTable('');
  }

  /* ---------- Actions (same payloads as the modal panel) ---------- */
  async function act(btn){
    const uid=btn.dataset.u, email=btn.dataset.email, a=btn.dataset.act;
    const go=async(label,fn)=>{ if(!confirm(label)) return; try{ await fn(); await loadPlayers(); }catch(e){ alert(e.message); } };
    if(a==='pass'){
      const pw=prompt('New password for '+email+' (at least 6 characters):');
      if(pw===null) return;
      await go('Set new password for '+email+'?', ()=>adminApi('setPassword',{id:uid,password:pw}));
    } else if(a==='wipe'){
      await go('Reset ALL progress and leaderboard score for '+email+'? This cannot be undone.', ()=>adminApi('resetProgress',{user_id:uid}));
    } else if(a==='ban'){
      const unban=(btn.title||'').includes('Unban');
      await go((unban?'Unban ':'Ban ')+email+'?', ()=>adminApi('toggleBan',{id:uid,ban:!unban}));
    } else if(a==='del'){
      await go('PERMANENTLY delete the account '+email+'? Their profile, progress, and score are removed.', ()=>adminApi('delete',{id:uid}));
    }
  }

  async function show(){
    if(tab==='overview') loadOverview();
    else loadPlayers();
  }

  /* ---------- Wiring ---------- */
  document.querySelectorAll('.admin-nav-btn').forEach(b=>b.addEventListener('click',()=>{
    tab=b.dataset.vt;
    document.querySelectorAll('.admin-nav-btn').forEach(x=>{
      const on=(x===b);
      x.classList.toggle('active',on);
      x.setAttribute('aria-pressed',String(on));
    });
    show();
  }));

  document.getElementById('admBack').addEventListener('click',()=>location.href='learn.html');
  document.getElementById('admLogout').addEventListener('click',async()=>{
    if(!confirm('Log out of the admin console?')) return;
    if(typeof DB!=='undefined' && DB.logout) await DB.logout().catch(()=>{});
    location.href='index.html';
  });

  (async()=>{ if(await gate()) show(); })();
})();
