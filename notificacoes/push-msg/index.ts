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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // responde o preflight CORS do navegador (senão o POST real é bloqueado)
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const raw = await req.text().catch(() => "");
    console.log("push-msg: RAW body =", raw.slice(0, 500));
    let payload: any = {}; try { payload = JSON.parse(raw || "{}"); } catch (_) { payload = {}; }
    const rec = payload?.record || payload || {};
    const conversa_id = rec.conversa_id, de_id = rec.de_id, texto = rec.texto || "";
    console.log("push-msg: recebido", JSON.stringify({ conversa_id, de_id, temTexto: !!texto }));
    if (!conversa_id || !de_id) { console.log("push-msg: FALTA conversa_id ou de_id"); return new Response("ok", { headers: cors }); }

    // quem recebe = o OUTRO participante da conversa
    const { data: conv, error: convErr } = await sb.from("conversas")
      .select("user_id, prof_id, user_nome, prof_nome").eq("id", conversa_id).maybeSingle();
    if (convErr) console.log("push-msg: erro ao buscar conversa ·", convErr.message);
    if (!conv) { console.log("push-msg: conversa NÃO encontrada para id", conversa_id); return new Response("ok", { headers: cors }); }
    const dest = de_id === conv.user_id ? conv.prof_id : conv.user_id;
    const remetente = de_id === conv.user_id ? (conv.user_nome || "Paciente") : (conv.prof_nome || "Profissional");
    console.log("push-msg: conversa OK · user_id", conv.user_id, "prof_id", conv.prof_id, "→ destino", dest);
    if (!dest) { console.log("push-msg: destino nulo (conversa sem o outro participante)"); return new Response("ok", { headers: cors }); }

    // assinaturas push do destinatário
    const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", dest);
    console.log("push-msg: destinatário", dest, "· assinaturas encontradas:", subs?.length || 0);
    if (!subs || !subs.length) return new Response("ok", { headers: cors });

    const notif = JSON.stringify({
      title: `💬 ${remetente}`,
      body: String(texto).slice(0, 140),
      url: "/",
      tag: "chat-" + conversa_id,
    });

    const res = await Promise.all(subs.map((s: any) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notif,
      ).then(() => "ok").catch(async (err: any) => {
        console.log("push-msg: falha no envio ·", err?.statusCode, "·", (err?.body || err?.message || "").toString().slice(0, 120));
        // assinatura expirada/inválida → remove
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {}
        }
        return "erro:" + (err?.statusCode || "?");
      })
    ));
    console.log("push-msg: resultado", JSON.stringify(res));
    return new Response("ok", { headers: cors });
  } catch (e) {
    console.error("push-msg erro:", e);
    return new Response("ok", { headers: cors });
  }
});
