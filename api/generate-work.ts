// Vercel Node runtime — Groq API (OpenAI-compatible)
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

// Extrai conteúdo entre delimitadores [[SECTION:NAME]] ... [[/SECTION:NAME]]
function extractBlock(text: string, name: string): string {
  const re = new RegExp(`\\[\\[SECTION:${name}\\]\\]([\\s\\S]*?)\\[\\[/SECTION:${name}\\]\\]`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

// Fallback baseado em cabeçalhos quando os delimitadores falham
function fallbackHeaderSplit(text: string) {
  const buckets = { indice: "", resumo: "", intro: "", dev: "", concl: "", refs: "" };
  const re = /^\s*(?:\*\*|##?\s*)?\s*(ÍNDICE|INDICE|RESUMO|INTRODUÇÃO|INTRODUCAO|DESENVOLVIMENTO|CONCLUSÃO|CONCLUSAO|REFERÊNCIAS|REFERENCIAS|BIBLIOGRAFIA)\s*(?:\*\*)?\s*:?\s*$/gim;
  const matches: Array<{ key: keyof typeof buckets; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const up = m[1].toUpperCase();
    let key: keyof typeof buckets = "intro";
    if (up.startsWith("ÍND") || up.startsWith("IND")) key = "indice";
    else if (up.startsWith("RES")) key = "resumo";
    else if (up.startsWith("INTR")) key = "intro";
    else if (up.startsWith("DES")) key = "dev";
    else if (up.startsWith("CON")) key = "concl";
    else key = "refs";
    matches.push({ key, start: m.index + m[0].length, end: -1 });
    if (matches.length > 1) matches[matches.length - 2].end = m.index;
  }
  if (matches.length) matches[matches.length - 1].end = text.length;
  for (const mt of matches) buckets[mt.key] = text.slice(mt.start, mt.end).trim();
  return buckets;
}

function parseAcademicWork(text: string, body: WorkFormPayload) {
  // Primeiro: tentar delimitadores explícitos
  let indice = extractBlock(text, "INDICE");
  let resumo = extractBlock(text, "RESUMO");
  let intro = extractBlock(text, "INTRODUCAO");
  let dev = extractBlock(text, "DESENVOLVIMENTO");
  let concl = extractBlock(text, "CONCLUSAO");
  let refsBlock = extractBlock(text, "REFERENCIAS");

  // Fallback se nada veio com delimitadores
  if (!resumo && !intro && !dev && !concl) {
    const b = fallbackHeaderSplit(text);
    indice = indice || b.indice;
    resumo = resumo || b.resumo;
    intro = intro || b.intro;
    dev = dev || b.dev;
    concl = concl || b.concl;
    refsBlock = refsBlock || b.refs;
  }

  // Se mesmo assim não houver desenvolvimento mas a introdução estiver muito grande,
  // assume que tudo veio junto e devolve o texto cru no desenvolvimento.
  if (!dev && intro && intro.length > 2500) {
    dev = intro;
    intro = "";
  }
  if (!dev && !intro && !resumo && !concl) {
    dev = text.trim();
  }

  const refs = refsBlock
    ? refsBlock
        .split(/\r?\n/)
        .map((l) => l.replace(/^[\-\*\d\.\)\s]+/, "").trim())
        .filter(Boolean)
    : [];

  const summary = resumo ||
    `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`;

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary,
    sections: [
      { heading: "Índice", content: indice },
      { heading: "Resumo", content: resumo },
      { heading: "Introdução", content: intro },
      { heading: "Desenvolvimento", content: dev },
      { heading: "Conclusão", content: concl },
    ],
    references: refs.length ? refs : ["Adicione aqui as referências bibliográficas com base nas fontes que utilizou."],
  };
}

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

  const language = body.languageEn ? "en" : "pt-PT";
  const pdfContext = body.pdfText
    ? `\n\nBaseia o trabalho no seguinte conteúdo extraído de um PDF do utilizador. NÃO copies palavra por palavra; sintetiza e organiza academicamente:\n"""\n${body.pdfText.substring(0, 8000)}\n"""\n`
    : "";

  const pages = Math.max(1, Math.min(120, Number(body.pages) || 5));
  const totalWords = pages * 300;
  const introWords = Math.round(totalWords * 0.12);
  const devWords = Math.round(totalWords * 0.65);
  const conclWords = Math.round(totalWords * 0.10);
  const resumoWords = Math.min(350, Math.round(totalWords * 0.05));
  const devSubs = Math.max(3, Math.min(10, Math.ceil(pages / 2)));
  const wordsPerSub = Math.round(devWords / devSubs);
  const targetTokens = Math.min(8000, Math.round(totalWords * 1.6) + 700);

  const prompt = `És um redactor académico profissional. Vais escrever um trabalho COMPLETO em ${language} sobre o tema indicado, com extensão proporcional a ${pages} páginas A4 (≈ ${totalWords} palavras).

REGRA CRÍTICA DE FORMATAÇÃO — usa EXACTAMENTE estes delimitadores em maiúsculas. NÃO os traduzas, NÃO acrescentes outros. NADA fora dos blocos.

[[SECTION:INDICE]]
1. Resumo
2. Introdução
3. Desenvolvimento
   3.1 (título do subtítulo 1)
   3.2 (título do subtítulo 2)
   ...
4. Conclusão
5. Referências Bibliográficas
[[/SECTION:INDICE]]

[[SECTION:RESUMO]]
Resumo académico de ≈ ${resumoWords} palavras em texto corrido (1 parágrafo).
[[/SECTION:RESUMO]]

[[SECTION:INTRODUCAO]]
≈ ${introWords} palavras em 3-5 parágrafos: contextualização, problema, justificativa, objectivo geral e específicos, metodologia.
[[/SECTION:INTRODUCAO]]

[[SECTION:DESENVOLVIMENTO]]
Parte mais LONGA: ≈ ${devWords} palavras. Divide em ${devSubs} subtítulos numerados (3.1, 3.2, ...). Para CADA subtítulo escreve OBRIGATORIAMENTE ≈ ${wordsPerSub} palavras (3-6 parágrafos completos) com fundamentação teórica, definições, exemplos, análise crítica e ligação ao tema. Formato de cada subtítulo:

**3.1 Título do subtítulo**

Parágrafo 1...

Parágrafo 2...

Parágrafo 3...

PROIBIDO escrever só o subtítulo sem desenvolver. PROIBIDO listar bullets em vez de parágrafos.
[[/SECTION:DESENVOLVIMENTO]]

[[SECTION:CONCLUSAO]]
≈ ${conclWords} palavras em 3-5 parágrafos: retoma objectivos, sintetiza resultados, indica limitações e investigações futuras.
[[/SECTION:CONCLUSAO]]

[[SECTION:REFERENCIAS]]
${Math.max(5, Math.min(15, pages))} referências reais e plausíveis no estilo ${body.style || "APA"}, uma por linha, sem numeração nem bullets.
[[/SECTION:REFERENCIAS]]

DADOS DO TRABALHO:
- Nível de ensino: ${body.educationLevel}
- Tipo: ${body.workType}
- Área: ${body.area}
- Tema: ${body.theme}${body.description ? `\n- Descrição/foco: ${body.description}` : ""}
- Páginas pedidas: ${pages} (≈ ${totalWords} palavras totais)
- Tom: formal académico em português de Portugal${body.languageEn ? " e inglês" : ""}

LEMBRA-TE: usa SEMPRE os 6 blocos [[SECTION:...]] ... [[/SECTION:...]] exactamente como acima. Não inventes nomes, não traduzas os delimitadores, não escrevas texto fora deles. Cumpre os mínimos de palavras de cada secção.
${pdfContext}`;

  try {
    const aiResp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "És um assistente que produz trabalhos académicos completos, longos e bem estruturados em português de Portugal, respeitando rigorosamente os delimitadores [[SECTION:...]] pedidos pelo utilizador." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: targetTokens,
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Groq error", aiResp.status, errorText);
      if (aiResp.status === 429) return res.status(429).json({ error: "Limite de pedidos atingido. Tente novamente em instantes." });
      if (aiResp.status === 401) return res.status(401).json({ error: "GROQ_API_KEY inválida. Verifique a chave no Vercel." });
      return res.status(500).json({ error: `Groq ${aiResp.status}: ${errorText.slice(0, 400)}` });
    }

    const data = await aiResp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) return res.status(500).json({ error: "Resposta vazia da IA." });

    const academicWork = parseAcademicWork(text, body);
    return res.status(200).json({ work: academicWork });
  } catch (error) {
    console.error("generate-work error", error);
    return res.status(500).json({ error: "Erro interno ao gerar o trabalho." });
  }
}
