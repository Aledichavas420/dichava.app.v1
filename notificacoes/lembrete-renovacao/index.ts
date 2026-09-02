// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "lembrete-renovacao"
// Avisa o profissional perto do vencimento da assinatura (acesso_ate),
// por e-mail (Resend) e por push. Marcos: 5 dias antes, no dia, 3 dias depois.
// Roda por cron (pg_cron chama uma vez por dia). Idempotente: cada marco de
// cada ciclo (venc) é enviado uma vez só, controlado por renovacao_lembrete.
//
// Deploy:  supabase functions deploy lembrete-renovacao --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//          EMAIL_FROM (ex: "Rede Dichava <nao-responda@dichava.app>"),
//          VAPID_PUB, VAPID_PRIVATE, CRON_SECRET
// ════════════════════════════════════════════════════════════
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM   = Deno.env.get("EMAIL_FROM") || "Rede Dichava <onboarding@resend.dev>";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const urlsafe = (k: string) => (k || "").trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
const VAPID_PUB  = urlsafe(Deno.env.get("VAPID_PUB")  || "");
const VAPID_PRIV = urlsafe(Deno.env.get("VAPID_PRIVATE") || "");
try { if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails("mailto:contato@dichava.app", VAPID_PUB, VAPID_PRIV); } catch (_) {}

const ASSINAR = "https://dichava.app/assinar/";

// data no fuso de São Paulo, no formato YYYY-MM-DD
function spDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
// diferença em dias-calendário (SP) entre a data alvo e hoje (positivo = futuro)
function diasAte(aISO: string): number {
  const a = new Date(spDate(aISO) + "T00:00:00Z").getTime();
  const h = new Date(spDate(new Date()) + "T00:00:00Z").getTime();
  return Math.round((a - h) / 86400000);
}
function marcoDe(dias: number): string | null {
  if (dias >= 1 && dias <= 5) return "antes5";     // dentro dos próximos 5 dias
  if (dias <= 0 && dias >= -1) return "dia";        // vence hoje (ou virou ontem)
  if (dias <= -3 && dias >= -5) return "depois3";   // 3 a 5 dias depois de vencido
  return null;
}

