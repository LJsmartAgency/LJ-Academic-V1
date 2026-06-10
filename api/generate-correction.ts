// Vercel Node runtime — Groq API (OpenAI-compatible, vision model)
import type { IncomingMessage, ServerResponse } from "http";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Modelo vision da Groq (Llama 4 Scout — suporta imagens)
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY não configurada no servidor." });

  const { imageBase64, mimeType, course, educationLevel, examTitle } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length < 20) {
    return res.status(400).json({ error: "Envie a imagem do exame." });
  }

  const prompt = `Analisa a imagem deste exame/avaliação e gera um guião de correção completo e detalhado.

Contexto:
- Curso: ${course || "Não especificado"}
- Nível de ensino: ${educationLevel || "Não especificado"}
- Título do exame: ${examTitle || "Não especificado"}
- Sistema de ensino: Portugal

Instruções:
1. Identifica TODAS as questões/perguntas presentes no exame
2. Para cada questão, fornece:
   - O enunciado da questão
   - A resposta correcta completa e detalhada
   - Explicação passo a passo
   - Critérios de cotação (se aplicável)
3. Usa linguagem académica formal em Português de Portugal
4. Se houver cálculos, mostra todos os passos intermédios
5. Se houver questões de desenvolvimento, escreve uma resposta modelo completa

Formato de resposta (em Markdown):

# Guião de Correção

## Informações do Exame
- Disciplina: [identificada]
- Tipo de avaliação: [teste/exame/frequência]

## Questão 1
**Enunciado:** [transcreve a questão]

**Resposta/Resolução:**
[resposta detalhada com todos os passos]

**Cotação sugerida:** [pontos]

---

(repete para cada questão)

Responde APENAS com o guião de correção em Markdown.`;

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
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.5,
        max_tokens: 8000,
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Groq error", aiResp.status, errorText);
      if (aiResp.status === 429) return res.status(429).json({ error: "Limite de pedidos atingido. Tente novamente em instantes." });
      return res.status(500).json({ error: "Erro ao analisar o exame." });
    }

    const data = await aiResp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) return res.status(500).json({ error: "A IA devolveu uma resposta vazia." });

    return res.status(200).json({ correction: text });
  } catch (error) {
    console.error("generate-correction error", error);
    return res.status(500).json({ error: "Erro interno." });
  }
}
