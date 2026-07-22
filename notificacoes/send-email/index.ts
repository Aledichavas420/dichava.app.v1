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

// botão em <table> pra compatibilidade (Outlook/Gmail/Apple Mail)
const btn = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto"><tr><td style="border-radius:12px;background:#2f7a4d">
     <a href="${href}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">${label}</a>
   </td></tr></table>`;

// shell com a cara do app: cabeçalho verde + wordmark + rodapé Rede Dichava
const shell = (label: string, inner: string) =>
  `<div style="margin:0;padding:26px 12px;background:#eef2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
     <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6ece7">
       <div style="background:#1f3d2b;padding:28px 24px;text-align:center">
         <div style="font-size:27px;font-weight:800;color:#ffffff;letter-spacing:.3px">dichava<span style="color:#f0a742">.app</span></div>
         <div style="color:#a9c6b6;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;margin-top:7px">${label}</div>
       </div>
       <div style="padding:30px 28px 20px;color:#243024;font-size:15px;line-height:1.65;text-align:center">${inner}</div>
       <div style="padding:16px 24px 24px;text-align:center;color:#8a9a86;font-size:12px;border-top:1px solid #eef1ea">
         Feito com cuidado pela <b style="color:#2f5740">Rede Dichava</b><br>
         <span style="color:#aab6a6">dichava.app</span>
       </div>
     </div>
   </div>`;

const H2 = (t: string) => `<div style="font-size:21px;font-weight:800;color:#1f3d2b;margin-bottom:10px">${t}</div>`;
const P  = (t: string) => `<div style="margin:0 auto 4px;max-width:340px">${t}</div>`;
const SMALL = (t: string) => `<div style="color:#8a9a86;font-size:13px;margin-top:14px">${t}</div>`;

// ── Templates ──────────────────────────────────────────────
function tplPro(action: string, link: string) {
  if (action === "recovery") return {
    subject: "Redefinir sua senha — Rede Dichava",
    html: shell("Painel dos profissionais", H2("Redefinir sua senha") +
      P("Recebemos um pedido para redefinir a senha do seu acesso ao <b>Painel dichava</b>.") +
      btn(link, "Criar nova senha") +
      SMALL("Se não foi você, ignore este e-mail — sua senha continua a mesma.")),
  };
  return {
    subject: "Confirme seu e-mail — Rede Dichava",
    html: shell("Painel dos profissionais", H2("Bem-vindo(a) à Rede Dichava 🌱") +
      P("Que bom ter você com a gente. Confirme seu e-mail para ativar seu acesso ao <b>Painel dos profissionais</b>.") +
      btn(link, "Confirmar e-mail") +
      SMALL("Se você não criou esta conta, é só ignorar este e-mail.")),
  };
}
function tplUser(action: string, link: string) {
  if (action === "recovery") return {
    subject: "Redefinir sua senha — dichava.app",
    html: shell("Autocuidado, sem julgamento", H2("Vamos criar uma nova senha 💚") +
      P("Recebemos um pedido para redefinir a senha da sua conta no dichava.app.") +
      btn(link, "Criar nova senha") +
      SMALL("Se não foi você, pode ignorar — nada muda.")),
  };
  return {
    subject: "Confirme seu e-mail — dichava.app",
    html: shell("Autocuidado, sem julgamento", H2("Boas-vindas ao dichava.app 🌱") +
      P("Falta só um passo: confirme seu e-mail para começar seu acompanhamento, sem julgamento.") +
      btn(link, "Confirmar e-mail") +
      SMALL("Se você não criou esta conta, é só ignorar este e-mail.")),
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
