// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "pagamento-webhook"
// Recebe a notificação do PagBank, CONFIRMA o pagamento na API
// e libera o premium gravando em `perfis` (plano + plano_expira).
// Deploy:  supabase functions deploy pagamento-webhook --no-verify-jwt
// Secrets: PAGBANK_TOKEN, PAGBANK_BASE (opcional), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// No PagBank, aponte a URL de notificação p/ esta função.
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN")!;
const PAGBANK_BASE  = Deno.env.get("PAGBANK_BASE") || "https://api.pagseguro.com";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const DIAS: Record<string, number | null> = { mensal: 30, anual: 365, vita: null };

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({} as any));

    // A notificação pode trazer o pedido direto (charges[]) ou só um id.
    let orderId: string | undefined = payload?.id || payload?.data?.id;
    let reference: string | undefined = payload?.reference_id || payload?.data?.reference_id;
    let charges: any[] | undefined = payload?.charges || payload?.data?.charges;

    // Reconsulta o pedido pra CONFIRMAR (nunca confiar só no corpo)
    if (orderId) {
      const r = await fetch(`${PAGBANK_BASE}/orders/${orderId}`, {
        headers: { "Authorization": `Bearer ${PAGBANK_TOKEN}`, "accept": "application/json" },
      });
      if (r.ok) {
        const o = await r.json();
        reference = o.reference_id || reference;
        charges = o.charges || charges;
      }
    }

    const paid = Array.isArray(charges) &&
      charges.some((c) => String(c?.status || "").toUpperCase() === "PAID");

    if (!paid || !reference) return new Response("ok"); // não é pagamento aprovado → ignora

    const [user_id, plano] = String(reference).split("|");
    if (!user_id) return new Response("ok");

    // idempotência simples: não reprocessa o mesmo pedido
    if (orderId) {
      const { data: ja } = await sb.from("pagamentos").select("id").eq("order_id", orderId).eq("status", "PAID").maybeSingle();
      if (ja) return new Response("ok");
    }

    const dias = DIAS[plano] ?? 30;
    let expira: string | null = null;
    if (dias !== null) {
      // se já é premium e não venceu, ESTENDE a partir da data atual de expiração
      const { data: perfil } = await sb.from("perfis").select("plano_expira").eq("user_id", user_id).maybeSingle();
      const base = perfil?.plano_expira && new Date(perfil.plano_expira) > new Date()
        ? new Date(perfil.plano_expira) : new Date();
      expira = new Date(base.getTime() + dias * 864e5).toISOString();
    }

    await sb.from("perfis").upsert({ user_id, plano: "premium", plano_expira: expira }, { onConflict: "user_id" });
    await sb.from("pagamentos").insert({ user_id, plano, order_id: orderId || null, status: "PAID" });

    return new Response("ok");
  } catch (e) {
    // devolve 200 pra evitar reenvio infinito por erro nosso; logamos o erro
    console.error("webhook erro:", e);
    return new Response("ok");
  }
});
