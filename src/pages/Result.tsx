import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
  BorderStyle,
  TabStopType,
  LeaderType,
} from "docx";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import type { AcademicWork, WorkFormValues } from "@/lib/generator";

interface LocationState {
  work?: AcademicWork;
  form?: WorkFormValues;
}

const stripMarkdown = (text: string): string => {
  return text
    .replace(/^\*\s+/gm, "") // remove bullets no início da linha
    .replace(/\*\*([^*]+)\*\*/g, "$1"); // remove marcadores de negrito markdown
};

// Garante que subtítulos em negrito fiquem em linha própria, com espaço antes do parágrafo seguinte
const normalizeSubtitles = (text: string): string => {
  let result = text.replace(/^\s*\*\*([^*]+)\*\*\s+(?=\S)/gm, "**$1**\n\n");

  // Também trata subtítulos numerados (ex.: "1.2 O que é..." ou "1.2O que é..."),
  // garantindo um espaço entre o número e o texto, tudo em negrito e em linha própria
  result = result.replace(
    /^(?!\s*\*\*)(\d+(?:\.\d+)*)(\s*)(.+)$/gm,
    (_match, num, _space, title) => `**${String(num).trim()} ${String(title).trim()}**\n\n`,
  );

  return result;
};

// Remove a lista de subtítulos que a IA às vezes despeja no início do Desenvolvimento
const stripSubtitleOutline = (text: string): string => {
  const lines = text.split(/\n/);
  const headingLike = (l: string) => {
    const t = l.trim().replace(/^\*+|\*+$/g, "").trim();
    if (!t || t.length > 100) return false;
    return /^\d+(\s*\.\s*\d+)*\s*\.?\s+\S/.test(t) && !/[;:]$/.test(t) && !/\.\s*$/.test(t);
  };
  const titleOf = (l: string) =>
    l.trim().replace(/^\*+|\*+$/g, "").replace(/^[\d.\s]+/, "").trim().toLowerCase();

  // procura um bloco de 3+ cabeçalhos consecutivos nas primeiras linhas
  let start = -1;
  let end = -1;
  let i = 0;
  let seen = 0;
  while (i < lines.length && seen < 30) {
    if (!lines[i].trim()) { i++; continue; }
    seen++;
    if (headingLike(lines[i])) {
      let j = i;
      while (j < lines.length && (!lines[j].trim() || headingLike(lines[j]))) j++;
      const block = lines.slice(i, j).filter((l) => l.trim());
      if (block.length >= 3) { start = i; end = j; break; }
      i = j;
      continue;
    }
    i++;
  }
  if (start < 0) return text;

  const block = lines.slice(start, end).filter((l) => l.trim());
  const rest = lines.slice(end).join("\n").toLowerCase();
  const repeated = block.filter((l) => titleOf(l) && rest.includes(titleOf(l)));
  if (repeated.length < Math.ceil(block.length / 2)) return text;

  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
};

const markdownToParagraphs = (text: string, options: { normalize?: boolean } = {}): Paragraph[] => {
  const { normalize = true } = options;
  const paragraphs: Paragraph[] = [];
  const source = normalize ? normalizeSubtitles(text) : text;
  const lines = source.split(/\n+/).filter(Boolean);

  for (const rawLine of lines) {
    // Citação directa longa (mais de 3 linhas): marcada com "> " pela IA
    const longQuote = rawLine.match(/^\s*>\s?(.*)$/);
    if (longQuote) {
      const quoteText = longQuote[1].replace(/\*+/g, "").replace(/^["“](.*)["”]$/, "$1").trim();
      if (quoteText) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 2268 }, // 4 cm
            spacing: { line: 240, before: 200, after: 200 }, // espaçamento simples
            children: [new TextRun({ text: quoteText, size: 20 })], // 10 pt
          }),
        );
      }
      continue;
    }

    const line = rawLine.replace(/^\*\s+/, "");
    const runs: TextRun[] = [];
    let lastIndex = 0;
    const regex = /\*\*([^*]+)\*\*/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun({ text: line.slice(lastIndex, match.index) }));
      }
      runs.push(new TextRun({ text: match[1], bold: true }));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      runs.push(new TextRun({ text: line.slice(lastIndex) }));
    }

    const isSubtitleLine = /^\s*\*\*[^*]+\*\*\s*$/.test(line);

    paragraphs.push(
      new Paragraph({
        spacing: isSubtitleLine ? { before: 240 } : undefined,
        children: runs.length > 0 ? runs : [new TextRun({ text: line })],
      }),
    );
  }


  return paragraphs;
};

