// Admin Edge Function — runs with the service-role key, so it can manage
// users and data that the public anon client cannot.
//
// Auth: the caller must send `Authorization: Bearer <supabase jwt>` for an
// account whose profile username is ADMIN_USER (default chillinmalware).
// The token is verified server-side, so no static secret ships in the repo.
//
// Deploy:
//   supabase functions deploy admin --project-ref <PROJECT_REF>
// (or Dashboard → Edge Functions → New Function → paste → Deploy.)

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_USER = Deno.env.get("ADMIN_USER") || "chillinmalware";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ---- authorize: Bearer JWT + admin username ----
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);
  const { data: { user }, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);
  const { data: prof } = await sb.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if ((prof?.username) !== ADMIN_USER) return json({ error: "Unauthorized" }, 401);

  let action: string;
  let payload: Record<string, unknown>;
  try {
    const b = await req.json();
    action = b.action;
    payload = b.payload || {};
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  if (!action) return json({ error: "Missing action" }, 400);

  try {
    if (action === "list") {
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const users = data.users;
      const ids = users.map((u) => u.id);
      const { data: profs } = await sb.from("profiles").select("id,username").in("id", ids);
      const { data: scores } = await sb.from("scores").select("user_id,points,solved_count,rank_name,updated_at").in("user_id", ids);
      const pm = new Map<string, { username: string }>((profs || []).map((p) => [p.id, p]));
      const sm = new Map<string, { points: number; solved_count: number; rank_name: string }>(
        (scores || []).map((s) => [s.user_id, s])
      );
      return json({
        users: users.map((u) => ({
          id: u.id,
          email: u.email || "",
          username: pm.get(u.id)?.username || null,
          createdAt: u.created_at || null,
          lastSignInAt: u.last_sign_in_at || null,
          banned: !!u.banned_until,
          points: sm.get(u.id)?.points ?? 0,
          solvedCount: sm.get(u.id)?.solved_count ?? 0,
          rankName: sm.get(u.id)?.rank_name || null,
        })),
      });
    }

    if (action === "delete") {
      if (!payload.id) return json({ error: "Missing id" }, 400);
      await sb.auth.admin.deleteUser(String(payload.id)); // FK cascade removes profile/progress/scores
      return json({ ok: true });
    }

    if (action === "toggleBan") {
      if (!payload.id) return json({ error: "Missing id" }, 400);
      const ban = !!payload.ban;
      await sb.auth.admin.updateUserById(String(payload.id), { ban_duration: ban ? "876000h" : "none" });
      return json({ ok: true });
    }

    if (action === "setPassword") {
      if (!payload.id) return json({ error: "Missing id" }, 400);
      const pw = String(payload.password || "");
      if (pw.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
      await sb.auth.admin.updateUserById(String(payload.id), { password: pw });
      return json({ ok: true });
    }

    if (action === "resetProgress") {
      if (!payload.user_id) return json({ error: "Missing user_id" }, 400);
      await sb.from("progress").delete().eq("user_id", String(payload.user_id));
      await sb.from("scores").delete().eq("user_id", String(payload.user_id));
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: unknown) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
