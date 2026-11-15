/* ════════════════════════════════════════════════════════════════
   WELCOME — landing-page controller (index.html).
   Renders the animated hero, the auth form (or a local-mode enter
   card), and redirects into the game on success.
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

  const reduced=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };

  /* --- hero entrance --- */
  function animateHero(){
    const t=document.getElementById('asciiTitle');
    t.textContent=TITLE_ART.join('\n');
    if(reduced()) return;
    // sweep the ASCII lines in
    let d=0;
    t.innerHTML=TITLE_ART.map(line=>`<span class="ascii-line" style="animation-delay:${d+=120}ms">${line.replace(/ /g,'&nbsp;')}</span>`).join('\n');
    // pipe stages light up left→right
    document.querySelectorAll('.hp-stage').forEach((s,i)=>{
      s.style.animationDelay=(600+i*260)+'ms';
    });
    // stagger chips
    document.querySelectorAll('.hero-chips .chip').forEach((c,i)=>{
      c.style.animationDelay=(1400+i*150)+'ms';
    });
  }

  /* --- boot --- */
  async function boot(){
    animateHero();
    // Returning user already logged in? Go straight to the game.
    const sess=await loadSession();
    if(sess.cloud){ location.href='learn.html'; return; }
    const form=document.getElementById('authForm');
    const box=document.getElementById('authBox');
    const feed=document.getElementById('authFeed');
    const submitBtn=document.getElementById('authSubmit');
    const guestBtn=document.getElementById('guestBtn');
    const tabs=document.getElementById('authTabs');
    let mode='login';

    const setMode=m=>{
      mode=m;
      document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
      const su=(m==='signup');
      // Email is needed for BOTH login and signup; only Username is
      // signup-specific. (Login was broken: email was hidden in login mode.)
      document.getElementById('authUsernameWrap').style.display=su?'block':'none';
      document.getElementById('authUsername').required=su;
      document.getElementById('authEmail').style.display='block';
      document.getElementById('authEmail').required=true;
      submitBtn.textContent=su?'Create account':'Log in';
      feed.textContent=''; feed.className='feedback';
    };
    tabs.querySelectorAll('.auth-tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    setMode('login');

    // "Check your email" success state → back to login.
    const verifyBox=document.getElementById('verifyBox');
    const verifyGoLogin=document.getElementById('verifyGoLogin');
    if(verifyGoLogin) verifyGoLogin.addEventListener('click',()=>{
      if(verifyBox) verifyBox.style.display='none';
      form.style.display='block';
      setMode('login');
    });

    // Accounts are required to play — remove the direct "enter" shortcut
    // (it would just bounce back here from the gated game page).
    if(REQUIRE_ACCOUNT){
      const ed=document.getElementById('enterDirect'); if(ed) ed.style.display='none';
    }

    // No Supabase keys → no accounts possible. When accounts are required,
    // block entry with a setup notice; in preview mode keep the old local card.
    if(!SUPABASE_CONFIGURED){
      form.style.display='none';
      if(REQUIRE_ACCOUNT){
        box.innerHTML=`<div class="auth-local">
            <div class="auth-local-icon">🔐</div>
            <p style="color:var(--text-dim);line-height:1.7"><b>An account is required to play.</b> This deployment isn't connected to Supabase yet, so sign-ups aren't available. Add your project keys in <span class="hl">js/config.js</span> (see README §2), then reload.</p>
          </div>`;
      }else{
        box.innerHTML=`<div class="auth-local">
            <div class="auth-local-icon">🚀</div>
            <p style="color:var(--text-dim);line-height:1.7">Supabase isn't configured, so you're playing in <b>local mode</b> — progress stays in this browser.</p>
            <button type="button" class="btn primary block" id="localEnter">Enter the game →</button>
          </div>`;
        document.getElementById('localEnter').addEventListener('click',()=>{ location.href='learn.html'; });
      }
      return;
    }

    // Cloud mode: everyone logs in — no guest path.
    guestBtn.style.display='none';

    // Floating Admin button (top-right) — hidden from the landing page. The
    // panel is only reachable in-game by the admin account (see app.js
    // #tbAdmin gating). Kept out of the DOM flow so students never see it.
    const adminFab=document.getElementById('adminFab');
    if(adminFab) adminFab.style.display='none';

    // Forgot-password → reset email.
    const forgotBtn=document.getElementById('forgotBtn');
    if(forgotBtn) forgotBtn.addEventListener('click',askForgot);

    // Auth submit
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      feed.textContent=''; feed.className='feedback';
      const email=document.getElementById('authEmail').value.trim();
      const password=document.getElementById('authPassword').value;
      const username=document.getElementById('authUsername').value.trim();
      if(password.length<6){ feed.textContent='Password must be at least 6 characters.'; feed.className='feedback bad'; return; }
      submitBtn.disabled=true; submitBtn.textContent='…';
      let res;
      try{
        if(mode==='signup'){
          if(!username){ feed.textContent='Pick a username.'; feed.className='feedback bad'; submitBtn.disabled=false; submitBtn.textContent='Create account'; return; }
          res=await DB.signup(username,email,password);
        } else {
          res=await DB.login(email,password);
        }
        if(res.error){
          feed.textContent=res.error.message||'Something went wrong.';
          feed.className='feedback bad';
        } else if(mode==='signup' && !(res.data&&res.data.session)){
          // Email confirmation is on → dedicated success state.
          form.style.display='none';
          document.getElementById('verifyEmail').textContent=email;
          document.getElementById('verifyBox').style.display='flex';
          const vg=document.getElementById('verifyGoLogin'); if(vg) vg.focus();
          return;
        } else {
          feed.textContent="You're in. Happy learning!";
          feed.className='feedback ok';
          localStorage.removeItem('pb_guest');
          setTimeout(()=>{ location.href='learn.html'; },400);
          return;
        }
      }catch(err){
        feed.textContent='Something went wrong.';
        feed.className='feedback bad';
      }
      submitBtn.disabled=false; submitBtn.textContent=(mode==='signup')?'Create account':'Log in';
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  /* ---- landing-page Admin panel (no game login needed) ---- */
  function openLandingAdmin(){
    const ov=document.createElement('div'); ov.className='overlay'; ov.id='adminLoginOverlay';
    ov.innerHTML=`<div class="overlay-box confirm-box" style="max-width:380px">
      <div style="padding:24px 26px">
        <div class="tour-icon" style="margin:0 auto 14px">🛡️</div>
        <h3 style="color:var(--cyan);margin:0 0 6px;text-align:center">Admin access</h3>
        <div style="font-size:13px;color:var(--text-dim);text-align:center;margin-bottom:16px">Restricted area — enter admin credentials.</div>
        <label for="admU" style="display:block;font-size:12px;color:var(--text-dim);margin:10px 0 4px">Username</label>
        <input id="admU" type="text" autocomplete="off" spellcheck="false">
        <label for="admP" style="display:block;font-size:12px;color:var(--text-dim);margin:10px 0 4px">Password</label>
        <input id="admP" type="password" autocomplete="off">
        <div class="feedback" id="admFeed" aria-live="polite"></div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button type="button" id="admCancel" class="btn">Cancel</button>
          <button type="button" id="admGo" class="btn primary">Enter</button>
        </div>
      </div></div>`;
    document.body.appendChild(ov);
    const plain=()=>ov.remove();
    const submit=()=>{
      const u=document.getElementById('admU').value.trim();
      const p=document.getElementById('admP').value;
      const feed=document.getElementById('admFeed');
      if(!u||!p){ feed.textContent='Enter both fields.'; feed.className='feedback bad'; return; }
      if(u===ADMIN_USER && p===ADMIN_PASS){ plain(); openAdminPanel(); }
      else { feed.textContent='Wrong credentials.'; feed.className='feedback bad'; }
    };
    ov.addEventListener('click',e=>{ if(e.target.id==='adminLoginOverlay') plain(); });
    document.getElementById('admGo').addEventListener('click',submit);
    document.getElementById('admCancel').addEventListener('click',plain);
    document.getElementById('admP').addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); });
    document.getElementById('admU').focus();
  }

  /* ---- forgot password ---- */
  function askForgot(){
    if(!SUPABASE_CONFIGURED){ alert('Supabase is not configured — cannot send reset emails.'); return; }
    const ov=document.createElement('div'); ov.className='overlay'; ov.id='forgotOverlay';
    ov.innerHTML=`<div class="overlay-box confirm-box" style="max-width:360px">
      <div style="padding:24px 26px">
        <h3 style="color:var(--cyan);margin:0 0 6px;text-align:center">Reset password</h3>
        <div style="font-size:13px;color:var(--text-dim);text-align:center;margin-bottom:14px">We'll email you a reset link.</div>
        <label for="fgEmail" style="display:block;font-size:12px;color:var(--text-dim);margin:10px 0 4px">Account email</label>
        <input id="fgEmail" type="email" autocomplete="email">
        <div class="feedback" id="fgFeed" aria-live="polite"></div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
          <button type="button" id="fgCancel" class="btn">Cancel</button>
          <button type="button" id="fgGo" class="btn primary">Send link</button>
        </div>
      </div></div>`;
    document.body.appendChild(ov);
    const plain=()=>ov.remove();
    const submit=async()=>{
      const em=document.getElementById('fgEmail').value.trim();
      const feed=document.getElementById('fgFeed');
      if(!em){ feed.textContent='Enter your email.'; feed.className='feedback bad'; return; }
      const go=document.getElementById('fgGo'); go.disabled=true; go.textContent='…';
      const res=await DB.resetPassword(em);
      go.disabled=false; go.textContent='Send link';
      if(res.error){ feed.textContent=res.error.message||'Could not send.'; feed.className='feedback bad'; return; }
      feed.textContent='Sent — check your inbox (and spam).'; feed.className='feedback ok';
      setTimeout(plain,2200);
    };
    ov.addEventListener('click',e=>{ if(e.target.id==='forgotOverlay') plain(); });
    document.getElementById('fgGo').addEventListener('click',submit);
    document.getElementById('fgCancel').addEventListener('click',plain);
    document.getElementById('fgEmail').addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); });
    document.getElementById('fgEmail').focus();
  }
})();