const buildPlainText = (work: AcademicWork): string => {
  const sectionsText = work.sections
    .map((section) => `${section.heading}\n\n${stripMarkdown(normalizeSubtitles(section.content))}\n`)
    .join("\n-----------------------------\n\n");

  const referencesText = work.references.length
    ? `REFERÊNCIAS\n\n${work.references.map((r) => `- ${r}`).join("\n")}`
    : "";

  return `${work.title.toUpperCase()}\n\nRESUMO\n\n${work.summary}\n\n${sectionsText}\n\n${referencesText}`;
};


const hasCoverData = (form?: WorkFormValues): boolean => {
  if (!form) return false;
  return Boolean(
    form.coverUniversity ||
      form.coverFaculty ||
      form.coverCourse ||
      form.coverYear ||
      form.coverSubject ||
      form.coverGroup ||
      form.coverStudents ||
      form.coverTeacher ||
      form.coverLocation ||
      form.coverDate,
  );
};

const centered = (text: string, opts: { bold?: boolean; size?: number; spaceAfter?: number } = {}) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: opts.spaceAfter ?? 120 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size })],
  });

const buildCoverParagraphs = (work: AcademicWork, form: WorkFormValues): Paragraph[] => {
  const p: Paragraph[] = [];
  if (form.coverUniversity) p.push(centered(form.coverUniversity.toUpperCase(), { bold: true, size: 28 }));
  if (form.coverFaculty) p.push(centered(form.coverFaculty, { bold: true, size: 24 }));
  if (form.coverCourse) p.push(centered(form.coverCourse, { size: 24 }));
  if (form.coverYear) p.push(centered(form.coverYear, { size: 24 }));
  if (form.coverSubject) p.push(centered(`Cadeira: ${form.coverSubject}`, { size: 24 }));
  if (form.coverGroup) p.push(centered(form.coverGroup, { size: 24 }));

  // espaço
  for (let i = 0; i < 4; i++) p.push(centered(""));

  // Tema
  p.push(centered("TEMA:", { bold: true, size: 28 }));
  p.push(centered(work.title.toUpperCase(), { bold: true, size: 28, spaceAfter: 240 }));

  for (let i = 0; i < 3; i++) p.push(centered(""));

  if (form.coverStudents) {
    p.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: "Discentes:", bold: true })],
      }),
    );
    for (const line of form.coverStudents.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      p.push(new Paragraph({ children: [new TextRun({ text: line })] }));
    }
  }

  if (form.coverTeacher) {
    p.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
    p.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Docente:", bold: true })],
      }),
    );
    p.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: form.coverTeacher })],
      }),
    );
  }

  // Rodapé local + data
  for (let i = 0; i < 3; i++) p.push(centered(""));
  if (form.coverLocation) p.push(centered(form.coverLocation, { bold: true }));
  if (form.coverDate) p.push(centered(form.coverDate, { bold: true }));

  return p;
};

