/**
 * Base fetch helper for the NovaOps backend.
 *
 * - Prepends NEXT_PUBLIC_NOVA_API_BASE_URL (falls back to same-origin "").
 * - Injects Content-Type: application/json for all non-FormData bodies.
 * - Injects X-Client-Id when provided (required for role-gated endpoints).
 * - On non-OK responses, throws an Error whose message is the `detail` string
 *   from the FastAPI JSON body, or a generic status-code message.
 */
export async function novaFetch<T>(
  path: string,
  init?: RequestInit,
  clientId?: string,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_NOVA_API_BASE_URL ?? "";
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(clientId ? { "X-Client-Id": clientId } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `NovaOps API error ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // keep the status-based message
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
