/* ════════════════════════════════════════════════════════════════
   CONFIG — Supabase project settings
   ════════════════════════════════════════════════════════════════
   Replace these two placeholders with your own Supabase project URLs.

   How to get them (free tier, ~5 min):
   1. Go to https://supabase.com → "New project" → pick a region &
      password (this is your DB password; keep it safe).
   2. After create, open your project.
   3. Left sidebar → "Project Settings" → "API".
   4. Copy:
        - Project URL  → SUPABASE_URL
        - anon public key → SUPABASE_ANON_KEY
   5. Paste them below. Then run supabase/schema.sql against your
      database (left sidebar → SQL Editor → New query → paste → Run).

   NOTE: If you leave these as empty strings, accounts can't work. The
   app now REQUIRES an account to play (REQUIRE_ACCOUNT below defaults to
   true), so without keys the landing page shows a setup notice instead
   of letting people in. Fill these in to enable sign-up/login.

   Toggle REQUIRE_ACCOUNT to false ONLY for a quick offline preview: the
   site then falls back to local mode (progress in localStorage, no
   accounts, no leaderboard). Don't ship with it false if you want the
   "login before playing" behavior.
   ════════════════════════════════════════════════════════════════ */
const SUPABASE_URL = "https://vecggijycrkcenwwfbqk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__II1ax_2cYqU9MpumqsLbA_XQD1nz_2";

/* True once the two keys above are actually set. */
const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/* Enforce accounts: when true, the game is gated behind a real login —
   no guest mode, no local shortcut. Set to false only for an offline
   preview (see README). */
const REQUIRE_ACCOUNT = true;

/* Admin panel credentials (seen in the top bar + the hidden "Admin"
   button). NOTE — this is a lightweight, CLIENT-SIDE gate: the password
   ships in this file, so it is trivially bypassable by reading source. It
   is fine for a teaching tool whose panel only reads public scores. For
   real admin authorization use a Supabase `is_admin` flag + a server-side
   RPC (and a password of at least 6 characters — Supabase Auth won't
   accept a 4-char password like the one below). */
const ADMIN_USER  = 'chillinmalware';
const ADMIN_PASS  = '0824';
