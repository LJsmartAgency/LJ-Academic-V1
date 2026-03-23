

## Plan: Update academic work structure to include Resumo section

**Current issue**: The prompt and parser are missing "Resumo" as a distinct section. Current structure is: Índice → Introdução → Desenvolvimento → Conclusão → Referências. The Resumo is only auto-generated as a one-line summary, not AI-written.

**Target structure**: Índice → Resumo → Introdução → Desenvolvimento (com subtítulos) → Conclusão → Referências

### Changes

**1. Edge function prompt (`supabase/functions/generate-work/index.ts`)**
- Add RESUMO section to the prompt between ÍNDICE and INTRODUÇÃO, instructing the AI to write a proper academic abstract (150-300 words)
- Update the index instruction to include Resumo in the table of contents

**2. Edge function parser (`parseAcademicWork` in same file)**
- Add `resumoText` variable and `"resumo"` state to the parser
- Detect `RESUMO` heading in the line scanner
- Include `{ heading: "Resumo", content: resumoText }` in the sections array between Índice and Introdução
- Use the parsed resumo as `summary` instead of the auto-generated one-liner

**3. Client-side generator fallback (`src/lib/generator.ts`)**
- Add a Resumo section to the local fallback generator's sections array

**4. Result page (`src/pages/Result.tsx`)**
- Remove the duplicate manual "Resumo" render (line 439) since it will now come from sections
- Update the section rendering to naturally display all sections in order (Índice, Resumo, Introdução, Desenvolvimento, Conclusão)
- Update PDF and Word export to include Resumo as its own page/section instead of embedding it in the "Título" page

