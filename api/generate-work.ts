// Vercel Node runtime — Groq API (OpenAI-compatible)
import type { IncomingMessage, ServerResponse } from "http";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Modelo Groq activo. Se a Groq descontinuar, trocar por outro de https://console.groq.com/docs/models
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

function stripHeadingMarkup(line: string): string {
  // Remove markdown (**, ##, #), numeração (1., 1), I., II.), bullets e espaços
  return line
    .replace(/^[#>\-\*\s]+/, "")
    .replace(/\*+/g, "")
    .replace(/^\s*([IVX]+|\d+)[\.\)]\s*/i, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function detectSection(line: string): "indice" | "resumo" | "intro" | "dev" | "concl" | "refs" | null {
  const clean = stripHeadingMarkup(line).toUpperCase();
  if (!clean || clean.length > 60) return null;
  if (/^(ÍNDICE|INDICE|SUMÁRIO|SUMARIO)\b/.test(clean)) return "indice";
  if (/^RESUMO\b/.test(clean) || /^ABSTRACT\b/.test(clean)) return "resumo";
  if (/^(INTRODUÇÃO|INTRODUCAO|INTRODUCTION)\b/.test(clean)) return "intro";
  if (/^DESENVOLVIMENTO\b/.test(clean)) return "dev";
  if (/^(CONCLUSÃO|CONCLUSAO|CONCLUSION|CONSIDERAÇÕES FINAIS|CONSIDERACOES FINAIS)\b/.test(clean)) return "concl";
  if (/^(REFERÊNCIAS|REFERENCIAS|REFERENCES|BIBLIOGRAFIA)\b/.test(clean)) return "refs";
  return null;
}

function parseAcademicWork(text: string, body: WorkFormPayload) {
  const buckets = { indice: "", resumo: "", intro: "", dev: "", concl: "" };
  const refs: string[] = [];

  const lines = text.split(/\r?\n/);
  let current: keyof typeof buckets | "refs" | "" = "";

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current && current !== "refs") buckets[current] += "\n";
      continue;
    }
    const section = detectSection(line);
    if (section) { current = section; continue; }
    if (!current) { current = "intro"; }
    if (current === "refs") {
      const cleaned = line.replace(/^[\-\*\d\.\)\s]+/, "").trim();
      if (cleaned) refs.push(cleaned);
    } else {
      buckets[current] += (buckets[current] ? "\n" : "") + line.trim();
    }
  }

  // Fallback: se não detectou nenhuma secção principal, mete tudo no Desenvolvimento
  const hasAny = buckets.resumo || buckets.intro || buckets.dev || buckets.concl;
  if (!hasAny) {
    buckets.dev = text.trim();
  }

  const summary = buckets.resumo ||
    `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`;

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary,
    sections: [
      { heading: "Índice", content: buckets.indice.trim() },
      { heading: "Resumo", content: buckets.resumo.trim() },
      { heading: "Introdução", content: buckets.intro.trim() },
      { heading: "Desenvolvimento", content: buckets.dev.trim() },
      { heading: "Conclusão", content: buckets.concl.trim() },
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
    ? `\n\nO trabalho deve ser baseado e alinhado com o seguinte conteúdo extraído de um PDF fornecido pelo utilizador. Não copies texto palavra por palavra; em vez disso, sintetiza, explica e organiza academicamente o conteúdo abaixo, mantendo o sentido principal:\n\n"""\n${body.pdfText.substring(0, 8000)}\n"""\n`
    : "";

  const prompt = `Gere um trabalho académico COMPLETO, LONGO e DETALHADO em ${language}. Não resumas, não abrevies. Cada secção deve conter texto corrido extenso.

Estrutura obrigatória (usa exactamente estes cabeçalhos em MAIÚSCULAS, em linhas separadas, sem numeração nem markdown):

ÍNDICE
Lista numerada de todos os títulos e subtítulos do trabalho (apenas a lista, sem conteúdo).

RESUMO
Resumo académico de 200 a 300 palavras em texto corrido.

INTRODUÇÃO
4 a 6 parágrafos extensos com contextualização, problema, justificativa, objectivos (geral e específicos) e metodologia.

DESENVOLVIMENTO
Esta é a parte MAIS LONGA do trabalho (pelo menos 70% do texto total).
Organiza em 4 a 6 subtítulos. Para CADA subtítulo escreve OBRIGATORIAMENTE 3 a 5 parágrafos completos (mínimo 200 palavras por subtítulo) com fundamentação teórica, definições, exemplos práticos, análise crítica e ligações ao tema.
NUNCA escrevas apenas o subtítulo sem desenvolver o conteúdo por baixo.
Formato de cada subtítulo:
**Nome do Subtítulo**
[3 a 5 parágrafos completos de texto académico aqui]

CONCLUSÃO
3 a 5 parágrafos retomando objectivos, sintetizando resultados e apontando limitações e investigações futuras.

REFERÊNCIAS
Lista de 5 a 10 referências reais no formato ${body.style || "APA"}, uma por linha.

Dados do trabalho:
- Nível de ensino: ${body.educationLevel}
- Tipo: ${body.workType}
- Área: ${body.area}
- Tema: ${body.theme}${body.description ? `\n- Descrição/foco: ${body.description}` : ""}
- Extensão alvo: ~${body.pages} páginas A4 (texto longo e denso)
- Tom: formal académico, em português de Portugal${body.languageEn ? " e inglês" : ""}
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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,
        max_tokens: 8000,
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
