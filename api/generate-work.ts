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

function parseAcademicWork(text: string, body: WorkFormPayload) {
  let indexText = "";
  let resumoText = "";
  let introText = "";
  let devText = "";
  let conclText = "";
  const refs: string[] = [];

  const lines = text.split(/\n+/).map((l) => l.trim());
  let current: "" | "indice" | "resumo" | "intro" | "dev" | "concl" | "refs" = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (upper.startsWith("ÍNDICE") || upper.startsWith("INDICE")) { current = "indice"; continue; }
    if (upper.startsWith("RESUMO")) { current = "resumo"; continue; }
    if (upper.startsWith("INTRODUÇÃO") || upper.startsWith("INTRODUCAO")) { current = "intro"; continue; }
    if (upper.startsWith("DESENVOLVIMENTO")) { current = "dev"; continue; }
    if (upper.startsWith("CONCLUSÃO") || upper.startsWith("CONCLUSAO")) { current = "concl"; continue; }
    if (upper.startsWith("REFERÊNCIAS") || upper.startsWith("REFERENCIAS")) { current = "refs"; continue; }

    switch (current) {
      case "indice": indexText += (indexText ? "\n" : "") + line; break;
      case "resumo": resumoText += (resumoText ? "\n" : "") + line; break;
      case "intro": introText += (introText ? "\n" : "") + line; break;
      case "dev": devText += (devText ? "\n" : "") + line; break;
      case "concl": conclText += (conclText ? "\n" : "") + line; break;
      case "refs": refs.push(line); break;
    }
  }

  const summary = resumoText ||
    `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`;

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary,
    sections: [
      { heading: "Índice", content: indexText },
      { heading: "Resumo", content: resumoText },
      { heading: "Introdução", content: introText },
      { heading: "Desenvolvimento", content: devText },
      { heading: "Conclusão", content: conclText },
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

  const prompt = `Gere um trabalho académico completo, longo e detalhado, com a seguinte estrutura, escrevendo em ${language}:

PÁGINA 1 - ÍNDICE
- Comece com o título "ÍNDICE".
- Em seguida liste, numerados, todos os títulos e subtítulos do trabalho.
- IMPORTANTE: Nesta página de índice NÃO escreva nenhum parágrafo de conteúdo.

Depois do índice, escreva o texto completo do trabalho com as secções seguintes:

RESUMO
- Escreva um resumo académico formal do trabalho, com 150 a 300 palavras.

INTRODUÇÃO
- Contextualize o tema e apresente o problema de investigação, justificativa, objectivos e metodologia.
- Use 3 a 6 parágrafos coesos.

DESENVOLVIMENTO
- Deve ser a parte mais longa do trabalho (pelo menos 60% de todo o texto).
- Traga fundamentação teórica, explicações técnicas, definições, exemplos e análise crítica.
- Organize com vários subtítulos em negrito.

CONCLUSÃO
- Síntese dos principais pontos e retome os objectivos.

REFERÊNCIAS
- Liste as referências em linhas separadas.

Regras gerais:
- Nível de ensino: ${body.educationLevel}.
- Tipo de trabalho: ${body.workType}.
- Área/disciplina: ${body.area}.
- Tema: ${body.theme}.${body.description ? `\n- Descrição: ${body.description}` : ""}
- Comprimento: ~${body.pages} páginas A4.
- Tom formal académico.
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
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Groq error", aiResp.status, errorText);
      if (aiResp.status === 429) return res.status(429).json({ error: "Limite de pedidos atingido. Tente novamente em instantes." });
      return res.status(500).json({ error: "Erro ao gerar texto com IA." });
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
