# Estrutura universitário completa (Capítulos I-VI)

Adicionar uma estrutura específica para trabalhos universitários, com capítulos numerados em romanos, cronograma e orçamento em tabelas Word reais.

## 1. Detecção do modo licenciatura 

Em `api/generate-work.ts`, considerar "modo universitário" quando `body.educationLevel` contiver `"licenciatura"` (case-insensitive). Cobre Universidade, Ensino Superior, licenciatura, mestrado, etc. Para os restantes níveis mantém-se a estrutura actual.

## 2. Novo prompt + delimitadores

Para o modo universitário, o prompt passa a pedir à IA estes blocos exactos (em vez dos 6 actuais):

```
[[SECTION:INDICE]] ... [[/SECTION:INDICE]]
[[SECTION:RESUMO]] ... [[/SECTION:RESUMO]]
[[SECTION:CAP1_INTRODUCAO]]
**1.1 Contextualização**  ...parágrafos...
**1.2 Problema de Pesquisa** ...
**1.3 Justificativa** ...
**1.4 Objectivo Geral** ...
**1.5 Objectivos Específicos** ...
[[/SECTION:CAP1_INTRODUCAO]]
[[SECTION:CAP2_REVISAO]]
**2.1 Conceitos Fundamentais** ...
**2.2 Fundamentação Teórica** ...
**2.3 Estudos Relacionados** ...
[[/SECTION:CAP2_REVISAO]]
[[SECTION:CAP3_DESENVOLVIMENTO]]
**3.1 Análise do tema** ...
**3.2 Discussão dos principais aspectos** ...
**3.3 Subtemas relacionados** ...
[[/SECTION:CAP3_DESENVOLVIMENTO]]
[[SECTION:CAP4_METODOLOGIA]]
**4.1 Tipo de pesquisa** ...
**4.2 População e amostra** ...
**4.3 Técnicas de recolha de dados** ...
**4.4 Técnicas de análise de dados** ...
[[/SECTION:CAP4_METODOLOGIA]]
[[SECTION:CAP5_CRONOGRAMA]]
... texto introdutório curto ...
[[TABLE:CRONOGRAMA]]
Etapa | Período | Duração
Revisão bibliográfica | Mês 1 a Mês 2 | 2 meses
Recolha de dados | ... | ...
...
[[/TABLE:CRONOGRAMA]]

... texto introdutório curto ...
[[TABLE:ORCAMENTO]]
Descrição | Valor (MZN)
Impressão e encadernação | 1.500,00 MT
Transporte | 2.000,00 MT
...
Total | XX.XXX,XX MT
[[/TABLE:ORCAMENTO]]
[[/SECTION:CAP5_CRONOGRAMA]]
[[SECTION:CAP6_CONCLUSAO]] ... [[/SECTION:CAP6_CONCLUSAO]]
[[SECTION:REFERENCIAS]] ... [[/SECTION:REFERENCIAS]]
```

Regras enviadas à IA:

- Cada subsecção (1.1, 1.2, ...) escreve **obrigatoriamente 3-5 parágrafos completos** com fundamentação.
- Distribuição de palavras proporcional a `pages` (Cap I-IV ficam com ~80% do total; Cap V curto + tabelas; Cap VI ~10%).
- Tabelas com `|` como separador, primeira linha = cabeçalho, última linha do orçamento = "Total".
- Moeda em **MZN** (Metical), formato `1.500,00 MT`.
- Cronograma: colunas fixas `Etapa | Período | Duração`.

## 3. Parser (`parseAcademicWork`)

Em modo universitário, mudar a forma do resultado devolvido — `sections` passa a ter:

```
Índice, Resumo,
Capítulo I – Introdução,
Capítulo II – Revisão da Literatura,
Capítulo III – Desenvolvimento,
Capítulo IV – Metodologia,
Capítulo V – Cronograma e Orçamento,
Capítulo VI – Conclusão
```

Para o Cap. V, extrair os blocos `[[TABLE:CRONOGRAMA]]` e `[[TABLE:ORCAMENTO]]` para uma estrutura nova:

```ts
interface AcademicTable { title: string; headers: string[]; rows: string[][]; }
interface AcademicWorkSection {
  heading: string;
  content: string;
  tables?: AcademicTable[]; // novo campo opcional
}
```

(campo opcional → não quebra o modo escolar actual)

Cap. VI (Conclusão) só é incluído se a IA devolveu conteúdo não vazio — torna-se opcional como pedido.

## 4. Renderização no Word (`src/pages/Result.tsx`)

- Importar `Table, TableRow, TableCell, WidthType` de `docx`.
- Nova função `buildTable(table: AcademicTable): Table` — cria tabela com bordas finas, cabeçalho a negrito sobre fundo claro, larguras automáticas, linha "Total" do orçamento a negrito.
- Quando uma section tem `tables`, renderizar: título do capítulo → parágrafos do `content` → cada tabela (com legenda "Tabela X – Cronograma" / "Tabela X – Orçamento") → quebra de página se for o último elemento do capítulo.
- Os capítulos universitários usam o título `CAPÍTULO I – INTRODUÇÃO` centrado, negrito, maiúsculas, tamanho ligeiramente maior — em vez do estilo de heading simples actual.
- Preview HTML do Result.tsx também renderiza as tabelas (`<table>` com classes Tailwind) para o utilizador ver antes de descarregar.

## 5. Schema (`src/lib/generator.ts`)

- Acrescentar o campo opcional `tables?: AcademicTable[]` ao tipo `AcademicWorkSection` e exportar `AcademicTable`.
- Sem alterações ao formulário — a detecção é automática pelo `educationLevel`.

## 6. Detalhes técnicos

- `max_tokens` aumenta um pouco no modo universitário (mais subsecções): `Math.min(8000, Math.round(totalWords * 1.8) + 1000)`.
- Distribuição de palavras: Cap I 10%, Cap II 20%, Cap III 30%, Cap IV 15%, Cap V 5% (curto, dominado por tabelas), Cap VI 10%, Resumo 5%, Referências fora da contagem.
- Subsecções mínimas: 3-5 parágrafos cada, ≈ `wordsPerSubsection` calculado por capítulo.
- Cronograma padrão sugerido à IA: 5-7 etapas (Revisão bibliográfica, Elaboração do projecto, Recolha de dados, Análise dos dados, Redacção, Revisão final, Entrega).
- Orçamento padrão sugerido: 5-8 linhas + Total (impressão, encadernação, transporte, material de escritório, internet, etc.).
- Fallback: se a IA falhar a devolver `[[TABLE:...]]`, fazer parse linha-a-linha pelo `|` no texto da secção; se mesmo assim falhar, mostrar o texto cru.

## Ficheiros alterados

- `api/generate-work.ts` — branch universitário com novo prompt + parser de tabelas.
- `src/lib/generator.ts` — tipos `AcademicTable` + campo opcional `tables`.
- `src/pages/Result.tsx` — renderização Word + HTML de tabelas e títulos de capítulo.

Nada no formulário (`src/pages/CreateWork.tsx`) precisa mudar.