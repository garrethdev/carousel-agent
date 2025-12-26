/**
 * Gemini API client for Nano banana image generation
 * Docs: https://ai.google.dev/gemini-api/docs/quickstart
 */

import { startTiming } from "../utils/timing";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiImageRequest {
  prompt: string;
}

export async function geminiGenerateImage(
  req: GeminiImageRequest
): Promise<string> {
  const endTiming = startTiming("geminiGenerateImage");
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const model = "gemini-2.5-flash-image";
    const url = `${GEMINI_BASE_URL}/${model}:generateContent`;

    console.log(
      `[gemini:image] model=${model} promptPreview="${req.prompt.slice(0, 80)}${req.prompt.length > 80 ? "..." : ""}"`
    );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: req.prompt
            }
          ]
        }
      ]
    })
  });

  const rawBody = await response.text();
  console.log(
    `[gemini:image] response status=${response.status} bodyPreview="${rawBody.slice(0, 200)}..."`
  );

  if (!response.ok) {
    console.error(
      `[gemini:image] error status=${response.status} body="${rawBody}"`
    );
    throw new Error(`Gemini image error ${response.status}: ${rawBody}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch (parseError) {
    console.error(`[gemini:image] failed to parse JSON. Raw body: ${rawBody}`);
    throw new Error(
      `Gemini returned non-JSON response: ${rawBody.slice(0, 500)}`
    );
  }

  // Nano banana returns image data in the response
  // Gemini returns multiple parts: text description + image data
  // We need to iterate through ALL parts to find the inlineData
  
  const parts = data.candidates?.[0]?.content?.parts || [];
  
  console.log(`[gemini:image] response has ${data.candidates?.length || 0} candidate(s)`);
  console.log(`[gemini:image] first candidate has ${parts.length} part(s)`);
  
  // Iterate through all parts to find the image
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const keys = Object.keys(part);
    console.log(`[gemini:image] part ${i} has keys: ${keys.join(", ")}`);
    
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || "image/png";
      const base64Data = part.inlineData.data;
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      console.log(`[gemini:image] found image in part ${i} (${base64Data.length} chars)`);
      return dataUrl;
    }
    
    if (part.text && part.text.trim().startsWith("http")) {
      console.log(`[gemini:image] found image URL in part ${i}: ${part.text}`);
      return part.text.trim();
    }
  }

    console.error(
      `[gemini:image] ERROR - no image found in ${parts.length} parts`
    );
    throw new Error("Gemini image response missing image data or URL");
  } finally {
    endTiming();
  }
}

