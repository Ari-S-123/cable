import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import type { AdapterResult } from "@/lib/contracts";
import type { VoiceAdapter, VoiceSession } from "@/lib/adapters/types";

/** Builds a lazy ElevenLabs adapter for short-lived private browser sessions. */
export function createElevenLabsAdapter(apiKey: string): VoiceAdapter {
  if (apiKey.length < 16)
    throw new Error("A valid ElevenLabs API key is required");
  let client: ElevenLabsClient | undefined;
  return {
    async createSignedSession(input): Promise<AdapterResult<VoiceSession>> {
      if (!/^[a-zA-Z0-9_-]{8,100}$/u.test(input.nonce)) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "The session nonce is malformed.",
            retryable: false,
          },
        };
      }
      client ??= new ElevenLabsClient({ apiKey });
      try {
        const response =
          await client.conversationalAi.conversations.getSignedUrl({
            agentId: input.agentId,
          });
        return {
          ok: true,
          value: {
            signedUrl: response.signedUrl,
            expiresAt: Date.now() + 5 * 60 * 1000,
          },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        return {
          ok: false,
          error: {
            code: /timeout/iu.test(message)
              ? "TIMEOUT_BEFORE_ACCEPTANCE"
              : "TEMPORARILY_UNAVAILABLE",
            message: "A private voice session could not be created.",
            retryable: true,
          },
        };
      }
    },
  };
}
