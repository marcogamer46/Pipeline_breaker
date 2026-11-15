/* ════════════════════════════════════════════════════════════════
   APP — the main controller. Wires the views, the game logic, the
   terminal, the simulator, study mode, cheat sheet, flashcards,
   dashboard and leaderboard.
   ════════════════════════════════════════════════════════════════ */

class App {
  #rerenderBubbleMeta=null;
  constructor(){
    this.store=new Store();
    this.challenges=CHALLENGES;
    this.cm=new ChallengeManager(this);
    this.scoreboard=new Scoreboard(this);
    this.hints=new HintSystem(this);
    this.term=new Terminal(this);
    this.currentChallenge=null;
    this.view='challenge';
    this.studyMode=false;
    this.sound=false;
    this.cloud=false;
    this.username=null;
    this.streak=this.#loadStreak();
    this.timePlayed=this.#loadTimePlayed();
    this.eggUnlocked=false;
    this.#rerenderBubbleMeta=null; // set by #wireBubbleGrid; used by the reset button
    window.__globalChallenges=this.challenges; // for db.js computePoints
  }

  /* -------- persistence helpers -------- */
  #todayStr(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  #loadStreak(){
    try{
      const raw=localStorage.getItem('pb_streak'); const o=raw?JSON.parse(raw):{d:null,n:0};
      const today=this.#todayStr();
      if(o.d===today) return o.n;
      const y=new Date(Date.now()-864e5);
      const ys=`${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
      return o.d===ys? o.n+1 : 1;
    }catch(e){ return 1; }
  }
  #saveStreak(){ try{ localStorage.setItem('pb_streak',JSON.stringify({d:this.#todayStr(),n:this.streak})); }catch(e){} }
  #loadTimePlayed(){ try{ const raw=localStorage.getItem('pb_time'); return raw?parseInt(raw,10):0; }catch(e){ return 0; } }

  #reduceMotion(){
    try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; }
  }

  /* One-time staggered entrance for a container's direct children — the
     "UI moves itself" effect (same idea as the instructions accordion auto-
     opening). The animating class is removed once the cascade settles so a
     later re-render doesn't replay it. Respects prefers-reduced-motion. */
  #cascadeOnce(root, step=70, baseMs=420){
    if(!root || this.#reduceMotion()) return;
    if(this._cascadeDone && this._cascadeDone.has(root)) return;
    (this._cascadeDone=this._cascadeDone||new Set()).add(root);
    root.classList.add('boot-cascade');
    const items=[...root.children];
    items.forEach((el,i)=>{ el.style.animationDelay=(i*step)+'ms'; });
    const settle=baseMs+items.length*step+250;
    setTimeout(()=>{
      root.classList.remove('boot-cascade');
      items.forEach(el=>{ el.style.animationDelay=''; });
    }, settle);
  }

  /* -------- boot -------- */
  async init(){
    const payload=await loadSession();
    this.cloud=!!payload.cloud;
    // Accounts are required to play: without an active session, send the
    // player to the login/landing page (no guest bypass).
    if(REQUIRE_ACCOUNT && !this.cloud){ location.href='index.html'; return; }
    if(payload.state) this.store.state=payload.state;
    this.username=payload.username||null;
    // cross-device: adopt cloud streak / time-played when signed in
    if(this.cloud && payload.streak!=null) this.streak=+payload.streak||this.streak;
    if(this.cloud && payload.timePlayed!=null) this.timePlayed=+payload.timePlayed||this.timePlayed;
    // show the user chip only in cloud mode
    const tbu=document.getElementById('tbUser');
    if(this.cloud && this.username){ tbu.style.display=''; tbu.textContent='@'+this.username; }
    else tbu.style.display='none';
    // Admin button is visible to everyone; access is gated by the admin
    // password in #askAdminLogin. The panel only reads public scores, so
    // hiding the button behind a username match added friction without any
    // real security (it was client-side and bypassable anyway).
    const tba=document.getElementById('tbAdmin');
    if(tba) tba.style.display='';
    this.#bindTopbar();
    this.#buildSidebar();
    this.#bindTerminal();
    this.#bindTabs();
    this.#bindOverlay();
    this.#renderScoreboard();
    this.#renderLandStats();
    // Default landing is the "How to play" welcome view, not a challenge.
    // (First-run players are still routed into Study Mode after the tour.)
    this.showData('info');
    this.#maybeIntro();
    this.#saveStreak();
    // time tracking (autosaves to cloud too)
    setInterval(()=>{
      this.timePlayed++; try{ localStorage.setItem('pb_time',String(this.timePlayed)); }catch(e){}
      if(this.cloud) DB.saveCloudState(this.store);
      this.#renderScoreboard();
    },60000);
  }

  #renderLandStats(){
    const el=document.getElementById('landStats'); if(!el) return;
    el.innerHTML=`<span>${this.scoreboard.solvedCount()}/${this.challenges.length} solved</span>
      <span>${this.scoreboard.points()} pts</span>
      <span>streak ${this.streak}d</span>`;
  }

  /* -------- top bar -------- */
  #bindTopbar(){
    document.getElementById('tbCtrl').addEventListener('click',()=>this.showData('cheat'));
    document.getElementById('tbFlash').addEventListener('click',()=>this.showData('flash'));
    document.getElementById('tbDash').addEventListener('click',()=>this.showData('dash'));
    document.getElementById('tbBoard').addEventListener('click',()=>this.openLeaderboard());
    document.getElementById('tbInfo').addEventListener('click',()=>this.showData('info'));
    const admBtn=document.getElementById('tbAdmin');
    if(admBtn) admBtn.addEventListener('click',()=>this.openAdmin());
    const studyBtn=document.getElementById('tbStudy');
    const syncStudyBtn=()=>{
      studyBtn.classList.toggle('active',this.studyMode);
      studyBtn.classList.toggle('locked',this.store.state.studyCommitted);
      studyBtn.textContent=this.store.state.studyCommitted?'Study: locked':(this.studyMode?'Study: ON':'Study Mode');
    };
    studyBtn.addEventListener('click',async()=>{
      if(this.store.state.studyCommitted){
        this.term.printLine('Study Mode is locked — you already started solving. Reset progress to revisit it.','err');
        studyBtn.classList.add('shake'); setTimeout(()=>studyBtn.classList.remove('shake'),500);
        return;
      }
      if(this.studyMode){
        // Leaving Study Mode (to go solve) is one-way: confirm it, then lock.
        const ok=await this.#askConfirm({
          icon:'🔒',
          title:'Leave Study Mode?',
          message:"You won't be able to return to the lessons unless you <b>Reset all progress</b> on the Dashboard.",
          confirmText:'Leave & lock', cancelText:'Stay in Study'
        });
        if(!ok) return;
        this.store.commitStudy();
        this.studyMode=false;
      } else {
        this.studyMode=true;
      }
      syncStudyBtn();
      this.#buildSidebar();
      if(this.currentChallenge) this.renderChallenge(this.currentChallenge.id);
    });
    syncStudyBtn();
    document.getElementById('tbLogout').addEventListener('click',async()=>{
      const ok=await this.#askConfirm({
        icon:'🚪',
        title:'Log out?',
        message:"You'll need to sign in again to pick up your cloud progress on another device.",
        confirmText:'Log out', cancelText:'Cancel'
      });
      if(!ok) return;
      if(this.cloud) await DB.logout();
      location.href='index.html';
    });
  }

  /* -------- leaderboard overlay -------- */
  #closeBoard(){ document.getElementById('boardOverlay').classList.add('hidden'); }
  #bindOverlay(){
    document.getElementById('boardClose').addEventListener('click',()=>this.#closeBoard());
    document.getElementById('boardOverlay').addEventListener('click',e=>{ if(e.target.id==='boardOverlay') this.#closeBoard(); });
  }
  async openLeaderboard(){
    const ov=document.getElementById('boardOverlay');
    const list=document.getElementById('boardList');
    ov.classList.remove('hidden');
    const cleanupOv=this.#focusTrap(ov, document.getElementById('boardClose'));
    ov.addEventListener('esc',()=>{ cleanupOv(); this.#closeBoard(); });
    list.innerHTML='<div style="color:var(--text-dim);padding:20px;text-align:center">loading…</div>';
    let rows=[];
    if(this.cloud) rows=await DB.leaderboard();
    if(!rows.length){
      // local mode: show a friendly note
      list.innerHTML=`<div style="color:var(--text-dim);padding:20px;text-align:center;line-height:1.7">
        No cloud leaderboard yet.<br>
        Fill in <span class="hl">js/config.js</span> with your Supabase keys,<br>
        run <span class="hl">supabase/schema.sql</span>, and log in to see the class board.</div>`;
      return;
    }
    const me=this.cloud&&this.username;
    list.innerHTML=rows.map((r,i)=>`
      <div class="br-row ${r.username===me?'me':''}">
        <span class="pos">${i+1}</span>
        <span class="nm">${esc(r.username)}</span>
        <span class="pts">${r.points} pts</span>
      </div>`).join('');
  }

  /* -------- scoreboard / ranks -------- */
  #renderScoreboard(){
    const el=document.getElementById('scoreboard');
    const p=this.scoreboard.points(), rp=this.scoreboard.rankProgress();
    el.innerHTML=`
      <div class="score-rows">
        <div class="srow"><span class="k">Points</span><span class="v">${p}</span></div>
        <div class="srow"><span class="k">Solved</span><span class="v">${this.scoreboard.solvedCount()}/${this.challenges.length}</span></div>
        <div class="srow"><span class="k">Hints used</span><span class="v">${this.scoreboard.hintsUsedTotal()}</span></div>
        <div class="srow"><span class="k">Streak</span><span class="v">${this.streak} days</span></div>
        <div class="srow"><span class="k">Time played</span><span class="v">${this.timePlayed}</span></div>
      </div>
      <div class="rankbox">${rp.cur.name}${rp.next?' → '+rp.next.name:''}</div>
      <div class="rankbar"><i style="width:${rp.pct}%"></i></div>`;
  }

  /* -------- sidebar -------- */
  #buildSidebar(){
    const wrap=document.getElementById('catlist'); let html='';
    const st=this.store.state;
    const hasSolves=this.challenges.some(c=>this.store.isSolved(c.id));
    // "sealed" = pre-commit and zero progress: nothing in the game is usable yet.
    const sealed=!st.studyCommitted && !hasSolves;
    const reading=this.studyMode;   // browsing lessons pre-commit
    for(const cat of CATEGORIES){
      const chs=this.challenges.filter(c=>c.cat===cat.id);
      const solved=chs.filter(c=>this.store.isSolved(c.id)).length;
      const canBrowse=this.cm.isUnlocked(chs[0]);
      const iconFor=reading? '📖' : '○';
      const perm=st.catsDone[cat.id];
      html+=`<div class="cat ${canBrowse?'open':''}" data-cat="${cat.id}">
        <div class="cat-head"><span class="lock ${canBrowse?'open':''}">${canBrowse?'▾':'🔒'}</span>
          <span class="cat-name">${cat.id}. ${cat.name}</span><span class="cat-pct">${solved}/${chs.length}</span>
          ${perm?'<span class="cat-perm" title="Completed — permanent, cannot be reset">✓ done</span>':''}</div>
        <div class="cat-stages">`;
      for(const c of chs){
        const sol=this.store.isSolved(c.id);
        const cur=this.cm.isUnlocked(c);
        const icon=sol?'✓':(cur?iconFor:'🔒');
        html+=`<div class="ch-site ${sol?'solved':''} ${cur?'':'locked'} ${this.currentChallenge===c.id?'current':''}" data-id="${c.id}">
          <span class="ic">${icon}</span><span class="nm">${esc(c.title)}</span><span class="pts">${c.points}</span></div>`;
      }
      html+=`</div></div>`;
    }
    if(sealed && !reading){
      html=`<div class="gate-banner">🔒 The challenges are sealed — start <b>Study Mode</b> (top bar) to read the lessons, then press <b>“I’m ready”</b> to unlock solving.</div>`+html;
    }
    wrap.innerHTML=html;
    this.#cascadeOnce(wrap, 90, 450);
    wrap.querySelectorAll('.cat-head').forEach(h=>{
      h.setAttribute('tabindex','0'); h.setAttribute('role','button');
      const toggle=()=>{
        if(sealed && !reading){ this.term.printLine('Challenges are sealed — start Study Mode first (top bar), then press “I’m ready”.','err'); return; }
        h.parentElement.classList.toggle('open');
      };
      h.addEventListener('click',toggle);
      h.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
    });
    wrap.querySelectorAll('.ch-site').forEach(el=>{
      el.setAttribute('tabindex','0'); el.setAttribute('role','button');
      const openIt=()=>{
        const id=parseInt(el.dataset.id,10); const c=this.cm.challenge(id);
        if(this.cm.isUnlocked(c)) this.openChallenge(id); else this.term.printLine('That challenge is locked — solve earlier ones first.','err');
      };
      el.addEventListener('click',openIt);
      el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openIt(); } });
    });
  }
  forceRefresh(){ this.#buildSidebar(); this.#renderScoreboard(); }
  /* When the last challenge of a category is solved, mark that tab as
     permanently completed — it can no longer be reset. */
  #markCompletedCategories(){
    for(const cat of CATEGORIES){
      if(this.store.state.catsDone[cat.id]) continue;
      const chs=this.challenges.filter(c=>c.cat===cat.id);
      if(chs.length && chs.every(c=>this.store.isSolved(c.id))){
        this.store.completeCategory(cat.id, chs.map(c=>c.id));
        if(this.cloud) DB.saveCloudState(this.store);
      }
    }
  }

  /* One-time onboarding modal explaining the flag format. Dismissed
     once per browser (remembered in localStorage). */
  #maybeIntro(){
    let seen=false;
    try{ seen=localStorage.getItem('pb_seen_intro')==='1'; }catch(e){}
    if(seen) return;
    this.#startTour();
  }

  /* A short guided tour for first-time players — walks them through the
     layout (sidebar → challenge → top bar → terminal) so they know how to
     navigate. One-time, skippable, and respects reduced-motion via CSS. */
  #startTour(){
    const steps=[
      { icon:'📡', title:'Welcome, player', body:`This is <b>PIPELINE//BREAKER</b> — a hands-on course for CPU pipelining. Your goal: solve <b>30 challenges</b>, earn points, and climb from <span class="hl">Script Kiddie</span> to <span class="hl">Silicon Wizard</span>. Every challenge ends in a flag like <span class="hl">IT51{your_answer}</span>.` },
      { icon:'🗺️', title:'The sidebar', target:'sidebar', body:`On the left is your <b>challenge map</b>. Categories stack top-to-bottom with challenges inside them. A <span class="hl">lock</span> means it's still sealed — solve ~70% of a category to unlock the next. Click any open challenge to open it.` },
      { icon:'🧩', title:'Inside a challenge', target:'chview', body:`Each challenge has a <b>briefing</b>, an interactive puzzle, and a flag box. Type your answer and hit <b>Submit</b> — the IT51{…} wrapper, capitals and spaces are handled for you, and a preview shows exactly what will be checked.` },
      { icon:'🖥️', title:'Top bar', target:'topbar', body:`Across the top: <b>Cheat Sheet</b> (concept reference), <b>Flashcards</b>, <b>Dashboard</b> (your progress), <b>Leaderboard</b> (class rankings), and <b>Study</b> (read-only lessons). These open in the panel beside the challenges.` },
      { icon:'⌨️', title:'Terminal', target:'term', body:`The terminal below accepts commands like <span class="hl">help</span>, <span class="hl">open 1</span>, <span class="hl">hint</span>, <span class="hl">score</span>, and <span class="hl">whoami</span>. Hints reveal a clue when you're stuck — there are three per challenge.` },
      { icon:'🎉', title:"You're set", body:`That's it — good luck. Fetch, decode, execute.` },
    ];
    const ov=document.createElement('div'); ov.className='overlay'; ov.id='tourOverlay';
    ov.innerHTML=`<div class="overlay-box tour-box" style="max-width:560px">
      <div style="padding:20px 22px 8px;display:flex;align-items:center;gap:14px">
        <div class="tour-icon" id="tourIcon"></div>
        <div style="flex:1">
          <div class="tour-kicker" id="tourKicker"></div>
          <h3 id="tourTitle" style="margin:0"></h3>
        </div>
        <button type="button" class="btn" id="tourClose" aria-label="close">✕</button>
      </div>
      <div style="padding:0 22px 12px">
        <div class="tour-prog"><i id="tourProgBar"></i></div>
      </div>
      <div style="padding:0 22px 6px">
        <div id="tourBody" style="line-height:1.75;font-size:14.5px"></div>
      </div>
      <div style="padding:12px 22px 20px;display:flex;gap:10px;align-items:center">
        <button type="button" class="btn" id="tourBack">← Back</button>
        <span style="flex:1"></span>
        <button type="button" class="btn" id="tourSkip">Skip tour</button>
        <button type="button" class="btn primary" id="tourNext">Next →</button>
      </div></div>`;
    document.body.appendChild(ov);
    let i=0, spot=null;
    const clearSpot=()=>{ if(spot){ spot.classList.remove('tour-spot'); spot=null; } };
    const reanimate=el=>{ el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim'); };
    const render=()=>{
      const s=steps[i];
      clearSpot();
      document.getElementById('tourIcon').textContent=s.icon;
      document.getElementById('tourTitle').textContent=s.title;
      document.getElementById('tourKicker').textContent=`STEP ${i+1} OF ${steps.length}`;
      document.getElementById('tourProgBar').style.width=Math.round((i+1)/steps.length*100)+'%';
      const body=document.getElementById('tourBody');
      body.innerHTML=s.body||'';
      reanimate(body); reanimate(document.getElementById('tourTitle'));
      document.getElementById('tourNext').textContent=(i===steps.length-1)?'Finish':'Next →';
      document.getElementById('tourBack').style.visibility=(i===0)?'hidden':'visible';
      if(s.target){ spot=document.getElementById(s.target); if(spot) spot.classList.add('tour-spot'); }
    };
    let cleanupTour=()=>{};
    const end=()=>{ clearSpot(); cleanupTour(); ov.remove(); try{ localStorage.setItem('pb_seen_intro','1'); }catch(e){ } this.#firstRunDone(true); };
    const skip=()=>{ clearSpot(); cleanupTour(); ov.remove(); try{ localStorage.setItem('pb_seen_intro','1'); }catch(e){ } this.#firstRunDone(false); };
    document.getElementById('tourNext').addEventListener('click',()=>{ if(i<steps.length-1){ i++; render(); } else end(); });
    document.getElementById('tourBack').addEventListener('click',()=>{ if(i>0){ i--; render(); } });
    document.getElementById('tourClose').addEventListener('click',skip);
    document.getElementById('tourSkip').addEventListener('click',skip);
    ov.addEventListener('click',e=>{ if(e.target.id==='tourOverlay') skip(); });
    render();
    cleanupTour=this.#focusTrap(ov, document.getElementById('tourClose'));
    ov.addEventListener('esc',skip);
  }

  /* After first-run onboarding: if the player completed the intro, drop them
     straight into Study Mode so the land on lessons instead of a blank
     puzzle. Skipping keeps the normal start. */
  #firstRunDone(finished){
    if(!finished) return;
    if(this.store.state.studyCommitted) return;
    this.studyMode=true;
    const sb=document.getElementById('tbStudy');
    if(sb){ sb.classList.add('active'); sb.classList.remove('locked'); sb.textContent='Study: ON'; }
    this.#buildSidebar();
    if(!this.currentChallenge) this.openChallenge(1);
    this.term.printLine("Study Mode is on — read the lessons, then press “I’m ready” when you want to solve for real.",'sys');
  }

  /* Focus management for modal overlays: move focus into the dialog,
     trap Tab within it, and dispatch an 'esc' event on Escape. Returns
     a cleanup function that detaches the key listener. */
  #focusTrap(ov, first){
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
    const getF=()=>[...ov.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el=>!el.disabled && el.getClientRects().length);
    const ff=getF();
    // Honor an explicitly requested focus target when it exists and is
    // focusable; otherwise fall back to the first focusable element (or
    // the overlay itself). The old code always used ff[0], which made the
    // `first` argument effectively dead (e.g. dialogs focused Cancel over
    // Confirm, and the admin panel focused its close button).
    const target=(first && ff.includes(first)) ? first : (ff[0] || first || ov);
    if(target&&target.focus) try{ target.focus(); }catch(e){}
    const onKey=e=>{
      if(e.key==='Escape'){ e.preventDefault(); document.removeEventListener('keydown',onKey); ov.dispatchEvent(new CustomEvent('esc')); return; }
      if(e.key!=='Tab') return;
      const f=getF(); if(!f.length) return;
      const i=f.indexOf(document.activeElement);
      if(e.shiftKey && i<=0){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && i===f.length-1){ e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  }

  /* Ask for confirmation via a centered in-app modal (no browser dialog).
     Resolves true/false. */
  #askConfirm(opts){
    return new Promise(resolve=>{
      const ov=document.createElement('div'); ov.className='overlay'; ov.id='confirmOverlay';
      ov.innerHTML=`<div class="overlay-box confirm-box" style="max-width:420px">
        <div style="padding:24px 26px;text-align:center">
          ${opts.icon?`<div class="tour-icon" style="margin:0 auto 14px">${opts.icon}</div>`:''}
          <h3 id="cTitle" style="color:var(--cyan);margin-bottom:8px"></h3>
          <div id="cMsg" style="font-size:14px;line-height:1.7;color:var(--text-dim);margin-bottom:22px"></div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button type="button" id="cNo" class="btn" style="min-width:96px"></button>
            <button type="button" id="cYes" class="btn ${opts.danger?'danger':'primary'}" style="min-width:130px"></button>
          </div>
        </div></div>`;
      document.body.appendChild(ov);
      document.getElementById('cTitle').textContent=opts.title||'Are you sure?';
      document.getElementById('cMsg').innerHTML=opts.message||'';
      document.getElementById('cYes').textContent=opts.confirmText||'Confirm';
      document.getElementById('cNo').textContent=opts.cancelText||'Cancel';
      const done=v=>{ cleanup(); ov.remove(); resolve(v); };
      const cleanup=this.#focusTrap(ov, document.getElementById('cYes'));
      ov.addEventListener('esc',()=>done(false));
      document.getElementById('cYes').addEventListener('click',()=>done(true));
      document.getElementById('cNo').addEventListener('click',()=>done(false));
      ov.addEventListener('click',e=>{ if(e.target.id==='confirmOverlay') done(false); });
    });
  }

  /* -------- admin panel -------- */
  #adminAuthed(){
    try{ return sessionStorage.getItem('pb_admin_sess')==='1'; }catch(e){ return false; }
  }
  #setAdminAuthed(v){
    try{ v?sessionStorage.setItem('pb_admin_sess','1'):sessionStorage.removeItem('pb_admin_sess'); }catch(e){}
  }
  async openAdmin(){
    if(!this.#adminAuthed()){
      // #askAdminLogin resolves with null on cancel, or with the *valid*
      // credentials (it keeps the modal open and shows "Wrong credentials"
      // on bad input, never resolving). So a truthy result means success.
      const creds=await this.#askAdminLogin();
      if(!creds) return;
      this.#setAdminAuthed(true);
      this.beep(900,0.05);
    }
    await this.#renderAdmin();
  }
  #askAdminLogin(){
    return new Promise(resolve=>{
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
      const cleanup=this.#focusTrap(ov, document.getElementById('admU'));
      const done=v=>{ cleanup(); ov.remove(); resolve(v); };
      const submit=()=>{
        const u=document.getElementById('admU').value.trim();
        const p=document.getElementById('admP').value;
        const feed=document.getElementById('admFeed');
        if(!u||!p){ feed.textContent='Enter both fields.'; feed.className='feedback bad'; return; }
        if(u===ADMIN_USER && p===ADMIN_PASS){ done({u,p}); }
        else { feed.textContent='Wrong credentials.'; feed.className='feedback bad'; }
      };
      ov.addEventListener('esc',()=>done(null));
      ov.addEventListener('click',e=>{ if(e.target.id==='adminLoginOverlay') done(null); });
      document.getElementById('admGo').addEventListener('click',submit);
      document.getElementById('admCancel').addEventListener('click',()=>done(null));
      document.getElementById('admP').addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); });
    });
  }
  async #renderAdmin(){
    const ov=document.createElement('div'); ov.className='overlay'; ov.id='adminOverlay';
    ov.innerHTML=`<div class="overlay-box admin-box" style="max-width:660px">
      <div style="padding:22px 26px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
          <h3 style="margin:0;color:var(--cyan);flex:1">Admin — class overview</h3>
          <button type="button" class="btn" id="admClose" aria-label="close">✕</button>
        </div>
        <div id="adStats" style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0"></div>
        <div id="adBoard" style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:8px"></div>
        <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap">
          <span style="color:var(--text-dim);font-size:11.5px;line-height:1.6">Read-only view of the public scores table.<br>Real admin auth would use Supabase is_admin + RPC.</span>
          <div style="display:flex;gap:10px">
            <button type="button" class="btn" id="admRefresh">↻ Refresh</button>
            <button type="button" class="btn danger" id="admOut">Log out</button>
          </div>
        </div>
      </div></div>`;
    document.body.appendChild(ov);
    const cleanup=this.#focusTrap(ov, document.getElementById('admRefresh'));
    const done=(signOut)=>{ cleanup(); ov.remove(); if(signOut) this.#setAdminAuthed(false); };
    ov.addEventListener('esc',()=>done(false));
    ov.addEventListener('click',e=>{ if(e.target.id==='adminOverlay') done(false); });
    document.getElementById('admClose').addEventListener('click',()=>done(false));
    document.getElementById('admOut').addEventListener('click',()=>done(true));
    const load=async()=>{
      const rows=(await DB.leaderboard())||[];
      const stats=document.getElementById('adStats');
      const board=document.getElementById('adBoard');
      const tot=rows.length;
      const pts=rows.reduce((a,r)=>a+(r.points||0),0);
      stats.innerHTML=
        `<span class="ad-stat"><b>${tot}</b> players</span>`+
        `<span class="ad-stat"><b>${pts.toLocaleString()}</b> total pts</span>`+
        `<span class="ad-stat"><b>${tot?Math.round(pts/tot):0}</b> avg pts</span>`+
        `<span class="ad-stat"><b>${rows.filter(r=>r.solved_count>0).length}</b> solved ≥1</span>`;
      board.innerHTML = !tot ? '<div style="color:var(--text-dim);padding:20px;text-align:center">No scores recorded yet.</div>'
        : `<div class="ghead" style="display:grid;grid-template-columns:30px 1fr 88px 120px;gap:8px;padding:8px 12px;font-weight:700;font-size:11px;color:var(--text-dim)">
             <span>#</span><span>player</span><span>points</span><span>rank</span></div>`+
          rows.map((r,i)=>`<div class="grow" style="display:grid;grid-template-columns:30px 1fr 88px 120px;gap:8px;padding:8px 12px;align-items:center;border-top:1px solid var(--line)">
            <span style="color:var(--text-dim)">${i+1}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.username||'—')}</span>
            <span style="font-family:var(--mono)">${(r.points||0).toLocaleString()}</span>
            <span style="color:var(--cyan)">${esc(r.rank_name||'')}</span></div>`).join('');
    };
    await load();
    document.getElementById('admRefresh').addEventListener('click',load);
  }

  /* -------- view navigation -------- */
  openChallenge(id){
    this.currentChallenge=this.cm.challenge(id);
    this.view='challenge';
    document.getElementById('chview').style.display='block';
    document.getElementById('viewdata').style.display='none';
    this.renderChallenge(id);
    this.forceRefresh();
  }
  showData(tab){
    this.view='data'; this.dataTab=tab;
    document.getElementById('chview').style.display='none';
    document.getElementById('viewdata').style.display='block';
    document.querySelectorAll('.view-tabs .btn').forEach(b=>b.classList.toggle('active',b.dataset.vt===tab));
    const map={cheat:'cheatsheet',flash:'flashcards',dash:'dashboard',info:'instructions'};
    ['cheat','flash','dash','info'].forEach(t=>document.getElementById(map[t]).style.display=(t===tab?'block':'none'));
    if(tab==='cheat') this.#renderCheat();
    if(tab==='flash') this.#renderFlashcards();
    if(tab==='dash') this.#renderDashboard();
    if(tab==='info') this.#renderInstructions();
    this.forceRefresh();
  }
  #bindTabs(){ document.querySelectorAll('.view-tabs .btn').forEach(b=>b.addEventListener('click',()=>this.showData(b.dataset.vt))); }

  /* -------- terminal -------- */
  #bindTerminal(){
    const input=document.getElementById('terminput');
    let hist=[],hi=0;
    const submit=async()=>{ const v=input.value; input.value=''; if(v.trim()){ hist.push(v); hi=hist.length; } await this.term.handle(v); };
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){ e.preventDefault(); submit(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); if(hi>0){ hi--; input.value=hist[hi]||''; } }
      else if(e.key==='ArrowDown'){ e.preventDefault(); if(hi<hist.length){ hi++; input.value=hist[hi]||''; } }
    });
    document.getElementById('term').addEventListener('click',()=>input.focus());
  }
  termTell(msg,cls){ this.term.printLine(msg,cls); }

  /* -------- challenge rendering -------- */
  renderChallenge(id){
    const c=this.cm.challenge(id);
    if(this.studyMode){ this.#renderStudyView(c); return; }
    const el=document.getElementById('chview');
    const solved=this.store.isSolved(id);
    const cat=CATEGORIES.find(x=>x.id===c.cat);
    el.innerHTML=`
      <div class="ch-head">
        <span class="ch-title">#${c.id} ${esc(c.title)}</span>
        <span class="badge pts">${c.points} pts</span>
        <span class="badge diff">${c.diff}</span>
        <span class="badge cat">${cat.name}</span>
        ${solved?'<span class="badge pts" style="border-color:var(--green);color:var(--green)">✓ solved</span>':''}
      </div>
      <div class="panel brief"><h4>Briefing</h4>${this.#renderBrief(c.brief)}</div>
      <div class="panel"><h4>Challenge</h4><div class="prompt">${this.#renderPrompt(c)}</div></div>
      ${this.#renderInteraction(c)}
      <div class="panel" id="debrief" style="display:${solved?'block':'none'}"><h4>Debrief</h4>
        <div class="db">${this.#renderDebrief(c.debrief)}</div></div>`;
    this.#wireInteraction(c);
    if(c.type.startsWith('sim')||c.type==='root') this.#mountSim(c);
  }

  /* Study Mode: a read-only lesson view. Shows the briefing and the full
     explanation — no answer input, choices, flag box, hints, or simulator.
     It's a page to read, not a puzzle to solve. */
  #renderStudyView(c){
    const el=document.getElementById('chview');
    const cat=CATEGORIES.find(x=>x.id===c.cat);
    el.innerHTML=`
      <div class="ch-head">
        <span class="ch-title">#${c.id} ${esc(c.title)}</span>
        <span class="badge pts">${c.points} pts</span>
        <span class="badge diff">${c.diff}</span>
        <span class="badge cat">${cat.name}</span>
        <span class="badge diff" style="color:var(--cyan);border-color:rgba(47,214,232,.45);background:rgba(47,214,232,.08)">STUDY MODE</span>
      </div>
      <div class="panel brief"><h4>Briefing</h4>${this.#renderBrief(c.brief)}</div>
      <div class="panel"><h4>What's going on</h4>
        <div class="db">${this.#renderDebrief(c.debrief)}</div></div>
      <div class="panel" style="border-color:rgba(53,240,160,.35);background:rgba(53,240,160,.05)">
        <h4 style="color:var(--green)">Ready to test yourself?</h4>
        <p style="font-size:13.5px;line-height:1.65;color:var(--text-dim);margin:0 0 12px">
          When you start solving, every challenge unlocks and Study Mode locks for good — the only way back is a full reset.
        </p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <button type="button" class="btn primary" id="readyBtn">I'm ready — start solving</button>
          <span style="font-size:12px;color:var(--text-dim)">reading 30 lessons · start any time</span>
        </div></div>`;
    const ready=el.querySelector('#readyBtn');
    if(ready) ready.addEventListener('click',async()=>{
      const ok=await this.#askConfirm({
        icon:'⚡',
        title:'Start solving now?',
        message:"Study Mode will <b>lock here</b> — you will not be able to review lessons again unless you Reset all progress on the Dashboard.",
        confirmText:"I'm ready", cancelText:'Not yet'
      });
      if(!ok) return;
      this.beep(1200,0.08);
      this.store.commitStudy();
      this.studyMode=false;
      this.forceRefresh();
      const sb=document.getElementById('tbStudy');
      if(sb){ sb.classList.remove('active'); sb.classList.add('locked'); sb.textContent='Study: locked'; }
      this.term.printLine('Challenges unlocked — Study Mode is locked until you reset progress.','ok');
      setTimeout(()=>{ if(this.currentChallenge) this.renderChallenge(this.currentChallenge.id); },60);
    });
  }

  #renderBrief(brief){ return brief.map(p=>`<p>${this.#hl(p)}</p>`).join(''); }
  #hl(p){ return p.replace(/<hl>(.*?)<\/hl>/g,'<span class="hl">$1</span>'); }
  #renderDebrief(d){ return this.#hl(d); }

  #renderPrompt(c){
    if(c.type==='order-drag') return `<p>${this.#hl(c.prompt)}</p><div class="prog">${esc(c.order.join('\n'))}</div>`;
    if(c.type==='root') return `<div class="prog">${esc(c.root.program.join('\n'))}</div><p>${this.#hl(c.prompt)}</p>`;
    return `<p>${this.#hl(c.prompt)}</p>`;
  }

  #renderInteraction(c){
    const h=this.#hintsHTML(c);
    if(c.type==='mcq') return `<div class="panel"><h4>Answer</h4>
      <div class="choices">${c.choices.map((ch,i)=>`
        <label class="choice"><input type="radio" name="ans" value="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(ch)}</span></label>`).join('')}</div>
      <div class="feedback" aria-live="polite" id="fb"></div>
      <div class="flag-row"><button class="btn" id="subBtn">Submit</button></div>${h}</div>`;
    if(c.type==='text') return `<div class="panel"><h4>Flag</h4>
      <div class="flag-row"><input id="flagInput" placeholder="IT51{...}" aria-label="flag input"><button class="btn" id="subBtn">Submit</button></div>
      <div class="feedback" aria-live="polite" id="fb"></div>${h}</div>`;
    if(c.type==='sim-text') return `<div class="panel"><h4>Simulator</h4><div id="simhost"></div></div>
      <div class="panel"><h4>Flag</h4>
      <div class="flag-row"><input id="flagInput" placeholder="IT51{...}"><button class="btn" id="subBtn">Submit</button></div>
      <div class="feedback" aria-live="polite" id="fb"></div>${h}</div>`;
    if(c.type==='sim-bubble') return `<div class="panel"><h4>Simulator</h4><div id="simhost"></div>
      <p style="font-size:13px;color:var(--text-dim);margin-top:8px">Click “+ add bubble” to drop a bubble before the first R-type, then submit.</p></div>
      <div class="panel"><h4>Flag</h4>
      <div class="flag-row"><input id="flagInput" placeholder="IT51{...}"><button class="btn" id="subBtn">Submit</button></div>
      <div class="feedback" aria-live="polite" id="fb"></div>${h}</div>`;
    if(c.type==='select-multi') return `<div class="panel"><h4>Select</h4><div class="chips" id="chips">
      ${c.multi.map((m,i)=>`<span class="chip decoy" data-i="${i}">${esc(m)}</span>`).join('')}</div>
      <div class="feedback" aria-live="polite" id="fb"></div>
      <div class="flag-row"><button class="btn" id="subBtn">Submit</button></div>${h}</div>`;
    if(c.type==='order-drag') return `<div class="panel"><h4>Reorder</h4><div class="order-list" id="orderlist"></div>
      <div class="feedback" aria-live="polite" id="fb"></div>
      <div class="flag-row"><button class="btn" id="subBtn">Submit</button></div>${h}</div>`;
    if(c.type==='quiz') return `<div class="panel"><h4>Rapid-fire</h4><div id="quizhost"></div></div>`;
    if(c.type==='root') return `<div class="panel"><h4>ROOT sequence</h4><div id="roothost"></div></div>`;
    return '';
  }

  #hintsHTML(c){
    const used=this.store.hintsUsed(c.id);
    let rows='';
    for(let i=0;i<3;i++){
      if(i<used) rows+=`<div class="hint-item">${esc(c.hints[i])}</div>`;
      else rows+=`<div class="hint-item locked">hint ${i+1} — locked</div>`;
    }
    return `<div class="hint-block" id="hintBlock" tabindex="-1"><h4>Hints</h4><div class="hint-rows">${rows}</div>
      <button class="btn hint-btn" id="hintBtn">${used>=3?'No hints left':'Reveal hint'}</button></div>`;
  }

  /* -------- interaction wiring -------- */
  #wireInteraction(c){
    const hintBtn=document.getElementById('hintBtn');
    if(hintBtn) hintBtn.addEventListener('click',()=>{
      const r=this.hints.use(c);
      if(r.ok){ this.beep(600,0.06); this.forceRefresh(); this.renderChallenge(c.id);
        const hb=document.getElementById('hintBlock'); if(hb) hb.focus(); }
      else { this.beep(200,0.1); const fb=document.getElementById('fb'); if(fb) fb.textContent=r.msg; }
    });

    if(c.type==='select-multi'){
      const chips=document.getElementById('chips'), sel=new Set();
      chips.querySelectorAll('.chip').forEach(ch=>{
        ch.setAttribute('tabindex','0'); ch.setAttribute('role','checkbox');
        const click=()=>{
          const i=parseInt(ch.dataset.i,10);
          if(sel.has(i)){ sel.delete(i); ch.classList.remove('sel'); ch.setAttribute('aria-checked','false'); }
          else { sel.add(i); ch.classList.add('sel'); ch.setAttribute('aria-checked','true'); }
        };
        ch.addEventListener('click',click);
        ch.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); click(); } });
      });
      document.getElementById('subBtn').addEventListener('click',()=>{
        const picked=[...sel].map(i=>c.multi[i]);
        if(!picked.length){ document.getElementById('fb').textContent='Select something first.'; return; }
        this.#checkFlag(c,this.#makeMultiCanon(picked));
      });
    }
    if(c.type==='order-drag'){
      const order=[...c.order];
      const listEl=document.getElementById('orderlist');
      const renderOrder=()=>{
        listEl.innerHTML=order.map((o,i)=>`
          <div class="order-row"><span class="idx">${i+1}</span><span class="code">${esc(o)}</span>
            <span class="arrow" data-act="up" data-i="${i}">▲</span><span class="arrow" data-act="down" data-i="${i}">▼</span></div>`).join('');
        listEl.querySelectorAll('.arrow').forEach(a=>{
          a.setAttribute('tabindex','0'); a.setAttribute('role','button');
          const actF=()=>{
            const i=parseInt(a.dataset.i,10),act=a.dataset.act;
            const j=act==='up'?i-1:i+1;
            if(j<0||j>=order.length) return;
            [order[i],order[j]]=[order[j],order[i]]; renderOrder();
          };
          a.addEventListener('click',actF);
          a.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); actF(); } });
        });
      };
      renderOrder();
      document.getElementById('subBtn').addEventListener('click',()=>{
        const canon=order.map(o=>o.split(/[ (]/)[0].toLowerCase()).join('_');
        this.#checkFlag(c,canon);
      });
    }
    if(c.type==='mcq'){
      document.getElementById('subBtn').addEventListener('click',()=>{
        const sel=document.querySelector('input[name="ans"]:checked');
        if(!sel){ document.getElementById('fb').textContent='Pick an answer first.'; return; }
        const idx=parseInt(sel.value,10); const chosen=c.choices[idx];
        this.#checkFlag(c,this.#makeCanon(c,chosen));
      });
    }
    if(c.type==='text'){
      this.#attachFlagPreview(c);
      document.getElementById('subBtn').addEventListener('click',()=>{
        const v=document.getElementById('flagInput').value;
        this.#checkFlag(c,CANON[c.id](v)||trimC(v));
      });
      document.getElementById('flagInput').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('subBtn').click(); });
    }
    if(c.type==='sim-text'||c.type==='sim-bubble'){
      this.#attachFlagPreview(c);
      const subBtn=document.getElementById('subBtn');
      if(subBtn) subBtn.addEventListener('click',()=>{
        const v=document.getElementById('flagInput').value;
        this.#checkFlag(c,CANON[c.id](v)||trimC(v));
      });
    }
    if(c.type==='quiz') this.#initQuiz(c);
    if(c.type==='root') this.#initRoot(c);
  }

  /* Live "what will be checked" preview under every flag input, plus a
     friendly format reminder when it's empty. Makes the flag format and
     normalization visible so new players aren't guessing. */
  #attachFlagPreview(c){
    const inp=document.getElementById('flagInput');
    if(!inp) return;
    const wrap=inp.parentElement;
    let prev=wrap.nextElementSibling;
    if(!prev || prev.className!=='flag-preview'){
      prev=document.createElement('div'); prev.className='flag-preview';
      wrap.after(prev);
    }
    const render=()=>{
      const v=inp.value;
      if(!v.trim()){
        prev.innerHTML='<span class="muted">Flags look like <b>IT51{your_answer}</b> — the wrapper, capitals and spaces are all handled for you.</span>';
        return;
      }
      const canon=CANON[c.id]?CANON[c.id](v):trimC(v);
      prev.innerHTML=`will be checked as: <b>IT51{${esc(canon)}}</b>`;
    };
    inp.addEventListener('input',render);
    render();
  }

  #makeCanon(c,chosen){
    const s=trimC(chosen);
    if(c.id===1) return /^overlap$/.test(s)?"overlap":s;
    if(c.id===2) return /^throughput$/.test(s)?"throughput":s;
    if(c.id===15) return /store/.test(s)?"two_stores":s;
    if(c.id===16) return /collide|collision/.test(s)?"one_access_per_cycle":s;
    if(c.id===18) return /3/.test(s)?"nop_at_stage_3":s;
    if(c.id===20) return /r2/.test(s)&&/operand/.test(s)?"r2_operand_fetch":s;
    if(c.id===22) return /execute/.test(s)&&/operand/.test(s)?"execute_to_operand_fetch":s;
    if(c.id===24) return /forwarding cannot/.test(s)?"last_resort":s;
    return s;
  }

  #makeMultiCanon(picked){
    const p=picked.map(x=>trimC(x).replace(/[^a-z0-9]/g,'_'));
    const has=t=>p.some(x=>x.includes(t));
    if(has('incrementer')&&has('mdr')&&has('bandwidth')) return "pc_incrementer_mdr_bandwidth";
    return p.sort().join('_');
  }

  /* -------- flag checking -------- */
  async #checkFlag(c,canon,fbOverride){
    const fb=fbOverride || document.getElementById('fb') || document.getElementById('rootFb') || null;
    if(!fb) return;
    const full="it51{"+canon+"}";
    let hash;
    try{ hash=await sha256hex(full); }catch(e){ hash=SHA256(full); }
    if(hash===c.hash){
      this.#onSolved(c,fb);
    }else{
      fb.innerHTML='Not quite — try again.<br><span style="font-size:12px;opacity:.85">hint: flags are case-insensitive · IT51{…} is optional · check the preview line</span>';
      fb.className="feedback bad";
      const input=document.getElementById('flagInput'); const box=input?input.parentElement:fb.parentElement;
      if(box) box.classList.add('shake');
      this.beep(160,0.15);
      this.term.printLine("Not quite — try again.","err");
      setTimeout(()=>{ if(box) box.classList.remove('shake'); },500);
    }
  }

  celebrate(pts){
    // shared success feedback: flash the challenge panels, chime, confetti.
    // Public so the easter-egg terminal path can share it too.
    const flashPanels=[...document.querySelectorAll('#chview .panel')];
    flashPanels.forEach(p=>p.classList.add('flash'));
    setTimeout(()=>flashPanels.forEach(p=>p.classList.remove('flash')),1000);
    this.beep(1200,0.08);
    setTimeout(()=>this.beep(1600,0.1),120);
    this.#confetti();
  }

  #onSolved(c,fb){
    if(this.store.isSolved(c.id)){ const f=fb||document.getElementById('fb'); if(f) f.textContent='Already solved.'; return; }
    this.store.markSolved(c.id,c.points);
    this.#markCompletedCategories();
    const pts=c.points;
    const f=fb||document.getElementById('fb');
    if(f){ f.textContent=`FLAG ACCEPTED +${pts} pts`; f.className="feedback ok"; }
    this.celebrate(pts);
    this.term.printLine(`FLAG ACCEPTED +${pts}pts`,"ok");
    if(this.cloud) DB.saveCloudState(this.store);
    this.forceRefresh();
    const deb=document.getElementById('debrief'); if(deb) deb.style.display='block';
    const next=this.cm.nextUnlocked();
    if(next) this.term.printLine(`next: #${next.id} ${next.title}`,"sys");
  }

  #confetti(){
    const colors=['#35f0a0','#2fd6e8','#f5b942','#9f9fff'];
    let reduced=false; try{ reduced=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    if(reduced) return;
    for(let i=0;i<34;i++){
      const d=document.createElement('div'); d.className='conf';
      d.style.left=Math.random()*100+'vw'; d.style.top='30%'+Math.random()*20+'%';
      d.style.background=colors[i%colors.length];
      d.style.animation=`lite ${1+Math.random()*1.2}s ${Math.random()*0.4}s forwards`;
      document.body.appendChild(d); setTimeout(()=>d.remove(),2200);
    }
  }

  beep(freq,dur){
    if(!this.sound) return;
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.frequency.value=freq; o.type='square'; g.gain.value=0.04;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+(dur||0.1));
    }catch(e){}
  }

  /* -------- simulator mounting -------- */
  async #mountSim(c){
    const host=document.getElementById('simhost'); if(!host) return;
    const sim=new PipelineSimulator(host);
    this.currentSim=sim;
    if(c.sim.kind==='fdoes'){
      sim.program=Array(c.sim.n).fill(0).map((_,i)=>({label:`I${i+1}`,stages:['F','D','O','E','S']}));
      sim.render();
    } else if(c.sim.kind==='depth'){
      const instr=c.sim.instructions||1000, depth=5;
      sim.program=Array(5).fill(0).map((_,i)=>({label:`I${i+1}`,stages:divStages(depth)}));
      sim.render();
      // Insert the depth selector *before* the rendered controls/grid without
      // clobbering host.innerHTML (which would drop the animator buttons).
      host.insertAdjacentHTML('afterbegin',`<div class="depth-ctl"><label>stages <select id="depthSel">${[3,4,5,6,7,8].map(d=>`<option value="${d}" ${d===depth?'selected':''}>${d}</option>`).join('')}</select></label>
        <span class="dept-meta" id="deptMeta"></span></div>`);
      const upd=()=>{
        const d=parseInt(document.getElementById('depthSel').value,10);
        const ideal=(instr*d)/(instr+d-1);
        document.getElementById('deptMeta').textContent=`${instr} instructions · ideal speedup ≈ ${ideal.toFixed(2)} (→${d})`;
      };
      document.getElementById('depthSel').addEventListener('change',upd); upd();
    } else if(c.sim.kind==='bubble'){
      sim.setProgram(c.sim.program);
      sim.render();
      this.#wireBubbleGrid(sim,host,c);
    } else if(c.sim.kind==='datastall'){
      sim.program=[{label:'ADD R2,#5F',stages:['F','D','O','E','S']},{label:'SUB R5,R2',stages:['F','D','O','E','S']},{label:'MUL R3,(100)',stages:['F','D','O','E','S']},{label:'ADD (400),R4',stages:['F','D','O','E','S']}];
      sim.render();
      host.insertAdjacentHTML('beforeend',`<div class="sim-meta">dep: R2 written by ADD (Store @cyc5), read by SUB @Operand Fetch. 1 stall inserted.</div>`);
    }
    // wire the animator buttons
    this.#wireSimButtons(sim,host);
    // self-playing intro: animate the fill once so newcomers see the
    // pipeline move without touching anything
    this.#maybeAutoDemo(sim, host, c);
  }

  /* Plays the pipeline fill through once on the basic FDOES challenge
     (the first thing new players see). Cancels on any user interaction;
     skipped for reduced-motion and for other sim kinds. */
  #maybeAutoDemo(sim, host, c){
    if(this._didAutoDemo) return;
    if(this.#reduceMotion()) return;
    if(!c.sim || c.sim.kind!=='fdoes') return;
    this._didAutoDemo=true;
    let poll=null, t=null;
    const stopDemo=()=>{
      if(poll){ clearInterval(poll); poll=null; }
      if(t){ clearTimeout(t); t=null; }
      const a=this._wiredAnim; if(a) a.stop();
      try{ sim.render(); }catch(e){}
    };
    host.addEventListener('pointerdown',()=>stopDemo(),{once:true});
    t=setTimeout(()=>{
      const a=this._wiredAnim; if(!a){ stopDemo(); return; }
      a.start();
      poll=setInterval(()=>{
        if(a.cycle>=a.max){
          clearInterval(poll); poll=null;
          setTimeout(()=>{ a.stop(); try{ sim.render(); }catch(e){} },280);
        }
      },160);
    },750);
  }

  #wireSimButtons(sim,host){
    // Delegate on the host element so the animator controls keep working
    // even after sim.render() rebuilds the controls' inner HTML (bubble
    // toggles, the reset button, etc.). The host node itself persists.
    if(host.dataset.simWired) return;
    host.dataset.simWired='1';
    const anim=new PipeAnimator(sim);
    this._wiredAnim=anim;
    anim.bubbleBefore=this.currentBubbleBefore||[];
    host.addEventListener('click',e=>{
      const t=e.target.closest('[data-sa]'); if(!t) return;
      const act=t.dataset.sa;
      if(act==='play'){ this.beep(880,0.04); anim.start(); }
      else if(act==='reset'){ anim.stop(); sim.render({bubbleBefore:anim.bubbleBefore}); if(this.#rerenderBubbleMeta) this.#rerenderBubbleMeta(); }
      else if(act==='step'){ anim.cycle=Math.min(anim.cycle+1,anim.recomputeMax()); anim.paint(); }
    });
    host.addEventListener('input',e=>{
      const t=e.target.closest('[data-sa=speed]'); if(!t) return;
      sim.speed=+t.value; anim.sim.speed=sim.speed;
    });
  }

  #wireBubbleGrid(sim,host,c){
    let bubbled=false;
    this.currentBubbleBefore=[false,false,false,false,false];
    const updateMeta=()=>{ this.#rerenderBubbleMeta=()=>updateMeta(); };
    const upd=()=>{
      this.currentBubbleBefore=bubbled?[false,true,false,false,false]:[false,false,false,false,false];
      sim.render({bubbleBefore:this.currentBubbleBefore});
      const {total}=sim.schedule({bubbleBefore:this.currentBubbleBefore});
      const clash=sim.collisions(this.currentBubbleBefore);
      const existing=host.querySelector('.sim-meta'); if(existing) existing.remove();
      const meta=document.createElement('div'); meta.className='sim-meta';
      meta.innerHTML=`bubble: <button type="button" class="btn" data-bub="add">+ add bubble</button> <button type="button" class="btn" data-bub="rm">− remove</button> · total cycles: <b id="bubTotal">${total}</b>`;
      host.appendChild(meta);
      meta.querySelector('[data-bub=add]').addEventListener('click',()=>{ bubbled=true; upd(); this.beep(900,0.05); });
      meta.querySelector('[data-bub=rm]').addEventListener('click',()=>{ bubbled=false; upd(); });
      if(bubbled && total===9 && clash.length===0) meta.style.borderColor='var(--green)';
    };
    updateMeta();
    upd();
  }

  /* -------- instructions (how to play) -------- */
  #renderInstructions(){
    const el=document.getElementById('instructions');
    const sections=[
      { t:'Goal', h:`<p>Solve <b>30 challenges</b> about CPU pipelining (FDOES, hazards, forwarding, bubbles, branch penalties). Each correct flag earns points; points move you up the ranks, and finishing a category unlocks the next one.</p>` },
      { t:'How to solve a challenge', h:`<ol style="padding-left:18px;line-height:1.8">
          <li><b>Open it</b> from the sidebar (left) or type <span class="hl">open 1</span> in the terminal.</li>
          <li><b>Read the briefing</b> and work the interactive puzzle (simulator, choices, reorder, etc.).</li>
          <li><b>Submit a flag</b> — a short answer wrapped like <span class="hl">IT51{your_answer}</span>.</li>
        </ol>
        <p style="margin-top:8px">Flags are forgiving: the <span class="hl">IT51{…}</span> wrapper is optional, capitals and spaces are normalized, and many challenges accept several spellings. A live preview under the box shows exactly what will be checked.</p>` },
      { t:'Finding your way around', h:`<ul style="line-height:1.8">
          <li><b>Sidebar</b> (left) — the challenge map. Locked challenges show a 🔒; solve ~70% of a category to open the next.</li>
          <li><b>Top bar</b> — Cheat Sheet (concepts), Flashcards, Dashboard (progress), Leaderboard (class rankings), Instructions (this page).</li>
          <li><b>Terminal</b> (bottom) — commands: <span class="hl">help</span>, <span class="hl">open #id</span>, <span class="hl">hint</span>, <span class="hl">score</span>, <span class="hl">whoami</span>, <span class="hl">flags</span>.</li>
          <li><b>Study Mode</b> — read-only lessons. When you're ready, press <b>"I'm ready"</b> to start solving; Study Mode then locks (re-open it via <b>Reset all progress</b> on the Dashboard).</li>
        </ul>` },
      { t:'Points, hints & ranks', h:`<ul style="line-height:1.8">
          <li>Each challenge is worth points; harder ones are worth more.</li>
          <li><b>Hints</b> reveal a clue when you're stuck — three hints per challenge, no point penalty.</li>
          <li>Ranks: <span class="hl">Script Kiddie → Packet Sniffer → Bit Flipper → Pipeline Engineer → Silicon Wizard</span>.</li>
        </ul>` },
      { t:'Accounts & progress', h:`<ul style="line-height:1.8">
          <li>Logged in? Your progress syncs to the cloud and the shared leaderboard.</li>
          <li>Use <b>Export / Import</b> on the Dashboard to move progress between browsers.</li>
          <li><b>Reset all progress</b> clears everything (and unlocks Study Mode again).</li>
        </ul>
        <p class="hl a" style="margin-top:8px">Note: the course source says SUB 'adds' — that's a typo. SUB is subtraction.</p>` },
    ];
    el.innerHTML=`<div class="ins-intro">How to play — expand as you go.</div>`+
      sections.map((s,i)=>`
      <div class="acc" data-i="${i}">
        <button class="acc-head" type="button">${i+1}. ${s.t}<span class="acc-chev">▾</span></button>
        <div class="acc-body"><div class="acc-inner">${s.h}</div></div>
      </div>`).join('');
    const accs=[...el.querySelectorAll('.acc')];
    let reduced=false; try{ reduced=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    const open=i=>{
      const a=accs[i], b=a.querySelector('.acc-body');
      a.classList.add('open');
      b.style.maxHeight=b.scrollHeight+'px';
    };
    accs.forEach((a,i)=>{
      a.addEventListener('click',()=>{
        const on=a.classList.contains('open');
        a.classList.toggle('open');
        const b=a.querySelector('.acc-body');
        b.style.maxHeight=on?'0':b.scrollHeight+'px';
      });
    });
    // auto-open the sections in sequence (instant if reduced motion)
    if(reduced){ accs.forEach((_,i)=>open(i)); }
    else { accs.forEach((_,i)=>setTimeout(()=>open(i), i*320+200)); }
  }

  /* -------- cheat sheet -------- */
  #renderCheat(){
    const el=document.getElementById('cheatsheet');
    // The whole Cheat Sheet is gated behind the secret terminal command
    // `sudo chillinmalware` (or beating the final boss) — not just the
    // full reference. No command, no content.
    const unlocked=this.store.state.cheatUnlocked || this.store.isSolved(30);
    if(!unlocked){
      el.innerHTML=`<div class="cheat-gate">🔒 Cheat Sheet locked — there's a secret terminal command that unlocks it…</div>`;
      return;
    }
    const full=unlocked;
    let html=`
      <div class="cheat-section"><h3>1 · What pipelining is</h3>
        <p>Overlapping <span class="hl">multiple instructions in execution</span>. One instruction goes through a stage of the instruction cycle while the previous does a later stage. Free resource → use it immediately.</p>
        <p>Pipelining does <b>not</b> cut single-instruction latency; it raises <b>throughput</b>. Ideal speedup approaches the number of stages.</p></div>
      <div class="cheat-section"><h3>2 · The instruction cycle (FDOES)</h3>
        <p><span class="hl">F</span>etch → <span class="hl">D</span>ecode → <span class="hl">O</span>perand Fetch → <span class="hl">E</span>xecute → <span class="hl">S</span>tore. One clock cycle each. A Load has all 5 stages; an R-type has 4 (no Operand Fetch).</p>
        <p>Fill formula: pipelined cycles = stages + instructions − 1. Non-pipelined = instructions × stages.</p></div>
      <div class="cheat-section"><h3>3 · Hardware requirements</h3>
        <ul><li>Extra <b>incrementer</b> for the PC (so Fetch and Execute overlap without hogging the ALU)</li>
        <li>Separate <b>MDR</b> for loads and stores</li>
        <li>High <b>memory bandwidth</b> (one access per cycle to a single memory is a structural limit)</li></ul></div>
      <div class="cheat-section"><h3>4 · Structural hazards</h3>
        <p>Two instructions want the same resource at the same time (e.g. combined washer-dryer, one main memory, Load vs R-type store-store clash).</p>
        <ul><li>Fix A — <b>Pipeline bubble</b>: insert an idle slot so the two writes don't collide.</li>
        <li>Fix B — <b>Delay Store Cycle</b>: add a NOP so every instruction is the same 5-stage shape (R-type → F D NOP E S).</li></ul></div>
      <div class="cheat-section"><h3>5 · Data hazards</h3>
        <p>An instruction uses a value before a prior instruction has written it (dependency on R2 in <code>ADD R2,#5F / SUB R5,R2</code>).</p>
        <p class="hl a">Note: course source says SUB 'adds' — typo. SUB is subtraction.</p>
        <ul><li><b>Forwarding</b> (hardware): send Execute-stage Z-register output straight to the next instruction's Operand Fetch. Write in first half-cycle, read in second.</li>
        <li><b>Pipeline scheduling</b> (software): compiler reorders (ADD, MUL, SUB, ADD).</li>
        <li><b>Interlock</b> (hardware): detect and stall when forwarding can't resolve. Last resort.</li></ul></div>
      <div class="cheat-section"><h3>6 · Control hazards</h3>
        <p>The branch decision happens after the next instructions were already fetched and decoded → they're flushed (branch penalty).</p>
        <p>Fix: decide early if it's a taken branch, and <b>compute the target address in advance</b>.</p></div>
      <div class="cheat-section"><h3>7 · The laundry map</h3>
        <ul><li>laundry task = instruction</li><li>laundry stages = instruction cycle stages</li>
        <li>machines = CPU components (datapath, control unit, MAR, MDR, IR, PC)</li></ul></div>`;
    if(full){
      html+=`<div class="cheat-section"><h3>★ FULL REFERENCE UNLOCKED</h3>
        <p>Full course cheat sheet unlocked.</p>
        <table class="compare"><tr><th>Fix</th><th>Type</th><th>Stall?</th><th>Notes</th></tr>
        <tr><td>Forwarding</td><td>hardware</td><td>no</td><td>Z-register → Operand Fetch</td></tr>
        <tr><td>Pipeline scheduling</td><td>software</td><td>no</td><td>compiler reorders</td></tr>
        <tr><td>Interlock</td><td>hardware</td><td>yes</td><td>when forwarding fails</td></tr>
        <tr><td>Pipeline bubble</td><td>hardware</td><td>yes</td><td>structural store-store</td></tr>
        <tr><td>NOP delay</td><td>hardware</td><td>yes</td><td>uniform 5-stage shape</td></tr>
        <tr><td>Branch target precompute</td><td>hardware</td><td>reduced</td><td>control hazard</td></tr></table>
        <p>Timing: 5-stage 5 instructions → 9 cycles pipelined, 25 non. Speedup 25/9 ≈ 2.78. 100 instructions → 104/500 ≈ 4.81, approaching 5.</p></div>`;
    } else {
      html+=`<div class="cheat-section"><h3>🔒 Full reference locked</h3>
        <p>There's a secret terminal command that unlocks the complete comparison table and timing reference…</p></div>`;
    }
    el.innerHTML=html;
    this.#cascadeOnce(el, 80, 420);
  }

  /* -------- flashcards -------- */
  #renderFlashcards(){
    const el=document.getElementById('flashcards');
    const cards=[];
    for(const c of this.challenges){
      if(!(this.store.isSolved(c.id)||this.studyMode)) continue;
      cards.push({term:c.title,def:c.debrief.replace(/<hl>(.*?)<\/hl>/g,'$1').replace(/<[^>]+>/g,'')});
    }
    if(!cards.length){ el.innerHTML='<p style="color:var(--text-dim)">Solve challenges (or turn on Study Mode) to build flashcards.</p>'; return; }
    el.innerHTML=cards.map((card,i)=>`<div class="fcard" data-i="${i}"><div class="face">${esc(card.term)}</div><div class="back">${esc(card.def)}</div></div>`).join('');
    this.#cascadeOnce(el, 55, 340);
    el.querySelectorAll('.fcard').forEach(f=>f.addEventListener('click',()=>f.classList.toggle('flip')));
  }

  /* -------- dashboard -------- */
  #renderDashboard(){
    const el=document.getElementById('dashboard');
    let html=`<div id="dash-card">
      <div class="dstat"><div class="dv">${this.scoreboard.points()}</div><div class="dk">total points</div></div>
      <div class="dstat"><div class="dv">${this.scoreboard.solvedCount()}/${this.challenges.length}</div><div class="dk">challenges solved</div></div>
      <div class="dstat"><div class="dv">${this.scoreboard.rank().name}</div><div class="dk">current rank</div></div>
      <div class="dstat"><div class="dv">${Object.values(this.store.state.hints).reduce((a,b)=>a+b,0)}</div><div class="dk">hints used</div></div>
    </div>`;
    html+='<h4 style="margin:16px 0 8px;color:var(--cyan);font-family:var(--mono);font-size:12px">PROGRESS BY CATEGORY</h4>';
    for(const cat of CATEGORIES){
      const chs=this.challenges.filter(c=>c.cat===cat.id);
      const sol=chs.filter(c=>this.store.isSolved(c.id)).length;
      const pct=Math.round(sol/chs.length*100);
      html+=`<div class="dbar"><div class="top"><b>${cat.name}</b><span>${sol}/${chs.length}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }
    html+=`<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="expBtn">Export progress</button>
      <button class="btn" id="impBtn">Import progress</button>
      <button class="btn danger" id="resetBtn">Reset all progress</button></div>
      <div class="feedback" aria-live="polite" id="ieFb"></div>`;
    el.innerHTML=html;
    this.#cascadeOnce(el, 70, 380);
    document.getElementById('expBtn').addEventListener('click',()=>{
      const blob=this.store.exportBlob();
      const ie=document.getElementById('ieFb');
      try{ navigator.clipboard.writeText(blob).then(()=>ie.textContent='Copied to clipboard ✓'); }
      catch(e){ ie.textContent=blob; }
    });
    document.getElementById('impBtn').addEventListener('click',()=>{
      const raw=prompt('Paste the exported JSON blob:');
      if(raw&&this.store.importBlob(raw)){ document.getElementById('ieFb').textContent='Imported ✓'; if(this.cloud) DB.saveCloudState(this.store); this.forceRefresh(); if(this.currentChallenge) this.renderChallenge(this.currentChallenge.id); }
      else document.getElementById('ieFb').textContent='Import failed: invalid blob.';
    });
    document.getElementById('resetBtn').addEventListener('click',async()=>{
      const ok=await this.#askConfirm({
        icon:'⚠️',
        title:'Reset all progress?',
        message:"This clears solves, points, hints, and unlocks for <b>unfinished</b> tabs — and re-opens Study Mode. Permanently completed tabs stay done.",
        confirmText:'Yes, reset everything', cancelText:'Cancel', danger:true
      });
      if(!ok) return;
      this.store.reset();
      if(this.cloud) DB.saveCloudState(this.store);
      const sb=document.getElementById('tbStudy');
      if(sb){ sb.classList.remove('locked'); sb.textContent='Study Mode'; }
      this.term.printLine('Progress reset — Study Mode is available again.','sys');
      this.forceRefresh();
      if(this.currentChallenge) this.renderChallenge(this.currentChallenge.id);
    });
  }

  /* -------- quiz (challenge 29) -------- */
  #initQuiz(c){
    const host=document.getElementById('quizhost');
    if(!host) return;
    const pool=[...QUIZ_POOL];
    const questions=[];
    while(questions.length<c.quiz.total && pool.length){ const i=Math.floor(Math.random()*pool.length); questions.push(pool.splice(i,1)[0]); }
    let qi=0, correct=0;
    const render=()=>{
      if(qi>=questions.length){
        const pass=correct>=c.quiz.pass;
        host.innerHTML=`<div class="quiz-count">done · ${correct}/${questions.length} correct (need ${c.quiz.pass})</div>
          <div class="quiz-q">
            ${pass?`<div class="feedback ok">PASS — <button class="btn" id="claimFlag">claim flag</button></div>`:`<div class="feedback bad">MISS — need ${c.quiz.pass}, got ${correct}. <button class="btn" id="retry">retry</button></div>`}
          </div>`;
        const retry=document.getElementById('retry'); if(retry) retry.addEventListener('click',()=>this.#initQuiz(c));
        const claim=document.getElementById('claimFlag');
        if(claim) claim.addEventListener('click',()=>this.#checkFlag(c,"pipeline_novice_cleared", host.querySelector('.feedback')));
        return;
      }
      const q=questions[qi];
      host.innerHTML=`<div class="quiz-count">question ${qi+1}/${questions.length} · ${correct} correct</div>
        <div class="quiz-q"><div class="qtext">${esc(q.q)}</div><div class="choices">${q.opts.map((o,i)=>`<label class="choice" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></label>`).join('')}</div>
        <div class="feedback" aria-live="polite" id="qfb"></div></div>`;
      host.querySelectorAll('.choice').forEach(ch=>{
        const onClick=()=>{
          const chosen=parseInt(ch.dataset.i,10);
          const fb=document.getElementById('qfb');
          if(chosen===q.a){ correct++; fb.textContent='✓ correct'; fb.className='feedback ok'; this.beep(1100,0.06); }
          else { fb.textContent='✗ nope'; fb.className='feedback bad'; this.beep(180,0.1); }
          qi++; render();
        };
        ch.setAttribute('tabindex','0'); ch.setAttribute('role','button');
        ch.addEventListener('click',onClick);
        ch.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onClick(); } });
      });
    };
    render();
  }

  /* -------- root boss (challenge 30) -------- */
  #initRoot(c){
    const host=document.getElementById('roothost');
    if(!host) return;
    const steps=[
      {name:"(a) hazard types", done:false},
      {name:"(b) choose fixes", done:false},
      {name:"(c) minimal stalls", done:false},
      {name:"(d) final question", done:false}
    ];
    const render=()=>{
      let html='';
      html+=`<div class="boss-step ${steps[0].done?'done':''}"><div class="bst-n">STEP A — identify hazard types</div>
        <div class="chips" id="hazChips"><span class="chip" data-h="structural">structural</span><span class="chip" data-h="data">data</span><span class="chip" data-h="control">control</span><span class="chip" data-h="none">none</span></div>
        <div class="step-feedback" aria-live="polite" id="hazFb"></div></div>`;
      html+=`<div class="boss-step ${steps[1].done?'done':''}"><div class="bst-n">STEP B — choose a fix per hazard</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px">structural → bubble / NOP · data → forwarding / scheduling / interlock · control → target precompute</div>
        <div class="chips" id="fixChips"><span class="chip" data-f="bubble">bubble</span><span class="chip" data-f="nop">NOP delay</span><span class="chip" data-f="forwarding">forwarding</span><span class="chip" data-f="scheduling">scheduling</span><span class="chip" data-f="interlock">interlock</span><span class="chip" data-f="target_precompute">target precompute</span></div>
        <div class="step-feedback" aria-live="polite" id="fixFb"></div></div>`;
      html+=`<div class="boss-step ${steps[2].done?'done':''}"><div class="bst-n">STEP C — minimal stall count via simulator</div>
        <div id="rootSim"></div>
        <div class="flag-row" style="margin-top:8px"><input id="stallInput" placeholder="stall count"><button class="btn" id="stallBtn">check</button></div>
        <div class="step-feedback" aria-live="polite" id="stallFb"></div></div>`;
      html+=`<div class="boss-step ${steps[3].done?'done':''}"><div class="bst-n">STEP D — final conceptual question</div>
        <div class="qtext" style="margin:6px 0">Does pipelining reduce the time of a single instruction?</div>
        <div class="choices">
          <label class="choice" data-q="no"><span class="letter">A</span><span>No — only throughput improves</span></label>
          <label class="choice" data-q="yes"><span class="letter">B</span><span>Yes — instructions finish faster</span></label></div>
        <div class="step-feedback" aria-live="polite" id="finalFb"></div></div>`;
      html+=`<div class="feedback" aria-live="polite" id="rootFb"></div>`;
      host.innerHTML=html;

      const hazSel=new Set();
      host.querySelectorAll('#hazChips .chip').forEach(ch=>{
        ch.setAttribute('tabindex','0'); ch.setAttribute('role','checkbox');
        const hazClick=()=>{
          const h=ch.dataset.h;
          if(ch.classList.contains('sel')){ hazSel.delete(h); ch.classList.remove('sel'); ch.setAttribute('aria-checked','false'); }
          else { hazSel.add(h); ch.classList.add('sel'); ch.setAttribute('aria-checked','true'); }
        };
        ch.addEventListener('click',hazClick);
        ch.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); hazClick(); } });
      });
      const hazGo=()=>{
        const ok=JSON.stringify([...hazSel].sort())===JSON.stringify(["control","data","structural"]);
        const fb=document.getElementById('hazFb');
        if(ok){ fb.textContent='✓ correct: structural, data, control'; fb.className='step-feedback ok'; steps[0].done=true; this.beep(1000,0.06); }
        else { fb.textContent='not quite — look at the program again'; fb.className='step-feedback bad'; }
        renderChecks();
      };
      const hazBtn=document.createElement('button'); hazBtn.className='btn'; hazBtn.style.marginTop='6px'; hazBtn.textContent='check haz'; hazBtn.addEventListener('click',hazGo);
      host.querySelector('#hazFb').after(hazBtn);

      const fixSel=new Set();
      host.querySelectorAll('#fixChips .chip').forEach(ch=>{
        ch.setAttribute('tabindex','0'); ch.setAttribute('role','checkbox');
        const fixClick=()=>{
          const f=ch.dataset.f;
          if(ch.classList.contains('sel')){ fixSel.delete(f); ch.classList.remove('sel'); ch.setAttribute('aria-checked','false'); }
          else { fixSel.add(f); ch.classList.add('sel'); ch.setAttribute('aria-checked','true'); }
        };
        ch.addEventListener('click',fixClick);
        ch.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fixClick(); } });
      });
      const fixGo=()=>{
        const need=["bubble","forwarding","target_precompute"];
        const ok=need.every(n=>fixSel.has(n));
        const fb=document.getElementById('fixFb');
        if(ok){ fb.textContent='✓ correct fix set'; fb.className='step-feedback ok'; steps[1].done=true; this.beep(1000,0.06); }
        else { fb.textContent='pick bubble (or NOP), forwarding, and target precompute'; fb.className='step-feedback bad'; }
        renderChecks();
      };
      const fixBtn=document.createElement('button'); fixBtn.className='btn'; fixBtn.style.marginTop='6px'; fixBtn.textContent='check fixes'; fixBtn.addEventListener('click',fixGo);
      host.querySelector('#fixFb').after(fixBtn);

      const simHost=document.getElementById('rootSim');
      if(simHost){
        const sim=new PipelineSimulator(simHost);
        sim.setProgram(['L','R','R','R','BD','R']);
        sim.render();
        simHost.insertAdjacentHTML('beforeend',`<div class="sim-meta">minimal stalls with correct fixes = 1 (the load-use).</div>`);
        this.#wireSimButtons(sim,simHost);
      }
      document.getElementById('stallBtn').addEventListener('click',()=>{
        const v=parseInt(document.getElementById('stallInput').value,10);
        const fb=document.getElementById('stallFb');
        if(v===1){ fb.textContent='✓ minimal = 1'; fb.className='step-feedback ok'; steps[2].done=true; this.beep(1000,0.06); }
        else { fb.textContent='not minimal — with forwarding+bubble+precompute the only stall is the load-use'; fb.className='step-feedback bad'; }
        renderChecks();
      });

      host.querySelectorAll('[data-q]').forEach(el=>{
        const onClick=()=>{
          const fb=document.getElementById('finalFb');
          if(el.dataset.q==='no'){ fb.textContent='✓ correct — only throughput improves'; fb.className='step-feedback ok'; steps[3].done=true; this.beep(1200,0.08); }
          else { fb.textContent='✗ pipelining does NOT cut single-instruction time'; fb.className='step-feedback bad'; }
          renderChecks();
        };
        el.setAttribute('tabindex','0'); el.setAttribute('role','button');
        el.addEventListener('click',onClick);
        el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onClick(); } });
      });
    };
    const renderChecks=()=>{
      const all=steps.every(s=>s.done);
      const fb=document.getElementById('rootFb'); if(!fb) return;
      if(all){ fb.innerHTML='ALL STEPS CLEAR — <button class="btn" id="claimRoot">claim ROOT flag</button>'; fb.className='feedback ok'; const b=document.getElementById('claimRoot'); if(b) b.addEventListener('click',()=>this.#checkFlag(c,"pipeline_root_structural_data_control_bubble_forwarding_target_precompute_throughput", fb)); }
      else fb.textContent='';
    };
    render();
  }
}

/* =====================================================================
   Supporting classes (ported from the original single-file build)
   ===================================================================== */

/* --- ChallengeManager --- */
class ChallengeManager {
  constructor(app){ this.app=app; }
  challenge(id){ return this.app.challenges.find(c=>c.id===id); }
  isUnlocked(c){
    if(this.app.studyMode) return true;
    // Study-lock: until the player commits to solving (via "I'm ready") and
    // has not already solved anything, every challenge stays gated so they
    // must go through the lessons first. Committing (or any prior solve)
    // opens the normal progression.
    const st=this.app.store;
    if(!st.state.studyCommitted && !this.app.challenges.some(x=>st.isSolved(x.id))) return false;
    const sameCat=this.app.challenges.filter(x=>x.cat===c.cat);
    const idx=sameCat.findIndex(x=>x.id===c.id);
    if(idx===0){
      if(c.cat===1) return true;
      const prevCatChallenges=this.app.challenges.filter(x=>x.cat===c.cat-1);
      const solved=prevCatChallenges.filter(x=>this.app.store.isSolved(x.id)).length;
      return solved>=Math.ceil(prevCatChallenges.length*0.7);
    }
    return this.app.store.isSolved(sameCat[idx-1].id);
  }
  nextUnlocked(){
    for(const c of this.app.challenges){ if(!this.app.store.isSolved(c.id) && this.isUnlocked(c)) return c; }
    return null;
  }
}

/* --- Scoreboard --- */
class Scoreboard {
  constructor(app){ this.app=app; }
  points(){
    let p=0;
    for(const id in this.app.store.state.solved){
      if(id==='egg'){ if(this.app.store.state.solved[id]) p+=25; continue; }
      const c=this.app.challenges.find(x=>x.id==id);
      if(c) p+=c.points;
    }
    return p;
  }
  solvedCount(){ return Object.keys(this.app.store.state.solved).filter(k=>k!=='egg').length; }
  hintsUsedTotal(){ let h=0; for(const k in this.app.store.state.hints) h+=this.app.store.state.hints[k]; return h; }
  rank(){
    const p=this.points(); let r=RANKS[0];
    for(const rr of RANKS){ if(p>=rr.p) r=rr; }
    return r;
  }
  rankProgress(){
    const p=this.points(); const i=RANKS.findIndex(r=>p<r.p);
    if(i===-1) return {cur:RANKS[RANKS.length-1],next:null,pct:100};
    const cur=RANKS[i-1]||RANKS[0], next=RANKS[i];
    const pct=Math.min(100,Math.round((p-cur.p)/(next.p-cur.p)*100));
    return {cur,next,pct};
  }
}

/* --- HintSystem --- */
class HintSystem {
  constructor(app){ this.app=app; }
  remaining(c){ return Math.max(0,3-this.app.store.hintsUsed(c.id)); }
  cost(c){ return Math.max(1,Math.round(c.points*0.10)); }
  use(c){
    const used=this.app.store.hintsUsed(c.id);
    if(used>=3) return {ok:false,msg:"No more hints."};
    if(this.app.store.isSolved(c.id)) return {ok:false,msg:"Already solved."};
    this.app.store.useHint(c.id);
    if(this.app.cloud) DB.saveCloudState(this.app.store);
    return {ok:true,hint:c.hints[used],cost:this.cost(c)};
  }
}

/* --- Terminal --- */
class Terminal {
  constructor(app){ this.app=app; }
  lines=[];
  printLine(text,cls){ this.lines.push({text,cls}); this.render(); }
  render(){
    const el=document.getElementById('term');
    el.innerHTML=this.lines.map(l=>`<div class="t-${l.cls||'out'}">${esc(l.text)}</div>`).join('');
    el.scrollTop=el.scrollHeight;
  }
  async handle(cmd){
    cmd=cmd.trim();
    if(!cmd) return;
    this.printLine('player@pipeline:~$ '+cmd,'in');
    const parts=cmd.split(/\s+/); const c=parts[0].toLowerCase();
    const app=this.app;
    switch(c){
      case 'help': this.printLine('commands: help | flags | challenges | open <id> | hint | score | whoami | clear | reset | sudo …','sys'); break;
      case 'flags': this.printLine('A FLAG is the answer to a challenge, wrapped as IT51{your_answer}.','sys');
        this.printLine('• the IT51{…} wrapper is OPTIONAL — type just the inner answer', 'out');
        this.printLine('• capitals and spaces are normalized automatically', 'out');
        this.printLine('• many challenges accept several spellings (3.5, 3.5_hours, 210_minutes)', 'out');
        this.printLine('• a live preview under the input shows exactly what will be verified', 'out'); break;
      case 'whoami': this.printLine(app.username?('player@pipeline @'+app.username):'player@pipeline (local)','ok'); break;
      case 'clear': this.lines=[]; this.render(); break;
      case 'challenges': {
        for(const ch of app.challenges){
          const st=app.store.isSolved(ch.id)?'[SOLVED]':(app.cm.isUnlocked(ch)?'[open]':'[locked]');
          this.printLine(`${st} #${ch.id} ${ch.title} (${ch.points}pts)`,'out');
        } break;
      }
      case 'open': {
        const id=parseInt(parts[1],10);
        const ch=app.challenges.find(x=>x.id===id);
        if(!ch) this.printLine('ERROR: no such challenge. try <open 1>','err');
        else if(!app.cm.isUnlocked(ch)) this.printLine('That challenge is locked — solve earlier ones first.','err');
        else { app.openChallenge(id); this.printLine(`opened #${id} ${ch.title}`,'ok'); }
        break;
      }
      case 'hint': {
        const ch=app.currentChallenge;
        if(!ch) this.printLine('open a challenge first.','err');
        else if(app.studyMode) this.printLine('Study Mode is read-only — turn it off to use hints.','err');
        else {
          const r=app.hints.use(ch);
          if(r.ok){ this.printLine(`hint (${r.cost}pts): ${r.hint}`,'sys'); app.forceRefresh(); }
          else this.printLine(r.msg,'err');
        } break;
      }
      case 'score': this.printLine(`points ${app.scoreboard.points()} · rank ${app.scoreboard.rank().name} · solved ${app.scoreboard.solvedCount()}/${app.challenges.length}`,'ok'); break;
      case 'reset': {
        const arg=(parts[1]||'').toLowerCase();
        if(arg!=='confirm'){
          this.printLine('This wipes progress for incomplete tabs (solves, points, hints, unlocks) and re-opens Study Mode — completed tabs are kept.','err');
          this.printLine('Type "reset confirm" to proceed.','sys');
          break;
        }
        app.store.reset();
        if(app.cloud) DB.saveCloudState(app.store);
        const sb=document.getElementById('tbStudy');
        if(sb){ sb.classList.remove('locked'); sb.textContent='Study Mode'; }
        app.studyMode=false; app.currentChallenge=null;
        this.printLine('Progress reset — Study Mode is available again.','ok');
        app.forceRefresh();
        app.showData('info');
        break;
      }
      case 'sudo': {
        const rest=parts.slice(1).join(' ');
        if(/make me a sandwich/.test(rest)){
          if(!app.store.isSolved('egg')){
            app.store.markSolved('egg',25);
            this.printLine('Okay! A delicious sandwich materializes. You earned a flag.','flag');
            this.printLine('IT51{sudo_sandwich} (+25pts)','flag');
            app.celebrate(25);
            if(app.cloud) DB.saveCloudState(app.store);
            app.forceRefresh();
          } else this.printLine('you already broke the kitchen.','sys');
        } else if(/chillinmalware/.test(rest)){
          if(app.store.state.cheatUnlocked) this.printLine('Cheat Sheet already unlocked — no change.','sys');
          else {
            app.store.unlockCheat();
            this.printLine('Access granted — full Cheat Sheet unlocked! Open the Cheat Sheet tab to see it.','ok');
            app.celebrate(0);
            if(app.cloud) DB.saveCloudState(app.store);
          }
        } else this.printLine('sandwich privileges denied — but you can try again any time!','err');
        break;
      }
      default: this.printLine(`command not found: ${c}. try help`,'err');
    }
  }
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* =====================================================================
   BOOTSTRAP
   ===================================================================== */
const app=new App();
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>app.init());
else app.init();
window.__app=app;
