// Vercel Node runtime — Lovable AI Gateway
import type { IncomingMessage, ServerResponse } from "http";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) return res.status(500).json({ error: "LOVABLE_API_KEY não configurada no servidor." });

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
    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Lovable AI error", aiResp.status, errorText);
      if (aiResp.status === 429) return res.status(429).json({ error: "Limite de pedidos atingido. Tente novamente em instantes." });
      if (aiResp.status === 402) return res.status(402).json({ error: "Créditos da IA esgotados. Adicione créditos na área de trabalho." });
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
