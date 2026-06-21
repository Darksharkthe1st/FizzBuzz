const prepScreen = document.querySelector("#prepScreen");
const battleScreen = document.querySelector("#battleScreen");
const prepForm = document.querySelector("#prepForm");
const argumentInput = document.querySelector("#argumentInput");
const evidenceInput = document.querySelector("#evidenceInput");
const aggroInput = document.querySelector("#aggroInput");
const roommatePhoto = document.querySelector("#roommatePhoto");
const photoPreview = document.querySelector("#photoPreview");
const photoEvidence = document.querySelector(".photo-evidence");
const bossPhoto = document.querySelector("#bossPhoto");
const bossPhotoWrap = document.querySelector(".roommate-avatar-wrap");
const hallwaySet = document.querySelector("#hallwaySet");
const doorButton = document.querySelector("#doorButton");
const knockText = document.querySelector("#knockText");
const speakButton = document.querySelector("#speakButton");
const resetButton = document.querySelector("#resetButton");
const subtitleLine = document.querySelector("#subtitleLine");
const attackName = document.querySelector("#attackName");
const attackCaption = document.querySelector("#attackCaption");
const roundBadge = document.querySelector("#roundBadge");
const bossTitle = document.querySelector("#bossTitle");
const floorNote = document.querySelector("#floorNote");
const playerHealth = document.querySelector("#playerHealth");
const bossHealth = document.querySelector("#bossHealth");

const state = {
  argument: "",
  sessionId: "",
  roommateLine: "",
  photoUrl: "",
  round: 1,
  player: 100,
  boss: 100,
  knocked: false,
  exchange: 0,
  evidence: 4,
  aggro: 3,
};

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

const roommateTitles = [
  "The Deflection Engine",
  "Lord of the Unwashed Pan",
  "Baron Von Not My Problem",
  "The Carbonation Witness",
  "Duke of Suddenly Busy",
];

const excuses = [
  "I was actually about to clean that, but then the vibe in the kitchen changed.",
  "Technically, the mess became communal when everyone noticed it.",
  "I feel like focusing on the Coke can ignores the freezer's role in this.",
  "Can we not weaponize evidence while I am holding cereal?",
  "I did not leave it there. I simply stopped moving it somewhere else.",
  "This sounds like landlord energy, and I need everyone to sit with that.",
];

