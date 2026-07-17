// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "pro-novo"
// Envia um e-mail ao admin quando um novo profissional se cadastra.
// Disparada por um Database Webhook do Supabase (INSERT em profissionais).
// Deploy:  supabase functions deploy pro-novo --no-verify-jwt
// Secrets: RESEND_API_KEY, ADMIN_EMAIL (opcional), MAIL_FROM (opcional)
// ════════════════════════════════════════════════════════════
const RESEND_KEY  = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "alex.mnteir@gmail.com";
const MAIL_FROM   = Deno.env.get("MAIL_FROM")   || "dichava <onboarding@resend.dev>";
const APP_URL     = Deno.env.get("SITE_URL")    || "https://dichava.app";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({} as any));
    // Database Webhook manda { type, table, record, old_record, schema }
    const p = payload?.record || payload || {};

    // só notifica cadastros novos pendentes (evita ruído em updates)
    if (payload?.type && payload.type !== "INSERT") return new Response("ignorado");

    const nome = p.nome || "Novo profissional";
    const linha = (rot: string, val: unknown) =>
      val ? `<tr><td style="padding:4px 10px 4px 0;color:#5D7060;font-size:13px">${rot}</td><td style="padding:4px 0;color:#1B2A1C;font-size:13px"><b>${esc(val)}</b></td></tr>` : "";

    const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;background:#F5F5F0;border-radius:16px;padding:24px">
      <div style="font-size:17px;font-weight:800;color:#1B2A1C;margin-bottom:4px">🩺 Novo profissional cadastrado</div>
      <div style="font-size:13px;color:#5D7060;margin-bottom:16px">Aguardando sua aprovação no painel de admin.</div>
      <div style="background:#fff;border-radius:12px;padding:16px 18px">
        <table style="border-collapse:collapse;width:100%">
          ${linha("Nome", nome)}
          ${linha("Tipo", p.tipo_prof)}
          ${linha("Registro", p.reg)}
          ${linha("Especialidades", p.especialidades)}
          ${linha("Modalidade", p.modalidade)}
          ${linha("Cidade", p.cidade)}
          ${linha("Valor", p.valor)}
          ${linha("E-mail", p.email)}
        </table>
        ${p.bio ? `<div style="margin-top:12px;font-size:13px;color:#2b3b2d;line-height:1.5"><b>Bio:</b> ${esc(p.bio)}</div>` : ""}
      </div>
      <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#4CAF5A;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:11px">Abrir o app → Config → Admin</a>
      <div style="font-size:11px;color:#9E9E9E;margin-top:14px">dichava.app · notificação automática</div>
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [ADMIN_EMAIL],
        subject: `🩺 Novo profissional: ${nome}`,
        html,
      }),
    });
    const data = await r.json().catch(() => ({}));
    console.log("Resend status:", r.status, JSON.stringify(data));
    return new Response(JSON.stringify({ ok: r.ok }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("pro-novo erro:", e);
    return new Response("ok"); // 200 pra não reenfileirar
  }
});