const buildBackCoverParagraphs = (work: AcademicWork, form: WorkFormValues): Paragraph[] => {
  // Contra-capa: versão simplificada (sem universidade/faculdade no topo? — manter mas mais limpo)
  const p: Paragraph[] = [];
  if (form.coverUniversity) p.push(centered(form.coverUniversity.toUpperCase(), { bold: true, size: 28 }));
  if (form.coverCourse) p.push(centered(form.coverCourse, { size: 24 }));
  if (form.coverSubject) p.push(centered(`Cadeira: ${form.coverSubject}`, { size: 24 }));

  for (let i = 0; i < 4; i++) p.push(centered(""));

  p.push(centered(work.title.toUpperCase(), { bold: true, size: 28, spaceAfter: 240 }));

  for (let i = 0; i < 3; i++) p.push(centered(""));

  if (form.coverStudents) {
    p.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: "Discentes:", bold: true })],
      }),
    );
    for (const line of form.coverStudents.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      p.push(new Paragraph({ children: [new TextRun({ text: line })] }));
    }
  }

  // Nota da contra-capa: trabalho a ser entregue
  p.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  p.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 4500 },
      children: [
        new TextRun({
          text: `Trabalho de carácter avaliativo a ser entregue${form.coverTeacher ? ` ao(à) ${form.coverTeacher}` : ""}${form.coverSubject ? `, na cadeira de ${form.coverSubject}` : ""}.`,
        }),
      ],
    }),
  );

  for (let i = 0; i < 3; i++) p.push(centered(""));
  if (form.coverLocation) p.push(centered(form.coverLocation, { bold: true }));
  if (form.coverDate) p.push(centered(form.coverDate, { bold: true }));

  return p;
};

// Extrai os subtítulos reais de uma secção (linhas em negrito e/ou numeradas)
const extractSubheadings = (content: string): string[] => {
  const out: string[] = [];
  for (const raw of normalizeSubtitles(content).split(/\n+/)) {
    const line = raw.trim();
    if (!line || line.startsWith(">")) continue;
    const bold = line.match(/^\*\*([^*]+)\*\*$/);
    const candidate = bold ? bold[1].trim() : /^\d+(\.\d+)*\s+\S/.test(line) && line.length <= 90 ? line : null;
    if (candidate && !out.includes(candidate)) out.push(candidate);
  }
  return out;
};

// Constrói o índice a partir das secções e subtítulos reais, com páginas estimadas
const buildIndexEntries = (work: AcademicWork): { label: string; page: number; level: number }[] => {
  const entries: { label: string; page: number; level: number }[] = [];
  const wordsPerPage = 300;
  let page = 2; // página 1 é o índice

  const sectionByPrefix = (prefix: string) =>
    work.sections.find((s) => s.heading.toLowerCase().startsWith(prefix));

  const pushSection = (label: string, content: string, withSubs: boolean) => {
    entries.push({ label, page, level: 0 });
    if (withSubs) {
      const subs = extractSubheadings(content);
      const words = content.split(/\s+/).filter(Boolean).length;
      const pagesUsed = Math.max(1, Math.round(words / wordsPerPage));
      subs.forEach((sub, i) => {
        entries.push({
          label: sub,
          page: page + Math.floor((i * pagesUsed) / Math.max(1, subs.length)),
          level: 1,
        });
      });
      page += pagesUsed;
    } else {
      const words = content.split(/\s+/).filter(Boolean).length;
      page += Math.max(1, Math.round(words / wordsPerPage));
    }
  };

  const resumo = sectionByPrefix("resumo");
  pushSection("Resumo", resumo?.content || work.summary, false);

  const intro = sectionByPrefix("introdu");
  if (intro?.content) pushSection("Introdução", intro.content, false);

  const dev = sectionByPrefix("desenvolv");
  if (dev?.content) pushSection("Desenvolvimento", dev.content, true);

  const conc = sectionByPrefix("conclus");
  if (conc?.content) pushSection("Conclusão", conc.content, false);

  entries.push({ label: "Referência bibliográfica", page, level: 0 });
  return entries;
};

