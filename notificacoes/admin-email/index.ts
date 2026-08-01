// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "admin-email"
// Envia e-mails avulsos (check-in, lembrete de lançamento…) direto do
// painel admin, via Resend. Respostas caem no e-mail do admin (reply_to).
//
// Corpo:
//   { to, subject, html, reply_to? }                 → 1 destinatário
//   { messages:[{to,subject,html}], reply_to? }      → lote (personalizado)
//
// Usa o endpoint de LOTE da Resend (/emails/batch, até 100 por chamada),
// evitando o limite de ~2 e-mails/s que derrubava envios em paralelo.
// Se o lote falhar (ex.: 1 e-mail inválido), cai pra envio individual
// com intervalo, e devolve a lista de quem falhou.
//
// Autoriza: admin logado (JWT) OU WEBHOOK_SECRET.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

type Msg = { to: string; subject: string; html: string };

function payloadDe(m: Msg, replyTo: string) {
  const p: any = { from: FROM, to: [m.to], subject: m.subject, html: m.html };
  if (replyTo) p.reply_to = replyTo;
  return p;
}

// Envio individual (usado no fallback). Devolve true/false.
async function enviarUm(m: Msg, replyTo: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify(payloadDe(m, replyTo)),
  });
  return r.ok;
}

// Envio em lote (até 100). Devolve quantos foram aceitos.
async function enviarLote(chunk: Msg[], replyTo: string): Promise<{ ok: boolean; aceitos: number; status: number }> {
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify(chunk.map((m) => payloadDe(m, replyTo))),
  });
  const d = await r.json().catch(() => ({} as any));
  const aceitos = r.ok && Array.isArray(d?.data) ? d.data.length : 0;
  return { ok: r.ok, aceitos, status: r.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = await ehAdmin(req);
  if (!auth.ok) return J({ erro: "forbidden", motivo: auth.motivo }, 403);
  try {
    if (!RESEND) return J({ erro: "sem RESEND_API_KEY" }, 500);
    const b = await req.json().catch(() => ({} as any));
    const replyTo = String(b?.reply_to || REPLY_DEFAULT || "").trim();

    let msgs: Msg[] = [];
    if (Array.isArray(b?.messages)) {
      msgs = b.messages.map((m: any) => ({ to: String(m?.to || "").trim(), subject: String(m?.subject || "").trim(), html: String(m?.html || "") }));
    } else {
      msgs = [{ to: String(b?.to || "").trim(), subject: String(b?.subject || "").trim(), html: String(b?.html || "") }];
    }
    msgs = msgs.filter((m) => /.+@.+\..+/.test(m.to) && m.subject && m.html);
    if (!msgs.length) return J({ erro: "nada válido para enviar (to/subject/html)" }, 400);

    let enviados = 0, falhas = 0;
    const falhas_emails: string[] = [];

    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      const res = await enviarLote(chunk, replyTo);
      if (res.ok && res.aceitos === chunk.length) {
        enviados += chunk.length;
      } else {
        // Lote falhou/parcial → tenta um a um, com intervalo pra não estourar o limite
        for (const m of chunk) {
          const ok = await enviarUm(m, replyTo);
          if (ok) { enviados++; } else { falhas++; falhas_emails.push(m.to); }
          await sleep(600);
        }
      }
      if (i + 100 < msgs.length) await sleep(700);
    }

    return J({ ok: true, total: msgs.length, enviados, falhas, falhas_emails });
  } catch (e) {
    console.error("admin-email erro:", e);
    return J({ ok: false, erro: String((e as any)?.message || e) }, 500);
  }
});
