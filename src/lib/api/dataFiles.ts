import { novaFetch } from "./novaFetch";

/** List CSV files available in the backend data directory. */
export function getDataFiles(clientId?: string): Promise<string[]> {
  return novaFetch<string[]>("/api/data-files", undefined, clientId);
}

/**
 * Download a CSV file by exact name as a Blob.
 * Uses a direct fetch (not novaFetch) because the response is binary, not JSON.
 */
export async function downloadDataFile(fileName: string): Promise<Blob> {
  const baseUrl = process.env.NEXT_PUBLIC_NOVA_API_BASE_URL ?? "";
  const res = await fetch(
    `${baseUrl}/api/data-files/${encodeURIComponent(fileName)}`,
  );
  if (!res.ok) throw new Error(`NovaOps API error ${res.status}`);
  return res.blob();
}

/** Upload a data file into the backend data directory. */
export function uploadDataFile(
  file: File,
): Promise<{ file_name: string; bytes_written: number }> {
  const body = new FormData();
  body.append("file", file);
  return novaFetch<{ file_name: string; bytes_written: number }>(
    "/api/data-files/upload",
    { method: "POST", body },
  );
}
