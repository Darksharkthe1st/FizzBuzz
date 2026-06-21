import { randomUUID } from "node:crypto";
import { parseDataUrl, shortTopic, truncateForDisplay } from "./utils.js";

function createForeheadPrompt(argument) {
  return [
    "Edit the uploaded photo into a funny boss-battle portrait for a roommate argument game.",
    "Keep the same person's identity, expression cues, hair, and recognizable facial features.",
    "Make it look like the picture was taken from a very close camera angle above their face, so their forehead looks comically massive while the rest of the face shrinks below it.",
    "Use a wide-angle selfie lens feel, exaggerated forced perspective, crisp lighting, and a square close-up crop.",
    "Make it silly and theatrical, not mean-spirited, violent, scary, or realistic evidence.",
    `Argument context for comedic mood: ${shortTopic(argument)}.`,
  ].join(" ");
}

export function createAvatarJob(payload = {}) {
  return {
    mode: process.env.USE_PIKA === "true" ? "pika" : "mock",
    jobId: randomUUID(),
    prompt: `0.5 zoom meme yapping roommate, boss battle intro, situation: ${shortTopic(payload.argument)}`,
    status: "queued",
    message: "Pika job hook is ready. Wire this endpoint to the Pika API when credentials are available.",
  };
}

export async function generateForeheadPortrait(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  const image = parseDataUrl(payload.imageDataUrl);
  const prompt = createForeheadPrompt(payload.argument);
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

  console.info(
    `[image] /api/media/forehead requested; USE_GEMINI_IMAGE=${process.env.USE_GEMINI_IMAGE}; keyPresent=${Boolean(apiKey)}; imageValid=${Boolean(image)}; model=${model}`,
  );

  if (!image) {
    console.error("[image] Forehead request did not include a valid data URL image.");
    return {
      status: 400,
      body: {
        error:
          "The forehead endpoint did not receive a valid image. Re-upload the roommate photo, wait for the forehead button to unlock, then try again.",
      },
    };
  }

  if (process.env.USE_GEMINI_IMAGE !== "true" || !apiKey) {
    console.info("[image] Gemini image disabled or missing key; returning mock forehead response.");
    return {
      status: 202,
      body: {
        mode: "mock",
        imageUrl: null,
        prompt,
        message:
          "Forehead mode is ready. Add GEMINI_API_KEY and set USE_GEMINI_IMAGE=true to spend real image-generation credits.",
      },
    };
  }

  let response;
  try {
    console.info(
      `[image] Requesting Gemini image edit; mimeType=${image.mimeType}; base64Chars=${image.data.length}; promptChars=${prompt.length}`,
    );
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: image.mimeType,
                    data: image.data,
                  },
                },
              ],
            },
          ],
        }),
      },
    );
  } catch (error) {
    console.error("[image] Gemini image request failed before receiving a response.", {
      name: error.name,
      message: error.message,
    });
    return {
      status: 502,
      body: {
        error: "Gemini image generation could not be reached.",
        details: error.message,
      },
    };
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[image] Gemini image request rejected.", {
      status: response.status,
      message: result.error?.message || "No Gemini error body.",
      code: result.error?.code,
      statusText: result.error?.status,
    });
    return {
      status: response.status,
      body: {
        error: result.error?.message || "Gemini image generation failed.",
        code: result.error?.code,
        status: result.error?.status,
      },
    };
  }

  const parts = result.candidates?.[0]?.content?.parts || [];
  const generated = parts.find((part) => part.inlineData || part.inline_data);
  const inlineData = generated?.inlineData || generated?.inline_data;

  if (!inlineData?.data) {
    const partSummary = parts.map((part) => ({
      hasText: Boolean(part.text),
      textPreview: part.text ? truncateForDisplay(part.text, 220) : "",
      hasInlineData: Boolean(part.inlineData || part.inline_data),
      inlineMimeType:
        part.inlineData?.mimeType ||
        part.inlineData?.mime_type ||
        part.inline_data?.mimeType ||
        part.inline_data?.mime_type ||
        "",
    }));
    const candidate = result.candidates?.[0] || {};
    console.error("[image] Gemini image response did not include image data.", {
      finishReason: candidate.finishReason,
      finishMessage: candidate.finishMessage,
      partSummary,
      promptFeedback: result.promptFeedback,
      safetyRatings: candidate.safetyRatings,
      usageMetadata: result.usageMetadata,
    });
    return {
      status: 502,
      body: {
        error: "Gemini responded without an image.",
        finishReason: candidate.finishReason,
        finishMessage: candidate.finishMessage,
        partSummary,
        promptFeedback: result.promptFeedback,
      },
    };
  }

  console.info(
    `[image] Gemini forehead image ready; mimeType=${inlineData.mimeType || inlineData.mime_type || "image/png"}; base64Chars=${inlineData.data.length}`,
  );
  return {
    status: 200,
    body: {
      mode: "gemini",
      imageUrl: `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`,
      prompt,
    },
  };
}
