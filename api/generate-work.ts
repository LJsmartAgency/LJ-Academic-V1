// Vercel Node runtime — Groq API (OpenAI-compatible)
import type { IncomingMessage, ServerResponse } from "http";
type VercelRequest = IncomingMessage & { body: any; query: Record<string, string | string[]>; method?: string };
type VercelResponse = ServerResponse & { status: (code: number) => VercelResponse; json: (data: any) => VercelResponse; send: (data: any) => VercelResponse };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

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
}

interface AcademicTable {
  title: string;
  headers: string[];
  rows: string[][];
}

interface AcademicWorkSection {
  heading: string;
  content: string;
  tables?: AcademicTable[];
}

// Extrai conteúdo entre delimitadores [[SECTION:NAME]] ... [[/SECTION:NAME]]
function extractBlock(text: string, name: string): string {
  const re = new RegExp(`\\[\\[SECTION:${name}\\]\\]([\\s\\S]*?)\\[\\[/SECTION:${name}\\]\\]`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function extractTableBlock(text: string, name: string): string {
  const re = new RegExp(`\\[\\[TABLE:${name}\\]\\]([\\s\\S]*?)\\[\\[/TABLE:${name}\\]\\]`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function parsePipeTable(raw: string, title: string): AcademicTable | null {
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l.includes("|") && !/^[-|:\s]+$/.test(l));
  if (lines.length < 2) return null;
  const split = (l: string) => l.split("|").map((c) => c.trim()).filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === ""));
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split).filter((r) => r.length > 0);
  if (!headers.length || !rows.length) return null;
  return { title, headers, rows };
}

// Fallback baseado em cabeçalhos quando os delimitadores falham
function fallbackHeaderSplit(text: string) {
  const buckets = { indice: "", resumo: "", intro: "", dev: "", concl: "", refs: "" };
  const re = /^\s*(?:\*\*|##?\s*)?\s*(ÍNDICE|INDICE|RESUMO|INTRODUÇÃO|INTRODUCAO|DESENVOLVIMENTO|CONCLUSÃO|CONCLUSAO|REFERÊNCIAS|REFERENCIAS|BIBLIOGRAFIA)\s*(?:\*\*)?\s*:?\s*$/gim;
  const matches: Array<{ key: keyof typeof buckets; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const up = m[1].toUpperCase();
    let key: keyof typeof buckets = "intro";
    if (up.startsWith("ÍND") || up.startsWith("IND")) key = "indice";
    else if (up.startsWith("RES")) key = "resumo";
    else if (up.startsWith("INTR")) key = "intro";
    else if (up.startsWith("DES")) key = "dev";
    else if (up.startsWith("CON")) key = "concl";
    else key = "refs";
    matches.push({ key, start: m.index + m[0].length, end: -1 });
    if (matches.length > 1) matches[matches.length - 2].end = m.index;
  }
  if (matches.length) matches[matches.length - 1].end = text.length;
  for (const mt of matches) buckets[mt.key] = text.slice(mt.start, mt.end).trim();
  return buckets;
}

function isUniversityLevel(level: string) {
  const l = (level || "").toLowerCase();
  return l.includes("licenciatura") || l.includes("mestrado") || l.includes("doutoramento") || l.includes("univers") || l.includes("superior");
}

function parseAcademicWorkSchool(text: string, body: WorkFormPayload) {
  let indice = extractBlock(text, "INDICE");
  let resumo = extractBlock(text, "RESUMO");
  let intro = extractBlock(text, "INTRODUCAO");
  let dev = extractBlock(text, "DESENVOLVIMENTO");
  let concl = extractBlock(text, "CONCLUSAO");
  let refsBlock = extractBlock(text, "REFERENCIAS");

  if (!resumo && !intro && !dev && !concl) {
    const b = fallbackHeaderSplit(text);
    indice = indice || b.indice;
    resumo = resumo || b.resumo;
    intro = intro || b.intro;
    dev = dev || b.dev;
    concl = concl || b.concl;
    refsBlock = refsBlock || b.refs;
  }

  if (!dev && intro && intro.length > 2500) {
    dev = intro;
    intro = "";
  }
  if (!dev && !intro && !resumo && !concl) {
    dev = text.trim();
  }

  const refs = refsBlock
    ? refsBlock.split(/\r?\n/).map((l) => l.replace(/^[\-\*\d\.\)\s]+/, "").trim()).filter(Boolean)
    : [];

  const summary = resumo || `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`;

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary,
    sections: [
      { heading: "Índice", content: indice },
      { heading: "Resumo", content: resumo },
      { heading: "Introdução", content: intro },
      { heading: "Desenvolvimento", content: dev },
      { heading: "Conclusão", content: concl },
    ] as AcademicWorkSection[],
    references: refs.length ? refs : ["Adicione aqui as referências bibliográficas com base nas fontes que utilizou."],
  };
}

