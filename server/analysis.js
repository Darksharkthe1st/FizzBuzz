import { clampNumber } from "./utils.js";

const ESCALATION_WORDS = [
  "shut up", "idiot", "stupid", "hate you", "or else", "i swear", "moron", "pathetic",
];
const CLEAR_ASK_PATTERN = /\b(please|i need you to|i need to|can you|could you|i'd like you to|i want you to)\b/i;
const BOUNDARY_PATTERN = /\b(i won't|i will not|not okay|not ok|needs to stop|this stops|going forward|next time|i'm done|i am done)\b/i;

export function scoreBoundary(transcript, argument) {
  const heard = String(transcript || "").trim();
  const lowerHeard = heard.toLowerCase();
  const wordCount = heard.split(/\s+/).filter(Boolean).length;
  const labels = [];
  let score = 0;
  let escalation = false;

  const argumentWords = new Set(
    String(argument || "")
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3),
  );
  const overlap = lowerHeard.split(/\W+/).filter((word) => argumentWords.has(word)).length;
  if (overlap >= 2) {
    score += 10;
    labels.push({ text: "Specific ask bonus", penalty: false });
  } else if (overlap === 1) {
    score += 5;
    labels.push({ text: "Boundary clarity +5", penalty: false });
  }

  if (CLEAR_ASK_PATTERN.test(heard)) {
    score += 8;
    labels.push({ text: "Clear ask bonus", penalty: false });
  }

  if (BOUNDARY_PATTERN.test(heard)) {
    score += 8;
    labels.push({ text: "Boundary stated", penalty: false });
  }

  if (heard && wordCount < 3) {
    score -= 6;
    labels.push({ text: "Mumbled evidence penalty", penalty: true });
  }

  if (ESCALATION_WORDS.some((word) => lowerHeard.includes(word))) {
    score -= 10;
    escalation = true;
    labels.push({ text: "Escalation warning", penalty: true });
  }

  return { score: clampNumber(score, -15, 30, 0), labels, escalation };
}

function localAnalysisFallback(text) {
  const lower = text.toLowerCase();
  let sentimentLabel = "calm";
  if (/!{2,}|shut up|idiot|stupid|hate/.test(lower)) sentimentLabel = "heated";
  else if (/sorry|whatever|fine\.?$/.test(lower)) sentimentLabel = "petty but valid";

  let topicLabel = "general grievance";
  if (/rent|money|bill|pay|owe/.test(lower)) topicLabel = "money";
  else if (/loud|noise|music|party/.test(lower)) topicLabel = "noise";
  else if (/dish|trash|clean|chore|sink|laundry/.test(lower)) topicLabel = "chores";
  else if (/coke|soda|fridge|freezer|snack|food/.test(lower)) topicLabel = "food crime";

  let intentLabel = "setting_boundary";
  if (/sorry|apolog/.test(lower)) intentLabel = "seeking_apology";
  else if (/clean|fix|pay|stop|replace/.test(lower)) intentLabel = "requesting_cleanup";

  return { sentimentLabel, topicLabel, intentLabel, summary: text, source: "local" };
}

function mapDeepgramAnalysis(body, text) {
  const lower = text.toLowerCase();
  const average = body.results?.sentiments?.average;
  const sentimentScore = typeof average?.sentiment_score === "number" ? average.sentiment_score : 0;
  const sentimentRaw = average?.sentiment || "neutral";

  let sentimentLabel = "calm";
  if (sentimentRaw === "negative") {
    sentimentLabel = sentimentScore <= -0.6 ? "heated" : "petty but valid";
  } else if (sentimentRaw === "positive") {
    sentimentLabel = "calm";
  }

  const dgTopics = (body.results?.topics?.segments || []).flatMap((segment) =>
    (segment.topics || []).map((topic) => topic.topic),
  );
  let topicLabel = "general grievance";
  if (/rent|money|bill|pay|owe/.test(lower)) topicLabel = "money";
  else if (/loud|noise|music|party/.test(lower)) topicLabel = "noise";
  else if (/dish|trash|clean|chore|sink|laundry/.test(lower)) topicLabel = "chores";
  else if (/coke|soda|fridge|freezer|snack|food/.test(lower)) topicLabel = "food crime";
  else if (dgTopics[0]) topicLabel = dgTopics[0].toLowerCase();

  let intentLabel = "setting_boundary";
  if (/sorry|apolog/.test(lower)) intentLabel = "seeking_apology";
  else if (/clean|fix|pay|stop|replace/.test(lower)) intentLabel = "requesting_cleanup";

  return {
    sentimentLabel,
    topicLabel,
    intentLabel,
    summary: body.results?.summary?.text || text,
    source: "deepgram",
  };
}

export async function analyzeTranscript(session, transcript) {
  const text = String(transcript || "").trim();
  if (!text) return null;
  if (session.analysisCache.has(text)) {
    return session.analysisCache.get(text);
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const enabled = process.env.USE_DEEPGRAM === "true" && Boolean(apiKey);
  let result;

  if (!enabled) {
    result = localAnalysisFallback(text);
  } else {
    try {
      const response = await fetch(
        "https://api.deepgram.com/v1/read?language=en&sentiment=true&intents=true&topics=true&summarize=true",
        {
          method: "POST",
          headers: {
            authorization: `Token ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ text }),
        },
      );
      const body = await response.json().catch(() => ({}));
      result = response.ok ? mapDeepgramAnalysis(body, text) : localAnalysisFallback(text);
      if (!response.ok) {
        console.error(`[analyze] Deepgram Read rejected; status=${response.status}; falling back to local heuristic.`);
      }
    } catch (error) {
      console.error("[analyze] Deepgram Read request failed before receiving a response.", error.message);
      result = localAnalysisFallback(text);
    }
  }

  session.analysisCache.set(text, result);
  return result;
}
