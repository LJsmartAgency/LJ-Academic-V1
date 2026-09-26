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

// Remove a lista de subtítulos que a IA às vezes coloca no início do Desenvolvimento
function stripDevOutline(dev: string): string {
  const lines = dev.split(/\n/);
  const isHeadingLike = (l: string) => {
    const t = l.trim().replace(/^\*+|\*+$/g, "").trim();
    if (!t || t.length > 100) return false;
    return /^\d+(\s*\.\s*\d+)*\s*\.?\s+\S/.test(t) && !/[;:]$/.test(t) && !/\.\s*$/.test(t);
  };
  const titleOf = (l: string) =>
    l.trim().replace(/^\*+|\*+$/g, "").replace(/^[\d.\s]+/, "").trim().toLowerCase();

  // Procura um bloco de 3+ cabeçalhos consecutivos (sem texto entre eles) nas primeiras linhas
  let start = -1;
  let end = -1;
  let i = 0;
  let seen = 0;
  while (i < lines.length && seen < 30) {
    if (!lines[i].trim()) { i++; continue; }
    seen++;
    if (isHeadingLike(lines[i])) {
      let j = i;
      while (j < lines.length && (!lines[j].trim() || isHeadingLike(lines[j]))) j++;
      const block = lines.slice(i, j).filter((l) => l.trim());
      if (block.length >= 3) { start = i; end = j; break; }
      i = j;
      continue;
    }
    i++;
  }
  if (start < 0) return dev;

  const block = lines.slice(start, end).filter((l) => l.trim());
  const rest = lines.slice(end).join("\n").toLowerCase();
  const repeated = block.filter((l) => titleOf(l) && rest.includes(titleOf(l)));
  if (repeated.length < Math.ceil(block.length / 2)) return dev;

  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
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
    const section = /^\s*>/.test(line) ? null : detectSection(line);
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
      { heading: "Desenvolvimento", content: stripDevOutline(buckets.dev.trim()) },
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


  const humanizeRules = `

ESTILO DE ESCRITA HUMANIZADO E PROFISSIONAL
Escreve como um investigador universitário experiente escreve, não como um modelo de linguagem.
1. Varia o comprimento das frases e dos parágrafos; alterna frases longas de análise com frases curtas de síntese.
2. PROIBIDO usar expressões robóticas e repetitivas como: "É importante ressaltar", "É imperioso salientar", "Em suma", "Por fim, conclui-se", "No mundo actual", "Nos dias de hoje", "desempenha um papel crucial", "Este trabalho visa", "Vale a pena mencionar", "Em última análise".
3. Não comeces vários parágrafos com a mesma palavra ou fórmula. Cada parágrafo abre de maneira diferente.
4. Argumenta: apresenta a ideia, fundamenta com autores e dados, discute implicações e liga ao parágrafo seguinte com transições naturais.
5. Usa exemplos concretos, casos reais, números e contexto local em vez de generalidades vagas.
6. Assume uma voz académica sóbria e confiante; evita entusiasmo publicitário, listas soltas de palavras e frases feitas.
7. Escreve em português de Portugal, com ortografia pré-Acordo quando apropriado ao contexto académico (objectivo, directo, facto).`;

  const isCitationWork = /cita|fichamento/i.test(body.workType || "");
  const workTypeRules = isCitationWork
    ? `

TIPO ESPECIAL: TRABALHO DE CITAÇÕES / FICHAMENTO
O centro deste trabalho são as fontes e as suas citações.
1. Em cada subtítulo do desenvolvimento, apresenta o autor e a obra, depois a citação e por fim o comentário crítico do grupo.
2. Inclui no mínimo 2 citações directas curtas (entre aspas, com autor, ano e página) e 1 citação longa (linha iniciada com "> ") por subtítulo.
3. Depois de cada citação escreve 1 a 2 parágrafos de análise: o que o autor defende, como se aplica ao tema e que limites ou contrapontos existem.
4. Confronta autores entre si, mostrando convergências e divergências.
5. Todas as obras citadas devem constar nas REFERÊNCIAS, completas.`
    : "";

  const prompt = `Gere um trabalho académico COMPLETO em ${language}, com EXTENSÃO PROPORCIONAL ao número de páginas pedidas (${pages} páginas A4 ≈ ${totalWords} palavras de conteúdo).

NÃO RESUMAS. NÃO ABREVIES. Cumpre os mínimos de palavras indicados em cada secção.

Estrutura obrigatória (usa exactamente estes cabeçalhos em MAIÚSCULAS, em linhas isoladas, sem numeração nem markdown nos cabeçalhos principais):

ÍNDICE
Lista numerada de todos os títulos e subtítulos (apenas a lista, sem texto explicativo).

RESUMO
Resumo académico de aproximadamente ${resumoWords} palavras, em texto corrido.

INTRODUÇÃO
Cerca de ${introWords} palavras, distribuídas em 3 a 6 parágrafos com contextualização, problema, justificativa, objectivos (geral e específicos) e metodologia.

DESENVOLVIMENTO
Esta é a parte MAIS LONGA: aproximadamente ${devWords} palavras no total.
Divide em ${devSubs} subtítulos numerados. Para CADA subtítulo escreve OBRIGATORIAMENTE cerca de ${wordsPerSub} palavras (3 a 6 parágrafos completos) com fundamentação teórica, definições, exemplos práticos, análise crítica e ligações ao tema.
REGRA CRÍTICA: NUNCA escrevas a lista dos subtítulos no início do DESENVOLVIMENTO. Não repitas o índice aqui. Escreve o primeiro subtítulo e, IMEDIATAMENTE abaixo dele, os seus parágrafos completos; só depois passas ao subtítulo seguinte.
PROIBIDO escrever dois subtítulos seguidos sem texto entre eles.
Formato de cada subtítulo:
**Nome do Subtítulo**
[parágrafos completos de texto académico, ~${wordsPerSub} palavras]

CONCLUSÃO
Cerca de ${conclWords} palavras em 3 a 5 parágrafos retomando objectivos, sintetizando resultados e apontando limitações e investigações futuras.

REFERÊNCIAS
Lista de ${Math.max(5, Math.min(15, pages))} referências reais e completas (autor, ano, título, editora/revista) no formato ${body.style || "APA"}, uma por linha.
PROIBIDO escrever textos de exemplo como "Adicione aqui as referências" ou referências inventadas sem autor e ano.

Dados do trabalho:
- Nível de ensino: ${body.educationLevel}
- Instituição: ${university || "não indicada"}
- Tipo: ${body.workType}
- Área: ${body.area}
- Tema: ${body.theme}${body.description ? `\n- Descrição/foco: ${body.description}` : ""}
- Páginas pedidas: ${pages} (≈ ${totalWords} palavras)
- Tom: formal académico, em português de Portugal${body.languageEn ? " e inglês" : ""}

IMPORTANTE: Conta as palavras à medida que escreves. Se chegares ao fim do desenvolvimento com menos palavras do que o pedido, ADICIONA mais parágrafos a cada subtítulo até atingir o alvo. Não termines antes de cumprir a extensão.
${humanizeRules}${workTypeRules}${institutionContext}${citationRules}
${pdfContext}`;


  try {
    const r = await groqChat(GROQ_API_KEY, [{ role: "user", content: prompt }], { temperature: 0.75, max_tokens: targetTokens });
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    const text = r.text;

    if (!text) return res.status(500).json({ error: "Por favor gere novamente." });

    const academicWork = parseAcademicWork(text, body);
    return res.status(200).json({ work: academicWork });
  } catch (error) {
    console.error("generate-work error", error);
    return res.status(500).json({ error: "Erro interno ao gerar o trabalho." });
  }
}
