## Corrigir erro "Groq 404 — modelo não existe"

### O que os erros significam
- **Avisos amarelos no Vercel** (allow-scripts, chunk size): são apenas avisos, não impedem o app. Não é preciso fazer nada.
- **Erro vermelho no app**: a Groq retirou (ou a tua conta não tem acesso a) o modelo `llama-3.1-8b-instant`. É por isso que a geração falha.

### Solução
Em vez de fixar um nome de modelo que a Groq pode descontinuar a qualquer momento, o app passa a **escolher automaticamente** um modelo disponível na tua conta:

1. Antes de gerar, o servidor pergunta à Groq quais modelos estão ativos para a tua chave.
2. Usa o primeiro disponível de uma lista de preferência (os melhores gratuitos primeiro):
   - Texto: `openai/gpt-oss-120b` → `llama-3.3-70b-versatile` → `openai/gpt-oss-20b` → `llama-3.1-8b-instant` → qualquer outro modelo de texto ativo.
   - Imagem (correção de exames): `meta-llama/llama-4-scout-17b-16e-instruct` → `meta-llama/llama-4-maverick-17b-128e-instruct` → qualquer modelo com visão ativo.
3. Se um modelo falhar com "não existe", tenta automaticamente o seguinte da lista.
4. Mensagem de erro clara em português se nenhum modelo estiver disponível.

### Detalhes técnicos
- Novo helper partilhado `api/_groq.ts`: `GET https://api.groq.com/openai/v1/models` (cache em memória ~10 min), função `groqChat(messages, opts, kind)` com fallback em 404/`model_not_found`.
- `api/generate-work.ts`, `api/generate-description.ts`, `api/generate-correction.ts` passam a usar o helper; limites de `max_tokens` ajustados ao modelo escolhido (máx. 8000).
- Continua a usar apenas `GROQ_API_KEY` do Vercel; sem `@vercel/node`.
- Depois: sincronizar com GitHub e redeploy no Vercel.
