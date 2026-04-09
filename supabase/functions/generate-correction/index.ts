import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const CorrectionRequestSchema = z.object({
  imageBase64: z.string().min(20, "Envie a imagem do exame."),
  mimeType: z.string().optional(),
  course: z.string().optional(),
  educationLevel: z.string().optional(),
  examTitle: z.string().optional(),
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestBody = await req.json().catch(() => null);
    const parsedBody = CorrectionRequestSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: parsedBody.error.flatten().fieldErrors.imageBase64?.[0] ?? "Pedido inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { imageBase64, mimeType, course, educationLevel, examTitle } = parsedBody.data;

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

    const aiResp = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.3,
        messages: [{
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
        }],
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Lovable AI error", aiResp.status, errorText);

      const message = aiResp.status === 429
        ? "Lovable AI está temporariamente no limite de pedidos. Tente novamente dentro de instantes."
        : aiResp.status === 402
          ? "O saldo da Lovable AI do workspace esgotou. Recarregue em Settings → Cloud & AI balance."
          : "Erro ao analisar o exame.";

      return new Response(
        JSON.stringify({ error: message }),
        { status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const text = getResponseText(data);

    if (!text) {
      return new Response(
        JSON.stringify({ error: "A Lovable AI devolveu uma resposta vazia." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
