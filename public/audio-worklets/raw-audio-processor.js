/* global AudioWorkletProcessor, registerProcessor, sampleRate */

/*
 * Self-hosted from @elevenlabs/client 1.15.2 so a strict Content Security
 * Policy does not need to allow blob: or data: executable sources.
 * The mu-law encoder originates from wavefile's codec implementation.
 */

const BIAS = 0x84;
const CLIP = 32635;
const encodeTable = [
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
];

/** Encodes one signed PCM16 sample as an unsigned mu-law byte. */
function encodeSample(inputSample) {
  let sample = inputSample;
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  sample = Math.min(sample + BIAS, CLIP);
  const exponent = encodeTable[(sample >> 7) & 0xff];
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa);
}

/** Converts microphone frames to the bounded PCM or mu-law chunks ElevenLabs expects. */
class RawAudioProcessor extends AudioWorkletProcessor {
  /** Initializes message-driven format and mute configuration. */
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case "setFormat": {
          this.isMuted = false;
          this.buffer = [];
          const chunkDurationMs = data.chunkDurationMs ?? 25;
          this.bufferSize = Math.max(
            1,
            Math.round((data.sampleRate * chunkDurationMs) / 1000),
          );
          this.format = data.format;
          if (globalThis.LibSampleRate && sampleRate !== data.sampleRate) {
            globalThis.LibSampleRate.create(
              1,
              sampleRate,
              data.sampleRate,
            ).then((resampler) => {
              this.resampler = resampler;
            });
          }
          break;
        }
        case "setMuted":
          this.isMuted = data.isMuted;
          break;
      }
    };
  }

  /** Processes one Web Audio render quantum and emits complete encoded chunks. */
  process(inputs) {
    if (!this.buffer) return true;
    const input = inputs[0];
    if (input.length === 0) return true;
    let channelData = input[0];
    if (this.resampler) channelData = this.resampler.full(channelData);
    this.buffer.push(...channelData);

    let sum = 0;
    for (const value of channelData) sum += value * value;
    const maxVolume = Math.sqrt(sum / channelData.length);
    if (this.buffer.length < this.bufferSize) return true;

    const float32Array = this.isMuted
      ? new Float32Array(this.buffer.length)
      : new Float32Array(this.buffer);
    const encodedArray =
      this.format === "ulaw"
        ? new Uint8Array(float32Array.length)
        : new Int16Array(float32Array.length);
    for (let index = 0; index < float32Array.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, float32Array[index]));
      let value = sample < 0 ? sample * 32768 : sample * 32767;
      if (this.format === "ulaw") value = encodeSample(Math.round(value));
      encodedArray[index] = value;
    }
    this.port.postMessage([encodedArray, maxVolume]);
    this.buffer = [];
    return true;
  }
}

registerProcessor("rawAudioProcessor", RawAudioProcessor);
