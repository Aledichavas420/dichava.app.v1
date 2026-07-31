// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "email-boasvindas"
// Dispara o e-mail de boas-vindas quando o ADMIN libera o cadastro
// de um profissional (acesso pago OU teste grátis de 7 dias).
// Corpo: { to, nome?, trial? }
// Autoriza: admin logado (JWT) OU WEBHOOK_SECRET (curl/cron).
//
// Deploy:  supabase functions deploy email-boasvindas --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY,
//          EMAIL_FROM (ex: "Rede Dichava <nao-responda@dichava.app>"),
//          ADMIN_EMAIL, WEBHOOK_SECRET (opcional)
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON    = Deno.env.get("SUPABASE_ANON_KEY") || "";
const RESEND  = Deno.env.get("RESEND_API_KEY") || "";
const FROM    = Deno.env.get("EMAIL_FROM") || "Rede Dichava <onboarding@resend.dev>";
const SECRET  = Deno.env.get("WEBHOOK_SECRET") || "";
const APP_URL = "https://dichava.app";
const PAINEL  = APP_URL + "/clinica/";

const ADMINS = (Deno.env.get("ADMIN_EMAIL") || "alex.mnteir@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });

async function ehAdmin(req: Request): Promise<{ ok: boolean; motivo?: string }> {
  if (SECRET && (req.headers.get("x-webhook-secret") || "") === SECRET) return { ok: true };
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return { ok: false, motivo: "sem Authorization header" };
  try {
    const authClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await authClient.auth.getUser();
    if (error || !data?.user) return { ok: false, motivo: "token inválido/expirado" };
    const email = (data.user.email || "").toLowerCase();
    if (!ADMINS.includes(email)) return { ok: false, motivo: "não é admin: " + email };
    return { ok: true };
  } catch (e) { return { ok: false, motivo: "erro auth: " + String((e as any)?.message || e) }; }
}

// botão em <table> pra compatibilidade (Outlook/Gmail/Apple Mail)
const btn = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto"><tr><td style="border-radius:12px;background:#2f7a4d">
     <a href="${href}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">${label}</a>
   </td></tr></table>`;

// shell com a cara do app (mesmo do send-email): cabeçalho verde + rodapé
const shell = (label: string, inner: string) =>
  `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
   <style>:root{color-scheme:light only;supported-color-schemes:light}</style></head>
   <body style="margin:0;padding:0;background-color:#eef2ea">
   <div style="margin:0;padding:26px 12px;background-color:#eef2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
     <div style="max-width:460px;margin:0 auto;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6ece7">
       <div style="background-color:#1f3d2b;padding:28px 24px;text-align:center">
         <div style="font-size:27px;font-weight:800;color:#ffffff;letter-spacing:.3px">dichava<span style="color:#f0a742">.app</span></div>
         <div style="color:#a9c6b6;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;margin-top:7px">${label}</div>
       </div>
       <div style="background-color:#ffffff;padding:30px 28px 20px;color:#243024;font-size:15px;line-height:1.7;text-align:left">${inner}</div>
       <div style="background-color:#ffffff;padding:16px 24px 24px;text-align:center;color:#8a9a86;font-size:12px;border-top:1px solid #eef1ea">
         Feito com cuidado pela <b style="color:#2f5740">Rede Dichava</b><br>
         <span style="color:#aab6a6">dichava.app</span>
       </div>
     </div>
   </div></body></html>`;

// corpo do e-mail com o texto do Alexandre
function corpo(nome: string, trial: boolean) {
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const P = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  const acessoLinha = trial
    ? `Sua conta já foi ativada e o seu <b>teste grátis de 7 dias</b> começou. 🌱`
    : `Sua conta já foi ativada e o acesso está liberado. 🌱`;
  return shell("Painel dos profissionais",
    `<div style="font-size:20px;font-weight:800;color:#1f3d2b;margin-bottom:14px">${ola}</div>` +
    P(acessoLinha) +
    P("A partir de agora você já pode explorar a plataforma, conhecer as ferramentas e começar a organizar sua prática clínica dentro da Rede.") +
    P("Como você faz parte dos primeiros profissionais, seu feedback será muito importante. Se encontrar qualquer dificuldade, tiver alguma sugestão ou perceber algo que possa melhorar, é só me chamar.") +
    P("Obrigado por acreditar nesse projeto desde o começo. Espero que a Rede Dichava seja uma ferramenta que fortaleça o seu trabalho e, principalmente, o cuidado com seus pacientes.") +
    P("Seja muito bem-vind@! 💚") +
    btn(PAINEL, "Acessar o painel")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = await ehAdmin(req);
  if (!auth.ok) return J({ erro: "forbidden", motivo: auth.motivo }, 403);
  try {
    if (!RESEND) return J({ erro: "sem RESEND_API_KEY" }, 500);
    const body = await req.json().catch(() => ({} as any));
    const to = String(body?.to || "").trim();
    const nome = String(body?.nome || "").trim().split(/\s+/)[0] || "";
    const trial = !!body?.trial;
    if (!to || !/.+@.+\..+/.test(to)) return J({ erro: "e-mail inválido" }, 400);

    const subject = trial
      ? "Seu teste na Rede Dichava começou 💚"
      : "Bem-vind@ à Rede Dichava 💚";

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: corpo(nome, trial) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("resend erro:", r.status, d); return J({ ok: false, erro: d }, 500); }
    return J({ ok: true, resend: d });
  } catch (e) {
    console.error("email-boasvindas erro:", e);
    return J({ ok: false, erro: String((e as any)?.message || e) }, 500);
  }
});
