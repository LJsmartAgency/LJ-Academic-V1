import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const DescriptionRequestSchema = z.object({
  theme: z.string().min(3, "Informe o tema do trabalho primeiro."),
  area: z.string().optional(),
  educationLevel: z.string().optional(),
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestBody = await req.json().catch(() => null);
    const parsedBody = DescriptionRequestSchema.safeParse(requestBody);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: parsedBody.error.flatten().fieldErrors.theme?.[0] ?? "Pedido inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { theme, area, educationLevel } = parsedBody.data;

    const prompt = `Com base no tema "${theme}"${area ? ` na área de ${area}` : ""}${educationLevel ? ` ao nível de ${educationLevel}` : ""}, gere uma descrição detalhada para um trabalho académico.

A descrição deve:
- Ter entre 3 a 5 frases
- Explicar o foco do trabalho, os objectivos principais e o problema a estudar
- Usar linguagem académica formal em português de Portugal
- Ser clara e objectiva

Responda APENAS com o texto da descrição, sem títulos nem formatação extra.`;

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
            content: "Escreve apenas em português de Portugal, com tom académico, claro e objectivo.",
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
          : "Erro ao gerar descrição.";

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
      JSON.stringify({ description: text.trim() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-description error", error);
    return new Response(
      JSON.stringify({ error: "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
