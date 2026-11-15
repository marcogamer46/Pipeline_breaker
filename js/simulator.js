/* ════════════════════════════════════════════════════════════════
   PIPELINE SIMULATOR
   A tiny FDOES pipeline grid: rows are instructions, columns are
   clock cycles, each cell shows which stage that instruction is in.
   It can model an ideal one-issue-per-cycle pipeline, detect
   store-store structural collisions, and insert pipeline bubbles.
   ════════════════════════════════════════════════════════════════ */

class PipelineSimulator {
  constructor(container){
    this.container=container;
    this.program=[];      // [{label, stages:[...]}]
    this.states=[];       // per-instruction current stage index (-1 = done, null = waiting)
    this.cycle=0;
    this.history=[];
    this.autoplayTimer=null;
    this.speed=500;
    this.clashes=[];
    this.bubbleAt=null;
    this.grid=[];
  }

  /* Stage shapes per instruction kind. */
  static STAGES={ L:['F','D','O','E','S'], R:['F','D','E','S'], R2:['F','D','NOP','E','S'], BD:['F','D','O','E','S'] };

  /* Load a program given as an array of stage-kind labels
     (e.g. ['L','R','R','R','R']) and reset. */
  setProgram(prog){
    this.program=prog.map(label=>({label, stages:(PipelineSimulator.STAGES[label]||['F','D','E','S']).slice()}));
    this.reset();
  }

  setStages(raw){
    this.program=raw.map((def,i)=>({label:def.label||`I${i+1}`, stages:def.stages.slice()}));
    this.reset();
  }

  reset(){
    this.cycle=0; this.states=this.program.map(()=>null); this.history=[]; this.clashes=[]; this.bubbleAt=null;
    this.rebuildGrid();
    this.render();
  }

  /* Ideal static "one issue per cycle" grid (for teaching view). */
  staticStaticGrid(){
    return this.program.map((p,i)=>p.stages.map((s,j)=>({s,cycle:i+j+1})));
  }

  /* Full collision-aware schedule. `bubbleBefore` is an array of
     booleans, one per instruction: true inserts an idle bubble just
     before that instruction, shifting it and everything after it by
     one cycle. Returns {placed, total}. */
  schedule({forwarding=false, bubbleBefore=[]}={}){
    let shift=0; const placed=[];
    this.program.forEach((p,i)=>{
      if(bubbleBefore[i]) shift++;
      placed.push({width:p.stages.length, start:i+1+shift});
    });
    let total=0;
    for(const p of placed) total=Math.max(total,p.start+p.width-1);
    return {placed,total};
  }

  /* Detect store-store collisions (structural hazard: two S in the same cycle). */
  collisions(bubbleBefore=[]){
    const {placed}=this.schedule({bubbleBefore});
    const storeAt={};
    this.program.forEach((p,i)=>{
      const sIdx=p.stages.length-1;
      const cyc=placed[i].start+sIdx;
      (storeAt[cyc]=storeAt[cyc]||[]).push(i);
    });
    const clash=[];
    for(const c in storeAt){ if(storeAt[c].length>1) clash.push({cycle:+c, insts:storeAt[c]}); }
    return clash;
  }

  rebuildGrid(){
    this.grid=this.program.map(p=>p.stages.map(s=>({s,cls:s==='NOP'?'s-N':'s-'+s})));
  }

