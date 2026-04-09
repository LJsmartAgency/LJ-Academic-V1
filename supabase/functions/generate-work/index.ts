import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Simple in-memory rate limiter: max 10 requests per IP per 10 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

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

const WorkFormSchema = z.object({
  educationLevel: z.string().min(1, "O nível de ensino é obrigatório."),
  workType: z.string().min(1, "O tipo de trabalho é obrigatório."),
  area: z.string().min(1, "A área/disciplina é obrigatória."),
  theme: z.string().min(3, "O tema do trabalho é obrigatório."),
  description: z.string().optional(),
  pages: z.string().min(1, "O número de páginas é obrigatório."),
  languagePtBr: z.boolean().optional().default(true),
  languageEn: z.boolean().optional().default(false),
  style: z.string().optional(),
  tone: z.string().optional(),
  pdfName: z.string().optional(),
  pdfText: z.string().optional(),
});

function getResponseText(data: any) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: "Demasiados pedidos. Aguarde alguns minutos e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({
          error:
            "Configuração em falta: a secret LOVABLE_API_KEY não está disponível no projeto.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const requestBody = await req.json().catch(() => null);
    const parsedBody = WorkFormSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      const firstError = Object.values(parsedBody.error.flatten().fieldErrors).flat()[0] ?? "Pedido inválido.";
      return new Response(JSON.stringify({ error: firstError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = parsedBody.data as WorkFormPayload;

    const language = body.languageEn ? "en" : "pt-PT";

    const pdfContext = body.pdfText
      ? `\n\nO trabalho deve ser baseado e alinhado com o seguinte conteúdo extraído de um PDF fornecido pelo utilizador. Não copies texto palavra por palavra; em vez disso, sintetiza, explica e organiza academicamente o conteúdo abaixo, mantendo o sentido principal:\n\n"""\n${body.pdfText.substring(0, 8000)}\n"""\n`
      : "";

    const prompt = `Gere um trabalho académico completo, longo e detalhado, com a seguinte estrutura, escrevendo em ${language}:

PÁGINA 1 - ÍNDICE
- Comece com o título "ÍNDICE".
- Em seguida liste, numerados, todos os títulos e subtítulos do trabalho (por exemplo: "1. RESUMO", "2. INTRODUÇÃO", "3. DESENVOLVIMENTO", "3.1. Conceitos fundamentais", etc.).
- IMPORTANTE: Nesta página de índice NÃO escreva nenhum parágrafo de conteúdo da introdução, desenvolvimento, conclusão ou referências. Apenas a lista.

Depois do índice, escreva o texto completo do trabalho com as secções seguintes, cada uma começando em linha própria com o cabeçalho em maiúsculas exactamente como abaixo (sem repetir o índice dentro das secções):

RESUMO
- Escreva um resumo académico formal do trabalho, com 150 a 300 palavras.
- Deve sintetizar o objectivo, a metodologia, os principais resultados e as conclusões do trabalho.
- Não repita a introdução; o resumo deve ser autónomo e dar ao leitor uma visão geral completa do trabalho.

INTRODUÇÃO
- Contextualize o tema e apresente claramente: o problema de investigação, a justificativa, o objectivo geral, os objectivos específicos, a delimitação do estudo (tempo, espaço, foco) e uma breve descrição da metodologia (tipo de pesquisa, abordagem e procedimentos).
- Use 3 a 6 parágrafos coesos, sem explicações técnicas profundas, fórmulas ou listas longas (isso deve ficar em DESENVOLVIMENTO).

DESENVOLVIMENTO
- Deve ser a parte mais longa do trabalho (pelo menos 60% de todo o texto).
- Traga toda a fundamentação teórica, explicações técnicas, definições, leis, fórmulas, exemplos e análise crítica.
- Organize o texto com vários subtítulos em negrito, por exemplo:
  "1. Conceitos Fundamentais", "1.1. Grandezas Eléctricas Básicas", "1.2. Leis Fundamentais", etc.
- Utilize listas numeradas ou com marcadores quando fizer sentido.

CONCLUSÃO
- Apresente uma síntese dos principais pontos discutidos no desenvolvimento.
- Retome os objectivos e mostre como foram alcançados.
- Não introduza novos tópicos extensos aqui.

REFERÊNCIAS
- Liste as referências em linhas separadas, num formato consistente.

Regras gerais do trabalho:
- Nível de ensino: ${body.educationLevel}.
- Tipo de trabalho: ${body.workType}.
- Área/disciplina: ${body.area}.
- Tema detalhado: ${body.theme}.${body.description ? `\n- Descrição adicional do utilizador: ${body.description}` : ""}
- Pretenda um comprimento aproximado de ${body.pages} páginas A4 em letra 12 e espaçamento 1.5 (ou seja, texto relativamente extenso e desenvolvido).
- Mantém tom formal académico, com frases completas e linguagem técnica adequada ao nível de ensino.
${pdfContext}`;

    console.log("Calling Gemini...");

    const aiResp = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "Escreve trabalhos académicos completos em português de Portugal ou inglês, consoante instruído, mantendo estrutura formal, clareza e profundidade.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Lovable AI error", aiResp.status, errorText);

      const message = aiResp.status === 429
        ? "Lovable AI está temporariamente no limite de pedidos. Tente novamente dentro de instantes."
        : aiResp.status === 402
          ? "O saldo da Lovable AI do workspace esgotou. Recarregue em Settings → Cloud & AI balance."
          : "Erro ao gerar texto com IA.";

      return new Response(JSON.stringify({ error: message }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const text = getResponseText(aiData);

    if (!text) {
      console.error("Lovable AI response without text", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "Resposta vazia da IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const academicWork = parseAcademicWork(text, body);

    return new Response(JSON.stringify({ work: academicWork }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-work error", error);
    return new Response(JSON.stringify({ error: "Erro interno ao gerar o trabalho." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

    if (upper.startsWith("ÍNDICE") || upper.startsWith("INDICE")) {
      current = "indice";
      continue;
    }
    if (upper.startsWith("RESUMO")) {
      current = "resumo";
      continue;
    }
    if (upper.startsWith("INTRODUÇÃO") || upper.startsWith("INTRODUCAO")) {
      current = "intro";
      continue;
    }
    if (upper.startsWith("DESENVOLVIMENTO")) {
      current = "dev";
      continue;
    }
    if (upper.startsWith("CONCLUSÃO") || upper.startsWith("CONCLUSAO")) {
      current = "concl";
      continue;
    }
    if (upper.startsWith("REFERÊNCIAS") || upper.startsWith("REFERENCIAS")) {
      current = "refs";
      continue;
    }

    switch (current) {
      case "indice":
        indexText += (indexText ? "\n" : "") + line;
        break;
      case "resumo":
        resumoText += (resumoText ? "\n" : "") + line;
        break;
      case "intro":
        introText += (introText ? "\n" : "") + line;
        break;
      case "dev":
        devText += (devText ? "\n" : "") + line;
        break;
      case "concl":
        conclText += (conclText ? "\n" : "") + line;
        break;
      case "refs":
        refs.push(line);
        break;
      default:
        break;
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
    references: refs.length
      ? refs
      : ["Adicione aqui as referências bibliográficas com base nas fontes que utilizou."],
  };
}
