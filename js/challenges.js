/* ════════════════════════════════════════════════════════════════
   CHALLENGES — categories, ranks, the 30-challenge curriculum, and
   the quiz question pool (for the Final Boss).
   Follows the IT51 Computer Architecture course exactly (FDOES,
   structural/data/control hazards, forwarding, scheduling, interlock,
   bubble, NOP, branch penalty, target precompute).
   ════════════════════════════════════════════════════════════════ */

/* -------- Categories -------- */
const CATEGORIES=[
  {id:1,name:"Boot Sequence",short:"BOOT"},
  {id:2,name:"Throughput Math",short:"MATH"},
  {id:3,name:"Simulator Lab",short:"SIM"},
  {id:4,name:"Structural Hazard Hunt",short:"STRUCT"},
  {id:5,name:"Data Hazard Defense",short:"DATA"},
  {id:6,name:"Control Hazard Arena",short:"CTRL"},
  {id:7,name:"Final Boss",short:"BOSS"}
];

/* -------- Ranks (by points) -------- */
const RANKS=[
  {p:0, name:"Script Kiddie"},
  {p:400,name:"Packet Sniffer"},
  {p:900,name:"Bit Flipper"},
  {p:1600,name:"Pipeline Engineer"},
  {p:2400,name:"Silicon Wizard"}
];

