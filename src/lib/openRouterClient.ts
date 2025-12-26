export type ORMessageRole = "system" | "user" | "assistant";

export interface ORMessage {
  role: ORMessageRole;
  content: string;
}

export interface ORChatRequest {
  model: string;
  messages: ORMessage[];
  temperature?: number;
  max_tokens?: number;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function openRouterChat(req: ORChatRequest): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Carousel Generator"
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.max_tokens ?? 256
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter response missing content");
  }
  return content.trim();
}

