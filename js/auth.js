/* ════════════════════════════════════════════════════════════════
   AUTH — the account view (log in / sign up) and session management.
   In cloud mode this talks to Supabase Auth. In local mode the auth
   view is skipped entirely and the app boots straight into the game.
   ════════════════════════════════════════════════════════════════ */

/* ASCII title (reuse the packed banner). */
const TITLE_ART=[
  " __      __ _____ _____ _____ _____ _   _ _   _ _____ ",
  " \\ \\    / /| ____|  ___| ____| ____| \\ | | \\ | |_   _|",
  "  \\ \\  / / |  _| | |_  |  _| |  _| |  \\| |  \\| | | |  ",
  "   \\ \\/ /  | |___|  _| | |___| |___| | |\\  | |\\  | | |  ",
  "    \\__/   |_____|_|   |_____|_____|_|_|_|_|_|_| |_|  ",
  "  P I P E L I N E // B R E A K E R",
  ""
];

/* Fast session load for pages that boot without a full auth screen
   (learn.html, leaderboard.html). Returns {cloud, state, username}.

   The stored session is validated against the Supabase server via
   getUser() — getSession() alone only reads what's persisted locally and
   would trust an expired or forged token, which would let a stale login
   satisfy the REQUIRE_ACCOUNT gate. getUser() is a real network check
   (and refreshes the session when a valid refresh token exists). */
async function loadSession(){
  if(!SUPABASE_CONFIGURED) return {cloud:false};
  try{
    const c=sb();
    const {data:{session}}=await c.auth.getSession();
    if(session){
      const {error}=await c.auth.getUser();
      if(!error){
        const p=await DB.loadCloudState();
        return {cloud:true, state:p.state, username:p.username};
      }
      // stale / invalid session → drop it; the user must log in again
      await c.auth.signOut().catch(()=>{});
    }
  }catch(e){}
  return {cloud:false};
}

/* Wires up the auth view and returns a Promise that resolves with the
   {state, username} on successful entry (login/signup), or null if
   the user is already authenticated / cloud is off. */
function initAuthScreen(){
  return new Promise(resolve=>{
    const authview=document.getElementById('authview');
    const appEl=document.getElementById('app');
    document.getElementById('asciiTitle').textContent=TITLE_ART.join('\n');

    const finish=(payload)=>{
      authview.classList.add('hidden');
      appEl.classList.remove('hidden');
      resolve(payload);
    };

    /* If Supabase isn't configured → skip straight to local mode. */
    if(!SUPABASE_CONFIGURED){
      finish({state:sanitizeState({}), username:null, cloud:false});
      return;
    }

    /* If already logged in (session persisted) → skip to cloud mode. */
    const c=sb();
    c.auth.getSession().then(({data:{session}})=>{
      if(session){
        DB.loadCloudState().then(payload=>finish({...payload,cloud:true}));
      }else{
        showForm(authview,finish);
      }
    });
  });
}

function showForm(authview,finish){
  let mode='login';
  const usernameEl=document.getElementById('authUsername');
  const emailEl=document.getElementById('authEmail');
  const passEl=document.getElementById('authPassword');
  const feedEl=document.getElementById('authFeed');
  const submitEl=document.getElementById('authSubmit');

  const setMode=(m)=>{
    mode=m;
    document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
    usernameEl.style.display=(mode==='signup')?'block':'none';
    usernameEl.required=(mode==='signup');
    emailEl.style.display=(mode==='signup')?'block':'none';
    emailEl.required=(mode==='signup');
    submitEl.textContent=(mode==='signup')?'Create account':'Log in';
    feedEl.textContent='';
  };
  document.querySelectorAll('.auth-tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  setMode('login');

  document.getElementById('authForm').addEventListener('submit',async e=>{
    e.preventDefault();
    feedEl.textContent=''; feedEl.className='feedback';
    const email=emailEl.value.trim();
    const password=passEl.value;
    const username=usernameEl.value.trim();
    if(password.length<6){ feedEl.textContent='Password must be at least 6 characters.'; feedEl.className='feedback bad'; return; }
    submitEl.disabled=true; submitEl.textContent='…';
    let res;
    if(mode==='signup'){
      if(!username){ feedEl.textContent='Pick a username.'; feedEl.className='feedback bad'; submitEl.disabled=false; submitEl.textContent='Create account'; return; }
      res=await DB.signup(username,email,password);
    }else{
      res=await DB.login(email,password);
    }
    if(res.error){
      feedEl.textContent=res.error.message||'Something went wrong.';
      feedEl.className='feedback bad';
    }else if(mode==='signup' && !(res.data&&res.data.session)){
      /* Supabase is configured to require email confirmation → no session yet. */
      feedEl.textContent='Account created — check your inbox to confirm your email, then log in.';
      feedEl.className='feedback ok';
      setMode('login');
      submitEl.disabled=false; submitEl.textContent='Log in';
      return;
    }else{
      const payload=await DB.loadCloudState();
      feedEl.textContent="You're in. Happy learning!";
      feedEl.className='feedback ok';
      finish({...payload,cloud:true});
      return;
    }
    submitEl.disabled=false; submitEl.textContent=(mode==='signup')?'Create account':'Log in';
  });
}
