import { novaFetch } from "./novaFetch";

/** Body shape required by POST /api/console. */
export interface ConsolePayload {
  level: string;
  message: string;
}

/** Publish a structured log message to the console MQTT topic. */
export function sendConsole(payload: ConsolePayload): Promise<{ published: boolean }> {
  return novaFetch<{ published: boolean }>("/api/console", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
