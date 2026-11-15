/* ════════════════════════════════════════════════════════════════
   FLAGS — canonical flag set, SHA-256 hashes, and input normalization
   ════════════════════════════════════════════════════════════════
   Flag format  : IT51{lowercase_words_with_underscores}
   Comparison    : case-insensitive, trims whitespace, strips the
                   IT51{} wrapper before hashing.
   Security note : flags are normalized in-code and validated against
                   SHA-256 hashes. Because this is a static site, the
                   normalization rules below unavoidably encode the
                   expected answers, and the canonical strings leak from
                   source — a determined player can bypass the check. If
                   you need real anti-cheat, move validation server-side
                   (see supabase/schema.sql). Never deploy ANSWER_KEY.md.
   ════════════════════════════════════════════════════════════════ */

/* -------- SHA-256 (native crypto when available, pure-JS fallback) -------- */

/* Convert a binary string to a plain array of byte values.
   (We use a plain Array, not a Uint8Array, because the SHA-256
   padding code below relies on `.push()`, which typed arrays lack.) */
function bstr2u8(s){
  const out=[];
  for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i)&0xff;
  return out;
}
/* Convert a Uint8Array to a binary string. */
function u82bstr(u){
  let s='';
  for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
  return s;
}

/* Pure-JS SHA-256 (FIPS 180-4). Slow (~1.5ms for short flags) but
   reliable. Used only when crypto.subtle is unavailable (e.g. some
   non-secure contexts). Verified against node crypto. */
