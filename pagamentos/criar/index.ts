// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "pagamento-criar"
// Cria um checkout no PagBank e devolve o link de pagamento.
// O app chama com { user_id, email, nome, plano }.
// Deploy:  supabase functions deploy pagamento-criar --no-verify-jwt
// Secrets: PAGBANK_TOKEN, PAGBANK_BASE (opcional), SITE_URL, PAGBANK_WEBHOOK_URL
// ════════════════════════════════════════════════════════════
const PAGBANK_TOKEN = Deno.env.get("PAGBANK_TOKEN")!;
const PAGBANK_BASE  = Deno.env.get("PAGBANK_BASE")  || "https://api.pagseguro.com"; // sandbox: https://sandbox.api.pagseguro.com
const SITE_URL      = Deno.env.get("SITE_URL")      || "https://dichava.app";
const WEBHOOK_URL   = Deno.env.get("PAGBANK_WEBHOOK_URL") || "";

// preços em CENTAVOS + validade em dias (null = vitalício)
const PLANOS: Record<string, { nome: string; centavos: number; dias: number | null }> = {
  mensal: { nome: "dichava premium — Mensal",    centavos: 1290,  dias: 30  },
  anual:  { nome: "dichava premium — Anual",     centavos: 9990,  dias: 365 },
  vita:   { nome: "dichava premium — Vitalício", centavos: 18990, dias: null },
};

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
const json = (o: unknown, s = 200) =>
  cors(new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } }));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  try {
    const { user_id, email, nome, plano } = await req.json();
    const p = PLANOS[plano];
    if (!user_id || !p) return json({ error: "dados inválidos" }, 400);

    // Checkout do PagBank (pagina hospedada: cartão, Pix e boleto)
    const body: Record<string, unknown> = {
      reference_id: `${user_id}|${plano}`,
      customer_modifiable: true,
      customer: { name: nome || undefined, email: email || undefined },
      items: [{ reference_id: plano, name: p.nome, quantity: 1, unit_amount: p.centavos }],
      payment_methods: [
        { type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" },
      ],
      redirect_url: `${SITE_URL}/?pago=1`,
    };
    if (WEBHOOK_URL) body.notification_urls = [WEBHOOK_URL];

    const r = await fetch(`${PAGBANK_BASE}/checkouts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAGBANK_TOKEN}`,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    console.log("PagBank base:", PAGBANK_BASE, "status:", r.status, "resp:", JSON.stringify(data));
    if (!r.ok) return json({ error: "pagbank", status: r.status, detail: data }, 400);

    const link = (data.links || []).find((l: any) =>
      String(l.rel || "").toUpperCase() === "PAY");
    if (!link) console.log("Sem link PAY. links:", JSON.stringify(data.links || []));
    return json({ pay_url: link?.href || null, checkout_id: data.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
