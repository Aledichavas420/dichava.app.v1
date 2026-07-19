// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "push-msg"
// Envia notificação push para o destinatário quando chega mensagem no chat.
// Disparada por um Database Webhook (INSERT em mensagens).
// Deploy:  supabase functions deploy push-msg --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUB, VAPID_PRIVATE
// ════════════════════════════════════════════════════════════
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// normaliza para base64 URL-safe SEM padding (o que a lib de push exige)
const urlsafe = (k: string) => (k || "").trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
const VAPID_PUB  = urlsafe(Deno.env.get("VAPID_PUB")!);
const VAPID_PRIV = urlsafe(Deno.env.get("VAPID_PRIVATE")!);
webpush.setVapidDetails("mailto:contato@dichava.app", VAPID_PUB, VAPID_PRIV);

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({} as any));
    const rec = payload?.record || payload || {};
    const conversa_id = rec.conversa_id, de_id = rec.de_id, texto = rec.texto || "";
    if (!conversa_id || !de_id) return new Response("ok");

    // quem recebe = o OUTRO participante da conversa
    const { data: conv } = await sb.from("conversas")
      .select("user_id, prof_id, user_nome, prof_nome").eq("id", conversa_id).maybeSingle();
    if (!conv) return new Response("ok");
    const dest = de_id === conv.user_id ? conv.prof_id : conv.user_id;
    const remetente = de_id === conv.user_id ? (conv.user_nome || "Paciente") : (conv.prof_nome || "Profissional");
    if (!dest) return new Response("ok");

    // assinaturas push do destinatário
    const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", dest);
    if (!subs || !subs.length) return new Response("ok");

    const notif = JSON.stringify({
      title: `💬 ${remetente}`,
      body: String(texto).slice(0, 140),
      url: "/",
      tag: "chat-" + conversa_id,
    });

    await Promise.all(subs.map((s: any) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notif,
      ).catch(async (err: any) => {
        // assinatura expirada/inválida → remove
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {}
        }
      })
    ));
    return new Response("ok");
  } catch (e) {
    console.error("push-msg erro:", e);
    return new Response("ok");
  }
});