const pnome = (n: string) => {
  const p = (n || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "profissional";
};

function textoEmail(marco: string, nome: string) {
  const oi = `Oi, ${pnome(nome)}!`;
  if (marco === "antes5") return {
    assunto: "Sua assinatura do dichava vence em 5 dias",
    titulo: "Falta pouco pra renovar",
    corpo: `${oi} Passando pra avisar com calma: a sua assinatura do dichava vence em <b>5 dias</b>. Renovando agora, você segue sem interrupção no diretório da Rede, no painel e no acompanhamento dos seus pacientes. Leva um minuto.`,
    botao: "Renovar minha assinatura",
  };
  if (marco === "dia") return {
    assunto: "Sua assinatura do dichava vence hoje",
    titulo: "Sua assinatura vence hoje",
    corpo: `${oi} Sua assinatura do dichava vence <b>hoje</b>. Pra não perder o acesso ao painel e a sua presença na Rede, é só renovar. Se você já renovou, pode ignorar esta mensagem.`,
    botao: "Renovar agora",
  };
  return {
    assunto: "Sua assinatura venceu, mas dá pra voltar",
    titulo: "Ainda dá tempo de voltar",
    corpo: `${oi} Sua assinatura do dichava venceu há alguns dias e o seu acesso ao painel ficou pausado. Se fez sentido pra você e pros seus pacientes, é rápido reativar e retomar de onde parou. A gente adora ter você na Rede.`,
    botao: "Reativar minha assinatura",
  };
}

function shell(titulo: string, corpo: string, botao: string) {
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#F5F9F5;font-family:Arial,Helvetica,sans-serif;color:#16261B">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:linear-gradient(150deg,#153E27,#0C2A19);border-radius:18px 18px 0 0;padding:26px 26px 20px;color:#fff">
        <div style="font-size:12px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:#9fd5ae">Rede dichava</div>
        <div style="font-size:22px;font-weight:bold;margin-top:8px">${titulo}</div>
      </div>
      <div style="background:#fff;border:1px solid #E4EDE6;border-top:none;border-radius:0 0 18px 18px;padding:24px 26px">
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px">${corpo}</p>
        <a href="${ASSINAR}" style="display:inline-block;background:#2E9B4F;color:#fff;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 24px;border-radius:26px">${botao}</a>
        <p style="font-size:12.5px;line-height:1.6;color:#657a69;margin:22px 0 0">Se tiver qualquer dúvida sobre planos, pagamento ou sobre a Rede, é só responder este e-mail que a gente te ajuda.</p>
      </div>
      <div style="text-align:center;color:#8aa08e;font-size:11.5px;margin-top:14px">dichava.app · Rede dichava</div>
    </div>
  </body></html>`;
}

async function emailDoProf(prof: any): Promise<string> {
  const direto = (prof.email || "").trim();
  if (direto) return direto;
  try { const { data } = await sb.auth.admin.getUserById(prof.id); return (data?.user?.email || "").trim(); }
  catch (_) { return ""; }
}

async function enviarEmail(to: string, marco: string, nome: string) {
  if (!RESEND || !to) return "sem-email";
  const t = textoEmail(marco, nome);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: t.assunto, html: shell(t.titulo, t.corpo, t.botao) }),
    });
    return r.ok ? "email-ok" : ("email-erro:" + r.status);
  } catch (e) { return "email-exc"; }
}

async function enviarPush(profId: string, marco: string, nome: string) {
  if (!VAPID_PUB || !VAPID_PRIV) return "push-off";
  const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", profId);
  if (!subs || !subs.length) return "sem-push";
  const t = textoEmail(marco, nome);
  const notif = JSON.stringify({ title: t.titulo, body: "Toque para renovar sua assinatura do dichava.", url: "/clinica/", tag: "renovacao-" + marco });
  await Promise.all(subs.map((s: any) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, notif)
      .then(() => "ok")
      .catch(async (err: any) => { if (err?.statusCode === 404 || err?.statusCode === 410) { try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {} } return "erro"; })
  ));
  return "push-ok";
}

Deno.serve(async (req) => {
  // segurança: só o cron (com o segredo) roda isto
  if (CRON_SECRET && (req.headers.get("x-cron-secret") || "") !== CRON_SECRET)
    return new Response("forbidden", { status: 403 });

  const { data: profs, error } = await sb.from("profissionais")
    .select("id,nome,email,plano,acesso_ate,ativo")
    .eq("ativo", true)
    .not("acesso_ate", "is", null);
  if (error) { console.error("lembrete-renovacao: erro ao ler profissionais", error.message); return new Response("erro", { status: 500 }); }

  const relatorio: any[] = [];
  for (const prof of (profs || [])) {
    const marco = marcoDe(diasAte(prof.acesso_ate));
    if (!marco) continue;
    const venc = spDate(prof.acesso_ate);

    // já avisamos este marco neste ciclo (venc)?
    const { data: ja } = await sb.from("renovacao_lembrete")
      .select("prof_id").eq("prof_id", prof.id).eq("marco", marco).eq("venc", venc).maybeSingle();
    if (ja) continue;

    const to = await emailDoProf(prof);
    const rEmail = await enviarEmail(to, marco, prof.nome);
    const rPush  = await enviarPush(prof.id, marco, prof.nome);

    // registra pra não repetir
    await sb.from("renovacao_lembrete").insert({ prof_id: prof.id, marco, venc });
    relatorio.push({ prof: prof.id, marco, email: rEmail, push: rPush });
  }

  console.log("lembrete-renovacao:", JSON.stringify(relatorio));
  return new Response(JSON.stringify({ ok: true, enviados: relatorio.length, detalhe: relatorio }), { headers: { "Content-Type": "application/json" } });
});
