import { emitAlertEvent } from "../alerts/bus";

/**
 * Base fetch helper for the NovaOps backend.
 *
 * - Prepends NEXT_PUBLIC_NOVA_API_BASE_URL (falls back to same-origin "").
 * - Injects Content-Type: application/json for all non-FormData bodies.
 * - Injects X-Client-Id when provided (required for role-gated endpoints).
 * - On non-OK responses, throws an Error whose message is the `detail` string
 *   from the FastAPI JSON body, or a generic status-code message.
 * - Raises a global *event* alert on network failures and server (5xx) errors.
 *   4xx are deliberately NOT alerted: they are usually expected/handled
 *   (role lockout, validation) and callers surface them inline. Emitting is a
 *   no-op when no alert system is listening.
 */
export async function novaFetch<T>(
  path: string,
  init?: RequestInit,
  clientId?: string,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_NOVA_API_BASE_URL ?? "";
  const method = init?.method ?? "GET";

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(clientId ? { "X-Client-Id": clientId } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    emitAlertEvent({
      severity: "error",
      source: "api",
      title: "Network error",
      detail: `${method} ${path} — ${e instanceof Error ? e.message : "request failed"}`,
    });
    throw e;
  }

  if (!res.ok) {
    let message = `NovaOps API error ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // keep the status-based message
    }
    if (res.status >= 500) {
      emitAlertEvent({
        severity: "error",
        source: "api",
        title: `API error ${res.status}`,
        detail: `${method} ${path} — ${message}`,
      });
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
