import { z } from "zod";

export const workFormSchema = z
  .object({
    educationLevel: z.string().min(1, "Selecione o nível de ensino"),
    workType: z.string().min(1, "Selecione o tipo de trabalho"),
    area: z.string().min(2, "Informe a área ou disciplina").max(120, "Use até 120 caracteres"),
    theme: z
      .string()
      .min(3, "Informe o tema do trabalho")
      .max(200, "Use até 200 caracteres para o tema"),
    description: z
      .string()
      .max(600, "Resuma a descrição em até 600 caracteres")
      .optional()
      .default(""),
    pages: z
      .string()
      .min(1, "Informe a quantidade de páginas")
      .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0 && Number(value) <= 120, {
        message: "Use um número entre 1 e 120",
      }),
    languagePtBr: z.boolean().default(true),
    languageEn: z.boolean().default(false),
    style: z.string().optional(),
    tone: z.string().optional(),
    // Dados da capa / contra-capa (todos opcionais)
    coverUniversity: z.string().max(150).optional().default(""),
    coverFaculty: z.string().max(150).optional().default(""),
    coverCourse: z.string().max(150).optional().default(""),
    coverYear: z.string().max(20).optional().default(""),
    coverSubject: z.string().max(150).optional().default(""),
    coverGroup: z.string().max(50).optional().default(""),
    coverStudents: z.string().max(600).optional().default(""),
    coverTeacher: z.string().max(150).optional().default(""),
    coverLocation: z.string().max(100).optional().default(""),
    coverDate: z.string().max(50).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.languagePtBr && !data.languageEn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione pelo menos um idioma",
        path: ["languagePtBr"],
      });
    }
  });

export type WorkFormValues = z.infer<typeof workFormSchema>;

export interface AcademicWorkSection {
  heading: string;
  content: string;
}

export interface AcademicWork {
  title: string;
  summary: string;
  sections: AcademicWorkSection[];
  references: string[];
}

export const generateAcademicWork = (data: WorkFormValues): AcademicWork => {
  const pagesNumber = Number(data.pages) || 1;
  const baseLengthFactor = Math.min(Math.max(pagesNumber, 1), 40);

  const educationLabel = data.educationLevel;
  const workTypeLabel = data.workType;

  const title = `${workTypeLabel} em ${data.area}: ${data.theme.substring(0, 80)}${
    data.theme.length > 80 ? "..." : ""
  }`;

  const intro = `Este ${workTypeLabel.toLowerCase()} tem como objetivo analisar o tema "${
    data.theme
  }" no contexto de ${data.area.toLowerCase()}, considerando as demandas atuais do nível ${educationLabel.toLowerCase()}.

${data.description ? data.description + "\n\n" : ""}A introdução apresenta o problema central, os objetivos geral e específicos, a justificativa da relevância do estudo para o campo de ${data.area.toLowerCase()}, a delimitação do objeto de estudo (contexto, recorte temporal e/ou espacial) e uma breve descrição da metodologia adotada.`;

  const development = `No desenvolvimento, são discutidos os principais conceitos teóricos relacionados a "${
    data.theme
  }", com destaque para contribuições clássicas e contemporâneas na área de ${data.area.toLowerCase()}.

São apresentados argumentos, exemplos e evidências que permitem compreender as implicações práticas do tema, sempre relacionando a literatura com a realidade atual. A organização do texto busca acompanhar a estrutura lógica do raciocínio, facilitando a leitura e a compreensão.`;

  const extraParagraph =
    baseLengthFactor > 10
      ? `\n\nAlém disso, são exploradas possíveis abordagens metodológicas para o estudo de "${data.theme}", indicando caminhos para pesquisas futuras e para a aplicação dos conceitos em contextos reais, sejam eles acadêmicos, profissionais ou sociais.`
      : "";

  const conclusion = `Na conclusão, retomam-se os principais pontos discutidos ao longo do trabalho, ressaltando como a análise de "${
    data.theme
  }" em ${data.area.toLowerCase()} contribui para o entendimento mais amplo do fenômeno estudado.

São apresentadas considerações finais, limitações do estudo e sugestões de aprofundamento, incentivando a continuidade da pesquisa e o diálogo crítico sobre o tema.`;

  const references: string[] = [
    "SOBRENOME, Nome. Título do livro ou artigo. Cidade: Editora, ano.",
    "AUTOR, A. A.; AUTOR, B. B. Referência complementar sobre o tema.",
  ];

  const resumo = `Este ${workTypeLabel.toLowerCase()} analisa o tema "${data.theme}" no âmbito de ${data.area.toLowerCase()}, ao nível do ${educationLabel.toLowerCase()}. O objectivo central é compreender os principais conceitos, implicações e contribuições teóricas associadas ao tema. A metodologia baseia-se numa revisão bibliográfica de fontes clássicas e contemporâneas. Os resultados indicam a relevância do tema para o campo de estudo e apontam caminhos para investigações futuras.`;

  const sections: AcademicWorkSection[] = [
    { heading: "Resumo", content: resumo },
    { heading: "Introdução", content: intro },
    { heading: "Desenvolvimento", content: development + extraParagraph },
    { heading: "Conclusão", content: conclusion },
  ];

  const summary = `Trabalho acadêmico do tipo ${workTypeLabel.toLowerCase()} em ${data.area.toLowerCase()}, com foco em "${
    data.theme
  }".`;

  return {
    title,
    summary,
    sections,
    references,
  };
};
