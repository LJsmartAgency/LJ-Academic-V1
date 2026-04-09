import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: "Demasiados pedidos. Aguarde alguns minutos e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { imageBase64, mimeType, course, educationLevel, examTitle } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Envie a imagem do exame." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
   - O enunciado da questão (como aparece na imagem)
   - A resposta correcta completa e detalhada
   - Explicação passo a passo do raciocínio/resolução
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

## Resumo da Cotação
| Questão | Cotação |
|---------|---------|
| ... | ... |
| **Total** | **100%** |

Responde APENAS com o guião de correção em Markdown.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
      }),
    });

    if (!geminiResp.ok) {
      const errorText = await geminiResp.text();
      console.error("Gemini error", geminiResp.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao analisar o exame." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await geminiResp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ?? "";

    return new Response(
      JSON.stringify({ correction: text.trim() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-correction error", error);
    return new Response(
      JSON.stringify({ error: "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
