

## Plan: Migrar App para GitHub sem Supabase, mantendo a IA

### Situacao Actual

A app usa o Supabase **apenas** para 3 Edge Functions de IA:
- `generate-description` - gera descricoes
- `generate-work` - gera trabalhos academicos
- `generate-correction` - guiao de correcao de exames

Nao ha tabelas em uso no frontend, nao ha autenticacao, nao ha storage. O unico uso real do Supabase e como host das Edge Functions que chamam a Lovable AI Gateway.

### O Problema

A Lovable AI Gateway (`ai.gateway.lovable.dev`) so funciona dentro do ecossistema Lovable com a `LOVABLE_API_KEY`. Fora da Lovable, esta chave nao funcionara. Precisas de uma alternativa para a IA.

### Solucao Proposta

Substituir as Edge Functions do Supabase por **API routes no servidor de deploy** (ex: Vercel Serverless Functions, Netlify Functions, ou um backend Node.js simples), usando a **Google Gemini API directamente** com a tua propria `GEMINI_API_KEY`.

### Alteracoes

**1. Criar API endpoints substitutos (3 ficheiros)**

Criar pastas `api/` compativeis com Vercel/Netlify:
- `api/generate-description.ts` - mesma logica, chama Gemini directamente
- `api/generate-work.ts` - mesma logica, chama Gemini directamente  
- `api/generate-correction.ts` - mesma logica, chama Gemini directamente

Cada ficheiro usara `fetch` para chamar `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` com a `GEMINI_API_KEY` como variavel de ambiente do servidor.

**2. Criar servico de API no frontend (`src/lib/api.ts`)**

Substituir as chamadas `supabase.functions.invoke()` por chamadas `fetch()` directas aos novos endpoints `/api/generate-*`.

**3. Actualizar paginas do frontend (2 ficheiros)**

- `src/pages/CreateWork.tsx` - usar `api.ts` em vez de `supabase.functions.invoke`
- `src/pages/ExamCorrection.tsx` - usar `api.ts` em vez de `supabase.functions.invoke`

**4. Remover dependencias do Supabase**

- Remover `@supabase/supabase-js` do `package.json`
- Remover `src/integrations/supabase/` (client.ts, types.ts)
- Remover `.env` com variaveis Supabase
- Manter `supabase/functions/` como referencia ou remover

**5. Configuracao de deploy**

No servico de hosting (Vercel, Netlify, etc.), configurar a variavel de ambiente:
- `GEMINI_API_KEY` - a tua chave da Google Gemini API

### Onde fazer deploy

| Plataforma | Tipo | Custo |
|------------|------|-------|
| Vercel | Serverless Functions + Static | Gratis (hobby) |
| Netlify | Functions + Static | Gratis (starter) |
| Railway | Node.js server | ~5$/mes |

### Resumo

Sim, e perfeitamente possivel. A app continuara a funcionar com IA, mas em vez de usar Supabase Edge Functions + Lovable AI, usara directamente a Google Gemini API atraves de serverless functions no teu servidor de deploy. Precisas apenas de uma `GEMINI_API_KEY` valida (obtem em [Google AI Studio](https://ai.google.dev/)).

