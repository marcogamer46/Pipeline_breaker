/* Shared Admin panel — backed by the service-role Edge Function
   (/functions/v1/admin). Loaded by both index.html and learn.html.
   Exposes window.openAdminPanel(). */

(function(){
  async function api(action, payload){
    const c=sb(); if(!c) throw new Error('Supabase is not configured.');
    const {data:{session}}=await c.auth.getSession();
    const token=session&&session.access_token;
    if(!token) throw new Error('Sign in as the admin account (chillinmalware) to manage players.');
    const r=await fetch(SUPABASE_URL+'/functions/v1/admin',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action, payload:payload||{}})
    });
    let j={}; try{ j=await r.json(); }catch(e){}
    if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
    return j;
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  window.openAdminPanel=async function(){
    const ov=document.createElement('div'); ov.className='overlay'; ov.id='adminOverlay';
    ov.innerHTML=`<div class="overlay-box admin-box" style="max-width:780px">
      <div style="padding:22px 26px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
          <h3 style="margin:0;color:var(--cyan);flex:1">Admin</h3>
          <span id="admApiStatus" style="font-size:11.5px;color:var(--text-dim)"></span>
          <button type="button" class="btn" id="admClose" aria-label="close">✕</button>
        </div>
        <div class="auth-tabs" style="margin:10px 0 14px">
          <button class="auth-tab active" data-adtab="overview" type="button">Overview</button>
          <button class="auth-tab" data-adtab="players" type="button">Players</button>
        </div>
        <div id="adBody" style="max-height:60vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px"></div>
        <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap">
          <span style="color:var(--text-dim);font-size:11px;line-height:1.5">Server-side admin (Edge Function) with service-role access.</span>
          <button type="button" class="btn" id="admRefresh">↻ Refresh</button>
        </div>
      </div></div>`;
    document.body.appendChild(ov);
    const body=document.getElementById('adBody');
    const statusEl=document.getElementById('admApiStatus');
    let tab='overview';

    const fail=msg=>{ body.innerHTML=`<div style="padding:18px;color:var(--red);text-align:center">${esc(msg)}</div>`; };
    const setStatus=(t,c)=>{ statusEl.textContent=t; statusEl.style.color=c||'var(--text-dim)'; };

    async function loadOverview(){
      const rows=(await DB.leaderboard())||[];
      const tot=rows.length;
      const pts=rows.reduce((a,r)=>a+(r.points||0),0);
      body.innerHTML=
        `<div style="display:flex;gap:10px;flex-wrap:wrap">
           <span class="ad-stat"><b>${tot}</b> players on board</span>
           <span class="ad-stat"><b>${pts.toLocaleString()}</b> total pts</span>
           <span class="ad-stat"><b>${tot?Math.round(pts/tot):0}</b> avg pts</span>
           <span class="ad-stat"><b>${rows.filter(r=>r.solved_count>0).length}</b> solved ≥1</span>
         </div>
         <div style="margin-top:14px;font-size:13px;color:var(--text-dim)">Open the Players tab for the full roster and actions.</div>`;
    }

    async function loadPlayers(){
      setStatus('Loading…','var(--amber)');
      let res;
      try{ res=await api('list'); }catch(e){ setStatus(''); fail(e.message); return; }
      setStatus('');
      const us=res.users||[];
      if(!us.length){ body.innerHTML=`<div style="padding:18px;color:var(--text-dim);text-align:center">No users yet.</div>`; return; }
      const rows=us.map(u=>`
        <tr style="border-top:1px solid var(--line)">
          <td style="padding:6px 8px">
            <div>${esc(u.username||'—')}</div>
            <div style="font-size:11px;color:var(--text-dim)">${esc(u.email)}</div>
          </td>
          <td style="padding:6px 4px">${u.points}</td>
          <td style="padding:6px 4px">${u.solvedCount}</td>
          <td style="padding:6px 4px">${u.banned?'<span style="color:var(--red)">banned</span>':'ok'}</td>
          <td style="padding:6px 4px;white-space:nowrap">
            <button class="btn ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="pass" title="Set new password">🔑</button>
            <button class="btn ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="wipe" title="Reset progress &amp; score">🧹</button>
            <button class="btn ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="ban" title="${u.banned?'Unban':'Ban'}">${u.banned?'✅':'🚫'}</button>
            <button class="btn danger ad-act" type="button" data-u="${u.id}" data-email="${esc(u.email)}" data-act="del" title="Delete user permanently">🗑️</button>
          </td>
        </tr>`).join('');
      body.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-dim);text-align:left">
          <th style="padding:6px 8px">Player</th><th>Pts</th><th>Solved</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody></table>`;
      body.querySelectorAll('.ad-act').forEach(b=>b.addEventListener('click',()=>act(b)));
    }

    async function act(btn){
      const uid=btn.dataset.u, email=btn.dataset.email, a=btn.dataset.act;
      const go=async(label,fn)=>{ if(!confirm(label)) return; try{ await fn(); await loadPlayers(); }catch(e){ alert(e.message); } };
      if(a==='pass'){
        const pw=prompt('New password for '+email+' (at least 6 characters):');
        if(pw===null) return;
        await go('Set new password for '+email+'?', ()=>api('setPassword',{id:uid,password:pw}));
      } else if(a==='wipe'){
        await go('Reset ALL progress and leaderboard score for '+email+'? This cannot be undone.', ()=>api('resetProgress',{user_id:uid}));
      } else if(a==='ban'){
        const unban=(btn.title||'').includes('Unban');
        await go((unban?'Unban ':'Ban ')+email+'?', ()=>api('toggleBan',{id:uid,ban:!unban}));
      } else if(a==='del'){
        await go('PERMANENTLY delete the account '+email+'? Their profile, progress, and score are removed.', ()=>api('delete',{id:uid}));
      }
    }

    const show=async()=>{
      if(tab==='overview'){ try{ await loadOverview(); }catch(e){ fail(e.message); } }
      else await loadPlayers();
    };

    document.getElementById('admClose').addEventListener('click',()=>ov.remove());
    ov.addEventListener('click',e=>{ if(e.target.id==='adminOverlay') ov.remove(); });
    document.getElementById('admRefresh').addEventListener('click',show);
    ov.querySelectorAll('[data-adtab]').forEach(t=>t.addEventListener('click',()=>{
      tab=t.dataset.adtab;
      ov.querySelectorAll('[data-adtab]').forEach(x=>x.classList.toggle('active',x===t));
      show();
    }));
    await show();
  };
})();
