import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import type { AcademicWork } from "@/lib/generator";

interface LocationState {
  work?: AcademicWork;
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

const markdownToParagraphs = (text: string, options: { normalize?: boolean } = {}): Paragraph[] => {
  const { normalize = true } = options;
  const paragraphs: Paragraph[] = [];
  const source = normalize ? normalizeSubtitles(text) : text;
  const lines = source.split(/\n+/).filter(Boolean);

  for (const rawLine of lines) {
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

const downloadPdf = (work: AcademicWork) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 72; // 2,54 cm
  const maxWidth = 460;
  const lineHeight = 18;

  doc.setFont("Times", "Normal");
  doc.setFontSize(12);

  const addSection = (title: string, content: string, isFirstPage = false) => {
    if (!isFirstPage) {
      doc.addPage();
    }
    let y = margin;
    doc.setFont("Times", "Bold");
    doc.text(title, margin, y);
    y += lineHeight * 1.5;

    const normalizedWithMarkdown = normalizeSubtitles(content);
    const rawParagraphs = normalizedWithMarkdown.split(/\n{2,}/).filter(Boolean);

    rawParagraphs.forEach((rawParagraph) => {
      const cleanParagraph = stripMarkdown(rawParagraph);
      if (!cleanParagraph.trim()) return;

      const isNumberedSubtitle = /^\d+(?:\.\d+)*\s+.+/.test(cleanParagraph.trim());
      const isBoldMarkdownSubtitle = /^\s*\*\*[^*]+\*\*\s*$/.test(rawParagraph.trim());

      // Títulos e subtítulos sempre a negrito, mas sem marcar com markdown no PDF
      if (isNumberedSubtitle || isBoldMarkdownSubtitle) {
        doc.setFont("Times", "Bold");
      } else {
        doc.setFont("Times", "Normal");
      }

      const lines = doc.splitTextToSize(cleanParagraph, maxWidth);
      lines.forEach((line) => {
        if (y > 800) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y, { align: "justify", maxWidth });
        y += lineHeight;
      });
      y += lineHeight * 0.5; // espaço extra entre parágrafos
    });
  };

  // Página 1: Índice (texto vindo da IA)
  const indiceSection = work.sections.find((s) => s.heading.toLowerCase().startsWith("índice") || s.heading.toLowerCase().startsWith("indice"));
  let y = margin;
  doc.setFont("Times", "Bold");
  doc.text("Índice", margin, y);
  y += lineHeight * 1.5;
  doc.setFont("Times", "Normal");

  const indiceLines = (indiceSection?.content || "")
    .split(/\n+/)
    .filter(Boolean)
    .map((item) => stripMarkdown(item));
  indiceLines.forEach((item) => {
    doc.text(item, margin, y);
    y += lineHeight;
  });

  // Página 2: Resumo (texto gerado pela IA)
  const resumoSection = work.sections.find((s) => s.heading.toLowerCase().startsWith("resumo"));
  addSection("Resumo", resumoSection?.content || work.summary, false);

  const intro = work.sections.find((s) => s.heading.toLowerCase().startsWith("introdu"));
  const dev = work.sections.find((s) => s.heading.toLowerCase().startsWith("desenvolv"));
  const conc = work.sections.find((s) => s.heading.toLowerCase().startsWith("conclus"));

  if (intro) addSection("Introdução", normalizeSubtitles(intro.content));
  if (dev) addSection("Desenvolvimento", normalizeSubtitles(dev.content));
  if (conc) addSection("Conclusão", normalizeSubtitles(conc.content));

  const refsContent =
    work.references.length > 0
      ? work.references.map((r) => `- ${r}`).join("\n")
      : "Adicione aqui as referências bibliográficas com base nas fontes que utilizou.";
  addSection("Referência bibliográfica", refsContent);

  doc.save("trabalho-academico.pdf");
};

const downloadWord = async (work: AcademicWork) => {
  const paragraphs: Paragraph[] = [];

  // Página 1: Índice (texto vindo da IA)
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: "Índice", bold: true })],
    }),
  );

  const indiceSection = work.sections.find((s) => s.heading.toLowerCase().startsWith("índice") || s.heading.toLowerCase().startsWith("indice"));
  if (indiceSection) {
    const indiceParagraphs = markdownToParagraphs(indiceSection.content, { normalize: false });
    paragraphs.push(...indiceParagraphs);
  }


  // Página 2: Título + Resumo
  paragraphs.push(
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "Título", bold: true })],
    }),
  );
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: work.title })],
    }),
  );
  paragraphs.push(
    new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: "Resumo", bold: true })],
    }),
  );
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: work.summary })],
    }),
  );

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

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // ~2,5 cm
          },
        },
        children: paragraphs,
      },
    ],
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
  const indexItems = ["Título", ...work.sections.map((s) => s.heading), "Referência bibliográfica"];

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
                Reveja o texto abaixo. Pode copiar, descarregar em PDF ou Word e fazer os ajustes finais.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(fullText)}>
              Copiar texto
            </Button>
            <Button variant="outline" onClick={() => downloadWord(work)}>
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
