// Vercel Node runtime — Groq API (OpenAI-compatible)
import type { IncomingMessage, ServerResponse } from "http";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY não configurada no servidor." });

  const { theme, area, educationLevel } = req.body || {};
  if (!theme || typeof theme !== "string" || theme.length < 3) {
    return res.status(400).json({ error: "Informe o tema do trabalho primeiro." });
  }

  const prompt = `Com base no tema "${theme}"${area ? ` na área de ${area}` : ""}${educationLevel ? ` ao nível de ${educationLevel}` : ""}, gere uma descrição detalhada para um trabalho académico.

A descrição deve:
- Ter entre 3 a 5 frases
- Explicar o foco do trabalho, os objectivos principais e o problema a estudar
- Usar linguagem académica formal em português de Portugal
- Ser clara e objectiva

Responda APENAS com o texto da descrição, sem títulos nem formatação extra.`;

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
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Groq error", aiResp.status, errorText);
      if (aiResp.status === 429) return res.status(429).json({ error: "Limite de pedidos atingido. Tente novamente em instantes." });
      return res.status(500).json({ error: "Erro ao gerar descrição." });
    }

    const data = await aiResp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) return res.status(500).json({ error: "A IA devolveu uma resposta vazia." });

    return res.status(200).json({ description: text });
  } catch (error) {
    console.error("generate-description error", error);
    return res.status(500).json({ error: "Erro interno." });
  }
}