/* -------- The 30 challenges -------- */
const CHALLENGES = [
/* ───────────── CATEGORY 1: BOOT SEQUENCE ───────────── */
{ id:1, cat:1, title:"Hello, Pipeline", points:35, diff:"Easy", type:"mcq",
  brief:[
    "Pipelining is an <hl>implementation technique</hl> where <hl>multiple instructions are overlapped in execution</hl>.",
    "As one instruction moves through a phase of the <hl>instruction cycle</hl>, the previous instruction moves through a later phase.",
    "Whenever a resource is free, the CPU uses it immediately — nothing sits idle.",
    "This is the trick that makes modern CPUs fast. It is NOT about speeding up any single instruction.",
    "Never waste a single free machine: that is the whole philosophy."
  ],
  prompt:"Which word best describes what pipelining does to instructions?",
  choices:["overlap","serialize","duplicate","freeze"],
  hints:[
    "One instruction starts its Fetch while the previous one is still being Executed.",
    "The instructions do not wait for each other — they ride the pipeline together.",
    "Think of the laundry line: four friends each with a load, all moving through washer, dryer, folder, stasher at once."
  ],
  debrief:"Pipelining <b>overlaps</b> the execution of multiple instructions. A new instruction can begin its Fetch before the previous instruction has finished its Store. The key metric that improves is throughput, not single-instruction latency.",
  hash:ANSWERS_HASH.overlap },

{ id:2, cat:1, title:"Latency vs Throughput", points:40, diff:"Easy", type:"mcq",
  brief:[
    "A single laundry load still takes <hl>2 hours</hl> whether you pipeline or not — washer, dryer, folder, stasher, each 30 minutes.",
    "Pipelining does <hl>NOT reduce the latency of a single task</hl>.",
    "What it does is increase the <hl>throughput</hl> of the whole workload.",
    "Four sequential loads finish at 2AM (8 hours); four pipelined loads finish at 9:30PM (3.5 hours).",
    "Same one-load time. Much more work done per hour."
  ],
  prompt:"A single laundry load takes 2 hours before AND after pipelining. Which metric changes?",
  choices:["latency","throughput","both","neither"],
  hints:[
    "Re-read the briefing: one load still takes 2 hours.",
    "The 2-hour number describes a single task (latency).",
    "The workload finishing faster describes how much work the system completes per unit time."
  ],
  debrief:"Pipelining trades <b>latency</b> (time for one instruction) for <b>throughput</b> (instructions finished per unit time). The pipeline does not make the first instruction finish sooner; it makes many instructions finish sooner.",
  hash:ANSWERS_HASH.throughput },

{ id:3, cat:1, title:"Decode the Cycle", points:45, diff:"Easy", type:"text",
  brief:[
    "The <hl>instruction cycle</hl> breaks instruction processing into stages, each taking one clock cycle.",
    "This course uses the <hl>FDOES</hl> five-stage model.",
    "F = <hl>Fetch</hl>: get the instruction from memory.",
    "D = <hl>Decode</hl>: figure out what the instruction does.",
    "O = <hl>Operand Fetch</hl>: get the necessary operands.",
    "E = <hl>Execute</hl>: perform the operation. S = <hl>Store</hl>: write the result where it belongs."
  ],
  prompt:"Name the 5 pipeline stages in the order they execute. Enter them as either the 5-letter acronym (lowercase, no spaces) or the full stage names separated by commas or spaces.",
  placeholder:"fdoes",
  hints:[
    "It is five letters, one per stage, in the order the stages execute.",
    "F D O E S — the four letters after F are Decode, Operand Fetch, Execute, Store.",
    "O is the Operand Fetch stage — this is where the CPU gathers the values it needs to compute with."
  ],
  debrief:"The five stages run in order: <b>Fetch → Decode → Operand Fetch → Execute → Store</b> (FDOES). In a pipelined CPU, five instructions can each be in a different one of these stages at once.",
  hash:ANSWERS_HASH.fdoes },

{ id:4, cat:1, title:"Sequential Sunset", points:50, diff:"Easy", type:"text",
  brief:[
    "Laundry analogy: four friends A, B, C, D each have one load to wash, dry, fold, stash.",
    "Each stage takes 30 minutes: Washer, Dryer, Folder, Stasher.",
    "One load takes 2 hours (4 stages × 30 min).",
    "Running the four loads <hl>sequentially</hl> (the Waterfall model) means each load waits for the previous one to fully finish.",
    "Sequential time = number of loads × time per load."
  ],
  prompt:"Compute the SEQUENTIAL time for 4 loads (4 stages × 30 min each). Answer in hours (e.g. 8_hours).",
  placeholder:"8_hours",
  hints:[
    "One load = 4 stages × 30 minutes = 2 hours.",
    "Four loads, one after the other: 4 × 2 hours.",
    "4 × 2 = 8 hours."
  ],
  debrief:"Sequential processing is the <b>Waterfall model</b>: each load (instruction) runs fully before the next starts. 4 loads × 2 hours = <b>8 hours</b>. This is the non-pipelined baseline.",
  hash:ANSWERS_HASH["8_hours"] },

{ id:5, cat:1, title:"Pipelined Sunrise", points:55, diff:"Easy", type:"text",
  brief:[
    "Now run the same 4 loads through the pipeline.",
    "The washer and dryer are separate machines, so while load A is drying, load B can be washing.",
    "Once the pipeline is full, one load finishes every 30 minutes.",
    "Formula: (number of stages + number of loads − 1) × stage time for a balanced pipeline.",
    "Pipelined time = (4 + 4 − 1) × 30 min = 210 minutes = 3.5 hours."
  ],
  prompt:"Compute the PIPELINED time for the same 4 loads. Acceptable answers: 3.5, 3.5_hours, or 210_minutes.",
  placeholder:"3.5_hours",
  hints:[
    "Use the formula: (stages + loads − 1) × stage time.",
    "4 stages, 4 loads, 30 min each → (4 + 4 − 1) × 30.",
    "(7) × 30 = 210 minutes = 3.5 hours."
  ],
  debrief:"Pipelining is the 4 loads from 8 hours down to <b>3.5 hours</b>. The first load still takes 2 hours, but the remaining loads follow quickly because stages overlap. Formula: (stages + loads − 1) × stage time.",
  hash:ANSWERS_HASH["3.5_hours"] },

/* ───────────── CATEGORY 2: THROUGHPUT MATH ───────────── */
{ id:6, cat:2, title:"Fill the Pipe", points:65, diff:"Medium", type:"text",
  brief:[
    "A 5-stage pipeline (FDOES) can overlap 5 instructions at once.",
    "A new instruction can start every clock cycle after the pipeline fills.",
    "Pipelined cycles for n instructions on a k-stage pipeline: <hl>k + n − 1</hl>.",
    "Non-pipelined cycles: <hl>n × k</hl>.",
    "For 5 instructions on 5 stages: pipelined = 5 + 5 − 1 = 9, non-pipelined = 5 × 5 = 25."
  ],
  prompt:"5-stage pipeline, 5 instructions. How many cycles pipelined? Then how many non-pipelined? Answer as 9_25.",
  placeholder:"9_25",
  hints:[
    "Pipelined: k + n − 1 where k = stages = 5, n = instructions = 5.",
    "5 + 5 − 1 = 9 cycles pipelined.",
    "Non-pipelined: 5 × 5 = 25 cycles."
  ],
  debrief:"Pipelined, 5 instructions finish in <b>9 cycles</b> (5 + 5 − 1). Non-pipelined they need <b>25 cycles</b>. The 9 cycles represent fill-time + overlap efficiency.",
  hash:ANSWERS_HASH["9_25"] },

{ id:7, cat:2, title:"Speedup Hunter", points:70, diff:"Medium", type:"text",
  brief:[
    "Speedup = non-pipelined cycles ÷ pipelined cycles.",
    "For 5 instructions on a 5-stage pipeline: non = 25, pipelined = 9.",
    "Speedup = 25 / 9 = 2.777…",
    "Give your answer to 2 decimal places."
  ],
  prompt:"Compute the speedup for 5 instructions on a 5-stage pipeline. Answer to 2 decimals.",
  placeholder:"2.78",
  hints:[
    "Read the previous challenge: 25 cycles vs 9 cycles.",
    "Speedup = 25 ÷ 9.",
    "25 / 9 = 2.777… → rounds to 2.78."
  ],
  debrief:"Speedup = non-pipelined ÷ pipelined cycles = 25 ÷ 9 = <b>2.78</b>. Because the workload is small, the pipeline does not reach its theoretical maximum (5×) — fill and drain overhead are still in the mix.",
  hash:ANSWERS_HASH["2.78"] },

{ id:8, cat:2, title:"Asymptote", points:75, diff:"Medium", type:"text",
  brief:[
    "For 100 instructions on a 5-stage pipeline: pipelined = 100 + 5 − 1 = 104 cycles.",
    "Non-pipelined = 100 × 5 = 500 cycles.",
    "Speedup = 500 / 104 = 4.807… ≈ 4.81.",
    "As the instruction count n grows huge, the speedup approaches the number of stages (5).",
    "This limit is the <hl>asymptote</hl> of pipelining."
  ],
  prompt:"Compute speedup for 100 instructions (2 decimals), then state the value it approaches as n grows. Answer as 4.81_5.",
  placeholder:"4.81_5",
  hints:[
    "Pipelined cycles = 100 + 5 − 1 = 104. Non = 500.",
    "500 / 104 = 4.807… → 4.81.",
    "As n → ∞, the fill/drain overhead becomes negligible and speedup → number of stages = 5."
  ],
  debrief:"For 100 instructions speedup is <b>4.81</b>. As the stream grows forever, speedup approaches the <b>number of pipeline stages (5)</b>. This is why deeper pipelines promise more speed — but also cost more hardware and create more hazards.",
  hash:ANSWERS_HASH["4.81_5"] },

{ id:9, cat:2, title:"Weakest Link", points:80, diff:"Medium", type:"text",
  brief:[
    "Pipeline rate is limited by the <hl>slowest stage</hl>.",
    "The dryer is lengthened to 60 minutes: stages are 30, 60, 30, 30.",
    "First load still takes 30 + 60 + 30 + 30 = 150 minutes.",
    "After fill, each additional load is gated by the slowest stage: 60 minutes.",
    "Total = 150 + 3 × 60 = 330 minutes = 5.5 hours."
  ],
  prompt:"Dryer becomes 60 minutes. 4 loads, separate machines. Total time in hours (5.5_hours).",
  placeholder:"5.5_hours",
  hints:[
    "The first load costs the sum of ALL stage times: 150 minutes.",
    "Every extra load after that is limited by the slowest stage, 60 minutes.",
    "150 + 3 × 60 = 330 minutes = 5.5 hours."
  ],
  debrief:"Unbalanced stages throttle the pipeline. The dryer (60 min) becomes the bottleneck, so each subsequent load costs 60 minutes instead of 30. Total <b>5.5 hours</b>. Slowest stage sets the pace.",
  hash:ANSWERS_HASH["5.5_hours"] },

{ id:10, cat:2, title:"The Combo Machine", points:85, diff:"Medium", type:"text",
  brief:[
    "Now the washer and dryer are merged into ONE combined machine — the Wash-Dry Combo.",
    "Stages become: 60 (combo), 30 (fold), 30 (stash).",
    "Fewer stages, fewer parallel resources.",
    "First load: 60 + 30 + 30 = 120 minutes.",
    "Total = 120 + 3 × 60 = 300 minutes = 5 hours."
  ],
  prompt:"Washer and dryer merged into one machine (stages 60, 30, 30). 4 loads. Total hours?",
  placeholder:"5_hours",
  hints:[
    "First load = sum of all stages = 120 minutes.",
    "Slowest stage is now 60 minutes — each extra load costs that.",
    "120 + 3 × 60 = 300 minutes = 5 hours."
  ],
  debrief:"Merging washer and dryer reduces the number of stages and resources. The pipeline performs <b>worse</b> (5 hours vs 3.5) because the combo machine is a shared resource — a <b>structural hazard</b>. Shared resources throttle overlap.",
  hash:ANSWERS_HASH["5_hours"] },

/* ───────────── CATEGORY 3: SIMULATOR LAB ───────────── */
{ id:11, cat:3, title:"Grid Reader", points:95, diff:"Medium", type:"sim-text",
  brief:[
    "Below is a PIPELINED 5-instruction FDOES grid.",
    "Rows are instructions; columns are clock cycles; each cell shows which stage that instruction is in.",
    "Instruction 1 (LOAD) occupies F at cycle 1, D at cycle 2, O at 3, E at 4, S at 5.",
    "Instruction 2 starts its F at cycle 2, and so on — one new instruction per cycle.",
    "Read the grid: which cycle does instruction 3 complete its Store?"
  ],
  prompt:"Instruction 3 is the third row. Find the cell containing 'S' in that row. What cycle (column number) is it in?",
  placeholder:"cycle_7",
  hints:[
    "Instruction 1 stores at cycle 5, instruction 2 at cycle 6.",
    "Each new instruction's Store is one cycle later than the one before it.",
    "So instruction 3 stores at cycle 5 + 2 = 7."
  ],
  debrief:"Each instruction is staggered one cycle: instruction 1 stores at cycle 5, instruction 2 at cycle 6, instruction 3 at cycle <b>7</b>. Reading the grid means tracing the row to its S cell.",
  hash:ANSWERS_HASH.cycle_7,
  sim:{kind:"fdoes", n:5, preload:"pipelines", question:"cycle_of_store", targetRow:3 } },

{ id:12, cat:3, title:"Full Pipe", points:100, diff:"Medium", type:"sim-text",
  brief:[
    "The pipeline is 'full' when all 5 stages are busy at the same time.",
    "In the FDOES grid, that is the first cycle where rows 1–5 each hold a stage.",
    "This is the moment the pipeline reaches its maximum overlap.",
    "Look for the column where F, D, O, E, and S are all present (one per row)."
  ],
  prompt:"In which cycle does the pipeline first become FULL (all 5 stages busy)?",
  placeholder:"cycle_5",
  hints:[
    "Fill happens one instruction at a time as the first instruction advances.",
    "At cycle 4 the pipeline has only 4 instructions underway.",
    "At the 5th cycle the fifth instruction starts its F while the first four are still in D/O/E/S."
  ],
  debrief:"The pipeline is full at cycle <b>5</b>: instruction 5 fetches while instructions 4, 3, 2, 1 sit in O, E, S. From here on, one instruction finishes per cycle until the drain begins.",
  hash:ANSWERS_HASH.cycle_5,
  sim:{kind:"fdoes", n:5, preload:"pipelines", question:"first_full"} },

{ id:13, cat:3, title:"Drain Trap", points:105, diff:"Medium", type:"sim-text",
  brief:[
    "After the full point, the pipeline must drain.",
    "For 5 instructions the last instruction finishes its Store at cycle 5 + 5 − 1 = 9.",
    "The drain phase is the window from 'last full' until the last instruction completes.",
    "Count how many cycles that window contains."
  ],
  prompt:"For 5 instructions: which cycle does the last instruction finish? How many cycles does the drain phase last after the pipe was last full? Answer as 9_4.",
  placeholder:"9_4",
  hints:[
    "Last instruction's Store = 5 + 5 − 1 = 9.",
    "The pipeline was last full at cycle 5.",
    "Drain = cycles 6, 7, 8, 9 → 4 cycles."
  ],
  debrief:"The last instruction stores at cycle <b>9</b>. The drain phase (cycles 6–9) is <b>4 cycles</b> long. Fill and drain are the overhead that keeps real speedup below the number of stages.",
  hash:ANSWERS_HASH["9_4"],
  sim:{kind:"fdoes", n:5, preload:"pipelines", question:"drain"} },

{ id:14, cat:3, title:"Depth Charge", points:110, diff:"Medium", type:"sim-text",
  brief:[
    "Ideally, speedup approaches the <hl>number of pipeline stages</hl>.",
    "More stages → more potential overlap → larger ideal speedup.",
    "But deeper pipelines cost more hardware and invite more hazards.",
    "Use the simulator: vary the stage count from 3 to 8 and watch ideal speedup for 1000 instructions.",
    "Which stage count gives the LARGEST ideal speedup?"
  ],
  prompt:"Adjust the stage count in the simulator for 1000 instructions. Which number of stages gives the largest ideal speedup?",
  placeholder:"8_stages",
  hints:[
    "Ideal speedup asymptotically equals the number of stages.",
    "More stages always raises the ceiling — 8 is the max available here.",
    "Pick the largest allowed number: 8."
  ],
  debrief:"Ideal speedup equals the number of stages, so <b>8 stages</b> gives the largest ceiling. In practice the added hardware cost and hazard risk are why CPUs don't just keep adding stages forever.",
  hash:ANSWERS_HASH["8_stages"],
  sim:{kind:"depth", maxStages:8, instructions:1000} },

/* ───────────── CATEGORY 4: STRUCTURAL HAZARD HUNT ───────────── */
{ id:15, cat:4, title:"Resource Clash", points:95, diff:"Medium", type:"mcq",
  brief:[
    "A structural hazard is an attempt to use the same hardware resource at the same time.",
    "A <hl>Load</hl> instruction has 5 stages: F D O E S (it must fetch an operand from memory).",
    "An <hl>R-type</hl> instruction has 4 stages: F D E S — its operands are already in registers, so no Operand Fetch.",
    "When a Load and an R-type overlap, the Load's Store and the R-type's Store land in the same cycle.",
    "That's two writes at once — a structural conflict."
  ],
  prompt:"In the Load-then-R-type collision, which two stages collide at the same cycle?",
  choices:["Fetch with Fetch","Store with Store","Decode with Execute","Operand with Execute"],
  hints:[
    "The Load is one stage longer than the R-type.",
    "The missing stage is Operand Fetch, so the R-type catches up.",
    "They end up both trying to write their result in the same cycle."
  ],
  debrief:"Both the Load and the R-type try to <b>Store</b> in the same cycle — two writes at once. This is a structural hazard. The fix is a pipeline bubble or a NOP delay so they no longer collide.",
  hash:ANSWERS_HASH.two_stores },

{ id:16, cat:4, title:"Single Memory", points:100, diff:"Medium", type:"mcq",
  brief:[
    "Main memory is one resource — it can serve only <hl>one access per cycle</hl>.",
    "In a pipelined CPU, different instructions may need memory in the same cycle.",
    "One instruction might be Fetching while another is doing an Operand Fetch or a Store.",
    "A single memory bus can't serve both — that's a structural hazard."
  ],
  prompt:"Why is a single main memory a structural hazard?",
  choices:["It is too slow to keep up","Instruction Fetch and operand/Store access can collide in the same cycle","It uses too much power","It cannot cache data"],
  hints:[
    "Fetch reads from memory; Store writes to memory.",
    "Two instructions at different stages can both want memory right now.",
    "One memory = one access per cycle."
  ],
  debrief:"A single main memory offers <b>one access per cycle</b>. If one instruction is Fetching while another stores or fetches an operand, they collide. High memory bandwidth is an extra hardware requirement for pipelining.",
  hash:ANSWERS_HASH.one_access_per_cycle },

{ id:17, cat:4, title:"Bubble Pop", points:105, diff:"Medium", type:"sim-bubble",
  brief:[
    "Solution 1 for the structural store-store clash: insert a <hl>pipeline bubble</hl>.",
    "A bubble is an idle slot that occupies the pipeline for one cycle.",
    "It lets the conflicting instruction proceed without a write collision.",
    "In the grid below, click a cell to drop a bubble and shift the R-types.",
    "The simulator recomputes total cycles once the collision is gone."
  ],
  prompt:"Insert a bubble to remove the store-store collision. How many total cycles does the 5-instruction sequence now take?",
  placeholder:"bubble_cycles_9",
  hints:[
    "Without the bubble, the Load and the first R-type would both store at cycle 5.",
    "A bubble delays the R-type chain by one cycle.",
    "The last instruction's Store now lands at cycle 9."
  ],
  debrief:"Inserting one bubble shifts the R-type chain so the two Stores no longer collide. The 5-instruction sequence now completes in <b>9 cycles</b>. The bubble costs one cycle but prevents an illegal double-write.",
  hash:ANSWERS_HASH.bubble_cycles_9,
  sim:{kind:"bubble", program:["L","R","R","R","R"]} },

{ id:18, cat:4, title:"NOP Slide", points:110, diff:"Medium", type:"mcq",
  brief:[
    "Solution 2 is <hl>Delay Store Cycle</hl>: pad every instruction to the same 5-stage shape.",
    "An R-type (F D E S) gains a <hl>NOP</hl> (No Operation) stage where its missing Operand Fetch would be.",
    "The NOP sits between Decode and Execute — position 3.",
    "Now every instruction looks like F D NOP E S and flows uniformly."
  ],
  prompt:"In the Delay Store Cycle fix, where does the NOP go in an R-type instruction?",
  choices:["Between Fetch and Decode (position 2)","Between Decode and Execute (position 3)","Between Execute and Store (position 4)","Before Fetch (position 1)"],
  hints:[
    "The R-type is missing its Operand Fetch, which sits at position 3 in the 5-stage shape.",
    "The NOP fills the missing stage.",
    "So the R-type becomes F D NOP E S."
  ],
  debrief:"The NOP is inserted at <b>position 3</b>, between Decode and Execute, turning the R-type into the uniform 5-stage shape F D NOP E S. Every instruction now uses the same stage pattern, so writes don't drift into collision.",
  hash:ANSWERS_HASH.nop_at_stage_3 },

{ id:19, cat:4, title:"Hardware Shopping", points:115, diff:"Hard", type:"select-multi",
  brief:[
    "Pipelining splits the datapath into stages, but the resources must exist.",
    "Extra hardware is needed: (1) an extra <hl>incrementer</hl> to update the PC more often instead of borrowing the ALU, (2) a separate <hl>MDR</hl> for loads and stores so Fetch and Store can overlap, (3) <hl>high memory bandwidth</hl> to carry more data to and from memory.",
    "MAR, MDR and ALU are redundant resources that make the CPU costlier.",
    "Pick the hardware that pipelining demands — and skip the decoys."
  ],
  prompt:"Select the THREE hardware items required for pipelining (tap chips).",
  multi:["PC incrementer","Separate MDR","High memory bandwidth","Bigger hard drive","More RGB lights"],
  hints:[
    "The PC normally updates through the ALU — but Fetch and Execute must overlap now.",
    "Loads and stores share the MDR; separate them so Store and Fetch can happen together.",
    "Data must flow in and out of memory fast enough to feed every stage."
  ],
  debrief:"The three required additions are the <b>PC incrementer</b>, a <b>separate MDR</b>, and <b>high memory bandwidth</b>. 'Bigger hard drive' and 'more RGB' are decoys — they don't help the datapath overlap.",
  hash:ANSWERS_HASH.pc_incrementer_mdr_bandwidth },

/* ───────────── CATEGORY 5: DATA HAZARD DEFENSE ───────────── */
{ id:20, cat:5, title:"Dependency Radar", points:115, diff:"Medium", type:"mcq",
  brief:[
    "A data hazard happens when an instruction tries to use a value before it is ready.",
    "Consider this program (note: course source has a typo — SUB is subtraction):",
    "ADD R2, #5F ; R2 = R2 + 0x5F | SUB R5, R2 ; R5 = R5 − R2 (needs updated R2) | MUL R3, (100) | ADD (400), R4",
    "SUB needs R2, but ADD's updated R2 is only written in its Store stage.",
    "SUB's <hl>Operand Fetch</hl> is the stage that hits the missing value."
  ],
  prompt:"Which register creates the dependency, and which stage of SUB is affected?",
  choices:["R5 — Execute","R2 — Operand Fetch","R3 — Store","R2 — Fetch"],
  hints:[
    "Look at what ADD writes and what SUB reads.",
    "ADD writes R2; SUB reads R2.",
    "SUB reads R2 at its Operand Fetch stage."
  ],
  debrief:"The register is <b>R2</b> — ADD writes it, and SUB needs it. The affected stage is SUB's <b>Operand Fetch</b>, because that's where R2 is read, before ADD's Store has landed. This is the data dependency that stalls the pipeline if unfixed.",
  hash:ANSWERS_HASH.r2_operand_fetch },

{ id:21, cat:5, title:"Stall Counter", points:120, diff:"Medium", type:"sim-text",
  brief:[
    "With no forwarding and no scheduling, SUB's Operand Fetch must wait for ADD's Store.",
    "Course split-cycle rule: in one clock cycle, the first half is a write, the second half is a read.",
    "ADD stores R2 in the first half of cycle 5; SUB can read it in the second half of cycle 5.",
    "That means SUB's Operand Fetch is held back by one cycle — a stall.",
    "Count how many stall cycles are inserted."
  ],
  prompt:"How many stall cycles are inserted before SUB's Operand Fetch?",
  placeholder:"1_stall",
  hints:[
    "ADD's Store is at cycle 5 (first half).",
    "SUB would want its Operand Fetch at cycle 4 — but R2 isn't ready yet.",
    "It waits one cycle, to the second half of cycle 5 → 1 stall."
  ],
  debrief:"Exactly <b>1 stall cycle</b> is inserted. Because writes happen in the first half of a cycle and reads in the second half, SUB's Operand Fetch can proceed in the second half of cycle 5 — one cycle late. This stall is what forwarding eliminates.",
  hash:ANSWERS_HASH["1_stall"],
  sim:{kind:"datastall", program:["ADD R2,#5F","SUB R5,R2","MUL R3,(100)","ADD (400),R4"]} },

{ id:22, cat:5, title:"Forward Pass", points:125, diff:"Medium", type:"mcq",
  brief:[
    "<hl>Forwarding</hl> is a hardware fix: send the result to the next instruction before it is written back.",
    "The <hl>Z register</hl> holds the result at the Execute stage.",
    "That Z output can be routed straight into the next instruction's Operand Fetch.",
    "The result arrives without waiting for the Store/write-back to finish.",
    "One clock cycle is split into two half-cycles (write then read) to make this work."
  ],
  prompt:"Where does the forwarding path send the result?",
  choices:["From Execute stage output (Z register) of ADD to Operand Fetch of SUB","From Fetch of ADD to Store of SUB","From memory to the ALU only","From the decoder to the PC"],
  hints:[
    "The result lives in the Z register at Execute.",
    "The consumer is SUB, which reads at Operand Fetch.",
    "So it travels Execute-stage output → Operand Fetch."
  ],
  debrief:"Forwarding routes the <b>Execute-stage output (Z register)</b> of ADD straight to <b>SUB's Operand Fetch</b>, bypassing the wait for the Store. This removes the stall without reordering any code.",
  hash:ANSWERS_HASH.execute_to_operand_fetch },

{ id:23, cat:5, title:"Compiler Shuffle", points:130, diff:"Hard", type:"order-drag",
  brief:[
    "<hl>Pipeline scheduling</hl> is the software fix: the compiler reorders machine code to avoid the stall.",
    "Original: ADD R2, SUB R5, MUL R3, ADD (400).",
    "SUB depends on ADD's R2. If MUL sits between them, by the time SUB runs, R2 is ready.",
    "Reorder to: ADD, MUL, SUB, ADD.",
    "The simulator should then report 0 stalls."
  ],
  prompt:"Drag the instructions into the order that removes the stall (ADD first).",
  order:["ADD R2, #5F","SUB R5, R2","MUL R3, (100)","ADD (400), R4"],
  hints:[
    "The dependent instruction (SUB) must come after an independent one.",
    "Put MUL between ADD and SUB.",
    "So: ADD, MUL, SUB, ADD."
  ],
  debrief:"The compiler reorders to <b>ADD, MUL, SUB, ADD</b>. MUL (independent) fills the gap, so SUB's Operand Fetch finds R2 already written. Zero stalls — pure software, no extra hardware. This is pipeline scheduling.",
  hash:ANSWERS_HASH.add_mul_sub_add },

{ id:24, cat:5, title:"Interlock Gate", points:135, diff:"Hard", type:"mcq",
  brief:[
    "<hl>Pipeline interlock</hl> is hardware that detects data dependencies and forces a stall.",
    "It is the fallback when forwarding alone cannot resolve the conflict.",
    "Think of the fix ladder: Forwarding (hardware, no stall) → Scheduling (software, reorders) → Interlock (hardware, stalls).",
    "Stalling is the last option — avoid it whenever possible."
  ],
  prompt:"When does the hardware interlock cause a stall?",
  choices:["When forwarding can resolve the dependency","Always, on every dependency","Only for branch instructions","When forwarding cannot resolve the dependency"],
  hints:[
    "Interlock is described as 'the last option'.",
    "It steps in only when forwarding isn't enough.",
    "It stalls the pipeline to keep results correct."
  ],
  debrief:"Interlock stalls <b>when forwarding cannot resolve the dependency</b>. It's the safety net. Compare: Forwarding (hardware, no stall), Scheduling (software, compiler reorders), Interlock (hardware, stalls). Use it only when the first two fail.",
  hash:ANSWERS_HASH.last_resort },

/* ───────────── CATEGORY 6: CONTROL HAZARD ARENA ───────────── */
{ id:25, cat:6, title:"Fork in the Road", points:140, diff:"Medium", type:"text",
  brief:[
    "A control hazard comes from <hl>branching</hl> to a new set of instructions.",
    "By the time the branch decision is known, the pipeline has already fetched and decoded the next instructions.",
    "If the branch is taken, those fetched instructions are on the wrong path.",
    "They must be thrown away (flushed) — that is the branch penalty.",
    "This is the most challenging hazard to resolve."
  ],
  prompt:"Why does a taken branch hurt the pipeline? Give your answer as a flag.",
  placeholder:"wrong_path_instructions",
  hints:[
    "Decisions happen late — at Execute for a branch.",
    "Meanwhile the cue has been busy Fetching and Decoding.",
    "Those next instructions belong to the path we did NOT take."
  ],
  debrief:"A taken branch hurts because the <b>next instructions were already fetched and decoded</b>, and they belong to the path not taken. They must be flushed, wasting the work. This is the branch penalty.",
  hash:ANSWERS_HASH.wrong_path_instructions },

{ id:26, cat:6, title:"Branch Penalty", points:145, diff:"Medium", type:"text",
  brief:[
    "The Stallings diagram uses 6 stages: FI, DI, CO, FO, EI, WO (Fetch Inst, Decode Inst, Compute, Fetch Operand, Execute Inst, Write Operand).",
    "Without branching, 9 instructions on a 6-stage pipeline take 6 + 9 − 1 = 14 cycles.",
    "Same fill formula as always: stages + instructions − 1.",
    "This is the baseline with zero branch penalties."
  ],
  prompt:"9 instructions, 6 stages, no branch. How many cycles total?",
  placeholder:"14_cycles",
  hints:[
    "Use the fill formula: stages + instructions − 1.",
    "6 + 9 − 1.",
    "= 14."
  ],
  debrief:"Without branching, 9 instructions on 6 stages take <b>14 cycles</b> (6 + 9 − 1). This is the clean baseline. Any taken branch adds penalty cycles on top — the deeper the pipeline, the bigger the penalty.",
  hash:ANSWERS_HASH["14_cycles"] },

{ id:27, cat:6, title:"Flush", points:150, diff:"Hard", type:"text",
  brief:[
    "In the branch scenario, instruction 3 is a jump to instruction 15.",
    "At the moment the branch is resolved, instructions 4, 5, 6 and 7 are already in the pipeline.",
    "They were fetched assuming the branch would fall through.",
    "Because the jump is taken, all four must be thrown away — flushed.",
    "Those are the wasted instructions."
  ],
  prompt:"Which instructions already in the pipeline are wasted when instruction 3 jumps to 15? Answer as 4_to_7.",
  placeholder:"4_to_7",
  hints:[
    "The instructions after the branch were loaded speculatively.",
    "They were loaded while instruction 3 was still being resolved.",
    "That range is 4, 5, 6, 7."
  ],
  debrief:"Instructions <b>4 to 7</b> are flushed. They were fetched and decoded before the branch at instruction 3 was resolved. The pipeline then restarts at the target (instruction 15), paying the branch penalty.",
  hash:ANSWERS_HASH["4_to_7"] },

{ id:28, cat:6, title:"Pre-Compute", points:155, diff:"Hard", type:"text",
  brief:[
    "Branch penalties are avoidable if we decide earlier.",
    "The course solution: determine <hl>beforehand whether the instruction is a taken branch</hl> (PC value changes to the target address).",
    "And <hl>compute the target address in advance</hl> so the next fetch can go straight to it.",
    "If we know the branch is taken and where it goes early, no wrong-path instructions get fetched.",
    "This shrinks the penalty window dramatically."
  ],
  prompt:"State the course's solution pair: decide early whether it's a taken branch AND compute the target address in advance.",
  placeholder:"compute_target_early",
  hints:[
    "Two things happen early: the taken/un-taken decision and the numeric target.",
    "The decision changes the PC — that's the signal.",
    "The target address is the number the PC changes to."
  ],
  debrief:"The fix is to <b>compute the target early</b>: detect whether the branch will be taken before the pipeline commits to fetching the fall-through path, and precompute the target address so the next fetch goes straight there. Fewer flushed instructions, smaller penalty.",
  hash:ANSWERS_HASH.compute_target_early },

/* ───────────── CATEGORY 7: FINAL BOSS ───────────── */
{ id:29, cat:7, title:"Mixed Exam Room", points:230, diff:"Boss", type:"quiz",
  brief:[
    "Ten rapid-fire questions drawn from every concept in this course.",
    "The pool is shuffled and randomized each run — you'll never get the same order twice.",
    "Pass mark: <hl>8 of 10</hl> correct. Unlimited retries.",
    "The flag only appears when you pass.",
    "Breathe. You know this. Fetch, decode, execute."
  ],
  prompt:"Answer 8+ of 10 correctly. The flag unlocks on a pass.",
  hints:[],
  debrief:"You cleared the mixed exam. That's a full-curriculum pass: pipelining basics, throughput math, structural hazards, data hazards, control hazards and the fixes.",
  hash:ANSWERS_HASH.pipeline_novice_cleared,
  quiz:{pass:8, total:10} },

{ id:30, cat:7, title:"ROOT THE CPU", points:320, diff:"Boss", type:"root",
  brief:[
    "Final boss. One program, every hazard class, and you must fix it all.",
    "Program: LOAD R2,(100); ADD R3,R2; SUB R4,R3; MUL R5,R4; BEQ .target; ADD R6,#10.",
    "Step (a) identify the hazard TYPES present. Step (b) choose the right fix for each.",
    "Step (c) use the simulator to reach the minimal stall count. Step (d) answer the final conceptual question.",
    "Each step validates immediately. Complete all four to assemble the flag."
  ],
  prompt:"Clear all four steps to unlock the ROOT flag.",
  hints:[
    "A Load next to an R-type → structural (store collision).",
    "R3 depends on R2, R4 on R3, R5 on R4 → data. BEQ at the end → control.",
    "Fixes: bubble (structural), forwarding (data), target precompute (control). The Load-use still costs 1 stall."
  ],
  debrief:"You rooted the CPU. The pipeline runs with one unavoidable load-use stall, all hazards fixed with the right tools. Answer the final question: pipelining does NOT reduce single-instruction time — only throughput improves.",
  hash:ANSWERS_HASH.pipeline_root_structural_data_control_bubble_forwarding_target_precompute_throughput,
  root:{
    program:["LOAD R2,(100)","ADD R3,R2","SUB R4,R3","MUL R5,R4","BEQ .target","ADD R6,#10"],
    hazards:["structural","data","control"],
    fixes:["bubble","forwarding","target_precompute"],
    minStall:1
  } }
];