function parseAcademicWorkUniversity(text: string, body: WorkFormPayload) {
  const indice = extractBlock(text, "INDICE");
  const resumo = extractBlock(text, "RESUMO");
  const cap1 = extractBlock(text, "CAP1_INTRODUCAO");
  const cap2 = extractBlock(text, "CAP2_REVISAO");
  const cap3 = extractBlock(text, "CAP3_DESENVOLVIMENTO");
  const cap4 = extractBlock(text, "CAP4_METODOLOGIA");
  let cap5 = extractBlock(text, "CAP5_CRONOGRAMA");
  const cap6 = extractBlock(text, "CAP6_CONCLUSAO");
  const refsBlock = extractBlock(text, "REFERENCIAS");

  // Extrair tabelas do cap 5
  const cronoRaw = extractTableBlock(cap5, "CRONOGRAMA");
  const orcRaw = extractTableBlock(cap5, "ORCAMENTO");
  const tables: AcademicTable[] = [];
  const cronoTable = parsePipeTable(cronoRaw, "Cronograma");
  const orcTable = parsePipeTable(orcRaw, "Orçamento");
  if (cronoTable) tables.push(cronoTable);
  if (orcTable) tables.push(orcTable);

  // Remover blocos de tabela do texto do cap5 para não duplicar
  cap5 = cap5
    .replace(/\[\[TABLE:CRONOGRAMA\]\][\s\S]*?\[\[\/TABLE:CRONOGRAMA\]\]/gi, "")
    .replace(/\[\[TABLE:ORCAMENTO\]\][\s\S]*?\[\[\/TABLE:ORCAMENTO\]\]/gi, "")
    .trim();

  const refs = refsBlock
    ? refsBlock.split(/\r?\n/).map((l) => l.replace(/^[\-\*\d\.\)\s]+/, "").trim()).filter(Boolean)
    : [];

  const summary = resumo || `Trabalho académico do tipo ${body.workType.toLowerCase()} em ${body.area.toLowerCase()}, com foco em "${body.theme}".`;

  const sections: AcademicWorkSection[] = [
    { heading: "Índice", content: indice },
    { heading: "Resumo", content: resumo },
    { heading: "Capítulo I – Introdução", content: cap1 },
    { heading: "Capítulo II – Revisão da Literatura", content: cap2 },
    { heading: "Capítulo III – Desenvolvimento", content: cap3 },
    { heading: "Capítulo IV – Metodologia", content: cap4 },
    { heading: "Capítulo V – Cronograma e Orçamento", content: cap5, tables },
  ];

  if (cap6 && cap6.length > 50) {
    sections.push({ heading: "Capítulo VI – Conclusão", content: cap6 });
  }

  return {
    title: `${body.workType} em ${body.area}: ${body.theme.substring(0, 80)}`,
    summary,
    sections,
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
    ? `\n\nBaseia o trabalho no seguinte conteúdo extraído de um PDF do utilizador. NÃO copies palavra por palavra; sintetiza e organiza academicamente:\n"""\n${body.pdfText.substring(0, 8000)}\n"""\n`
    : "";

  const pages = Math.max(1, Math.min(120, Number(body.pages) || 5));
  const totalWords = pages * 300;
  const university = isUniversityLevel(body.educationLevel);

  let prompt: string;
  let targetTokens: number;

  if (university) {
    const resumoWords = Math.min(350, Math.round(totalWords * 0.05));
    const cap1Words = Math.round(totalWords * 0.10);
    const cap2Words = Math.round(totalWords * 0.20);
    const cap3Words = Math.round(totalWords * 0.30);
    const cap4Words = Math.round(totalWords * 0.15);
    const cap6Words = Math.round(totalWords * 0.10);
    targetTokens = Math.min(8000, Math.round(totalWords * 1.8) + 1000);

    prompt = `És um redactor académico universitário em ${language}. Vais escrever um trabalho COMPLETO e DETALHADO sobre o tema indicado, com extensão proporcional a ${pages} páginas A4 (≈ ${totalWords} palavras), estruturado em CAPÍTULOS numerados em romanos.

REGRA CRÍTICA DE FORMATAÇÃO — usa EXACTAMENTE estes delimitadores em maiúsculas. NÃO os traduzas, NÃO acrescentes outros. NADA fora dos blocos.

[[SECTION:INDICE]]
CAPÍTULO I – INTRODUÇÃO
   1.1 Contextualização
   1.2 Problema de Pesquisa
   1.3 Justificativa
   1.4 Objectivo Geral
   1.5 Objectivos Específicos
CAPÍTULO II – REVISÃO DA LITERATURA
   2.1 Conceitos Fundamentais
   2.2 Fundamentação Teórica
   2.3 Estudos Relacionados
CAPÍTULO III – DESENVOLVIMENTO
   3.1 Análise do tema
   3.2 Discussão dos principais aspectos
   3.3 Subtemas relacionados com o tema
CAPÍTULO IV – METODOLOGIA
   4.1 Tipo de pesquisa
   4.2 População e amostra
   4.3 Técnicas de recolha de dados
   4.4 Técnicas de análise de dados
CAPÍTULO V – CRONOGRAMA E ORÇAMENTO
CAPÍTULO VI – CONCLUSÃO
REFERÊNCIAS BIBLIOGRÁFICAS
[[/SECTION:INDICE]]

[[SECTION:RESUMO]]
Resumo académico de ≈ ${resumoWords} palavras em 1 parágrafo corrido (contexto, objectivo, metodologia, principais resultados/contribuições).
[[/SECTION:RESUMO]]

[[SECTION:CAP1_INTRODUCAO]]
Total ≈ ${cap1Words} palavras divididos pelas 5 subsecções abaixo. CADA subsecção tem OBRIGATORIAMENTE 3-5 parágrafos completos (mínimo 120 palavras cada).

**1.1 Contextualização**

(3-5 parágrafos contextualizando o tema)

**1.2 Problema de Pesquisa**

(3-5 parágrafos formulando o problema e a pergunta de partida)

**1.3 Justificativa**

(3-5 parágrafos justificando a relevância académica, social e prática)

**1.4 Objectivo Geral**

(1-2 parágrafos com o objectivo geral redigido em verbo no infinitivo)

**1.5 Objectivos Específicos**

(3-5 objectivos específicos, cada um num parágrafo curto, em verbo no infinitivo)
[[/SECTION:CAP1_INTRODUCAO]]

[[SECTION:CAP2_REVISAO]]
Total ≈ ${cap2Words} palavras. CADA subsecção tem OBRIGATORIAMENTE 4-6 parágrafos completos com autores, definições e citações.

**2.1 Conceitos Fundamentais**

(parágrafos com definições dos conceitos-chave do tema)

**2.2 Fundamentação Teórica**

(parágrafos com as principais teorias e abordagens relacionadas)

**2.3 Estudos Relacionados**

(parágrafos resumindo investigações anteriores e suas conclusões)
[[/SECTION:CAP2_REVISAO]]

[[SECTION:CAP3_DESENVOLVIMENTO]]
Parte mais LONGA: total ≈ ${cap3Words} palavras. CADA subsecção tem OBRIGATORIAMENTE 5-8 parágrafos completos com análise crítica, exemplos e dados.

**3.1 Análise do tema**

(parágrafos com análise aprofundada)

**3.2 Discussão dos principais aspectos**

(parágrafos discutindo aspectos centrais com argumentação)

**3.3 Subtemas relacionados com o tema**

(parágrafos explorando subtemas pertinentes)
[[/SECTION:CAP3_DESENVOLVIMENTO]]

[[SECTION:CAP4_METODOLOGIA]]
Total ≈ ${cap4Words} palavras. CADA subsecção tem OBRIGATORIAMENTE 2-4 parágrafos completos.

**4.1 Tipo de pesquisa**

(quanto à natureza, abordagem, objectivos e procedimentos — qualitativa/quantitativa/mista, exploratória/descritiva/explicativa)

**4.2 População e amostra**

(definir universo, amostra, critérios de inclusão/exclusão)

**4.3 Técnicas de recolha de dados**

(entrevistas, questionários, observação, análise documental, etc.)

**4.4 Técnicas de análise de dados**

(análise de conteúdo, estatística descritiva, triangulação, etc.)
[[/SECTION:CAP4_METODOLOGIA]]

[[SECTION:CAP5_CRONOGRAMA]]
Escreve 1-2 parágrafos curtos a apresentar o cronograma da investigação. Depois insere a tabela EXACTAMENTE neste formato (uma linha por etapa, separadores "|", primeira linha = cabeçalho):

[[TABLE:CRONOGRAMA]]
Etapa | Período | Duração
Revisão bibliográfica | Mês 1 a Mês 2 | 2 meses
Elaboração do projecto | Mês 2 | 1 mês
Recolha de dados | Mês 3 a Mês 4 | 2 meses
Análise dos dados | Mês 5 | 1 mês
Redacção do trabalho | Mês 5 a Mês 6 | 2 meses
Revisão e entrega final | Mês 6 | 1 mês
[[/TABLE:CRONOGRAMA]]

Em seguida 1-2 parágrafos curtos a apresentar o orçamento previsto. Depois insere a tabela EXACTAMENTE neste formato (valores em Meticais, formato "1.500,00 MT", última linha "Total"):

[[TABLE:ORCAMENTO]]
Descrição | Valor
Impressão e encadernação | 1.500,00 MT
Material de escritório | 800,00 MT
Transporte e deslocações | 2.500,00 MT
Acesso à internet e dados | 1.200,00 MT
Fotocópias e digitalizações | 600,00 MT
Imprevistos (10%) | 660,00 MT
Total | 7.260,00 MT
[[/TABLE:ORCAMENTO]]

Adapta livremente as etapas e os valores à natureza do tema "${body.theme}", mas mantém a estrutura das tabelas e a moeda em MT (Meticais).
[[/SECTION:CAP5_CRONOGRAMA]]

[[SECTION:CAP6_CONCLUSAO]]
≈ ${cap6Words} palavras em 4-6 parágrafos: retoma objectivos, sintetiza resultados/contributos do trabalho, aponta limitações e sugere investigações futuras.
[[/SECTION:CAP6_CONCLUSAO]]

[[SECTION:REFERENCIAS]]
${Math.max(8, Math.min(20, pages))} referências reais e plausíveis no estilo ${body.style || "APA"}, uma por linha, sem numeração nem bullets.
[[/SECTION:REFERENCIAS]]

DADOS DO TRABALHO:
- Nível de ensino: ${body.educationLevel}
- Tipo: ${body.workType}
- Área: ${body.area}
- Tema: ${body.theme}${body.description ? `\n- Descrição/foco: ${body.description}` : ""}
- Páginas pedidas: ${pages} (≈ ${totalWords} palavras totais)
- Tom: formal académico em português de Portugal${body.languageEn ? " e inglês" : ""}

PROIBIDO escrever só o subtítulo sem desenvolver. PROIBIDO listar bullets em vez de parágrafos. PROIBIDO escrever texto fora dos blocos [[SECTION:...]].
${pdfContext}`;
  } else {
    const introWords = Math.round(totalWords * 0.12);
    const devWords = Math.round(totalWords * 0.65);
    const conclWords = Math.round(totalWords * 0.10);
    const resumoWords = Math.min(350, Math.round(totalWords * 0.05));
    const devSubs = Math.max(3, Math.min(10, Math.ceil(pages / 2)));
    const wordsPerSub = Math.round(devWords / devSubs);
    targetTokens = Math.min(8000, Math.round(totalWords * 1.6) + 700);

    prompt = `És um redactor académico profissional. Vais escrever um trabalho COMPLETO em ${language} sobre o tema indicado, com extensão proporcional a ${pages} páginas A4 (≈ ${totalWords} palavras).

REGRA CRÍTICA DE FORMATAÇÃO — usa EXACTAMENTE estes delimitadores em maiúsculas. NÃO os traduzas, NÃO acrescentes outros. NADA fora dos blocos.

[[SECTION:INDICE]]
1. Resumo
2. Introdução
3. Desenvolvimento
   3.1 (título do subtítulo 1)
   3.2 (título do subtítulo 2)
   ...
4. Conclusão
5. Referências Bibliográficas
[[/SECTION:INDICE]]

[[SECTION:RESUMO]]
Resumo académico de ≈ ${resumoWords} palavras em texto corrido (1 parágrafo).
[[/SECTION:RESUMO]]

[[SECTION:INTRODUCAO]]
≈ ${introWords} palavras em 3-5 parágrafos: contextualização, problema, justificativa, objectivo geral e específicos, metodologia.
[[/SECTION:INTRODUCAO]]

[[SECTION:DESENVOLVIMENTO]]
Parte mais LONGA: ≈ ${devWords} palavras. Divide em ${devSubs} subtítulos numerados (3.1, 3.2, ...). Para CADA subtítulo escreve OBRIGATORIAMENTE ≈ ${wordsPerSub} palavras (3-6 parágrafos completos) com fundamentação teórica, definições, exemplos, análise crítica e ligação ao tema. Formato de cada subtítulo:

**3.1 Título do subtítulo**

Parágrafo 1...

Parágrafo 2...

PROIBIDO escrever só o subtítulo sem desenvolver. PROIBIDO listar bullets em vez de parágrafos.
[[/SECTION:DESENVOLVIMENTO]]

[[SECTION:CONCLUSAO]]
≈ ${conclWords} palavras em 3-5 parágrafos: retoma objectivos, sintetiza resultados, indica limitações e investigações futuras.
[[/SECTION:CONCLUSAO]]

[[SECTION:REFERENCIAS]]
${Math.max(5, Math.min(15, pages))} referências reais e plausíveis no estilo ${body.style || "APA"}, uma por linha, sem numeração nem bullets.
[[/SECTION:REFERENCIAS]]

DADOS DO TRABALHO:
- Nível de ensino: ${body.educationLevel}
- Tipo: ${body.workType}
- Área: ${body.area}
- Tema: ${body.theme}${body.description ? `\n- Descrição/foco: ${body.description}` : ""}
- Páginas pedidas: ${pages} (≈ ${totalWords} palavras totais)
- Tom: formal académico em português de Portugal${body.languageEn ? " e inglês" : ""}
${pdfContext}`;
  }

  try {
    const aiResp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "És um assistente que produz trabalhos académicos completos, longos e bem estruturados em português de Portugal, respeitando rigorosamente os delimitadores [[SECTION:...]] e [[TABLE:...]] pedidos pelo utilizador." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: targetTokens,
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text();
      console.error("Groq error", aiResp.status, errorText);
      if (aiResp.status === 429) return res.status(429).json({ error: "Limite de pedidos atingido. Tente novamente em instantes." });
      if (aiResp.status === 401) return res.status(401).json({ error: "GROQ_API_KEY inválida. Verifique a chave no Vercel." });
      return res.status(500).json({ error: `Groq ${aiResp.status}: ${errorText.slice(0, 400)}` });
    }

    const data = await aiResp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) return res.status(500).json({ error: "Resposta vazia da IA." });

    const academicWork = university ? parseAcademicWorkUniversity(text, body) : parseAcademicWorkSchool(text, body);
    return res.status(200).json({ work: academicWork });
  } catch (error) {
    console.error("generate-work error", error);
    return res.status(500).json({ error: "Erro interno ao gerar o trabalho." });
  }
}
