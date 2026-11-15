/* ════════════════════════════════════════════════════════════════
   RESET — set a new password after clicking the reset email link.
   Supabase delivers a "recovery" session via the link; we read it with
   getUser()/getSession(), then updateUser({password}) to set the new
   password. If no valid recovery session exists, we show the invalid-link
   state instead.
   ════════════════════════════════════════════════════════════════ */

(function(){
  const TITLE_ART=[
    "  __      __ _____ _____ _____ _____ _   _ _   _ _____ ",
    "  \\ \\    / /| ____|  ___| ____| ____| \\ | | \\ | |_   _|",
    "   \\ \\  / / |  _| | |_  |  _| |  _| |  \\| |  \\| | | |  ",
    "    \\ \\/ /  | |___|  _| | |___| |___| | |\\  | |\\  | | |  ",
    "     \\__/   |_____|_|   |_____|_____|_|_|_|_|_|_| |_|  ",
    "   P I P E L I N E // B R E A K E R",
    ""
  ];

  function showStatus(msg, ok){
    const box=document.getElementById('statusBox');
    const txt=document.getElementById('statusText');
    box.style.display='flex';
    txt.textContent=msg;
    txt.style.color=ok?'var(--green)':'var(--text-dim)';
  }
  function feed(msg, cls){
    const el=document.getElementById('feed');
    el.textContent=msg; el.className='feedback '+(cls||'');
  }

  async function init(){
    document.getElementById('asciiTitle').textContent=TITLE_ART.join('\n');
    const c=sb();
    if(!c){ showStatus("Supabase is not configured. Reset emails can't be processed.", false); return; }

    // The reset email's link gives us a temporary "recovery" session.
    let session=null;
    try{
      const s=await c.auth.getSession();
      session=s&&s.data&&s.data.session? s.data.session : null;
    }catch(e){}

    if(!session){
      showStatus('This reset link is invalid or expired. Please request a new one from the login page.', false);
      return;
    }

    document.getElementById('resetForm').style.display='block';

    document.getElementById('resetForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const p=document.getElementById('newPass').value;
      const p2=document.getElementById('newPass2').value;
      const btn=document.getElementById('goBtn');
      if(p.length<6){ feed('Password must be at least 6 characters.','bad'); return; }
      if(p!==p2){ feed('Passwords do not match.','bad'); return; }
      btn.disabled=true; btn.textContent='…';
      const res=await DB.updatePassword(p);
      if(res.error){
        feed(res.error.message||'Could not update password.','bad');
        btn.disabled=false; btn.textContent='Set new password';
        return;
      }
      feed('Password updated! You can now log in.','ok');
      btn.textContent='Done';
      setTimeout(()=>{ location.href='index.html'; },1600);
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