const downloadWord = async (work: AcademicWork, form?: WorkFormValues) => {
  const paragraphs: Paragraph[] = [];

  // Página 1: Índice (texto vindo da IA)
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: "Índice", bold: true })],
    }),
  );

  // Índice construído automaticamente a partir das secções e subtítulos reais do trabalho
  const indexEntries = buildIndexEntries(work);
  for (const entry of indexEntries) {
    paragraphs.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: LeaderType.DOT }],
        indent: entry.level > 0 ? { left: 400 } : undefined,
        children: [
          new TextRun({ text: entry.label, bold: entry.level === 0 }),
          new TextRun({ text: `\t${entry.page}` }),
        ],
      }),
    );
  }


  // Página 2: Resumo
  const resumoSectionWord = work.sections.find((s) => s.heading.toLowerCase().startsWith("resumo"));
  paragraphs.push(
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "Resumo", bold: true })],
    }),
  );
  paragraphs.push(...markdownToParagraphs(resumoSectionWord?.content || work.summary));

  const intro = work.sections.find((s) => s.heading.toLowerCase().startsWith("introdu"));
  const dev = work.sections.find((s) => s.heading.toLowerCase().startsWith("desenvolv"));
  const conc = work.sections.find((s) => s.heading.toLowerCase().startsWith("conclus"));

  if (intro) {
    paragraphs.push(
      new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: "Introdução", bold: true })],
      }),
    );
    paragraphs.push(...markdownToParagraphs(intro.content));
  }

  if (dev) {
    paragraphs.push(
      new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: "Desenvolvimento", bold: true })],
      }),
    );
    paragraphs.push(...markdownToParagraphs(dev.content));
  }

  if (conc) {
    paragraphs.push(
      new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: "Conclusão", bold: true })],
      }),
    );
    paragraphs.push(...markdownToParagraphs(conc.content));
  }

  // Página final: Referência bibliográfica
  paragraphs.push(
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "Referência bibliográfica", bold: true })],
    }),
  );
  if (work.references.length > 0) {
    for (const ref of work.references) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: ref })],
        }),
      );
    }
  } else {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Adicione aqui as referências bibliográficas com base nas fontes que utilizou.",
          }),
        ],
      }),
    );
  }

  const baseMargin = { top: 1134, right: 1134, bottom: 1134, left: 1134 };
  const thinBorder = {
    style: BorderStyle.SINGLE,
    size: 12, // ~1pt
    color: "000000",
    space: 24,
  };

  const sections: NonNullable<ConstructorParameters<typeof Document>[0]["sections"]>[number][] = [];

  if (hasCoverData(form)) {
    const universityLevels = ["Universitário", "Licenciatura", "Mestrado", "Doutoramento"];
    const isUniversity = universityLevels.includes(form?.educationLevel || "");


    const capa = buildCoverParagraphs(work, form!);
    const coverChildren: Paragraph[] = [...capa];

    if (isUniversity) {
      // Universidade: capa + contra-capa
      coverChildren.push(new Paragraph({ children: [new PageBreak()] }));
      coverChildren.push(...buildBackCoverParagraphs(work, form!));
    }

    sections.push({
      properties: {
        page: {
          margin: baseMargin,
          borders: {
            pageBorderTop: thinBorder,
            pageBorderRight: thinBorder,
            pageBorderBottom: thinBorder,
            pageBorderLeft: thinBorder,
          },
        },
      },
      children: coverChildren,
    });
  }

  sections.push({
    properties: { page: { margin: baseMargin } },
    children: paragraphs,
  });

  const doc = new Document({
    sections,
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 24, // 12 pt (half-points)
          },
          paragraph: {
            spacing: {
              line: 360, // 1.5 * 240
              lineRule: "atLeast",
            },
          },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "trabalho-academico.docx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const Result = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState) || {};
  const work = state.work;
  const formValues = state.form;

  useEffect(() => {
    document.title = "Resultado | LJsmart-Academic";

    const description =
      "Visualize o trabalho académico gerado pela LJsmart-Academic e faça o download em PDF ou Word.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href;
  }, []);

  if (!work) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Nenhum trabalho para mostrar.</p>
          <Button onClick={() => navigate("/criar-trabalho")}>
            Voltar para criar trabalho
          </Button>
        </div>
      </div>
    );
  }

  const fullText = buildPlainText(work);
  const indexItems = buildIndexEntries(work).map((e) => (e.level > 0 ? `   ${e.label}` : e.label));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <span className="text-lg font-bold">LJ</span>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">LJsmart-Academic</p>
              <p className="text-xs text-muted-foreground">Pesquisa inteligente em poucos cliques</p>
            </div>
          </button>
        </div>
      </header>
      <div className="container py-8">
        <header className="mb-6 flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full border border-border/60"
              onClick={() => navigate("/criar-trabalho")}
              aria-label="Voltar ao formulário"
            >
              <span className="text-lg">←</span>
            </Button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">LJsmart-Academic</p>
              <h1 className="text-2xl font-bold tracking-tight">Trabalho gerado</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Reveja o texto abaixo. Pode copiar, descarregar em Word e fazer os ajustes finais.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(fullText)}>
              Copiar texto
            </Button>
            <Button variant="outline" onClick={() => downloadWord(work, formValues)}>
              Descarregar Word
            </Button>
          </div>
        </header>

        <main className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)]">
          <section className="space-y-4 rounded-xl border border-border bg-card/70 p-6 shadow-sm">
            <h2 className="text-xl font-semibold leading-snug">{work.title}</h2>

            <div className="space-y-10 text-sm leading-relaxed">
              {(() => {
                const indiceSection = work.sections.find(
                  (s) => s.heading.toLowerCase().startsWith("índice") || s.heading.toLowerCase().startsWith("indice"),
                );
                const resumoSection = work.sections.find((s) => s.heading.toLowerCase().startsWith("resumo"));
                const intro = work.sections.find((s) => s.heading.toLowerCase().startsWith("introdu"));
                const dev = work.sections.find((s) => s.heading.toLowerCase().startsWith("desenvolv"));
                const conc = work.sections.find((s) => s.heading.toLowerCase().startsWith("conclus"));

                const renderSection = (title: string, content: string, options: { normalize?: boolean } = {}) => {
                  const { normalize = true } = options;
                  const normalizedContent = normalize ? normalizeSubtitles(content) : content;
                  return (
                    <article key={title} className="space-y-3 border-t border-border/60 pt-6 first:border-none first:pt-0">
                      <h3 className="text-base font-semibold text-foreground">{title}</h3>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{normalizedContent}</ReactMarkdown>
                      </div>
                    </article>
                  );
                };

                return (
                  <>
                    {indiceSection && renderSection(indiceSection.heading, indiceSection.content, { normalize: false })}
                    {resumoSection && renderSection("Resumo", resumoSection.content)}
                    {intro && renderSection("Introdução", intro.content)}
                    {dev && renderSection("Desenvolvimento", dev.content)}
                    {conc && renderSection("Conclusão", conc.content)}
                  </>
                );
              })()}

              <section className="border-t border-border/60 pt-6">
                <h3 className="text-sm font-semibold text-foreground">Referência bibliográfica</h3>
                {work.references.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {work.references.map((ref) => (
                      <li key={ref}>{ref}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Adicione aqui as referências bibliográficas com base nas fontes que utilizou.
                  </p>
                )}
              </section>
            </div>
          </section>

          <aside className="space-y-4 rounded-xl border border-border bg-muted/40 p-5 text-xs text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">Próximos passos sugeridos</h2>
            <ol className="list-decimal space-y-2 pl-4">
              <li>Adapte o texto às regras específicas da sua instituição (formato, citações, margens).</li>
              <li>Inclua bibliografia real baseada nas fontes que utilizou.</li>
              <li>Revise ortografia, concordância e dados técnicos antes de entregar.</li>
            </ol>
            <Button variant="ghost" className="mt-2 px-0 text-xs font-semibold" onClick={() => navigate("/criar-trabalho")}>
              Criar outro trabalho
            </Button>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default Result;
