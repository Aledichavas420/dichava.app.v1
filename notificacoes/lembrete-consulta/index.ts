// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "lembrete-consulta"
// Envia push de lembrete ao paciente ~1 dia antes da consulta confirmada.
// Ideal: agendar por pg_cron de hora em hora (ver consulta-lembrete-presenca-setup.sql).
// Deploy:  supabase functions deploy lembrete-consulta --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUB, VAPID_PRIVATE
// ════════════════════════════════════════════════════════════
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const urlsafe = (k: string) => (k || "").trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
webpush.setVapidDetails("mailto:contato@dichava.app", urlsafe(Deno.env.get("VAPID_PUB")!), urlsafe(Deno.env.get("VAPID_PRIVATE")!));

// data (YYYY-MM-DD) de amanhã no fuso de São Paulo
function amanhaISO(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  sp.setDate(sp.getDate() + 1);
  return sp.toISOString().slice(0, 10);
}

Deno.serve(async () => {
  try {
    const alvo = amanhaISO();
    // consultas confirmadas, para amanhã, com paciente logado e ainda sem lembrete
    const { data: rows } = await sb.from("solicitacoes")
      .select("id, user_id, nome, data_pref, hora_pref, clinica_id")
      .eq("status", "confirmada").eq("data_pref", alvo)
      .is("lembrete_em", null).not("user_id", "is", null);
    if (!rows || !rows.length) return new Response(JSON.stringify({ enviados: 0, data: alvo }), { headers: { "Content-Type": "application/json" } });

    let enviados = 0;
    for (const r of rows) {
      const { data: subs } = await sb.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", r.user_id);
      const hora = r.hora_pref ? " às " + r.hora_pref : "";
      const notif = JSON.stringify({
        title: "📅 Lembrete de consulta",
        body: `Você tem uma consulta amanhã${hora}. Confirme sua presença no app.`,
        url: "/",
        tag: "lembrete-" + r.id,
      });
      if (subs && subs.length) {
        await Promise.all(subs.map((s: any) =>
          webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, notif)
            .then(() => { enviados++; })
            .catch(async (err: any) => {
              if (err?.statusCode === 404 || err?.statusCode === 410) {
                try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {}
              }
            })
        ));
      }
      // marca como lembrado (mesmo sem assinatura, pra não repetir)
      await sb.from("solicitacoes").update({ lembrete_em: new Date().toISOString() }).eq("id", r.id);
    }
    return new Response(JSON.stringify({ enviados, consultas: rows.length, data: alvo }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("lembrete-consulta erro:", e);
    return new Response(JSON.stringify({ erro: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
