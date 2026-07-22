// ════════════════════════════════════════════════════════════
// dichava.app — Edge Function "evolucao-ia"
// Organiza o rascunho clínico do profissional nos campos do prontuário
// (queixa, objetivos, evolução, intervenções, recursos, pontos, plano)
// usando a Claude. A chave da API fica AQUI (secret) — nunca no navegador.
//
// LGPD: recebe SÓ o texto clínico. O painel NÃO envia nome/CPF/telefone do
// paciente. A IA apenas organiza; o profissional revisa e salva (controlador).
//
// Deploy:  supabase functions deploy evolucao-ia
//          (SEM --no-verify-jwt: só usuário logado pode chamar)
// Secrets: ANTHROPIC_API_KEY  (crie em console.anthropic.com)
//          SUPABASE_URL e SUPABASE_ANON_KEY já existem por padrão
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Campos que a IA devolve — batem 1:1 com o formulário do prontuário.
const SCHEMA = {
  type: "object",
  properties: {
    queixa: { type: "string", description: "Queixa do dia / foco central da sessão." },
    objetivos: { type: "string", description: "Objetivos trabalhados na sessão/atendimento." },
    evolucao: { type: "string", description: "Registro clínico / evolução: o conteúdo do atendimento, redigido de forma organizada e profissional." },
    intervencoes: { type: "string", description: "Intervenções, técnicas, procedimentos e condutas realizadas." },
    recursos: { type: "string", description: "Recursos usados: materiais, escalas, exames, instrumentos." },
    pontos: { type: "string", description: "Pontos de atenção: riscos, alertas, sinais a acompanhar." },
    plano: { type: "string", description: "Plano para a próxima sessão: encaminhamentos, tarefas, próximos passos." },
  },
  required: ["queixa", "objetivos", "evolucao", "intervencoes", "recursos", "pontos", "plano"],
  additionalProperties: false,
};

const SYSTEM = `Você é um assistente de documentação clínica para profissionais de saúde no Brasil.
Recebe um rascunho solto (anotações rápidas de uma sessão) e o organiza nos campos de um prontuário.

Regras:
- Escreva em português do Brasil, em tom clínico, claro e objetivo.
- Seja FIEL ao rascunho. NÃO invente sintomas, diagnósticos, condutas ou dados que não estejam no texto.
- Não faça diagnóstico nem julgamento — apenas organize o que o profissional escreveu.
- Se não houver informação para um campo, deixe-o como string vazia ("").
- Não inclua nome, CPF ou dados que identifiquem o paciente, mesmo que apareçam no rascunho.
- O campo "evolucao" é o registro principal; distribua o restante nos campos apropriados sem repetir tudo.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método inválido" }, 405);

  try {
    if (!ANTHROPIC_KEY) return json({ error: "IA não configurada no servidor." }, 500);

    // Só usuário logado pode gastar a API. (O gateway já exige JWT; aqui
    // confirmamos e registramos quem chamou.)
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Não autorizado." }, 401);

    const body = await req.json().catch(() => ({}));
    const texto = (body?.texto || "").toString().trim();
    const contexto = (body?.contexto || "").toString().trim(); // ex.: especialidade (opcional)
    if (texto.length < 3) return json({ error: "Escreva algumas anotações antes de organizar." }, 400);

    const userMsg = (contexto ? `Especialidade do profissional: ${contexto}\n\n` : "") +
      `Rascunho do atendimento:\n${texto}`;

    // Chamada direta à API (fetch) — mantém a função leve e sem depender da
    // versão do SDK npm no runtime de edge. Saída estruturada = mapeia nos campos.
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      console.error("evolucao-ia: Anthropic", r.status, errTxt.slice(0, 300));
      return json({ error: "A IA está indisponível no momento. Tente novamente." }, 502);
    }

    const data = await r.json();
    if (data?.stop_reason === "refusal") {
      return json({ error: "A IA não pôde processar este conteúdo." }, 422);
    }
    const outText = (data?.content || []).find((b: any) => b.type === "text")?.text || "{}";
    let campos: any = {};
    try { campos = JSON.parse(outText); } catch (_) { campos = {}; }

    console.log("evolucao-ia: ok · user", user.id, "· in", texto.length, "chars");
    return json({ campos });
  } catch (e) {
    console.error("evolucao-ia erro:", e);
    return json({ error: "Erro ao organizar a nota." }, 500);
  }
});
