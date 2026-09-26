// Helper partilhado: escolhe automaticamente um modelo Groq disponível.
// Ficheiros começados por "_" não são expostos como rotas no Vercel.
const GROQ_BASE = "https://api.groq.com/openai/v1";

const TEXT_PREFS = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];
const VISION_PREFS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
];

let cache: { ids: string[]; at: number } | null = null;

async function listModels(key: string): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.ids;
  try {
    const r = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    const d = await r.json();
    const ids: string[] = (d?.data || []).filter((m: any) => m?.active !== false).map((m: any) => m.id);
    cache = { ids, at: Date.now() };
    return ids;
  } catch {
    return [];
  }
}

function candidates(available: string[], kind: "text" | "vision"): string[] {
  const prefs = kind === "vision" ? VISION_PREFS : TEXT_PREFS;
  if (!available.length) return prefs;
  const ordered = prefs.filter((p) => available.includes(p));
  const excluded = /whisper|tts|guard|embed|playai|orpheus|compound|safeguard/i;
  const extra = available.filter((id) => !ordered.includes(id) && !excluded.test(id) &&
    (kind === "vision" ? /llama-4|vision/i.test(id) : true));
  return [...ordered, ...extra];
}

export type GroqResult = { ok: true; text: string; model: string } | { ok: false; status: number; error: string };

// Extrai o texto da resposta, cobrindo os campos alternativos usados por alguns modelos
function extractText(d: any): string {
  const msg = d?.choices?.[0]?.message;
  const parts: string[] = [];
  if (typeof msg?.content === "string") parts.push(msg.content);
  else if (Array.isArray(msg?.content)) {
    for (const c of msg.content) if (typeof c?.text === "string") parts.push(c.text);
  }
  if (!parts.join("").trim() && typeof msg?.reasoning === "string") parts.push(msg.reasoning);
  if (!parts.join("").trim() && typeof d?.choices?.[0]?.text === "string") parts.push(d.choices[0].text);
  return parts.join("\n").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function groqChat(
  key: string,
  messages: any[],
  opts: { temperature?: number; max_tokens?: number; minChars?: number },
  kind: "text" | "vision" = "text",
): Promise<GroqResult> {
  const list = candidates(await listModels(key), kind);
  const minChars = opts.minChars ?? 40;
  let lastErr = "Nenhum modelo Groq disponível para a sua chave.";

  // Duas voltas por toda a lista de modelos: nunca aceitamos resposta vazia
  for (let round = 0; round < 2; round++) {
    for (const model of list) {
      let r: Response;
      try {
        r = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.7,
            max_tokens: Math.min(8000, opts.max_tokens ?? 2000),
          }),
        });
      } catch (e) {
        lastErr = "Falha de rede ao contactar a IA.";
        console.error("Groq network error", model, e);
        continue;
      }

      if (r.ok) {
        const d = await r.json().catch(() => null);
        const text = extractText(d);
        if (text.length >= minChars) return { ok: true, text, model };
        // Resposta vazia ou demasiado curta → descarta e tenta o modelo seguinte
        lastErr = "A IA não devolveu texto suficiente. Tente novamente.";
        console.error("Groq empty response", model, JSON.stringify(d)?.slice(0, 300));
        continue;
      }

      const errText = await r.text();
      console.error("Groq error", model, r.status, errText.slice(0, 300));
      if (r.status === 401) return { ok: false, status: 401, error: "GROQ_API_KEY inválida. Verifique a chave no Vercel." };
      if (r.status === 429) {
        lastErr = "Limite de pedidos atingido. Tente novamente em instantes.";
        await sleep(1200);
        continue;
      }
      // 404 / modelo descontinuado / pedido inválido para este modelo → tenta o próximo
      if (r.status === 404 || r.status === 400 || /model_not_found|decommissioned|does not exist/i.test(errText)) {
        lastErr = `Modelo ${model} indisponível.`;
        continue;
      }
      lastErr = `Groq ${r.status}: ${errText.slice(0, 200)}`;
    }
  }
  return { ok: false, status: 503, error: lastErr };
}