const counters = [
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

function shortTopic(text, limit = 70) {
  const fallback = "the exploded Coke incident";
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 3))}...` : cleaned;
}

function makeAttackName(text) {
  const topic = shortTopic(text).toLowerCase();
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

function setHealth() {
  playerHealth.style.width = `${Math.max(0, state.player)}%`;
  bossHealth.style.width = `${Math.max(0, state.boss)}%`;
}

function updateBattleCopy() {
  const topic = shortTopic(state.argument);
  const roundTopic = shortTopic(state.argument, 42);
  const titleIndex = Math.min(roommateTitles.length - 1, Math.floor((state.aggro - 1) * 1.1));
  roundBadge.textContent = `Round ${state.round}: ${roundTopic}`;
  bossTitle.textContent = roommateTitles[titleIndex];
  floorNote.textContent = `Evidence bag: ${topic}`;
  attackName.textContent = makeAttackName(state.argument);
  attackCaption.textContent = `A focused opener about "${topic}" with zero room for interpretive dance.`;
}

function applySession(session) {
  state.sessionId = session.sessionId || "";
  state.round = session.round ?? state.round;
  state.player = session.player ?? state.player;
  state.boss = session.boss ?? state.boss;
  state.roommateLine = session.roommateLine || "";
  roundBadge.textContent = `Round ${state.round}: ${session.roundTopic || shortTopic(state.argument, 42)}`;
  bossTitle.textContent = session.bossTitle || bossTitle.textContent;
  floorNote.textContent = `Evidence bag: ${session.topic || shortTopic(state.argument)}`;
  attackName.textContent = session.opener?.name || makeAttackName(state.argument);
  attackCaption.textContent =
    session.opener?.line ||
    `A focused opener about "${shortTopic(state.argument)}" with zero room for interpretive dance.`;
  setHealth();
}

function showScreen(screen) {
  prepScreen.classList.toggle("is-active", screen === "prep");
  battleScreen.classList.toggle("is-active", screen === "battle");
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
}

roommatePhoto.addEventListener("change", () => {
  const file = roommatePhoto.files?.[0];
  if (!file) return;
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = URL.createObjectURL(file);
  photoPreview.src = state.photoUrl;
  bossPhoto.src = state.photoUrl;
  photoEvidence.classList.add("has-image");
  bossPhotoWrap.classList.add("has-image");
});

prepForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.argument = argumentInput.value;
  state.evidence = Number(evidenceInput.value);
  state.aggro = Number(aggroInput.value);
  state.sessionId = "";
  state.roommateLine = "";
  state.round = 1;
  state.player = 100;
  state.boss = 100;
  state.exchange = 0;
  state.knocked = false;
  hallwaySet.classList.remove("is-open", "is-knocking");
  doorButton.disabled = false;
  speakButton.disabled = true;
  knockText.textContent = "Knock";
  updateBattleCopy();
  setHealth();
  subtitleLine.textContent = "You approach the door. Somewhere inside, accountability puts on noise-canceling headphones.";
  showScreen("battle");

  try {
    const session = await postJson("/api/session", {
      argument: state.argument,
      evidence: state.evidence,
      aggro: state.aggro,
    });
    applySession(session);
  } catch {
    state.roommateLine = `What? I was literally about to deal with ${shortTopic(state.argument)}.`;
  }
});

doorButton.addEventListener("click", () => {
  if (state.knocked) return;
  state.knocked = true;
  doorButton.disabled = true;
  hallwaySet.classList.add("is-knocking");
  knockText.textContent = "KNOCK KNOCK";
  subtitleLine.textContent = "The door absorbs the knock, considers deflecting, then panics.";

  window.setTimeout(() => {
    hallwaySet.classList.remove("is-knocking");
    hallwaySet.classList.add("is-open");
    knockText.textContent = "Opened";
    subtitleLine.textContent = `"${state.roommateLine || `What? I was literally about to deal with ${shortTopic(state.argument)}.`}"`;
    speakButton.disabled = false;
  }, 900);
});

speakButton.addEventListener("click", async () => {
  if (state.sessionId) {
    try {
      speakButton.disabled = true;
      const next = await postJson("/api/argue", { sessionId: state.sessionId });
      state.round = next.round;
      state.player = next.player;
      state.boss = next.boss;
      attackName.textContent = next.attack.name;
      attackCaption.textContent = next.attack.line;
      roundBadge.textContent = next.complete ? "Victory: Accountability Located" : `Round ${state.round}`;
      subtitleLine.textContent = next.complete
        ? next.roommateLine
        : `Roommate: "${next.roommateLine}"`;
      setHealth();
      bossHealth.parentElement.classList.add("damage-pop");
      window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);
      speakButton.disabled = next.complete;
      if (next.complete) {
        speakButton.textContent = "Grievance filed";
      }
      return;
    } catch {
      speakButton.disabled = false;
      state.sessionId = "";
    }
  }

  const counter = counters[state.exchange % counters.length];
  const excuse = excuses[(state.exchange + state.aggro) % excuses.length];
  const damage = 10 + state.evidence * 3;
  const recoil = Math.max(3, state.aggro * 2 - state.evidence);
  state.round += 1;
  state.exchange += 1;
  state.boss = Math.max(0, state.boss - damage);
  state.player = Math.max(0, state.player - recoil);
  attackName.textContent = counter.name;
  attackCaption.textContent = counter.line;
  roundBadge.textContent = state.boss === 0 ? "Victory: Accountability Located" : `Round ${state.round}`;
  subtitleLine.textContent =
    state.boss === 0
      ? "Roommate has been stunned by a complete sentence. They agree to clean it today, allegedly."
      : `Roommate: "${excuse}"`;
  setHealth();
  bossHealth.parentElement.classList.add("damage-pop");
  window.setTimeout(() => bossHealth.parentElement.classList.remove("damage-pop"), 450);
  if (state.boss === 0) {
    speakButton.disabled = true;
    speakButton.textContent = "Grievance filed";
  }
});

resetButton.addEventListener("click", () => {
  speakButton.textContent = "Escalate politely";
  state.sessionId = "";
  state.roommateLine = "";
  showScreen("prep");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

setHealth();
