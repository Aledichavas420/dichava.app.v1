// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "send-email" (Auth Send Email Hook)
// Envia os e-mails de autenticação com CONTEÚDO DIFERENTE por tipo:
//   • profissional (user_metadata.tipo === 'pro')  → tom "Rede Dichava / Painel"
//   • paciente (demais)                             → tom do app
// Cobre: confirmação de cadastro (signup) e redefinição de senha (recovery).
//
// ⚠️ Ao LIGAR o hook, o Supabase para de enviar e-mails sozinho e passa a
//    chamar ESTA função — por isso é preciso um provedor (aqui: Resend).
//
// Deploy:  supabase functions deploy send-email --no-verify-jwt
// Secrets: SEND_EMAIL_HOOK_SECRET (gerado ao criar o hook), RESEND_API_KEY,
//          EMAIL_FROM (ex: "Rede Dichava <nao-responda@dichava.app>")
//          SUPABASE_URL (já existe por padrão)
// Ativar:  Authentication → Hooks → Send Email Hook → HTTPS → aponte pra esta função
// ════════════════════════════════════════════════════════════
import { Webhook } from "npm:standardwebhooks@1.0.0";

const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace("v1,", "");
const RESEND_KEY  = Deno.env.get("RESEND_API_KEY") || "";
const FROM        = Deno.env.get("EMAIL_FROM") || "Rede Dichava <onboarding@resend.dev>";
const SB_URL      = Deno.env.get("SUPABASE_URL") || "";

// monta o link de ação (confirmar e-mail / redefinir senha)
function actionLink(d: any) {
  const rt = d.redirect_to ? `&redirect_to=${encodeURIComponent(d.redirect_to)}` : "";
  return `${SB_URL}/auth/v1/verify?token=${d.token_hash}&type=${d.email_action_type}${rt}`;
}

const btn = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#2f5740;color:#fff;padding:13px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-family:system-ui,sans-serif">${label}</a></p>`;

const wrap = (inner: string, accent = "#2f5740") =>
  `<div style="max-width:480px;margin:0 auto;padding:28px 22px;font-family:system-ui,-apple-system,sans-serif;color:#243024;line-height:1.6">
     ${inner}
     <hr style="border:none;border-top:1px solid #eee;margin:26px 0 12px">
     <p style="color:#7a8a6f;font-size:12px">Feito com cuidado pela <b style="color:${accent}">Rede Dichava</b> · dichava.app</p>
   </div>`;

// ── Templates ──────────────────────────────────────────────
function tplPro(action: string, link: string) {
  if (action === "recovery") return {
    subject: "Redefinir sua senha — Rede Dichava",
    html: wrap(`<h2 style="color:#1f3d2b">Redefinir sua senha</h2>
      <p>Recebemos um pedido para redefinir a senha do seu acesso ao <b>Painel dichava</b>. Toque abaixo para criar uma nova:</p>
      ${btn(link, "Criar nova senha")}
      <p style="color:#5c6b5a;font-size:13px">Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>`),
  };
  return {
    subject: "Confirme seu e-mail — Rede Dichava",
    html: wrap(`<h2 style="color:#1f3d2b">Bem-vindo(a) à Rede Dichava 🌱</h2>
      <p>Que bom ter você com a gente. Confirme seu e-mail para ativar seu acesso ao <b>Painel dos profissionais</b>.</p>
      ${btn(link, "Confirmar e-mail")}
      <p style="color:#5c6b5a;font-size:13px">Se você não criou esta conta, é só ignorar este e-mail.</p>`),
  };
}
function tplUser(action: string, link: string) {
  if (action === "recovery") return {
    subject: "Redefinir sua senha — dichava.app",
    html: wrap(`<h2 style="color:#1f3d2b">Vamos criar uma nova senha 💚</h2>
      <p>Recebemos um pedido para redefinir a senha da sua conta no dichava.app.</p>
      ${btn(link, "Criar nova senha")}
      <p style="color:#5c6b5a;font-size:13px">Se não foi você, pode ignorar — nada muda.</p>`),
  };
  return {
    subject: "Confirme seu e-mail — dichava.app",
    html: wrap(`<h2 style="color:#1f3d2b">Boas-vindas ao dichava.app 🌱</h2>
      <p>Falta só um passo: confirme seu e-mail para começar seu acompanhamento, sem julgamento.</p>
      ${btn(link, "Confirmar e-mail")}
      <p style="color:#5c6b5a;font-size:13px">Se você não criou esta conta, é só ignorar este e-mail.</p>`),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  // 1) valida a assinatura do webhook (segurança)
  let data: any;
  try {
    const wh = new Webhook(HOOK_SECRET);
    data = wh.verify(payload, headers);
  } catch (e) {
    console.error("assinatura inválida:", (e as Error).message);
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  const user = data.user || {};
  const ed = data.email_data || {};
  const action = ed.email_action_type || "signup";
  const ehPro = (user.user_metadata?.tipo || user.raw_user_meta_data?.tipo) === "pro";
  const link = actionLink(ed);
  const tpl = ehPro ? tplPro(action, link) : tplUser(action, link);

  // 2) envia via Resend
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [user.email], subject: tpl.subject, html: tpl.html }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("resend erro:", r.status, t);
      // devolve erro pro Supabase saber que não enviou
      return new Response(JSON.stringify({ error: t }), { status: 500 });
    }
  } catch (e) {
    console.error("falha no envio:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }

  // 200 vazio = o Supabase entende que o e-mail foi enviado pela função
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