/* -------- Quiz question pool (challenge 29) -------- */
const QUIZ_POOL=[
  {q:"Pipelining increases which metric?", opts:["Latency","Throughput","Both","Neither"], a:1},
  {q:"A single laundry load takes 2 hours pipelined. What about non-pipelined?", opts:["1 hour","2 hours","4 hours","3.5 hours"], a:1},
  {q:"The 5-stage acronym in order is?", opts:["FDOES","FDOSE","FDOE","FDES"], a:0},
  {q:"4 loads × 4 stages × 30 min, pipelined:", opts:["8 hours","3.5 hours","5 hours","6 hours"], a:1},
  {q:"5-stage pipeline, 5 instructions, pipelined cycles:", opts:["25","10","9","5"], a:2},
  {q:"Speedup is bounded above by:", opts:["number of instructions","number of pipeline stages","memory size","clock speed"], a:1},
  {q:"Pipeline rate is limited by:", opts:["fastest stage","slowest stage","average stage","fetch stage"], a:1},
  {q:"Combining washer & dryer (fewer stages) creates a:", opts:["data hazard","control hazard","structural hazard","pipeline bubble"], a:2},
  {q:"A Load has 5 stages; an R-type has:", opts:["3","4","5","6"], a:1},
  {q:"The store-store collapse is a:", opts:["data hazard","control hazard","structural hazard","none"], a:2},
  {q:"Inserting an idle slot to avoid two writes is a:", opts:["NOP slice","pipeline bubble","forwarding","interlock"], a:1},
  {q:"Delay Store Cycle adds a NOP at which stage of an R-type?", opts:["2nd","3rd","4th","5th"], a:1},
  {q:"Which register is the dependency in ADD R2 / SUB R5,R2?", opts:["R5","R2","R3","R4"], a:1},
  {q:"Forwarding sends the Execute output (Z) to:", opts:["Store","Operand Fetch","Fetch","Decode"], a:1},
  {q:"The software fix that reorders code is:", opts:["forwarding","pipeline scheduling","interlock","bubble"], a:1},
  {q:"Interlock stalls when:", opts:["forwarding resolves it","forwarding cannot resolve it","always","never"], a:1},
  {q:"A taken branch wastes instructions that were already:", opts:["executed","fetched and decoded","stored","written back"], a:1},
  {q:"9 instructions on 6 stages, no branch, take (cycles):", opts:["15","14","9","6"], a:1},
  {q:"Branch penalty instructions flushed for a jump at instruction 3:", opts:["8-15","4-7","1-3","5-9"], a:1},
  {q:"The control-hazard fix is to decide early and:", opts:["stall always","compute the target address","add NOPs","forward the PC"], a:1}
];
