/* ════════════════════════════════════════════════════════════════
   DATA LAYER
   Two backends behind one interface:
     • Local mode   — progress kept in the browser's localStorage.
                      Used when Supabase isn't configured yet (or you
                      are offline). No accounts, no shared leaderboard.
     • Cloud mode   — progress lives in Supabase (Postgres), keyed by
                      the logged-in user. Enables accounts and a public
                      class leaderboard.
   The App talks only to the `DB` object at the bottom of this file.
   ════════════════════════════════════════════════════════════════ */

/* -------- local progress state (the single source of truth in memory) -------- */
class Store {
  constructor(){
    this.state={ solved:{}, hints:{}, egg:false, studyCommitted:false, cheatUnlocked:false, catsDone:{} };
    this.#load();
  }
  #KEY='pb_progress_v1';
  #load(){
    try{
      const raw=localStorage.getItem(this.#KEY);
      if(raw){ const o=JSON.parse(raw); this.state=sanitizeState(o); }
    }catch(e){ /* corrupted or blocked storage — start fresh */ }
  }
  #save(){
    try{ localStorage.setItem(this.#KEY,JSON.stringify(this.state)); }catch(e){}
  }
  isSolved(id){ return !!this.state.solved[id]; }
  markSolved(id,points){
    if(this.state.solved[id] && id!=='egg') return false;
    this.state.solved[id]=points||null; this.#save(); return true;
  }
  hintsUsed(id){ return this.state.hints[id]||0; }
  useHint(id){ this.state.hints[id]=(this.state.hints[id]||0)+1; this.#save(); }
  /* Player has left Study Mode to start solving. This is one-way: Study
     Mode re-locks until the player does a full reset. */
  commitStudy(){ this.state.studyCommitted=true; this.#save(); }
  /* Unlock the full Cheat Sheet (via the secret `sudo chillinmalware` terminal command). */
  unlockCheat(){ this.state.cheatUnlocked=true; this.#save(); }
  /* Mark a whole category as permanently completed. Its challenges then
     survive reset — a finished tab can't be undone. */
  completeCategory(catId, ids){ if(this.state.catsDone[catId]) return; this.state.catsDone[catId]=ids.slice(); this.#save(); }
  reset(){
    const cd=this.state.catsDone||{};
    // keep challenges inside permanently-completed tabs
    const keep={};
    for(const k in cd) if(Array.isArray(cd[k])) cd[k].forEach(id=>keep[id]=this.state.solved[id]||null);
    const fresh=sanitizeState({});
    fresh.solved=keep;
    fresh.catsDone=cd;
    this.state=fresh; this.#save();
  }
  /* Export current progress as a compact JSON blob (for moving between
     browsers or from local to cloud manually). */
  exportBlob(){ return JSON.stringify(this.state); }
  /* Import a previously exported blob. Returns true on success. */
  importBlob(raw){
    try{
      const o=JSON.parse(raw); if(!o||typeof o!=='object') return false;
      this.state=sanitizeState(o); this.#save(); return true;
    }catch(e){ return false; }
  }
}

/* Coerce an untrusted parsed object into a safe shape. */
function sanitizeState(o){
  o=o&&typeof o==='object'?o:{};
  const solved={}, hints={};
  if(o.solved&&typeof o.solved==='object') for(const k in o.solved) if(/^\d+$|^egg$/.test(k)) solved[k]=+o.solved[k]||null;
  if(o.hints&&typeof o.hints==='object') for(const k in o.hints) if(/^\d+$/.test(k)) hints[k]=+o.hints[k]||0;
  const catsDone={};
  if(o.catsDone&&typeof o.catsDone==='object') for(const k in o.catsDone) if(/^\d+$/.test(k) && Array.isArray(o.catsDone[k])) catsDone[k]=o.catsDone[k].filter(x=>/^\d+$/.test(x));
  return {solved,hints, egg:!!o.egg, studyCommitted:!!o.studyCommitted, cheatUnlocked:!!o.cheatUnlocked, catsDone};
}

/* -------- Supabase client (lazy) -------- */
let sbClient=null;
function sb(){
  if(sbClient) return sbClient;
  if(!SUPABASE_CONFIGURED) return null;
  try{
    sbClient=window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sbClient;
  }catch(e){ return null; }
}

/* -------- Cloud data service -------- */
const DB={
  /* Is cloud mode active? (Supabase configured AND logged in) */
  async ready(){
    const c=sb(); if(!c) return false;
    const {data:{session}}=await c.auth.getSession();
    return !!session;
  },
  /* Sign up with email + username. Creates a profile row and a
     progress row. Returns {error} on failure. */
  async signup(username,email,password){
    const c=sb(); if(!c) return {error:{message:'Supabase is not configured (fill js/config.js).'}};
    const {data,error}=await c.auth.signUp({email,password});
    if(error) return {error};
    // When email confirmation is ON, signUp returns NO session (the new
    // user must confirm before logging in). Row creation must be deferred
    // until then — an unauthenticated insert would trip the RLS profile
    // policy (auth.uid() is null). loadCloudState lazily creates the rows.
    const uid=data.user&&data.user.id;
    if(uid && data.session){
      const prof=await c.from('profiles').insert({id:uid,username}).select().single();
      if(prof.error) return {error:prof.error};
      const progress=await c.from('progress').insert({user_id:uid}).select().single();
      if(progress.error) return {error:progress.error};
      const scores=await c.from('scores').insert({user_id:uid,username}).select().single();
      if(scores.error) return {error:scores.error};
    }
    return {data};
  },
  /* Log in. */
  async login(email,password){
    const c=sb(); if(!c) return {error:{message:'Supabase is not configured (fill js/config.js).'}};
    return await c.auth.signInWithPassword({email,password});
  },
  /* Log out. */
  async logout(){
    const c=sb(); if(!c) return;
    await c.auth.signOut();
  },
  /* Load the logged-in user's cloud progress into a local Store-like
     object. Returns a sanitized state object (or null if absent). */
  async loadCloudState(){
    const c=sb(); const {data:{session}}=await c.auth.getSession();
    if(!session) return {state:sanitizeState({}), username:null};
    const {data,error}=await c.from('progress').select('*').eq('user_id',session.user.id).maybeSingle();
    let {data:prof}=await c.from('profiles').select('username').eq('id',session.user.id).maybeSingle();

    // Lazy-create the profile row if it's missing. This happens when email
    // confirmation is ON: signup returns no session, so row creation was
    // deferred until this (authenticated) load.
    if(!prof){
      const base=(session.user.email||'player').split('@')[0].replace(/[^a-z0-9_]/gi,'')||'player';
      const guess=base.slice(0,20).length<2 ? 'player' : base.slice(0,20);
      const mk=async u=>{
        const r=await c.from('profiles').insert({id:session.user.id, username:u}).select().single();
        if(r.error) return false;
        prof=r.data; return true;
      };
      if(!(await mk(guess))){
        for(let i=0;i<5 && !prof;i++) await mk(guess+'_'+Math.random().toString(36).slice(2,6));
      }
      if(!prof) prof={username:base};
    }

    let state=sanitizeState({});
    if(data&&!error) state=sanitizeState({
      solved:data.solved,hints:data.hints,egg:!!data.egg,
      studyCommitted:!!data.study_committed, cheatUnlocked:!!data.cheat_unlocked, catsDone:data.cats_done
    });
    return {state, username:(prof&&prof.username)||session.user.email||'player',
            streak:(data&&data.streak)||0, timePlayed:(data&&data.time_played)||0,
            introDone:!!(data&&data.intro_done)};
  },
  /* Push the in-memory state up to Supabase and refresh the leaderboard row. */
  async saveCloudState(store){
    const c=sb(); const {data:{session}}=await c.auth.getSession();
    if(!session) return;
    const st=store.state;
    const points=computePoints(store);
    const solvedCount=Object.keys(st.solved).filter(k=>k!=='egg').length;
    const rank=rankFor(points);
    let streak=0, time=0;
    try{ const sr=JSON.parse(localStorage.getItem('pb_streak')||'{}'); streak=sr.n||0; time=parseInt(localStorage.getItem('pb_time')||'0',10); }catch(e){}
    await c.from('progress').upsert({
      user_id:session.user.id,
      solved:st.solved, hints:st.hints, egg:st.egg,
      study_committed:!!st.studyCommitted, cheat_unlocked:!!st.cheatUnlocked,
      cats_done:st.catsDone||{},
      streak, time_played:time,
      total_points:points
    },{onConflict:'user_id'});
    const {data:prof}=await c.from('profiles').select('username').eq('id',session.user.id).maybeSingle();
    await c.from('scores').upsert({
      user_id:session.user.id,
      username:(prof&&prof.username)||session.user.email||'player',
      points, solved_count:solvedCount, rank_name:rank.name
    },{onConflict:'user_id'});
  },
  /* Mark the first-run tour as seen for THIS account (follows the account
     across devices/browsers, unlike the old localStorage flag). */
  async markIntroDone(){
    const c=sb(); const {data:{session}}=await c.auth.getSession();
    if(!session) return;
    await c.from('progress').update({intro_done:true}).eq('user_id',session.user.id).catch(()=>{});
  },
  /* Fetch the public leaderboard (top 50 by points). */
  async leaderboard(){
    const c=sb(); if(!c) return [];
    const {data,error}=await c.from('scores').select('*').order('points',{ascending:false}).limit(50);
    if(error) return [];
    return data||[];
  },
  /* Send a password-reset email. The link lands on reset.html, which
     sets the new password. */
  async resetPassword(email){
    const c=sb(); if(!c) return {error:{message:'Supabase is not configured (fill js/config.js).'}};
    const {error}=await c.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/reset.html'});
    return error?{error}:{ok:true};
  },
  /* Set a new password for the signed-in (recovery) session. */
  async updatePassword(newPass){
    const c=sb(); if(!c) return {error:{message:'Supabase is not configured (fill js/config.js).'}};
    const {error}=await c.auth.updateUser({password:newPass});
    return error?{error}:{ok:true};
  }
};

/* -------- shared helpers used by cloud save -------- */
function computePoints(store){
  let p=0;
  for(const id in store.state.solved){
    if(id==='egg'){ if(store.state.solved[id]) p+=25; continue; }
    const c=window.__globalChallenges&&window.__globalChallenges.find(x=>x.id==id);
    if(c) p+=c.points; else p+=(store.state.solved[id]||0);
  }
  return p;
}
function rankFor(p){
  for(const r of RANKS){ if(p>=r.p) return r; }
  return RANKS[0];
}
