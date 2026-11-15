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
      document.getElementById('authUsername').style.display=su?'block':'none';
      document.getElementById('authUsername').required=su;
      document.getElementById('authEmail').style.display='block';
      document.getElementById('authEmail').required=true;
      submitBtn.textContent=su?'Create account':'Log in';
      feed.textContent=''; feed.className='feedback';
    };
    tabs.querySelectorAll('.auth-tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    setMode('login');

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
          feed.textContent='Account created — check your inbox to confirm your email, then log in.';
          feed.className='feedback ok';
          setMode('login');
          submitBtn.disabled=false; submitBtn.textContent='Log in';
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
})();
