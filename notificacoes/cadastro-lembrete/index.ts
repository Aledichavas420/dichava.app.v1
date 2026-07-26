// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "cadastro-lembrete"
// Acha quem CRIOU conta mas NÃO confirmou o e-mail (cadastro incompleto)
// entre ~24h e ~7 dias atrás, e envia UM lembrete gentil via Resend com
// um novo link de confirmação. Não reenvia (controla pela tabela
// cadastro_lembrete). Ideal rodar por pg_cron 1x/dia.
//
// Deploy:  supabase functions deploy cadastro-lembrete --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//          EMAIL_FROM (ex: "Dichava <nao-responda@dichava.app>"),
//          WEBHOOK_SECRET (opcional — protege o disparo)
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND   = Deno.env.get("RESEND_API_KEY") || "";
const FROM     = Deno.env.get("EMAIL_FROM") || "Dichava <onboarding@resend.dev>";
const SECRET   = Deno.env.get("WEBHOOK_SECRET") || "";
const APP_URL  = "https://dichava.app";

const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// e-mail no tom do app
function html(nome: string, link: string) {
  const ola = nome ? `Oi, ${esc(nome)} 💚` : "Oi 💚";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;background:#F5F5F0;border-radius:16px;padding:26px">
    <div style="font-size:18px;font-weight:800;color:#1B2A1C;margin-bottom:6px">${ola}</div>
    <div style="font-size:14px;color:#3b4b3d;line-height:1.6">
      Vimos que você começou a criar sua conta no <b>Dichava</b> mas ainda não confirmou o e-mail.
      Falta só um toque pra ativar — sem pressa, quando quiser.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0">
      <tr><td style="border-radius:12px;background:#2f7a4d">
        <a href="${link}" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-weight:700;font-size:15px">Confirmar meu e-mail</a>
      </td></tr>
    </table>
    <div style="font-size:12.5px;color:#5D7060;line-height:1.6">
      Se não foi você, pode ignorar esta mensagem — nada acontece.
    </div>
    <div style="font-size:11px;color:#9aa89c;margin-top:18px">dichava.app · cuidado e redução de danos, sem julgamento</div>
  </div>`;
}

Deno.serve(async (req) => {
  if (SECRET && (req.headers.get("x-webhook-secret") || "") !== SECRET)
    return new Response("forbidden", { status: 403 });
  try {
    if (!RESEND) return new Response(JSON.stringify({ erro: "sem RESEND_API_KEY" }), { status: 500 });

    const agora = Date.now();
    const min = agora - 7 * 864e5;  // não incomoda cadastros com mais de 7 dias
    const max = agora - 24 * 36e5;  // espera pelo menos 24h antes de lembrar

    // varre os usuários (paginado) e filtra os não confirmados na janela
    const alvos: { id: string; email: string; nome: string }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        const conf = (u as any).email_confirmed_at || (u as any).confirmed_at;
        if (conf) continue;                    // já confirmou → não é cadastro incompleto
        const t = new Date(u.created_at).getTime();
        if (t < min || t > max) continue;      // fora da janela
        if (!u.email) continue;
        alvos.push({ id: u.id, email: u.email, nome: (u.user_metadata as any)?.nome || "" });
      }
      if (data.users.length < 200) break;
    }

    let enviados = 0;
    for (const a of alvos) {
      // já lembramos esse? pula.
      const { data: ja } = await sb.from("cadastro_lembrete").select("user_id").eq("user_id", a.id).maybeSingle();
      if (ja) continue;

      // gera um link novo de confirmação
      const { data: lk, error: lkErr } = await sb.auth.admin.generateLink({ type: "signup", email: a.email } as any);
      const link = (lk as any)?.properties?.action_link || `${APP_URL}/`;
      if (lkErr) { console.error("generateLink erro", a.email, lkErr.message); }

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [a.email], subject: "Falta só um passo pra ativar sua conta 💚", html: html(a.nome, link) }),
      });
      if (r.ok) {
        enviados++;
        await sb.from("cadastro_lembrete").insert({ user_id: a.id, email: a.email });
      } else {
        console.error("Resend falhou", a.email, r.status);
      }
    }

    return new Response(JSON.stringify({ ok: true, candidatos: alvos.length, enviados }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("cadastro-lembrete erro:", e);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
