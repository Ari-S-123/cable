import "server-only";

import type { CableAdapters } from "@/lib/adapters/types";
import { deterministicAdapters } from "@/lib/adapters/deterministic";
import {
  createResendAdapter,
  createTwilioAdapter,
} from "@/lib/adapters/delivery";
import { createElevenLabsAdapter } from "@/lib/adapters/elevenlabs";
import { createFireworksAdapter } from "@/lib/adapters/fireworks";
import { getServerEnvironment } from "@/lib/env/server";

/** Selects deterministic or fully configured live adapters without eager SDK I/O. */
export async function getAdapters(): Promise<CableAdapters> {
  const environment = getServerEnvironment();
  if (environment.INTEGRATION_MODE === "deterministic")
    return deterministicAdapters;

  const { createDaytonaAdapter } = await import("@/lib/adapters/daytona");
  return {
    inference: createFireworksAdapter(
      environment.FIREWORKS_API_KEY,
      environment.FIREWORKS_MODEL_ID,
    ),
    email: createResendAdapter(environment.RESEND_API_KEY),
    sms: createTwilioAdapter(
      environment.TWILIO_ACCOUNT_SID,
      environment.TWILIO_AUTH_TOKEN,
    ),
    voice: createElevenLabsAdapter(environment.ELEVENLABS_API_KEY),
    policy: createDaytonaAdapter({
      apiKey: environment.DAYTONA_API_KEY,
      ...(environment.DAYTONA_API_URL === undefined
        ? {}
        : { apiUrl: environment.DAYTONA_API_URL }),
    }),
  };
}
