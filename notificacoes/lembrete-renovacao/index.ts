// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "lembrete-renovacao"
// Avisa o profissional perto do vencimento (acesso_ate), por e-mail (Resend)
// e push, com texto que muda conforme a cobrança (recorrente x Pix/manual).
//
// Três formas de rodar:
//   1) Cron (x-cron-secret): varre todos e envia nos marcos 5 antes / no dia /
//      3 depois. Idempotente por (prof, marco, ciclo).
//   2) modo:"individual" (JWT de admin ou secret) + prof_id [+ tipo]:
//      dispara pra UM profissional, na hora. Usado pelos botões do painel admin.
//   3) modo:"agora" (secret): antecipa o aviso pra todo o ciclo atual.
//
// Deploy:  supabase functions deploy lembrete-renovacao --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY, EMAIL_FROM, VAPID_PUB, VAPID_PRIVATE, CRON_SECRET
// ════════════════════════════════════════════════════════════
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON   = Deno.env.get("SUPABASE_ANON_KEY") || "";
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM   = Deno.env.get("EMAIL_FROM") || "Rede Dichava <onboarding@resend.dev>";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ADMINS = (Deno.env.get("ADMIN_EMAIL") || "alex.mnteir@gmail.com").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const urlsafe = (k: string) => (k || "").trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
const VAPID_PUB  = urlsafe(Deno.env.get("VAPID_PUB")  || "");
const VAPID_PRIV = urlsafe(Deno.env.get("VAPID_PRIVATE") || "");
try { if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails("mailto:contato@dichava.app", VAPID_PUB, VAPID_PRIV); } catch (_) {}

const ASSINAR = "https://dichava.app/assinar/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });

function spDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function diasAte(aISO: string): number {
  const a = new Date(spDate(aISO) + "T00:00:00Z").getTime();
  const h = new Date(spDate(new Date()) + "T00:00:00Z").getTime();
  return Math.round((a - h) / 86400000);
}
function marcoDe(dias: number): string | null {
  if (dias >= 1 && dias <= 5) return "antes5";
  if (dias <= 0 && dias >= -1) return "dia";
  if (dias <= -3 && dias >= -5) return "depois3";
  return null;
}
function fmtData(iso: string): string {
  const p = spDate(iso).split("-");
  return `${p[2]}/${p[1]}`;
}
const pnome = (n: string) => {
  const p = (n || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "profissional";
};
// tipo de cobrança: recorrente (marcado no obs_admin) x pix/manual (padrão)
function tipoDe(prof: any, tipoPassado?: string): string {
  if (tipoPassado === "recorrente" || tipoPassado === "pix" || tipoPassado === "outro") return tipoPassado;
  return /♻️|recorrente/i.test((prof && prof.obs_admin) || "") ? "recorrente" : "pix";
}

function textoEmail(marco: string, nome: string, dias: number, iso: string, tipo: string) {
  const oi = `Oi, ${pnome(nome)}!`;
  const quando = dias > 1 ? `em ${dias} dias` : (dias === 1 ? "amanhã" : "hoje");
  const data = fmtData(iso);

  if (tipo === "recorrente") {
    if (marco === "antes5") return {
      assunto: `Sua assinatura do dichava renova ${quando}`,
      titulo: "Sua renovação é automática",
      corpo: `${oi} Sua assinatura do dichava renova automaticamente <b>${quando}</b>, no dia <b>${data}</b>. Você não precisa fazer nada. Só vale conferir se o cartão cadastrado está em dia, pra a cobrança não falhar e o seu acesso seguir sem interrupção.`,
      botao: "Ver minha assinatura",
    };
    if (marco === "dia") return {
      assunto: "Sua assinatura do dichava renova hoje",
      titulo: "Renovação automática hoje",
      corpo: `${oi} Hoje (${data}) é o dia da renovação automática da sua assinatura do dichava. Se estiver tudo certo com o cartão, é só seguir usando. Se a cobrança falhar, a gente te avisa.`,
      botao: "Ver minha assinatura",
    };
    return {
      assunto: "Tivemos um problema na sua renovação",
      titulo: "A cobrança automática não passou",
      corpo: `${oi} A renovação automática da sua assinatura do dichava (vencimento em ${data}) não foi concluída, e o seu acesso ao painel corre risco de pausar. Costuma ser algo simples no cartão. Dá pra resolver em um minuto.`,
      botao: "Regularizar minha assinatura",
    };
  }

  // pix / manual / outro
  if (marco === "antes5") return {
    assunto: `Sua assinatura do dichava vence ${quando}`,
    titulo: "Falta pouco pra renovar",
    corpo: `${oi} Passando pra avisar com calma: a sua assinatura do dichava vence <b>${quando}</b>, no dia <b>${data}</b>. Renovando com antecedência, você segue sem interrupção no diretório da Rede, no painel e no acompanhamento dos seus pacientes. Leva um minuto.`,
    botao: "Renovar minha assinatura",
  };
  if (marco === "dia") return {
    assunto: "Sua assinatura do dichava vence hoje",
    titulo: "Sua assinatura vence hoje",
    corpo: `${oi} Sua assinatura do dichava vence <b>hoje</b> (${data}). Pra não perder o acesso ao painel e a sua presença na Rede, é só renovar. Se você já renovou, pode ignorar esta mensagem.`,
    botao: "Renovar agora",
  };
  return {
    assunto: "Sua assinatura venceu, mas dá pra voltar",
    titulo: "Ainda dá tempo de voltar",
    corpo: `${oi} Sua assinatura do dichava venceu há alguns dias (venceu em ${data}) e o seu acesso ao painel ficou pausado. Se fez sentido pra você e pros seus pacientes, é rápido reativar e retomar de onde parou. A gente adora ter você na Rede.`,
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
async function enviarEmail(to: string, marco: string, nome: string, dias: number, iso: string, tipo: string) {
  if (!RESEND || !to) return "sem-email";
  const t = textoEmail(marco, nome, dias, iso, tipo);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: t.assunto, html: shell(t.titulo, t.corpo, t.botao) }),
    });
    return r.ok ? "email-ok" : ("email-erro:" + r.status);
  } catch (_) { return "email-exc"; }
}
async function enviarPush(profId: string, marco: string, nome: string, dias: number, iso: string, tipo: string) {
  if (!VAPID_PUB || !VAPID_PRIV) return "push-off";
  const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", profId);
  if (!subs || !subs.length) return "sem-push";
  const t = textoEmail(marco, nome, dias, iso, tipo);
  await Promise.all(subs.map((s: any) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ title: t.titulo, body: "Toque para ver sua assinatura do dichava.", url: "/clinica/", tag: "renovacao-" + marco }))
      .then(() => "ok")
      .catch(async (err: any) => { if (err?.statusCode === 404 || err?.statusCode === 410) { try { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); } catch (_) {} } return "erro"; })
  ));
  return "push-ok";
}

