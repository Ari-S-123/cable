/* global AudioWorkletProcessor, registerProcessor, sampleRate */

/*
 * Self-hosted from @elevenlabs/client 1.15.2 so a strict Content Security
 * Policy does not need to allow blob: or data: executable sources.
 * The mu-law decoder originates from wavefile's codec implementation.
 */

const decodeTable = [0, 132, 396, 924, 1980, 4092, 8316, 16764];

/** Decodes one unsigned mu-law byte into a signed PCM sample. */
function decodeSample(inputSample) {
  const muLawSample = ~inputSample;
  const sign = muLawSample & 0x80;
  const exponent = (muLawSample >> 4) & 0x07;
  const mantissa = muLawSample & 0x0f;
  const sample = decodeTable[exponent] + (mantissa << (exponent + 3));
  return sign === 0 ? sample : -sample;
}

/** Concatenates ElevenLabs audio chunks into the browser output stream. */
class AudioConcatProcessor extends AudioWorkletProcessor {
  /** Initializes the queue and message-driven playback controls. */
  constructor() {
    super();
    this.buffers = [];
    this.cursor = 0;
    this.currentBuffer = undefined;
    this.wasInterrupted = false;
    this.finished = false;

    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case "setFormat":
          this.format = data.format;
          if (globalThis.LibSampleRate && sampleRate !== data.sampleRate) {
            globalThis.LibSampleRate.create(
              1,
              data.sampleRate,
              sampleRate,
            ).then((resampler) => {
              this.resampler = resampler;
            });
          }
          break;
        case "buffer":
          this.wasInterrupted = false;
          this.buffers.push(
            this.format === "ulaw"
              ? new Uint8Array(data.buffer)
              : new Int16Array(data.buffer),
          );
          break;
        case "interrupt":
          this.wasInterrupted = true;
          break;
        case "clearInterrupted":
          if (this.wasInterrupted) {
            this.wasInterrupted = false;
            this.buffers = [];
            this.currentBuffer = undefined;
          }
          break;
      }
    };
  }

  /** Fills one Web Audio output quantum from the queued decoded samples. */
  process(_inputs, outputs) {
    let finished = false;
    const output = outputs[0][0];
    for (let index = 0; index < output.length; index += 1) {
      if (!this.currentBuffer) {
        if (this.buffers.length === 0) {
          finished = true;
          break;
        }
        this.currentBuffer = this.buffers.shift();
        if (this.resampler) {
          this.currentBuffer = this.resampler.full(this.currentBuffer);
        }
        this.cursor = 0;
      }

      let value = this.currentBuffer[this.cursor];
      if (this.format === "ulaw") value = decodeSample(value);
      output[index] = value / 32768;
      this.cursor += 1;
      if (this.cursor >= this.currentBuffer.length) {
        this.currentBuffer = undefined;
      }
    }

    if (this.finished !== finished) {
      this.finished = finished;
      this.port.postMessage({ type: "process", finished });
    }
    return true;
  }
}

registerProcessor("audioConcatProcessor", AudioConcatProcessor);
