import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WorkFormPayload {
  educationLevel: string;
  workType: string;
  area: string;
  theme: string;
  pages: string;
  languagePtBr: boolean;
  languageEn: boolean;
  style?: string;
  tone?: string;
  pdfName?: string;
  pdfText?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase environment variables not configured");
      return new Response(JSON.stringify({ error: "Configuração do servidor em falta." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const body = (await req.json()) as WorkFormPayload;

    const language = body.languageEn ? "en" : "pt-PT";

    const pdfContext = body.pdfText
      ? `\n\nO trabalho deve ser baseado e alinhado com o seguinte conteúdo extraído de um PDF fornecido pelo utilizador. Não copies texto palavra por palavra; em vez disso, sintetiza, explica e organiza academicamente o conteúdo abaixo, mantendo o sentido principal:\n\n"""\n${body.pdfText.substring(0, 8000)}\n"""\n`
      : "";

    const prompt = `Gere um trabalho académico completo, longo e detalhado, com a seguinte estrutura, escrevendo em ${language}:

PÁGINA 1 - ÍNDICE
- Comece com o título "ÍNDICE".
- Em seguida liste, numerados, todos os títulos e subtítulos do trabalho (por exemplo: "1. INTRODUÇÃO", "2. DESENVOLVIMENTO", "2.1. Conceitos fundamentais", etc.).
- IMPORTANTE: Nesta página de índice NÃO escreva nenhum parágrafo de conteúdo da introdução, desenvolvimento, conclusão ou referências. Apenas a lista.

Depois do índice, escreva o texto completo do trabalho com as secções seguintes, cada uma começando em linha própria com o cabeçalho em maiúsculas exactamente como abaixo (sem repetir o índice dentro das secções):

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
- Tema detalhado: ${body.theme}.
- Pretenda um comprimento aproximado de ${body.pages} páginas A4 em letra 12 e espaçamento 1.5 (ou seja, texto relativamente extenso e desenvolvido).
- Mantém tom formal académico, com frases completas e linguagem técnica adequada ao nível de ensino.
${pdfContext}`;

    console.log("Calling Supabase AI...");

    // Use Supabase AI via the built-in inference API
    const { data, error: aiError } = await supabase.functions.invoke("ai", {
      body: {
        model: "gemini-1.5-flash",
        messages: [
          { role: "system", content: "Você é um assistente académico especializado em criar trabalhos de pesquisa estruturados, completos e bem fundamentados." },
          { role: "user", content: prompt }
        ],
      },
    });

    if (aiError) {
      console.error("Supabase AI error:", aiError);
      
      // Fallback: Try using the Supabase AI inference endpoint directly
      const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          messages: [
            { role: "system", content: "Você é um assistente académico especializado em criar trabalhos de pesquisa estruturados, completos e bem fundamentados." },
            { role: "user", content: prompt }
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI fallback error:", aiResponse.status, errorText);
        return new Response(JSON.stringify({ error: "Erro ao gerar texto com IA. Verifique se a IA está ativada no seu projeto Supabase." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fallbackData = await aiResponse.json();
      const text: string = fallbackData.choices?.[0]?.message?.content ?? "";
      
      if (!text) {
        return new Response(JSON.stringify({ error: "Resposta vazia da IA." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ work: parseAcademicWork(text, body) }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text: string = data?.choices?.[0]?.message?.content ?? "";

    if (!text) {
      console.error("AI response without text", JSON.stringify(data));
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
  let introText = "";
  let devText = "";
  let conclText = "";
  const refs: string[] = [];

  const lines = text.split(/\n+/).map((l) => l.trim());
  let current: "" | "indice" | "intro" | "dev" | "concl" | "refs" = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (upper.startsWith("ÍNDICE") || upper.startsWith("INDICE")) {
      current = "indice";
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

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary:
      `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`,
    sections: [
      { heading: "Índice", content: indexText },
      { heading: "Introdução", content: introText },
      { heading: "Desenvolvimento", content: devText },
      { heading: "Conclusão", content: conclText },
    ],
    references: refs.length
      ? refs
      : ["Adicione aqui as referências bibliográficas com base nas fontes que utilizou."],
  };
}