// envia um profissional (usado pelo modo individual e como base dos outros)
async function processarUm(prof: any, marco: string, tipo: string, dedupe: boolean) {
  const dias = diasAte(prof.acesso_ate);
  const venc = spDate(prof.acesso_ate);
  if (dedupe) {
    const { data: ja } = await sb.from("renovacao_lembrete")
      .select("prof_id").eq("prof_id", prof.id).eq("marco", marco).eq("venc", venc).maybeSingle();
    if (ja) return { prof: prof.id, marco, pulado: "ja-enviado" };
  }
  const to = await emailDoProf(prof);
  const rEmail = await enviarEmail(to, marco, prof.nome, dias, prof.acesso_ate, tipo);
  const rPush  = await enviarPush(prof.id, marco, prof.nome, dias, prof.acesso_ate, tipo);
  try { await sb.from("renovacao_lembrete").upsert({ prof_id: prof.id, marco, venc }); } catch (_) {}
  return { prof: prof.id, marco, tipo, dias, email: rEmail, push: rPush };
}

async function ehAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth || !ANON) return false;
  try {
    const c = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data, error } = await c.auth.getUser();
    if (error || !data?.user) return false;
    return ADMINS.includes((data.user.email || "").toLowerCase());
  } catch (_) { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const modo = String(body?.modo || "cron");

  const temSecret = CRON_SECRET && (req.headers.get("x-cron-secret") || "") === CRON_SECRET;
  const admin = temSecret ? true : await ehAdmin(req);
  if (!admin) return J({ ok: false, erro: "não autorizado" }, 403);

  // ── modo individual: um profissional (botão do painel admin) ──
  if (modo === "individual") {
    const id = String(body?.prof_id || "");
    if (!id) return J({ ok: false, erro: "faltou prof_id" }, 400);
    const { data: prof, error } = await sb.from("profissionais")
      .select("id,nome,email,plano,acesso_ate,ativo,obs_admin").eq("id", id).maybeSingle();
    if (error || !prof) return J({ ok: false, erro: "profissional não encontrado" }, 404);
    if (!prof.acesso_ate) return J({ ok: false, erro: "profissional sem data de vencimento (acesso_ate)" }, 400);
    const dias = diasAte(prof.acesso_ate);
    const marco = dias >= 1 ? "antes5" : (dias === 0 ? "dia" : "depois3");
    const tipo = tipoDe(prof, body?.tipo);
    const r = await processarUm(prof, marco, tipo, false); // manual não bloqueia por dedupe
    return J({ ok: true, ...r });
  }

  // ── cron / agora: varre todos os pagantes com vencimento definido ──
  const { data: profs, error } = await sb.from("profissionais")
    .select("id,nome,email,plano,acesso_ate,ativo,obs_admin")
    .eq("ativo", true).not("acesso_ate", "is", null);
  if (error) return J({ ok: false, erro: error.message }, 500);

  const relatorio: any[] = [];
  for (const prof of (profs || [])) {
    const dias = diasAte(prof.acesso_ate);
    const marco = (modo === "agora" && dias >= 1) ? "antes5" : marcoDe(dias);
    if (!marco) continue;
    const tipo = tipoDe(prof);
    const r = await processarUm(prof, marco, tipo, true);
    if (!(r as any).pulado) relatorio.push(r);
  }
  console.log("lembrete-renovacao:", JSON.stringify({ modo, total: relatorio.length }));
  return J({ ok: true, modo, enviados: relatorio.length, detalhe: relatorio });
});
