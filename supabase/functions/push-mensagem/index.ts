// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "push-mensagem"
// Envia uma notificação push quando chega uma mensagem nova no chat
// paciente ↔ profissional. Chamada pelo gatilho on_mensagem_push
// (ver push-mensagem-setup.sql), que roda a cada INSERT em public.mensagens.
//
// Descobre quem é o destinatário (o participante que NÃO enviou), busca as
// inscrições de push dele em public.push_subs e dispara o aviso. Notifica
// tanto o profissional (abre /clinica/) quanto o paciente (abre /).
//
// Deploy:  supabase functions deploy push-mensagem --no-verify-jwt
//          (--no-verify-jwt porque quem chama é o banco via pg_net, sem JWT)
// Secrets: VAPID_PRIVATE_KEY  (a MESMA chave privada já usada no push-agenda;
//                              se lá o secret se chama VAPID_PRIVATE, funciona
//                              também, tem fallback abaixo)
//          SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem por padrão
// ════════════════════════════════════════════════════════════
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// A chave PÚBLICA é fixa (fica no navegador de qualquer forma); a PRIVADA é secret.
const VAPID_PUBLIC =
  Deno.env.get("VAPID_PUBLIC_KEY") ||
  Deno.env.get("VAPID_PUBLIC") ||
  "BN_L3cK5MByNbFTBYghnja6ryWbnN99_J2JfMiQDu-hKVkPqNJBAKLnnyBDHHSxvGNfaoIBCG1fQemYrExmUDzE";
const VAPID_PRIVATE =
  Deno.env.get("VAPID_PRIVATE_KEY") || Deno.env.get("VAPID_PRIVATE") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@dichava.app";

if (VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); } catch (_) {}
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método inválido" }, 405);
  if (!VAPID_PRIVATE) return json({ error: "VAPID_PRIVATE_KEY ausente" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const rec = (body && body.record) || body || {};
    const conversaId = rec.conversa_id;
    const deId = rec.de_id;
    const texto = (rec.texto || "").toString();
    if (!conversaId || !deId) return json({ skip: "sem dados da mensagem" });

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

    const { data: conv } = await sb
      .from("conversas")
      .select("id,user_id,prof_id,user_nome,prof_nome")
      .eq("id", conversaId)
      .maybeSingle();
    if (!conv) return json({ skip: "conversa não encontrada" });

    // quem enviou? o destinatário é o outro participante
    const isProfSender = deId === conv.prof_id;
    const recipientId = isProfSender ? conv.user_id : conv.prof_id;
    const isProfRecipient = !isProfSender;
    const senderName = isProfSender
      ? (conv.prof_nome || "Seu profissional")
      : (conv.user_nome || "Paciente");

    if (!recipientId) return json({ skip: "sem destinatário" });

    const { data: subs } = await sb
      .from("push_subs")
      .select("endpoint,p256dh,auth")
      .eq("user_id", recipientId);
    if (!subs || !subs.length) return json({ sent: 0, reason: "destinatário sem inscrições de push" });

    const payload = JSON.stringify({
      title: isProfRecipient ? `${senderName} te enviou uma mensagem` : `Nova mensagem de ${senderName}`,
      body: texto.slice(0, 140),
      url: isProfRecipient ? "/clinica/" : "/",
      tag: "msg-" + conversaId,
    });

    let sent = 0;
    await Promise.all(
      subs.map(async (s: any) => {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try {
          await webpush.sendNotification(sub as any, payload);
          sent++;
        } catch (err: any) {
          const code = err && (err.statusCode || err.status);
          // inscrição expirada/removida: limpa pra não tentar de novo
          if (code === 404 || code === 410) {
            await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
          }
        }
      })
    );

    return json({ sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
