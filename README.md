# PIPELINE//BREAKER — full-stack CTF website

A terminal-styled learning site for the IT51 Computer Architecture course. You
work your way through 7 categories / 30 challenges about CPU pipelining
(FDOES, hazards, forwarding, bubbles, branch penalties…). Each challenge has a
briefing, an interactive puzzle, and a flag — `IT51{lowercase_words}` — that
you submit to score points, climb ranks, and unlock the next challenge.

Unlike the original single-file version, this build is a **real web app**:

- **Accounts** — sign up / log in (Supabase Auth).
- **Cloud progress** — your solved challenges and hints live in Postgres and
  follow you across devices.
- **Public leaderboard** — see how your classmates rank.

**An account is now required to play.** There is no guest mode and no local
shortcut: the game is gated behind a real login, so Supabase must be
configured (below). If you want a quick offline preview without accounts, set
`REQUIRE_ACCOUNT = false` in `js/config.js` — the site then runs in local mode
(progress in your browser, no login, no shared board). Don't ship with that
flag false if you want the login-before-playing behavior.

---

## Project layout

The site is split across **multiple pages** (not one monolith) sharing `css/style.css` and the `js/` modules:

```
pipeline-breaker/
├── index.html            # landing / welcome page (animated hero + login/signup)
├── learn.html            # the game page (challenges, study, terminal, all tabs)
├── leaderboard.html      # standalone class leaderboard page
├── css/style.css         # dark terminal theme, responsive, reduced-motion
├── js/
│   ├── config.js         # ★ your Supabase URL + anon key go here
│   ├── flags.js          # SHA-256 hashes + input normalization (hashes only)
│   ├── challenges.js     # the 30-challenge curriculum + quiz pool
│   ├── simulator.js      # FDOES pipeline grid simulator
│   ├── db.js             # data layer (localStorage fallback + Supabase)
│   ├── auth.js           # session helpers (loadSession / auth screen)
│   ├── welcome.js        # landing-page controller (index.html)
│   ├── leaderboard.js    # leaderboard-page controller (leaderboard.html)
│   └── app.js            # game controller (learn.html) — logic, terminal, views
├── supabase/schema.sql   # tables + row-level-security policies
├── ANSWER_KEY.md         # ⚠️ owner-only plaintext flags — do NOT deploy
└── README.md             # this file
```

**Page flow:** `index.html` (welcome/auth) → `learn.html` (play). In local mode
(no Supabase keys) the landing shows an "Enter the game" card and goes straight
in. If Supabase is configured, you log in on the landing page; the game page
redirects there if there's no session (unless you chose "Continue as guest").
`leaderboard.html` is a shareable standalone board.

---

## 1. Run it locally (accounts required)

Open `index.html` by double-clicking, or serve the folder:

```bash
cd pipeline-breaker
python3 -m http.server 8000
# then open http://localhost:8000
```

Because accounts are required, you'll need to complete §2 before anyone can
play. For a no-account local preview, set `REQUIRE_ACCOUNT = false` in
`js/config.js` — then everything works except accounts and the shared
leaderboard.

---

## 2. Add accounts + leaderboard (Supabase, free)

1. **Create a Supabase project** — https://supabase.com → "New project".
   Pick a region and set a database password. (The free tier is plenty.)

2. **Grab your keys** — in the project dashboard go to
   **Project Settings → API**. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`

3. **Paste them into `js/config.js`:**

   ```js
   const SUPABASE_URL = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

4. **Run the schema** — in the dashboard open **SQL Editor → New query**,
   paste the entire contents of `supabase/schema.sql`, and press Run.
   (Creates `profiles`, `progress`, `scores` + RLS policies.)

---

## 3. Deploy to GitHub Pages

1. Create a GitHub repo (e.g. `pipeline-breaker`), push this folder.
2. In the repo: **Settings → Pages → Build and deployment → Source**:
   - Select **Deploy from a branch**, branch `main`, folder `/ (root)`.
   - Save. GitHub gives you a URL like:
     `https://<user>.github.io/pipeline-breaker/`
