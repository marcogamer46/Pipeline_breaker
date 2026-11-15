/* ════════════════════════════════════════════════════════════════
   LEADERBOARD — standalone page controller (leaderboard.html).
   ════════════════════════════════════════════════════════════════ */

(function(){
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  async function boot(){
    const list=document.getElementById('boardList');
    list.innerHTML='<div style="color:var(--text-dim);padding:24px;text-align:center">loading…</div>';
    const s=await loadSession();
    let rows=[];
    // The scores table is public (RLS select-for-all), so the board can be
    // shown without being logged in — only need the keys configured.
    if(SUPABASE_CONFIGURED){
      rows=(await DB.leaderboard())||[];
    }
    if(!rows.length){
      const msg=SUPABASE_CONFIGURED
        ? 'No scores on the class board yet — log in and solve a few challenges to appear here.'
        : 'Fill in <span class="hl">js/config.js</span> with your Supabase keys and run <span class="hl">supabase/schema.sql</span> to see the class board.';
      list.innerHTML=`<div style="color:var(--text-dim);padding:28px;text-align:center;line-height:1.8">${msg}</div>`;
      return;
    }
    const me=s.cloud&&s.username;
    list.innerHTML=rows.map((r,i)=>`
      <div class="br-row ${r.username===me?'me':''}" style="animation-delay:${i*60}ms">
        <span class="pos">${i+1}</span>
        <span class="nm">${esc(r.username)}</span>
        <span class="pts">${r.points} pts</span>
      </div>`).join('');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
