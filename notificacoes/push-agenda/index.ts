// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "push-agenda"
// Avisa o(s) profissional(is) da clínica quando um paciente SOLICITA um horário.
// Disparada por um Database Webhook: INSERT em public.solicitacoes.
// Deploy:  supabase functions deploy push-agenda --no-verify-jwt
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

async function pushTo(userIds: string[], notif: string) {
  if (!userIds.length) return;
  const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").in("user_id", userIds);
  if (!subs || !subs.length) { console.log("push-agenda: sem assinaturas para", userIds); return; }
  await Promise.all(subs.map((s: any) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, notif)
      .then(() => "ok")
      .catch(async (err: any) => {
        if (err?.statusCode === 404 || err?.statusCode === 410) { try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {} }
        return "erro:" + (err?.statusCode || "?");
      })
  ));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const raw = await req.text().catch(() => "");
    let payload: any = {}; try { payload = JSON.parse(raw || "{}"); } catch (_) {}
    const rec = payload?.record || payload || {};
    const clinica_id = rec.clinica_id, nome = rec.nome || "Um paciente";
    if (!clinica_id) { console.log("push-agenda: sem clinica_id"); return new Response("ok", { headers: cors }); }

    // profissionais da clínica
    const { data: membros } = await sb.from("clinica_membros").select("user_id").eq("clinica_id", clinica_id);
    const ids = (membros || []).map((m: any) => m.user_id).filter(Boolean);
    if (!ids.length) { console.log("push-agenda: clínica sem membros"); return new Response("ok", { headers: cors }); }

    const quando = rec.data_pref ? ` para ${rec.data_pref}${rec.hora_pref ? " às " + rec.hora_pref : ""}` : "";
    const notif = JSON.stringify({
      title: "📅 Novo pedido de horário",
      body: `${nome} solicitou um atendimento${quando}. Toque para confirmar.`,
      url: "/clinica/",
      tag: "agenda-" + (rec.id || clinica_id),
    });
    await pushTo(ids, notif);
    return new Response("ok", { headers: cors });
  } catch (e) {
    console.error("push-agenda erro:", e);
    return new Response("ok", { headers: cors });
  }
});
