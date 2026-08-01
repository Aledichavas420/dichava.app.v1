// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "admin-email"
// Envia e-mails avulsos (ex: check-in com profissionais) direto do
// painel admin, via Resend. Respostas caem no e-mail do admin (reply_to).
//
// Corpo:
//   { to, subject, html, reply_to? }                 → 1 destinatário
//   { messages:[{to,subject,html}], reply_to? }      → lote (personalizado)
//
// Autoriza: admin logado (JWT) OU WEBHOOK_SECRET.
//
// Deploy:  supabase functions deploy admin-email --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY,
//          EMAIL_FROM, ADMIN_EMAIL, WEBHOOK_SECRET (opcional)
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON   = Deno.env.get("SUPABASE_ANON_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM   = Deno.env.get("EMAIL_FROM") || "Rede Dichava <onboarding@resend.dev>";
const SECRET = Deno.env.get("WEBHOOK_SECRET") || "";
const ADMINS = (Deno.env.get("ADMIN_EMAIL") || "alex.mnteir@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const REPLY_DEFAULT = ADMINS[0] || "";

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
    const c = createClient(SB_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await c.auth.getUser();
    if (error || !data?.user) return { ok: false, motivo: "token inválido/expirado" };
    const email = (data.user.email || "").toLowerCase();
    if (!ADMINS.includes(email)) return { ok: false, motivo: "não é admin: " + email };
    return { ok: true };
  } catch (e) { return { ok: false, motivo: "erro auth: " + String((e as any)?.message || e) }; }
}

async function enviar(to: string, subject: string, html: string, replyTo: string) {
  const body: any = { from: FROM, to: [to], subject, html };
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = await ehAdmin(req);
  if (!auth.ok) return J({ erro: "forbidden", motivo: auth.motivo }, 403);
  try {
    if (!RESEND) return J({ erro: "sem RESEND_API_KEY" }, 500);
    const b = await req.json().catch(() => ({} as any));
    const replyTo = String(b?.reply_to || REPLY_DEFAULT || "").trim();

    // Monta a lista de mensagens (aceita 1 ou lote)
    let msgs: Array<{ to: string; subject: string; html: string }> = [];
    if (Array.isArray(b?.messages)) {
      msgs = b.messages.map((m: any) => ({ to: String(m?.to || "").trim(), subject: String(m?.subject || "").trim(), html: String(m?.html || "") }));
    } else {
      msgs = [{ to: String(b?.to || "").trim(), subject: String(b?.subject || "").trim(), html: String(b?.html || "") }];
    }
    msgs = msgs.filter((m) => /.+@.+\..+/.test(m.to) && m.subject && m.html);
    if (!msgs.length) return J({ erro: "nada válido para enviar (to/subject/html)" }, 400);

    let enviados = 0, falhas = 0;
    for (let i = 0; i < msgs.length; i += 20) {
      const lote = msgs.slice(i, i + 20);
      await Promise.all(lote.map(async (m) => { (await enviar(m.to, m.subject, m.html, replyTo)) ? enviados++ : falhas++; }));
      if (i + 20 < msgs.length) await new Promise((res) => setTimeout(res, 1100));
    }
    return J({ ok: true, total: msgs.length, enviados, falhas });
  } catch (e) {
    console.error("admin-email erro:", e);
    return J({ ok: false, erro: String((e as any)?.message || e) }, 500);
  }
});
