// Vercel Node runtime — Groq API (OpenAI-compatible)
import type { IncomingMessage, ServerResponse } from "http";
import { groqChat } from "./_groq.js";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };


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
  coverUniversity?: string;
  coverFaculty?: string;
  coverCourse?: string;
  coverSubject?: string;
  coverLocation?: string;
}


function stripHeadingMarkup(line: string): string {
  // Remove markdown (**, ##, #), numeração (1., 1), I., II.), bullets e espaços
  return line
    .replace(/^[#>\-\*\s]+/, "")
    .replace(/\*+/g, "")
    .replace(/^\s*([IVX]+|\d+)[\.\)]\s*/i, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function detectSection(line: string): "indice" | "resumo" | "intro" | "dev" | "concl" | "refs" | null {
  const clean = stripHeadingMarkup(line).toUpperCase();
  if (!clean || clean.length > 60) return null;
  if (/^(ÍNDICE|INDICE|SUMÁRIO|SUMARIO)\b/.test(clean)) return "indice";
  if (/^RESUMO\b/.test(clean) || /^ABSTRACT\b/.test(clean)) return "resumo";
  if (/^(INTRODUÇÃO|INTRODUCAO|INTRODUCTION)\b/.test(clean)) return "intro";
  if (/^DESENVOLVIMENTO\b/.test(clean)) return "dev";
  if (/^(CONCLUSÃO|CONCLUSAO|CONCLUSION|CONSIDERAÇÕES FINAIS|CONSIDERACOES FINAIS)\b/.test(clean)) return "concl";
  if (/^(REFERÊNCIAS|REFERENCIAS|REFERENCES|BIBLIOGRAFIA)\b/.test(clean)) return "refs";
  return null;
}

function parseAcademicWork(text: string, body: WorkFormPayload) {
  const buckets = { indice: "", resumo: "", intro: "", dev: "", concl: "" };
  const refs: string[] = [];

  const lines = text.split(/\r?\n/);
  let current: keyof typeof buckets | "refs" | "" = "";

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current && current !== "refs") buckets[current] += "\n";
      continue;
    }
    const section = detectSection(line);
    if (section) { current = section; continue; }
    if (!current) { current = "intro"; }
    if (current === "refs") {
      const cleaned = line.replace(/^[\-\*\d\.\)\s]+/, "").trim();
      if (cleaned) refs.push(cleaned);
    } else {
      buckets[current] += (buckets[current] ? "\n" : "") + line.trim();
    }
  }

  // Fallback: se não detectou nenhuma secção principal, mete tudo no Desenvolvimento
  const hasAny = buckets.resumo || buckets.intro || buckets.dev || buckets.concl;
  if (!hasAny) {
    buckets.dev = text.trim();
  }

  const summary = buckets.resumo ||
    `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`;

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary,
    sections: [
      { heading: "Índice", content: buckets.indice.trim() },
      { heading: "Resumo", content: buckets.resumo.trim() },
      { heading: "Introdução", content: buckets.intro.trim() },
      { heading: "Desenvolvimento", content: buckets.dev.trim() },
      { heading: "Conclusão", content: buckets.concl.trim() },
    ],
    references: refs.length ? refs : ["Adicione aqui as referências bibliográficas com base nas fontes que utilizou."],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY não configurada no servidor." });

  const body = req.body as WorkFormPayload;
  if (!body?.theme || !body?.area || !body?.workType) {
    return res.status(400).json({ error: "Campos obrigatórios em falta." });
  }

  const language = body.languageEn ? "en" : "pt-PT";
  const pdfContext = body.pdfText
    ? `\n\nO trabalho deve ser baseado e alinhado com o seguinte conteúdo extraído de um PDF fornecido pelo utilizador. Não copies texto palavra por palavra; em vez disso, sintetiza, explica e organiza academicamente o conteúdo abaixo, mantendo o sentido principal:\n\n"""\n${body.pdfText.substring(0, 8000)}\n"""\n`
    : "";

  const pages = Math.max(1, Math.min(120, Number(body.pages) || 5));
  // ~300 palavras por página A4 com formatação académica padrão
  const totalWords = pages * 300;
  const introWords = Math.round(totalWords * 0.12);
  const devWords = Math.round(totalWords * 0.65);
  const conclWords = Math.round(totalWords * 0.10);
  const resumoWords = Math.min(350, Math.round(totalWords * 0.05));
  // Número de subtítulos do desenvolvimento escala com páginas
  const devSubs = Math.max(3, Math.min(10, Math.ceil(pages / 2)));
  const wordsPerSub = Math.round(devWords / devSubs);
  // Tokens: ~1.5 tokens/palavra PT + folga; cap a 8000 (limite Groq) — se pedido for maior, avisar prompt
  const targetTokens = Math.min(8000, Math.round(totalWords * 1.6) + 500);

  // Normas metodológicas: adaptadas à instituição escrita pelo estudante
  const university = (body.coverUniversity || "").trim();
  const mzPattern = /(moçambi|mocambi|eduardo mondlane|\buem\b|pedagógic|pedagogic|\bup\b|unilicungo|licungo|unisave|save|unirovuma|rovuma|unizambeze|zambeze|unilúrio|unilurio|lúrio|lurio|isctem|católica de moçambique|catolica de mocambique|\bucm\b|politécnica|politecnica|isutc|\budm\b|\bisri\b|maputo|beira|nampula|quelimane|tete|pemba|xai-xai|inhambane|chimoio|lichinga)/i;
  const isMz = mzPattern.test(university) || mzPattern.test(body.coverLocation || "");

  const institutionContext = university
    ? `\n\nNORMAS DA INSTITUIÇÃO
A instituição indicada pelo estudante é: "${university}"${body.coverFaculty ? ` — ${body.coverFaculty}` : ""}${body.coverCourse ? ` (${body.coverCourse})` : ""}.
Adapta a linguagem, a terminologia académica e o formato de citação ao regulamento metodológico habitual desta instituição.${
        isMz
          ? `
