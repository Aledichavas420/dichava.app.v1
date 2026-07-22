// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "push-codigo"
// Avisa o profissional quando um paciente RESGATA um código premium dele.
// Disparada por trigger: UPDATE em public.codigos_premium (usado_por preenchido).
// Deploy:  supabase functions deploy push-codigo --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUB, VAPID_PRIVATE
// ════════════════════════════════════════════════════════════
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const urlsafe = (k: string) => (k || "").trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
webpush.setVapidDetails("mailto:contato@dichava.app", urlsafe(Deno.env.get("VAPID_PUB")!), urlsafe(Deno.env.get("VAPID_PRIVATE")!));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const raw = await req.text().catch(() => "");
    let payload: any = {}; try { payload = JSON.parse(raw || "{}"); } catch (_) {}
    const rec = payload?.record || payload || {};
    const old = payload?.old_record || {};
    const prof_id = rec.prof_id;
    // só notifica quando ACABOU de ser usado (evita disparo em outros updates)
    if (!prof_id || !rec.usado_por || old.usado_por) { return new Response("ok", { headers: cors }); }

    const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", prof_id);
    if (!subs || !subs.length) return new Response("ok", { headers: cors });

    const notif = JSON.stringify({
      title: "🎁 Presente ativado!",
      body: "Um paciente ativou o premium que você presenteou. Que gesto lindo 💚",
      url: "/clinica/",
      tag: "codigo-" + (rec.codigo || prof_id),
    });
    await Promise.all(subs.map((s: any) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, notif)
        .then(() => "ok")
        .catch(async (err: any) => {
          if (err?.statusCode === 404 || err?.statusCode === 410) { try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {} }
          return "erro:" + (err?.statusCode || "?");
        })
    ));
    return new Response("ok", { headers: cors });
  } catch (e) {
    console.error("push-codigo erro:", e);
    return new Response("ok", { headers: cors });
  }
});
