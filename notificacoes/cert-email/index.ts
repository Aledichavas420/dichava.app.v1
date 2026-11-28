// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "cert-email"
// Envia o certificado de participação (link da página de validação).
// Corpo: { to, nome, evento, data, link }
// Autoriza: admin logado (JWT) OU WEBHOOK_SECRET.
//
// Deploy:  supabase functions deploy cert-email --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY,
//          EMAIL_FROM (ex: "Rede Dichava <nao-responda@dichava.app>"),
//          ADMIN_EMAIL, WEBHOOK_SECRET (opcional)
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON   = Deno.env.get("SUPABASE_ANON_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM   = Deno.env.get("EMAIL_FROM") || "Rede Dichava <onboarding@resend.dev>";
const SECRET = Deno.env.get("WEBHOOK_SECRET") || "";

const ADMINS = (Deno.env.get("ADMIN_EMAIL") || "")
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

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function dataLonga(iso: string) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length < 3) return iso;
  return `${+p[2]} de ${MESES[(+p[1]) - 1]} de ${p[0]}`;
}

const btn = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto"><tr><td style="border-radius:12px;background:#2f7a4d">
     <a href="${href}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">${label}</a>
   </td></tr></table>`;

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
         Feito com cuidado pela <b style="color:#2f5740">Rede Dichava</b><br><span style="color:#aab6a6">dichava.app</span>
       </div>
     </div>
   </div></body></html>`;

function corpo(nome: string, evento: string, data: string, link: string) {
  const primeiro = (nome || "").trim().split(/\s+/)[0] || "";
  const ola = primeiro ? `Olá, ${esc(primeiro)}!` : "Olá!";
  const P = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  return shell("Certificado de participação",
    `<div style="font-size:20px;font-weight:800;color:#1f3d2b;margin-bottom:14px">${ola}</div>` +
    P(`Seu <b>certificado de participação</b> na roda de conversa <b>"${esc(evento)}"</b>${data ? `, realizada em <b>${esc(dataLonga(data))}</b>` : ""}, está pronto. 🌱`) +
    P("Clique no botão abaixo para ver, baixar e validar o seu certificado:") +
    btn(link, "Ver meu certificado") +
    P(`Se o botão não funcionar, use este link:<br><a href="${link}" style="color:#2f7a4d;word-break:break-all">${esc(link)}</a>`) +
    P("Obrigado por caminhar com a gente na redução de danos. 💚")
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
    const nome = String(body?.nome || "").trim();
    const evento = String(body?.evento || "").trim();
    const data = String(body?.data || "").trim();
    const link = String(body?.link || "").trim();
    if (!to || !/.+@.+\..+/.test(to)) return J({ erro: "e-mail inválido" }, 400);
    if (!link) return J({ erro: "sem link do certificado" }, 400);

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: "Seu certificado da Rede Dichava 💚", html: corpo(nome, evento, data, link) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("resend erro:", r.status, d); return J({ ok: false, erro: d }, 500); }
    return J({ ok: true, resend: d });
  } catch (e) {
    console.error("cert-email erro:", e);
    return J({ ok: false, erro: String((e as any)?.message || e) }, 500);
  }
});
