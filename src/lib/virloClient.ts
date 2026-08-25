/**
 * Minimal REST client for the Virlo Trends & Virality API (https://api.virlo.ai).
 *
 * Auth is a Bearer token (key format: `virlo_tkn_...`) read from VIRLO_API_KEY.
 * All endpoints live under the `/v1` prefix and use snake_case.
 */

const VIRLO_BASE_URL = "https://api.virlo.ai/v1";

export type VirloQuery = Record<
  string,
  string | number | boolean | undefined | null
>;

function buildUrl(path: string, query?: VirloQuery): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${VIRLO_BASE_URL}/${clean}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Perform an authenticated GET against the Virlo API and return the parsed
 * JSON body. Throws on non-2xx with the response text for easier debugging.
 */
export async function virloGet<T = any>(
  path: string,
  query?: VirloQuery
): Promise<T> {
  const apiKey = process.env.VIRLO_API_KEY;
  if (!apiKey) throw new Error("VIRLO_API_KEY is not set");

  const response = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Virlo error ${response.status} on ${path}: ${text}`);
  }

  return (await response.json()) as T;
}
