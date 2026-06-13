import { novaFetch } from "./novaFetch";

/** Check whether the API process is alive. */
export function getHealth(): Promise<{ status: string }> {
  return novaFetch<{ status: string }>("/health");
}
