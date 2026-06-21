export const voiceStyleBank = {
  deadpan: { model: "aura-2-arcas-en", label: "Deadpan" },
  frantic: { model: "aura-2-zeus-en", label: "Frantic" },
  smug: { model: "aura-2-orion-en", label: "Smug" },
  "soft-spoken": { model: "aura-2-luna-en", label: "Soft-spoken" },
  "theater-kid": { model: "aura-2-orpheus-en", label: "Theater kid" },
  "deeply-inconvenienced": { model: "aura-2-thalia-en", label: "Deeply inconvenienced" },
};

const voiceStyleIds = Object.keys(voiceStyleBank);

export function resolveVoiceStyleId(selectedId) {
  if (selectedId === "surprise") {
    return voiceStyleIds[Math.floor(Math.random() * voiceStyleIds.length)];
  }
  return voiceStyleBank[selectedId] ? selectedId : "deeply-inconvenienced";
}

export function getVoiceModel(voiceStyleId) {
  return voiceStyleBank[voiceStyleId]?.model || "aura-2-thalia-en";
}
