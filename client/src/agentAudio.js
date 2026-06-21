function floatToLinear16(floatSamples) {
  const output = new Int16Array(floatSamples.length);
  for (let index = 0; index < floatSamples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, floatSamples[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
}

export function resampleToLinear16(input, inputSampleRate, outputSampleRate = 24000) {
  if (inputSampleRate === outputSampleRate) {
    return floatToLinear16(input);
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    output[index] = input[Math.min(input.length - 1, Math.floor(index * ratio))];
  }
  return floatToLinear16(output);
}

export function playAgentPcmChunk(agentState, arrayBuffer, sampleRate = 24000) {
  const context = agentState.audioContext;
  if (!context || !arrayBuffer?.byteLength) return;

  const pcm = new Int16Array(arrayBuffer);
  if (!pcm.length) return;

  const audioBuffer = context.createBuffer(1, pcm.length, sampleRate);
  const channel = audioBuffer.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) {
    channel[index] = pcm[index] / 0x8000;
  }

  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);

  const startAt = Math.max(context.currentTime + 0.02, agentState.outputCursor || 0);
  agentState.outputCursor = startAt + audioBuffer.duration;
  agentState.outputSources.add(source);
  agentState.playing = true;
  source.addEventListener("ended", () => {
    agentState.outputSources.delete(source);
    agentState.playing = agentState.outputSources.size > 0;
  });
  source.start(startAt);
}

export function stopAgentAudio(agentState) {
  for (const source of agentState.outputSources) {
    try {
      source.stop();
    } catch {
      // Source already stopped.
    }
  }
  agentState.outputSources.clear();
  agentState.outputCursor = agentState.audioContext?.currentTime || 0;
  agentState.playing = false;
}