  render(opts={}){
    if(!this.container) return;
    const bubbleBefore=opts.bubbleBefore||[];
    const starts=[]; let shift=0;
    this.program.forEach((_,i)=>{ if(bubbleBefore[i]) shift++; starts.push(i+1+shift); });
    const maxCycle=Math.max(1,...this.program.map((p,i)=>starts[i]+p.stages.length-1));
    let html=`<div class="sim-grid">
      <div class="sim-controls">
        <button type="button" class="btn" data-sa="step">step ▸</button>
        <button type="button" class="btn" data-sa="play">▶ play</button>
        <button type="button" class="btn" data-sa="reset">reset</button>
        <label>speed <input type="range" min="200" max="1200" step="50" value="${this.speed}" data-sa="speed"></label>
      </div>
      <div class="ghead"><div class="lbl">instruction</div>`;
    for(let c=1;c<=maxCycle;c++) html+=`<div class="cell">${c}</div>`;
    html+=`</div>`;
    this.program.forEach((p,ri)=>{
      html+=`<div class="grow"><div class="lbl">${p.label}</div>`;
      const s=starts[ri];
      for(let c=1;c<=maxCycle;c++){
        const j=c-s;
        let cls='cell', val='';
        if(bubbleBefore[ri] && c===s-1){ val='B'; cls+=' s-B'; }
        else if(j>=0 && j<p.stages.length){ val=p.stages[j]; cls+=' s-'+val.replace('NOP','N'); }
        html+=`<div class="${cls}">${val}</div>`;
      }
      html+=`</div>`;
    });
    html+=`</div>
      <div class="sim-legend">
        <span><i style="background:rgba(47,214,232,.2)"></i> F fetch</span>
        <span><i style="background:rgba(120,120,240,.2)"></i> D decode</span>
        <span><i style="background:rgba(245,185,66,.2)"></i> O operand</span>
        <span><i style="background:rgba(240,74,94,.2)"></i> E execute</span>
        <span><i style="background:rgba(53,240,160,.2)"></i> S store</span>
        <span><i style="background:rgba(255,255,255,.1)"></i> NOP/bubble</span>
      </div>`;
    this.container.innerHTML=html;
  }
}

/* Helper: build a uniform k-stage shape (for the depth challenge). */
function divStages(n){ const base=['F','D','O','E','S']; return base.slice(0,Math.min(n,5)); }

/* ---------------------------------------------------------------------
   A tiny cycle-accurate animator used by the simulator's step/play
   buttons. It advances one cycle at a time and paints the active cell.
   (This is a lightweight teaching aid, not a full hazard model.)
   --------------------------------------------------------------------- */
class PipeAnimator {
  constructor(sim){
    this.sim=sim;
    this.cycle=0;
    this.timer=null;
    this.max=1;
    this.recomputeMax();
  }
  /* The last clock cycle any instruction occupies (includes bubble shifts).
     This is the schedule length, not the longest single-instruction stage
     count — so a 5-instruction FDOES pipeline animates all the way to
     cycle 9 instead of stopping at cycle 5. */
  recomputeMax(){
    let m=0;
    const bb=this.bubbleBefore||[]; let shift=0;
    const prog=this.sim.program||[];
    for(let i=0;i<prog.length;i++){
      if(bb[i]) shift++;
      const p=prog[i]; m=Math.max(m,i+1+shift+p.stages.length-1);
    }
    this.max=Math.max(1,m);
  }
  start(){
    this.stop();
    this.cycle=0;
    this.recomputeMax();
    this.timer=setInterval(()=>{
      this.cycle++;
      if(this.cycle>this.max){ this.stop(); this.paint(); return; }
      this.paint();
    }, this.sim.speed||500);
  }
  stop(){ if(this.timer){ clearInterval(this.timer); this.timer=null; } }
  paint(){
    const sim=this.sim;
    if(!sim.container) return;
    const starts=[];
    let shift=0;
    const bb=this.bubbleBefore||[];
    sim.program.forEach((_,i)=>{ if(bb[i]) shift++; starts.push(i+1+shift); });
    const cells=sim.container.querySelectorAll('.grow .cell');
    let idx=0;
    sim.program.forEach((p,ri)=>{
      const s=starts[ri];
      for(let c=1;c<=this.max;c++,idx++){
        const cell=cells[idx]; if(!cell) continue;
        cell.classList.remove('lit');
        if(c===this.cycle && c>=s && c<s+p.stages.length) cell.classList.add('lit');
      }
    });
  }
}