function SHA256(bytes){
  if(typeof bytes==='string') bytes=bstr2u8(bytes);
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
           0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
           0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
           0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
           0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
           0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
           0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
           0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H0=0x6a09e667,H1=0xbb67ae85,H2=0x3c6ef372,H3=0xa54ff53a,
      H4=0x510e527f,H5=0x9b05688c,H6=0x1f83d9ab,H7=0x5be0cd19;
  const bitLen=bytes.length*8;
  // append 0x80 then pad with zeros until length ≡ 56 (mod 64)
  bytes.push(0x80);
  while(bytes.length%64!==56) bytes.push(0);
  // append the 64-bit big-endian bit length (8 bytes: hi32 then lo32)
  const hi=Math.floor(bitLen/0x100000000), lo=bitLen>>>0;
  bytes.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255,
            (lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255);
  let h0=H0,h1=H1,h2=H2,h3=H3,h4=H4,h5=H5,h6=H6,h7=H7;
  const w=new Array(64);
  function rotr(x,n){ return (x>>>n)|(x<<(32-n)); }
  for(let i=0;i<bytes.length;i+=64){
    for(let j=0;j<16;j++){
      let x=0;
      for(let k=0;k<4;k++) x=(x<<8)|bytes[i+j*4+k];
      w[j]=x>>>0;
    }
    for(let j=16;j<64;j++){
      const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3);
      const s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);
      w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let j=0;j<64;j++){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch=(e&f)^(~e&g);
      const t1=(h+S1+ch+K[j]+w[j])>>>0;
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj=(a&b)^(a&c)^(b&c);
      const t2=(S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(x=>x.toString(16).padStart(8,'0')).join('');
}

/* Async SHA-256 hex digest of a string. Prefers the WebCrypto API. */
async function sha256hex(str){
  try{
    if(typeof crypto!=='undefined' && crypto.subtle && crypto.subtle.digest){
      const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){ /* fall through to pure JS */ }
  return SHA256(str);
}

/* -------- Normalization helpers -------- */
function trimC(s){
  return String(s||"").trim().toLowerCase()
    .replace(/[{}]/g,'').replace(/^it51/,'')
    .replace(/^_+/,'').replace(/_+$/,'');
}
function fixStr(s){
  return trimC(s).replace(/[^a-z0-9._]/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}

/* Per-challenge canonicalizer: maps any accepted input to the single
   canonical inner string (the text between IT51{...}). */
const CANON={
  1:s=>trimC(s),
  2:s=>trimC(s),
  3:s=>{
    const t=fixStr(s);
    // Accept the acronym in any case/spacing (fdoes / F D O E S)
    if(/^f_?d_?o_?e_?s$/.test(t)) return "fdoes";
    // Accept the full stage names, with or without separators
    if(/fetch.*decode.*operand.*execute.*store/.test(t)) return "fdoes";
    return trimC(s);
  },
  4:s=>(/8/.test(fixStr(s))? "8_hours":trimC(s)),
  5:s=>{const t=fixStr(s); if(/^3_5|^3\.5/.test(t))return "3.5_hours"; if(/^210/.test(t))return "3.5_hours"; return t;},
  6:s=>{const t=fixStr(s); if(/9/.test(t)&&/25/.test(t))return "9_25"; return trimC(s);},
  7:s=>{const t=fixStr(s); if(/2\.78|278|2_78/.test(t))return "2.78"; return trimC(s);},
  8:s=>{const t=fixStr(s); if(/4\.81.*5|4_81_5|481/.test(t))return "4.81_5"; return trimC(s);},
  9:s=>{const t=fixStr(s); if(/330|5\.5|5_5/.test(t))return "5.5_hours"; return trimC(s);},
  10:s=>{const t=fixStr(s); if(/300|5_hours|5hours|^5$/.test(t))return "5_hours"; return trimC(s);},
  11:s=>{const t=fixStr(s); if(/7/.test(t))return "cycle_7"; return trimC(s);},
  12:s=>{const t=fixStr(s); if(/5/.test(t))return "cycle_5"; return trimC(s);},
  13:s=>{const t=fixStr(s); if(/9.*4|9_4/.test(t))return "9_4"; return trimC(s);},
  14:s=>{const t=fixStr(s); if(/8/.test(t))return "8_stages"; return trimC(s);},
  15:s=>{const t=fixStr(s); if(/store/.test(t))return "two_stores"; return trimC(s);},
  16:s=>trimC(s),
  17:s=>{const t=fixStr(s); if(/9/.test(t))return "bubble_cycles_9"; return trimC(s);},
  18:s=>{const t=fixStr(s); if(/3/.test(t))return "nop_at_stage_3"; return trimC(s);},
  19:s=>{const t=fixStr(s); if(/\bpc_incrementer\b.*\bmdr\b.*\bbandwidth\b|mdr.*pc_incrementer/.test(t))return "pc_incrementer_mdr_bandwidth"; if(/incrementer/.test(t)&&/mdr/.test(t)&&/bandwidth/.test(t))return "pc_incrementer_mdr_bandwidth"; return trimC(s);},
  20:s=>{const t=fixStr(s); if(/r2/.test(t)&&/operand/.test(t))return "r2_operand_fetch"; if(/r2/.test(t)&&/fetch/.test(t))return "r2_operand_fetch"; return trimC(s);},
  21:s=>{const t=fixStr(s); if(/1/.test(t))return "1_stall"; return trimC(s);},
  22:s=>{const t=fixStr(s); if(/execute/.test(t)&&/operand/.test(t))return "execute_to_operand_fetch"; return trimC(s);},
  23:s=>{const t=fixStr(s); if(/add.*mul.*sub.*add/.test(t))return "add_mul_sub_add"; return trimC(s);},
  24:s=>{const t=fixStr(s); if(/last/.test(t)||/resort/.test(t))return "last_resort"; return trimC(s);},
  25:s=>{const t=fixStr(s); if(/wrong/.test(t)&&/path/.test(t))return "wrong_path_instructions"; return trimC(s);},
  26:s=>{const t=fixStr(s); if(/14/.test(t))return "14_cycles"; return trimC(s);},
  27:s=>{const t=fixStr(s); if(/4/.test(t)&&/7/.test(t))return "4_to_7"; return trimC(s);},
  28:s=>{const t=fixStr(s); if(/compute/.test(t))return "compute_target_early"; return trimC(s);},
  29:s=>trimC(s),
  30:s=>trimC(s)
};

/* -------- The canonical SHA-256 hashes (owner-only answer key at bottom) -------- */
const ANSWERS_HASH={
  overlap:"34e0c151f6b87c725b0ed2805761cc8da00388e8cdee49c2b6b2747c85ec4a60",
  throughput:"b703f85a550108afc21d42e92fbb5fa2b4bbf478b27f695b4dd9c9c944ebbaf4",
  fdoes:"eb6439e48a84114fb1c302f73974180b5564a34aac6e5ce908731e7bbb200a6e",
  "8_hours":"24c787aaaea749eebf05a785de2e76ae63a1a6ac24cd53e23d464bfa42ed5898",
  "3.5_hours":"3cdb2896cba21cc9bf33a39d57782c91135b97fe5f2fd4447c309623367d69cd",
  "9_25":"c6e3a2cac3c5458a3c8ae4a727a098acb4f0696fd77de16732b711353f44f4ac",
  "2.78":"f754d7ac6a8a84709dbaaa165edc93d3405253a86fbb80c23fc920f991b42c6b",
  "4.81_5":"6837b1034aa9fded8a3b1fc6fe0e7bb0ef61c1f5ca1ff2db8449ea253521d2ff",
  "5.5_hours":"cbf839dac53e1c51362aa9d6021da0fbd61da4b771be60d61cfa1388b80163fc",
  "5_hours":"35019626d2a5bc6f7188fc9a7d187cf409dcf50fc4180faed4a91a0bf0822715",
  cycle_7:"005179a4d2ac88e77a851bfe42e8f672620db7b4690c43adba8f98aecef166cf",
  cycle_5:"6e8cf45469a1c4f3729284065a77e982329d21e0ac343f6afc1528ef3d253936",
  "9_4":"05effcb8b8f44f06dc2c8444bfa5dc6290a983ba5ce5113ddfa807c4949ba247",
  "8_stages":"93ec9ea527456ba05531950cad60f4d01767a8ec4dc4e7c65cae730271f69807",
  two_stores:"a74159b9871edd0293667ba30fd57deb02d24e13e655be151c1c89c24a3079f4",
  one_access_per_cycle:"95d12e1de64ea2c5036b645d18cdd313c24ae92a1d0cb45b08638060a83d6f2e",
  bubble_cycles_9:"53be10b7033975ef56bf4d0422d5c8cf4e76ebf3705ded8d9880a5d5a56db102",
  nop_at_stage_3:"26cc28b7686e0de23ffd2d2a05387ab74b484dad9db81abf7519bb20fa794b07",
  pc_incrementer_mdr_bandwidth:"342a0cd1ddafa8ae4b07bceef3744eedf8977a309f02f083a80ad0f8a3fd3623",
  r2_operand_fetch:"4fbe95f47494490889bcf60f1127fd799b0ea0b6741d16d53e766241be0b3530",
  "1_stall":"2623c8d8597aac671164a32937cc8c208c9cdd8b3c15afb6348d6f76f0512fbd",
  execute_to_operand_fetch:"2e3e2cf5ac0b92021a9ebfd583b142b6d4ebc4b7b59c3ee58d907bf818c839c1",
  add_mul_sub_add:"2aa6d81af11c2ad3d3f9ad212d686734378659da05647d3649be997530f6ba77",
  last_resort:"87a9a10be9e00e4f9b469049045a37df391db7e913472d5e07574aca9f533d66",
  wrong_path_instructions:"49f44706a88c8a5c37f06bebe407aa9aad93f748976933d33943620481395ca1",
  "14_cycles":"6e8f719ace1d3248ab502ae31222206a057c957d6316fdd2b412a1071a2c67d4",
  "4_to_7":"64a17014931d5379d5e74dda54e9462d51dbd7f1f943d19c66cd4a73a8c9cd50",
  compute_target_early:"fdcb9c8e1a2331403080848d5e1f6f889cac8b0d85cbf7e40c3e9356ed4a2ecf",
  pipeline_novice_cleared:"377ecdada222e9fac8ad3988f23102448dd22b94052c63203a36b56f6331acf4",
  pipeline_root_structural_data_control_bubble_forwarding_target_precompute_throughput:"d34c4aa1cd663dfafa1922f32cbf998af63b7a511b5981bdfbe4b67d81edb3e5",
  sudo_sandwich:"a930ff0a024ca7e404fa689891fe1f8f3bde7b57e7787044b21dc7bb622e8022"
};

/* =====================================================================
   The plaintext answer key is intentionally NOT in this file. It ships
   with the client bundle, so any player could read every flag from
   view-source and bypass the hash check. The owner-only copy lives in
   ANSWER_KEY.md — never include it in a deployed copy of the site.
   ===================================================================== */
