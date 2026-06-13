// Vercel Node runtime — Groq API (OpenAI-compatible)
// Fluxo em 2 chamadas:
//   1) PLANO  — JSON com capítulos/subcapítulos personalizados
//   2) CORPO  — desenvolvimento de TODOS os subcapítulos numa só resposta,
//               delimitados por blocos [[SUB:x.y]] ... [[/SUB:x.y]]
// Depois há uma camada de pós-processamento que limpa repetições, junta
// parágrafos curtos, garante subtítulos em linha própria e normaliza hierarquia.

import type { IncomingMessage, ServerResponse } from "http";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

interface WorkFormPayload {
  educationLevel: string;
  workType: string;
  area: string;
  theme: string;
  description?: string;
  pages: string;
  languagePtBr: boolean;
  languageEn: boolean;
  style?: string;
  tone?: string;
  pdfName?: string;
  pdfText?: string;
}

interface SubPlan { id: string; titulo: string; targetWords: number; }
interface ChapterPlan { id: string; titulo: string; subs: SubPlan[]; }
interface WorkPlan {
  titulo: string;
  palavrasChave: string[];
  resumo: string;
  objetivoGeral: string;
  objetivosEspecificos: string[];
  capitulos: ChapterPlan[];
}

// ---------- Groq helper ----------
async function callGroq(apiKey: string, messages: any[], opts: { temperature?: number; max_tokens?: number; json?: boolean } = {}) {
  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 4000,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err: any = new Error(`Groq ${resp.status}: ${text.slice(0, 400)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

// ---------- Etapa 1: PLANO ----------
function depthFor(level: string): string {
  const l = (level || "").toLowerCase();
  if (l.includes("mestr") || l.includes("doutor")) return "muito elevada (mestrado): teoria avançada, autores de referência, discussão crítica, metodologia explícita";
  if (l.includes("licen") || l.includes("universit") || l.includes("superior")) return "elevada (licenciatura): fundamentação teórica sólida, autores clássicos e contemporâneos, análise crítica";
  if (l.includes("técn") || l.includes("tecn") || l.includes("médio") || l.includes("medio")) return "intermédia (técnico/médio): conceitos claros, exemplos práticos, aplicações reais";
  return "introdutória (secundário): linguagem clara, definições objectivas, exemplos do quotidiano";
}

async function generatePlan(apiKey: string, body: WorkFormPayload, pages: number): Promise<WorkPlan> {
  const totalWords = pages * 300;
  const devWords = Math.round(totalWords * 0.70);
  const subCount = Math.max(4, Math.min(12, Math.ceil(pages / 1.5)));

  const prompt = `Cria um PLANO académico DETALHADO em JSON puro (sem markdown, sem comentários) para um trabalho sobre o tema indicado.

CONTEXTO:
- Nível: ${body.educationLevel} — profundidade ${depthFor(body.educationLevel)}
- Tipo de trabalho: ${body.workType}
- Área/disciplina: ${body.area}
- Tema: ${body.theme}
- Descrição/foco: ${body.description || "(não fornecido)"}
- Total de páginas alvo: ${pages} (≈ ${totalWords} palavras)
- Idioma: português de Portugal${body.languageEn ? " + inglês" : ""}

ESTRUTURA OBRIGATÓRIA do JSON (usa EXACTAMENTE estas chaves):
{
  "titulo": "Título académico claro e específico (NÃO genérico)",
  "palavrasChave": ["4 a 6 palavras-chave reais e específicas"],
  "resumo": "Resumo académico de 150-220 palavras em UM parágrafo, contextualizando o problema, objectivo, metodologia e principais conclusões esperadas.",
  "objetivoGeral": "Uma frase clara começando por verbo no infinitivo (Analisar, Compreender, Avaliar, ...)",
  "objetivosEspecificos": ["3 a 5 objectivos específicos começando por verbo no infinitivo, distintos entre si"],
  "capitulos": [
    { "id": "1", "titulo": "Introdução", "subs": [] },
    { "id": "2", "titulo": "Fundamentação Teórica", "subs": [
      { "id": "2.1", "titulo": "(subcapítulo ESPECÍFICO ao tema, não 'Conceitos gerais')", "targetWords": 350 }
    ]},
    { "id": "3", "titulo": "Metodologia", "subs": [] },
    { "id": "4", "titulo": "Desenvolvimento", "subs": [
      { "id": "4.1", "titulo": "(subcapítulo específico)", "targetWords": 400 }
    ]},
    { "id": "5", "titulo": "Discussão", "subs": [] },
    { "id": "6", "titulo": "Conclusão", "subs": [] },
    { "id": "7", "titulo": "Recomendações", "subs": [] }
  ]
}

REGRAS RÍGIDAS:
- Distribui ≈ ${subCount} subcapítulos no total entre Fundamentação Teórica, Desenvolvimento e Discussão (proporcional ao tema).
- Cada subcapítulo deve ter um título ESPECÍFICO e ÚNICO (nunca "Introdução ao tema", "Conceitos gerais", "Considerações finais"). Deve referir o tema concreto.
- NUNCA repitas títulos de subcapítulos. Cada um aborda um ângulo diferente.
- "targetWords" de cada subcapítulo entre 250 e 600, somando aproximadamente ${devWords} palavras no conjunto dos subcapítulos.
- Capítulos Introdução, Metodologia, Conclusão e Recomendações têm "subs": [].
- Adapta a profundidade dos subcapítulos ao nível académico (${body.educationLevel}).
- Responde APENAS com o JSON, sem \`\`\` nem texto fora dele.`;

  const raw = await callGroq(apiKey, [
    { role: "system", content: "És um planeador académico que devolve SEMPRE JSON válido em português de Portugal." },
    { role: "user", content: prompt },
  ], { temperature: 0.55, max_tokens: 2200, json: true });

  let plan: WorkPlan;
  try {
    plan = JSON.parse(raw);
  } catch {
    // tentar extrair primeiro bloco JSON
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Plano inválido devolvido pela IA.");
    plan = JSON.parse(m[0]);
  }

  // Normalização defensiva
  plan.capitulos = (plan.capitulos || []).map((c) => ({
    id: String(c.id || ""),
    titulo: String(c.titulo || "").trim(),
    subs: (c.subs || []).map((s) => ({
      id: String(s.id || ""),
      titulo: String(s.titulo || "").trim(),
      targetWords: Math.max(200, Math.min(700, Number(s.targetWords) || 350)),
    })),
  }));

  // Remover subcapítulos duplicados (mesmo título)
  const seenTitles = new Set<string>();
  for (const cap of plan.capitulos) {
    cap.subs = cap.subs.filter((s) => {
      const k = s.titulo.toLowerCase().replace(/\s+/g, " ").trim();
      if (!k || seenTitles.has(k)) return false;
      seenTitles.add(k);
      return true;
    });
  }

  return plan;
}

// ---------- Etapa 2: CORPO ----------
async function generateBody(apiKey: string, body: WorkFormPayload, plan: WorkPlan, pages: number): Promise<string> {
  const totalWords = pages * 300;
  const allSubs: { capId: string; capTitulo: string; sub: SubPlan }[] = [];
  for (const cap of plan.capitulos) {
    for (const sub of cap.subs) allSubs.push({ capId: cap.id, capTitulo: cap.titulo, sub });
  }

  const intoWords = Math.round(totalWords * 0.08);
  const metoWords = Math.round(totalWords * 0.06);
  const discWords = Math.round(totalWords * 0.08);
  const concWords = Math.round(totalWords * 0.07);
  const recWords = Math.round(totalWords * 0.04);

  const subList = allSubs
    .map(({ capId, capTitulo, sub }) => `  - [[SUB:${sub.id}]] (cap. ${capId} "${capTitulo}") "${sub.titulo}" → ≈ ${sub.targetWords} palavras`)
    .join("\n");

  const pdfContext = body.pdfText
    ? `\n\nBaseia o conteúdo no seguinte material do utilizador (sintetiza, NÃO copies):\n"""\n${body.pdfText.substring(0, 6000)}\n"""\n`
    : "";

  const prompt = `És um redactor académico de elite. Vais redigir o CORPO de um trabalho seguindo RIGOROSAMENTE o plano abaixo. Profundidade exigida: ${depthFor(body.educationLevel)}.

DADOS:
- Tema: ${body.theme}
- Área: ${body.area}
- Tipo: ${body.workType}
- Idioma: português de Portugal${body.languageEn ? " + inglês onde indicado" : ""}
- Total alvo: ${pages} páginas (≈ ${totalWords} palavras)

PLANO APROVADO (NÃO alterar títulos):
Título: ${plan.titulo}
Objectivo geral: ${plan.objetivoGeral}
Objectivos específicos:
${plan.objetivosEspecificos.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}

Subcapítulos a desenvolver:
${subList}

FORMATO DE RESPOSTA OBRIGATÓRIO — usa EXACTAMENTE estes delimitadores, nada fora deles, sem markdown ``` :

[[INTRODUCAO]]
≈ ${intoWords} palavras, 4-6 parágrafos: contextualização real do tema (com dados/contexto), problema de investigação, justificação da relevância, apresentação dos objectivos (geral e específicos) e descrição breve da metodologia. NÃO repetir o resumo.
[[/INTRODUCAO]]

[[METODOLOGIA]]
≈ ${metoWords} palavras, 3-5 parágrafos: tipo de pesquisa (bibliográfica, qualitativa, etc.), procedimentos de recolha de informação, critérios de selecção das fontes, limitações metodológicas.
[[/METODOLOGIA]]

${allSubs.map(({ sub }) => `[[SUB:${sub.id}]]
Desenvolve "${sub.titulo}" com ≈ ${sub.targetWords} palavras em 3-6 parágrafos completos. Inclui: definições, fundamentação teórica com referência a autores reais e plausíveis, exemplos concretos do mundo real, dados ou contexto histórico relevantes, análise crítica e ligação directa ao tema "${body.theme}". PROIBIDO listar bullets, PROIBIDO repetir ideias já ditas noutros subcapítulos, PROIBIDO escrever só o título.
[[/SUB:${sub.id}]]
`).join("\n")}
[[DISCUSSAO]]
≈ ${discWords} palavras, 3-5 parágrafos: confronta as ideias dos vários subcapítulos, identifica tensões, sintetiza padrões e responde aos objectivos específicos. NÃO repetir frases já usadas.
[[/DISCUSSAO]]

[[CONCLUSAO]]
≈ ${concWords} palavras, 3-5 parágrafos: retoma o objectivo geral, sintetiza os principais achados (sem repetir literalmente), indica limitações do estudo e abre caminhos para investigações futuras.
[[/CONCLUSAO]]

[[RECOMENDACOES]]
≈ ${recWords} palavras, 3-6 recomendações numeradas (1., 2., 3., ...) dirigidas a actores concretos (instituições, profissionais, investigadores). Cada recomendação é um parágrafo curto e accionável.
[[/RECOMENDACOES]]

[[REFERENCIAS]]
${Math.max(8, Math.min(20, pages))} referências REAIS e plausíveis no estilo ${body.style || "APA"}, uma por linha, sem numeração nem bullets, ordenadas alfabeticamente pelo apelido.
[[/REFERENCIAS]]

REGRAS DE ESCRITA (CRÍTICAS):
1. NUNCA repetir ideias entre secções — cada parágrafo acrescenta algo novo.
2. NUNCA escrever vários subtítulos seguidos sem conteúdo entre eles.
3. NUNCA usar bullets/asteriscos para enumerar (excepto em Recomendações com "1.", "2.").
4. Cada parágrafo deve ter pelo menos 60 palavras (excepto recomendações).
5. Linguagem académica formal, sem coloquialismos.
6. Cita autores plausíveis no corpo do texto (Apelido, ano) quando fizer sentido.${pdfContext}`;

  const targetTokens = Math.min(8000, Math.round(totalWords * 1.6) + 1200);

  return await callGroq(apiKey, [
    { role: "system", content: "És um redactor académico profissional. Cumpres rigorosamente delimitadores e mínimos de palavras. Escreves em português de Portugal." },
    { role: "user", content: prompt },
  ], { temperature: 0.72, max_tokens: targetTokens });
}

// ---------- Pós-processamento / Qualidade ----------
function extractBlock(text: string, tag: string): string {
  const re = new RegExp(`\\[\\[${tag.replace(/[.\\+*?()|[\]{}^$]/g, "\\$&")}\\]\\]([\\s\\S]*?)\\[\\[/${tag.replace(/[.\\+*?()|[\]{}^$]/g, "\\$&")}\\]\\]`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function cleanParagraphs(text: string): string {
  if (!text) return "";
  // Remove markdown ```
  let t = text.replace(/^```[a-z]*\n?|\n?```$/gim, "");
  // Normaliza quebras de linha múltiplas
  t = t.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  // Dedup de parágrafos consecutivos idênticos (>= 30 chars)
  const paras = t.split(/\n{2,}/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let p of paras) {
    p = p.trim();
    if (!p) continue;
    const key = p.toLowerCase().replace(/\s+/g, " ").slice(0, 160);
    if (key.length >= 30 && seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  // Fundir parágrafos muito curtos (< 40 chars e que não pareçam título)
  const merged: string[] = [];
  for (const p of out) {
    const looksTitle = /^(#+\s|\*\*.+\*\*$|\d+(\.\d+)*\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/.test(p);
    if (!looksTitle && p.length < 40 && merged.length && !/^(#+\s)/.test(merged[merged.length - 1])) {
      merged[merged.length - 1] = merged[merged.length - 1] + " " + p;
    } else {
      merged.push(p);
    }
  }
  return merged.join("\n\n");
}

function normalizeSubtitlesInline(text: string): string {
  // Garante que "**Título** texto" passa a "**Título**\n\ntexto"
  return text.replace(/^\s*\*\*([^*\n]+)\*\*\s+(?=\S)/gm, "**$1**\n\n");
}

function buildDevelopmentSection(plan: WorkPlan, body: string): string {
  const parts: string[] = [];
  for (const cap of plan.capitulos) {
    // só renderizamos Fundamentação Teórica, Desenvolvimento e Discussão (capítulos com subs)
    if (!cap.subs.length) continue;
    parts.push(`## ${cap.id} ${cap.titulo}`);
    for (const sub of cap.subs) {
      const content = cleanParagraphs(normalizeSubtitlesInline(extractBlock(body, `SUB:${sub.id}`)));
      parts.push(`### ${sub.id} ${sub.titulo}`);
      parts.push(content || `_(Conteúdo não gerado para este subcapítulo — regenere o trabalho.)_`);
    }
  }
  return parts.join("\n\n");
}

function buildIndex(plan: WorkPlan): string {
  const lines: string[] = [];
  for (const cap of plan.capitulos) {
    lines.push(`${cap.id}. ${cap.titulo}`);
    for (const sub of cap.subs) lines.push(`    ${sub.id} ${sub.titulo}`);
  }
  lines.push(`${plan.capitulos.length + 1}. Referências Bibliográficas`);
  return lines.join("\n");
}

function buildResumoBlock(plan: WorkPlan): string {
  const kw = plan.palavrasChave?.length ? `\n\n**Palavras-chave:** ${plan.palavrasChave.join("; ")}.` : "";
  const obj = `\n\n**Objectivo geral:** ${plan.objetivoGeral}\n\n**Objectivos específicos:**\n${plan.objetivosEspecificos.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
  return `${plan.resumo}${kw}${obj}`;
}

function parseReferences(refsBlock: string): string[] {
  if (!refsBlock) return [];
  return refsBlock
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\-\*\d\.\)\s]+/, "").trim())
    .filter((l) => l.length > 10);
}

// ---------- Handler ----------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY não configurada no servidor." });

  const body = req.body as WorkFormPayload;
  if (!body?.theme || !body?.area || !body?.workType) {
    return res.status(400).json({ error: "Campos obrigatórios em falta." });
  }

  const pages = Math.max(1, Math.min(120, Number(body.pages) || 5));

  try {
    // Etapa 1
    const plan = await generatePlan(GROQ_API_KEY, body, pages);
    if (!plan?.capitulos?.length) throw new Error("Plano inválido (sem capítulos).");

    // Etapa 2
    const bodyText = await generateBody(GROQ_API_KEY, body, plan, pages);

    // Pós-processamento
    const introducao = cleanParagraphs(normalizeSubtitlesInline(extractBlock(bodyText, "INTRODUCAO")));
    const metodologia = cleanParagraphs(normalizeSubtitlesInline(extractBlock(bodyText, "METODOLOGIA")));
    const desenvolvimento = buildDevelopmentSection(plan, bodyText);
    const discussao = cleanParagraphs(normalizeSubtitlesInline(extractBlock(bodyText, "DISCUSSAO")));
    const conclusao = cleanParagraphs(normalizeSubtitlesInline(extractBlock(bodyText, "CONCLUSAO")));
    const recomendacoes = cleanParagraphs(normalizeSubtitlesInline(extractBlock(bodyText, "RECOMENDACOES")));
    const referencias = parseReferences(extractBlock(bodyText, "REFERENCIAS"));

    // Combinar tudo o que vai para "Desenvolvimento" no formato esperado pelo Result.tsx
    const fullDev = [
      desenvolvimento,
      discussao ? `## Discussão\n\n${discussao}` : "",
      recomendacoes ? `## Recomendações\n\n${recomendacoes}` : "",
    ].filter(Boolean).join("\n\n");

    const academicWork = {
      title: plan.titulo || `${body.workType} em ${body.area}: ${body.theme}`,
      summary: plan.resumo,
      sections: [
        { heading: "Índice", content: buildIndex(plan) },
        { heading: "Resumo", content: buildResumoBlock(plan) },
        { heading: "Introdução", content: introducao || "_(Introdução não gerada — regenere.)_" },
        {
          heading: "Desenvolvimento",
          content: [
            metodologia ? `## Metodologia\n\n${metodologia}` : "",
            fullDev,
          ].filter(Boolean).join("\n\n"),
        },
        { heading: "Conclusão", content: conclusao || "_(Conclusão não gerada — regenere.)_" },
      ],
      references: referencias.length ? referencias : ["Adicione aqui as referências bibliográficas com base nas fontes que utilizou."],
    };

    return res.status(200).json({ work: academicWork });
  } catch (error: any) {
    console.error("generate-work error", error);
    const status = error?.status === 429 ? 429 : error?.status === 401 ? 401 : 500;
    const msg = error?.status === 429
      ? "Limite de pedidos atingido. Tente novamente em instantes."
      : error?.status === 401
      ? "GROQ_API_KEY inválida. Verifique a chave no Vercel."
      : error?.message || "Erro interno ao gerar o trabalho.";
    return res.status(status).json({ error: msg });
  }
}
