import { parseJsonObject, shortTopic, truncateForDisplay } from "./utils.js";

function createRoommatePrompt(session, transcript) {
  return [
    "Return ONLY compact JSON. No markdown. No intro.",
    'Format: {"attackName":"2-4 words","attackLine":"short summary","roommateLine":"one funny defensive comeback"}',
    "Role: evasive, defensive, funny roommate boss. Clearly react to the user's exact complaint. Playful, non-threatening.",
    `Topic: ${shortTopic(session.argument, 100)}`,
    `Aggro:${session.aggro}/5 Evidence:${session.evidence}/5 Round:${session.round}`,
    `User: ${truncateForDisplay(transcript, 260) || "(silence)"}`,
  ].join("\n");
}

export async function generateGeminiArgumentTurn(session, transcript) {
  const apiKey = process.env.GEMINI_API_KEY;
  const enabled =
    process.env.USE_GEMINI_TEXT !== "false" && Boolean(apiKey) && Boolean(String(transcript || "").trim());
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";

  if (!enabled) {
    console.info(
      `[argue] Gemini text disabled; USE_GEMINI_TEXT=${process.env.USE_GEMINI_TEXT}; keyPresent=${Boolean(apiKey)}; transcriptPresent=${Boolean(String(transcript || "").trim())}`,
    );
    return null;
  }

  console.info(`[argue] Requesting Gemini roommate response; model=${model}; chars=${String(transcript).length}`);

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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
              parts: [{ text: createRoommatePrompt(session, transcript) }],
            },
          ],
          generationConfig: {
            temperature: 1.05,
            topP: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      },
    );
  } catch {
    console.error("[argue] Gemini roommate response request failed before receiving a response.");
    return null;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `[argue] Gemini roommate response rejected; status=${response.status}; message=${result.error?.message || "No Gemini error body."}`,
    );
    return null;
  }

  const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJsonObject(generatedText);
  if (!parsed?.roommateLine) {
    console.error("[argue] Gemini roommate response was not usable JSON.", {
      finishReason: result.candidates?.[0]?.finishReason,
      generatedText,
    });
    return null;
  }

  console.info("[argue] Gemini roommate response ready.");
  return {
    attack: {
      name: truncateForDisplay(parsed.attackName || "Deflection Burst", 48),
      line: truncateForDisplay(parsed.attackLine || `You said: "${truncateForDisplay(transcript, 130)}"`, 180),
    },
    roommateLine: truncateForDisplay(parsed.roommateLine, 260),
  };
}
