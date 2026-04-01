import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { theme, area, educationLevel } = await req.json();

    if (!theme || theme.length < 3) {
      return new Response(
        JSON.stringify({ error: "Informe o tema do trabalho primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = `Com base no tema "${theme}"${area ? ` na área de ${area}` : ""}${educationLevel ? ` ao nível de ${educationLevel}` : ""}, gere uma descrição detalhada para um trabalho académico.

A descrição deve:
- Ter entre 3 a 5 frases
- Explicar o foco do trabalho, os objectivos principais e o problema a estudar
- Usar linguagem académica formal em português de Portugal
- Ser clara e objectiva

Responda APENAS com o texto da descrição, sem títulos nem formatação extra.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    });

    if (!geminiResp.ok) {
      const errorText = await geminiResp.text();
      console.error("Gemini error", geminiResp.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar descrição." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await geminiResp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ?? "";

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
