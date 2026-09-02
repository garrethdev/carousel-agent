import {
  VirloAgent,
  VirloAgentRun,
  VirloBalance,
  VirloCreateAgentInput,
  VirloSlideshow,
  VirloSlideshowQuery,
  VirloSlideshowsPage,
  VirloSuggestKeywordsResult
} from "../types/virlo";

/**
 * Thin client for the Virlo Public API.
 *
 * Auth: `Authorization: Bearer virlo_tkn_...` (VIRLO_API_KEY env var).
 * Base: https://api.virlo.ai, all routes under /v1, snake_case JSON.
 *
 * Billing notes (from the OpenAPI spec, 2026-09-02):
 * - Creating an agent is free; each run bills $0.50 (50 credits) base.
 * - `data_intelligence_enabled` adds $1.00/run — not needed, slideshow
 *   intelligence is populated regardless.
 * - Reading agents / runs / slideshows / balance / suggest-keywords is free.
 *   Credit usage, when any, is echoed in the X-Credits-Used / X-Cost headers.
 */

const VIRLO_BASE_URL = process.env.VIRLO_BASE_URL || "https://api.virlo.ai";

export interface VirloRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  retries?: number;
}

export class VirloApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, path: string, body: string) {
    super(`Virlo API ${status} on ${path}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

function getApiKey(): string {
  const key = process.env.VIRLO_API_KEY;
  if (!key) {
    throw new Error(
      "VIRLO_API_KEY is not set (expected in .env.local, format virlo_tkn_...)"
    );
  }
  return key;
}

function buildUrl(path: string, query?: VirloRequestOptions["query"]): string {
  const url = new URL(path, VIRLO_BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        v.forEach((item) => url.searchParams.append(k, String(item)));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Perform one Virlo request with bounded retries on 429 / 5xx / network errors.
 * Returns the parsed JSON body (Virlo wraps payloads in `{ data: ... }`; callers
 * unwrap `.data` themselves so message fields stay reachable).
 */
export async function virloRequest<T = any>(
  path: string,
  opts: VirloRequestOptions = {}
): Promise<T> {
  const apiKey = getApiKey();
  const retries = opts.retries ?? 3;
  const url = buildUrl(path, opts.query);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(2000 * 2 ** (attempt - 1), 15000));
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      });

      const creditsUsed = res.headers.get("x-credits-used");
      if (creditsUsed && creditsUsed !== "0") {
        console.log(`[virlo] ${opts.method ?? "GET"} ${path} credits used: ${creditsUsed}`);
      }

      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        lastErr = new VirloApiError(res.status, path, text);
        if (retryable && attempt < retries) continue;
        throw lastErr;
      }
      return (text ? JSON.parse(text) : {}) as T;
    } catch (err) {
      if (err instanceof VirloApiError) throw err;
      lastErr = err;
      if (attempt >= retries) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function getBalance(): Promise<VirloBalance> {
  const res = await virloRequest<{ data: VirloBalance }>("/v1/account/balance");
  return res.data;
}

// ---------------------------------------------------------------------------
// Agents (recurring agents were formerly "comets"; one-shot were "orbits")
// ---------------------------------------------------------------------------

export async function listAgents(limit = 100): Promise<VirloAgent[]> {
  const res = await virloRequest<{ data: { agents: VirloAgent[] } }>(
    "/v1/agents",
    { query: { limit } }
  );
  return res.data?.agents ?? [];
}

export async function getAgent(id: string): Promise<VirloAgent> {
  const res = await virloRequest<{ data: VirloAgent }>(`/v1/agents/${id}`);
  return res.data;
}

export async function createAgent(
  input: VirloCreateAgentInput
): Promise<VirloAgent> {
  const res = await virloRequest<{ data: VirloAgent; message?: string }>(
    "/v1/agents",
    { method: "POST", body: input, retries: 0 }
  );
  return res.data;
}

export async function listAgentRuns(
  id: string,
  limit = 5,
  page = 1
): Promise<VirloAgentRun[]> {
  const res = await virloRequest<{ data: { runs: VirloAgentRun[] } }>(
    `/v1/agents/${id}/runs`,
    { query: { limit, page } }
  );
  return res.data?.runs ?? [];
}

export async function suggestKeywords(
  intent: string,
  opts: { topic_hint?: string; platforms?: string[]; desired_count?: number } = {}
): Promise<VirloSuggestKeywordsResult> {
  const res = await virloRequest<{ data: VirloSuggestKeywordsResult }>(
    "/v1/agents/suggest-keywords",
    { method: "POST", body: { intent, ...opts } }
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Slideshows
// ---------------------------------------------------------------------------

export async function getAgentSlideshowsPage(
  agentId: string,
  query: VirloSlideshowQuery = {}
): Promise<VirloSlideshowsPage> {
  const res = await virloRequest<{ data: VirloSlideshowsPage }>(
    `/v1/agents/${agentId}/slideshows`,
    { query: { limit: 100, page: 1, ...query } }
  );
  return res.data;
}

/** Slideshow ids are the trailing URL segment (matches the n8n receiver). */
export function slideshowExternalId(s: Pick<VirloSlideshow, "url" | "id">): string {
  const trimmed = (s.url || "").replace(/\/+$/, "");
  const last = trimmed.split("/").pop() || "";
  return (last || s.id || "").slice(0, 100);
}

/**
 * Pull every slideshow page for an agent (max 100 per page, up to `maxPages`),
 * dedupe by external id, and apply a read-time view floor. Mirrors the
 * "Get Niche Slideshows" node in the n8n "Virlo — Webhook Receiver" workflow.
 */
export async function getAllAgentSlideshows(
  agentId: string,
  opts: { minViews?: number; maxPages?: number; query?: VirloSlideshowQuery } = {}
): Promise<{ items: VirloSlideshow[]; rawCount: number; total: number; pages: number }> {
  const maxPages = opts.maxPages ?? 20;
  const minViews = opts.minViews ?? 0;
  const all: VirloSlideshow[] = [];
  let total = 0;
  let page = 1;

  for (; page <= maxPages; page++) {
    const data = await getAgentSlideshowsPage(agentId, {
      order_by: "views",
      sort: "desc",
      ...opts.query,
      limit: 100,
      page
    });
    const batch = data.slideshows ?? [];
    total = data.total ?? total;
    if (batch.length === 0) break;
    all.push(...batch);
    if (all.length >= total) break;
  }

  const seen = new Set<string>();
  const items = all.filter((s) => {
    const id = slideshowExternalId(s);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return (s.views || 0) >= minViews;
  });

  return { items, rawCount: all.length, total, pages: Math.min(page, maxPages) };
}

// ---------------------------------------------------------------------------
// Hook corpus (corpus-wide, not tied to an agent). $0.25 per call.
// ---------------------------------------------------------------------------

import { VirloHookItem, VirloHookSearchQuery, VirloHookTrendingQuery } from "../types/virlo";

/**
 * Free-text / attribute search over Virlo's 950k-hook corpus. With
 * `content_type: "slideshow"` this is the fastest way to get high-performing
 * TikTok slideshows for a topic — no agent run needed. Billed 25 credits.
 */
export async function searchHooks(query: VirloHookSearchQuery): Promise<VirloHookItem[]> {
  const res = await virloRequest<{ data: VirloHookItem[] }>("/v1/hooks/search", {
    query: { limit: 100, page: 1, ...query }
  });
  return Array.isArray(res.data) ? res.data : [];
}

/** Top hooks corpus-wide over a 7/14/30-day window. Billed 25 credits. */
export async function trendingHooks(query: VirloHookTrendingQuery): Promise<VirloHookItem[]> {
  const res = await virloRequest<{ data: VirloHookItem[] }>("/v1/hooks/trending", {
    query: { limit: 100, page: 1, days: 30, ...query }
  });
  return Array.isArray(res.data) ? res.data : [];
}
