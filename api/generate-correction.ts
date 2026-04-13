const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

type ApiRequest = {
  method?: string;
  body?: Record<string, unknown>;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => void;
    end: () => void;
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor." });

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
    const aiResp = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        }],
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Gemini error", aiResp.status, errorText);
      return res.status(500).json({ error: "Erro ao analisar o exame." });
    }

    const data = await aiResp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) return res.status(500).json({ error: "A IA devolveu uma resposta vazia." });

    return res.status(200).json({ correction: text });
  } catch (error) {
    console.error("generate-correction error", error);
    return res.status(500).json({ error: "Erro interno." });
  }
}
