import { randomUUID } from "node:crypto";
import { analyzeTranscript, scoreBoundary } from "./analysis.js";
import { generateGeminiArgumentTurn } from "./geminiText.js";
import { clampNumber, shortTopic, truncateForDisplay } from "./utils.js";

const titleBank = [
  "The Deflection Engine",
  "Lord of the Unwashed Pan",
  "Baron Von Not My Problem",
  "The Carbonation Witness",
  "Duke of Suddenly Busy",
];

const excuseBank = [
  "I was actually about to clean that, but then the vibe in the kitchen changed.",
  "Technically, the mess became communal when everyone noticed it.",
  "I feel like focusing on the Coke can ignores the freezer's role in this.",
  "Can we not weaponize evidence while I am holding cereal?",
  "I did not leave it there. I simply stopped moving it somewhere else.",
  "This sounds like landlord energy, and I need everyone to sit with that.",
];

const counterBank = [
  {
    name: "Receipt Slam",
    line: "I am describing one specific mess, one specific cleanup, and one specific person who fled the scene.",
  },
  {
    name: "Calm Boundary Uppercut",
    line: "I am not asking for a confession monologue. I am asking you to clean your part today.",
  },
  {
    name: "Shared Space Suplex",
    line: "The kitchen is shared, which means the consequences are shared after the responsibility is handled.",
  },
  {
    name: "Lease Clause Elbow Drop",
    line: "We can be chill after the sticky floor stops crunching under my socks.",
  },
];

const defensiveBank = [
  {
    trigger: ["always", "every time", "again"],
    name: "Pattern Denial Parry",
    line:
      "Okay, 'always' is doing a heroic amount of work there. I did it, like, a spiritually different number of times.",
  },
  {
    trigger: ["clean", "washed", "dishes", "trash"],
    name: "Chore Jurisdiction Dodge",
    line:
      "I was literally entering the pre-cleaning mindset, and now this whole courtroom tone has reset my process.",
  },
  {
    trigger: ["freezer", "coke", "cola", "exploded", "sticky"],
    name: "Carbonation Innocence Plea",
    line:
      "The can made choices under pressure. I am not saying I am blameless, I am saying physics has been weirdly protected here.",
  },
  {
    trigger: ["pay", "money", "rent", "bill"],
    name: "Wallet Fog Machine",
    line:
      "I hear you saying money, but I need you to understand my bank app has been giving haunted-house energy.",
  },
  {
    trigger: ["sorry", "apologize", "apology"],
    name: "Apology Side Quest",
    line:
      "I can apologize, obviously. I just need us to define whether this is an apology-apology or a vibe apology.",
  },
  {
    trigger: ["listen", "hearing", "said"],
    name: "Listening Technicality",
    line:
      "I am listening. I am disagreeing while listening, which is actually two tasks, so you're welcome.",
  },
];

function makeAttackName(argument) {
  const topic = shortTopic(argument).toLowerCase();
  if (topic.includes("coke") || topic.includes("cola") || topic.includes("freezer")) {
    return "Carbonation Cross-Examination";
  }
  if (topic.includes("dish") || topic.includes("sink") || topic.includes("pan")) {
    return "Dish Pile Haymaker";
  }
  if (topic.includes("shower") || topic.includes("smell")) {
    return "Fresh Air Finisher";
  }
  if (topic.includes("trash") || topic.includes("garbage")) {
    return "Trash Bag Takedown";
  }
  return "Respectful Boundary Jab";
}

function buildFightCard(session) {
  const turns = session.turnLog;
  const withConfidence = turns.filter((turn) => typeof turn.confidence === "number");
  const avgConfidence = withConfidence.length
    ? withConfidence.reduce((sum, turn) => sum + turn.confidence, 0) / withConfidence.length
    : null;
  const avgBoundary = turns.length
    ? Math.round(turns.reduce((sum, turn) => sum + turn.boundaryScore, 0) / turns.length)
    : 0;
  const best = turns.reduce((best, turn) => (!best || turn.boundaryScore > best.boundaryScore ? turn : best), null);
  const heatedCount = turns.filter((turn) => turn.sentimentLabel === "heated").length;

  let coachingNote = "You stayed steady. A few more specific asks would have ended this even faster.";
  if (avgBoundary >= 10) {
    coachingNote = "Your asks were specific and your boundaries were clear -- that's the actual win condition.";
  } else if (turns.length && heatedCount > turns.length / 2) {
    coachingNote = "You won, but the heat crept in. Lock the ask in before the volume rises next time.";
  }

  return {
    bestLine: best?.heard || "(silence, but a powerful one)",
    turns: turns.length,
    avgConfidence,
    avgBoundary,
    deflectionsResisted: turns.length,
    coachingNote,
  };
}

