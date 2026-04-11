const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export async function invokeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const resp = await fetch(`${API_BASE}/${functionName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return { data: null, error: data?.error || `Erro ${resp.status}` };
    }

    return { data, error: null };
  } catch {
    return { data: null, error: "Falha ao contactar o servidor." };
  }
}
