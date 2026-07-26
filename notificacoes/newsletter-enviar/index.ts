// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "newsletter-enviar"
// Dispara uma campanha de newsletter pra todos os inscritos ATIVOS.
// Você chama com { subject, html, teste? } — se teste=true, manda só pro
// ADMIN_EMAIL (bom pra revisar antes). Cada e-mail leva um link de
// descadastro (LGPD). Envia em lotes pra respeitar o limite do Resend.
//
// Deploy:  supabase functions deploy newsletter-enviar --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//          EMAIL_FROM, WEBHOOK_SECRET (recomendado — só você dispara),
//          ADMIN_EMAIL (opcional, pro modo teste)
//
// Exemplo de chamada (curl):
//   curl -X POST https://<projeto>.functions.supabase.co/newsletter-enviar \
//     -H "x-webhook-secret: SEU_SEGREDO" -H "Content-Type: application/json" \
//     -d '{"subject":"Novidades do Dichava","html":"<p>Olá!</p>","teste":true}'
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND  = Deno.env.get("RESEND_API_KEY") || "";
const FROM    = Deno.env.get("EMAIL_FROM") || "Dichava <onboarding@resend.dev>";
const SECRET  = Deno.env.get("WEBHOOK_SECRET") || "";
const ADMIN   = Deno.env.get("ADMIN_EMAIL") || "";
const APP_URL = "https://dichava.app";

const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const rodape = (token: string) =>
  `<div style="font-size:11px;color:#9aa89c;margin-top:22px;line-height:1.6;text-align:center">
     Você recebe isto porque se inscreveu na newsletter do Dichava.
     <a href="${APP_URL}/newsletter-sair.html?t=${token}" style="color:#9aa89c">Descadastrar</a>
   </div>`;

const ADMINS = (Deno.env.get("ADMIN_EMAIL") || "alex.mnteir@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

// autoriza se: (a) veio com o WEBHOOK_SECRET (cron/curl) OU (b) é um admin logado (JWT)
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
  if (!(await autorizado(req)))
    return new Response("forbidden", { status: 403 });
  try {
    if (!RESEND) return new Response(JSON.stringify({ erro: "sem RESEND_API_KEY" }), { status: 500 });
    const body = await req.json().catch(() => ({} as any));
    const subject = String(body?.subject || "").trim();
    const conteudo = String(body?.html || "").trim();
    const teste = !!body?.teste;
    if (!subject || !conteudo) return new Response(JSON.stringify({ erro: "subject e html obrigatorios" }), { status: 400 });

    // modo teste: manda só pro admin
    if (teste) {
      if (!ADMIN) return new Response(JSON.stringify({ erro: "sem ADMIN_EMAIL" }), { status: 400 });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [ADMIN], subject: `[TESTE] ${subject}`, html: conteudo + rodape("teste") }),
      });
      return new Response(JSON.stringify({ ok: r.ok, teste: true }), { headers: { "content-type": "application/json" } });
    }

    const { data: subs, error } = await sb.from("newsletter")
      .select("email, unsub_token").eq("ativo", true).eq("consent", true);
    if (error) throw error;
    if (!subs?.length) return new Response(JSON.stringify({ ok: true, enviados: 0 }), { headers: { "content-type": "application/json" } });

    let enviados = 0, falhas = 0;
    // lotes de 20 com pausa curta (respeita rate limit do Resend)
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

    return new Response(JSON.stringify({ ok: true, total: subs.length, enviados, falhas }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("newsletter-enviar erro:", e);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
