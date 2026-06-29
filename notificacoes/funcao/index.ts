// ════════════════════════════════════════════════════════════
// dichava.rd — Edge Function "notificar"
// Roda 1x/dia (cron). Para cada aparelho inscrito, calcula a
// mensagem de cuidado do dia (por substância, meta e registros)
// e envia push. Conteúdo no tom do app: sem julgamento.
// Deploy:  supabase functions deploy notificar --no-verify-jwt
// ════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@dichava.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// ───────────── MOTOR DE CONTEÚDO ─────────────
// Linha do tempo por substância. `d` = dias desde o último uso.
// Cada marco dispara UMA vez (controlado pelo push_log).
type Msg = { d: number; t: string; b: string };
const TL: Record<string, Msg[]> = {
  "Cannabis": [
    { d: 1, t: "Primeiro dia 🌱", b: "Sono pode vir estranho e sonhos mais vívidos nos primeiros dias. É temporário e faz parte." },
    { d: 2, t: "Dia 2 — segue firme", b: "Irritação, menos apetite ou inquietação podem aparecer agora. Hidrate, coma algo leve e respire." },
    { d: 3, t: "Pico da adaptação 🔁", b: "Por volta de 2–3 dias os sintomas costumam dar o pico — e a partir daqui tendem a aliviar." },
    { d: 7, t: "Uma semana! 🌿", b: "Sono e apetite começam a se reorganizar. Você atravessou a parte mais intensa." },
    { d: 14, t: "Duas semanas ✨", b: "Foco e humor tendem a estabilizar. Repare em pequenas mudanças no seu dia." },
    { d: 30, t: "Um mês 💚", b: "Seja qual for seu objetivo, chegar aqui é um marco. Orgulho do seu ritmo." },
  ],
  "Álcool": [
    { d: 1, t: "Primeiras 24h 💧", b: "Hidrate bem e capriche no sono. Sudorese e ansiedade leve podem aparecer — é o corpo se ajustando." },
    { d: 2, t: "Dia 2 — atenção ao corpo", b: "Se houver tremores fortes, suor intenso ou confusão, procure ajuda médica. Cuidar é também pedir apoio." },
    { d: 3, t: "Sono voltando 🌙", b: "Por volta de 3 dias o sono costuma melhorar. Evite cafeína à noite pra ajudar." },
    { d: 7, t: "Uma semana 🌟", b: "Energia e disposição tendem a subir. Beba água e celebre essa semana." },
    { d: 14, t: "Duas semanas 💛", b: "Pele, digestão e humor agradecem. Você está cuidando de você." },
    { d: 30, t: "Um mês 🏆", b: "Um mês fazendo diferente. Que jornada — no seu tempo." },
  ],
  "Tabaco": [
    { d: 1, t: "Primeiro dia 🚭", b: "A fissura vem em ondas de poucos minutos e passa. Água, respiração e mãos ocupadas ajudam muito." },
    { d: 3, t: "Pico da nicotina", b: "Dias 2–3 costumam ser os mais difíceis pra ansiedade. A partir daqui melhora — segura a onda." },
    { d: 7, t: "Uma semana sem 🌬️", b: "Paladar e olfato começam a voltar. Pulmões já agradecem." },
    { d: 14, t: "Duas semanas", b: "Respirar tende a ficar mais fácil. A vontade aparece menos vezes." },
    { d: 30, t: "Um mês 💚", b: "Circulação e fôlego melhoram bastante em um mês. Mandou muito bem." },
  ],
  "Cocaína": [
    { d: 1, t: "Primeiro dia 💚", b: "Cansaço, fome e sono a mais são comuns na 'descida'. Descanse sem culpa — o corpo está repondo." },
    { d: 2, t: "Dia 2 — gentileza", b: "Humor baixo e desânimo podem bater agora. Comida de verdade, sol e alguém de confiança ajudam." },
    { d: 4, t: "Vai aliviando", b: "Por volta do 4º dia a energia começa a voltar. Vá com calma com cafeína e sono." },
    { d: 7, t: "Uma semana 🌟", b: "Ânimo e foco tendem a melhorar. Repare no que te fez bem essa semana." },
    { d: 14, t: "Duas semanas ✨", b: "A vontade costuma ficar mais espaçada. Lembre seus gatilhos e seus planos." },
    { d: 30, t: "Um mês 🏆", b: "Um mês é uma baita conquista. Orgulho de você." },
  ],
  "Crack": [
    { d: 1, t: "Primeiro dia 💚", b: "Exaustão e muita vontade de dormir são esperadas. Descanse e hidrate — você merece esse cuidado." },
    { d: 2, t: "Dia 2 — não está sozinho(a)", b: "A fissura pode vir forte. Ela tem pico e fim. Se puder, fique perto de alguém de confiança." },
    { d: 4, t: "Atravessando", b: "O corpo vai reencontrando o ritmo. Pequenas rotinas (comer, dormir, andar) ajudam muito." },
    { d: 7, t: "Uma semana 🌟", b: "Sete dias. Cada um deles foi uma escolha de cuidado. Segue no seu passo." },
    { d: 14, t: "Duas semanas", b: "Ânimo e sono tendem a melhorar. Apoio profissional pode somar muito agora." },
    { d: 30, t: "Um mês 🏆", b: "Um mês. Que travessia. Orgulho imenso do seu caminho." },
  ],
  "MDMA": [
    { d: 1, t: "Dia seguinte 💧", b: "Hidrate (sem exagero) e durma bem. Hoje o ânimo pode estar baixo — é a química se reequilibrando." },
    { d: 2, t: "'Terça-feira azul' 💙", b: "Humor pra baixo nos 2–3 dias seguintes é comum. Comida boa, sol e descanso aceleram a recuperação." },
    { d: 4, t: "Reequilibrando", b: "A serotonina vai voltando ao normal. Vá com calma e seja gentil consigo." },
    { d: 7, t: "Uma semana 🌟", b: "Ânimo tende a normalizar. Bom momento pra refletir sobre como foi e o que cuidar." },
    { d: 30, t: "Um mês 💚", b: "Espaçar é cuidar: dar tempo ao corpo reduz riscos. Você está no controle do seu ritmo." },
  ],
  "LSD": [
    { d: 1, t: "Dia seguinte 🌈", b: "Cansaço mental é normal após uma viagem. Descanse e dê tempo pra integrar o que viveu." },
    { d: 2, t: "Integração 📝", b: "Escrever ou conversar sobre a experiência ajuda a dar sentido. Sem pressa." },
    { d: 7, t: "Uma semana", b: "A tolerância zera rápido, mas espaçar protege a profundidade e a segurança. Cuide do set & setting." },
  ],
  "Cogumelo": [
    { d: 1, t: "Dia seguinte 🍄", b: "Pode rolar um cansaço leve e introspecção. Descanse e anote insights enquanto estão frescos." },
    { d: 2, t: "Integração 📝", b: "Dar sentido ao que veio é parte da experiência. Conversar com alguém de confiança ajuda." },
    { d: 7, t: "Uma semana", b: "Espaçar mantém a experiência significativa e mais segura. Vá no seu tempo." },
  ],
  "Ketamina": [
    { d: 1, t: "Dia seguinte 💧", b: "Hidrate e descanse. Atenção à bexiga e ao trato urinário — sinais de dor pedem pausa e avaliação." },
    { d: 3, t: "Cuidando do corpo", b: "Uso frequente sobrecarrega bexiga e rins. Espaçar bastante é o cuidado principal aqui." },
    { d: 7, t: "Uma semana", b: "Dar intervalos longos protege seu corpo. Repare em como você se sente sem." },
  ],
  "Opioide": [
    { d: 1, t: "Primeiras 24h 💚", b: "Sintomas de abstinência (dores, agitação, mal-estar) podem começar agora. Você não está sozinho(a)." },
    { d: 2, t: "Dia 2 — segurança", b: "O pico costuma ser entre 1–3 dias. Hidrate. Tenha naloxona por perto e nunca use sozinho(a) se recair." },
    { d: 3, t: "Pico difícil 🤝", b: "Geralmente é a fase mais pesada — e ela passa. Apoio médico pode aliviar muito os sintomas." },
    { d: 5, t: "Aliviando", b: "Os sintomas físicos tendem a ceder a partir daqui. Sono e apetite vão voltando aos poucos." },
    { d: 7, t: "Uma semana 🌟", b: "Sete dias atravessados. Lembre: tolerância cai rápido — recair na dose antiga é perigoso." },
    { d: 30, t: "Um mês 🏆", b: "Um mês. Travessia enorme. Cuidado contínuo e apoio fazem toda diferença." },
  ],
  "Benzodiaz.": [
    { d: 1, t: "Atenção e cuidado ⚠️", b: "Parar benzodiazepínico de repente pode ser arriscado. O ideal é reduzir aos poucos com apoio profissional." },
    { d: 3, t: "Vá com apoio", b: "Ansiedade e insônia 'rebote' são comuns. Se for difícil, fale com quem te acompanha sobre o ritmo da redução." },
    { d: 7, t: "Uma semana", b: "Cada passo conta. Sono pode demorar a regular — paciência e acompanhamento são seus aliados." },
    { d: 30, t: "Um mês 💚", b: "Reduzir benzo é um processo longo e válido. Orgulho de cada etapa sua." },
  ],
  "Ayahuasca": [
    { d: 1, t: "Dia seguinte 🌿", b: "Corpo e emoções pedem descanso e leveza hoje. Comida simples e silêncio ajudam a assentar." },
    { d: 3, t: "Integração 📝", b: "O que essa experiência te mostrou? Anotar e conversar ajuda a levar isso pra vida." },
    { d: 7, t: "Uma semana", b: "Integração é um processo. Respeite o tempo de assentar antes de uma próxima vez." },
  ],
  "Cafeína": [
    { d: 1, t: "Primeiro dia ☕", b: "Dor de cabeça e sono podem aparecer ao reduzir cafeína. Hidrate e vá diminuindo aos poucos." },
    { d: 3, t: "Pico do ajuste", b: "Por volta de 2–3 dias a dor de cabeça costuma dar o pico — e melhora logo depois." },
    { d: 7, t: "Uma semana", b: "Energia natural e sono tendem a melhorar. Repare na diferença ao acordar." },
  ],
  "Outra": [
    { d: 1, t: "Primeiro dia 💚", b: "Seja gentil com o corpo hoje: água, sono e comida de verdade. O ajuste faz parte." },
    { d: 3, t: "Atravessando", b: "Os primeiros dias costumam ser os mais difíceis. Você está cuidando de você." },
    { d: 7, t: "Uma semana 🌟", b: "Sete dias no seu ritmo. Repare no que te fez bem." },
    { d: 30, t: "Um mês 🏆", b: "Um mês é um baita marco — do seu jeito, no seu tempo." },
  ],
};

