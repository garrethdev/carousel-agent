const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ORImageRequest {
  model: string;
  prompt: string;
}

export async function openRouterGenerateImage(
  req: ORImageRequest
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  console.log(
    `[openrouter:image] model=${req.model} promptPreview="${req.prompt.slice(
      0,
      80
    )}${req.prompt.length > 80 ? "..." : ""}"`
  );

  // OpenRouter image models use chat completions with specific formatting
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Carousel Generator Image"
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        {
          role: "user",
          content: req.prompt
        }
      ],
      // Image generation parameters
      max_tokens: 1,
      temperature: 1.0
    })
  });

  // Get the raw response text first to see what OpenRouter actually returns
  const rawBody = await response.text();
  console.log(`[openrouter:image] response status=${response.status} bodyPreview="${rawBody.slice(0, 200)}..."`);

  if (!response.ok) {
    console.error(
      `[openrouter:image] error status=${response.status} body="${rawBody}"`
    );
    throw new Error(`OpenRouter image error ${response.status}: ${rawBody}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch (parseError) {
    console.error(`[openrouter:image] failed to parse JSON. Raw body: ${rawBody}`);
    throw new Error(`OpenRouter returned non-JSON response: ${rawBody.slice(0, 500)}`);
  }
  
  // Image models return the URL in the message content
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().startsWith("http")) {
    return content.trim();
  }
  
  console.error(`[openrouter:image] unexpected response format:`, JSON.stringify(data, null, 2));
  throw new Error("OpenRouter image response missing or invalid URL");
}

