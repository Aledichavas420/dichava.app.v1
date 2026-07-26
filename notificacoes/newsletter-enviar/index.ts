// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "newsletter-enviar"
// Dispara uma campanha de newsletter pra todos os inscritos ATIVOS.
// { subject, html, teste? } — teste=true manda só pro ADMIN_EMAIL.
// Autoriza: admin logado (JWT) OU WEBHOOK_SECRET (cron/curl).
//
// Deploy:  supabase functions deploy newsletter-enviar --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//          EMAIL_FROM, ADMIN_EMAIL, WEBHOOK_SECRET (opcional p/ cron)
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND  = Deno.env.get("RESEND_API_KEY") || "";
const FROM    = Deno.env.get("EMAIL_FROM") || "Dichava <onboarding@resend.dev>";
const SECRET  = Deno.env.get("WEBHOOK_SECRET") || "";
const ADMIN   = Deno.env.get("ADMIN_EMAIL") || "";
const APP_URL = "https://dichava.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });

const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const rodape = (token: string) =>
  `<div style="font-size:11px;color:#9aa89c;margin-top:22px;line-height:1.6;text-align:center">
     Você recebe isto porque se inscreveu na newsletter do Dichava.
     <a href="${APP_URL}/newsletter-sair.html?t=${token}" style="color:#9aa89c">Descadastrar</a>
   </div>`;

const ADMINS = (Deno.env.get("ADMIN_EMAIL") || "alex.mnteir@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

async function autorizado(req: Request): Promise<boolean> {
  if (SECRET && (req.headers.get("x-webhook-secret") || "") === SECRET) return true;
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const { data } = await sb.auth.getUser(token);
    const email = (data?.user?.email || "").toLowerCase();
    return ADMINS.includes(email);
  } catch (_) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await autorizado(req))) return J({ erro: "forbidden" }, 403);
  try {
    if (!RESEND) return J({ erro: "sem RESEND_API_KEY" }, 500);
    const body = await req.json().catch(() => ({} as any));
    const subject = String(body?.subject || "").trim();
    const conteudo = String(body?.html || "").trim();
    const teste = !!body?.teste;
    if (!subject || !conteudo) return J({ erro: "subject e html obrigatorios" }, 400);

    if (teste) {
      if (!ADMIN) return J({ erro: "sem ADMIN_EMAIL" }, 400);
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [ADMIN], subject: `[TESTE] ${subject}`, html: conteudo + rodape("teste") }),
      });
      const d = await r.json().catch(() => ({}));
      return J({ ok: r.ok, teste: true, resend: d });
    }

    const { data: subs, error } = await sb.from("newsletter")
      .select("email, unsub_token").eq("ativo", true).eq("consent", true);
    if (error) throw error;
    if (!subs?.length) return J({ ok: true, enviados: 0 });

    let enviados = 0, falhas = 0;
    for (let i = 0; i < subs.length; i += 20) {
      const lote = subs.slice(i, i + 20);
      await Promise.all(lote.map(async (s: any) => {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: [s.email], subject, html: conteudo + rodape(s.unsub_token) }),
        });
        if (r.ok) enviados++; else falhas++;
      }));
      if (i + 20 < subs.length) await new Promise((res) => setTimeout(res, 1100));
    }

    return J({ ok: true, total: subs.length, enviados, falhas });
  } catch (e) {
    console.error("newsletter-enviar erro:", e);
    return J({ ok: false, erro: String((e as any)?.message || e) }, 500);
  }
});