// Mensagens por META (objetivo do app) — reforço quando não há marco de substância
const META_MSG: Record<string, Msg[]> = {
  acompanhar: [
    { d: 0, t: "Como foi seu dia? 📓", b: "Um registro rápido te ajuda a enxergar padrões — sem certo ou errado." },
  ],
  reduzir: [
    { d: 0, t: "No seu ritmo 📉", b: "Reduzir é um processo. Que tal registrar como está sendo hoje?" },
  ],
  parar: [
    { d: 0, t: "Um dia de cada vez 🌱", b: "Você está construindo algo grande. Como está se sentindo hoje?" },
  ],
  rd: [
    { d: 0, t: "Cuidar é se informar 🛡️", b: "Se for usar hoje, lembre do básico: hidrate, não use sozinho(a) e espace as doses." },
  ],
};

// ───────────── HELPERS ─────────────
function hojeTZ(tz: string): string {
  try { return new Date().toLocaleDateString("en-CA", { timeZone: tz }); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function diasEntre(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime();
  const db = new Date(b + "T12:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

Deno.serve(async (req) => {
  // proteção simples por segredo (?key= ou header x-cron-secret)
  if (CRON_SECRET) {
    const u = new URL(req.url);
    const k = req.headers.get("x-cron-secret") || u.searchParams.get("key");
    if (k !== CRON_SECRET) return new Response("forbidden", { status: 403 });
  }

  const { data: subs } = await sb.from("push_subs").select("*");
  if (!subs?.length) return new Response(JSON.stringify({ ok: true, enviados: 0 }), { headers: { "content-type": "application/json" } });

  let enviados = 0;

  for (const s of subs) {
    const tz = s.tz || "America/Sao_Paulo";
    const hoje = hojeTZ(tz);

    // carrega os dados do usuário (mesmo blob que o app sincroniza)
    const { data: row } = await sb.from("registros").select("dados").eq("user_id", s.user_id).maybeSingle();
    const dados = row?.dados || {};
    let regs: any[] = [];
    let obj: any = null;
    try { regs = JSON.parse(dados["dr_r_" + s.user_id] || "[]"); } catch { regs = []; }
    try { obj = JSON.parse(dados["dr_o_" + s.user_id] || "null"); } catch { obj = null; }

    // monta a mensagem candidata (no máximo 1 por execução)
    let pick: { k: string; t: string; b: string } | null = null;

    // 1) marcos por substância (prioridade)
    const porSub: Record<string, string> = {};
    for (const r of regs) {
      if (!r?.substancia || !r?.data) continue;
      if (!porSub[r.substancia] || r.data > porSub[r.substancia]) porSub[r.substancia] = r.data;
    }
    for (const [sub, ultima] of Object.entries(porSub)) {
      const dias = diasEntre(ultima, hoje);
      const tl = TL[sub];
      if (!tl) continue;
      const hit = tl.find((m) => m.d === dias);
      if (hit) { pick = { k: `tl:${sub}:${hit.d}`, t: hit.t, b: hit.b }; break; }
    }

    // 2) sem marco hoje? lembrete de registro / meta (a cada poucos dias)
    if (!pick) {
      const registrouHoje = regs.some((r) => r.data === hoje);
      const goal = obj?.goal || s.goal;
      if (!registrouHoje && goal && META_MSG[goal]) {
        // limita a no máx 1 lembrete a cada 3 dias (chave com semana/dia)
        const bloco = Math.floor(Date.now() / (3 * 86400000));
        const m = META_MSG[goal][0];
        pick = { k: `meta:${goal}:${bloco}`, t: m.t, b: m.b };
      }
    }

    if (!pick) continue;

    // dedupe: já enviou essa chave pra esse usuário?
    const { data: jaTem } = await sb.from("push_log").select("id").eq("user_id", s.user_id).eq("k", pick.k).maybeSingle();
    if (jaTem) continue;

    // envia
    const payload = JSON.stringify({ title: pick.t, body: pick.b, url: "./", tag: pick.k });
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      await sb.from("push_log").insert({ user_id: s.user_id, k: pick.k });
      enviados++;
    } catch (err: any) {
      // assinatura expirada/inválida → remove
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados }), { headers: { "content-type": "application/json" } });
});