function chooseDefensiveResponse(session, transcript) {
  const heard = String(transcript || "").trim().replace(/\s+/g, " ");
  const lowerHeard = heard.toLowerCase();
  const matched = defensiveBank.find((entry) =>
    entry.trigger.some((word) => lowerHeard.includes(word)),
  );

  if (matched) {
    return {
      attack: {
        name: matched.name,
        line: heard
          ? `You said: "${truncateForDisplay(heard, 130)}"`
          : "You inhaled like someone with a laminated chore chart.",
      },
      roommateLine: matched.line,
    };
  }

  const counter = counterBank[session.exchange % counterBank.length];
  const excuse = excuseBank[(session.exchange + session.aggro) % excuseBank.length];
  return {
    attack: {
      name: counter.name,
      line: heard
        ? `You said: "${truncateForDisplay(heard, 130)}"`
        : counter.line,
    },
    roommateLine: heard
      ? `I heard "${truncateForDisplay(heard, 80)}," and honestly the accusation-to-context ratio is aggressive.`
      : excuse,
  };
}

export function createGameService() {
  const sessions = new Map();

  function createSession(payload) {
    const argument = String(payload.argument || "").slice(0, 240);
    const evidence = clampNumber(payload.evidence, 1, 5, 4);
    const aggro = clampNumber(payload.aggro, 1, 5, 3);
    const titleIndex = Math.min(titleBank.length - 1, Math.floor((aggro - 1) * 1.1));
    const session = {
      id: randomUUID(),
      argument,
      evidence,
      aggro,
      round: 1,
      player: 100,
      boss: 100,
      exchange: 0,
      bossTitle: titleBank[titleIndex],
      createdAt: new Date().toISOString(),
      turnLog: [],
      analysisCache: new Map(),
    };
    sessions.set(session.id, session);
    return {
      sessionId: session.id,
      round: session.round,
      player: session.player,
      boss: session.boss,
      bossTitle: session.bossTitle,
      topic: shortTopic(argument),
      roundTopic: shortTopic(argument, 42),
      opener: {
        name: makeAttackName(argument),
        line: `A focused opener about "${shortTopic(argument)}" with zero room for interpretive dance.`,
      },
      roommateLine: `What? I was literally about to deal with ${shortTopic(argument)}.`,
    };
  }

  async function scoreArgumentTurn(session, transcript = "", confidence) {
    const boundary = scoreBoundary(transcript, session.argument);
    const analysis = await analyzeTranscript(session, transcript);

    const baseDamage = 10 + session.evidence * 3;
    const damage = Math.max(4, baseDamage + boundary.score);
    const recoil = Math.max(3, session.aggro * 2 - session.evidence + (boundary.escalation ? 5 : 0));

    session.round += 1;
    session.exchange += 1;
    session.boss = Math.max(0, session.boss - damage);
    session.player = Math.max(0, session.player - recoil);

    const heard = truncateForDisplay(transcript, 180);
    session.turnLog.push({
      round: session.round,
      heard,
      confidence: typeof confidence === "number" ? confidence : null,
      boundaryScore: boundary.score,
      sentimentLabel: analysis?.sentimentLabel || null,
    });

    const complete = session.boss === 0;
    const result = {
      sessionId: session.id,
      round: session.round,
      player: session.player,
      boss: session.boss,
      heard,
      complete,
      boundary: { score: boundary.score, labels: boundary.labels },
      analysis: analysis
        ? {
            sentimentLabel: analysis.sentimentLabel,
            topicLabel: analysis.topicLabel,
            intentLabel: analysis.intentLabel,
            source: analysis.source,
          }
        : null,
    };

    if (complete) {
      result.fightCard = buildFightCard(session);
    }

    return result;
  }

  async function advanceArgument(sessionId, transcript = "", confidence) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const defensive =
      (await generateGeminiArgumentTurn(session, transcript)) || chooseDefensiveResponse(session, transcript);
    const result = await scoreArgumentTurn(session, transcript, confidence);
    return {
      ...result,
      attack: defensive.attack,
      roommateLine: result.complete
        ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
        : defensive.roommateLine,
    };
  }

  async function scoreAgentArgument(sessionId, transcript = "", confidence) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const result = await scoreArgumentTurn(session, transcript, confidence);
    const counter = counterBank[(session.exchange - 1) % counterBank.length] || counterBank[0];
    return {
      ...result,
      attack: {
        name: counter.name,
        line: transcript
          ? `You said: "${truncateForDisplay(transcript, 130)}"`
          : counter.line,
      },
      roommateLine: result.complete
        ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
        : "",
    };
  }

  return {
    advanceArgument,
    createSession,
    scoreAgentArgument,
  };
}