Esta é uma instituição do sistema de ensino superior de Moçambique: usa português de Portugal (não do Brasil), terminologia moçambicana (cadeira, discente, docente, ano lectivo, grupo nº) e, quando o tema o permitir, inclui contexto, legislação e autores moçambicanos relevantes, além da literatura internacional da área.`
          : `
Se não conheceres o regulamento exacto desta instituição, aplica a norma internacional padrão ${body.style || "APA (7.ª edição)"}.`
      }`
    : "";

  const citationRules = `\n\nREGRAS OBRIGATÓRIAS DE CITAÇÃO (norma ${body.style || "APA"}${isMz ? ", uso académico em Moçambique" : ""})
1. Citação directa CURTA (até 3 linhas): dentro do parágrafo, entre aspas, com autor, ano e página. Ex.: Segundo Sitoe (2021, p. 45), "o desenvolvimento comunitário exige...".
2. Citação directa LONGA (mais de 3 linhas): em parágrafo próprio, SEM aspas, começando obrigatoriamente a linha com "> " (sinal de maior e um espaço). Termina com (Autor, Ano, p. XX). Esta marca é usada para aplicar o recuo de 4 cm, letra 10 e espaçamento simples no documento final.
3. Citação INDIRECTA (paráfrase): sem aspas e sem recuo, apenas (Autor, Ano) ou "Conforme Mazula (2015)...".
4. Mais de três autores: (Cossa et al., 2020). Citação de citação: (Mondlane, 1969, apud Nhantumbo, 2018, p. 25).
5. Inclui pelo menos 3 citações directas curtas e 2 citações longas no desenvolvimento, e TODOS os autores citados no texto devem aparecer nas REFERÊNCIAS.`;


  const prompt = `Gere um trabalho académico COMPLETO em ${language}, com EXTENSÃO PROPORCIONAL ao número de páginas pedidas (${pages} páginas A4 ≈ ${totalWords} palavras de conteúdo).

NÃO RESUMAS. NÃO ABREVIES. Cumpre os mínimos de palavras indicados em cada secção.

Estrutura obrigatória (usa exactamente estes cabeçalhos em MAIÚSCULAS, em linhas isoladas, sem numeração nem markdown nos cabeçalhos principais):

ÍNDICE
Lista numerada de todos os títulos e subtítulos (apenas a lista).

RESUMO
Resumo académico de aproximadamente ${resumoWords} palavras, em texto corrido.

INTRODUÇÃO
Cerca de ${introWords} palavras, distribuídas em 3 a 6 parágrafos com contextualização, problema, justificativa, objectivos (geral e específicos) e metodologia.

DESENVOLVIMENTO
Esta é a parte MAIS LONGA: aproximadamente ${devWords} palavras no total.
Divide em ${devSubs} subtítulos numerados. Para CADA subtítulo escreve OBRIGATORIAMENTE cerca de ${wordsPerSub} palavras (3 a 6 parágrafos completos) com fundamentação teórica, definições, exemplos práticos, análise crítica e ligações ao tema.
PROIBIDO escrever apenas o subtítulo sem desenvolver o conteúdo por baixo.
Formato de cada subtítulo:
**Nome do Subtítulo**
[parágrafos completos de texto académico, ~${wordsPerSub} palavras]

CONCLUSÃO
Cerca de ${conclWords} palavras em 3 a 5 parágrafos retomando objectivos, sintetizando resultados e apontando limitações e investigações futuras.

REFERÊNCIAS
Lista de ${Math.max(5, Math.min(15, pages))} referências reais no formato ${body.style || "APA"}, uma por linha.

Dados do trabalho:
- Nível de ensino: ${body.educationLevel}
- Tipo: ${body.workType}
- Área: ${body.area}
- Tema: ${body.theme}${body.description ? `\n- Descrição/foco: ${body.description}` : ""}
- Páginas pedidas: ${pages} (≈ ${totalWords} palavras)
- Tom: formal académico, em português de Portugal${body.languageEn ? " e inglês" : ""}

IMPORTANTE: Conta as palavras à medida que escreves. Se chegares ao fim do desenvolvimento com menos palavras do que o pedido, ADICIONA mais parágrafos a cada subtítulo até atingir o alvo. Não termines antes de cumprir a extensão.
${pdfContext}`;

  try {
    const r = await groqChat(GROQ_API_KEY, [{ role: "user", content: prompt }], { temperature: 0.75, max_tokens: targetTokens });
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    const text = r.text;

    if (!text) return res.status(500).json({ error: "Resposta vazia da IA." });

    const academicWork = parseAcademicWork(text, body);
    return res.status(200).json({ work: academicWork });
  } catch (error) {
    console.error("generate-work error", error);
    return res.status(500).json({ error: "Erro interno ao gerar o trabalho." });
  }
}