3. **Important — allow the live URL in Supabase:**
   Project Settings → **Authentication → URL Configuration** → add your
   GitHub Pages URL under **Site URL** and **Redirect URLs**. This lets the
   browser connect to Supabase from the deployed site.

For a nicer domain you can set a custom domain in the same Pages settings.

---

## Features

- 7 categories, 30 challenges, ~3,270 points; progressive unlock (70% of a
  category unlocks the next).
- Interactive simulator for the lab / hazard / root-boss challenges.
- Terminal (`help`, `open`, `hint`, `score`, `sudo make me a sandwich`…).
- Study Mode (read-only lessons with no answer boxes; press "I'm ready —
  start solving" to begin, which locks Study Mode until a full reset),
  a first-run animated welcome tour that drops you straight into Study Mode
  so you start with lessons, a persistent "How to play" instructions view,
  cheat sheet (the whole Cheat Sheet is locked until you run the secret
  terminal command `sudo chillinmalware`, or beat the final boss), flashcards,
  progress dashboard.
- Flag helpers for new players: a one-time onboarding explainer, a live
  "will be checked as: IT51{…}" preview under every flag box, a `flags`
  terminal command, and a gentle tip on wrong answers. Flags are
  case-insensitive, the `IT51{…}` wrapper is optional, and many challenges
  accept several spellings.
- Ranks: Script Kiddie → Packet Sniffer → Bit Flipper → Pipeline Engineer →
  Silicon Wizard.
- Export/import progress (JSON) — handy for moving between browsers.
- Daily streak, time played, optional sound, responsive (380px phones),
  keyboard accessible, `prefers-reduced-motion` respected.
- **Admin console** — a dedicated **`admin.html`** page, reachable from the
  Admin button in the game's top bar. It is **only visible to the admin
  account** (profile username `chillinmalware`, from `js/config.js`); other
  players never see the button or the page's contents. The console has two
  tabs:
  - **Overview** — public scores roster (players, points, aggregates).
  - **Players** — full account roster (username, email, created, points,
    solved, banned status) with actions: **set new password**, **reset
    progress & score**, **ban/unban**, and **delete user**, plus a filter box.
  Players/actions are served by a server-side Edge Function
  (`supabase/functions/admin`, runs with the service-role key). It
  authorizes by verifying the caller's Supabase session token and requiring
  a **profile username of `chillinmalware`** — so you must be signed in as
  that account to manage players (no static secret ships in the repo).
  ⚠️ The panel's local password gate is client-side/bypassable (acceptable
  for a teaching tool); the Edge Function itself enforces the real check.
  Deploy:
  1. `supabase functions deploy admin --project-ref <PROJECT_REF>`
     (or Dashboard → Edge Functions → New Function → paste → Deploy).
  No secrets required. Supabase Auth requires passwords of at least 6
  characters, so `0824` can't be a real account password.
- Flags are normalized and verified client-side against SHA-256 hashes.
  ⚠️ **Security reality:** because this is a fully static site, everything
  needed to check answers ships to the browser — the normalization rules
  encode the expected answers, so a determined player can read them from
  source and bypass the check. That is acceptable for a teaching exercise
  but is **not** anti-cheat. If you need real cheating resistance, move
  flag validation server-side (e.g. a Supabase RPC that checks submissions
  and awards points); `supabase/schema.sql` is where that would live. Keep
  `ANSWER_KEY.md` out of any deployed copy — it is not referenced by the
  pages, so omitting it is safe.

---

## Quiz: topics covered

Fetch–Decode–Operand Fetch–Execute–Store (FDOES) · pipeline fill/drain ·
speedup & the asymptote · slowest-stage bottleneck · structural hazards
(shared resource, one memory, store-store clash) · bubble vs NOP/Delay-Store-Cycle
· data hazards (WAR/RAW) · forwarding (Z-register) · pipeline scheduling ·
interlock · control hazards · branch penalty · target precompute.

---

## Extension ideas

- **Timed races / exams** — add a "speedrun" mode; rank players by time.
- **More boss variants** — randomly generate a root-boss program each run.
- **Course analytics** — a teacher page showing class-wide per-challenge
  miss rates (Supabase + a small SQL view).
